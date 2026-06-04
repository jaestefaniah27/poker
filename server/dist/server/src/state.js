"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.turnTimers = exports.sessions = exports.SESSION_TTL_MS = void 0;
exports.SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
exports.sessions = new Map(); // token -> { userId, issuedAt }
exports.turnTimers = new Map(); // roomId -> timers del turno actual
