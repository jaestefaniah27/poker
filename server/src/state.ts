export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface SessionData { userId: string; issuedAt: number; }
export const sessions = new Map<string, SessionData>(); // token -> { userId, issuedAt }

export type TurnTimer = { userId: string; turnIndex: number; base?: NodeJS.Timeout; grace?: NodeJS.Timeout };
export const turnTimers = new Map<string, TurnTimer>(); // roomId -> timers del turno actual
