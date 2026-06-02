import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import {
  createUser, getUser, getUserByName, isNameTaken, applyBalanceDelta,
  setPasswordHash, updateUserName, updateUserAvatar, toPublicUser, UserRow
} from './db';
import { getRooms, createRoom, getRoom, joinRoom, leaveRoom, rebuy, startGame, handlePlayerAction, nextHand, endRound, advanceStreet, bettingClosed, contenders, touchRoom, evictAll, gatherBetsToPot } from './roomManager';
import { STAKE_TIERS, BLIND_DIVISORS, DEFAULT_BLIND_DIVISOR } from './pokerEngine';
import { Room } from './pokerEngine';
import { v4 as uuidv4 } from 'uuid';

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
const REVEAL_DELAY = 1100; // ms entre revelado de calles para que se vea el progreso
const COLLECT_DELAY = 700; // ms para que la animación de fichas al pot se complete antes de revelar cartas
const SHOWDOWN_LOCK_MS = 5000; // ms mínimos en showdown antes de permitir "next hand"
const BCRYPT_ROUNDS = 10;

// Temporizador de turno
const TURN_TIME = 15000;          // tiempo base normal
const GRACE_TIME = 5000;          // gracia para jugadores conectados
const OFFLINE_REDUCED_TIME = 8000; // turno reducido para offline persistente (sin gracia)
const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 min sin nadie conectado -> se echa a todos y la sala queda vacía
const SWEEP_INTERVAL = 30 * 1000;       // cada cuánto el barrido revisa salas inactivas

// Salas fijas siempre disponibles, una por nivel: mínima, intermedia y máxima.
// tierIndex 0 = entrada mínima (1K), 4 = intermedia (50K), 7 = máxima (500K).
createRoom('sala-taberna', 'La Taberna', true, 0);
createRoom('sala-casino', 'Casino Real', true, 4);
createRoom('sala-presidencial', 'Sala Presidencial', true, STAKE_TIERS.length - 1);

// --- Sesiones: token opaco -> userId (en memoria; al reiniciar el server se piden credenciales de nuevo) ---
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
interface SessionData { userId: string; issuedAt: number; }
const sessions = new Map<string, SessionData>(); // token -> { userId, issuedAt }

const issueToken = (userId: string): string => {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, issuedAt: Date.now() });
  return token;
};

// Devuelve la fila de usuario autenticada por token, o undefined si el token no es válido o expiró.
// IMPORTANTE: las operaciones sensibles SIEMPRE resuelven la identidad por aquí, nunca por un id que mande el cliente.
const authUser = async (token: string | undefined): Promise<UserRow | undefined> => {
  if (!token) return undefined;
  const session = sessions.get(token);
  if (!session) return undefined;
  if (Date.now() - session.issuedAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return undefined;
  }
  return getUser(session.userId);
};

app.get('/rooms', (req, res) => {
  res.json(getRooms());
});

// --- Difusión segura: cada socket recibe SOLO sus propias cartas (anti-trampa) ---
const buildRoomView = (room: Room, socketId: string) => {
  const wonByFold = room.winners?.[0]?.handName === 'Won by fold';
  return {
    ...room,
    deck: [],
    players: room.players.map(p => {
      const reveal =
        p.id === socketId ||
        (room.phase === 'showdown' && !p.hasFolded && !p.isSpectating && !wonByFold);
      return reveal ? p : { ...p, cards: [] };
    })
  };
};

// Emite el estado de la sala a cada jugador con su vista personalizada
const broadcastRoom = (roomId: string) => {
  const room = getRoom(roomId);
  if (!room) return;
  room.players.forEach(p => {
    if (p.isActive) io.to(p.id).emit('roomUpdated', buildRoomView(room, p.id));
  });
};

// =================== TEMPORIZADOR DE TURNO (autoritativo en servidor) ===================
type TurnTimer = { userId: string; turnIndex: number; base?: NodeJS.Timeout; grace?: NodeJS.Timeout };
const turnTimers = new Map<string, TurnTimer>(); // roomId -> timers del turno actual

const clearTurnTimer = (roomId: string) => {
  const t = turnTimers.get(roomId);
  if (t) {
    if (t.base) clearTimeout(t.base);
    if (t.grace) clearTimeout(t.grace);
  }
  turnTimers.delete(roomId);
};

const isBettingPhase = (room: Room) => ['preflop', 'flop', 'turn', 'river'].includes(room.phase);

// ¿Queda algún jugador realmente conectado y sentado? Si no, el juego se pausa (no malgastar CPU/timers).
const hasOnlinePlayers = (room: Room) => room.players.some(p => p.isActive && !p.hasCashedOut && p.isOnline !== false);

// Arranca (o re-arranca) el cronómetro del jugador en turno. No reinicia si ya estaba armado para el mismo jugador,
// salvo force=true (p.ej. al cambiar su estado online/offline).
const armTurnTimer = (roomId: string, force = false) => {
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

  // Nadie conectado: pausamos el juego (congelamos el turno) en vez de auto-jugar contra sillas vacías.
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
    return; // ya corriendo para este jugador; no reiniciamos su reloj
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

// Se agotó el tiempo base del turno
const onBaseExpire = (roomId: string, userId: string) => {
  const room = getRoom(roomId);
  if (!room) return;
  const idx = room.currentTurnIndex;
  const p = idx >= 0 ? room.players[idx] : undefined;
  if (!p || p.userId !== userId) return; // el turno ya cambió

  const online = p.isOnline !== false;
  if (online && (room.graceDuration || 0) > 0) {
    // Jugador conectado: avisamos y le damos la gracia antes de actuar por él
    room.inGrace = true;
    room.graceStartedAt = Date.now();
    const timer = turnTimers.get(roomId) || { userId, turnIndex: idx };
    timer.grace = setTimeout(() => applyDefaultAction(roomId, userId), room.graceDuration);
    turnTimers.set(roomId, timer);
    io.to(p.id).emit('turnWarning'); // aviso directo al jugador
    broadcastRoom(roomId);
  } else {
    // Offline: acción por defecto inmediata, sin gracia
    applyDefaultAction(roomId, userId);
  }
};

// Acción por defecto: Check si se puede (no hay que igualar), si no Fold.
const applyDefaultAction = (roomId: string, userId: string) => {
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

// Punto único por el que pasan TODAS las acciones (de jugador o por defecto): aplica, gestiona timers y difunde.
const processAction = (roomId: string, userId: string, action: string, amount?: number): boolean => {
  const signal = handlePlayerAction(roomId, userId, action, amount);
  if (!signal) return false;
  const room = getRoom(roomId);
  if (!room) return false;
  room.lastActivityAt = Date.now();

  if (signal === 'continue') {
    armTurnTimer(roomId, true); // turno del siguiente jugador
    broadcastRoom(roomId);
  } else {
    clearTurnTimer(roomId);
    // Ronda cerrada: nadie está en turno durante el intervalo de revelado.
    // Evita que el último en actuar siga viendo botones (confunde, parece que aún juega).
    room.currentTurnIndex = -1;
    broadcastRoom(roomId); // mostramos apuestas yendo al bote
    setTimeout(() => resolveRound(roomId), REVEAL_DELAY);
  }
  return true;
};

// Resuelve una ronda tras cerrarse la apuesta. Recursivo con retardos para animar el revelado.
// Secuencia: fichas vuelan al pot (COLLECT_DELAY) → cartas reveladas (REVEAL_DELAY) → siguiente calle o showdown.
// Cubre TODOS los casos: fold-out, river->showdown y run-out automático cuando todos van all-in.
const resolveRound = (roomId: string) => {
  const room = getRoom(roomId);
  if (!room) return;

  // Ya resuelto (p.ej. un abandono cerró la mano en síncrono mientras corría el run-out):
  if (room.phase === 'showdown') {
    clearTurnTimer(roomId);
    broadcastRoom(roomId);
    return;
  }

  // Mano decidida (todos menos uno han foldeado/abandonado): reparte el bote ya
  if (contenders(room).length <= 1) {
    clearTurnTimer(roomId);
    endRound(room);
    broadcastRoom(roomId);
    return;
  }

  // Paso 1: juntar apuestas al pot → broadcast (el cliente anima fichas volando al pot)
  gatherBetsToPot(room);
  broadcastRoom(roomId);

  // Paso 2: tras COLLECT_DELAY, revelar cartas (nueva calle o showdown)
  setTimeout(() => {
    const room2 = getRoom(roomId);
    if (!room2 || room2.phase === 'showdown') { broadcastRoom(roomId); return; }

    if (room2.phase === 'river') {
      clearTurnTimer(roomId);
      advanceStreet(room2); // river -> showdown
      endRound(room2);
      broadcastRoom(roomId);
      return;
    }

    // Repartir la siguiente calle
    advanceStreet(room2);

    if (bettingClosed(room2)) {
      // Run-out: nadie puede decidir nada; encadenamos calles
      clearTurnTimer(roomId);
      room2.currentTurnIndex = -1;
      broadcastRoom(roomId);
      setTimeout(() => resolveRound(roomId), REVEAL_DELAY);
    } else {
      // Juego normal: arrancamos cronómetro de la nueva calle
      armTurnTimer(roomId, true);
      broadcastRoom(roomId);
    }
  }, COLLECT_DELAY);
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Login por nombre (+ contraseña si la cuenta está protegida).
  //   - cuenta nueva  -> se crea con saldo 0 (sin contraseña)
  //   - cuenta existente sin contraseña -> entra directo
  //   - cuenta existente con contraseña -> exige contraseña correcta
  socket.on('login', async ({ name, password }, callback) => {
    try {
      const cleanName = (name || '').trim();
      if (!cleanName) { callback({ error: 'Nombre vacío' }); return; }

      let user = await getUserByName(cleanName);

      if (!user) {
        const id = uuidv4();
        await createUser(id, cleanName);
        user = await getUser(id);
      } else if (user.password_hash) {
        // Cuenta protegida: validar contraseña
        if (!password) { callback({ needPassword: true }); return; }
        const ok = await bcrypt.compare(String(password), user.password_hash);
        if (!ok) { callback({ error: 'Contraseña incorrecta' }); return; }
      }

      if (!user) { callback({ error: 'No se pudo crear el usuario' }); return; }
      const token = issueToken(user.id);
      console.log(`Login: ${user.name} -> ${user.id} (balance ${user.balance})`);
      callback({ user: toPublicUser(user), token });
    } catch (e) {
      console.error('Error during login:', e);
      callback({ error: 'Internal server error' });
    }
  });

  // Reanudar sesión tras recargar la página usando el token guardado (no requiere contraseña)
  socket.on('resumeSession', async ({ token }, callback) => {
    try {
      const user = await authUser(token);
      if (!user) { callback({ error: 'sesión no válida' }); return; }
      callback({ user: toPublicUser(user), token });
    } catch (e) {
      console.error('Error en resumeSession:', e);
      callback({ error: 'Internal server error' });
    }
  });

  // Añadir o cambiar contraseña. Si ya tenía, exige la actual.
  socket.on('setPassword', async ({ token, currentPassword, newPassword }, callback) => {
    try {
      const user = await authUser(token);
      if (!user) { callback({ error: 'No autenticado' }); return; }
      const pwd = String(newPassword || '');
      if (pwd.length < 4) { callback({ error: 'La contraseña debe tener al menos 4 caracteres' }); return; }
      if (user.password_hash) {
        const ok = await bcrypt.compare(String(currentPassword || ''), user.password_hash);
        if (!ok) { callback({ error: 'Contraseña actual incorrecta' }); return; }
      }
      const hash = await bcrypt.hash(pwd, BCRYPT_ROUNDS);
      await setPasswordHash(user.id, hash);
      const updated = await getUser(user.id);
      callback({ ok: true, user: updated ? toPublicUser(updated) : undefined });
    } catch (e) {
      console.error('Error en setPassword:', e);
      callback({ error: 'Internal server error' });
    }
  });

  // Quitar contraseña (exige la actual)
  socket.on('removePassword', async ({ token, currentPassword }, callback) => {
    try {
      const user = await authUser(token);
      if (!user) { callback({ error: 'No autenticado' }); return; }
      if (!user.password_hash) { callback({ error: 'La cuenta no tiene contraseña' }); return; }
      const ok = await bcrypt.compare(String(currentPassword || ''), user.password_hash);
      if (!ok) { callback({ error: 'Contraseña incorrecta' }); return; }
      await setPasswordHash(user.id, null);
      const updated = await getUser(user.id);
      callback({ ok: true, user: updated ? toPublicUser(updated) : undefined });
    } catch (e) {
      console.error('Error en removePassword:', e);
      callback({ error: 'Internal server error' });
    }
  });

  // Cambiar nombre (no puede chocar con otra cuenta)
  socket.on('changeName', async ({ token, newName }, callback) => {
    try {
      const user = await authUser(token);
      if (!user) { callback({ error: 'No autenticado' }); return; }
      const clean = (newName || '').trim();
      if (clean.length < 2) { callback({ error: 'Nombre demasiado corto' }); return; }
      if (await isNameTaken(clean, user.id)) { callback({ error: 'Ese nombre ya está en uso' }); return; }
      await updateUserName(user.id, clean);
      const updated = await getUser(user.id);
      callback({ ok: true, user: updated ? toPublicUser(updated) : undefined });
    } catch (e) {
      console.error('Error en changeName:', e);
      callback({ error: 'Internal server error' });
    }
  });

  // Cambiar avatar (la "semilla" con la que se genera el muñeco)
  socket.on('changeAvatar', async ({ token, avatar }, callback) => {
    try {
      const user = await authUser(token);
      if (!user) { callback({ error: 'No autenticado' }); return; }
      const seed = String(avatar || '').trim().slice(0, 64) || user.id;
      await updateUserAvatar(user.id, seed);
      const updated = await getUser(user.id);
      callback({ ok: true, user: updated ? toPublicUser(updated) : undefined });
    } catch (e) {
      console.error('Error en changeAvatar:', e);
      callback({ error: 'Internal server error' });
    }
  });

  socket.on('createRoom', ({ roomName, tierIndex, blindDivisor }, callback) => {
    const idx = Number.isInteger(tierIndex) && tierIndex >= 0 && tierIndex < STAKE_TIERS.length ? tierIndex : 0;
    const div = BLIND_DIVISORS.includes(blindDivisor) ? blindDivisor : DEFAULT_BLIND_DIVISOR;
    const roomId = uuidv4();
    createRoom(roomId, roomName, false, idx, div);
    callback({ roomId });
    io.emit('roomsUpdated', getRooms()); // Actualizamos lista global
  });

  socket.on('joinRoom', async ({ roomId, token }) => {
    try {
      const room = getRoom(roomId);
      if (!room) return;

      // Identidad autenticada por token (no confiamos en ningún id que mande el cliente)
      const dbUser = await authUser(token);
      if (!dbUser) return;

      const buyIn = room.buyIn;
      // El saldo NO bloquea: es solo un indicador de buen/mal jugador. Se permite entrar en negativo.
      const offTableBalance = dbUser.balance - buyIn;

      const result = joinRoom(roomId, {
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

      if (!result) return;
      
      if (result === 'full') {
        socket.emit('error', 'La mesa está llena (máximo 8 jugadores).');
        return;
      }
      
      socket.join(roomId);

      if (result === 'joined') {
        // Cobramos el buy-in de forma persistente y avisamos al cliente del nuevo saldo
        const newBalance = await applyBalanceDelta(dbUser.id, -buyIn);
        socket.emit('balanceUpdated', { balance: newBalance });
      } else {
        // Reconexión: no se cobra, devolvemos el saldo actual
        socket.emit('balanceUpdated', { balance: dbUser.balance });
        // Al volver, reanudamos el cronómetro del turno actual. Esto despausa el juego si estaba
        // congelado por estar todos desconectados, y restaura tiempos normales si es su propio turno.
        const room2 = getRoom(roomId);
        if (room2 && room2.currentTurnIndex >= 0) {
          armTurnTimer(roomId, true);
        }
      }

      broadcastRoom(roomId);
      io.emit('roomsUpdated', getRooms());
    } catch (e) {
      console.error('Error en joinRoom:', e);
    }
  });

  // Recompra cuando el jugador se ha quedado sin fichas
  socket.on('rebuy', async ({ roomId }) => {
    try {
      const room = getRoom(roomId);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;
      // Sin comprobación de saldo: se puede recomprar siempre, aunque deje el saldo en negativo.

      const ok = rebuy(roomId, player.userId, room.buyIn);
      if (!ok) return;

      const newBalance = await applyBalanceDelta(player.userId, -room.buyIn);
      socket.emit('balanceUpdated', { balance: newBalance });
      broadcastRoom(roomId);
      io.emit('roomsUpdated', getRooms());
    } catch (e) {
      console.error('Error en rebuy:', e);
    }
  });

  socket.on('startGame', ({ roomId }) => {
    const success = startGame(roomId);
    if (success) {
      armTurnTimer(roomId, true); // cronómetro del primer turno
      broadcastRoom(roomId);
      io.to(roomId).emit('gameStarted');
    }
  });

  socket.on('playerAction', ({ roomId, action, amount }) => {
    // La identidad la tomamos del asiento de ESTE socket, no de un id que mande el cliente
    const room = getRoom(roomId);
    const seat = room?.players.find(p => p.id === socket.id);
    if (!seat) return;
    processAction(roomId, seat.userId, action, amount);
  });

  socket.on('leaveRoom', async ({ roomId }) => {
    try {
      const cashOut = leaveRoom(roomId, socket.id);
      socket.leave(roomId);
      if (cashOut) {
        // Cash-out: las fichas restantes vuelven al saldo persistente
        const newBalance = await applyBalanceDelta(cashOut.userId, cashOut.chips);
        socket.emit('balanceUpdated', { balance: newBalance });
      }
      // El turno puede haber cambiado/terminado al irse el jugador
      armTurnTimer(roomId, true);
      broadcastRoom(roomId);
      io.emit('roomsUpdated', getRooms());
    } catch (e) {
      console.error('Error en leaveRoom:', e);
    }
  });

  socket.on('nextHand', ({ roomId }) => {
    const r = getRoom(roomId);
    // Bloqueo de 5s desde el showdown: todos deben tener tiempo de ver el resultado.
    if (r && r.phase === 'showdown' && Date.now() - (r.showdownAt || 0) < SHOWDOWN_LOCK_MS) {
      broadcastRoom(roomId);
      return;
    }
    clearTurnTimer(roomId);
    touchRoom(roomId); // empezar nueva mano cuenta como actividad
    if (nextHand(roomId)) {
      startGame(roomId); // Enlazamos iniciar la partida justo después de limpiar la mesa
      armTurnTimer(roomId, true);
      broadcastRoom(roomId);
      io.to(roomId).emit('gameStarted');
    } else {
      broadcastRoom(roomId);
    }
  });

  // Desconexión: NO se pierde el asiento ni el saldo. El jugador queda OFFLINE y conserva su sitio.
  // Sus fichas siguen en la mesa; al reconectar (mismo nombre/usuario) vuelve con todo.
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    for (const r of getRooms()) {
      const room = getRoom(r.id);
      if (!room) continue;
      const p = room.players.find(pl => pl.id === socket.id && pl.isActive && !pl.hasCashedOut);
      if (!p) continue;
      p.isOnline = false;
      // Si era el último conectado, pausamos ya: paramos el cronómetro para no auto-jugar a solas.
      if (!hasOnlinePlayers(room)) {
        clearTurnTimer(r.id);
        room.paused = true;
        room.turnStartedAt = undefined;
        room.turnDuration = undefined;
        room.inGrace = false;
      }
      // Si quedan otros conectados y era su turno, onBaseExpire detectará que está offline (sin gracia).
      broadcastRoom(r.id);
    }
    io.emit('roomsUpdated', getRooms());
  });
});

// --- Barrido de inactividad: salas sin NADIE conectado durante INACTIVITY_LIMIT se vacían por completo ---
// Devuelve las fichas de cada jugador a su saldo persistente y borra la sala (las persistentes solo se vacían).
setInterval(async () => {
  for (const r of getRooms()) {
    const room = getRoom(r.id);
    if (!room || room.players.length === 0) continue;
    if (hasOnlinePlayers(room)) continue; // alguien conectado: no se toca
    if (Date.now() - (room.lastActivityAt || 0) < INACTIVITY_LIMIT) continue;

    clearTurnTimer(r.id);
    const cashOuts = evictAll(r.id);
    for (const c of cashOuts) {
      try { await applyBalanceDelta(c.userId, c.chips); }
      catch (e) { console.error('Error reintegrando fichas en limpieza por inactividad:', e); }
    }
    console.log(`Sala ${r.id} vaciada por inactividad: ${cashOuts.length} jugador(es) expulsado(s)`);
    broadcastRoom(r.id); // por si quedara algún socket a la escucha
    io.emit('roomsUpdated', getRooms());
  }
}, SWEEP_INTERVAL);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
