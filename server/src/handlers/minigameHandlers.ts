import { Socket } from 'socket.io';
import { io, authUser } from '../socketHelpers';
import { claimDailyBonus, claimHourlyBonus, getUser, toPublicUser, applyBalanceDelta, recordJackpotSpin, claimFreeSpins, useFreeSpin as consumeFreeSpin, setJackpotUnlockLevel, spendLevelPoint, addXp, parsePools, getEffectivePools, addHaciendaTotal, deductIsraelPool, bumpStat, maxStat, dbRun } from '../db';
import { boostMultiplier, TrackBoosts, toBig } from '../../../shared/types';
import { spinJackpot, getJackpotState, persistJackpotState } from '../jackpotEngine';
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

const settlePendingJackpot = async (userId: string): Promise<{ balance: string; user: any } | null> => {
  const p = pendingJackpots.get(userId);
  if (!p) return null;
  pendingJackpots.delete(userId);
  if (p.finalWinAmount > 0) await applyBalanceDelta(userId, p.finalWinAmount);
  const u = await getUser(userId);
  return { balance: u?.balance ?? '0', user: u ? toPublicUser(u) : undefined };
};

export const minigameHandlers = (socket: Socket) => {
  socket.on('claimDaily', async ({ token }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }
    const dbUser = await getUser(user.id);
    if (dbUser && toBig(dbUser.israel_debt) > 0n) { callback({ error: 'Debes saldar tu deuda con Israel antes de cobrar la paguita' }); return; }
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
    const dbUser = await getUser(user.id);
    if (dbUser && toBig(dbUser.israel_debt) > 0n) { callback({ error: 'Debes saldar tu deuda con Israel antes de cobrar la dieta' }); return; }
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

    if (toBig(dbUser.israel_debt) > 0n) {
      callback({ error: 'Debes saldar tu deuda con Israel antes de tirar la ruleta' });
      return;
    }
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

    if (toBig(dbUser.israel_debt) > 0n) {
      callback({ error: 'Debes saldar tu deuda con Israel para poder jugar a la Jackpot' });
      return;
    }

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
      if (!fresh || toBig(fresh.balance) < toBig(amount)) { callback({ error: 'Saldo insuficiente' }); return; }
    }

    // Solo se castiga si el Admin lo ha marcado manualmente Y ADEMÁS está usando el script
    const isBot = dbUser.is_bot === 1 && socket.data.isDynamicBot;
    const isCursed = dbUser.is_cursed === 1;
    
    // Castigamos al bot el 90% de las veces forzando una pérdida.
    // A los gafados les metemos una mala suerte "sutil": 60% de las veces que iban a ganar, forzamos a perder.
    const forceLoss = (isBot && Math.random() < 0.90) || (isCursed && Math.random() < 0.60);

    let { symbols, multiplier, state } = spinJackpot(dbUser.name, doFreeSpin, amount, forceLoss);

    let winAmount = Math.floor(amount * multiplier);
    let finalWinAmount = winAmount;
    let taxAmount = 0;
    let eventType: 'none' | 'tax' | 'fraud' = 'none';

    if (multiplier >= 10) {
      let probFraud = 0.01;
      let probTax = 0.20;
      if (isCursed) {
        probFraud = 0.20;
        probTax = 0.50;
      }
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
    if (finalWinAmount > 0 && toBig(dbUser.israel_pool) > 0n) {
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

    let addedXp = 0;
    if (multiplier >= 50) addedXp = 50;
    else if (multiplier >= 20) addedXp = 20;
    else if (multiplier >= 10) addedXp = 10;

    if (addedXp > 0) {
      await addXp(dbUser.id, addedXp);
    }

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
    if (toBig(dbUser.balance) < toBig(cost)) {
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
    
    const dbUserLocal = await getUser(user.id);
    if (dbUserLocal && toBig(dbUserLocal.israel_debt) > 0n) {
      callback({ error: 'Debes saldar tu deuda con Israel para poder jugar a las Minas' });
      return;
    }

    const nm = Math.floor(Number(numMines));
    const betAmt = Math.floor(Number(bet));
    if (nm < 1 || nm > 24) { callback({ error: 'Minas inválidas (1-24)' }); return; }
    if (betAmt <= 0) { callback({ error: 'Apuesta inválida' }); return; }
    if (toBig(user.balance) < toBig(betAmt)) { callback({ error: 'Saldo insuficiente' }); return; }

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

    const dbUser = await getUser(user.id);
    const isCursed = dbUser?.is_cursed === 1;

    // Sutil mala suerte en las minas: si lleva más de 1 revelada, 30% de que pise mina mágica
    let hitMine = game.minePositions.has(cellIdx);
    if (isCursed && !hitMine && game.revealedSafe.size >= 1) {
      if (Math.random() < 0.30) {
        hitMine = true;
        // Movemos una mina aquí
        const mineArray = Array.from(game.minePositions);
        const firstMine = mineArray[0];
        if (firstMine !== undefined) {
          game.minePositions.delete(firstMine);
          game.minePositions.add(cellIdx);
        }
      }
    }

    if (hitMine) {
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
      if (dbUser && toBig(dbUser.israel_pool) > 0n) {
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
    if (dbUser && toBig(dbUser.israel_pool) > 0n) {
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
    
    const dbUserLocal = await getUser(user.id);
    if (dbUserLocal && toBig(dbUserLocal.israel_debt) > 0n) {
      callback({ error: 'Debes saldar tu deuda con Israel para poder apostar en la Ruleta' });
      return;
    }

    const totalBet = Object.values(bets as Record<string, number>).reduce((a, b) => a + b, 0);
    if (totalBet <= 0) { callback({ error: 'Apuesta inválida' }); return; }

    const dbUser = await getUser(user.id);
    if (!dbUser || toBig(dbUser.balance) < toBig(totalBet)) { callback({ error: 'Saldo insuficiente' }); return; }

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
    
    const dbUserLocal = await getUser(user.id);
    if (dbUserLocal && toBig(dbUserLocal.israel_debt) > 0n) {
      callback({ error: 'Debes saldar tu deuda con Israel' });
      return;
    }

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

  // ── Artilugio: tirar tiradas en serie según un PLAN ordenado del cliente ──
  // plan: Array<{ tier, count, paid }> — orden exacto de ejecución elegido por el
  // jugador. Solo se consumen/cobran las entradas incluidas; el resto del pool se
  // conserva (evita el bug "fantasma" de limpiar todas las tiradas gratis).
  socket.on('artilugioSpinAll', async ({ token, plan }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const dbUser = await getUser(user.id);
    if (!dbUser) { callback({ error: 'Usuario no encontrado' }); return; }
    if (!dbUser.has_artilugio) { callback({ error: 'No tienes el Artilugio' }); return; }
    if (toBig(dbUser.israel_debt) > 0n) {
      callback({ error: 'Debes saldar tu deuda con Israel para poder usar el Artilugio' }); return;
    }

    const unlockLevel = dbUser.jackpot_unlock_level ?? 0;
    const pools = getEffectivePools(dbUser);                 // tiradas gratis disponibles
    const remaining: Record<string, number> = { ...pools };  // se decrementa al consumir gratis
    const planArr: Array<{ tier: number; count: number; paid: boolean }> = Array.isArray(plan) ? plan : [];

    // Validar plan + construir spinList EN EL ORDEN dado (sin reordenar)
    const spinList: Array<{ amount: number; paid: boolean }> = [];
    let totalPaidCost = 0n;
    // Conteo de gratis pedidas por tier para validar contra el pool
    const freeReq: Record<string, number> = {};
    for (const e of planArr) {
      const tier = Math.floor(Number(e?.tier));
      const count = Math.floor(Number(e?.count));
      const paid = Boolean(e?.paid);
      if (!Number.isInteger(count) || count < 1) { callback({ error: 'Entrada de plan inválida' }); return; }
      if (paid) {
        const idx = JACKPOT_TIERS.indexOf(tier);
        if (idx === -1 || idx >= unlockLevel) { callback({ error: 'Nivel de apuesta no desbloqueado' }); return; }
        if (count > 100) { callback({ error: 'Cantidad inválida (1–100)' }); return; }
        totalPaidCost += toBig(tier) * BigInt(count);
      } else {
        freeReq[String(tier)] = (freeReq[String(tier)] || 0) + count;
        if (freeReq[String(tier)] > (pools[String(tier)] || 0)) {
          callback({ error: 'No tienes tantas tiradas gratis de ese valor' }); return;
        }
      }
      for (let i = 0; i < count; i++) spinList.push({ amount: tier, paid });
    }

    if (spinList.length === 0) { callback({ error: 'No hay tiradas que lanzar' }); return; }

    // Saldo no puede ser negativo: exigir saldo >= coste pagadas (releer fresco)
    if (totalPaidCost > 0n) {
      const fresh = await getUser(dbUser.id);
      if (!fresh || toBig(fresh.balance) < totalPaidCost) { callback({ error: 'Saldo insuficiente' }); return; }
    }

    // Descontar las gratis consumidas del pool restante
    for (const [tier, c] of Object.entries(freeReq)) {
      remaining[tier] = (remaining[tier] || 0) - c;
      if (remaining[tier] <= 0) delete remaining[tier];
    }

    const isCursed = dbUser.is_cursed === 1;
    const isBot = dbUser.is_bot === 1 && socket.data.isDynamicBot;

    const spins: Array<{ value: number; symbols: string[]; multiplier: number; winAmount: number; finalWinAmount: number; paid: boolean; taxEvent: { type: string; amount: number } }> = [];
    let totalWin = 0n;            // BigInt: tiers altos desbordan number al acumular
    let lastState: any = null;
    let hasIsraelPool = toBig(dbUser.israel_pool) > 0n;
    let totalTax = 0;            // telemetría hacienda (number, tolera imprecisión)
    let totalXp = 0;
    // Acumulamos estadísticas sin tocar DB en el loop
    let statSpins = 0;
    let statTotalWon = 0;
    let statBiggestWin = 0;
    let statTaxPaid = 0;
    let statFrauds = 0;
    let statBestMult = 0;

    for (const { amount, paid } of spinList) {
      const forceLoss = (isBot && Math.random() < 0.90) || (isCursed && Math.random() < 0.60);
      // isFreeSpin = !paid; deferSave = true (cada tirada incrementa globalSpins en
      // memoria → distancias reales; persistimos a DB una sola vez al final del lote)
      const { symbols, multiplier, state } = spinJackpot(dbUser.name, !paid, amount, forceLoss, true);
      lastState = state;

      let winAmount = Math.floor(amount * multiplier);
      let finalWinAmount = winAmount;
      let taxAmount = 0;
      let eventType: 'none' | 'tax' | 'fraud' = 'none';

      if (multiplier >= 10) {
        let probFraud = isCursed ? 0.20 : 0.01;
        let probTax   = isCursed ? 0.50 : 0.20;
        if (dbUser.moved_to_andorra) { probFraud /= 10; probTax /= 10; }
        const r = Math.random();
        if (r < probFraud) {
          eventType = 'fraud'; taxAmount = winAmount; finalWinAmount = 0;
        } else if (r < probFraud + probTax) {
          eventType = 'tax'; taxAmount = Math.floor(winAmount * 0.1); finalWinAmount = winAmount - taxAmount;
        }
      }

      if (finalWinAmount > 0 && hasIsraelPool) {
        const bonus = await deductIsraelPool(dbUser.id, finalWinAmount);
        finalWinAmount += bonus;
        if (bonus === 0) hasIsraelPool = false;
      }

      totalTax += taxAmount;
      totalWin += BigInt(finalWinAmount);

      // Solo registrar en historial si hay premio — evita enterrar wins en N pérdidas
      if (winAmount > 0) await recordJackpotSpin(dbUser.id, amount, symbols as [string, string, string], multiplier, winAmount);

      statSpins++;
      if (finalWinAmount > 0) {
        statTotalWon += finalWinAmount;
        if (finalWinAmount > statBiggestWin) statBiggestWin = finalWinAmount;
      }
      if (taxAmount > 0) statTaxPaid += taxAmount;
      if (eventType === 'fraud') statFrauds++;
      const multX100 = Math.round(multiplier * 100);
      if (multX100 > statBestMult) statBestMult = multX100;

      if (multiplier >= 50) totalXp += 50;
      else if (multiplier >= 20) totalXp += 20;
      else if (multiplier >= 10) totalXp += 10;

      spins.push({ value: amount, symbols, multiplier, winAmount, finalWinAmount, paid, taxEvent: { type: eventType, amount: taxAmount } });
    }

    // Un solo applyBalanceDelta con el neto (premios − coste pagadas) → un solo
    // leaderboardUpdated → sin rate-limit. BigInt para no perder precisión.
    const netDelta = totalWin - totalPaidCost;
    if (netDelta !== 0n) await applyBalanceDelta(dbUser.id, netDelta);
    // globalSpins ya subió N en memoria (1 por tirada) → distancias reales en el
    // historial. Persistimos a DB una sola vez aquí (no por tirada).
    await persistJackpotState();
    if (totalXp > 0) await addXp(dbUser.id, totalXp);

    // Stats en batch
    if (statSpins > 0) bumpStat(dbUser.id, 'jackpot_spins', statSpins);
    if (totalPaidCost > 0n) bumpStat(dbUser.id, 'jackpot_total_bet', Number(totalPaidCost));
    if (statTotalWon > 0) { bumpStat(dbUser.id, 'jackpot_total_won', statTotalWon); maxStat(dbUser.id, 'jackpot_biggest_win', statBiggestWin); }
    if (statTaxPaid > 0) bumpStat(dbUser.id, 'jackpot_tax_paid', statTaxPaid);
    if (statFrauds > 0) bumpStat(dbUser.id, 'jackpot_frauds', statFrauds);
    maxStat(dbUser.id, 'jackpot_best_mult_x100', statBestMult);

    // Un solo broadcast al terminar
    if (totalTax > 0) {
      const newTotal = await addHaciendaTotal(totalTax);
      if (io) io.emit('haciendaUpdated', { total: newTotal });
    }
    if (io && lastState) io.emit('jackpotStateUpdated', lastState);

    // Guardar pool restante (solo se consumieron las gratis lanzadas). Las columnas
    // legacy se consolidan a 0 porque getEffectivePools ya las fundió en remaining.
    await dbRun('UPDATE users SET free_spins_pools = ?, free_spins_left = 0, free_spin_value = 0 WHERE id = ?', [JSON.stringify(remaining), dbUser.id]);

    const updatedUser = await getUser(dbUser.id);
    callback({ ok: true, spins, totalWin: totalWin.toString(), totalPaidCost: totalPaidCost.toString(), newPools: remaining, user: updatedUser ? toPublicUser(updatedUser) : undefined });
  });

  // ── Artilugio: conjurar tiradas ────────────────────────────────────────────
  socket.on('artilugioConjure', async ({ token, selectedTiers }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const dbUser = await getUser(user.id);
    if (!dbUser) { callback({ error: 'Usuario no encontrado' }); return; }
    if (!dbUser.has_artilugio) { callback({ error: 'No tienes el Artilugio' }); return; }

    if (!Array.isArray(selectedTiers) || selectedTiers.length === 0) {
      callback({ error: 'Selecciona al menos un grupo de tiradas' }); return;
    }

    const pools = getEffectivePools(dbUser);
    let combinedValue = 0;
    let consumedLegacy = false;

    for (const tier of selectedTiers) {
      const tierKey = String(tier);
      const count = pools[tierKey] || 0;
      if (count === 0) { callback({ error: `No tienes tiradas de ${tier}` }); return; }
      combinedValue += Number(tier) * count;
      // Si era tirada legacy (no estaba en free_spins_pools JSON), marcar para limpiar legacy
      const rawPools = parsePools(dbUser.free_spins_pools ?? null);
      if (!rawPools[tierKey] && (dbUser.free_spins_left ?? 0) > 0 && String(dbUser.free_spin_value) === tierKey) {
        consumedLegacy = true;
      }
      delete pools[tierKey];
    }

    if (combinedValue <= 0) { callback({ error: 'Valor combinado inválido' }); return; }

    // Añadir la tirada conjurada al pool (acumular si ya existe)
    pools[String(combinedValue)] = (pools[String(combinedValue)] || 0) + 1;

    if (consumedLegacy) {
      await dbRun('UPDATE users SET free_spins_pools = ?, free_spins_left = 0, free_spin_value = 0 WHERE id = ?', [JSON.stringify(pools), dbUser.id]);
    } else {
      await dbRun('UPDATE users SET free_spins_pools = ? WHERE id = ?', [JSON.stringify(pools), dbUser.id]);
    }

    const updatedUser = await getUser(dbUser.id);
    callback({ ok: true, combinedValue, newPools: pools, user: updatedUser ? toPublicUser(updatedUser) : undefined });
  });
};
