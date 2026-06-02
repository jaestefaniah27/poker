import { Socket } from 'socket.io';
import {
  getTournaments, getTournament, createTournament, addCreator,
  requestJoin, approveRequest, rejectRequest, withdrawFromTournament,
  startTournament, checkElimination, checkTournamentEnd, getAlivePlayers,
  syncChipsFromRoom, getTournamentByRoomId, getCurrentBlinds,
  cleanupTournament, getFinishedTournaments
} from '../tournamentManager';
import { getRoom, joinRoom, startGame, nextHand } from '../roomManager';
import { authUser, broadcastRoom, armTurnTimer, clearTurnTimer, io, SHOWDOWN_LOCK_MS } from '../socketHelpers';
import { applyBalanceDelta } from '../db';
import { sanitizeInput } from '../security';
import { TOURNAMENT_BUY_INS, TOURNAMENT_BLIND_STRUCTURES } from '../../../shared/types';

// ---- Broadcast helpers ----

const broadcastTournaments = () => {
  io.emit('tournamentsUpdated', getTournaments());
};

// Emit tournament detail to everyone subscribed to its room
const broadcastTournament = (tournamentId: string) => {
  const t = getTournament(tournamentId);
  if (t) io.to(`tournament:${tournamentId}`).emit('tournamentUpdated', t);
};

// ---- Helpers ----

// Tag sockets with userId so we can find them later
export const tagSocket = (socket: Socket, userId: string) => {
  (socket as any).__userId = userId;
};

const findSocketByUserId = (userId: string): Socket | undefined => {
  for (const [, s] of io.sockets.sockets) {
    if ((s as any).__userId === userId) return s;
  }
  return undefined;
};

// ---- Handlers ----

export const tournamentHandlers = (socket: Socket) => {

  socket.on('getTournaments', (callback) => {
    if (typeof callback === 'function') {
      callback({ tournaments: getTournaments() });
    }
  });

  socket.on('getTournament', ({ tournamentId }, callback) => {
    const t = getTournament(tournamentId);
    if (typeof callback === 'function') {
      callback(t ? { tournament: t } : { error: 'Torneo no encontrado' });
    }
  });

  // ---- Create ----

  socket.on('createTournament', async ({ name, buyIn, maxPlayers, blindStructure, token }, callback) => {
    const dbUser = await authUser(token);
    if (!dbUser) { if (typeof callback === 'function') callback({ error: 'No autenticado' }); return; }

    const cleanName = sanitizeInput(name?.trim() || 'Torneo');
    const validBuyIn = TOURNAMENT_BUY_INS.includes(buyIn) ? buyIn : TOURNAMENT_BUY_INS[0];
    const validMax = Math.min(8, Math.max(2, maxPlayers || 6));
    const validStructure = Object.keys(TOURNAMENT_BLIND_STRUCTURES).includes(blindStructure) ? blindStructure : 'normal';

    const t = createTournament(cleanName, validBuyIn, validMax, validStructure, dbUser.id);

    // Creator auto-approved — charge buy-in now
    addCreator(t.id, dbUser.id, dbUser.name, dbUser.avatar || dbUser.id);
    const newBalance = await applyBalanceDelta(dbUser.id, -validBuyIn);
    socket.emit('balanceUpdated', { balance: newBalance });

    socket.join(`tournament:${t.id}`);
    if (typeof callback === 'function') callback({ ok: true, tournament: t });
    broadcastTournaments();
  });

  // ---- Request to join ----

  socket.on('requestJoinTournament', async ({ tournamentId, token }, callback) => {
    const dbUser = await authUser(token);
    if (!dbUser) { if (typeof callback === 'function') callback({ error: 'No autenticado' }); return; }

    const result = requestJoin(tournamentId, dbUser.id, dbUser.name, dbUser.avatar || dbUser.id);
    if (!result.ok) { if (typeof callback === 'function') callback({ error: result.error }); return; }

    socket.join(`tournament:${tournamentId}`);
    if (typeof callback === 'function') callback({ ok: true });

    // Notify host
    const t = getTournament(tournamentId);
    if (t) {
      const hostSocket = findSocketByUserId(t.creatorId);
      if (hostSocket) {
        hostSocket.emit('tournamentRequestReceived', {
          tournamentId,
          request: { userId: dbUser.id, name: dbUser.name, avatar: dbUser.avatar || dbUser.id }
        });
      }
    }

    broadcastTournament(tournamentId);
    broadcastTournaments();
  });

  // ---- Host approves ----

  socket.on('approveTournamentRequest', async ({ tournamentId, requestUserId, token }, callback) => {
    const dbUser = await authUser(token);
    if (!dbUser) { if (typeof callback === 'function') callback({ error: 'No autenticado' }); return; }

    const t = getTournament(tournamentId);
    if (!t) { if (typeof callback === 'function') callback({ error: 'Torneo no encontrado' }); return; }

    const result = approveRequest(tournamentId, dbUser.id, requestUserId);
    if (!result.ok) { if (typeof callback === 'function') callback({ error: result.error }); return; }

    // Charge buy-in to the approved player
    const newBalance = await applyBalanceDelta(requestUserId, -t.buyIn);
    const approvedSocket = findSocketByUserId(requestUserId);
    if (approvedSocket) {
      approvedSocket.emit('balanceUpdated', { balance: newBalance });
      approvedSocket.emit('tournamentRequestResponse', { tournamentId, approved: true });
    }

    if (typeof callback === 'function') callback({ ok: true });
    broadcastTournament(tournamentId);
    broadcastTournaments();
  });

  // ---- Host rejects ----

  socket.on('rejectTournamentRequest', async ({ tournamentId, requestUserId, token }, callback) => {
    const dbUser = await authUser(token);
    if (!dbUser) { if (typeof callback === 'function') callback({ error: 'No autenticado' }); return; }

    const result = rejectRequest(tournamentId, dbUser.id, requestUserId);
    if (!result.ok) { if (typeof callback === 'function') callback({ error: result.error }); return; }

    const rejectedSocket = findSocketByUserId(requestUserId);
    if (rejectedSocket) {
      rejectedSocket.leave(`tournament:${tournamentId}`);
      rejectedSocket.emit('tournamentRequestResponse', { tournamentId, approved: false });
    }

    if (typeof callback === 'function') callback({ ok: true });
    broadcastTournament(tournamentId);
    broadcastTournaments();
  });

  // ---- Withdraw ----

  socket.on('withdrawTournament', async ({ tournamentId, token }, callback) => {
    const dbUser = await authUser(token);
    if (!dbUser) { if (typeof callback === 'function') callback({ error: 'No autenticado' }); return; }

    const t = getTournament(tournamentId);
    const wasApproved = t?.players.some(p => p.userId === dbUser.id);

    const result = withdrawFromTournament(tournamentId, dbUser.id);
    if (!result.ok) { if (typeof callback === 'function') callback({ error: result.error }); return; }

    // Refund only if was accepted (buy-in was charged)
    if (wasApproved && t) {
      const newBalance = await applyBalanceDelta(dbUser.id, t.buyIn);
      socket.emit('balanceUpdated', { balance: newBalance });
    }

    socket.leave(`tournament:${tournamentId}`);
    if (typeof callback === 'function') callback({ ok: true });
    broadcastTournament(tournamentId);
    broadcastTournaments();
  });

  // ---- Start ----

  socket.on('startTournament', async ({ tournamentId, token }, callback) => {
    const dbUser = await authUser(token);
    if (!dbUser) { if (typeof callback === 'function') callback({ error: 'No autenticado' }); return; }

    const result = startTournament(tournamentId, dbUser.id);
    if (!result.ok) { if (typeof callback === 'function') callback({ error: result.error }); return; }

    const t = getTournament(tournamentId);
    if (!t || !t.roomId) return;

    // Reject all pending requests (refund not needed — they never paid)
    const rejected = [...t.pendingRequests];
    t.pendingRequests = [];
    for (const req of rejected) {
      const s = findSocketByUserId(req.userId);
      if (s) {
        s.leave(`tournament:${tournamentId}`);
        s.emit('tournamentRequestResponse', { tournamentId, approved: false, reason: 'El torneo ya comenzó' });
      }
    }

    // Tell all approved players to join the game room
    io.to(`tournament:${tournamentId}`).emit('tournamentStarted', {
      tournamentId: t.id,
      roomId: t.roomId,
    });

    if (typeof callback === 'function') callback({ ok: true, roomId: t.roomId });
    broadcastTournament(tournamentId);
    broadcastTournaments();
  });

  // ---- Join tournament room (called client-side after tournamentStarted) ----

  socket.on('joinTournamentRoom', async ({ tournamentId, token }) => {
    const dbUser = await authUser(token);
    if (!dbUser) return;

    const t = getTournament(tournamentId);
    if (!t || !t.roomId || t.status !== 'running') return;

    const tp = t.players.find(p => p.userId === dbUser.id);
    if (!tp || tp.isEliminated) return;

    const result = joinRoom(t.roomId, {
      id: socket.id,
      userId: dbUser.id,
      name: dbUser.name,
      avatar: dbUser.avatar || dbUser.id,
      cards: [],
      chips: tp.chips > 0 ? tp.chips : t.startingChips,
      balance: 0,
      currentBet: 0,
      hasFolded: false,
      hasActed: false,
      isActive: true,
      totalContribution: 0,
    });

    if (!result || result === 'full') return;
    socket.join(t.roomId);
    socket.emit('balanceUpdated', { balance: dbUser.balance });

    broadcastRoom(t.roomId);

    // Auto-start when all accepted players joined
    const room = getRoom(t.roomId);
    const alive = getAlivePlayers(tournamentId);
    if (room && room.players.filter(p => p.isActive).length >= alive.length && alive.length >= 2 && room.phase === 'waiting') {
      const started = startGame(t.roomId);
      if (started) {
        armTurnTimer(t.roomId, true);
        broadcastRoom(t.roomId);
        io.to(t.roomId).emit('gameStarted');
      }
    }
  });

  // ---- Next hand (tournament-aware) ----

  socket.on('tournamentNextHand', async ({ tournamentId }) => {
    const t = getTournament(tournamentId);
    if (!t || !t.roomId || t.status !== 'running') return;

    const room = getRoom(t.roomId);
    if (!room || room.phase !== 'showdown') return;
    if (Date.now() - (room.showdownAt || 0) < SHOWDOWN_LOCK_MS) { broadcastRoom(t.roomId); return; }

    syncChipsFromRoom(tournamentId);

    // Eliminations
    for (const tp of t.players) {
      if (tp.isEliminated) continue;
      const result = checkElimination(tournamentId, tp.userId);
      if (result.eliminated && result.position) {
        const s = findSocketByUserId(tp.userId);
        if (s) s.emit('tournamentEliminated', { tournamentId, position: result.position, totalPlayers: t.players.length });
        const rp = room.players.find(p => p.userId === tp.userId);
        if (rp) { rp.isSpectating = true; rp.chips = 0; }
      }
    }

    // Check finish
    const endResult = checkTournamentEnd(tournamentId);
    if (endResult.finished) {
      for (const tp of t.players) {
        if (tp.prizeWon > 0) {
          const newBalance = await applyBalanceDelta(tp.userId, tp.prizeWon);
          const s = findSocketByUserId(tp.userId);
          if (s) s.emit('balanceUpdated', { balance: newBalance });
        }
      }
      io.to(`tournament:${tournamentId}`).emit('tournamentFinished', { tournament: t });
      cleanupTournament(tournamentId);
      broadcastTournaments();
      broadcastRoom(t.roomId);
      return;
    }

    // Update blinds in room
    const blindInfo = getCurrentBlinds(tournamentId);
    if (blindInfo) { room.smallBlind = blindInfo.blinds.smallBlind; room.bigBlind = blindInfo.blinds.bigBlind; }

    clearTurnTimer(t.roomId);
    if (nextHand(t.roomId)) {
      const started = startGame(t.roomId);
      if (started) {
        armTurnTimer(t.roomId, true);
        broadcastRoom(t.roomId);
        io.to(t.roomId).emit('gameStarted');
      } else { broadcastRoom(t.roomId); }
    } else { broadcastRoom(t.roomId); }

    broadcastTournament(tournamentId);
    broadcastTournaments();
  });
};
