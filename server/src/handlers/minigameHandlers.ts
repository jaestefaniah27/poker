import { Socket } from 'socket.io';
import { io, authUser } from '../socketHelpers';
import { claimDailyBonus, claimHourlyBonus, getUser, toPublicUser, applyBalanceDelta, recordJackpotSpin, claimFreeSpins, useFreeSpin as consumeFreeSpin, setJackpotUnlockLevel, spendLevelPoint, addXp, parsePools } from '../db';
import { spinJackpot, getJackpotState } from '../jackpotEngine';
import { JACKPOT_TIERS, JACKPOT_UNLOCK_COSTS, ruletaOptionsFor, ruletaSpinsFor, LevelTrack, XP_PER_JACKPOT_SPIN, XP_PER_JACKPOT_WIN, XP_PER_MINES_PLAY, XP_PER_MINES_WIN } from '../../../shared/types';

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

    // Premios según el nivel de ruleta del jugador (8 valores).
    const options = ruletaOptionsFor(dbUser.ruleta_level ?? 0);
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
    const earnedSpins = ruletaSpinsFor(dbUser.ruleta_level ?? 0);
    callback({ ok: true, chosenValue: spinValue, freeSpins: earnedSpins, nextClaimAt: now + COOLDOWN_MS, user: updated ? toPublicUser(updated) : undefined });
  });

  socket.on('playJackpot', async ({ token, bet, useFreeSpin }, callback) => {
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const dbUser = await getUser(user.id);
    if (!dbUser) { callback({ error: 'Usuario no encontrado' }); return; }

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
    }

    const { symbols, multiplier, state } = spinJackpot(dbUser.name, doFreeSpin, amount);

    let delta = 0;
    const winAmount = Math.floor(amount * multiplier);

    if (doFreeSpin) {
      delta = winAmount;
      await consumeFreeSpin(dbUser.id, amount);
    } else {
      delta = winAmount - amount;
    }

    const newBalance = await applyBalanceDelta(dbUser.id, delta);
    await recordJackpotSpin(dbUser.id, amount, symbols, multiplier, winAmount);

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
      newBalance, 
      state, 
      user: updatedUser ? toPublicUser(updatedUser) : undefined,
      addedXp
    });
  });

  socket.on('getJackpotState', (callback) => {
    callback(getJackpotState());
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

    activeMinesGames.delete(socket.id);

    const positions = new Set<number>();
    while (positions.size < nm) {
      positions.add(Math.floor(Math.random() * 25));
    }

    await applyBalanceDelta(user.id, -betAmt);
    await addXp(user.id, XP_PER_MINES_PLAY);

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
      const newBalance = await applyBalanceDelta(user.id, winnable);
      const xpWin = XP_PER_MINES_WIN + (multiplier >= 10 ? 20 : multiplier >= 5 ? 10 : 0);
      await addXp(user.id, xpWin);
      const dbUser = await getUser(user.id);
      callback({ ok: true, safe: true, multiplier, winnable, autoWin: true, newBalance, minePositions: Array.from(game.minePositions), user: dbUser ? toPublicUser(dbUser) : undefined, addedXp: xpWin });
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

    const newBalance = await applyBalanceDelta(user.id, winAmount);
    const xpWin = XP_PER_MINES_WIN + (multiplier >= 10 ? 20 : multiplier >= 5 ? 10 : 0);
    await addXp(user.id, xpWin);
    const dbUser = await getUser(user.id);
    callback({ ok: true, winAmount, multiplier, newBalance, minePositions: Array.from(game.minePositions), user: dbUser ? toPublicUser(dbUser) : undefined, addedXp: xpWin });
  });

  socket.on('disconnect', () => {
    activeMinesGames.delete(socket.id);
  });

  // --- ROULETTE ---
  socket.on('play_roulette', async (bets, callback) => {
    // In minigames token might not be explicitly passed inside bets, so we use socket.handshake or assume client passes it in the socket wrapper.
    // Wait, client emits `socket.emit('play_roulette', bets, ...)` so token is NOT in the payload. We need to get it from socket auth.
    // Wait, other minigames pass { token, ... }.
    // If I didn't pass token in the frontend: `socket.emit('play_roulette', bets, ...)`
    // I need to change frontend to send `{ token, bets }` OR I just use the token from handshake. But let's check how Lobby.tsx does it:
    // It calls `socket.emit('play_roulette', bets, (res) => ...)` so `bets` is the first arg.
    // The auth is available in `socket.handshake.auth.token`. But for consistency, let me just assume the client can send it in `socket.auth.token` or similar. Let's use `socket.handshake.auth.token`.
    // Wait, in `poker/client/src/utils.ts`, it does: `export const socket = io(..., { auth: { token: getStorage().getItem('token') } })`. So `socket.handshake.auth.token` is ALWAYS VALID!
    
    const token = socket.handshake.auth?.token;
    const user = await authUser(token);
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const totalBet = Object.values(bets as Record<string, number>).reduce((a, b) => a + b, 0);
    if (totalBet <= 0) { callback({ error: 'Apuesta inválida' }); return; }

    const dbUser = await getUser(user.id);
    if (!dbUser || dbUser.balance < totalBet) { callback({ error: 'Saldo insuficiente' }); return; }

    await applyBalanceDelta(user.id, -totalBet);

    const resultNum = Math.floor(Math.random() * 37); // 0-36
    const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
    let winnings = 0;

    for (const [zone, amt] of Object.entries(bets as Record<string, number>)) {
      if (zone === resultNum.toString()) winnings += amt * 36;
      else if (zone === 'red' && RED_NUMS.has(resultNum)) winnings += amt * 2;
      else if (zone === 'black' && resultNum !== 0 && !RED_NUMS.has(resultNum)) winnings += amt * 2;
      else if (zone === 'even' && resultNum !== 0 && resultNum % 2 === 0) winnings += amt * 2;
      else if (zone === 'odd' && resultNum % 2 !== 0) winnings += amt * 2;
      else if (zone === 'low' && resultNum >= 1 && resultNum <= 18) winnings += amt * 2;
      else if (zone === 'high' && resultNum >= 19 && resultNum <= 36) winnings += amt * 2;
      else if (zone.startsWith('dozen')) {
        const d = parseInt(zone.split('_')[1]);
        if (Math.ceil(resultNum / 12) === d && resultNum !== 0) winnings += amt * 3;
      }
      else if (zone.startsWith('col')) {
        const c = parseInt(zone.split('_')[1]); // 1, 2, 3
        if ((resultNum - c) % 3 === 0 && resultNum !== 0) winnings += amt * 3;
      }
    }

    let newBalance = dbUser.balance - totalBet;
    if (winnings > 0) {
      newBalance = await applyBalanceDelta(user.id, winnings);
    }
    
    await addXp(user.id, 10 + (winnings > totalBet ? 20 : 0));

    callback({ 
      ok: true, 
      result: resultNum, 
      winnings, 
      net: winnings - totalBet,
      balance: newBalance 
    });
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

    if (!won) { callback({ ok: true, reward: 0 }); return; }

    const prizes = [5_000_000, 1_000_000, 500_000, 100_000, 50_000, 10_000];
    const reward = prizes[Math.min(Math.max(Number(attempts) - 1, 0), prizes.length - 1)];

    const newBalance = await applyBalanceDelta(user.id, reward);
    await addXp(user.id, 25);
    const dbUser = await getUser(user.id);
    callback({ ok: true, reward, newBalance, user: dbUser ? toPublicUser(dbUser) : undefined });
  });
};
