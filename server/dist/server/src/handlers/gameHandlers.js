"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gameHandlers = void 0;
const roomManager_1 = require("../roomManager");
const socketHelpers_1 = require("../socketHelpers");
const db_1 = require("../db");
const gameHandlers = (socket) => {
    socket.on('rebuy', async ({ roomId }) => {
        const room = (0, roomManager_1.getRoom)(roomId);
        if (!room)
            return;
        if (room.isTournament)
            return; // En torneo no hay recompra: busted = espectador
        const player = room.players.find(p => p.id === socket.id);
        if (!player)
            return;
        const ok = (0, roomManager_1.rebuy)(roomId, player.userId, room.buyIn);
        if (!ok)
            return;
        const newBalance = await (0, db_1.applyBalanceDelta)(player.userId, -room.buyIn);
        socket.emit('balanceUpdated', { balance: newBalance });
        (0, socketHelpers_1.broadcastRoom)(roomId);
        socketHelpers_1.io.emit('roomsUpdated', (0, roomManager_1.getRooms)());
    });
    socket.on('startGame', ({ roomId }) => {
        const success = (0, roomManager_1.startGame)(roomId);
        if (success) {
            (0, socketHelpers_1.armTurnTimer)(roomId, true);
            (0, socketHelpers_1.broadcastRoom)(roomId);
            socketHelpers_1.io.to(roomId).emit('gameStarted');
        }
    });
    socket.on('playerAction', ({ roomId, action, amount }) => {
        const room = (0, roomManager_1.getRoom)(roomId);
        const seat = room?.players.find(p => p.id === socket.id);
        if (!seat)
            return;
        (0, socketHelpers_1.processAction)(roomId, seat.userId, action, amount);
    });
    socket.on('nextHand', ({ roomId }) => {
        const r = (0, roomManager_1.getRoom)(roomId);
        if (!r)
            return;
        if (r.phase === 'showdown' && Date.now() - (r.showdownAt || 0) < socketHelpers_1.SHOWDOWN_LOCK_MS) {
            (0, socketHelpers_1.broadcastRoom)(roomId);
            return;
        }
        // Modo torneo: registrar orden de eliminación y comprobar fin (winner-takes-all)
        if (r.isTournament) {
            (0, roomManager_1.markBustedPlayers)(roomId);
            const end = (0, roomManager_1.checkTournamentEnd)(roomId);
            if (end.ended) {
                r.tournamentEnded = true;
                r.phase = 'waiting';
                (0, roomManager_1.clearBlindTimer)(roomId);
                (0, socketHelpers_1.clearTurnTimer)(roomId);
                (0, socketHelpers_1.broadcastRoom)(roomId);
                socketHelpers_1.io.to(roomId).emit('tournamentEnded', { roomId });
                socketHelpers_1.io.emit('roomsUpdated', (0, roomManager_1.getRooms)());
                return;
            }
        }
        (0, socketHelpers_1.clearTurnTimer)(roomId);
        (0, roomManager_1.touchRoom)(roomId);
        if ((0, roomManager_1.nextHand)(roomId)) {
            (0, roomManager_1.startGame)(roomId);
            (0, socketHelpers_1.armTurnTimer)(roomId, true);
            (0, socketHelpers_1.broadcastRoom)(roomId);
            socketHelpers_1.io.to(roomId).emit('gameStarted');
        }
        else {
            (0, socketHelpers_1.broadcastRoom)(roomId);
        }
    });
    // Reiniciar torneo terminado con la misma config (solo el admin = primer jugador)
    socket.on('restartTournament', async ({ roomId }) => {
        const room = (0, roomManager_1.getRoom)(roomId);
        if (!room || !room.isTournament || !room.tournamentEnded)
            return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player || room.players[0]?.userId !== player.userId)
            return;
        const deltas = (0, roomManager_1.restartTournament)(roomId);
        for (const d of deltas) {
            if (d.delta !== 0) {
                const newBalance = await (0, db_1.applyBalanceDelta)(d.userId, d.delta);
                socketHelpers_1.io.to(d.socketId).emit('balanceUpdated', { balance: newBalance });
            }
        }
        (0, socketHelpers_1.clearTurnTimer)(roomId);
        (0, socketHelpers_1.broadcastRoom)(roomId);
        socketHelpers_1.io.emit('roomsUpdated', (0, roomManager_1.getRooms)());
    });
};
exports.gameHandlers = gameHandlers;
