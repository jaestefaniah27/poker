import { Socket } from 'socket.io';
import { io, authUser } from '../socketHelpers';
import { claimDailyBonus, claimHourlyBonus, getUser, toPublicUser, applyBalanceDelta, recordJackpotSpin, claimFreeSpins, useFreeSpin } from '../db';
import { spinJackpot, getJackpotState } from '../jackpotEngine';

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

  socket.on('claimFreeSpinsWheel', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    const dbUser = await getUser(user.id);
    if (!dbUser) { callback({ error: 'Usuario no encontrado' }); return; }
    const now = Date.now();
    const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
    const last = dbUser.last_free_spins_claim ?? 0;
    const nextAt = last + COOLDOWN_MS;
    if (now < nextAt) { callback({ error: 'Demasiado pronto', nextClaimAt: nextAt }); return; }

    // Weighted random selection from STAKE_TIERS values
    // 1k, 5k, 10k, 25k, 50k, 100k, 250k, 500k
    const options = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000];
    const weights = [35, 25, 18, 12, 6, 3, 0.8, 0.2];
    let totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    let chosenIndex = 0;
    for (let i = 0; i < options.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        chosenIndex = i;
        break;
      }
    }
    const spinValue = options[chosenIndex];
    await claimFreeSpins(dbUser.id, spinValue);
    const updated = await getUser(dbUser.id);
    callback({ ok: true, chosenValue: spinValue, freeSpins: 10, nextClaimAt: now + COOLDOWN_MS, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('playJackpot', async ({ token, bet }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    
    const dbUser = await getUser(user.id);
    if (!dbUser) { callback({ error: 'Usuario no encontrado' }); return; }

    const hasFreeSpins = (dbUser.free_spins_left ?? 0) > 0;
    const amount = hasFreeSpins ? dbUser.free_spin_value : Math.floor(Number(bet) || 0);
    if (amount <= 0) { callback({ error: 'Apuesta inválida' }); return; }

    const { symbols, multiplier, state } = spinJackpot(dbUser.name, hasFreeSpins);
    
    let delta = 0;
    const winAmount = Math.floor(amount * multiplier);
    
    if (hasFreeSpins) {
      // Free spin does not subtract the bet amount from balance!
      delta = winAmount;
      await useFreeSpin(dbUser.id);
    } else {
      delta = winAmount - amount;
    }

    const newBalance = await applyBalanceDelta(dbUser.id, delta);
    await recordJackpotSpin(dbUser.id, amount, symbols, multiplier, winAmount);

    const updatedUser = await getUser(dbUser.id);

    if (io) {
      io.emit('jackpotStateUpdated', state);
    }

    callback({ 
      ok: true, 
      symbols, 
      multiplier, 
      winAmount, 
      newBalance, 
      state, 
      user: updatedUser ? toPublicUser(updatedUser) : undefined 
    });
  });

  socket.on('getJackpotState', (callback) => {
    callback(getJackpotState());
  });
};
