import { Socket } from 'socket.io';
import { authUser } from '../socketHelpers';
import { claimDailyBonus, claimHourlyBonus, getUser, toPublicUser } from '../db';

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
};
