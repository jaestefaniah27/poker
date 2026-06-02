import { Socket } from 'socket.io';
import { authHandlers } from './authHandlers';
import { roomHandlers } from './roomHandlers';
import { gameHandlers } from './gameHandlers';
import { tournamentHandlers } from './tournamentHandlers';

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
  const originalOn = socket.on.bind(socket);
  
  socket.on = (event: string, listener: (...args: any[]) => void) => {
    return originalOn(event, wrapCallback(socket, event, listener));
  };

  // Limpieza de memoria
  socket.on('disconnect', () => {
    rateLimits.delete(socket.id);
  });

  authHandlers(socket);
  roomHandlers(socket);
  gameHandlers(socket);
  tournamentHandlers(socket);
};
