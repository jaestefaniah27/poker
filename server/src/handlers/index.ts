import { Socket } from 'socket.io';
import { authHandlers } from './authHandlers';
import { roomHandlers } from './roomHandlers';
import { gameHandlers } from './gameHandlers';
import { blackjackHandlers } from './blackjackHandlers';
import { minigameHandlers } from './minigameHandlers';
import { triviaHandlers } from './triviaHandlers';
import { crashHandlers } from './crashHandler';
import { foosballHandlers } from './foosballHandlers';
import { updateLastSeen, bumpStat } from '../db';
import { broadcastPresence } from '../socketHelpers';
import { rouletteEngine } from '../rouletteEngine';

const MAX_EVENTS_PER_SEC = 20;
const rateLimits = new Map<string, { count: number; resetAt: number }>();

const wrapCallback = (socket: Socket, eventName: string, handler: Function) => {
  return async (...args: any[]) => {
    // Rate Limiting (ignoramos el evento disconnect interno)
    if (eventName !== 'disconnect') {
      const now = Date.now();
      let tracker = rateLimits.get(socket.id);
      
      if (!tracker || now > tracker.resetAt) {
        tracker = { count: 0, resetAt: now + 1000 };
        rateLimits.set(socket.id, tracker);
      }
      
      tracker.count++;
      
      if (tracker.count > MAX_EVENTS_PER_SEC) {
        if (tracker.count === MAX_EVENTS_PER_SEC + 1) {
          console.warn(`[Rate Limit] Socket ${socket.id} spamming event '${eventName}'.`);
          socket.emit('error', 'Estás enviando demasiadas peticiones muy rápido.');
        }
        // Desconexión automática para bots extremos
        if (tracker.count > MAX_EVENTS_PER_SEC * 3) {
          console.error(`[Rate Limit] Expulsando a ${socket.id} por spam extremo.`);
          socket.disconnect(true);
        }
        return; // Abortamos la ejecución del evento
      }
    }

    try {
      await handler(...args);
    } catch (error) {
      console.error(`[Socket Error] ${socket.id} on '${eventName}':`, error);
      
      const callback = args[args.length - 1];
      if (typeof callback === 'function') {
        callback({ error: 'Internal server error' });
      } else {
        socket.emit('error', 'Ha ocurrido un error inesperado en el servidor.');
      }
    }
  };
};

export const registerAllHandlers = (socket: Socket) => {
  const connectedAt = Date.now();
  const originalOn = socket.on.bind(socket);

  socket.on = (event: string, listener: (...args: any[]) => void) => {
    return originalOn(event, wrapCallback(socket, event, listener));
  };

  // Limpieza de memoria y last seen
  socket.on('disconnect', () => {
    rateLimits.delete(socket.id);
    if (socket.data?.user?.id) {
      // Tiempo jugado: duración de la conexión del socket autenticado.
      bumpStat(socket.data.user.id, 'time_played_ms', Date.now() - connectedAt);
      rouletteEngine.leaveTable(socket.data.user.id);
      updateLastSeen(socket.data.user.id)
        .then(() => broadcastPresence())
        .catch(console.error);
    } else {
      broadcastPresence();
    }
  });

  authHandlers(socket);
  roomHandlers(socket);
  gameHandlers(socket);
  blackjackHandlers(socket);
  minigameHandlers(socket);
  triviaHandlers(socket);
  crashHandlers(socket);
  foosballHandlers(socket);
};
