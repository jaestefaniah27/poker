// @ts-ignore
import { Hand } from 'pokersolver';
import { Card, Suit, Rank, Player, GamePhase, STAKE_TIERS, BLIND_DIVISORS, DEFAULT_BLIND_DIVISOR, blindsFor, Room } from '../../shared/types';

export { STAKE_TIERS, BLIND_DIVISORS, DEFAULT_BLIND_DIVISOR, blindsFor, Room };


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
