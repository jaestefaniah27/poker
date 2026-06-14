import crypto from 'crypto';
import { Server } from 'socket.io';
import { getUser, UserRow, saveSessionToDB, getSessionFromDB, deleteSessionFromDB, saveRoomToDB } from './db';

export let io: Server;
export const setIo = (serverIo: Server) => { io = serverIo; };

export const REVEAL_DELAY = 1100;
export const COLLECT_DELAY = 700;
export const SHOWDOWN_LOCK_MS = 5000;

export const broadcastPresence = () => {
  if (!io) return;
  const ids = new Set<string>();
  for (const [, s] of io.sockets.sockets) {
    if (s.data?.user && s.data.user.name !== 'Jorge') ids.add(s.data.user.id);
  }
  io.emit('onlineCount', { count: ids.size });
  io.emit('leaderboardUpdated');
};

// Sesión única por usuario (estilo Clash of Clans): al loguear/reanudar en un
// socket nuevo, expulsamos cualquier otra conexión del mismo userId. Usamos
// disconnect(true) del servidor para que el cliente NO auto-reconecte (reason
// 'io server disconnect') y no se produzca ping-pong entre pestañas.
export const kickOtherSessions = (userId: string, keepSocketId: string) => {
  if (!io) return;
  for (const [, s] of io.sockets.sockets) {
    if (s.id !== keepSocketId && s.data?.user?.id === userId) {
      s.emit('sessionReplaced');
      s.disconnect(true);
    }
  }
};

export const notifyUser = (userId: string, event: string, payload: any) => {
  if (!io) return;
  for (const [, s] of io.sockets.sockets) {
    if (s.data?.user?.id === userId) {
      s.emit(event, payload);
    }
  }
};

export const TURN_TIME = 15000;
export const GRACE_TIME = 5000;
export const OFFLINE_REDUCED_TIME = 8000;

// Wrapper para que un error dentro de un setTimeout no rompa la cadena de turnos en silencio.
export const safeTimeout = (fn: () => void, ms: number, label = 'timeout'): NodeJS.Timeout => {
  return setTimeout(() => {
    try { fn(); }
    catch (err) { console.error(`[safeTimeout:${label}] error:`, err); }
  }, ms);
};

import { Room } from './pokerEngine';
import { getRoom, handlePlayerAction, endRound, gatherBetsToPot, advanceStreet, bettingClosed, contenders, setRoomBroadcastHook } from './roomManager';
import { sessions, SESSION_TTL_MS, turnTimers, TurnTimer } from './state';

export const issueToken = async (userId: string): Promise<string> => {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  sessions.set(token, { userId, issuedAt: now });
  await saveSessionToDB(token, userId, now);
  return token;
};

export const authUser = async (token: string | undefined): Promise<UserRow | undefined> => {
  if (!token) return undefined;
  
  let session = sessions.get(token);
  if (!session) {
    const dbSession = await getSessionFromDB(token);
    if (dbSession) {
      session = { userId: dbSession.user_id, issuedAt: dbSession.issued_at };
      sessions.set(token, session);
    }
  }

  if (!session) return undefined;
  
  if (Date.now() - session.issuedAt > SESSION_TTL_MS) {
    sessions.delete(token);
    await deleteSessionFromDB(token);
    return undefined;
  }
  return getUser(session.userId);
};

export const buildRoomView = (room: Room, socketId: string) => {
  if (room.gameType === 'blackjack') {
    // En blackjack todas las cartas son públicas; sólo ocultamos la hole-card del dealer hasta dealerAction/resolve.
    // dealerCards = [up, hole]: la descubierta (índice 0) se ve, la tapada (índice 1) se enmascara.
    const hideDealerHole = room.bjPhase === 'dealing' || room.bjPhase === 'playerAction';
    const dealerCards = hideDealerHole && room.dealerCards && room.dealerCards.length > 0
      ? [room.dealerCards[0], { rank: '?' as any, suit: '?' as any }]
      : room.dealerCards;
    return { ...room, deck: [], deckSize: room.deck?.length ?? 0, dealerCards };
  }
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

// Throttle de persistencia: saveRoomToDB hace fsync (PRAGMA synchronous=FULL).
// En partida activa broadcastRoom dispara docenas de veces/seg; sin throttle el
// event-loop se atasca y los clientes muestran "conectando al servidor".
// Persistimos como mucho 1 escritura por sala cada PERSIST_INTERVAL.
const PERSIST_INTERVAL = 1000;
const pendingPersist: Map<string, { last: number; timer?: NodeJS.Timeout }> = new Map();

const schedulePersist = (roomId: string) => {
  const now = Date.now();
  const slot = pendingPersist.get(roomId) || { last: 0 };
  const since = now - slot.last;

  const doSave = () => {
    const r = getRoom(roomId);
    if (!r) { pendingPersist.delete(roomId); return; }
    slot.last = Date.now();
    slot.timer = undefined;
    saveRoomToDB(r).catch(e => console.error(`[persist] sala ${roomId}:`, e));
  };

  if (since >= PERSIST_INTERVAL) {
    pendingPersist.set(roomId, slot);
    doSave();
  } else if (!slot.timer) {
    slot.timer = setTimeout(doSave, PERSIST_INTERVAL - since);
    pendingPersist.set(roomId, slot);
  }
};

export const broadcastRoom = (roomId: string) => {
  if (!io) return;
  const room = getRoom(roomId);
  if (!room) return;
  room.players.forEach(p => {
    if (p.isActive) io.to(p.id).emit('roomUpdated', buildRoomView(room, p.id));
  });
  schedulePersist(roomId);
};

// roomManager re-emite la sala tras refrescar niveles (XP de cada mano).
setRoomBroadcastHook(broadcastRoom);

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
  timer.base = safeTimeout(() => onBaseExpire(roomId, p.userId), base, 'baseExpire');
  turnTimers.set(roomId, timer);
};

// Watchdog: detecta turnos donde el timer murió o nunca se armó y los re-arma.
// Se llama periódicamente desde index.ts para impedir salas "colgadas".
export const turnWatchdog = () => {
  // Importamos lazy para evitar ciclo de imports al cargar el módulo.
  const { getRooms } = require('./roomManager') as typeof import('./roomManager');
  const now = Date.now();
  for (const r of getRooms()) {
    const room = getRoom(r.id);
    if (!room) continue;
    if (!isBettingPhase(room)) continue;
    if (room.currentTurnIndex < 0) continue;
    const p = room.players[room.currentTurnIndex];
    if (!p || !p.isActive || p.hasFolded || p.isSpectating || p.chips <= 0) continue;
    if (!hasOnlinePlayers(room)) continue;

    const timer = turnTimers.get(r.id);
    const total = (room.turnDuration || 0) + (room.graceDuration || 0);
    const started = room.turnStartedAt || 0;
    const overdue = started > 0 && total > 0 && (now - started) > (total + 2000);

    if (!timer || overdue) {
      console.warn(`[Watchdog] sala ${r.id} sin timer activo (overdue=${overdue}), re-armando turno.`);
      armTurnTimer(r.id, true);
      broadcastRoom(r.id);
    }
  }
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
    timer.grace = safeTimeout(() => applyDefaultAction(roomId, userId), room.graceDuration || GRACE_TIME, 'graceExpire');
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
    safeTimeout(() => resolveRound(roomId), REVEAL_DELAY, 'resolveRound');
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

  safeTimeout(() => {
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
      safeTimeout(() => resolveRound(roomId), REVEAL_DELAY, 'resolveRound');
    } else {
      armTurnTimer(roomId, true);
      broadcastRoom(roomId);
    }
  }, COLLECT_DELAY, 'collectBets');
};
