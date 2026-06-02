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
import { getRooms, createRoom, getRoom, joinRoom, leaveRoom, rebuy, startGame, handlePlayerAction, nextHand, endRound, advanceStreet, bettingClosed, contenders } from './roomManager';
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
const BUY_IN = 1000; // Fichas que se compran al sentarse o recomprar
const REVEAL_DELAY = 1100; // ms entre revelado de calles para que se vea el progreso
const BCRYPT_ROUNDS = 10;

// Temporizador de turno
const TURN_TIME = 15000;          // tiempo base normal
const GRACE_TIME = 5000;          // gracia para jugadores conectados
const OFFLINE_REDUCED_TIME = 8000; // turno reducido para offline persistente (sin gracia)

// Sala fija que siempre está disponible para unirse
const PRESIDENTIAL_ID = 'presidential';
createRoom(PRESIDENTIAL_ID, 'Sala Presidencial', true);

// --- Sesiones: token opaco -> userId (en memoria; al reiniciar el server se piden credenciales de nuevo) ---
const sessions = new Map<string, string>(); // token -> userId

const issueToken = (userId: string): string => {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, userId);
  return token;
};

// Devuelve la fila de usuario autenticada por token, o undefined si el token no es válido.
// IMPORTANTE: las operaciones sensibles SIEMPRE resuelven la identidad por aquí, nunca por un id que mande el cliente.
const authUser = async (token: string | undefined): Promise<UserRow | undefined> => {
  if (!token) return undefined;
  const userId = sessions.get(token);
  if (!userId) return undefined;
  return getUser(userId);
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

  if (signal === 'continue') {
    armTurnTimer(roomId, true); // turno del siguiente jugador
    broadcastRoom(roomId);
  } else {
    clearTurnTimer(roomId);
    broadcastRoom(roomId); // mostramos apuestas yendo al bote
    setTimeout(() => resolveRound(roomId), REVEAL_DELAY);
  }
  return true;
};

// Resuelve una ronda tras cerrarse la apuesta. Recursivo con retardos para animar el revelado.
// Cubre TODOS los casos: fold-out, river->showdown y run-out automático cuando todos van all-in.
const resolveRound = (roomId: string) => {
  const room = getRoom(roomId);
  if (!room) return;

  // Ya resuelto (p.ej. un abandono cerró la mano en síncrono mientras corría el run-out):
  // no repetimos endRound para no borrar/duplicar ganadores ni el bote.
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

  // River cerrado: no quedan más calles que repartir -> showdown
  if (room.phase === 'river') {
    clearTurnTimer(roomId);
    advanceStreet(room); // river -> showdown
    endRound(room);
    broadcastRoom(roomId);
    return;
  }

  // Repartir la siguiente calle (el cliente anima el revelado de las cartas nuevas)
  advanceStreet(room);

  if (bettingClosed(room)) {
    // Run-out: nadie puede ya decidir nada; encadenamos calles hasta el showdown
    clearTurnTimer(roomId);
    room.currentTurnIndex = -1;
    broadcastRoom(roomId);
    setTimeout(() => resolveRound(roomId), REVEAL_DELAY);
  } else {
    // Juego normal: los jugadores actúan en la nueva calle -> arrancamos su cronómetro
    armTurnTimer(roomId, true);
    broadcastRoom(roomId);
  }
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

  socket.on('createRoom', ({ roomName }, callback) => {
    const roomId = uuidv4();
    createRoom(roomId, roomName);
    callback({ roomId });
    io.emit('roomsUpdated', getRooms()); // Actualizamos lista global
  });

  socket.on('joinRoom', async ({ roomId, token }) => {
    try {
      if (!getRoom(roomId)) return;

      // Identidad autenticada por token (no confiamos en ningún id que mande el cliente)
      const dbUser = await authUser(token);
      if (!dbUser) return;

      // Buy-in: el saldo persistente baja en BUY_IN; ese dinero pasa a ser fichas en la mesa
      const offTableBalance = dbUser.balance - BUY_IN;

      const result = joinRoom(roomId, {
        id: socket.id,
        userId: dbUser.id,
        name: dbUser.name,
        avatar: dbUser.avatar || dbUser.id,
        cards: [],
        chips: BUY_IN,
        balance: offTableBalance,
        currentBet: 0,
        hasFolded: false,
        hasActed: false,
        isActive: true,
        totalContribution: 0
      });

      if (!result) return;
      socket.join(roomId);

      if (result === 'joined') {
        // Cobramos el buy-in de forma persistente y avisamos al cliente del nuevo saldo
        const newBalance = await applyBalanceDelta(dbUser.id, -BUY_IN);
        socket.emit('balanceUpdated', { balance: newBalance });
      } else {
        // Reconexión: no se cobra, devolvemos el saldo actual
        socket.emit('balanceUpdated', { balance: dbUser.balance });
        // Si vuelve y es justo su turno, le restauramos sus tiempos normales (15s + gracia)
        const room2 = getRoom(roomId);
        if (room2 && room2.currentTurnIndex >= 0 && room2.players[room2.currentTurnIndex]?.userId === dbUser.id) {
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

      const ok = rebuy(roomId, player.userId, BUY_IN);
      if (!ok) return;

      const newBalance = await applyBalanceDelta(player.userId, -BUY_IN);
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
    clearTurnTimer(roomId);
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
      // No re-armamos el cronómetro: si era su turno, onBaseExpire ya detecta que está offline
      // (sin gracia) al dispararse. Solo avisamos a los demás de que está desconectado.
      broadcastRoom(r.id);
    }
    io.emit('roomsUpdated', getRooms());
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
