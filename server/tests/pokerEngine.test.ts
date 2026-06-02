import { describe, it, expect } from 'vitest';
import { createDeck, shuffleDeck, evaluateHands } from '../src/pokerEngine';
import { Room } from '../../shared/types';

describe('Poker Engine Tests', () => {
  it('should generate a valid 52-card deck', () => {
    const deck = createDeck();
    expect(deck.length).toBe(52);
    
    const uniqueStrings = new Set(deck.map(c => `${c.rank}${c.suit}`));
    expect(uniqueStrings.size).toBe(52); // No duplicates
  });

  it('should shuffle the deck pseudo-randomly using secure RNG', () => {
    const deck1 = createDeck();
    const deck2 = createDeck();
    
    shuffleDeck(deck1);
    shuffleDeck(deck2);
    
    // Decks should have 52 cards
    expect(deck1.length).toBe(52);
    expect(deck2.length).toBe(52);
    
    // Chances of two shuffled decks being identical are astronomically low
    const stringified1 = deck1.map(c => `${c.rank}${c.suit}`).join(',');
    const stringified2 = deck2.map(c => `${c.rank}${c.suit}`).join(',');
    expect(stringified1).not.toBe(stringified2);
  });

  it('should correctly evaluate the best hand and resolve ties', () => {
    const dummyRoom: Room = {
      id: 'test',
      name: 'test',
      players: [
        { id: 'p1', userId: 'u1', name: 'P1', balance: 0, chips: 100, currentBet: 0, hasFolded: false, hasActed: false, isActive: true, isSpectating: false, isOnline: true, totalContribution: 0, cards: [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 's' }] },
        { id: 'p2', userId: 'u2', name: 'P2', balance: 0, chips: 100, currentBet: 0, hasFolded: false, hasActed: false, isActive: true, isSpectating: false, isOnline: true, totalContribution: 0, cards: [{ rank: '2', suit: 'h' }, { rank: '7', suit: 'd' }] }
      ],
      communityCards: [
        { rank: 'A', suit: 'h' },
        { rank: 'K', suit: 'h' },
        { rank: 'Q', suit: 'h' },
        { rank: 'J', suit: 'h' },
        { rank: 'T', suit: 'h' }
      ], // A Royal Flush on board!
      pot: 0, phase: 'showdown', buyIn: 0, smallBlind: 0, bigBlind: 0, currentTurnIndex: 0, dealerIndex: 0, highestBet: 0, deck: [], winners: [], persistent: false, lastActivityAt: 0
    };

    const winners = evaluateHands(dummyRoom);
    
    // Both players should tie because the board is a Royal Flush
    expect(winners.length).toBe(2);
    expect(winners[0].handName).toBe('Straight Flush');
  });
});
