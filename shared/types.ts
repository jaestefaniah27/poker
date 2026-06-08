export type Suit = 'h' | 'd' | 'c' | 's'; // hearts, diamonds, clubs, spades
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
}

export interface BjHand {
  cards: Card[];
  bet: number;
  status: 'playing' | 'stand' | 'bust' | 'blackjack' | 'surrender';
  doubled?: boolean;
  result?: 'win' | 'lose' | 'push' | 'blackjack' | 'surrender';
  delta?: number;
}

export interface Player {
  id: string; // Socket ID
  userId: string; // DB ID
  name: string;
  avatar?: string;
  cards: Card[];
  chips: number;
  currentBet: number;
  hasFolded: boolean;
  hasActed: boolean;
  isActive: boolean;
  isSpectating?: boolean;
  balance: number;
  hasCashedOut?: boolean;
  isOnline?: boolean;
  reducedTime?: boolean;
  level?: number; // nivel de cuenta (para mostrar en la mesa)
  handName?: string;
  totalContribution: number;
  bustedSeq?: number; // Orden de eliminación en modo torneo (1 = primer eliminado)
  sessionBuyIn?: number;   // Fichas totales compradas en esta sesión de mesa (incluye recompras)
  sessionMaxChips?: number; // Pico de fichas durante la sesión
  sessionStartedAt?: number; // Timestamp del primer buy-in de la sesión
  offlineSince?: number; // Timestamp en que pasó a offline (para expulsión automática)
  // --- BlackJack ---
  bet?: number; // Apuesta de la mano actual de blackjack (legacy para retrocompatibilidad rápida de monto total apostado/etc)
  bjStatus?: 'idle' | 'betting' | 'playing' | 'stand' | 'bust' | 'blackjack' | 'surrender'; // legacy
  bjDoubled?: boolean; // legacy
  bjResult?: 'win' | 'lose' | 'push' | 'blackjack' | 'surrender'; // legacy
  bjDelta?: number; // legacy
  lastBuyIn?: number;
  bjHasContinued?: boolean;
  bjHands?: BjHand[]; // <-- NUEVO: array de manos para soportar split
  bjActiveHandIndex?: number; // <-- NUEVO: índice de la mano activa
}

export type GameType = 'poker' | 'blackjack';
export type GamePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type BlackjackPhase = 'waiting' | 'betting' | 'dealing' | 'playerAction' | 'dealerAction' | 'resolve';

export interface Room {
  id: string;
  name: string;
  players: Player[];
  communityCards: Card[];
  pot: number;
  phase: GamePhase;
  buyIn: number;
  smallBlind: number;
  bigBlind: number;
  currentTurnIndex: number;
  dealerIndex: number;
  deck: Card[];
  highestBet: number;
  winners?: { id: string; amount: number; handName: string; winningCards: string[] }[];
  persistent?: boolean;
  turnStartedAt?: number;
  turnDuration?: number;
  inGrace?: boolean;
  graceStartedAt?: number;
  graceDuration?: number;
  showdownAt?: number;
  lastActivityAt?: number;
  paused?: boolean;
  history?: HandHistory[];
  // --- Modo torneo (ciegas que suben). Si blindLevelDuration es 0/undefined → mesa cash normal ---
  isTournament?: boolean;          // = blindLevelDuration > 0; sin recompra, termina winner-takes-all
  blindLevelDuration?: number;     // ms por nivel; 0/undefined = las ciegas nunca suben
  blindLevelStartedAt?: number;    // wall-clock cuando empezó el nivel actual (solo en juego)
  blindLevel?: number;             // índice de nivel actual (0-based)
  startingChips?: number;          // fichas iniciales (= buyIn) para reiniciar
  startingSmallBlind?: number;     // ciegas iniciales (para reiniciar el torneo)
  startingBigBlind?: number;
  tournamentEnded?: boolean;       // true cuando un solo jugador conserva fichas
  bustCounter?: number;            // contador interno para asignar bustedSeq
  // --- BlackJack ---
  gameType?: GameType;             // 'poker' (default) | 'blackjack'
  bjPhase?: BlackjackPhase;        // Fase específica blackjack (paralela a phase)
  dealerCards?: Card[];            // Mano del dealer (primera carta hidden hasta dealerAction)
  bettingDeadline?: number;        // Timestamp fin de fase betting (cliente muestra cuenta atrás)
  minBet?: number;
  maxBet?: number;
  bjTurnUserId?: string;           // Quién está actuando en playerAction (en lugar de currentTurnIndex)
}

export interface HandHistoryPlayer {
  userId: string;
  name: string;
  cards: Card[];
  chipsDelta: number; // Positive if won, negative if lost
  handName?: string;
  hasFolded: boolean;
}

export interface HandHistory {
  id: string;
  timestamp: number;
  communityCards: Card[];
  pot: number;
  winners: { userId: string; amount: number; handName: string; winningCards: string[] }[];
  players: HandHistoryPlayer[];
  wonByFold: boolean;
}

export interface PublicUser {
  id: string;
  name: string;
  balance: number;
  avatar: string;
  hasPassword: boolean;
  lastDailyClaim: string | null;  // "YYYY-MM-DD"
  lastHourlyClaim: number | null; // ms timestamp
  freeSpinPools?: Record<string, number>; // value (as string) → count
  freeSpinsLeft?: number;
  freeSpinValue?: number;
  lastFreeSpinsClaim?: number | null;
  jackpotUnlockLevel?: number; // 0=locked, 1..10 = tiers unlocked
  // --- Niveles personales ---
  xp?: number;            // XP acumulada total
  level?: number;         // nivel derivado de xp (empieza en 1)
  levelPoints?: number;   // puntos de mejora sin gastar
  paguitaLevel?: number;  // 0 = base 10k, cada nivel x3
  dietaLevel?: number;    // 0 = base 1k, cada nivel x2
  ruletaLevel?: number;   // 0 = base, índice en RULETA_LEVELS
  triviaLevel?: number;   // 0 = base, nº de recompensas malas eliminadas
  lastSeen?: number;
  paidIsrael?: boolean;
  israelDebt?: number;
}

export const STAKE_TIERS: number[] = [1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2000000, 5000000];

// Jackpot-specific tiers and unlock costs (cost = 10x bet)
export const JACKPOT_TIERS: number[] = [1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2000000, 5000000, 10000000, 25000000, 50000000, 100000000, 250000000, 500000000, 1000000000, 5000000000];
export const JACKPOT_UNLOCK_COSTS: number[] = JACKPOT_TIERS.map(t => t * 10);
export const BLIND_DIVISORS: number[] = [20, 10, 5, 4];
export const DEFAULT_BLIND_DIVISOR = 10;

export const blindsFor = (buyIn: number, divisor: number): { smallBlind: number; bigBlind: number } => {
  const d = BLIND_DIVISORS.includes(divisor) ? divisor : DEFAULT_BLIND_DIVISOR;
  const bigBlind = Math.round(buyIn / d);
  const smallBlind = Math.round(bigBlind / 2);
  return { smallBlind, bigBlind };
};

// --- Modo torneo (escalado de ciegas) ---
// Opciones para "tiempo de cambio de nivel". ms=0 → mesa cash (ciegas nunca suben).
export const BLIND_LEVEL_DURATIONS: { key: string; label: string; sub: string; ms: number }[] = [
  { key: 'never', label: 'Nunca', sub: 'Mesa cash', ms: 0 },
  { key: 'turbo', label: 'Turbo', sub: '3 min/nivel', ms: 3 * 60 * 1000 },
  { key: 'normal', label: 'Normal', sub: '5 min/nivel', ms: 5 * 60 * 1000 },
  { key: 'deep', label: 'Lento', sub: '10 min/nivel', ms: 10 * 60 * 1000 },
];

// Sube las ciegas multiplicándolas por 2 (doble).
export const nextBlinds = (bigBlind: number): { smallBlind: number; bigBlind: number } => {
  const target = bigBlind * 2;
  return { bigBlind: target, smallBlind: Math.max(1, Math.round(target / 2)) };
};

// ============================================================
// Sistema de niveles personales
// ============================================================

// XP que se gana jugando / acertando trivia.
export const XP_PER_POKER_HAND = 10;
export const XP_PER_BLACKJACK_HAND = 15;
export const XP_PER_TRIVIA_PARTICIPATION = 4;
export const XP_PER_TRIVIA_CORRECT = 12;
export const XP_PER_JACKPOT_SPIN = 2;
export const XP_PER_JACKPOT_WIN = 5;
export const XP_PER_MINES_PLAY = 2;
export const XP_PER_MINES_WIN = 5;

// XP TOTAL acumulada necesaria para estar EN el nivel dado. Nivel mínimo = 1.
// Curva cuadrática suave: L2=100, L3=300, L4=600, L5=1000, L6=1500...
export const xpForLevel = (level: number): number => {
  if (level <= 1) return 0;
  return 50 * (level - 1) * level;
};

// Nivel derivado de la XP acumulada.
export const levelFromXp = (xp: number): number => {
  let lvl = 1;
  while (xpForLevel(lvl + 1) <= xp) lvl++;
  return lvl;
};

// Puntos de mejora disponibles = (nivel - 1) - puntos ya gastados en tracks.
export const availableLevelPoints = (
  level: number,
  paguitaLevel: number,
  dietaLevel: number,
  ruletaLevel: number,
  triviaLevel: number
): number => Math.max(0, (level - 1) - (paguitaLevel + dietaLevel + ruletaLevel + triviaLevel));

// --- Paguita (bono diario): nv.0 base 10k → nv.10 máx 10M.
//     Sube ~x3 al principio, luego lineal para no dispararse. ---
export const PAGUITA_AMOUNTS = [
  10_000,    // 0
  30_000,    // 1
  90_000,    // 2
  250_000,   // 3
  500_000,   // 4
  1_000_000, // 5
  2_000_000, // 6
  4_000_000, // 7
  6_000_000, // 8
  8_000_000, // 9
  10_000_000,// 10 (máx)
];
export const PAGUITA_MAX_LEVEL = PAGUITA_AMOUNTS.length - 1; // 10
export const dailyAmountFor = (paguitaLevel: number): number =>
  PAGUITA_AMOUNTS[Math.max(0, Math.min(paguitaLevel, PAGUITA_MAX_LEVEL))];

// --- Dietas (bono cada 30 min): nv.0 base 1k → nv.10 máx 1M.
//     Sube x2 al principio, luego lineal. ---
export const DIETA_AMOUNTS = [
  1_000,     // 0
  2_000,     // 1
  4_000,     // 2
  8_000,     // 3
  16_000,    // 4
  50_000,    // 5
  100_000,   // 6
  250_000,   // 7
  500_000,   // 8
  750_000,   // 9
  1_000_000, // 10 (máx)
];
export const DIETA_MAX_LEVEL = DIETA_AMOUNTS.length - 1; // 10
export const hourlyAmountFor = (dietaLevel: number): number =>
  DIETA_AMOUNTS[Math.max(0, Math.min(dietaLevel, DIETA_MAX_LEVEL))];

// --- Ruleta: cada nivel mejora un valor del set de 8 premios ---
const K = 1_000, M = 1_000_000;
export const RULETA_LEVELS: number[][] = [
  [1*K, 5*K, 10*K, 25*K, 50*K, 100*K, 250*K, 500*K], // 0
  [5*K, 10*K, 25*K, 50*K, 100*K, 250*K, 500*K, 1*M], // 1
  [10*K, 25*K, 50*K, 100*K, 250*K, 500*K, 1*M, 2*M], // 2
  [25*K, 50*K, 100*K, 250*K, 500*K, 1*M, 2*M, 5*M],  // 3
  [25*K, 50*K, 100*K, 250*K, 500*K, 1*M, 2*M, 5*M],  // 4
  [50*K, 100*K, 250*K, 500*K, 1*M, 2*M, 5*M, 10*M],  // 5
  [100*K, 250*K, 500*K, 1*M, 2*M, 5*M, 10*M, 10*M],  // 6
  [250*K, 500*K, 1*M, 2*M, 5*M, 10*M, 10*M, 10*M],   // 7
  [500*K, 1*M, 2*M, 5*M, 10*M, 10*M, 10*M, 10*M],    // 8
  [1*M, 2*M, 5*M, 10*M, 10*M, 10*M, 10*M, 10*M],     // 9
  [1*M, 2*M, 5*M, 10*M, 10*M, 10*M, 10*M, 10*M],     // 10
];
export const RULETA_MAX_LEVEL = RULETA_LEVELS.length - 1; // 10
export const ruletaOptionsFor = (ruletaLevel: number): number[] =>
  RULETA_LEVELS[Math.max(0, Math.min(ruletaLevel, RULETA_MAX_LEVEL))];
export const ruletaSpinsFor = (ruletaLevel: number): number => {
  const lvl = Math.max(0, Math.min(ruletaLevel, RULETA_MAX_LEVEL));
  if (lvl >= 10) return 50;
  if (lvl >= 4) return 25;
  return 10;
};

// --- Trivia: track de 10 niveles ---
//   Las mejoras de "quitar peor premio" y "reducir tiempo" van INTERCALADAS.
//   Última mejora: las recompensas de giro dan 5 giros de jackpot en vez de 1.
export type TriviaReward = { type: 'spin'; value: number } | { type: 'chips'; amount: number };
const TRIVIA_TIERS = [
  1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000,
  250_000, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000,
];

// Qué desbloquea cada nivel (índice 0 = nivel 1 ... índice 9 = nivel 10).
type TriviaUpgrade = 'removal' | 'time' | 'multispin';
const TRIVIA_SCHEDULE: TriviaUpgrade[] = [
  'removal', // 1
  'time',    // 2
  'removal', // 3
  'time',    // 4
  'removal', // 5
  'time',    // 6
  'removal', // 7
  'removal', // 8
  'removal', // 9
  'multispin', // 10
];
export const TRIVIA_MAX_LEVEL = TRIVIA_SCHEDULE.length; // 10
export const TRIVIA_REWARD_MAX_LEVEL = TRIVIA_TIERS.length - 1; // 6 (máx removals)

const countUpgrades = (triviaLevel: number, kind: TriviaUpgrade): number =>
  TRIVIA_SCHEDULE.slice(0, Math.max(0, Math.min(triviaLevel, TRIVIA_MAX_LEVEL))).filter(u => u === kind).length;

// Recompensas disponibles: deja siempre al menos el tier de 100k de cada tipo.
export const triviaRewardsFor = (triviaLevel: number): TriviaReward[] => {
  const removals = Math.min(countUpgrades(triviaLevel, 'removal'), TRIVIA_REWARD_MAX_LEVEL);
  const remaining = TRIVIA_TIERS.slice(removals);
  return [
    ...remaining.map((value): TriviaReward => ({ type: 'spin', value })),
    ...remaining.map((amount): TriviaReward => ({ type: 'chips', amount })),
  ];
};

// Cooldown entre preguntas según mejoras de tiempo acumuladas.
// 0 mejoras = 15s, 1ª = 10s, 2ª = 5s, 3ª = 1s.
export const TRIVIA_COOLDOWNS_S = [15, 10, 5, 1];
export const triviaCooldownMs = (triviaLevel: number): number => {
  const timeUpgrades = Math.min(countUpgrades(triviaLevel, 'time'), TRIVIA_COOLDOWNS_S.length - 1);
  return TRIVIA_COOLDOWNS_S[timeUpgrades] * 1000;
};

// Última mejora: las recompensas de giro dan 5 giros en vez de 1.
export const triviaSpinCount = (triviaLevel: number): number => (countUpgrades(triviaLevel, 'multispin') > 0 ? 5 : 1);

export type LevelTrack = 'paguita' | 'dieta' | 'ruleta' | 'trivia';
export const LEVEL_TRACK_MAX: Record<LevelTrack, number> = {
  paguita: PAGUITA_MAX_LEVEL,
  dieta: DIETA_MAX_LEVEL,
  ruleta: RULETA_MAX_LEVEL,
  trivia: TRIVIA_MAX_LEVEL,
};
