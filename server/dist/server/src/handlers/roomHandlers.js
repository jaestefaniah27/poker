"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomHandlers = void 0;
const uuid_1 = require("uuid");
const roomManager_1 = require("../roomManager");
const pokerEngine_1 = require("../pokerEngine");
const socketHelpers_1 = require("../socketHelpers");
const db_1 = require("../db");
const security_1 = require("../security");
const roomHandlers = (socket) => {
    socket.on('createRoom', ({ roomName, tierIndex, blindDivisor, blindLevelDuration }, callback) => {
        const cleanRoomName = (0, security_1.sanitizeInput)(roomName?.trim() || 'Sala sin nombre');
        const idx = Number.isInteger(tierIndex) && tierIndex >= 0 && tierIndex < pokerEngine_1.STAKE_TIERS.length ? tierIndex : 0;
        const div = pokerEngine_1.BLIND_DIVISORS.includes(blindDivisor) ? blindDivisor : pokerEngine_1.DEFAULT_BLIND_DIVISOR;
        const dur = Number.isFinite(blindLevelDuration) && blindLevelDuration > 0 ? Math.floor(blindLevelDuration) : 0;
        const roomId = (0, uuid_1.v4)();
        (0, roomManager_1.createRoom)(roomId, cleanRoomName, false, idx, div, dur);
        callback({ roomId });
        socketHelpers_1.io.emit('roomsUpdated', (0, roomManager_1.getRooms)());
    });
    socket.on('joinRoom', async ({ roomId, token }) => {
        const room = (0, roomManager_1.getRoom)(roomId);
        if (!room)
            return;
        const dbUser = await (0, socketHelpers_1.authUser)(token);
        if (!dbUser)
            return;
        const buyIn = room.buyIn;
        const offTableBalance = dbUser.balance - buyIn;
        const result = (0, roomManager_1.joinRoom)(roomId, {
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
        if (!result)
            return;
        if (result === 'full') {
            socket.emit('error', 'La mesa está llena (máximo 8 jugadores).');
            return;
        }
        socket.join(roomId);
        if (result === 'joined') {
            const newBalance = await (0, db_1.applyBalanceDelta)(dbUser.id, -buyIn);
            socket.emit('balanceUpdated', { balance: newBalance });
        }
        else {
            socket.emit('balanceUpdated', { balance: dbUser.balance });
            const room2 = (0, roomManager_1.getRoom)(roomId);
            if (room2 && room2.currentTurnIndex >= 0) {
                (0, socketHelpers_1.armTurnTimer)(roomId, true);
            }
        }
        (0, socketHelpers_1.broadcastRoom)(roomId);
        socketHelpers_1.io.emit('roomsUpdated', (0, roomManager_1.getRooms)());
    });
    socket.on('leaveRoom', async ({ roomId }) => {
        const cashOut = (0, roomManager_1.leaveRoom)(roomId, socket.id);
        socket.leave(roomId);
        if (cashOut) {
            const newBalance = await (0, db_1.applyBalanceDelta)(cashOut.userId, cashOut.chips);
            socket.emit('balanceUpdated', { balance: newBalance });
        }
        (0, socketHelpers_1.armTurnTimer)(roomId, true);
        (0, socketHelpers_1.broadcastRoom)(roomId);
        socketHelpers_1.io.emit('roomsUpdated', (0, roomManager_1.getRooms)());
    });
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        for (const r of (0, roomManager_1.getRooms)()) {
            const room = (0, roomManager_1.getRoom)(r.id);
            if (!room)
                continue;
            const p = room.players.find(pl => pl.id === socket.id && pl.isActive && !pl.hasCashedOut);
            if (!p)
                continue;
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
            (0, socketHelpers_1.broadcastRoom)(r.id);
        }
        socketHelpers_1.io.emit('roomsUpdated', (0, roomManager_1.getRooms)());
    });
};
exports.roomHandlers = roomHandlers;
