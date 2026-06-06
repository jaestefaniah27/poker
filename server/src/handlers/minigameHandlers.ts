import { Socket } from 'socket.io';
import { authUser } from '../socketHelpers';
import { claimDailyBonus, claimHourlyBonus, getUser, toPublicUser, applyBalanceDelta, recordJackpotSpin } from '../db';
import { spinJackpot } from '../jackpotEngine';

export const minigameHandlers = (socket: Socket) => {
  socket.on('claimDaily', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    const result = await claimDailyBonus(user.id);
    if (!result.ok) { callback({ error: result.error }); return; }
    const updated = await getUser(user.id);
    callback({ ok: true, newBalance: result.newBalance, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('claimHourly', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    const result = await claimHourlyBonus(user.id);
    if (!result.ok) { callback({ error: result.error, nextClaimAt: result.nextClaimAt }); return; }
    const updated = await getUser(user.id);
    callback({ ok: true, newBalance: result.newBalance, nextClaimAt: result.nextClaimAt, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('playJackpot', async ({ token, bet }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    const amount = Math.floor(Number(bet) || 0);
    if (amount <= 0) { callback({ error: 'Apuesta inválida' }); return; }

    const { symbols, multiplier } = spinJackpot();
    const winAmount = Math.floor(amount * multiplier);
    const delta = winAmount - amount;
    const newBalance = await applyBalanceDelta(user.id, delta);
    await recordJackpotSpin(user.id, amount, symbols, multiplier, winAmount);

    callback({ ok: true, symbols, multiplier, winAmount, newBalance });
  });
};
