// @ts-ignore
import { Hand } from 'pokersolver';

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
  avatar?: string; // Semilla del avatar (dicebear). Por defecto el userId.
  cards: Card[];
  chips: number;
  currentBet: number;
  hasFolded: boolean;
  hasActed: boolean; // True si ya ha actuado en la ronda actual
  isActive: boolean; // false if left the room
  isSpectating?: boolean; // true if joined mid-hand, waiting for next hand
  balance: number; // Saldo persistente FUERA de la mesa (patrimonio neto = balance + chips)
  hasCashedOut?: boolean; // true si ya retiró sus fichas al saldo (evita doble cobro)
  isOnline?: boolean; // false si el socket se desconectó pero conserva el asiento
  reducedTime?: boolean; // true si lleva offline desde el inicio de la mano (turno de 8s sin gracia)
  handName?: string; // Ej: "Pair", "Two Pair"
  totalContribution: number;
}

export type GamePhase = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

// Entradas predefinidas (cada punto del deslizador al crear sala). Fuente de verdad del servidor;
// el cliente duplica estos valores para pintar el deslizador.
export const STAKE_TIERS: number[] = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000];

// Las ciegas se derivan de la entrada: BB = buyIn / divisor, SB = BB/2.
// Divisor menor => ciegas más altas => menos fichas por ciega => partida más corta/agresiva.
// Divisor mayor => ciegas más bajas => más juego ("jugosa"). Default 10.
export const BLIND_DIVISORS: number[] = [20, 10, 5, 4]; // de "profunda" a "express"
export const DEFAULT_BLIND_DIVISOR = 10;

export const blindsFor = (buyIn: number, divisor: number): { smallBlind: number; bigBlind: number } => {
  const d = BLIND_DIVISORS.includes(divisor) ? divisor : DEFAULT_BLIND_DIVISOR;
  const bigBlind = Math.round(buyIn / d);
  const smallBlind = Math.round(bigBlind / 2);
  return { smallBlind, bigBlind };
};

export interface Room {
  id: string;
  name: string;
  players: Player[];
  communityCards: Card[];
  pot: number;
  phase: GamePhase;
  buyIn: number;          // fichas que cuesta sentarse / recomprar en esta sala
  smallBlind: number;     // ciega pequeña fija de la sala
  bigBlind: number;       // ciega grande fija de la sala
  currentTurnIndex: number;
  dealerIndex: number;
  deck: Card[];
  highestBet: number;
  winners?: { id: string; amount: number; handName: string; winningCards: string[] }[];
  persistent?: boolean; // true = sala fija que nunca se borra (p.ej. la Sala Presidencial)
  // --- Temporizador de turno (lo gestiona el servidor; el cliente solo pinta) ---
  turnStartedAt?: number;   // timestamp (ms) en que empezó el turno actual
  turnDuration?: number;    // ms de tiempo base del turno (15s normal / 8s offline reducido)
  inGrace?: boolean;        // true si el jugador agotó el tiempo base y está en periodo de gracia
  graceStartedAt?: number;  // timestamp (ms) en que empezó la gracia
  graceDuration?: number;   // ms de gracia (5s online / 0 offline)
  showdownAt?: number;      // timestamp (ms) en que se entró en showdown (bloquea "next hand" 5s)
  lastActivityAt?: number;  // timestamp (ms) de la última actividad real (acción/join) — para limpiar salas inactivas
  paused?: boolean;         // true si el juego está congelado por no quedar nadie conectado
}

export const createDeck = (): Card[] => {
  const suits: Suit[] = ['h', 'd', 'c', 's'];
  const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const deck: Card[] = [];
  for (const s of suits) {
    for (const r of ranks) {
      deck.push({ rank: r, suit: s });
    }
  }
  return deck;
};

export const shuffleDeck = (deck: Card[]) => {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
};

export const dealCards = (room: Room) => {
  const activePlayers = room.players.filter(p => p.isActive && !p.isSpectating);
  if (room.deck.length < activePlayers.length * 2) {
    console.error(`dealCards: deck has ${room.deck.length} cards, need ${activePlayers.length * 2}`);
    return;
  }
  activePlayers.forEach(p => {
    p.cards = [room.deck.pop()!, room.deck.pop()!];
    p.hasFolded = false;
    p.hasActed = false;
    p.currentBet = 0;
    p.totalContribution = 0;
  });
};

export const evaluateHands = (room: Room) => {
  const communityStrings = room.communityCards.map(c => `${c.rank}${c.suit}`);
  
  const hands = room.players
    .filter(p => !p.hasFolded && p.isActive && !p.isSpectating)
    .map(p => {
      const playerStrings = p.cards.map(c => `${c.rank}${c.suit}`);
      const hand = Hand.solve([...playerStrings, ...communityStrings]);
      hand.playerId = p.id;
      return hand;
    });

  const winners = Hand.winners(hands);
  return winners.map((w: any) => ({
    playerId: w.playerId,
    handName: w.name,
    winningCards: w.cards.map((c: any) => `${c.value}${c.suit}`) // pokersolver uses value/suit internally
  }));
};

export const updateHandNames = (room: Room) => {
  const communityStrings = room.communityCards.map(c => `${c.rank}${c.suit}`);
  room.players.forEach(p => {
    if (p.cards && p.cards.length > 0) {
      const playerStrings = p.cards.map(c => `${c.rank}${c.suit}`);
      const hand = Hand.solve([...playerStrings, ...communityStrings]);
      p.handName = hand.name;
    } else {
      p.handName = '';
    }
  });
};
