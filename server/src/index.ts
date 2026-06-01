import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createUser, getUser } from './db';
import { getRooms, createRoom, getRoom, joinRoom, leaveRoom, startGame, handlePlayerAction, applyPhaseAdvance, nextHand } from './roomManager';
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

app.get('/rooms', (req, res) => {
  res.json(getRooms());
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Evento de Login / Registro rápido
  socket.on('login', async ({ userId, name }, callback) => {
    try {
      console.log(`Login attempt: userId=${userId}, name=${name}`);
      let id = userId || uuidv4();
      await createUser(id, name);
      const user = await getUser(id);
      console.log(`User created/fetched:`, user);
      callback({ user });
    } catch (e) {
      console.error('Error during login:', e);
      callback({ error: 'Internal server error' });
    }
  });

  socket.on('createRoom', ({ roomName }, callback) => {
    const roomId = uuidv4();
    createRoom(roomId, roomName);
    callback({ roomId });
    io.emit('roomsUpdated', getRooms()); // Actualizamos lista global
  });

  socket.on('joinRoom', ({ roomId, user }) => {
    const success = joinRoom(roomId, {
      id: socket.id,
      userId: user.id,
      name: user.name,
      cards: [],
      chips: user.balance || 1000, // Dar fichas iniciales temporales si es 0 (o recuento total)
      currentBet: 0,
      hasFolded: false,
      hasActed: false,
      isActive: true,
      totalContribution: 0
    });
    
    if (success) {
      socket.join(roomId);
      io.to(roomId).emit('roomUpdated', getRoom(roomId));
      io.emit('roomsUpdated', getRooms());
    }
  });

  socket.on('startGame', ({ roomId }) => {
    const success = startGame(roomId);
    if (success) {
      const room = getRoom(roomId);
      // Ocultar el mazo a los clientes para evitar trampas
      const roomSafe = { ...room, deck: [] };
      io.to(roomId).emit('roomUpdated', roomSafe);
      io.to(roomId).emit('gameStarted');
    }
  });

  socket.on('playerAction', ({ roomId, userId, action, amount }) => {
    const signal = handlePlayerAction(roomId, userId, action, amount);
    if (!signal) return;

    const room = getRoom(roomId);
    if (!room) return;

    if (signal === 'continue') {
      // Normal turn advance — emit immediately
      io.to(roomId).emit('roomUpdated', { ...room, deck: [] });
    } else {
      // Round is ending: emit current state first (bets visible for 1.1s), then advance
      io.to(roomId).emit('roomUpdated', { ...room, deck: [] });
      setTimeout(() => {
        applyPhaseAdvance(room, signal);
        io.to(roomId).emit('roomUpdated', { ...room, deck: [] });
      }, 1100);
    }
  });

  socket.on('nextHand', ({ roomId }) => {
    if (nextHand(roomId)) {
      startGame(roomId); // Enlazamos iniciar la partida justo después de limpiar la mesa
      const room = getRoom(roomId);
      const roomSafe = { ...room, deck: [] };
      io.to(roomId).emit('roomUpdated', roomSafe);
      io.to(roomId).emit('gameStarted');
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // Iterar por salas para quitar al usuario (Simplificado)
    const rooms = getRooms();
    rooms.forEach(r => {
      leaveRoom(r.id, socket.id);
      io.to(r.id).emit('roomUpdated', getRoom(r.id));
    });
    io.emit('roomsUpdated', getRooms());
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
