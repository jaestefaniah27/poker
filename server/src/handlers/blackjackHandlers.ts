import { Socket } from 'socket.io';
import {
  getRoom, getRooms, leaveRoom,
  startBlackjackRound, placeBlackjackBet, allBlackjackBetsIn, dealBlackjackHands,
  blackjackPlayerAction, finishBlackjackHand, forceStandRemaining, rebuyBlackjack,
  BJ_BETTING_DURATION, BJ_DEALER_REVEAL_DELAY,
  touchRoom
} from '../roomManager';
import { initShoe } from '../blackjackEngine';
import { broadcastRoom, io, hasOnlinePlayers } from '../socketHelpers';
import { applyBalanceDelta, getUser } from '../db';
import { Room, m, gt, lt, isZero } from '../../../shared/types';

const RESHUFFLE_PAUSE_MS = 2_500;

// ¿Queda alguien con mano viva en playerAction?
const anyPlaying = (room: Room): boolean =>
  room.players.some(p => p.isActive && !p.isSpectating && gt(m(p.bet ?? 0), 0) && p.bjStatus === 'playing');

type BJTimerSet = {
  betting?: NodeJS.Timeout;
  action?: NodeJS.Timeout;
  dealer?: NodeJS.Timeout;
  resolve?: NodeJS.Timeout;
  actionUserId?: string;
};

const bjTimers = new Map<string, BJTimerSet>();

const getTimers = (roomId: string): BJTimerSet => {
  let t = bjTimers.get(roomId);
  if (!t) { t = {}; bjTimers.set(roomId, t); }
  return t;
};

export const clearBlackjackTimers = (roomId: string) => {
  const t = bjTimers.get(roomId);
  if (!t) return;
  if (t.betting) clearTimeout(t.betting);
  if (t.action) clearTimeout(t.action);
  if (t.dealer) clearTimeout(t.dealer);
  if (t.resolve) clearTimeout(t.resolve);
  bjTimers.delete(roomId);
};

const eligibleCount = (room: Room) =>
  room.players.filter(p => p.isActive && !p.isSpectating && gt(p.chips, 0)).length;

const armBettingTimer = (roomId: string) => {
  const room = getRoom(roomId);
  if (!room) return;
  room.bettingDeadline = Date.now() + BJ_BETTING_DURATION;
  const t = getTimers(roomId);
  if (t.betting) clearTimeout(t.betting);
  // Añadimos 2s de gracia para que los auto-place de los clientes (con posibles desajustes de reloj) lleguen antes de cerrar las apuestas
  t.betting = setTimeout(() => onBettingDeadline(roomId), BJ_BETTING_DURATION + 2000);
};

// Timer de FASE (concurrente): tras X s, planta a quien siga vivo y pasa al dealer.
const ACTION_PHASE_DURATION = 30_000;
const armActionPhaseTimer = (roomId: string) => {
  const t = getTimers(roomId);
  if (t.action) clearTimeout(t.action);
  t.action = setTimeout(() => onActionPhaseTimeout(roomId), ACTION_PHASE_DURATION);
};
const clearActionTimer = (roomId: string) => {
  const t = getTimers(roomId);
  if (t.action) { clearTimeout(t.action); t.action = undefined; }
};

const armDealerTimer = (roomId: string) => {
  const t = getTimers(roomId);
  if (t.dealer) clearTimeout(t.dealer);
  t.dealer = setTimeout(() => runDealerAndResolve(roomId), BJ_DEALER_REVEAL_DELAY);
};

// Timer de resolve: los jugadores offline no pueden pulsar "Continuar".
// Si bloquean el avance de la ronda, tras este tiempo se les auto-continúa para
// que la mesa no quede atascada (p.ej. recién llegado esperando en espectador).
const RESOLVE_OFFLINE_TIMEOUT = 8_000;
const armResolveTimer = (roomId: string) => {
  const t = getTimers(roomId);
  if (t.resolve) clearTimeout(t.resolve);
  t.resolve = setTimeout(() => onResolveTimeout(roomId), RESOLVE_OFFLINE_TIMEOUT);
};
const clearResolveTimer = (roomId: string) => {
  const t = getTimers(roomId);
  if (t.resolve) { clearTimeout(t.resolve); t.resolve = undefined; }
};
const onResolveTimeout = (roomId: string) => {
  const room = getRoom(roomId);
  if (!room || room.bjPhase !== 'resolve') return;
  // Auto-continuar a jugadores offline: no deben bloquear el avance.
  let changed = false;
  room.players.forEach(p => {
    if (p.isActive && !p.isSpectating && p.isOnline === false && !p.bjHasContinued) {
      p.bjHasContinued = true;
      p.bet = '0';
      p.bjResult = undefined;
      p.bjDelta = undefined;
      p.bjSidebetResults = undefined;
      p.bjSidebetDelta = undefined;
      changed = true;
    }
  });
  const activePlayers = room.players.filter(p => p.isActive && !p.isSpectating && gt(p.chips, 0));
  const allContinued = activePlayers.length === 0 || activePlayers.every(p => p.bjHasContinued);
  if (allContinued) {
    startNextRound(roomId);
  } else {
    if (changed) broadcastRoom(roomId);
    // Quedan jugadores online sin continuar — re-armar por si se desconectan.
    armResolveTimer(roomId);
  }
};

const onBettingDeadline = (roomId: string) => {
  const room = getRoom(roomId);
  if (!room || room.gameType !== 'blackjack') return;
  if (room.bjPhase !== 'betting' && room.bjPhase !== 'resolve') return;
  proceedDeal(roomId);
};

const proceedDeal = async (roomId: string) => {
  const room = getRoom(roomId);
  if (!room) return;
  if (!hasOnlinePlayers(room)) {
    // pausa — no repartir mientras todo el mundo offline
    room.paused = true;
    broadcastRoom(roomId);
    return;
  }
  room.paused = false;
  // Echar jugadores offline sin apuesta antes de repartir
  const toKick = room.players.filter(
    p => p.isActive && !p.hasCashedOut && p.isOnline === false && isZero(p.bet ?? 0)
  );
  for (const p of toKick) {
    const cashOut = leaveRoom(roomId, p.id);
    if (cashOut) applyBalanceDelta(cashOut.userId, cashOut.chips).catch(() => {});
  }
  if (toKick.length > 0) io.emit('roomsUpdated', getRooms());
  const next = dealBlackjackHands(roomId);
  if (next === 'betting') {
    // nadie apostó — reabrimos timer
    armBettingTimer(roomId);
    broadcastRoom(roomId);
    return;
  }
  if (next === 'reshuffling') {
    // Pausa visible: el cliente muestra animación de barajado antes de repartir
    broadcastRoom(roomId);
    setTimeout(() => {
      const r = getRoom(roomId);
      if (!r || r.bjPhase !== 'reshuffling') return;
      initShoe(r);
      const next2 = dealBlackjackHands(roomId);
      broadcastRoom(roomId);
      if (next2 === 'playerAction') armActionPhaseTimer(roomId);
      else if (next2 === 'dealerAction') armDealerTimer(roomId);
    }, RESHUFFLE_PAUSE_MS);
    return;
  }
  broadcastRoom(roomId);
  if (next === 'playerAction') {
    armActionPhaseTimer(roomId);
  } else if (next === 'dealerAction') {
    armDealerTimer(roomId);
  }
};

// Timeout de fase: planta a los que sigan vivos y juega el dealer.
const onActionPhaseTimeout = (roomId: string) => {
  const room = getRoom(roomId);
  if (!room || room.bjPhase !== 'playerAction') return;
  forceStandRemaining(roomId);
  broadcastRoom(roomId);
  armDealerTimer(roomId);
};

const runDealerAndResolve = (roomId: string) => {
  const room = getRoom(roomId);
  if (!room || room.bjPhase !== 'dealerAction') return;
  finishBlackjackHand(roomId);
  touchRoom(roomId);
  broadcastRoom(roomId);
  // La mano se queda en 'resolve' hasta que un jugador pulse Continuar,
  // pero armamos un fallback: los offline no pueden pulsar y bloquearían la mesa.
  armResolveTimer(roomId);
};

const startNextRound = (roomId: string) => {
  const room = getRoom(roomId);
  if (!room || room.gameType !== 'blackjack') return;
  clearResolveTimer(roomId);
  if (eligibleCount(room) < 1) {
    room.bjPhase = 'waiting';
    broadcastRoom(roomId);
    return;
  }
  const ok = startBlackjackRound(roomId);
  if (!ok) { room.bjPhase = 'waiting'; broadcastRoom(roomId); return; }
  broadcastRoom(roomId);
  io.emit('roomsUpdated', getRooms());
};

// Llamar tras un join exitoso: si la sala está en waiting, arrancar primera ronda.
export const maybeStartBlackjack = (roomId: string) => {
  const room = getRoom(roomId);
  if (!room || room.gameType !== 'blackjack') return;
  if (room.bjPhase !== 'waiting' && room.bjPhase != null) return;
  if (eligibleCount(room) < 1) return;
  const ok = startBlackjackRound(roomId);
  if (ok) {
    broadcastRoom(roomId);
    io.emit('roomsUpdated', getRooms());
  }
};

// Llamar cuando un jugador abandona en blackjack durante una mano activa.
// Si era su turno, hay que avanzar.
export const handleBlackjackLeave = (roomId: string) => {
  const room = getRoom(roomId);
  if (!room || room.gameType !== 'blackjack') return;
  // Concurrente: si en playerAction ya no queda nadie vivo (el que faltaba se fue), juega el dealer.
  if (room.bjPhase === 'playerAction' && !anyPlaying(room)) {
    room.bjPhase = 'dealerAction';
    room.bjTurnUserId = undefined;
    clearActionTimer(roomId);
    armDealerTimer(roomId);
    broadcastRoom(roomId);
  }
  // Si quedó la sala vacía, parar todos los timers
  if (eligibleCount(room) === 0) {
    clearBlackjackTimers(roomId);
  }
};

export const blackjackHandlers = (socket: Socket) => {
  socket.on('bjPlaceBet', ({ roomId, amount, sidebets }) => {
    const room = getRoom(roomId);
    if (!room || room.gameType !== 'blackjack') return;
    const seat = room.players.find(p => p.id === socket.id);
    if (!seat) return;

    if (room.bjPhase !== 'waiting' && room.bjPhase !== 'betting') {
      if (!(room.bjPhase === 'resolve' && seat.bjHasContinued)) {
        return;
      }
    }

    const ok = placeBlackjackBet(roomId, seat.userId, amount ?? 0, sidebets);
    if (!ok) return;
    
    if (!room.bettingDeadline) {
      armBettingTimer(roomId);
    }
    
    broadcastRoom(roomId);
    // Si todos ya apostaron, repartir ya
    if (allBlackjackBetsIn(room)) {
      const t = getTimers(roomId);
      if (t.betting) { clearTimeout(t.betting); t.betting = undefined; }
      proceedDeal(roomId);
    }
  });

  socket.on('bjAction', ({ roomId, action }) => {
    const room = getRoom(roomId);
    if (!room || room.gameType !== 'blackjack') return;
    const seat = room.players.find(p => p.id === socket.id);
    if (!seat) return;
    if (!['Hit', 'Stand', 'Double', 'Surrender', 'Split', 'Insurance'].includes(action)) return;
    // Concurrente: cada jugador actúa sobre su mano. No tocamos el timer de fase por acción individual.
    const next = blackjackPlayerAction(roomId, seat.userId, action);
    if (!next) return; // acción inválida (no es 'playing', etc.)
    touchRoom(roomId);
    broadcastRoom(roomId);
    if (next === 'dealerAction') {
      clearActionTimer(roomId);
      armDealerTimer(roomId);
    }
    // si sigue 'playerAction', el timer de fase continúa corriendo
  });

  // Solicitar inicio manual (si la sala está parada en waiting con jugadores)
  socket.on('bjStartRound', ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room || room.gameType !== 'blackjack') return;
    if (room.bjPhase !== 'waiting') return;
    maybeStartBlackjack(roomId);
  });

  // Continuar tras el resultado: cualquiera en la mesa puede arrancar la siguiente ronda, pero solo avanza de fase global si todos lo hacen.
  socket.on('bjContinue', ({ roomId }) => {
    const room = getRoom(roomId);
    if (!room || room.gameType !== 'blackjack') return;
    if (room.bjPhase !== 'resolve') return;
    
    const p = room.players.find(p => p.id === socket.id);
    if (!p || p.bjHasContinued) return; // ya continuó, ignorar
    
    p.bjHasContinued = true;
    p.bet = '0'; // limpiar apuesta de la ronda anterior
    p.bjResult = undefined;
    p.bjDelta = undefined;
    p.bjSidebetResults = undefined;
    p.bjSidebetDelta = undefined;

    // Los jugadores offline no pueden pulsar Continuar: no deben bloquear la ronda.
    room.players.forEach(pl => {
      if (pl.isActive && !pl.isSpectating && pl.isOnline === false && !pl.bjHasContinued) {
        pl.bjHasContinued = true;
        pl.bet = '0';
        pl.bjResult = undefined;
        pl.bjDelta = undefined;
        pl.bjSidebetResults = undefined;
        pl.bjSidebetDelta = undefined;
      }
    });

    const activePlayers = room.players.filter(p => p.isActive && !p.isSpectating && gt(p.chips, 0));
    const allContinued = activePlayers.every(p => p.bjHasContinued);

    if (allContinued) {
      startNextRound(roomId);
    } else {
      broadcastRoom(roomId);
    }
  });

  // Recompra: repite el último buy-in cuando te quedas sin fichas.
  socket.on('bjRebuy', async ({ roomId, amount }) => {
    const room = getRoom(roomId);
    if (!room || room.gameType !== 'blackjack') return;
    const seat = room.players.find(p => p.id === socket.id);
    if (!seat) return;
    // Compute expected rebuy amount BEFORE touching room state
    const requestedAmount = Number(amount) || 0;
    const expectedAmount = requestedAmount > 0 ? requestedAmount : (seat.lastBuyIn && gt(seat.lastBuyIn, 0) ? Number(seat.lastBuyIn) : 1000);
    const dbSeat = await getUser(seat.userId);
    if (!dbSeat || lt(dbSeat.balance, expectedAmount)) return;
    const reboughtAmount = rebuyBlackjack(roomId, seat.userId, requestedAmount);
    if (reboughtAmount <= 0) return;
    const newBalance = await applyBalanceDelta(seat.userId, -reboughtAmount);
    socket.emit('balanceUpdated', { balance: newBalance });
    broadcastRoom(roomId);
    io.emit('roomsUpdated', getRooms());
    // Si la mesa estaba parada en 'waiting', arrancar ronda ahora que hay fichas.
    if (room.bjPhase === 'waiting' || room.bjPhase == null) maybeStartBlackjack(roomId);
  });
};
