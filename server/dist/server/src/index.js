"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const roomManager_1 = require("./roomManager");
const pokerEngine_1 = require("./pokerEngine");
const socketHelpers_1 = require("./socketHelpers");
const handlers_1 = require("./handlers");
const db_1 = require("./db");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
const PORT = process.env.PORT || 3001;
const INACTIVITY_LIMIT = 5 * 60 * 1000;
const OFFLINE_KICK_LIMIT = 5 * 60 * 1000;
const SWEEP_INTERVAL = 30 * 1000;
const db_2 = require("./db");
const roomManager_2 = require("./roomManager");
// Initialize io in helpers
(0, socketHelpers_1.setIo)(io);
const bootServer = async () => {
    console.log('Initializing database migrations...');
    await (0, db_2.initDB)();
    console.log('Loading saved rooms from database...');
    const savedRooms = await (0, db_2.loadRoomsFromDB)();
    for (const room of savedRooms) {
        // Reset volatile state on reboot
        const now = Date.now();
        room.players.forEach(p => { p.isOnline = false; p.offlineSince = now; });
        room.paused = true;
        room.turnStartedAt = undefined;
        room.inGrace = false;
        (0, roomManager_2.restoreRoom)(room);
    }
    (0, roomManager_2.resumeBlindTimers)();
    console.log(`Restored ${savedRooms.length} active rooms from previous session.`);
    // Salas fijas siempre disponibles, crearlas si no fueron restauradas
    if (!(0, roomManager_1.getRoom)('sala-taberna'))
        (0, roomManager_1.createRoom)('sala-taberna', 'La Taberna', true, 0);
    if (!(0, roomManager_1.getRoom)('sala-casino'))
        (0, roomManager_1.createRoom)('sala-casino', 'Casino Real', true, 4);
    if (!(0, roomManager_1.getRoom)('sala-presidencial'))
        (0, roomManager_1.createRoom)('sala-presidencial', 'Sala Presidencial', true, pokerEngine_1.STAKE_TIERS.length - 1);
    server.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
};
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    socket.emit('roomsUpdated', (0, roomManager_1.getRooms)());
    (0, handlers_1.registerAllHandlers)(socket);
});
// --- Barrido de inactividad ---
setInterval(async () => {
    const now = Date.now();
    // 1) Expulsión por jugador: cualquiera offline > OFFLINE_KICK_LIMIT
    for (const r of (0, roomManager_1.getRooms)()) {
        const room = (0, roomManager_1.getRoom)(r.id);
        if (!room)
            continue;
        const toKick = room.players.filter(p => p.isActive && !p.hasCashedOut && p.isOnline === false &&
            p.offlineSince != null && (now - p.offlineSince) >= OFFLINE_KICK_LIMIT);
        if (toKick.length === 0)
            continue;
        let kicked = 0;
        for (const p of toKick) {
            const cashOut = (0, roomManager_1.leaveRoom)(r.id, p.id);
            if (cashOut) {
                try {
                    await (0, db_1.applyBalanceDelta)(cashOut.userId, cashOut.chips);
                }
                catch (e) {
                    console.error('Error reintegrando fichas al expulsar offline:', e);
                }
            }
            kicked++;
        }
        if (kicked > 0) {
            console.log(`Sala ${r.id}: ${kicked} jugador(es) expulsado(s) por estar offline >5min`);
            (0, socketHelpers_1.broadcastRoom)(r.id);
            io.emit('roomsUpdated', (0, roomManager_1.getRooms)());
        }
    }
    // 2) Limpieza de sala entera si lleva sin actividad y nadie online
    for (const r of (0, roomManager_1.getRooms)()) {
        const room = (0, roomManager_1.getRoom)(r.id);
        if (!room || room.players.length === 0)
            continue;
        if ((0, socketHelpers_1.hasOnlinePlayers)(room))
            continue;
        if (now - (room.lastActivityAt || 0) < INACTIVITY_LIMIT)
            continue;
        (0, socketHelpers_1.clearTurnTimer)(r.id);
        const cashOuts = (0, roomManager_1.evictAll)(r.id);
        for (const c of cashOuts) {
            try {
                await (0, db_1.applyBalanceDelta)(c.userId, c.chips);
            }
            catch (e) {
                console.error('Error reintegrando fichas en limpieza por inactividad:', e);
            }
        }
        console.log(`Sala ${r.id} vaciada por inactividad: ${cashOuts.length} jugador(es) expulsado(s)`);
        (0, socketHelpers_1.broadcastRoom)(r.id);
        io.emit('roomsUpdated', (0, roomManager_1.getRooms)());
    }
}, SWEEP_INTERVAL);
bootServer();
