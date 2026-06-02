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
