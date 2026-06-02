import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { getRooms, createRoom, getRoom, evictAll } from './roomManager';
import { STAKE_TIERS } from './pokerEngine';
import { setIo, clearTurnTimer, broadcastRoom, hasOnlinePlayers } from './socketHelpers';
import { registerAllHandlers } from './handlers';
import { applyBalanceDelta } from './db';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;
const INACTIVITY_LIMIT = 5 * 60 * 1000;
const SWEEP_INTERVAL = 30 * 1000;

import { initDB, loadRoomsFromDB } from './db';
import { restoreRoom } from './roomManager';

// Initialize io in helpers
setIo(io);

const bootServer = async () => {
  console.log('Initializing database migrations...');
  await initDB();

  console.log('Loading saved rooms from database...');
  const savedRooms = await loadRoomsFromDB();
  
  for (const room of savedRooms) {
    // Reset volatile state on reboot
    room.players.forEach(p => p.isOnline = false);
    room.paused = true;
    room.turnStartedAt = undefined;
    room.inGrace = false;
    restoreRoom(room);
  }
  console.log(`Restored ${savedRooms.length} active rooms from previous session.`);

  // Salas fijas siempre disponibles, crearlas si no fueron restauradas
  if (!getRoom('sala-taberna')) createRoom('sala-taberna', 'La Taberna', true, 0);
  if (!getRoom('sala-casino')) createRoom('sala-casino', 'Casino Real', true, 4);
  if (!getRoom('sala-presidencial')) createRoom('sala-presidencial', 'Sala Presidencial', true, STAKE_TIERS.length - 1);

  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  socket.emit('roomsUpdated', getRooms());
  registerAllHandlers(socket);
});

// --- Barrido de inactividad ---
setInterval(async () => {
  for (const r of getRooms()) {
    const room = getRoom(r.id);
    if (!room || room.players.length === 0) continue;
    if (hasOnlinePlayers(room)) continue;
    if (Date.now() - (room.lastActivityAt || 0) < INACTIVITY_LIMIT) continue;

    clearTurnTimer(r.id);
    const cashOuts = evictAll(r.id);
    for (const c of cashOuts) {
      try { await applyBalanceDelta(c.userId, c.chips); }
      catch (e) { console.error('Error reintegrando fichas en limpieza por inactividad:', e); }
    }
    console.log(`Sala ${r.id} vaciada por inactividad: ${cashOuts.length} jugador(es) expulsado(s)`);
    broadcastRoom(r.id);
    io.emit('roomsUpdated', getRooms());
  }
}, SWEEP_INTERVAL);

bootServer();
