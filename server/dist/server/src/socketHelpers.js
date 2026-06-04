"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRound = exports.processAction = exports.applyDefaultAction = exports.onBaseExpire = exports.armTurnTimer = exports.hasOnlinePlayers = exports.isBettingPhase = exports.clearTurnTimer = exports.broadcastRoom = exports.buildRoomView = exports.authUser = exports.issueToken = exports.OFFLINE_REDUCED_TIME = exports.GRACE_TIME = exports.TURN_TIME = exports.SHOWDOWN_LOCK_MS = exports.COLLECT_DELAY = exports.REVEAL_DELAY = exports.setIo = exports.io = void 0;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("./db");
const setIo = (serverIo) => { exports.io = serverIo; };
exports.setIo = setIo;
exports.REVEAL_DELAY = 1100;
exports.COLLECT_DELAY = 700;
exports.SHOWDOWN_LOCK_MS = 5000;
exports.TURN_TIME = 15000;
exports.GRACE_TIME = 5000;
exports.OFFLINE_REDUCED_TIME = 8000;
const roomManager_1 = require("./roomManager");
const state_1 = require("./state");
const issueToken = async (userId) => {
    const token = crypto_1.default.randomBytes(32).toString('hex');
    const now = Date.now();
    state_1.sessions.set(token, { userId, issuedAt: now });
    await (0, db_1.saveSessionToDB)(token, userId, now);
    return token;
};
exports.issueToken = issueToken;
const authUser = async (token) => {
    if (!token)
        return undefined;
    let session = state_1.sessions.get(token);
    if (!session) {
        const dbSession = await (0, db_1.getSessionFromDB)(token);
        if (dbSession) {
            session = { userId: dbSession.user_id, issuedAt: dbSession.issued_at };
            state_1.sessions.set(token, session);
        }
    }
    if (!session)
        return undefined;
    if (Date.now() - session.issuedAt > state_1.SESSION_TTL_MS) {
        state_1.sessions.delete(token);
        await (0, db_1.deleteSessionFromDB)(token);
        return undefined;
    }
    return (0, db_1.getUser)(session.userId);
};
exports.authUser = authUser;
const buildRoomView = (room, socketId) => {
    const wonByFold = room.winners?.[0]?.handName === 'Won by fold';
    return {
        ...room,
        deck: [],
        players: room.players.map(p => {
            const reveal = p.id === socketId ||
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
exports.buildRoomView = buildRoomView;
const broadcastRoom = (roomId) => {
    if (!exports.io)
        return;
    const room = (0, roomManager_1.getRoom)(roomId);
    if (!room)
        return;
    room.players.forEach(p => {
        if (p.isActive)
            exports.io.to(p.id).emit('roomUpdated', (0, exports.buildRoomView)(room, p.id));
    });
    (0, db_1.saveRoomToDB)(room).catch(e => console.error(`Error saving room ${roomId} to DB:`, e));
};
exports.broadcastRoom = broadcastRoom;
const clearTurnTimer = (roomId) => {
    const t = state_1.turnTimers.get(roomId);
    if (t) {
        if (t.base)
            clearTimeout(t.base);
        if (t.grace)
            clearTimeout(t.grace);
    }
    state_1.turnTimers.delete(roomId);
};
exports.clearTurnTimer = clearTurnTimer;
const isBettingPhase = (room) => ['preflop', 'flop', 'turn', 'river'].includes(room.phase);
exports.isBettingPhase = isBettingPhase;
const hasOnlinePlayers = (room) => room.players.some(p => p.isActive && !p.hasCashedOut && p.isOnline !== false);
exports.hasOnlinePlayers = hasOnlinePlayers;
const armTurnTimer = (roomId, force = false) => {
    const room = (0, roomManager_1.getRoom)(roomId);
    if (!room) {
        (0, exports.clearTurnTimer)(roomId);
        return;
    }
    const idx = room.currentTurnIndex;
    const p = idx >= 0 ? room.players[idx] : undefined;
    const valid = !!p && (0, exports.isBettingPhase)(room) && p.isActive && !p.hasFolded && !p.isSpectating && p.chips > 0;
    if (!p || !valid) {
        (0, exports.clearTurnTimer)(roomId);
        room.inGrace = false;
        room.turnStartedAt = undefined;
        room.turnDuration = undefined;
        return;
    }
    if (!(0, exports.hasOnlinePlayers)(room)) {
        (0, exports.clearTurnTimer)(roomId);
        room.inGrace = false;
        room.turnStartedAt = undefined;
        room.turnDuration = undefined;
        room.paused = true;
        return;
    }
    room.paused = false;
    const existing = state_1.turnTimers.get(roomId);
    if (!force && existing && existing.userId === p.userId && existing.turnIndex === idx) {
        return;
    }
    (0, exports.clearTurnTimer)(roomId);
    const online = p.isOnline !== false;
    const base = online ? exports.TURN_TIME : (p.reducedTime ? exports.OFFLINE_REDUCED_TIME : exports.TURN_TIME);
    room.turnStartedAt = Date.now();
    room.turnDuration = base;
    room.inGrace = false;
    room.graceStartedAt = undefined;
    room.graceDuration = online ? exports.GRACE_TIME : 0;
    const timer = { userId: p.userId, turnIndex: idx };
    timer.base = setTimeout(() => (0, exports.onBaseExpire)(roomId, p.userId), base);
    state_1.turnTimers.set(roomId, timer);
};
exports.armTurnTimer = armTurnTimer;
const onBaseExpire = (roomId, userId) => {
    const room = (0, roomManager_1.getRoom)(roomId);
    if (!room)
        return;
    const idx = room.currentTurnIndex;
    const p = idx >= 0 ? room.players[idx] : undefined;
    if (!p || p.userId !== userId)
        return;
    const online = p.isOnline !== false;
    if (online && (room.graceDuration || 0) > 0) {
        room.inGrace = true;
        room.graceStartedAt = Date.now();
        const timer = state_1.turnTimers.get(roomId) || { userId, turnIndex: idx };
        timer.grace = setTimeout(() => (0, exports.applyDefaultAction)(roomId, userId), room.graceDuration);
        state_1.turnTimers.set(roomId, timer);
        if (exports.io)
            exports.io.to(p.id).emit('turnWarning');
        (0, exports.broadcastRoom)(roomId);
    }
    else {
        (0, exports.applyDefaultAction)(roomId, userId);
    }
};
exports.onBaseExpire = onBaseExpire;
const applyDefaultAction = (roomId, userId) => {
    const room = (0, roomManager_1.getRoom)(roomId);
    if (!room)
        return;
    const idx = room.currentTurnIndex;
    const p = idx >= 0 ? room.players[idx] : undefined;
    if (!p || p.userId !== userId)
        return;
    room.inGrace = false;
    const toCall = (room.highestBet || 0) - p.currentBet;
    const action = toCall > 0 ? 'Fold' : 'Check';
    (0, exports.processAction)(roomId, userId, action);
};
exports.applyDefaultAction = applyDefaultAction;
const processAction = (roomId, userId, action, amount) => {
    const signal = (0, roomManager_1.handlePlayerAction)(roomId, userId, action, amount);
    if (!signal)
        return false;
    const room = (0, roomManager_1.getRoom)(roomId);
    if (!room)
        return false;
    room.lastActivityAt = Date.now();
    if (action === 'Check' && exports.io) {
        exports.io.to(roomId).emit('playSound', 'check');
    }
    if (signal === 'continue') {
        (0, exports.armTurnTimer)(roomId, true);
        (0, exports.broadcastRoom)(roomId);
    }
    else {
        (0, exports.clearTurnTimer)(roomId);
        room.currentTurnIndex = -1;
        (0, exports.broadcastRoom)(roomId);
        setTimeout(() => (0, exports.resolveRound)(roomId), exports.REVEAL_DELAY);
    }
    return true;
};
exports.processAction = processAction;
const resolveRound = (roomId) => {
    const room = (0, roomManager_1.getRoom)(roomId);
    if (!room)
        return;
    if (room.phase === 'showdown') {
        (0, exports.clearTurnTimer)(roomId);
        (0, exports.broadcastRoom)(roomId);
        return;
    }
    if ((0, roomManager_1.contenders)(room).length <= 1) {
        (0, exports.clearTurnTimer)(roomId);
        (0, roomManager_1.endRound)(room);
        (0, exports.broadcastRoom)(roomId);
        return;
    }
    (0, roomManager_1.gatherBetsToPot)(room);
    (0, exports.broadcastRoom)(roomId);
    setTimeout(() => {
        const room2 = (0, roomManager_1.getRoom)(roomId);
        if (!room2 || room2.phase === 'showdown') {
            (0, exports.broadcastRoom)(roomId);
            return;
        }
        if (room2.phase === 'river') {
            (0, exports.clearTurnTimer)(roomId);
            (0, roomManager_1.advanceStreet)(room2);
            (0, roomManager_1.endRound)(room2);
            (0, exports.broadcastRoom)(roomId);
            return;
        }
        (0, roomManager_1.advanceStreet)(room2);
        if ((0, roomManager_1.bettingClosed)(room2)) {
            (0, exports.clearTurnTimer)(roomId);
            room2.currentTurnIndex = -1;
            (0, exports.broadcastRoom)(roomId);
            setTimeout(() => (0, exports.resolveRound)(roomId), exports.REVEAL_DELAY);
        }
        else {
            (0, exports.armTurnTimer)(roomId, true);
            (0, exports.broadcastRoom)(roomId);
        }
    }, exports.COLLECT_DELAY);
};
exports.resolveRound = resolveRound;
