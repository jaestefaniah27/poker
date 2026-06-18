import { useState, useEffect, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type { FoosballState, FoosballBet } from '../../../shared/types';
import { fmtChips } from '../utils';

interface Props {
  socket: Socket;
  token: string;
  userId: string;
  balance: string;
  onClose: () => void;
  onBalanceChange: (b: string) => void;
}

type BetTab = 'winner' | 'exact' | 'total' | 'handicap';

// Scores posibles: 4-1, 4-2, 4-3 (y simétricos) + limpian suelo (5-1, 6-1, 7-0)
const TEAM1_WINS = ['4-1', '4-2', '4-3', '5-1', '6-1'];
const TEAM2_WINS = ['1-4', '2-4', '3-4', '1-5', '1-6'];

export default function FoosballModal({ socket, token, userId, balance, onClose, onBalanceChange }: Props) {
  const [state, setState] = useState<FoosballState | null>(null);
  const [myBets, setMyBets] = useState<FoosballBet[]>([]);
  const [history, setHistory] = useState<FoosballBet[]>([]);
  const [tab, setTab] = useState<BetTab>('winner');
  const [amount, setAmount] = useState(100);
  const [placing, setPlacing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const flash = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3000); };

  const sync = useCallback(() => {
    socket.emit('foosball_sync', { token }, (res: any) => {
      if (res?.state) setState(res.state);
      if (res?.myBets) setMyBets(res.myBets);
      if (res?.history) setHistory(res.history);
    });
  }, [socket, token]);

  useEffect(() => {
    sync();
    const handler = (s: FoosballState) => {
      setState(s);
      // Refrescar apuestas cuando el partido termina para ver resultado en tiempo real
      if (s.match?.status === 'finished') sync();
    };
    socket.on('foosball_updated', handler);
    return () => { socket.off('foosball_updated', handler); };
  }, [sync, socket]);

  const placeBet = (betType: BetTab, selection: object) => {
    if (placing) return;
    setPlacing(true);
    socket.emit('foosball_place_bet', { token, betType, selection, amount }, (res: any) => {
      setPlacing(false);
      if (res?.error) { flash(res.error, false); return; }
      flash(`Apuesta aceptada a ${res.odds}x`, true);
      sync();
    });
  };

  const cancelBet = (betId: string) => {
    socket.emit('foosball_cancel_bet', { betId }, (res: any) => {
      if (res?.error) { flash(res.error, false); return; }
      flash(`Apuesta cancelada — ${fmtChips(res.refunded)} devueltos`, true);
      sync();
    });
  };

  const m = state?.match;
  const odds = state?.odds;
  const open = state?.bettingOpen ?? false;

  const teamLabel = (p1: string, p2: string) => `${p1} & ${p2}`;
  const eloColor = (elo: number) => elo >= 1400 ? 'text-amber-400' : elo >= 1200 ? 'text-emerald-400' : 'text-gray-400';

  const BetBtn = ({ label, sub, onClick, betOdds }: { label: string; sub?: string; onClick: () => void; betOdds?: number }) => (
    <button
      disabled={!open || placing || !betOdds}
      onClick={onClick}
      className="flex flex-col items-center justify-center bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed border border-white/10 rounded-2xl py-3 px-2 gap-0.5 transition-all active:scale-95"
    >
      <span className="text-xs text-gray-200 font-medium text-center leading-tight">{label}</span>
      {sub && <span className="text-[9px] text-gray-500">{sub}</span>}
      {betOdds && <span className="text-sm font-black text-amber-400 mt-1">{betOdds.toFixed(2)}x</span>}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-end justify-center" style={{ paddingTop: 'env(safe-area-inset-top,0px)', paddingBottom: 'env(safe-area-inset-bottom,0px)' }} onClick={onClose}>
      <div className="bg-[#1A1A1F] w-full max-w-md h-full sm:h-auto sm:max-h-[92vh] rounded-t-3xl sm:rounded-[32px] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5 flex-shrink-0">
          <div className="w-8" />
          <div className="flex items-center gap-2">
            <span className="text-xl">⚽</span>
            <h2 className="text-lg font-bold text-white">Apuestas Futbolín</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-gray-300 text-sm">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ touchAction: 'pan-y' }}>

          {msg && (
            <div className={`mx-4 mt-3 px-4 py-2 rounded-xl text-sm font-medium text-center ${msg.ok ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
              {msg.text}
            </div>
          )}

          {/* ─── Partido terminado ─── */}
          {m && m.status === 'finished' && (
            <div className="p-4 space-y-4">
              <div className="bg-gradient-to-b from-amber-900/20 to-transparent border border-amber-500/20 rounded-3xl p-5 text-center">
                <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-2">Partido terminado</p>
                <div className="flex items-center justify-center gap-4">
                  <div className="flex-1 text-right">
                    <p className="text-xs text-gray-300">{m.team1_p1}</p>
                    <p className="text-xs text-gray-300">{m.team1_p2}</p>
                    <p className="text-3xl font-black text-white mt-1">{m.score1}</p>
                  </div>
                  <span className="text-gray-600 font-bold text-xl">—</span>
                  <div className="flex-1 text-left">
                    <p className="text-xs text-gray-300">{m.team2_p1}</p>
                    <p className="text-xs text-gray-300">{m.team2_p2}</p>
                    <p className="text-3xl font-black text-white mt-1">{m.score2}</p>
                  </div>
                </div>
                {m.winner && (
                  <p className="text-sm font-bold text-emerald-400 mt-3">
                    Ganador: {m.winner === 1 ? `${m.team1_p1} & ${m.team1_p2}` : `${m.team2_p1} & ${m.team2_p2}`}
                  </p>
                )}
              </div>
              {myBets.length > 0 && (
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-2">Mis apuestas</p>
                  <div className="space-y-1.5">
                    {myBets.map(b => {
                      const sel = JSON.parse(b.selection);
                      const label = betLabel(b.bet_type, sel, m);
                      return (
                        <div key={b.id} className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm ${b.status === 'won' ? 'bg-emerald-500/15' : b.status === 'lost' ? 'bg-red-500/10' : 'bg-white/5'}`}>
                          <div>
                            <span className="text-gray-200 font-medium">{label}</span>
                            <span className="text-gray-500 text-[10px] ml-2">a {b.odds.toFixed(2)}x</span>
                          </div>
                          <div className="text-right">
                            <span className="text-gray-400 font-mono text-xs">${fmtChips(b.amount)}</span>
                            {b.status === 'won' && <span className="block text-emerald-400 font-bold text-xs">+${fmtChips(b.payout)}</span>}
                            {b.status === 'lost' && <span className="block text-red-400 text-xs">perdida</span>}
                            {b.status === 'pending' && <span className="block text-amber-400 text-[10px]">pendiente</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── Partido en curso ─── */}
          {m && m.status !== 'finished' ? (
            <div className="p-4 space-y-4">

              {/* Marcador */}
              <div className="bg-gradient-to-b from-emerald-900/20 to-transparent border border-emerald-500/15 rounded-3xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className={`flex items-center gap-1.5 ${open ? 'animate-pulse' : ''}`}>
                    <span className={`w-2 h-2 rounded-full ${open ? 'bg-emerald-400' : 'bg-orange-400'}`} />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                      {open ? 'Apuestas abiertas' : 'Apuestas cerradas'}
                    </span>
                  </div>
                  {open && <span className="text-[10px] text-gray-500">Cierran en el 2º gol</span>}
                </div>
                <div className="flex items-center justify-between">
                  {/* Equipo 1 */}
                  <div className="flex-1 text-center space-y-0.5">
                    <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Equipo 1</p>
                    <p className="text-xs text-gray-300 font-medium">{m.team1_p1}</p>
                    <p className="text-xs text-gray-300 font-medium">{m.team1_p2}</p>
                    <p className={`text-[10px] font-semibold mt-0.5 ${eloColor(m.team1_elo)}`}>ELO {m.team1_elo}</p>
                    <p className="text-5xl font-black text-white mt-2">{m.score1}</p>
                  </div>
                  <div className="text-gray-600 font-bold text-2xl px-2">—</div>
                  {/* Equipo 2 */}
                  <div className="flex-1 text-center space-y-0.5">
                    <p className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Equipo 2</p>
                    <p className="text-xs text-gray-300 font-medium">{m.team2_p1}</p>
                    <p className="text-xs text-gray-300 font-medium">{m.team2_p2}</p>
                    <p className={`text-[10px] font-semibold mt-0.5 ${eloColor(m.team2_elo)}`}>ELO {m.team2_elo}</p>
                    <p className="text-5xl font-black text-white mt-2">{m.score2}</p>
                  </div>
                </div>
                <p className="text-center text-[10px] text-gray-600 mt-2">Gana el primero en marcar 4, excepto si el rival va a 0</p>
              </div>

              {/* Selector importe */}
              <div className="flex items-center gap-2 bg-white/5 rounded-2xl px-3 py-2">
                <span className="text-gray-400 text-xs shrink-0">Apuesta</span>
                <span className="text-white font-bold text-sm mr-auto">${fmtChips(amount)}</span>
                <div className="flex gap-1 flex-wrap justify-end">
                  {[50, 100, 500, 1000, 5000].map(v => (
                    <button key={v} onClick={() => setAmount(v)} className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${amount === v ? 'bg-amber-500 text-black' : 'bg-white/10 text-gray-300'}`}>
                      {fmtChips(v)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-black/30 rounded-2xl p-1">
                {(['winner', 'exact', 'total', 'handicap'] as BetTab[]).map(t => (
                  <button key={t} onClick={() => setTab(t)} className={`flex-1 py-2 rounded-xl text-[11px] font-semibold transition-all ${tab === t ? 'bg-white/15 text-white' : 'text-gray-500'}`}>
                    {{ winner: 'Ganador', exact: 'Exacto', total: 'Goles', handicap: 'Hándicap' }[t]}
                  </button>
                ))}
              </div>

              {/* Tab: Ganador */}
              {tab === 'winner' && odds && m && (
                <div className="grid grid-cols-2 gap-3">
                  <BetBtn label={teamLabel(m.team1_p1, m.team1_p2)} sub="Equipo 1" onClick={() => placeBet('winner', { team: 1 })} betOdds={odds.winner.team1} />
                  <BetBtn label={teamLabel(m.team2_p1, m.team2_p2)} sub="Equipo 2" onClick={() => placeBet('winner', { team: 2 })} betOdds={odds.winner.team2} />
                </div>
              )}

              {/* Tab: Exacto */}
              {tab === 'exact' && odds && m && (
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider mb-2">Gana Equipo 1</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {TEAM1_WINS.map(sc => (
                        <BetBtn key={sc} label={sc} onClick={() => placeBet('exact', { score: sc })} betOdds={odds.exact[sc]} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] text-orange-400 font-semibold uppercase tracking-wider mb-2">Gana Equipo 2</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {TEAM2_WINS.map(sc => (
                        <BetBtn key={sc} label={sc} onClick={() => placeBet('exact', { score: sc })} betOdds={odds.exact[sc]} />
                      ))}
                    </div>
                  </div>
                  {/* Limpian suelo: 7-0 */}
                  <div className="border border-amber-500/30 rounded-2xl p-3 bg-amber-500/5">
                    <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider mb-2">🧹 Limpian suelo (7-0)</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <BetBtn label="7-0" sub={`${m.team1_p1} & ${m.team1_p2}`} onClick={() => placeBet('exact', { score: '7-0' })} betOdds={odds.exact['7-0']} />
                      <BetBtn label="0-7" sub={`${m.team2_p1} & ${m.team2_p2}`} onClick={() => placeBet('exact', { score: '0-7' })} betOdds={odds.exact['0-7']} />
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Goles */}
              {tab === 'total' && odds && (
                <div className="space-y-2">
                  <p className="text-[11px] text-gray-500 text-center">¿Diferencia de ≤2 goles o dominio (≥3)?</p>
                  <div className="grid grid-cols-2 gap-3">
                    <BetBtn label="Igualado" sub="4-3 o 4-2" onClick={() => placeBet('total', { side: 'over', threshold: odds.totalGoals.threshold })} betOdds={odds.totalGoals.over} />
                    <BetBtn label="Dominio" sub="4-1, 5-1, 6-1 o 7-0" onClick={() => placeBet('total', { side: 'under', threshold: odds.totalGoals.threshold })} betOdds={odds.totalGoals.under} />
                  </div>
                </div>
              )}

              {/* Tab: Hándicap */}
              {tab === 'handicap' && odds && m && (
                <div className="space-y-2">
                  <p className="text-[11px] text-gray-500 text-center">Gana por 3+ goles (4-1, 5-1, 6-1 o 7-0)</p>
                  <div className="grid grid-cols-2 gap-3">
                    <BetBtn label="Equipo 1 domina" sub="4-1, 5-1, 6-1 o 7-0" onClick={() => placeBet('handicap', { team: 1, gap: odds.handicap.gap })} betOdds={odds.handicap.team1} />
                    <BetBtn label="Equipo 2 domina" sub="1-4, 1-5, 1-6 o 0-7" onClick={() => placeBet('handicap', { team: 2, gap: odds.handicap.gap })} betOdds={odds.handicap.team2} />
                  </div>
                </div>
              )}

              {/* Mis apuestas en este partido */}
              {myBets.length > 0 && (
                <div>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-2">Mis apuestas</p>
                  <div className="space-y-1.5">
                    {myBets.map(b => {
                      const sel = JSON.parse(b.selection);
                      const label = betLabel(b.bet_type, sel, m);
                      return (
                        <div key={b.id} className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm ${b.status === 'won' ? 'bg-emerald-500/15' : b.status === 'lost' ? 'bg-red-500/10' : 'bg-white/5'}`}>
                          <div className="min-w-0 flex-1">
                            <span className="text-gray-200 font-medium">{label}</span>
                            <span className="text-gray-500 text-[10px] ml-2">a {b.odds.toFixed(2)}x</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <span className="text-gray-400 font-mono text-xs">${fmtChips(b.amount)}</span>
                              {b.status === 'won' && <span className="block text-emerald-400 font-bold text-xs">+${fmtChips(b.payout)}</span>}
                              {b.status === 'pending' && <span className="block text-amber-400 text-[10px]">pendiente</span>}
                            </div>
                            {open && b.status === 'pending' && (
                              <button
                                onClick={() => cancelBet(b.id)}
                                className="text-[10px] text-red-400 border border-red-400/30 rounded-lg px-2 py-1 hover:bg-red-400/10 transition-colors"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

          ) : (
            <div className="flex flex-col items-center justify-center py-14 text-center px-6">
              <span className="text-5xl mb-3">🏆</span>
              <p className="text-white font-semibold text-lg">Sin partido en curso</p>
              <p className="text-gray-500 text-sm mt-1">Las apuestas se abren cuando inicia una partida en el futbolín</p>
            </div>
          )}

          {/* ─── Historial ─── */}
          {history.length > 0 && (
            <div className="px-4 pb-6">
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold mb-3 mt-2">Historial</p>
              <div className="space-y-2">
                {history.map(b => {
                  const sel = JSON.parse(b.selection);
                  const matchDesc = b.team1_p1 ? `${b.team1_p1} & ${b.team1_p2}  ${b.score1 ?? '?'}-${b.score2 ?? '?'}  ${b.team2_p1} & ${b.team2_p2}` : 'Partido';
                  const label = b.team1_p1 ? betLabelFromHistory(b.bet_type, sel) : b.bet_type;
                  const won = b.status === 'won';
                  const lost = b.status === 'lost';
                  const net = won ? b.payout - b.amount : -b.amount;
                  return (
                    <div key={b.id} className="bg-white/4 rounded-2xl px-4 py-3 flex justify-between items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-gray-500 truncate">{matchDesc}</p>
                        <p className="text-sm text-gray-200 font-medium">{label}</p>
                        <p className="text-[10px] text-gray-500">Cuota {b.odds.toFixed(2)}x · ${fmtChips(b.amount)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-sm font-bold font-mono ${won ? 'text-emerald-400' : lost ? 'text-red-400' : 'text-gray-400'}`}>
                          {won ? `+$${fmtChips(net)}` : lost ? `-$${fmtChips(b.amount)}` : '—'}
                        </span>
                        <p className={`text-[10px] mt-0.5 ${won ? 'text-emerald-500' : lost ? 'text-red-500' : 'text-amber-400'}`}>
                          {won ? 'Ganada' : lost ? 'Perdida' : 'Pendiente'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function betLabel(type: string, sel: Record<string, any>, m: { team1_p1: string; team1_p2: string; team2_p1: string; team2_p2: string }): string {
  const t1 = `${m.team1_p1} & ${m.team1_p2}`;
  const t2 = `${m.team2_p1} & ${m.team2_p2}`;
  switch (type) {
    case 'winner': return `Gana ${sel.team === 1 ? t1 : t2}`;
    case 'exact': return `Exacto ${sel.score}`;
    case 'total_goals': return sel.side === 'over' ? `Más de ${sel.threshold} goles` : `Menos de ${sel.threshold} goles`;
    case 'handicap': return `${sel.team === 1 ? 'Equipo 1' : 'Equipo 2'} gana +${sel.gap}`;
    default: return type;
  }
}

function betLabelFromHistory(type: string, sel: Record<string, any>): string {
  switch (type) {
    case 'winner': return `Gana Equipo ${sel.team}`;
    case 'exact': return `Exacto ${sel.score}`;
    case 'total_goals': return sel.side === 'over' ? `Más de ${sel.threshold} goles` : `Menos de ${sel.threshold} goles`;
    case 'handicap': return `Equipo ${sel.team} +${sel.gap} hándicap`;
    default: return type;
  }
}
