import { Socket } from 'socket.io';
import { io, authUser } from '../socketHelpers';
import { claimDailyBonus, claimHourlyBonus, getUser, toPublicUser, applyBalanceDelta, recordJackpotSpin, claimFreeSpins, useFreeSpin as consumeFreeSpin, setJackpotUnlockLevel, spendLevelPoint, addXp, parsePools, addHaciendaTotal, deductIsraelPool, bumpStat, maxStat } from '../db';
import { boostMultiplier, TrackBoosts } from '../../../shared/types';
import { spinJackpot, getJackpotState } from '../jackpotEngine';
import { rouletteEngine } from '../rouletteEngine';
import { JACKPOT_TIERS, JACKPOT_UNLOCK_COSTS, ruletaOptionsFor, ruletaSpinsFor, ruletaBoostedOptions, LevelTrack, XP_PER_JACKPOT_SPIN, XP_PER_JACKPOT_WIN, XP_PER_MINES_PLAY, XP_PER_MINES_WIN } from '../../../shared/types';

interface MinesGame {
  userId: string;
  bet: number;
  numMines: number;
  minePositions: Set<number>;
  revealedSafe: Set<number>;
  active: boolean;
}

const activeMinesGames = new Map<string, MinesGame>();

function minesMultiplier(numMines: number, revealed: number): number {
  const total = 25;
  let prob = 1;
  for (let i = 0; i < revealed; i++) {
    prob *= (total - numMines - i) / (total - i);
  }
  return Math.round((0.97 / prob) * 100) / 100;
}

const wordleClaimedSlots = new Map<string, string>(); // userId → YYYY-MM-DDTHH

const jackpotViewers = new Map<string, { id: string; name: string; avatar: string; equippedAvatarDecoration?: string; equippedNameDecoration?: string; movedToAndorra?: boolean }>();

const broadcastJackpotViewers = () => {
  if (!io) return;
  const viewers = Array.from(jackpotViewers.values());
  io.emit('jackpot_viewers', viewers);
};

// --- Premio diferido del jackpot ---
// El spin descuenta la apuesta al instante pero NO acredita el premio: este
// queda "pendiente" hasta que el cliente termina la animación y emite
// 'claimJackpot'. Se rechaza el cobro antes de readyAt (bots no pueden saltar
// la animación) y se rechaza un nuevo spin mientras haya un pendiente sin
// cobrar (mata el farmeo en paralelo / acelerado).
const JACKPOT_ANIM_MS = 800;
interface PendingJackpot { readyAt: number; finalWinAmount: number; }
const pendingJackpots = new Map<string, PendingJackpot>(); // userId -> pendiente

const settlePendingJackpot = async (userId: string): Promise<{ balance: number; user: any } | null> => {
  const p = pendingJackpots.get(userId);
  if (!p) return null;
  pendingJackpots.delete(userId);
  if (p.finalWinAmount > 0) await applyBalanceDelta(userId, p.finalWinAmount);
  const u = await getUser(userId);
  return { balance: u?.balance ?? 0, user: u ? toPublicUser(u) : undefined };
};

export const minigameHandlers = (socket: Socket) => {
  socket.on('claimDaily', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    const result = await claimDailyBonus(user.id);
    if (!result.ok) { callback({ error: result.error }); return; }
    bumpStat(user.id, 'bonus_claims');
    const updated = await getUser(user.id);
    callback({ ok: true, newBalance: result.newBalance, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('getPresence', (callback) => {
    callback({
      jackpot: Array.from(jackpotViewers.values()),
      roulette: rouletteEngine.getPlayersInfo()
    });
  });

  socket.on('jackpot_join', async ({ token }) => {
    const user = await authUser(token);
    if (!user) return;
    const dbUser = await getUser(user.id);
    jackpotViewers.set(user.id, { id: user.id, name: user.name, avatar: dbUser?.avatar || user.id, equippedAvatarDecoration: dbUser?.equipped_avatar_decoration || undefined, equippedNameDecoration: dbUser?.equipped_name_decoration || undefined, movedToAndorra: !!dbUser?.moved_to_andorra });
    broadcastJackpotViewers();
  });

  socket.on('jackpot_leave', async ({ token }) => {
    const user = await authUser(token);
    if (!user) return;
    jackpotViewers.delete(user.id);
    broadcastJackpotViewers();
  });

  socket.on('disconnect', () => {
    if (socket.data?.user?.id) {
      // Liquidar premio pendiente para no perder una ganancia legítima si el
      // usuario cierra durante la animación.
      settlePendingJackpot(socket.data.user.id).catch(err => console.error('[jackpot settle on disconnect]', err));
    }
    if (socket.data?.user?.id && jackpotViewers.has(socket.data.user.id)) {
      jackpotViewers.delete(socket.data.user.id);
      broadcastJackpotViewers();
    }
  });

  socket.on('claimHourly', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    const result = await claimHourlyBonus(user.id);
    if (!result.ok) { callback({ error: result.error, nextClaimAt: result.nextClaimAt }); return; }
    bumpStat(user.id, 'bonus_claims');
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

    // Premios según el nivel de ruleta del jugador (8 valores).
    const boosts: TrackBoosts = (() => { try { const p = JSON.parse(dbUser.unlocked_boosts || '{}'); return (!Array.isArray(p) && typeof p === 'object') ? p : {}; } catch { return {}; } })();
    const options = ruletaBoostedOptions(dbUser.ruleta_level ?? 0, boosts);
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
    const earnedSpins = ruletaSpinsFor(dbUser.ruleta_level ?? 0);
    await claimFreeSpins(dbUser.id, spinValue, earnedSpins);
    bumpStat(dbUser.id, 'wheel_claims');
    const updated = await getUser(dbUser.id);
    callback({ ok: true, chosenValue: spinValue, freeSpins: earnedSpins, nextClaimAt: now + COOLDOWN_MS, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('playJackpot', async ({ token, bet, useFreeSpin }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const dbUser = await getUser(user.id);
    if (!dbUser) { callback({ error: 'Usuario no encontrado' }); return; }

    // Tirada anterior sin cobrar: si ya pasó su animación la liquidamos ahora;
    // si no, bloqueamos el nuevo spin (anti-spam / anti-acelerado).
    const prevPending = pendingJackpots.get(dbUser.id);
    if (prevPending) {
      if (Date.now() >= prevPending.readyAt) {
        await settlePendingJackpot(dbUser.id);
      } else {
        callback({ error: 'Espera a que termine la tirada anterior' });
        return;
      }
    }

    const pools = parsePools(dbUser.free_spins_pools ?? null);
    const amount = Math.floor(Number(bet) || 0);
    const doFreeSpin = Boolean(useFreeSpin) && amount > 0 && (pools[String(amount)] || 0) > 0;
    const unlockLevel = dbUser.jackpot_unlock_level ?? 0;

    if (!doFreeSpin && unlockLevel === 0) {
      callback({ error: 'Jackpot bloqueado. Desbloquéalo primero.' });
      return;
    }
    if (amount <= 0) { callback({ error: 'Apuesta inválida' }); return; }

    // Validate bet tier is within unlock level (paid spins only)
    if (!doFreeSpin) {
      const tierIndex = JACKPOT_TIERS.indexOf(amount);
      if (tierIndex === -1 || tierIndex >= unlockLevel) {
        callback({ error: 'Nivel de apuesta no desbloqueado' });
        return;
      }
      // No se permite apostar por encima del saldo (saldo ya no puede ser
      // negativo). Releemos el saldo por si un settle previo acaba de acreditar.
      const fresh = await getUser(dbUser.id);
      if (!fresh || fresh.balance < amount) { callback({ error: 'Saldo insuficiente' }); return; }
    }

    const isBot = dbUser.is_bot === 1 || socket.data.isDynamicBot;
    // Castigamos al bot el 90% de las veces forzando una pérdida
    const forceLoss = isBot && Math.random() < 0.90;

    let { symbols, multiplier, state } = spinJackpot(dbUser.name, doFreeSpin, amount, forceLoss);

    let winAmount = Math.floor(amount * multiplier);
    let finalWinAmount = winAmount;
    let taxAmount = 0;
    let eventType: 'none' | 'tax' | 'fraud' = 'none';

    if (multiplier >= 10) {
      let probFraud = 0.01;
      let probTax = 0.20;
      if (dbUser.moved_to_andorra) {
        probFraud /= 10;
        probTax /= 10;
      }
      const r = Math.random();
      if (r < probFraud) {
        eventType = 'fraud';
        taxAmount = winAmount;
        finalWinAmount = 0;
      } else if (r < probFraud + probTax) {
        eventType = 'tax';
        taxAmount = Math.floor(winAmount * 0.1);
        finalWinAmount = winAmount - taxAmount;
      }
    }

    let israelBonus = 0;
    if (finalWinAmount > 0 && dbUser.israel_pool && dbUser.israel_pool > 0) {
      israelBonus = await deductIsraelPool(dbUser.id, finalWinAmount);
      finalWinAmount += israelBonus;
    }

    // Solo descontamos la apuesta ahora; el premio (finalWinAmount) se acredita
    // al cobrar (claimJackpot) cuando termina la animación en el cliente.
    let delta = 0;
    if (doFreeSpin) {
      await consumeFreeSpin(dbUser.id, amount);
    } else {
      delta = -amount;
    }

    if (taxAmount > 0) {
      const newTotal = await addHaciendaTotal(taxAmount);
      if (io) io.emit('haciendaUpdated', { total: newTotal });
    }

    const newBalance = await applyBalanceDelta(dbUser.id, delta);
    pendingJackpots.set(dbUser.id, { readyAt: Date.now() + JACKPOT_ANIM_MS, finalWinAmount });
    await recordJackpotSpin(dbUser.id, amount, symbols, multiplier, winAmount);

    bumpStat(dbUser.id, 'jackpot_spins');
    if (!doFreeSpin) bumpStat(dbUser.id, 'jackpot_total_bet', amount);
    if (finalWinAmount > 0) {
      bumpStat(dbUser.id, 'jackpot_total_won', finalWinAmount);
      maxStat(dbUser.id, 'jackpot_biggest_win', finalWinAmount);
    }
    maxStat(dbUser.id, 'jackpot_best_mult_x100', Math.round(multiplier * 100));
    if (taxAmount > 0) bumpStat(dbUser.id, 'jackpot_tax_paid', taxAmount);
    if (eventType === 'fraud') bumpStat(dbUser.id, 'jackpot_frauds');

    let extraXp = 0;
    if (multiplier >= 50) extraXp = 500;
    else if (multiplier >= 20) extraXp = 50;
    else if (multiplier >= 10) extraXp = 20;
    else if (multiplier > 0) extraXp = XP_PER_JACKPOT_WIN;

    const addedXp = XP_PER_JACKPOT_SPIN + extraXp;
    await addXp(dbUser.id, addedXp);

    const updatedUser = await getUser(dbUser.id);

    if (io) {
      io.emit('jackpotStateUpdated', state);
    }

    callback({ 
      ok: true, 
      symbols, 
      multiplier, 
      winAmount, 
      finalWinAmount,
      taxEvent: { type: eventType, amount: taxAmount },
      newBalance, 
      state, 
      user: updatedUser ? toPublicUser(updatedUser) : undefined,
      addedXp
    });
  });

  socket.on('getJackpotState', (callback) => {
    callback(getJackpotState());
  });

  // Cobro del premio diferido: el cliente lo llama al terminar la animación.
  socket.on('claimJackpot', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback?.({ error: 'No autenticado' }); return; }
    const p = pendingJackpots.get(user.id);
    if (!p) { callback?.({ ok: true, nothing: true }); return; }
    if (Date.now() < p.readyAt) { callback?.({ error: 'Aún no', waitMs: p.readyAt - Date.now() }); return; }
    const r = await settlePendingJackpot(user.id);
    callback?.({ ok: true, newBalance: r?.balance, user: r?.user });
  });

  socket.on('spendLevelPoint', async ({ token, track }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    const valid: LevelTrack[] = ['paguita', 'dieta', 'ruleta', 'trivia'];
    if (!valid.includes(track)) { callback({ error: 'Mejora inválida' }); return; }
    const result = await spendLevelPoint(user.id, track as LevelTrack);
    if (!result.ok) { callback({ error: result.error }); return; }
    const updated = await getUser(user.id);
    callback({ ok: true, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('unlockJackpotLevel', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const dbUser = await getUser(user.id);
    if (!dbUser) { callback({ error: 'Usuario no encontrado' }); return; }

    const currentLevel = dbUser.jackpot_unlock_level ?? 0;
    if (currentLevel >= JACKPOT_TIERS.length) {
      callback({ error: 'Ya tienes el nivel máximo' });
      return;
    }

    const cost = JACKPOT_UNLOCK_COSTS[currentLevel];
    if (dbUser.balance < cost) {
      callback({ error: 'Saldo insuficiente para desbloquear este nivel' });
      return;
    }
    await applyBalanceDelta(dbUser.id, -cost);
    await setJackpotUnlockLevel(dbUser.id, currentLevel + 1);

    const updated = await getUser(dbUser.id);
    callback({ ok: true, newLevel: currentLevel + 1, user: updated ? toPublicUser(updated) : undefined });
  });

  // --- MINES ---
  socket.on('minesStart', async ({ token, bet, numMines }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const nm = Math.floor(Number(numMines));
    const betAmt = Math.floor(Number(bet));
    if (nm < 1 || nm > 24) { callback({ error: 'Minas inválidas (1-24)' }); return; }
    if (betAmt <= 0) { callback({ error: 'Apuesta inválida' }); return; }
    if (user.balance < betAmt) { callback({ error: 'Saldo insuficiente' }); return; }

    activeMinesGames.delete(socket.id);

    const positions = new Set<number>();
    while (positions.size < nm) {
      positions.add(Math.floor(Math.random() * 25));
    }

    await applyBalanceDelta(user.id, -betAmt);
    await addXp(user.id, XP_PER_MINES_PLAY);
    bumpStat(user.id, 'mines_games');
    bumpStat(user.id, 'mines_total_bet', betAmt);

    activeMinesGames.set(socket.id, {
      userId: user.id,
      bet: betAmt,
      numMines: nm,
      minePositions: positions,
      revealedSafe: new Set(),
      active: true,
    });

    const dbUser = await getUser(user.id);
    callback({ ok: true, newBalance: dbUser?.balance, user: dbUser ? toPublicUser(dbUser) : undefined });
  });

  socket.on('minesReveal', async ({ token, cell }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const game = activeMinesGames.get(socket.id);
    if (!game || !game.active) { callback({ error: 'Sin partida activa' }); return; }
    if (game.userId !== user.id) { callback({ error: 'No autorizado' }); return; }

    const cellIdx = Math.floor(Number(cell));
    if (cellIdx < 0 || cellIdx > 24) { callback({ error: 'Celda inválida' }); return; }
    if (game.revealedSafe.has(cellIdx)) { callback({ error: 'Ya revelada' }); return; }

    if (game.minePositions.has(cellIdx)) {
      game.active = false;
      activeMinesGames.delete(socket.id);
      bumpStat(user.id, 'mines_bombs');
      callback({ ok: true, safe: false, minePositions: Array.from(game.minePositions), hitCell: cellIdx });
      return;
    }

    game.revealedSafe.add(cellIdx);
    const revealed = game.revealedSafe.size;
    const multiplier = minesMultiplier(game.numMines, revealed);
    const winnable = Math.floor(game.bet * multiplier);

    const safeTiles = 25 - game.numMines;
    if (revealed === safeTiles) {
      game.active = false;
      activeMinesGames.delete(socket.id);
      
      const dbUser = await getUser(user.id);
      let finalWinnable = winnable;
      let israelBonus = 0;
      if (dbUser && dbUser.israel_pool && dbUser.israel_pool > 0) {
        israelBonus = await deductIsraelPool(user.id, winnable);
        finalWinnable += israelBonus;
      }

      const newBalance = await applyBalanceDelta(user.id, finalWinnable);
      const xpWin = XP_PER_MINES_WIN + (multiplier >= 10 ? 20 : multiplier >= 5 ? 10 : 0);
      await addXp(user.id, xpWin);
      bumpStat(user.id, 'mines_cashouts');
      bumpStat(user.id, 'mines_total_won', finalWinnable);
      maxStat(user.id, 'mines_biggest_win', finalWinnable);
      maxStat(user.id, 'mines_best_mult_x100', Math.round(multiplier * 100));
      const updatedUser = await getUser(user.id);
      callback({ ok: true, safe: true, multiplier, winnable: finalWinnable, autoWin: true, newBalance, minePositions: Array.from(game.minePositions), user: updatedUser ? toPublicUser(updatedUser) : undefined, addedXp: xpWin });
      return;
    }

    callback({ ok: true, safe: true, multiplier, winnable, revealedCount: revealed });
  });

  socket.on('minesCashout', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const game = activeMinesGames.get(socket.id);
    if (!game || !game.active) { callback({ error: 'Sin partida activa' }); return; }
    if (game.revealedSafe.size === 0) { callback({ error: 'Debes revelar al menos una celda' }); return; }

    const multiplier = minesMultiplier(game.numMines, game.revealedSafe.size);
    const winAmount = Math.floor(game.bet * multiplier);

    game.active = false;
    activeMinesGames.delete(socket.id);

    const dbUser = await getUser(user.id);
    let finalWinAmount = winAmount;
    let israelBonus = 0;
    if (dbUser && dbUser.israel_pool && dbUser.israel_pool > 0) {
      israelBonus = await deductIsraelPool(user.id, winAmount);
      finalWinAmount += israelBonus;
    }

    const newBalance = await applyBalanceDelta(user.id, finalWinAmount);
    const xpWin = XP_PER_MINES_WIN + (multiplier >= 10 ? 20 : multiplier >= 5 ? 10 : 0);
    await addXp(user.id, xpWin);
    bumpStat(user.id, 'mines_cashouts');
    bumpStat(user.id, 'mines_total_won', finalWinAmount);
    maxStat(user.id, 'mines_biggest_win', finalWinAmount);
    maxStat(user.id, 'mines_best_mult_x100', Math.round(multiplier * 100));
    const updatedUser = await getUser(user.id);
    callback({ ok: true, winAmount: finalWinAmount, multiplier, newBalance, minePositions: Array.from(game.minePositions), user: updatedUser ? toPublicUser(updatedUser) : undefined, addedXp: xpWin });
  });

  socket.on('disconnect', () => {
    activeMinesGames.delete(socket.id);
  });

  // --- ROULETTE ---
  socket.on('roulette_sync', async ({ token }, callback) => {
    const state = rouletteEngine.getState();
    const user = await authUser(token);
    let myBets = {};
    if (user) {
      myBets = rouletteEngine.getBets(user.id);
    }
    callback({ ok: true, state, myBets });
  });

  socket.on('roulette_join', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback?.({ error: 'No autenticado' }); return; }
    const dbUser = await getUser(user.id);
    rouletteEngine.joinTable(user.id, user.name, dbUser?.avatar || user.id, dbUser?.equipped_name_decoration || undefined, dbUser?.equipped_avatar_decoration || undefined, !!dbUser?.moved_to_andorra);
    callback?.({ ok: true });
  });

  socket.on('roulette_leave', async ({ token }) => {
    const user = await authUser(token);
    if (!user) return;
    rouletteEngine.leaveTable(user.id);
  });

  socket.on('roulette_place_bet', async ({ token, bets }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const totalBet = Object.values(bets as Record<string, number>).reduce((a, b) => a + b, 0);
    if (totalBet <= 0) { callback({ error: 'Apuesta inválida' }); return; }

    const dbUser = await getUser(user.id);
    if (!dbUser || dbUser.balance < totalBet) { callback({ error: 'Saldo insuficiente' }); return; }

    const timeRemainingMs = rouletteEngine.phaseEndsAt - Date.now();
    if (rouletteEngine.phase !== 'betting' || timeRemainingMs <= 5000) {
      callback({ error: 'No va más' }); return;
    }

    await applyBalanceDelta(user.id, -totalBet);
    rouletteEngine.placeBet(user.id, bets as Record<string, number>);
    
    const updatedUser = await getUser(user.id);
    // Broadcast updated player list so others see the bet total change
    socket.broadcast.emit('roulette_players', rouletteEngine.getState().players);
    callback({ ok: true, balance: updatedUser?.balance });
  });

  socket.on('roulette_clear_bets', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const timeRemainingMs = rouletteEngine.phaseEndsAt - Date.now();
    if (rouletteEngine.phase !== 'betting' || timeRemainingMs <= 5000) {
      callback({ error: 'No se pueden cancelar las apuestas ahora' }); return;
    }

    const refund = rouletteEngine.clearBets(user.id);
    if (refund > 0) {
      await applyBalanceDelta(user.id, refund);
    }
    
    const updatedUser = await getUser(user.id);
    callback({ ok: true, balance: updatedUser?.balance });
  });

  // --- WORDLE ---
  socket.on('wordleComplete', async ({ token, won, attempts }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const slot = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    if (wordleClaimedSlots.get(user.id) === slot) {
      callback({ error: 'Ya reclamaste el premio de esta hora' }); return;
    }
    wordleClaimedSlots.set(user.id, slot);
    bumpStat(user.id, 'wordle_games');

    if (!won) { callback({ ok: true, reward: 0 }); return; }

    const prizes = [5_000_000, 1_000_000, 500_000, 100_000, 50_000, 10_000];
    const reward = prizes[Math.min(Math.max(Number(attempts) - 1, 0), prizes.length - 1)];

    bumpStat(user.id, 'wordle_wins');
    bumpStat(user.id, 'wordle_total_won', reward);
    const newBalance = await applyBalanceDelta(user.id, reward);
    await addXp(user.id, 25);
    const dbUser = await getUser(user.id);
    callback({ ok: true, reward, newBalance, user: dbUser ? toPublicUser(dbUser) : undefined });
  });
};
