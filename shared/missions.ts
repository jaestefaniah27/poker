// ============================================================
// missions.ts — Sistema de Misiones (Fase 1)
// ------------------------------------------------------------
// Contiene TODO el catálogo de datos (plantillas diarias, logros,
// curvas del track de Misiones) y la lógica pura de cálculo.
// Sin dependencias de DB — eso vive en server/src/db.ts.
// ============================================================

import { m, type Money, Decimal, mul, toStr } from './money';

// ============================================================
// 1. PLANTILLAS DE MISIONES DIARIAS
// ------------------------------------------------------------
// ~17 plantillas sobre 9 sistemas. Cada una con 3 tiers de dificultad.
// El progreso de una diaria = stat_actual - stat_al_asignarse (snapshot).
// ============================================================

export interface DailyTemplate {
  id: string;
  game: string;       // categoría para garantizar variedad (nunca 2 del mismo juego/día)
  statKey: string;     // stat de user_stats a comparar contra el snapshot
  emoji: string;
  label: string;       // con {n} a sustituir por el requisito del tier
  tiers: number[];     // [bajo, medio, alto] - requisito en cada tier
  rewardChipsMultiplier: number; // multiplica el reward base de diaria por este factor (varía por dificultad relativa de la plantilla)
}

export const DAILY_TEMPLATES: DailyTemplate[] = [
  { id: 'poker_play',    game: 'Poker',     statKey: 'hands_played',   emoji: '♠️', label: 'Juega {n} manos de poker',          tiers: [10, 20, 40],  rewardChipsMultiplier: 1.0 },
  { id: 'poker_win',     game: 'Poker',     statKey: 'hands_won',      emoji: '♠️', label: 'Gana {n} manos de poker',           tiers: [3, 5, 10],    rewardChipsMultiplier: 1.3 },
  { id: 'bj_play',       game: 'Blackjack', statKey: 'bj_hands',       emoji: '🃏', label: 'Juega {n} manos de blackjack',      tiers: [10, 20, 40],  rewardChipsMultiplier: 1.0 },
  { id: 'bj_win',        game: 'Blackjack', statKey: 'bj_wins',        emoji: '🃏', label: 'Gana {n} manos de blackjack',       tiers: [5, 10, 20],   rewardChipsMultiplier: 1.2 },
  { id: 'bj_natural',    game: 'Blackjack', statKey: 'bj_blackjacks',  emoji: '🃏', label: 'Consigue {n} blackjacks naturales', tiers: [1, 2, 3],     rewardChipsMultiplier: 1.6 },
  { id: 'roulette_spin', game: 'Ruleta',    statKey: 'roulette_rounds',emoji: '🎡', label: 'Tira la ruleta {n} veces',          tiers: [5, 10, 20],   rewardChipsMultiplier: 1.0 },
  { id: 'trivia_correct',game: 'Trivia',    statKey: 'trivia_correct', emoji: '🧠', label: 'Acierta {n} preguntas de trivia',   tiers: [5, 10, 20],   rewardChipsMultiplier: 1.0 },
  { id: 'mines_play',    game: 'Mines',     statKey: 'mines_games',    emoji: '💣', label: 'Juega {n} partidas de Mines',       tiers: [3, 5, 10],    rewardChipsMultiplier: 1.0 },
  { id: 'mines_cashout', game: 'Mines',     statKey: 'mines_cashouts', emoji: '💣', label: 'Retírate con premio {n} veces en Mines', tiers: [2, 4, 8], rewardChipsMultiplier: 1.3 },
  { id: 'crash_play',    game: 'Crash',     statKey: 'crash_games',    emoji: '🚀', label: 'Juega {n} rondas de Crash',         tiers: [3, 5, 10],    rewardChipsMultiplier: 1.0 },
  { id: 'crash_cashout', game: 'Crash',     statKey: 'crash_cashouts', emoji: '🚀', label: 'Cobra antes de explotar {n} veces en Crash', tiers: [2, 4, 6], rewardChipsMultiplier: 1.3 },
  { id: 'jackpot_spin',  game: 'Jackpot',   statKey: 'jackpot_spins',  emoji: '🎰', label: 'Tira el Jackpot {n} veces',         tiers: [3, 5, 10],    rewardChipsMultiplier: 1.0 },
  { id: 'wordle_win',    game: 'Wordle',    statKey: 'wordle_wins',    emoji: '📝', label: 'Resuelve el Wordle de hoy',         tiers: [1, 1, 1],     rewardChipsMultiplier: 1.5 },
  { id: 'gift_send',     game: 'Social',    statKey: 'gifts_sent',     emoji: '🎁', label: 'Envía {n} regalos',                 tiers: [1, 3, 5],     rewardChipsMultiplier: 1.2 },
  { id: 'bonus_claim',   game: 'Social',    statKey: 'bonus_claims',   emoji: '💵', label: 'Reclama tu paguita y tu dieta',     tiers: [2, 2, 2],     rewardChipsMultiplier: 1.0 },
  { id: 'play_time',     game: 'Social',    statKey: 'time_played_ms',emoji: '⏱️', label: 'Juega durante {n} minutos',         tiers: [15, 30, 60],  rewardChipsMultiplier: 1.0 },
];

// Categorías (game) disponibles para garantizar selección equilibrada.
export const DAILY_GAME_CATEGORIES = Array.from(new Set(DAILY_TEMPLATES.map(t => t.game)));

// ============================================================
// 2. SEED DETERMINISTA POR FECHA — set diario común a todos
// ------------------------------------------------------------
// missionDateFor() ancla el "día de misión" a las 6AM hora de España.
// dailySeed() + un PRNG simple (mulberry32) generan el mismo set para
// todo el mundo en la misma fecha, sin depender de orden de inserción.
// ============================================================

// Hash simple de string -> entero 32 bits (determinista, sin dependencias).
const hashStr = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
};

// PRNG determinista (mulberry32) — mismo seed = misma secuencia siempre.
const mulberry32 = (seed: number) => {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export interface DailyMissionSlot {
  slot: number;          // 0-4
  templateId: string;
  tierIndex: number;     // 0=bajo, 1=medio, 2=alto
  requirement: number;
}

// Genera el set de 5 diarias del día (mismo resultado para la misma fecha siempre).
// Selección equilibrada: nunca 2 plantillas del mismo `game` en el mismo día.
export const generateDailySet = (missionDate: string): DailyMissionSlot[] => {
  const rng = mulberry32(hashStr(missionDate));
  const usedGames = new Set<string>();
  const usedTemplates = new Set<string>();
  const slots: DailyMissionSlot[] = [];

  // Barajamos las plantillas de forma determinista (Fisher-Yates con rng fijo).
  const shuffled = [...DAILY_TEMPLATES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  for (const tpl of shuffled) {
    if (slots.length >= 5) break;
    if (usedGames.has(tpl.game) || usedTemplates.has(tpl.id)) continue;
    const tierIndex = Math.floor(rng() * tpl.tiers.length);
    slots.push({
      slot: slots.length,
      templateId: tpl.id,
      tierIndex,
      requirement: tpl.tiers[tierIndex],
    });
    usedGames.add(tpl.game);
    usedTemplates.add(tpl.id);
  }

  // Fallback (no debería ocurrir con 9 categorías y 5 slots, pero por seguridad):
  // si no se llenaron 5 slots por falta de categorías distintas, repescamos sin la
  // restricción de "game" para completar.
  if (slots.length < 5) {
    for (const tpl of shuffled) {
      if (slots.length >= 5) break;
      if (usedTemplates.has(tpl.id)) continue;
      const tierIndex = Math.floor(rng() * tpl.tiers.length);
      slots.push({ slot: slots.length, templateId: tpl.id, tierIndex, requirement: tpl.tiers[tierIndex] });
      usedTemplates.add(tpl.id);
    }
  }

  return slots;
};

// ============================================================
// 3. RESET A LAS 6:00 AM HORA DE ESPAÑA (Europe/Madrid, con DST)
// ------------------------------------------------------------
// Usamos Intl.DateTimeFormat (sin dependencias nuevas) para obtener la
// hora civil de Madrid de forma robusta frente a cambios de horario.
// ============================================================

const MADRID_TZ = 'Europe/Madrid';

// Devuelve la hora civil de Madrid (year, month, day, hour) para un instante dado.
const madridParts = (date: Date): { year: number; month: number; day: number; hour: number; minute: number } => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: MADRID_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
};

// "Día de misión" actual: si son las 05:59 en Madrid, sigue siendo el día anterior.
// Devuelve 'YYYY-MM-DD' (fecha civil de Madrid, ya retrocedida si hour < 6).
export const missionDateFor = (date: Date = new Date()): string => {
  const p = madridParts(date);
  let { year, month, day } = p;
  if (p.hour < 6) {
    // Retroceder un día civil (usamos UTC arithmetic sobre la fecha civil obtenida,
    // que es segura porque ya no depende de offset/DST: solo restamos un día calendario).
    const asUTC = new Date(Date.UTC(year, month - 1, day));
    asUTC.setUTCDate(asUTC.getUTCDate() - 1);
    year = asUTC.getUTCFullYear();
    month = asUTC.getUTCMonth() + 1;
    day = asUTC.getUTCDate();
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// Próximo reset (siguiente 6AM Madrid) en epoch ms — para mostrar countdown en UI.
export const nextMissionResetAt = (date: Date = new Date()): number => {
  const p = madridParts(date);
  // Construimos "hoy 6:00 Madrid" y si ya pasó, sumamos 1 día. Para evitar lidiar con
  // offsets de DST manualmente, usamos un Date en UTC con la fecha civil + 6h, y
  // verificamos con madridParts en un bucle corto de ajuste (máx 2 iteraciones).
  let candidate = new Date(Date.UTC(p.year, p.month - 1, p.day, 4, 0, 0)); // 4 UTC ≈ 6 Madrid en invierno (CET=+1); se ajusta abajo
  // Ajuste fino: comparamos la hora Madrid resultante y corregimos el offset si no es 6:00.
  for (let i = 0; i < 4; i++) {
    const cp = madridParts(candidate);
    const diffMinutes = (6 - cp.hour) * 60 - cp.minute;
    if (Math.abs(diffMinutes) < 1) break;
    candidate = new Date(candidate.getTime() + diffMinutes * 60_000);
  }
  if (candidate.getTime() <= date.getTime()) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
    // Re-ajustar tras saltar un día (por si cruza un cambio de DST)
    for (let i = 0; i < 4; i++) {
      const cp = madridParts(candidate);
      const diffMinutes = (6 - cp.hour) * 60 - cp.minute;
      if (Math.abs(diffMinutes) < 1) break;
      candidate = new Date(candidate.getTime() + diffMinutes * 60_000);
    }
  }
  return candidate.getTime();
};

// ============================================================
// 4. TRACK DE MISIONES — interpolación geométrica por categoría
// ------------------------------------------------------------
// 5 categorías rotan cada nivel: dinero(1,6,11..) / tiradas(2,7,12..) /
// xp(3,8,13..) / valorTirada(4,9,14..) / broches(5,10,15..).
// Cada categoría sube solo en su nivel correspondiente; el valor entre
// breakpoints se interpola geométricamente (Decimal, sin perder precisión).
// Track virtualmente infinito: más allá del último breakpoint se
// extrapola con el ratio del último tramo.
// ============================================================

type Breakpoints = Record<number, string>;

const BP_DINERO: Breakpoints  = { 0: '10000', 10: '1000000000000000', 30: '100000000000000000', 50: '10000000000000000000', 70: '1000000000000000000000', 90: '100000000000000000000000' };
const BP_TIRADAS: Breakpoints = { 0: '1', 10: '50', 30: '100', 50: '200', 70: '350', 90: '500' };
const BP_XP: Breakpoints      = { 0: '100', 10: '500', 30: '1000', 50: '2000', 70: '4000', 90: '8000' };
const BP_VALOR: Breakpoints   = { 0: '100000', 10: '10000000000000', 30: '10000000000000000000', 50: '50000000000000000000', 70: '200000000000000000000', 90: '1000000000000000000000' };
const BP_BRONCE: Breakpoints  = { 0: '50', 10: '500', 30: '1000', 50: '2000', 70: '4000', 90: '8000' };
const BP_PLATA: Breakpoints   = { 0: '1', 10: '50', 30: '100', 50: '200', 70: '350', 90: '500' };
const BP_ORO: Breakpoints     = { 0: '500000', 10: '500000000000000000', 30: '10000000000000000000', 50: '1000000000000000000000', 70: '100000000000000000000000', 90: '10000000000000000000000000' };

// Interpolación geométrica (log-lineal) con Decimal, evaluada en `level`.
// Para level fuera de rango por encima, extrapola con el ratio/nivel del último tramo
// (mantiene el track "virtualmente infinito" sin un tope explícito).
// exp(ln(x)) introduce error de redondeo de punto flotante (p.ej. 5e19 -> 49999...999).
// Para niveles que coinciden EXACTAMENTE con un breakpoint conocido, devolvemos el valor
// literal del breakpoint en vez de recalcularlo via log/exp. Para los demás (interpolados
// o extrapolados), redondeamos al entero más cercano en vez de truncar hacia abajo, ya que
// el truncamiento amplifica el error de log/exp en la dirección equivocada.
const interpGeo = (bp: Breakpoints, level: number): Money => {
  const keys = Object.keys(bp).map(Number).sort((a, b) => a - b);
  const first = keys[0], last = keys[keys.length - 1];
  if (level <= first) return m(bp[first]);
  if (bp[level] !== undefined) return m(bp[level]);

  const logOf = (s: string): Decimal => Decimal.ln(m(s));
  const roundLogResult = (logResult: Decimal): Money => Decimal.exp(logResult).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  if (level >= last) {
    const k0 = keys[keys.length - 2], k1 = last;
    const v0 = logOf(bp[k0]), v1 = logOf(bp[k1]);
    const ratioPerLevel = v1.minus(v0).div(k1 - k0);
    const logResult = v1.plus(ratioPerLevel.times(level - k1));
    return roundLogResult(logResult);
  }

  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i], k1 = keys[i + 1];
    if (level >= k0 && level <= k1) {
      if (level === k0) return m(bp[k0]);
      if (level === k1) return m(bp[k1]);
      const v0 = logOf(bp[k0]), v1 = logOf(bp[k1]);
      const frac = (level - k0) / (k1 - k0);
      const logResult = v0.plus(v1.minus(v0).times(frac));
      return roundLogResult(logResult);
    }
  }
  return m(bp[last]);
};

// Cuántas veces le ha tocado mejorar a una categoría hasta el nivel `trackLevel` (inclusive).
// offset: 1=dinero, 2=tiradas, 3=xp, 4=valorTirada, 5=broches.
const upgradesUpTo = (trackLevel: number, offset: number): number => Math.floor((trackLevel + (5 - offset)) / 5);

// "Nivel equivalente" para interpolar: cada categoría solo tiene un breakpoint real
// cada 5 niveles del track, así que el valor que le corresponde es el de
// (número de mejoras) × 5.
const equivLevel = (trackLevel: number, offset: number): number => upgradesUpTo(trackLevel, offset) * 5;

export interface MisionTrackValues {
  dailyChipsMultiplier: Money;  // multiplicador aplicado a la recompensa base de cada diaria
  brocheSpinsCount: number;     // categoría "tiradas broche" (independiente del broche Plata)
  dailyXpMultiplier: Money;
  spinValue: Money;             // valor por tirada del broche Plata
  bronceXp: Money;
  plataSpins: number;
  oroChips: Money;
}

// Calcula todos los valores efectivos del track de Misiones para un nivel dado.
export const misionTrackValuesFor = (misionLevel: number): MisionTrackValues => {
  const lvl = Math.max(0, misionLevel);
  return {
    dailyChipsMultiplier: interpGeo(BP_DINERO, equivLevel(lvl, 1)),
    brocheSpinsCount: Math.max(1, Math.round(interpGeo(BP_TIRADAS, equivLevel(lvl, 2)).toNumber())),
    dailyXpMultiplier: interpGeo(BP_XP, equivLevel(lvl, 3)),
    spinValue: interpGeo(BP_VALOR, equivLevel(lvl, 4)),
    bronceXp: interpGeo(BP_BRONCE, equivLevel(lvl, 5)),
    plataSpins: Math.max(1, Math.round(interpGeo(BP_PLATA, equivLevel(lvl, 5)).toNumber())),
    oroChips: interpGeo(BP_ORO, equivLevel(lvl, 5)),
  };
};

// Recompensa final de una diaria concreta: dailyChipsMultiplier (categoría dinero,
// en fichas absolutas ya escaladas) × el multiplicador propio de la plantilla
// (algunas plantillas son "más difíciles relativamente" y dan más).
export const dailyMissionReward = (misionLevel: number, template: DailyTemplate): { chips: string; xp: number } => {
  const v = misionTrackValuesFor(misionLevel);
  const chips = toStr(mul(v.dailyChipsMultiplier, Math.round(template.rewardChipsMultiplier * 100)).dividedBy(100).floor());
  const xp = Math.round(v.dailyXpMultiplier.toNumber());
  return { chips, xp };
};

// ============================================================
// 5. BROCHES (Bronce / Plata / Oro)
// ------------------------------------------------------------
// Bronce: iniciar sesión / jugar (no requiere completar diarias) → XP.
// Plata: completar 3 de 5 diarias → tiradas gratis al pool de ruleta.
// Oro: completar 5 de 5 diarias → fichas.
// Las 3 mejoran juntas con la categoría 5 (offset 5) del track.
// ============================================================

export interface BrocheRewards {
  bronceXp: number;
  plataSpinsCount: number;
  plataSpinValue: string; // valor por tirada (Decimal string), va al mismo pool de ruleta
  oroChips: string;
}

export const brocheRewardsFor = (misionLevel: number): BrocheRewards => {
  const v = misionTrackValuesFor(misionLevel);
  return {
    bronceXp: Math.round(v.bronceXp.toNumber()),
    plataSpinsCount: v.plataSpins,
    plataSpinValue: toStr(v.spinValue),
    oroChips: toStr(v.oroChips),
  };
};

// ============================================================
// 6. LÍMITE DE MEJORAS DEL TRACK — 5/día, reset 6AM España
// ------------------------------------------------------------
export const MISION_UPGRADES_PER_DAY = 5;
