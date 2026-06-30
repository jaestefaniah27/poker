import { Card, Player, Room, SidebetType, BjSidebetResult, Suit } from '../../shared/types';
import { m, add, sub, mul, gt, gte, toStr, type Money } from '../../shared/money';
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
const isRed = (s: Suit) => s === 'h' || s === 'd';
const llMult = (a: Card, b: Card, dealerBJ: boolean): Win => {
  if (cardValue(a.rank) + cardValue(b.rank) !== 20) return null;
  const isLL = a.rank === 'Q' && a.suit === 'h' && b.rank === 'Q' && b.suit === 'h';

  if (isLL && dealerBJ) return { mult: 1000, label: 'Lucky Ladies + Dealer BJ' };
  if (isLL) return { mult: 200, label: 'Lucky Ladies' };

  const sameRank = a.rank === b.rank;
  const sameSuit = a.suit === b.suit;
  const sameColor = isRed(a.suit) === isRed(b.suit);

  // Jerarquía estándar de casino:
  if (sameRank && sameSuit) return { mult: 25, label: '20 Idéntico' }; // Matched 20
  if (sameRank && sameColor) return { mult: 15, label: '20 Color' };
  if (sameSuit) return { mult: 10, label: '20 Mismo Palo' }; // Suited 20
  return { mult: 4, label: 'Cualquier 20' }; // Any 20
};

// Evalúa todas las sidebets del jugador contra sus 2 cartas iniciales + cartas reales del dealer.
// dealerCards[0]=up-card (descubierta), dealerCards[1]=hole (tapada).
export const evaluateSidebets = (
  player: Player, dealerCards: Card[]
): { results: BjSidebetResult[]; delta: string } => {
  const sb = player.bjSidebets;
  const results: BjSidebetResult[] = [];
  if (!sb || !player.cards || player.cards.length < 2 || !dealerCards || dealerCards.length < 2) {
    return { results, delta: '0' };
  }
  const [a, b] = player.cards;
  const up = dealerCards[0]; // [up, hole]: descubierta en índice 0
  const dealerBJ = isBlackjack(dealerCards);
  let delta: Money = m(0);

  const addSb = (type: SidebetType, betRaw: string | undefined, win: Win, loseLabel: string) => {
    const bet = m(betRaw ?? 0);
    if (bet.lte(0)) return;
    if (win) {
      const d = mul(bet, win.mult);
      results.push({ type, bet: toStr(bet), delta: toStr(d), won: true, label: win.label });
      delta = add(delta, d);
    } else {
      results.push({ type, bet: toStr(bet), delta: toStr(bet.negated()), won: false, label: loseLabel });
      delta = sub(delta, bet);
    }
  };

  addSb('perfectPairs', sb.perfectPairs, ppMult(a, b), 'Sin pareja');
  addSb('twentyOneThree', sb.twentyOneThree, tp3Mult(a, b, up), 'Sin mano');
  addSb('luckyLadies', sb.luckyLadies, llMult(a, b, dealerBJ), 'Sin 20');

  return { results, delta: toStr(delta) };
};

export const needsReshuffle = (room: Room, minCards: number): boolean =>
  !room.deck || room.deck.length < Math.max(minCards, RESHUFFLE_THRESHOLD);

export const initShoe = (room: Room): void => {
  room.deck = createShoe();
};

const ensureDeck = (room: Room, minCards: number) => {
  if (needsReshuffle(room, minCards)) initShoe(room);
};

// Apuesta de la mano actual > 0 (helper de filtrado).
const hasBet = (p: Player): boolean => gt(m(p.bet ?? 0), 0);

// Reparte siguiendo el orden real de casino:
//  1) una carta a cada jugador (izq→der), 2) up-card del dealer (visible),
//  3) segunda carta a cada jugador, 4) hole-card del dealer (oculta).
// dealerCards = [up, hole]: índice 0 = descubierta (visible), índice 1 = tapada.
// Si alguno tiene blackjack natural lo marca; el resto queda 'playing'.
export const dealBlackjack = (room: Room) => {
  const players = room.players.filter(p => p.isActive && !p.isSpectating && hasBet(p));
  ensureDeck(room, players.length * 2 + 2);

  // Ronda 1: primera carta a cada jugador.
  players.forEach(p => { p.cards = [room.deck.pop()!]; });
  // Up-card del dealer (visible).
  const up = room.deck.pop()!;
  // Ronda 2: segunda carta a cada jugador.
  players.forEach(p => { p.cards.push(room.deck.pop()!); });
  // Hole-card del dealer (oculta).
  const hole = room.deck.pop()!;
  room.dealerCards = [up, hole];

  players.forEach(p => {
    p.bjDoubled = false;
    p.bjStatus = isBlackjack(p.cards) ? 'blackjack' : 'playing';
    p.bjResult = undefined;
    p.bjDelta = undefined;

    p.bjHands = [{
      cards: [p.cards[0], p.cards[1]],
      bet: toStr(m(p.bet ?? 0)),
      status: p.bjStatus
    }];
    p.bjActiveHandIndex = 0;

    // Sidebets: se evalúan ya con las 2 cartas iniciales + dealer real. Se acreditan inmediatamente.
    const sb = evaluateSidebets(p, room.dealerCards!);
    p.bjSidebetResults = sb.results.length ? sb.results : undefined;
    p.bjSidebetDelta = m(sb.delta).isZero() ? undefined : sb.delta;

    // Acreditación temprana de Parejas, 21+3, Lucky Ladies.
    if (p.bjSidebetDelta) p.chips = toStr(add(p.chips, p.bjSidebetDelta));
  });
  // Jugadores sin bet: mano vacía, idle
  room.players
    .filter(p => p.isActive && !p.isSpectating && !hasBet(p))
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
    .filter(p => p.isActive && !p.isSpectating && hasBet(p))
    .forEach(p => {
      let totalDelta: Money = m(0);

      if (p.bjHands && p.bjHands.length > 0) {
        for (const hand of p.bjHands) {
          const bet = m(hand.bet);
          const player = handValue(hand.cards);
          const playerBJ = hand.status === 'blackjack';

          let delta: Money = m(0);
          let result: 'win' | 'lose' | 'push' | 'blackjack' | 'surrender' = 'lose';

          if (hand.status === 'bust' || player.total > 21) {
            delta = bet.negated();
            result = 'lose';
          } else if (hand.status === 'surrender') {
            delta = bet.div(2).ceil().negated();
            result = 'surrender';
          } else if (playerBJ && dealerBJ) {
            delta = m(0); // push
            result = 'push';
          } else if (playerBJ) {
            delta = bet.times(3).div(2).floor(); // 3:2
            result = 'blackjack';
          } else if (dealerBJ) {
            delta = bet.negated();
            result = 'lose';
          } else if (dealerBust) {
            delta = bet;
            result = 'win';
          } else if (player.total > dealer.total) {
            delta = bet;
            result = 'win';
          } else if (player.total < dealer.total) {
            delta = bet.negated();
            result = 'lose';
          } else {
            delta = m(0);
            result = 'push';
          }

          hand.delta = toStr(delta);
          hand.result = result;
          totalDelta = add(totalDelta, delta);
        }

        p.chips = toStr(add(p.chips, totalDelta));
        p.bjDelta = toStr(totalDelta);
        // Resultado global = balance neto de TODAS las manos (no solo la primera).
        // Con una sola mano se conserva su resultado exacto (blackjack/surrender).
        p.bjResult = p.bjHands.length === 1
          ? p.bjHands[0].result
          : (gt(totalDelta, 0) ? 'win' : gt(m(0), totalDelta) ? 'lose' : 'push');
      } else {
        // Fallback for legacy state without bjHands
        const bet = m(p.bet ?? 0);
        const player = handValue(p.cards);
        const playerBJ = p.bjStatus === 'blackjack';

        let delta: Money = m(0);
        let result: 'win' | 'lose' | 'push' | 'blackjack' | 'surrender' = 'lose';

        if (p.bjStatus === 'bust' || player.total > 21) {
          delta = bet.negated();
          result = 'lose';
        } else if (p.bjStatus === 'surrender') {
          delta = bet.div(2).ceil().negated();
          result = 'surrender';
        } else if (playerBJ && dealerBJ) {
          delta = m(0); // push
          result = 'push';
        } else if (playerBJ) {
          delta = bet.times(3).div(2).floor(); // 3:2
          result = 'blackjack';
        } else if (dealerBJ) {
          delta = bet.negated();
          result = 'lose';
        } else if (dealerBust) {
          delta = bet;
          result = 'win';
        } else if (player.total > dealer.total) {
          delta = bet;
          result = 'win';
        } else if (player.total < dealer.total) {
          delta = bet.negated();
          result = 'lose';
        } else {
          delta = m(0);
          result = 'push';
        }

        p.chips = toStr(add(p.chips, delta));
        p.bjDelta = toStr(delta);
        p.bjResult = result;
      }

      // Pago de sidebets (las principales ya evaluadas al repartir)
      // Pago de sidebets resolubles al final de la mano (Seguro, Dealer Busted)
      let lateSidebetDelta: Money = m(0);
      const resList = p.bjSidebetResults || [];

      // 1. Seguro
      if (p.bjSidebets?.insurance) {
        const insBet = m(p.bjSidebets.insurance);
        const up = room.dealerCards![0]; // [up, hole]

        let delta: Money = m(0);
        let won = false;
        let label = '';

        if (up.rank !== 'A') {
          delta = m(0);
          won = false;
          label = 'Sin As · devuelto';
        } else if (dealerBJ) {
          delta = insBet.times(2);
          won = true;
          label = 'Dealer BJ';
        } else {
          delta = insBet.negated();
          won = false;
          label = 'Dealer sin BJ';
        }

        resList.push({ type: 'insurance', bet: toStr(insBet), delta: toStr(delta), won, label });
        lateSidebetDelta = add(lateSidebetDelta, delta);
      }

      // 2. Dealer Busted
      if (p.bjSidebets?.dealerBusted) {
        const bBet = m(p.bjSidebets.dealerBusted);
        let delta: Money = m(0);
        let won = false;
        let label = '';

        if (!dealerBust) {
          delta = bBet.negated();
          won = false;
          label = 'No Busted';
        } else {
          const count = room.dealerCards!.length;
          won = true;
          if (count <= 4) {
            delta = bBet.times(2);
            label = `Bust ${count} cartas`;
          } else if (count === 5) {
            delta = bBet.times(4);
            label = 'Bust 5 cartas';
          } else if (count === 6) {
            delta = bBet.times(15);
            label = 'Bust 6 cartas';
          } else if (count === 7) {
            delta = bBet.times(50);
            label = 'Bust 7 cartas';
          } else {
            delta = bBet.times(250);
            label = 'Bust 8+ cartas';
          }
        }
        resList.push({ type: 'dealerBusted', bet: toStr(bBet), delta: toStr(delta), won, label });
        lateSidebetDelta = add(lateSidebetDelta, delta);
      }

      if (resList.length > 0) {
        p.bjSidebetResults = resList;
      }

      // Añadimos solo las ganancias/pérdidas de esta fase tardía al saldo
      if (!lateSidebetDelta.isZero()) {
        p.chips = toStr(add(p.chips, lateSidebetDelta));
        p.bjSidebetDelta = toStr(add(p.bjSidebetDelta ?? '0', lateSidebetDelta));
      }
    });
};

// Limpia estado de mano para que el siguiente ciclo de betting arranque fresco.
export const resetBlackjackHand = (room: Room) => {
  room.dealerCards = [];
  room.players.forEach(p => {
    p.cards = [];
    p.bet = '0';
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
    if (!p.isActive || p.isSpectating || !hasBet(p)) return false;
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
