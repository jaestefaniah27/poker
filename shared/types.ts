export type Suit = 'h' | 'd' | 'c' | 's'; // hearts, diamonds, clubs, spades
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  rank: Rank;
  suit: Suit;
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
  handName?: string;
  totalContribution: number;
  bustedSeq?: number; // Orden de eliminación en modo torneo (1 = primer eliminado)
}

export type GamePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

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
}

export const STAKE_TIERS: number[] = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000];
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

// Sube las ciegas ~1.5x redondeando a un número limpio.
export const nextBlinds = (bigBlind: number): { smallBlind: number; bigBlind: number } => {
  const target = bigBlind * 1.5;
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  const rounded = Math.max(bigBlind + 1, Math.round(target / mag) * mag);
  return { bigBlind: rounded, smallBlind: Math.max(1, Math.round(rounded / 2)) };
};
