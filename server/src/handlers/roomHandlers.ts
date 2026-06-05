import { Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { getRooms, createRoom, getRoom, joinRoom, leaveRoom } from '../roomManager';
import { STAKE_TIERS, BLIND_DIVISORS, DEFAULT_BLIND_DIVISOR } from '../pokerEngine';
import { authUser, broadcastRoom, armTurnTimer, clearTurnTimer, io } from '../socketHelpers';
import { applyBalanceDelta } from '../db';
import { sanitizeInput } from '../security';
import { maybeStartBlackjack, handleBlackjackLeave, clearBlackjackTimers } from './blackjackHandlers';

export const roomHandlers = (socket: Socket) => {
  socket.on('createRoom', ({ roomName, tierIndex, blindDivisor, blindLevelDuration, gameType, minBet, maxBet }, callback) => {
    const cleanRoomName = sanitizeInput(roomName?.trim() || 'Sala sin nombre');
    const idx = Number.isInteger(tierIndex) && tierIndex >= 0 && tierIndex < STAKE_TIERS.length ? tierIndex : 0;
    const div = BLIND_DIVISORS.includes(blindDivisor) ? blindDivisor : DEFAULT_BLIND_DIVISOR;
    const dur = Number.isFinite(blindLevelDuration) && blindLevelDuration > 0 ? Math.floor(blindLevelDuration) : 0;
    const gt = gameType === 'blackjack' ? 'blackjack' : 'poker';
    const safeMin = Number.isFinite(minBet) && minBet > 0 ? Math.floor(minBet) : undefined;
    const safeMax = Number.isFinite(maxBet) && maxBet > 0 ? Math.floor(maxBet) : undefined;
    const roomId = uuidv4();
    createRoom(roomId, cleanRoomName, false, idx, div, dur, gt, safeMin, safeMax);
    callback({ roomId });
    io.emit('roomsUpdated', getRooms());
  });

  socket.on('joinRoom', async ({ roomId, token, buyInAmount }) => {
    const room = getRoom(roomId);
    if (!room) return;

    const dbUser = await authUser(token);
    if (!dbUser) return;

    // BlackJack: buy-in elegido por el jugador (saldo solo indicativo, puede quedar negativo).
    // Poker: buy-in fijo de la mesa.
    const isBJ = room.gameType === 'blackjack';
    const reqBuyIn = Math.floor(Number(buyInAmount));
    const buyIn = isBJ
      ? (Number.isFinite(reqBuyIn) && reqBuyIn > 0 ? reqBuyIn : 1000)
      : room.buyIn;
    const offTableBalance = dbUser.balance - buyIn;

    const result = joinRoom(roomId, {
      id: socket.id,
      userId: dbUser.id,
      name: dbUser.name,
      avatar: dbUser.avatar || dbUser.id,
      cards: [],
      chips: buyIn,
      balance: offTableBalance,
      currentBet: 0,
      hasFolded: false,
      hasActed: false,
      isActive: true,
      totalContribution: 0,
      lastBuyIn: isBJ ? buyIn : undefined
    });

    if (!result) return;
    
    if (result === 'full') {
      socket.emit('error', 'La mesa está llena (máximo 8 jugadores).');
      return;
    }
    
    socket.join(roomId);

    if (result === 'joined') {
      const newBalance = await applyBalanceDelta(dbUser.id, -buyIn);
      socket.emit('balanceUpdated', { balance: newBalance });
    } else {
      socket.emit('balanceUpdated', { balance: dbUser.balance });
      const room2 = getRoom(roomId);
      if (room2 && room2.currentTurnIndex >= 0) {
        armTurnTimer(roomId, true);
      }
    }

    broadcastRoom(roomId);
    io.emit('roomsUpdated', getRooms());

    // BlackJack: si la sala está parada, arrancar primera ronda
    const room3 = getRoom(roomId);
    if (room3?.gameType === 'blackjack') {
      maybeStartBlackjack(roomId);
    }
  });

  socket.on('leaveRoom', async ({ roomId }) => {
    const before = getRoom(roomId);
    const wasBlackjack = before?.gameType === 'blackjack';
    const cashOut = leaveRoom(roomId, socket.id);
    socket.leave(roomId);
    if (cashOut) {
      const newBalance = await applyBalanceDelta(cashOut.userId, cashOut.chips);
      socket.emit('balanceUpdated', { balance: newBalance });
    }
    if (wasBlackjack) {
      const after = getRoom(roomId);
      if (after) handleBlackjackLeave(roomId);
      else clearBlackjackTimers(roomId);
    } else {
      armTurnTimer(roomId, true);
    }
    broadcastRoom(roomId);
    io.emit('roomsUpdated', getRooms());
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    for (const r of getRooms()) {
      const room = getRoom(r.id);
      if (!room) continue;
      const p = room.players.find(pl => pl.id === socket.id && pl.isActive && !pl.hasCashedOut);
      if (!p) continue;
      p.isOnline = false;
      p.offlineSince = Date.now();
      
      const hasOnlinePlayers = room.players.some(p => p.isActive && !p.hasCashedOut && p.isOnline !== false);
      if (!hasOnlinePlayers) {
        // We need clearTurnTimer, which is in socketHelpers.
        // Let's import clearTurnTimer from socketHelpers at the top of the file.
        room.paused = true;
        room.turnStartedAt = undefined;
        room.turnDuration = undefined;
        room.inGrace = false;
      }
      broadcastRoom(r.id);
    }
    io.emit('roomsUpdated', getRooms());
  });
};
