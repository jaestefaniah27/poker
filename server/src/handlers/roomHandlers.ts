import { Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { getRooms, createRoom, getRoom, joinRoom, leaveRoom } from '../roomManager';
import { STAKE_TIERS, BLIND_DIVISORS, DEFAULT_BLIND_DIVISOR } from '../pokerEngine';
import { authUser, broadcastRoom, armTurnTimer, clearTurnTimer, io } from '../socketHelpers';
import { applyBalanceDelta } from '../db';
import { sanitizeInput } from '../security';

export const roomHandlers = (socket: Socket) => {
  socket.on('createRoom', ({ roomName, tierIndex, blindDivisor, blindLevelDuration }, callback) => {
    const cleanRoomName = sanitizeInput(roomName?.trim() || 'Sala sin nombre');
    const idx = Number.isInteger(tierIndex) && tierIndex >= 0 && tierIndex < STAKE_TIERS.length ? tierIndex : 0;
    const div = BLIND_DIVISORS.includes(blindDivisor) ? blindDivisor : DEFAULT_BLIND_DIVISOR;
    const dur = Number.isFinite(blindLevelDuration) && blindLevelDuration > 0 ? Math.floor(blindLevelDuration) : 0;
    const roomId = uuidv4();
    createRoom(roomId, cleanRoomName, false, idx, div, dur);
    callback({ roomId });
    io.emit('roomsUpdated', getRooms());
  });

  socket.on('joinRoom', async ({ roomId, token }) => {
    const room = getRoom(roomId);
    if (!room) return;

    const dbUser = await authUser(token);
    if (!dbUser) return;

    const buyIn = room.buyIn;
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
      totalContribution: 0
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
  });

  socket.on('leaveRoom', async ({ roomId }) => {
    const cashOut = leaveRoom(roomId, socket.id);
    socket.leave(roomId);
    if (cashOut) {
      const newBalance = await applyBalanceDelta(cashOut.userId, cashOut.chips);
      socket.emit('balanceUpdated', { balance: newBalance });
    }
    armTurnTimer(roomId, true);
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
