import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import {
  FoosballMatchRow, FoosballBetRow,
  createFoosballMatch, updateFoosballMatch, getFoosballMatch,
  getRecentFoosballMatches, getBetsForMatch, settleFoosballBet,
  applyBalanceDelta, getFoosballPlayer, upsertFoosballPlayer, updateFoosballPlayerStats,
} from './db';
import { fetchLiveState, POLL_INTERVAL_MS } from './foosballClient';
import type { FoosballOdds } from '../../shared/types';

// ─── ELO ──────────────────────────────────────────────────────────────────────

const ELO_K = 32;
const HOUSE_EDGE = 0.06;

function eloExpected(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

function updateElo(elo: number, expected: number, won: boolean): number {
  return Math.round(elo + ELO_K * ((won ? 1 : 0) - expected));
}

function toOdds(prob: number): number {
  const p = Math.max(0.02, Math.min(0.98, prob));
  return Math.max(1.05, parseFloat(((1 / p) * (1 - HOUSE_EDGE)).toFixed(2)));
}

// Probabilidades de cada resultado final dado p = prob de que equipo1 marque cada gol.
// Reglas: game ends when a team reaches 4 goals AND opponent has ≥1 goal.
// If team reaches 4 with opponent at 0 → "limpian suelo": game continues until opponent
// scores (ending at 5-1 or 6-1) or 7 goals played (ending at 7-0).
// Valid scores: 4-1, 4-2, 4-3 (and mirrors), 5-1, 6-1, 7-0 (limpian suelo direction).
//   P(4-1) = 5·p⁴·q  (4 normal sequences + 1 limpian suelo sequence)
//   P(4-2) = 10·p⁴·q²
//   P(4-3) = 20·p⁴·q³
//   P(5-1) = p⁵·q  (limpian suelo: A,A,A,A,A,B)
//   P(6-1) = p⁶·q  (limpian suelo: A,A,A,A,A,A,B)
//   P(7-0) = p⁷     (limpian suelo: A,A,A,A,A,A,A)
function getScoreProbs(p: number): Record<string, number> {
  const q = 1 - p;
  const p4 = p**4, p5 = p**5, p6 = p**6, p7 = p**7;
  const q4 = q**4, q5 = q**5, q6 = q**6, q7 = q**7;
  return {
    '4-1': 5*p4*q,   '4-2': 10*p4*q*q,  '4-3': 20*p4*q*q*q,
    '5-1': p5*q,     '6-1': p6*q,        '7-0': p7,
    '1-4': 5*q4*p,   '2-4': 10*q4*p*p,  '3-4': 20*q4*p*p*p,
    '1-5': q5*p,     '1-6': q6*p,        '0-7': q7,
  };
}

export async function calculateOdds(
  team1_p1: string, team1_p2: string,
  team2_p1: string, team2_p2: string,
  team1_elo: number, team2_elo: number
): Promise<FoosballOdds> {
  const prob1 = eloExpected(team1_elo, team2_elo);
  const probs = getScoreProbs(prob1);

  // Ganador
  const probWin1 = probs['4-1'] + probs['4-2'] + probs['4-3'] + probs['5-1'] + probs['6-1'] + probs['7-0'];
  const probWin2 = 1 - probWin1;
  const oddsWin1 = toOdds(probWin1);
  const oddsWin2 = toOdds(probWin2);

  // Exactos: todos los 12 scores posibles
  const exact: Record<string, number> = {};
  for (const [score, prob] of Object.entries(probs)) {
    exact[score] = toOdds(prob);
  }

  // Margen: "igualado" (diff≤2: 4-3, 4-2 y simétricos) vs "dominio" (diff≥3)
  const probIgualado = probs['4-3'] + probs['3-4'] + probs['4-2'] + probs['2-4'];
  const probDominio = 1 - probIgualado;
  const threshold = 2;
  const oddsOver = toOdds(probIgualado);  // "over" = igualado (diff ≤ 2)
  const oddsUnder = toOdds(probDominio);  // "under" = dominio (diff ≥ 3)

  // Hándicap: gana por ≥3 (4-1, 5-1, 6-1, 7-0 y simétricos)
  const gap = 2;
  const probH1 = probs['4-1'] + probs['5-1'] + probs['6-1'] + probs['7-0'];
  const probH2 = probs['1-4'] + probs['1-5'] + probs['1-6'] + probs['0-7'];
  const oddsH1 = toOdds(probH1);
  const oddsH2 = toOdds(probH2);

  return {
    winner: { team1: oddsWin1, team2: oddsWin2 },
    totalGoals: { threshold, over: oddsOver, under: oddsUnder },
    exact,
    handicap: { team1: oddsH1, team2: oddsH2, gap },
  };
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export interface FoosballEngineState {
  match: FoosballMatchRow | null;
  odds: FoosballOdds | null;
  bettingOpen: boolean;
}

export class FoosballEngine {
  private io?: Server;
  private currentMatch: FoosballMatchRow | null = null;
  private currentOdds: FoosballOdds | null = null;
  private pollInterval?: NodeJS.Timeout;
  private simMode = false; // true cuando el panel de simulación está activo

  public init(io: Server) {
    this.io = io;
    this.pollInterval = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    this.poll();
  }

  public getState(): FoosballEngineState {
    const m = this.currentMatch;
    const bettingOpen = !m ? false : m.status === 'active' && (m.score1 + m.score2) < 2;
    return { match: m, odds: this.currentOdds, bettingOpen };
  }

  // ─── API de simulación (llamada desde handlers) ────────────────────────────

  public async simStart(
    team1_p1: string, team1_p2: string,
    team2_p1: string, team2_p2: string
  ): Promise<{ ok: boolean; error?: string }> {
    if (this.currentMatch && this.currentMatch.status !== 'finished') {
      return { ok: false, error: 'Ya hay un partido en curso. Termínalo primero.' };
    }

    // Obtener ELOs de la DB (o default 1200)
    const [p1, p2, p3, p4] = await Promise.all([
      getFoosballPlayer(team1_p1), getFoosballPlayer(team1_p2),
      getFoosballPlayer(team2_p1), getFoosballPlayer(team2_p2),
    ]);
    const elo1_1 = p1?.elo ?? 1200;
    const elo1_2 = p2?.elo ?? 1200;
    const elo2_1 = p3?.elo ?? 1200;
    const elo2_2 = p4?.elo ?? 1200;
    const team1_elo = Math.round((elo1_1 + elo1_2) / 2);
    const team2_elo = Math.round((elo2_1 + elo2_2) / 2);

    // Garantizar que existen en la DB
    await Promise.all([
      upsertFoosballPlayer(team1_p1, elo1_1),
      upsertFoosballPlayer(team1_p2, elo1_2),
      upsertFoosballPlayer(team2_p1, elo2_1),
      upsertFoosballPlayer(team2_p2, elo2_2),
    ]);

    const id = uuidv4();
    const row: FoosballMatchRow = {
      id, team1_p1, team1_p2, team2_p1, team2_p2,
      team1_elo, team2_elo,
      score1: 0, score2: 0,
      status: 'active',
      started_at: Date.now(),
      ended_at: null, winner: null,
    };
    await createFoosballMatch(row);
    this.currentMatch = row;
    this.currentOdds = await calculateOdds(team1_p1, team1_p2, team2_p1, team2_p2, team1_elo, team2_elo);
    this.simMode = true;
    this.broadcast();
    return { ok: true };
  }

  public async simGoal(team: 1 | 2): Promise<{ ok: boolean; error?: string }> {
    if (!this.currentMatch || this.currentMatch.status === 'finished') {
      return { ok: false, error: 'No hay partido activo' };
    }

    const score1 = this.currentMatch.score1 + (team === 1 ? 1 : 0);
    const score2 = this.currentMatch.score2 + (team === 2 ? 1 : 0);
    const total = score1 + score2;
    // El partido NUNCA termina automáticamente; solo cierra apuestas tras el 2º gol
    const status: FoosballMatchRow['status'] = total >= 2 ? 'betting_closed' : 'active';

    this.currentMatch = { ...this.currentMatch, score1, score2, status };
    await updateFoosballMatch(this.currentMatch.id, { score1, score2, status });

    this.broadcast();
    return { ok: true };
  }

  public async simEnd(): Promise<{ ok: boolean; error?: string }> {
    if (!this.currentMatch || this.currentMatch.status === 'finished') {
      return { ok: false, error: 'No hay partido activo' };
    }
    const { score1, score2 } = this.currentMatch;
    const winner: 1 | 2 | null = score1 > score2 ? 1 : score2 > score1 ? 2 : null;
    this.currentMatch = { ...this.currentMatch, status: 'finished', ended_at: Date.now(), winner };
    await updateFoosballMatch(this.currentMatch.id, { status: 'finished', ended_at: this.currentMatch.ended_at, winner });
    await this.settleBets(this.currentMatch.id);
    await this.updateElos(this.currentMatch);
    this.simMode = false;
    this.broadcast();
    return { ok: true };
  }

  public async simUpdateElo(name: string, elo: number): Promise<void> {
    await upsertFoosballPlayer(name, elo);
    // Si hay partido activo con este jugador, recalcular cuotas
    if (this.currentMatch && this.currentMatch.status !== 'finished') {
      const m = this.currentMatch;
      if ([m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2].includes(name)) {
        this.currentOdds = await calculateOdds(
          m.team1_p1, m.team1_p2, m.team2_p1, m.team2_p2,
          m.team1_elo, m.team2_elo
        );
        this.broadcast();
      }
    }
  }

  // ─── Polling (servidor hardware real) ─────────────────────────────────────

  private async poll() {
    if (this.simMode) return; // Sim tiene prioridad
    try {
      const live = await fetchLiveState();
      if (!live || !live.active) {
        if (this.currentMatch && this.currentMatch.status !== 'finished') {
          await this.finishMatchFromHardware();
        }
        return;
      }
      if (!this.currentMatch || this.currentMatch.status === 'finished') {
        await this.startMatchFromHardware(live.team1.p1, live.team1.p2, live.team2.p1, live.team2.p2);
        return;
      }
      const { score1, score2 } = live;
      if (score1 !== this.currentMatch.score1 || score2 !== this.currentMatch.score2) {
        const total = score1 + score2;
        // Hardware: nunca auto-termina por marcador; termina cuando active=false
        const newStatus: FoosballMatchRow['status'] = total >= 2 ? 'betting_closed' : 'active';
        this.currentMatch = { ...this.currentMatch, score1, score2, status: newStatus };
        await updateFoosballMatch(this.currentMatch.id, { score1, score2, status: newStatus });
        this.broadcast();
      }
    } catch (err) {
      console.error('[Foosball] poll error:', err);
    }
  }

  private async startMatchFromHardware(p1: string, p2: string, p3: string, p4: string) {
    await this.simStart(p1, p2, p3, p4);
    this.simMode = false; // Es hardware, no sim
  }

  private async finishMatchFromHardware() {
    await this.simEnd();
    this.simMode = false;
  }

  // ─── Liquidación ──────────────────────────────────────────────────────────

  private async settleBets(matchId: string) {
    const match = await getFoosballMatch(matchId);
    if (!match) return;
    const bets = await getBetsForMatch(matchId);
    for (const bet of bets) {
      if (bet.status !== 'pending') continue;
      const won = this.evaluateBet(bet, match);
      const payout = won ? Math.floor(bet.amount * bet.odds) : 0;
      await settleFoosballBet(bet.id, won ? 'won' : 'lost', payout);
      if (won && payout > 0) await applyBalanceDelta(bet.user_id, payout);
    }
  }

  private evaluateBet(bet: FoosballBetRow, match: FoosballMatchRow): boolean {
    const sel = JSON.parse(bet.selection);
    const { score1, score2, winner } = match;
    const total = score1 + score2;

    switch (bet.bet_type) {
      case 'winner':
        return sel.team === winner;
      case 'exact':
        return sel.score === `${score1}-${score2}`;
      case 'total_goals': {
        const margin = Math.abs(score1 - score2);
        // "over" = igualado (diff ≤ threshold=2 → 4-3, 4-2)
        // "under" = dominio (diff > threshold=2 → 4-1, 5-1, 6-1, 7-0)
        return sel.side === 'over' ? margin <= sel.threshold : margin > sel.threshold;
      }
      case 'handicap': {
        const diff = score1 - score2;
        const g: number = sel.gap ?? 2;
        if (sel.team === 1) return diff > g;  // 4-1, 5-1, 6-1, 7-0 → diff=3,4,5,7 > 2
        if (sel.team === 2) return diff < -g;
        return false;
      }
      default: return false;
    }
  }

  // ─── ELO post-partido ─────────────────────────────────────────────────────

  private async updateElos(match: FoosballMatchRow) {
    const { team1_p1, team1_p2, team2_p1, team2_p2, team1_elo, team2_elo, score1, score2, winner } = match;
    if (winner === null) return;

    const e1 = eloExpected(team1_elo, team2_elo);
    const e2 = 1 - e1;
    const team1Won = winner === 1;

    const [r1_1, r1_2, r2_1, r2_2] = await Promise.all([
      getFoosballPlayer(team1_p1), getFoosballPlayer(team1_p2),
      getFoosballPlayer(team2_p1), getFoosballPlayer(team2_p2),
    ]);

    const newElos = {
      [team1_p1]: updateElo(r1_1?.elo ?? 1200, e1, team1Won),
      [team1_p2]: updateElo(r1_2?.elo ?? 1200, e1, team1Won),
      [team2_p1]: updateElo(r2_1?.elo ?? 1200, e2, !team1Won),
      [team2_p2]: updateElo(r2_2?.elo ?? 1200, e2, !team1Won),
    };

    await Promise.all([
      updateFoosballPlayerStats(team1_p1, team1Won, score1, score2, newElos[team1_p1]),
      updateFoosballPlayerStats(team1_p2, team1Won, score1, score2, newElos[team1_p2]),
      updateFoosballPlayerStats(team2_p1, !team1Won, score2, score1, newElos[team2_p1]),
      updateFoosballPlayerStats(team2_p2, !team1Won, score2, score1, newElos[team2_p2]),
    ]);

    // Emitir ELOs actualizados
    this.io?.emit('foosball_elos_updated', newElos);
  }

  private broadcast() {
    this.io?.emit('foosball_updated', this.getState());
  }
}

export const foosballEngine = new FoosballEngine();
