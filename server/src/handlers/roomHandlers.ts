import { Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { getRooms, createRoom, getRoom, joinRoom, leaveRoom } from '../roomManager';
import { STAKE_TIERS, BLIND_DIVISORS, DEFAULT_BLIND_DIVISOR } from '../pokerEngine';
import { authUser, broadcastRoom, armTurnTimer, clearTurnTimer, io } from '../socketHelpers';
import { applyBalanceDelta, getUser, toPublicUser } from '../db';
import { levelFromXp, m, gt, lte, sub, toStr, toNum } from '../../../shared/types';
import { sanitizeInput } from '../security';
import { maybeStartBlackjack, handleBlackjackLeave, clearBlackjackTimers } from './blackjackHandlers';

export const roomHandlers = (socket: Socket) => {
  socket.on('createRoom', ({ roomName, tierIndex, blindDivisor, blindLevelDuration, gameType, minBet, maxBet, isProportional }, callback) => {
    const cleanRoomName = sanitizeInput(roomName?.trim() || 'Sala sin nombre');
    const idx = Number.isInteger(tierIndex) && tierIndex >= 0 && tierIndex < STAKE_TIERS.length ? tierIndex : 0;
    const div = BLIND_DIVISORS.includes(blindDivisor) ? blindDivisor : DEFAULT_BLIND_DIVISOR;
    const dur = Number.isFinite(blindLevelDuration) && blindLevelDuration > 0 ? Math.floor(blindLevelDuration) : 0;
    const gt = gameType === 'blackjack' ? 'blackjack' : 'poker';
    const safeMin = Number.isFinite(minBet) && minBet > 0 ? Math.floor(minBet) : undefined;
    const safeMax = Number.isFinite(maxBet) && maxBet > 0 ? Math.floor(maxBet) : undefined;
    const isProp = !!isProportional;
    const roomId = uuidv4();
    createRoom(roomId, cleanRoomName, false, idx, div, dur, gt, safeMin, safeMax, isProp);
    callback({ roomId });
    io.emit('roomsUpdated', getRooms());
  });

  socket.on('joinRoom', async ({ roomId, token, buyInAmount }) => {
    const room = getRoom(roomId);
    if (!room) return;

    const dbUser = await authUser(token);
    if (!dbUser) return;

    // BlackJack: buy-in elegido por el jugador (saldo solo indicativo, puede quedar negativo).
    // Poker Proporcional: buy-in elegido por el jugador.
    // Poker Normal: buy-in fijo de la mesa.
    const isBJ = room.gameType === 'blackjack';
    const isProp = !!room.isProportional;
    const reqBuyIn = buyInAmount === 'ALL' ? Math.floor(Number(dbUser.balance)) : Math.floor(Number(buyInAmount));
    const buyIn = isBJ || isProp
      ? (Number.isFinite(reqBuyIn) && reqBuyIn > 0 ? reqBuyIn : 1000)
      : (Number.isFinite(reqBuyIn) && reqBuyIn > 0
          ? Math.min(Math.max(reqBuyIn, room.buyIn), room.buyIn * 10)
          : room.buyIn);

    // Para evitar problemas de redondeo con números gigantes, si pidió ALL u over-requested por rounding:
    let finalBuyIn = m(buyIn);
    const bal = m(dbUser.balance);
    const isReconnect = room.players.some(p => p.userId === dbUser.id && p.isActive);
    if (!isReconnect && gt(finalBuyIn, bal)) {
      if (lte(finalBuyIn, bal.plus(bal.div(1000)))) {
        finalBuyIn = bal;
      } else {
        socket.emit('error', 'Saldo insuficiente para entrar a esta mesa.');
        return;
      }
    }

    const offTableBalance = toStr(sub(bal, finalBuyIn));
    const finalBuyInStr = toStr(finalBuyIn);

    const result = joinRoom(roomId, {
      id: socket.id,
      userId: dbUser.id,
      name: dbUser.name,
      avatar: dbUser.avatar || dbUser.id,
      cards: [],
      chips: isProp ? '1000' : finalBuyInStr,
      sessionBuyIn: finalBuyInStr,
      balance: offTableBalance,
      currentBet: '0',
      hasFolded: false,
      hasActed: false,
      isActive: true,
      totalContribution: '0',
      level: levelFromXp(dbUser.xp ?? 0),
      lastBuyIn: isBJ ? String(buyIn) : undefined,
      equippedBjFelt: dbUser.equipped_bj_felt || undefined,
      equippedAvatarDecoration: dbUser.equipped_avatar_decoration || undefined,
      equippedNameDecoration: dbUser.equipped_name_decoration || undefined,
      movedToAndorra: !!dbUser.moved_to_andorra,
      isCursed: dbUser.is_cursed === 1
    });

    if (!result) return;

    if (result === 'full') {
      socket.emit('error', 'La mesa está llena (máximo 8 jugadores).');
      return;
    }

    socket.join(roomId);

    if (result === 'joined') {
      const newBalance = await applyBalanceDelta(dbUser.id, finalBuyIn.negated());
      socket.emit('balanceUpdated', { balance: newBalance });
    } else {
      socket.emit('balanceUpdated', { balance: dbUser.balance });
      const room2 = getRoom(roomId);
      if (room2 && room2.currentTurnIndex >= 0) {
        armTurnTimer(roomId, true);
      }
    }

    broadcastRoom(roomId);
    io.emit('roomsUpdated', getRooms());

    // BlackJack: si la sala está parada, arrancar primera ronda
    const room3 = getRoom(roomId);
    if (room3?.gameType === 'blackjack') {
      maybeStartBlackjack(roomId);
    }
  });

  socket.on('leaveRoom', async ({ roomId }) => {
    const before = getRoom(roomId);
    const wasBlackjack = before?.gameType === 'blackjack';
    const cashOut = leaveRoom(roomId, socket.id);
    socket.leave(roomId);
    if (cashOut) {
      const newBalance = await applyBalanceDelta(cashOut.userId, cashOut.chips);
      socket.emit('balanceUpdated', { balance: newBalance });
      // Refrescar user completo (nivel/XP ganados en la mesa) para el lobby.
      const u = await getUser(cashOut.userId);
      if (u) socket.emit('userUpdated', toPublicUser(u));
    }
    if (wasBlackjack) {
      const after = getRoom(roomId);
      if (after) handleBlackjackLeave(roomId);
      else clearBlackjackTimers(roomId);
    } else {
      // After a player leaves, check if the room is stuck on an invalid turn
      const after = getRoom(roomId);
      if (after && ['preflop', 'flop', 'turn', 'river'].includes(after.phase)) {
        const idx = after.currentTurnIndex;
        const current = idx >= 0 ? after.players[idx] : undefined;
        if (!current || !current.isActive || current.hasFolded || current.isSpectating || lte(current.chips, 0)) {
          // Current turn player is invalid — force-advance via armTurnTimer which will
          // trigger the watchdog path. We need to immediately resolve this.
          clearTurnTimer(roomId);
          // Import processAction indirectly: emit a synthetic default action
          const { applyDefaultAction } = require('../socketHelpers');
          if (current && current.isActive && !current.hasFolded) {
            applyDefaultAction(roomId, current.userId);
          }
        }
      }
      armTurnTimer(roomId, true);
    }
    broadcastRoom(roomId);
    io.emit('roomsUpdated', getRooms());
  });

  socket.on('disconnect', (reason: string) => {
    console.log(`User disconnected: ${socket.id} reason=${reason}`);
    for (const r of getRooms()) {
      const room = getRoom(r.id);
      if (!room) continue;
      const p = room.players.find(pl => pl.id === socket.id && pl.isActive && !pl.hasCashedOut);
      if (!p) continue;
      p.isOnline = false;
      p.offlineSince = Date.now();
      
      const hasOnlinePlayers = room.players.some(p => p.isActive && !p.hasCashedOut && p.isOnline !== false);
      if (!hasOnlinePlayers) {
        // We need clearTurnTimer, which is in socketHelpers.
        // Let's import clearTurnTimer from socketHelpers at the top of the file.
        room.paused = true;
        room.turnStartedAt = undefined;
        room.turnDuration = undefined;
        room.inGrace = false;
      }
      broadcastRoom(r.id);
    }
    io.emit('roomsUpdated', getRooms());
  });
};
