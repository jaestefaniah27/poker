import { Socket } from 'socket.io';
import { getRooms, getRoom, rebuy, startGame, touchRoom, nextHand } from '../roomManager';
import { broadcastRoom, armTurnTimer, clearTurnTimer, processAction, io, SHOWDOWN_LOCK_MS } from '../socketHelpers';
import { applyBalanceDelta } from '../db';

export const gameHandlers = (socket: Socket) => {
  socket.on('rebuy', async ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const ok = rebuy(roomId, player.userId, room.buyIn);
    if (!ok) return;

    const newBalance = await applyBalanceDelta(player.userId, -room.buyIn);
    socket.emit('balanceUpdated', { balance: newBalance });
    broadcastRoom(roomId);
    io.emit('roomsUpdated', getRooms());
  });

  socket.on('startGame', ({ roomId }) => {
    const success = startGame(roomId);
    if (success) {
      armTurnTimer(roomId, true);
      broadcastRoom(roomId);
      io.to(roomId).emit('gameStarted');
    }
  });

  socket.on('playerAction', ({ roomId, action, amount }) => {
    const room = getRoom(roomId);
    const seat = room?.players.find(p => p.id === socket.id);
    if (!seat) return;
    processAction(roomId, seat.userId, action, amount);
  });

  socket.on('nextHand', ({ roomId }) => {
    const r = getRoom(roomId);
    if (r && r.phase === 'showdown' && Date.now() - (r.showdownAt || 0) < SHOWDOWN_LOCK_MS) {
      broadcastRoom(roomId);
      return;
    }
    clearTurnTimer(roomId);
    touchRoom(roomId);
    if (nextHand(roomId)) {
      startGame(roomId);
      armTurnTimer(roomId, true);
      broadcastRoom(roomId);
      io.to(roomId).emit('gameStarted');
    } else {
      broadcastRoom(roomId);
    }
  });
};
