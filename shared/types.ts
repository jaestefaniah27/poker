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

// --- Tournament Types ---

export type TournamentStatus = 'registering' | 'running' | 'finished';

export interface BlindLevel {
  smallBlind: number;
  bigBlind: number;
  duration: number; // ms
}

export interface TournamentPlayer {
  userId: string;
  name: string;
  avatar: string;
  chips: number;        // Current chips in tournament
  isEliminated: boolean;
  finishPosition?: number; // 1 = winner
  prizeWon: number;
}

export interface TournamentRequest {
  userId: string;
  name: string;
  avatar: string;
  requestedAt: number;
}

export interface Tournament {
  id: string;
  name: string;
  status: TournamentStatus;
  buyIn: number;           // Entry fee (deducted from balance)
  startingChips: number;   // Chips each player starts with
  maxPlayers: number;      // 2-8
  blindLevels: BlindLevel[];
  currentBlindLevel: number;
  blindTimer?: number;     // Timestamp when current level started
  players: TournamentPlayer[];
  pendingRequests: TournamentRequest[]; // Players waiting for host approval
  roomId?: string;         // Active game room ID
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  prizePool: number;
  prizeStructure: number[]; // Percentages [60, 30, 10] for top 3
  creatorId: string;
}

export interface TournamentSummary {
  id: string;
  name: string;
  status: TournamentStatus;
  buyIn: number;
  playerCount: number;
  pendingCount: number;
  maxPlayers: number;
  prizePool: number;
  currentBlindLevel: number;
  blindLevels: BlindLevel[];
  creatorId: string;
}

// Predefined blind structures for tournaments
export const TOURNAMENT_BLIND_STRUCTURES: Record<string, { label: string; levels: BlindLevel[] }> = {
  turbo: {
    label: 'Turbo',
    levels: [
      { smallBlind: 10, bigBlind: 20, duration: 3 * 60 * 1000 },
      { smallBlind: 20, bigBlind: 40, duration: 3 * 60 * 1000 },
      { smallBlind: 30, bigBlind: 60, duration: 3 * 60 * 1000 },
      { smallBlind: 50, bigBlind: 100, duration: 3 * 60 * 1000 },
      { smallBlind: 75, bigBlind: 150, duration: 3 * 60 * 1000 },
      { smallBlind: 100, bigBlind: 200, duration: 3 * 60 * 1000 },
      { smallBlind: 150, bigBlind: 300, duration: 3 * 60 * 1000 },
      { smallBlind: 250, bigBlind: 500, duration: 3 * 60 * 1000 },
    ]
  },
  normal: {
    label: 'Normal',
    levels: [
      { smallBlind: 10, bigBlind: 20, duration: 5 * 60 * 1000 },
      { smallBlind: 15, bigBlind: 30, duration: 5 * 60 * 1000 },
      { smallBlind: 25, bigBlind: 50, duration: 5 * 60 * 1000 },
      { smallBlind: 50, bigBlind: 100, duration: 5 * 60 * 1000 },
      { smallBlind: 75, bigBlind: 150, duration: 5 * 60 * 1000 },
      { smallBlind: 100, bigBlind: 200, duration: 5 * 60 * 1000 },
      { smallBlind: 150, bigBlind: 300, duration: 5 * 60 * 1000 },
      { smallBlind: 250, bigBlind: 500, duration: 5 * 60 * 1000 },
    ]
  },
  deep: {
    label: 'Deep Stack',
    levels: [
      { smallBlind: 5, bigBlind: 10, duration: 8 * 60 * 1000 },
      { smallBlind: 10, bigBlind: 20, duration: 8 * 60 * 1000 },
      { smallBlind: 15, bigBlind: 30, duration: 8 * 60 * 1000 },
      { smallBlind: 25, bigBlind: 50, duration: 8 * 60 * 1000 },
      { smallBlind: 50, bigBlind: 100, duration: 8 * 60 * 1000 },
      { smallBlind: 75, bigBlind: 150, duration: 8 * 60 * 1000 },
      { smallBlind: 100, bigBlind: 200, duration: 8 * 60 * 1000 },
      { smallBlind: 200, bigBlind: 400, duration: 8 * 60 * 1000 },
    ]
  }
};

export const TOURNAMENT_BUY_INS = [100, 500, 1000, 5000, 10000];

export const TOURNAMENT_STARTING_CHIPS = 1500;

export const PRIZE_STRUCTURES: Record<number, number[]> = {
  2: [100],           // heads-up: winner takes all
  3: [70, 30],
  4: [60, 30, 10],
  5: [55, 30, 15],
  6: [50, 30, 20],
  7: [45, 30, 25],
  8: [45, 30, 25],
};
