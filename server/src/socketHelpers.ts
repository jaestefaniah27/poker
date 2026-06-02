import crypto from 'crypto';
import { Server } from 'socket.io';
import { getUser, UserRow } from './db';
import { Room } from './pokerEngine';
import { getRoom, handlePlayerAction, endRound, gatherBetsToPot, advanceStreet, bettingClosed, contenders } from './roomManager';
import { sessions, SESSION_TTL_MS, turnTimers, TurnTimer } from './state';
import { saveRoomToDB } from './db';

export let io: Server;
export const setIo = (serverIo: Server) => { io = serverIo; };

export const REVEAL_DELAY = 1100;
export const COLLECT_DELAY = 700;
export const SHOWDOWN_LOCK_MS = 5000;

export const TURN_TIME = 15000;
export const GRACE_TIME = 5000;
export const OFFLINE_REDUCED_TIME = 8000;

export const issueToken = (userId: string): string => {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, issuedAt: Date.now() });
  return token;
};

export const authUser = async (token: string | undefined): Promise<UserRow | undefined> => {
  if (!token) return undefined;
  const session = sessions.get(token);
  if (!session) return undefined;
  if (Date.now() - session.issuedAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return undefined;
  }
  return getUser(session.userId);
};

export const buildRoomView = (room: Room, socketId: string) => {
  const wonByFold = room.winners?.[0]?.handName === 'Won by fold';
  return {
    ...room,
    deck: [],
    players: room.players.map(p => {
      const reveal =
        p.id === socketId ||
        (room.phase === 'showdown' && !p.hasFolded && !p.isSpectating && !wonByFold);
      return reveal ? p : { ...p, cards: [] };
    }),
    history: room.history?.map(h => ({
      ...h,
      players: h.players.map(p => {
        const currentUserId = room.players.find(rp => rp.id === socketId)?.userId;
        const reveal = p.userId === currentUserId || (!h.wonByFold && !p.hasFolded);
        return reveal ? p : { ...p, cards: [] };
      })
    }))
  };
};

export const broadcastRoom = (roomId: string) => {
  if (!io) return;
  const room = getRoom(roomId);
  if (!room) return;
  room.players.forEach(p => {
    if (p.isActive) io.to(p.id).emit('roomUpdated', buildRoomView(room, p.id));
  });
  saveRoomToDB(room).catch(e => console.error(`Error saving room ${roomId} to DB:`, e));
};

export const clearTurnTimer = (roomId: string) => {
  const t = turnTimers.get(roomId);
  if (t) {
    if (t.base) clearTimeout(t.base);
    if (t.grace) clearTimeout(t.grace);
  }
  turnTimers.delete(roomId);
};

export const isBettingPhase = (room: Room) => ['preflop', 'flop', 'turn', 'river'].includes(room.phase);

export const hasOnlinePlayers = (room: Room) => room.players.some(p => p.isActive && !p.hasCashedOut && p.isOnline !== false);

export const armTurnTimer = (roomId: string, force = false) => {
  const room = getRoom(roomId);
  if (!room) { clearTurnTimer(roomId); return; }

  const idx = room.currentTurnIndex;
  const p = idx >= 0 ? room.players[idx] : undefined;
  const valid = !!p && isBettingPhase(room) && p.isActive && !p.hasFolded && !p.isSpectating && p.chips > 0;
  if (!p || !valid) {
    clearTurnTimer(roomId);
    room.inGrace = false;
    room.turnStartedAt = undefined;
    room.turnDuration = undefined;
    return;
  }

  if (!hasOnlinePlayers(room)) {
    clearTurnTimer(roomId);
    room.inGrace = false;
    room.turnStartedAt = undefined;
    room.turnDuration = undefined;
    room.paused = true;
    return;
  }
  room.paused = false;

  const existing = turnTimers.get(roomId);
  if (!force && existing && existing.userId === p.userId && existing.turnIndex === idx) {
    return; 
  }

  clearTurnTimer(roomId);
  const online = p.isOnline !== false;
  const base = online ? TURN_TIME : (p.reducedTime ? OFFLINE_REDUCED_TIME : TURN_TIME);

  room.turnStartedAt = Date.now();
  room.turnDuration = base;
  room.inGrace = false;
  room.graceStartedAt = undefined;
  room.graceDuration = online ? GRACE_TIME : 0;

  const timer: TurnTimer = { userId: p.userId, turnIndex: idx };
  timer.base = setTimeout(() => onBaseExpire(roomId, p.userId), base);
  turnTimers.set(roomId, timer);
};

export const onBaseExpire = (roomId: string, userId: string) => {
  const room = getRoom(roomId);
  if (!room) return;
  const idx = room.currentTurnIndex;
  const p = idx >= 0 ? room.players[idx] : undefined;
  if (!p || p.userId !== userId) return;

  const online = p.isOnline !== false;
  if (online && (room.graceDuration || 0) > 0) {
    room.inGrace = true;
    room.graceStartedAt = Date.now();
    const timer = turnTimers.get(roomId) || { userId, turnIndex: idx };
    timer.grace = setTimeout(() => applyDefaultAction(roomId, userId), room.graceDuration);
    turnTimers.set(roomId, timer);
    if (io) io.to(p.id).emit('turnWarning');
    broadcastRoom(roomId);
  } else {
    applyDefaultAction(roomId, userId);
  }
};

export const applyDefaultAction = (roomId: string, userId: string) => {
  const room = getRoom(roomId);
  if (!room) return;
  const idx = room.currentTurnIndex;
  const p = idx >= 0 ? room.players[idx] : undefined;
  if (!p || p.userId !== userId) return;
  room.inGrace = false;
  const toCall = (room.highestBet || 0) - p.currentBet;
  const action = toCall > 0 ? 'Fold' : 'Check';
  processAction(roomId, userId, action);
};

export const processAction = (roomId: string, userId: string, action: string, amount?: number): boolean => {
  const signal = handlePlayerAction(roomId, userId, action, amount);
  if (!signal) return false;
  const room = getRoom(roomId);
  if (!room) return false;
  room.lastActivityAt = Date.now();

  if (action === 'Check' && io) {
    io.to(roomId).emit('playSound', 'check');
  }

  if (signal === 'continue') {
    armTurnTimer(roomId, true);
    broadcastRoom(roomId);
  } else {
    clearTurnTimer(roomId);
    room.currentTurnIndex = -1;
    broadcastRoom(roomId);
    setTimeout(() => resolveRound(roomId), REVEAL_DELAY);
  }
  return true;
};

export const resolveRound = (roomId: string) => {
  const room = getRoom(roomId);
  if (!room) return;

  if (room.phase === 'showdown') {
    clearTurnTimer(roomId);
    broadcastRoom(roomId);
    return;
  }

  if (contenders(room).length <= 1) {
    clearTurnTimer(roomId);
    endRound(room);
    broadcastRoom(roomId);
    return;
  }

  gatherBetsToPot(room);
  broadcastRoom(roomId);

  setTimeout(() => {
    const room2 = getRoom(roomId);
    if (!room2 || room2.phase === 'showdown') { broadcastRoom(roomId); return; }

    if (room2.phase === 'river') {
      clearTurnTimer(roomId);
      advanceStreet(room2);
      endRound(room2);
      broadcastRoom(roomId);
      return;
    }

    advanceStreet(room2);

    if (bettingClosed(room2)) {
      clearTurnTimer(roomId);
      room2.currentTurnIndex = -1;
      broadcastRoom(roomId);
      setTimeout(() => resolveRound(roomId), REVEAL_DELAY);
    } else {
      armTurnTimer(roomId, true);
      broadcastRoom(roomId);
    }
  }, COLLECT_DELAY);
};
