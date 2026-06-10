import { Card, Player, Room, SidebetType, BjSidebetResult } from '../../shared/types';
import { createDeck, shuffleDeck } from './pokerEngine';

export { createDeck, shuffleDeck };

const NUM_DECKS = 6;
const RESHUFFLE_THRESHOLD = Math.floor((NUM_DECKS * 52) * 0.25); // ~25% del zapato

const createShoe = (): Card[] => {
  const shoe: Card[] = [];
  for (let i = 0; i < NUM_DECKS; i++) shoe.push(...createDeck());
  shuffleDeck(shoe);
  return shoe;
};

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

// ============================================================
// Sidebets (apuestas laterales)
// ============================================================
const RANK_VAL: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};
const isRedSuit = (s: Card['suit']) => s === 'h' || s === 'd';
type Win = { mult: number; label: string } | null;

// Perfect Pairs: las 2 cartas iniciales forman pareja.
const ppMult = (a: Card, b: Card): Win => {
  if (a.rank !== b.rank) return null;
  if (a.suit === b.suit) return { mult: 30, label: 'Pareja perfecta' };       // mismo rango + palo
  if (isRedSuit(a.suit) === isRedSuit(b.suit)) return { mult: 10, label: 'Pareja de color' }; // mismo color
  return { mult: 5, label: 'Pareja mixta' };                                  // distinto color
};

// Escalera de 3 cartas (incluye rueda A-2-3 con A=14).
const isStraight3 = (rs: number[]): boolean => {
  const s = [...rs].sort((x, y) => x - y);
  if (s[0] + 1 === s[1] && s[1] + 1 === s[2]) return true;
  if (s[0] === 2 && s[1] === 3 && s[2] === 14) return true;
  return false;
};

// 21+3: 2 cartas jugador + up-card dealer = mano de poker.
const tp3Mult = (a: Card, b: Card, up: Card): Win => {
  const cards = [a, b, up];
  const ranks = cards.map(c => RANK_VAL[c.rank]);
  const flush = cards.every(c => c.suit === a.suit);
  const trips = ranks[0] === ranks[1] && ranks[1] === ranks[2];
  const straight = isStraight3(ranks);
  if (trips && flush) return { mult: 100, label: 'Trío del mismo palo' };
  if (straight && flush) return { mult: 40, label: 'Escalera de color' };
  if (trips) return { mult: 30, label: 'Trío' };
  if (straight) return { mult: 10, label: 'Escalera' };
  if (flush) return { mult: 5, label: 'Color' };
  return null;
};

// Lucky Ladies: las 2 cartas iniciales suman 20 (A=11).
const llMult = (a: Card, b: Card, dealerBJ: boolean): Win => {
  if (cardValue(a.rank) + cardValue(b.rank) !== 20) return null;
  const twoQ = a.rank === 'Q' && b.rank === 'Q';
  if (twoQ && dealerBJ) return { mult: 1000, label: 'Dos Damas + BJ dealer' };
  if (twoQ) return { mult: 125, label: 'Dos Damas' };
  if (a.rank === b.rank && a.suit === b.suit) return { mult: 19, label: '20 igualado' };
  if (a.suit === b.suit) return { mult: 9, label: '20 del mismo palo' };
  return { mult: 4, label: 'Veinte' };
};

// Evalúa todas las sidebets del jugador contra sus 2 cartas iniciales + cartas reales del dealer.
// dealerCards[0]=hole, dealerCards[1]=up-card (sin enmascarar en servidor).
export const evaluateSidebets = (
  player: Player, dealerCards: Card[]
): { results: BjSidebetResult[]; delta: number } => {
  const sb = player.bjSidebets;
  const results: BjSidebetResult[] = [];
  if (!sb || !player.cards || player.cards.length < 2 || !dealerCards || dealerCards.length < 2) {
    return { results, delta: 0 };
  }
  const [a, b] = player.cards;
  const up = dealerCards[1];
  const dealerBJ = isBlackjack(dealerCards);
  let delta = 0;

  const add = (type: SidebetType, bet: number, win: Win, loseLabel: string) => {
    if (!bet || bet <= 0) return;
    if (win) {
      const d = win.mult * bet;
      results.push({ type, bet, delta: d, won: true, label: win.label });
      delta += d;
    } else {
      results.push({ type, bet, delta: -bet, won: false, label: loseLabel });
      delta -= bet;
    }
  };

  add('perfectPairs', sb.perfectPairs || 0, ppMult(a, b), 'Sin pareja');
  add('twentyOneThree', sb.twentyOneThree || 0, tp3Mult(a, b, up), 'Sin mano');
  add('luckyLadies', sb.luckyLadies || 0, llMult(a, b, dealerBJ), 'Sin 20');

  // Insurance: solo cuenta si el up-card del dealer es As. Si no hay As → apuesta devuelta (delta 0).
  const insBet = sb.insurance || 0;
  if (insBet > 0) {
    if (up.rank !== 'A') {
      results.push({ type: 'insurance', bet: insBet, delta: 0, won: false, label: 'Sin As · devuelto' });
    } else if (dealerBJ) {
      const d = 2 * insBet; // 2:1
      results.push({ type: 'insurance', bet: insBet, delta: d, won: true, label: 'Dealer BJ' });
      delta += d;
    } else {
      results.push({ type: 'insurance', bet: insBet, delta: -insBet, won: false, label: 'Dealer sin BJ' });
      delta -= insBet;
    }
  }

  return { results, delta };
};

export const needsReshuffle = (room: Room, minCards: number): boolean =>
  !room.deck || room.deck.length < Math.max(minCards, RESHUFFLE_THRESHOLD);

export const initShoe = (room: Room): void => {
  room.deck = createShoe();
};

const ensureDeck = (room: Room, minCards: number) => {
  if (needsReshuffle(room, minCards)) initShoe(room);
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

    // Sidebets: se evalúan ya con las 2 cartas iniciales + dealer real, pero se pagan en resolve.
    const sb = evaluateSidebets(p, room.dealerCards!);
    p.bjSidebetResults = sb.results.length ? sb.results : undefined;
    p.bjSidebetDelta = sb.delta || undefined;
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
      p.bjSidebets = undefined;
      p.bjSidebetResults = undefined;
      p.bjSidebetDelta = undefined;
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

      // Pago de sidebets (ya evaluadas al repartir). Se acreditan aparte del main bet.
      if (p.bjSidebetDelta) p.chips += p.bjSidebetDelta;
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
    p.bjSidebets = undefined;
    // mantener bjResult/bjDelta/bjSidebetResults para que cliente los muestre durante 'resolve' antes de limpiar
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
