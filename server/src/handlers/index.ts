import { Socket } from 'socket.io';
import { authHandlers } from './authHandlers';
import { roomHandlers } from './roomHandlers';
import { gameHandlers } from './gameHandlers';

const wrapCallback = (socket: Socket, handler: Function) => {
  return async (...args: any[]) => {
    try {
      await handler(...args);
    } catch (error) {
      console.error(`[Socket Error] ${socket.id}:`, error);
      
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
  // Override socket.on to automatically wrap all event listeners with our error handler
  const originalOn = socket.on.bind(socket);
  
  socket.on = (event: string, listener: (...args: any[]) => void) => {
    // Don't wrap internal socket.io events like 'disconnect' unless needed, 
    // but wrapping them is generally safe since we catch and log.
    return originalOn(event, wrapCallback(socket, listener));
  };

  authHandlers(socket);
  roomHandlers(socket);
  gameHandlers(socket);
};
