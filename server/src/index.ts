import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { getRooms, createRoom, getRoom, evictAll, leaveRoom } from './roomManager';
import { STAKE_TIERS } from './pokerEngine';
import { setIo, clearTurnTimer, broadcastRoom, hasOnlinePlayers, turnWatchdog } from './socketHelpers';
import { registerAllHandlers } from './handlers';
import { applyBalanceDelta } from './db';

// --- Handlers globales para que un fallo aislado no tumbe el server ---
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

const app = express();
app.use(cors());
app.use(express.json());

const SERVER_STARTED_AT = Date.now();
app.get('/health', (_req, res) => {
  const rooms = getRooms();
  res.json({
    ok: true,
    uptimeMs: Date.now() - SERVER_STARTED_AT,
    rooms: rooms.length,
    activePlayers: rooms.reduce((s, r) => s + r.playerCount, 0),
    memMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  // Tolerar blips de red en móvil (cambio WiFi↔datos, app en background).
  // Si el server tarda en responder a un ping por una pausa breve del event-loop,
  // damos margen antes de cerrar el socket. Cliente sigue mostrando "conectando"
  // hasta recibir respuesta, pero la sesión no se pierde.
  pingInterval: 20000,
  pingTimeout: 30000
});

const PORT = process.env.PORT || 3001;
const INACTIVITY_LIMIT = 5 * 60 * 1000;
const OFFLINE_KICK_LIMIT = 5 * 60 * 1000;
const SWEEP_INTERVAL = 30 * 1000;

import { initDB, loadRoomsFromDB } from './db';
import { restoreRoom, resumeBlindTimers } from './roomManager';
import { loadJackpotState } from './jackpotEngine';

// Initialize io in helpers
setIo(io);

const bootServer = async () => {
  console.log('Initializing database migrations...');
  await initDB();

  console.log('Loading jackpot state...');
  await loadJackpotState();

  console.log('Loading saved rooms from database...');
  const savedRooms = await loadRoomsFromDB();
  
  for (const room of savedRooms) {
    // Reset volatile state on reboot
    const now = Date.now();
    room.players.forEach(p => { p.isOnline = false; p.offlineSince = now; });
    room.paused = true;
    room.turnStartedAt = undefined;
    room.inGrace = false;
    if (room.gameType === 'blackjack') {
      room.bjPhase = 'waiting';
      room.bjTurnUserId = undefined;
      room.bettingDeadline = undefined;
      room.dealerCards = [];
      room.players.forEach(p => { p.bet = 0; p.bjStatus = 'idle'; p.cards = []; });
    }
    restoreRoom(room);
  }
  
  resumeBlindTimers();
  
  console.log(`Restored ${savedRooms.length} active rooms from previous session.`);

  // Salas fijas siempre disponibles, crearlas si no fueron restauradas
  if (!getRoom('sala-taberna')) createRoom('sala-taberna', 'La Taberna', true, 0);
  if (!getRoom('sala-casino')) createRoom('sala-casino', 'Casino Real', true, 4);
  if (!getRoom('sala-presidencial')) createRoom('sala-presidencial', 'Sala Presidencial', true, STAKE_TIERS.length - 1);
  // Mesa de blackjack permanente: buy-in libre por jugador. Apuesta mín 25, sin tope (cap = tu stack).
  const BJ_NO_CAP = Number.MAX_SAFE_INTEGER;
  if (!getRoom('sala-blackjack')) createRoom('sala-blackjack', 'BlackJack', true, 0, undefined, undefined, 'blackjack', 25, BJ_NO_CAP);
  // Forzar límites actuales aunque la sala venga restaurada de la BD con valores antiguos
  const bjRoom = getRoom('sala-blackjack');
  if (bjRoom) { bjRoom.minBet = 25; bjRoom.maxBet = BJ_NO_CAP; }

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
  const now = Date.now();

  // 1) Expulsión por jugador: cualquiera offline > OFFLINE_KICK_LIMIT
  for (const r of getRooms()) {
    const room = getRoom(r.id);
    if (!room) continue;
    const toKick = room.players.filter(p =>
      p.isActive && !p.hasCashedOut && p.isOnline === false &&
      p.offlineSince != null && (now - p.offlineSince) >= OFFLINE_KICK_LIMIT
    );
    if (toKick.length === 0) continue;

    let kicked = 0;
    for (const p of toKick) {
      const cashOut = leaveRoom(r.id, p.id);
      if (cashOut) {
        try { await applyBalanceDelta(cashOut.userId, cashOut.chips); }
        catch (e) { console.error('Error reintegrando fichas al expulsar offline:', e); }
      }
      kicked++;
    }
    if (kicked > 0) {
      console.log(`Sala ${r.id}: ${kicked} jugador(es) expulsado(s) por estar offline >5min`);
      broadcastRoom(r.id);
      io.emit('roomsUpdated', getRooms());
    }
  }

  // 2) Limpieza de sala entera si lleva sin actividad y nadie online
  for (const r of getRooms()) {
    const room = getRoom(r.id);
    if (!room || room.players.length === 0) continue;
    if (hasOnlinePlayers(room)) continue;
    if (now - (room.lastActivityAt || 0) < INACTIVITY_LIMIT) continue;

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

// --- Watchdog de turnos: re-arma timers muertos cada 3s ---
const WATCHDOG_INTERVAL = 3 * 1000;
setInterval(() => {
  try { turnWatchdog(); }
  catch (e) { console.error('[Watchdog] error:', e); }
}, WATCHDOG_INTERVAL);

// --- Monitor de event-loop: si bloquea >500ms, log con stack.
// Causa típica de "conectando al servidor" simultáneo en todos los clientes.
const LOOP_CHECK = 200;
const LOOP_BLOCK_THRESHOLD = 500;
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const drift = now - lastTick - LOOP_CHECK;
  if (drift > LOOP_BLOCK_THRESHOLD) {
    console.warn(`[event-loop] bloqueado ${drift}ms — investigar último handler/timer activo.`);
  }
  lastTick = now;
}, LOOP_CHECK).unref();

// --- Shutdown graceful ---
const SHUTDOWN_COUNTDOWN = 8; // segundos de aviso antes de cerrar
let isShuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[${signal}] graceful shutdown en ${SHUTDOWN_COUNTDOWN}s...`);

  // 1. Avisar a todos los clientes
  io.emit('serverRestarting', { seconds: SHUTDOWN_COUNTDOWN });

  // 2. Esperar a que vean el aviso
  await new Promise(r => setTimeout(r, SHUTDOWN_COUNTDOWN * 1000));

  // 3. Devolver fichas a todos los jugadores activos en todas las salas
  let totalCashOuts = 0;
  for (const r of getRooms()) {
    const cashOuts = evictAll(r.id);
    for (const c of cashOuts) {
      try {
        await applyBalanceDelta(c.userId, c.chips);
        totalCashOuts++;
      } catch (e) {
        console.error(`[shutdown] error devolviendo fichas a ${c.userId}:`, e);
      }
    }
  }
  console.log(`[shutdown] ${totalCashOuts} cashout(s) procesados`);

  // 4. Notificar cierre definitivo y esperar propagación
  io.emit('serverShutdown');
  await new Promise(r => setTimeout(r, 500));

  // 5. Cerrar server
  server.close(() => {
    console.log('Server cerrado. Saliendo.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 3000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

bootServer().catch(err => {
  console.error('Fallo arrancando server:', err);
  process.exit(1);
});
