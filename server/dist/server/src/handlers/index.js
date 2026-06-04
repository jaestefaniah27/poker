"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAllHandlers = void 0;
const authHandlers_1 = require("./authHandlers");
const roomHandlers_1 = require("./roomHandlers");
const gameHandlers_1 = require("./gameHandlers");
const MAX_EVENTS_PER_SEC = 20;
const rateLimits = new Map();
const wrapCallback = (socket, eventName, handler) => {
    return async (...args) => {
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
        }
        catch (error) {
            console.error(`[Socket Error] ${socket.id} on '${eventName}':`, error);
            const callback = args[args.length - 1];
            if (typeof callback === 'function') {
                callback({ error: 'Internal server error' });
            }
            else {
                socket.emit('error', 'Ha ocurrido un error inesperado en el servidor.');
            }
        }
    };
};
const registerAllHandlers = (socket) => {
    const originalOn = socket.on.bind(socket);
    socket.on = (event, listener) => {
        return originalOn(event, wrapCallback(socket, event, listener));
    };
    // Limpieza de memoria
    socket.on('disconnect', () => {
        rateLimits.delete(socket.id);
    });
    (0, authHandlers_1.authHandlers)(socket);
    (0, roomHandlers_1.roomHandlers)(socket);
    (0, gameHandlers_1.gameHandlers)(socket);
};
exports.registerAllHandlers = registerAllHandlers;
