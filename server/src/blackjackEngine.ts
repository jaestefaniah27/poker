import { Card, Player, Room } from '../../shared/types';
import { createDeck, shuffleDeck } from './pokerEngine';

export { createDeck, shuffleDeck };

const RESHUFFLE_THRESHOLD = 15;

const cardValue = (rank: Card['rank']): number => {
  if (rank === 'A') return 11;
  if (rank === 'K' || rank === 'Q' || rank === 'J' || rank === 'T') return 10;
  return parseInt(rank, 10);
};

export const handValue = (cards: Card[]): { total: number; soft: boolean } => {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c.rank);
    if (c.rank === 'A') aces++;
  }
  // Bajar Ases de 11→1 mientras revente
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 && total <= 21 };
};

export const isBlackjack = (cards: Card[]): boolean => {
  if (cards.length !== 2) return false;
  const { total } = handValue(cards);
  return total === 21;
};

const ensureDeck = (room: Room, minCards: number) => {
  if (!room.deck || room.deck.length < Math.max(minCards, RESHUFFLE_THRESHOLD)) {
    room.deck = createDeck();
    shuffleDeck(room.deck);
  }
};

// Reparte 2 cartas a cada jugador con bet > 0 + 2 al dealer.
// Si alguno tiene blackjack natural lo marca; el resto queda 'playing'.
export const dealBlackjack = (room: Room) => {
  const players = room.players.filter(p => p.isActive && !p.isSpectating && (p.bet || 0) > 0);
  ensureDeck(room, players.length * 2 + 2);
  room.dealerCards = [room.deck.pop()!, room.deck.pop()!];
  players.forEach(p => {
    const c1 = room.deck.pop()!;
    const c2 = room.deck.pop()!;
    p.cards = [c1, c2];
    p.bjDoubled = false;
    p.bjStatus = isBlackjack(p.cards) ? 'blackjack' : 'playing';
    p.bjResult = undefined;
    p.bjDelta = undefined;
    
    p.bjHands = [{
      cards: [c1, c2],
      bet: p.bet || 0,
      status: p.bjStatus
    }];
    p.bjActiveHandIndex = 0;
  });
  // Jugadores sin bet: mano vacía, idle
  room.players
    .filter(p => p.isActive && !p.isSpectating && (p.bet || 0) === 0)
    .forEach(p => {
      p.cards = [];
      p.bjStatus = 'idle';
      p.bjDoubled = false;
      p.bjResult = undefined;
      p.bjDelta = undefined;
      p.bjHands = undefined;
      p.bjActiveHandIndex = undefined;
    });
};

// Dealer pega cartas mientras total < 17, o soft 17 (hits soft 17 — variante moderna).
export const dealerPlay = (room: Room) => {
  if (!room.dealerCards) return;
  ensureDeck(room, 5);
  while (true) {
    const { total, soft } = handValue(room.dealerCards);
    if (total > 21) return;
    if (total > 17) return;
    if (total === 17 && !soft) return;
    room.dealerCards.push(room.deck.pop()!);
  }
};

// Aplica payouts. BlackJack natural paga 3:2 (gana 1.5x), win normal 1:1, push devuelve apuesta.
// Bust del jugador pierde la apuesta. Si el dealer revienta, paga a todos los no-bust.
export const resolveBlackjack = (room: Room) => {
  if (!room.dealerCards) return;
  const dealer = handValue(room.dealerCards);
  const dealerBJ = isBlackjack(room.dealerCards);
  const dealerBust = dealer.total > 21;

  room.players
    .filter(p => p.isActive && !p.isSpectating && (p.bet || 0) > 0)
    .forEach(p => {
      let totalDelta = 0;

      if (p.bjHands && p.bjHands.length > 0) {
        for (const hand of p.bjHands) {
          const bet = hand.bet;
          const player = handValue(hand.cards);
          const playerBJ = hand.status === 'blackjack';

          let delta = 0;
          let result: 'win' | 'lose' | 'push' | 'blackjack' | 'surrender' = 'lose';

          if (hand.status === 'bust' || player.total > 21) {
            delta = -bet;
            result = 'lose';
          } else if (hand.status === 'surrender') {
            delta = -Math.ceil(bet / 2);
            result = 'surrender';
          } else if (playerBJ && dealerBJ) {
            delta = 0; // push
            result = 'push';
          } else if (playerBJ) {
            delta = Math.floor(bet * 1.5); // 3:2
            result = 'blackjack';
          } else if (dealerBJ) {
            delta = -bet;
            result = 'lose';
          } else if (dealerBust) {
            delta = bet;
            result = 'win';
          } else if (player.total > dealer.total) {
            delta = bet;
            result = 'win';
          } else if (player.total < dealer.total) {
            delta = -bet;
            result = 'lose';
          } else {
            delta = 0;
            result = 'push';
          }

          hand.delta = delta;
          hand.result = result;
          totalDelta += delta;
        }

        p.chips += totalDelta;
        p.bjDelta = totalDelta;
        p.bjResult = p.bjHands[0].result;
      } else {
        // Fallback for legacy state without bjHands
        const bet = p.bet || 0;
        const player = handValue(p.cards);
        const playerBJ = p.bjStatus === 'blackjack';

        let delta = 0;
        let result: 'win' | 'lose' | 'push' | 'blackjack' | 'surrender' = 'lose';

        if (p.bjStatus === 'bust' || player.total > 21) {
          delta = -bet;
          result = 'lose';
        } else if (p.bjStatus === 'surrender') {
          delta = -Math.ceil(bet / 2);
          result = 'surrender';
        } else if (playerBJ && dealerBJ) {
          delta = 0; // push
          result = 'push';
        } else if (playerBJ) {
          delta = Math.floor(bet * 1.5); // 3:2
          result = 'blackjack';
        } else if (dealerBJ) {
          delta = -bet;
          result = 'lose';
        } else if (dealerBust) {
          delta = bet;
          result = 'win';
        } else if (player.total > dealer.total) {
          delta = bet;
          result = 'win';
        } else if (player.total < dealer.total) {
          delta = -bet;
          result = 'lose';
        } else {
          delta = 0;
          result = 'push';
        }

        p.chips += delta;
        p.bjDelta = delta;
        p.bjResult = result;
      }
    });
};

// Limpia estado de mano para que el siguiente ciclo de betting arranque fresco.
export const resetBlackjackHand = (room: Room) => {
  room.dealerCards = [];
  room.players.forEach(p => {
    p.cards = [];
    p.bet = 0;
    p.bjStatus = 'idle';
    p.bjDoubled = false;
    p.bjHands = undefined;
    p.bjActiveHandIndex = undefined;
    // mantener bjResult/bjDelta para que cliente los muestre durante 'resolve' antes de limpiar
  });
};

// Devuelve el siguiente jugador que debe actuar (bet > 0 y bjStatus === 'playing'), o undefined.
export const nextBlackjackActor = (room: Room, afterUserId?: string): Player | undefined => {
  const eligibles = room.players.filter(p => {
    if (!p.isActive || p.isSpectating || (p.bet || 0) === 0) return false;
    if (p.bjHands && p.bjHands.length > 0) {
      return p.bjHands.some(h => h.status === 'playing');
    }
    return p.bjStatus === 'playing';
  });
  if (eligibles.length === 0) return undefined;
  if (!afterUserId) return eligibles[0];
  const idx = eligibles.findIndex(p => p.userId === afterUserId);
  if (idx === -1) return eligibles[0];
  return eligibles[idx + 1];
};
