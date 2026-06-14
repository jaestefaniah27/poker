import { Socket } from 'socket.io';
import { authUser } from '../socketHelpers';
import { getUser, toPublicUser, applyBalanceDelta, bumpStat, maxStat } from '../db';
import { JACKPOT_TIERS, toBig } from '../../../shared/types';

interface CrashGame {
  userId: string;
  bet: number;
  crashPoint: number;
  startedAt: number;
  active: boolean;
}

const activeCrashGames = new Map<string, CrashGame>(); // socketId → game

const TICK_MS = 100;

function generateCrashPoint(): number {
  const r = Math.random();
  if (r < 0.01) return 1.00;
  return Math.round(Math.max(1.01, 0.97 / (1 - r)) * 100) / 100;
}

function calcMultiplier(elapsed: number): number {
  return Math.round(Math.pow(Math.E, 0.07 * elapsed / 1000) * 100) / 100;
}

// Global tick — processes all active games
setInterval(() => {
  if (activeCrashGames.size === 0) return;
  const now = Date.now();
  activeCrashGames.forEach((game, socketId) => {
    const elapsed = now - game.startedAt;
    const m = calcMultiplier(elapsed);
    const { io } = require('../socketHelpers');
    if (!io) return;
    if (m >= game.crashPoint) {
      game.active = false;
      activeCrashGames.delete(socketId);
      io.to(socketId).emit('crashTick', { multiplier: game.crashPoint, crashed: true });
    } else {
      io.to(socketId).emit('crashTick', { multiplier: m, crashed: false });
    }
  });
}, TICK_MS);

export const crashHandlers = (socket: Socket) => {
  socket.on('crashStart', async ({ token, bet }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    if (activeCrashGames.has(socket.id)) { callback({ error: 'Ya tienes una partida activa' }); return; }

    const betAmt = Math.floor(Number(bet));
    if (betAmt <= 0 || !JACKPOT_TIERS.includes(betAmt)) { callback({ error: 'Apuesta inválida' }); return; }
    if (toBig(user.balance) < toBig(betAmt)) { callback({ error: 'Saldo insuficiente' }); return; }

    await applyBalanceDelta(user.id, -betAmt);
    bumpStat(user.id, 'crash_games');
    bumpStat(user.id, 'crash_total_bet', betAmt);
    const dbUser = await getUser(user.id);

    activeCrashGames.set(socket.id, {
      userId: user.id,
      bet: betAmt,
      crashPoint: generateCrashPoint(),
      startedAt: Date.now(),
      active: true,
    });

    callback({ ok: true, newBalance: dbUser?.balance });
  });

  socket.on('crashCashout', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const game = activeCrashGames.get(socket.id);
    if (!game || !game.active) { callback({ error: 'Sin partida activa' }); return; }
    if (game.userId !== user.id) { callback({ error: 'No autorizado' }); return; }

    const elapsed = Date.now() - game.startedAt;
    const m = calcMultiplier(elapsed);
    const winAmount = Math.floor(game.bet * m);

    game.active = false;
    activeCrashGames.delete(socket.id);

    const newBalance = await applyBalanceDelta(user.id, winAmount);
    bumpStat(user.id, 'crash_cashouts');
    bumpStat(user.id, 'crash_total_won', winAmount);
    maxStat(user.id, 'crash_biggest_win', winAmount);
    maxStat(user.id, 'crash_best_mult_x100', Math.round(m * 100));
    const dbUser = await getUser(user.id);
    callback({ ok: true, multiplier: m, winAmount, newBalance, user: dbUser ? toPublicUser(dbUser) : undefined });
  });

  socket.on('disconnect', () => {
    activeCrashGames.delete(socket.id);
  });
};
