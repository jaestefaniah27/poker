import { describe, it, expect } from 'vitest';
import { endRound } from '../src/roomManager';
import { Room } from '../../shared/types';

describe('Room Manager - Side Pots & Betting Logic', () => {
  it('should correctly calculate and distribute complex 3-way side pots', () => {
    // Escenario:
    // P1 tiene 10 fichas (all-in) - Gana con la mejor mano
    // P2 tiene 30 fichas (all-in) - Segunda mejor mano
    // P3 tiene 50 fichas (call de 30) - Peor mano
    // Bote principal (P1, P2, P3): 10 * 3 = 30 fichas. Lo debe ganar P1.
    // Bote secundario (P2, P3): 20 * 2 = 40 fichas. Lo debe ganar P2.
    // Total aportado: 10 + 30 + 30 = 70.
    
    const dummyRoom: Room = {
      id: 'test',
      name: 'test',
      players: [
        { 
          id: 'p1', userId: 'u1', name: 'P1', balance: 0, chips: 0, 
          currentBet: 0, hasFolded: false, hasActed: true, isActive: true, isSpectating: false, isOnline: true, 
          totalContribution: 10, // All in
          cards: [{ rank: 'A', suit: 's' }, { rank: 'A', suit: 'h' }] // Pair of Aces
        },
        { 
          id: 'p2', userId: 'u2', name: 'P2', balance: 0, chips: 0, 
          currentBet: 0, hasFolded: false, hasActed: true, isActive: true, isSpectating: false, isOnline: true, 
          totalContribution: 30, // All in
          cards: [{ rank: 'K', suit: 's' }, { rank: 'K', suit: 'h' }] // Pair of Kings
        },
        { 
          id: 'p3', userId: 'u3', name: 'P3', balance: 0, chips: 20, 
          currentBet: 0, hasFolded: false, hasActed: true, isActive: true, isSpectating: false, isOnline: true, 
          totalContribution: 30, // Called 30
          cards: [{ rank: '2', suit: 'c' }, { rank: '3', suit: 'd' }] // High card
        }
      ],
      communityCards: [
        { rank: '5', suit: 's' },
        { rank: '7', suit: 'd' },
        { rank: '9', suit: 'c' },
        { rank: 'J', suit: 'h' },
        { rank: 'Q', suit: 's' }
      ], // No hit on board
      pot: 70, // Total current pot to distribute
      phase: 'river', buyIn: 0, smallBlind: 0, bigBlind: 0, currentTurnIndex: 0, dealerIndex: 0, highestBet: 0, deck: [], winners: [], persistent: false, lastActivityAt: 0
    };

    endRound(dummyRoom);

    // Assertions
    expect(dummyRoom.phase).toBe('showdown');
    
    // Player 1 contributed 10, so they win the main pot of 30.
    const p1 = dummyRoom.players.find(p => p.id === 'p1');
    expect(p1?.chips).toBe(30);

    // Player 2 contributed 30, so they win the side pot of (30-10)*2 = 40.
    const p2 = dummyRoom.players.find(p => p.id === 'p2');
    expect(p2?.chips).toBe(40);

    // Player 3 contributed 30 but lost to everyone.
    const p3 = dummyRoom.players.find(p => p.id === 'p3');
    expect(p3?.chips).toBe(20); // Sus 20 originales que le sobraban

    // Check winners array length. Both P1 and P2 won a pot.
    expect(dummyRoom.winners.length).toBe(2);
  });
});
