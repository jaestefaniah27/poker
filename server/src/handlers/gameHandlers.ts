import { Socket } from 'socket.io';
import {
  getRooms, getRoom, rebuy, startGame, touchRoom, nextHand,
  markBustedPlayers, checkTournamentEnd, restartTournament, clearBlindTimer
} from '../roomManager';
import { broadcastRoom, armTurnTimer, clearTurnTimer, processAction, io, SHOWDOWN_LOCK_MS } from '../socketHelpers';
import { applyBalanceDelta, getUser, getPokerStats, getAllStats } from '../db';
import { lt, isZero } from '../../../shared/types';

// Emotes permitidos en mesa (lista cerrada: el server no reenvía texto libre).
const ALLOWED_EMOTES = ['😂', '😭', '🔥', '💀', '🐔', '😡', '🤑', '👏'];
const EMOTE_COOLDOWN_MS = 1500;
const lastEmoteAt = new Map<string, number>();

export const gameHandlers = (socket: Socket) => {
  socket.on('sendEmote', ({ roomId, emote }) => {
    if (typeof emote !== 'string' || !ALLOWED_EMOTES.includes(emote)) return;
    const room = getRoom(roomId);
    const player = room?.players.find(p => p.id === socket.id);
    if (!room || !player) return;

    const now = Date.now();
    if (now - (lastEmoteAt.get(socket.id) || 0) < EMOTE_COOLDOWN_MS) return;
    lastEmoteAt.set(socket.id, now);

    socket.to(roomId).emit('emote', { userId: player.userId, emote });
  });

  socket.on('disconnect', () => {
    lastEmoteAt.delete(socket.id);
  });

  socket.on('getUserStats', async ({ userId }, callback) => {
    if (typeof callback !== 'function') return;
    if (typeof userId !== 'string' || !userId) { callback({ error: 'userId requerido' }); return; }
    const [poker, general] = await Promise.all([getPokerStats(userId), getAllStats(userId)]);
    callback({ ok: true, poker, general });
  });

  socket.on('rebuy', async ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room) return;
    if (room.isTournament || room.isProportional) return; // En torneo o mesa proporcional no hay recompra
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const dbUser = await getUser(player.userId);
    if (!dbUser || lt(dbUser.balance, room.buyIn)) return;

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
    if (!r) return;
    if (r.phase === 'showdown' && Date.now() - (r.showdownAt || 0) < SHOWDOWN_LOCK_MS) {
      broadcastRoom(roomId);
      return;
    }

    // Modo torneo: registrar orden de eliminación y comprobar fin (winner-takes-all)
    if (r.isTournament) {
      markBustedPlayers(roomId);
      const end = checkTournamentEnd(roomId);
      if (end.ended) {
        r.tournamentEnded = true;
        r.phase = 'waiting';
        clearBlindTimer(roomId);
        clearTurnTimer(roomId);
        broadcastRoom(roomId);
        io.to(roomId).emit('tournamentEnded', { roomId });
        io.emit('roomsUpdated', getRooms());
        return;
      }
    }

    clearTurnTimer(roomId);
    touchRoom(roomId);
    if (nextHand(roomId)) {
      const started = startGame(roomId);
      if (started) {
        armTurnTimer(roomId, true);
        io.to(roomId).emit('gameStarted');
      }
      broadcastRoom(roomId);
    } else {
      broadcastRoom(roomId);
    }
  });

  // Reiniciar torneo terminado con la misma config (solo el admin = primer jugador)
  socket.on('restartTournament', async ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room || !room.isTournament || !room.tournamentEnded) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || room.players[0]?.userId !== player.userId) return;

    const deltas = restartTournament(roomId);
    for (const d of deltas) {
      if (!isZero(d.delta)) {
        const newBalance = await applyBalanceDelta(d.userId, d.delta);
        io.to(d.socketId).emit('balanceUpdated', { balance: newBalance });
      }
    }
    clearTurnTimer(roomId);
    broadcastRoom(roomId);
    io.emit('roomsUpdated', getRooms());
  });
};
