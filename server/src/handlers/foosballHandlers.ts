import { Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { foosballEngine } from '../foosballEngine';
import { placeFoosballBet, getBetsForUserOnMatch, getRecentBetsForUser, applyBalanceDelta, getUser, getAllFoosballPlayers, upsertFoosballPlayer, getFoosballBet, deleteFoosballBet } from '../db';

const isAdmin = (socket: Socket) => socket.data?.user?.name === 'Jorge';

export const foosballHandlers = (socket: Socket) => {

  // ─── Sincronización ───────────────────────────────────────────────────────

  socket.on('foosball_sync', async ({ token }, callback) => {
    const user = socket.data?.user;
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const state = foosballEngine.getState();
    const myBets = state.match ? await getBetsForUserOnMatch(user.id, state.match.id) : [];
    const history = await getRecentBetsForUser(user.id, 30);
    const players = await getAllFoosballPlayers();

    callback({ ok: true, state, myBets, history, players });
  });

  // ─── Apostar ──────────────────────────────────────────────────────────────

  socket.on('foosball_place_bet', async ({ token, betType, selection, amount }, callback) => {
    const user = socket.data?.user;
    if (!user) { callback({ error: 'No autenticado' }); return; }
    if (!amount || amount <= 0) { callback({ error: 'Importe inválido' }); return; }

    const state = foosballEngine.getState();
    if (!state.match || !state.bettingOpen) { callback({ error: 'Las apuestas están cerradas' }); return; }
    if (!state.odds) { callback({ error: 'Cuotas no disponibles' }); return; }

    let odds: number | undefined;
    switch (betType) {
      case 'winner':  odds = state.odds.winner[selection.team === 1 ? 'team1' : 'team2']; break;
      case 'exact':   odds = state.odds.exact[selection.score]; break;
      case 'total_goals': odds = selection.side === 'over' ? state.odds.totalGoals.over : state.odds.totalGoals.under; break;
      case 'handicap': odds = state.odds.handicap[selection.team === 1 ? 'team1' : 'team2']; break;
    }
    if (!odds) { callback({ error: 'Apuesta no válida' }); return; }

    const dbUser = await getUser(user.id);
    if (!dbUser) { callback({ error: 'Usuario no encontrado' }); return; }
    if (BigInt(dbUser.balance) < BigInt(amount)) { callback({ error: 'Saldo insuficiente' }); return; }

    await applyBalanceDelta(user.id, -amount);
    await placeFoosballBet({
      id: uuidv4(),
      match_id: state.match.id,
      user_id: user.id,
      user_name: user.name,
      bet_type: betType,
      selection: JSON.stringify(selection),
      amount,
      odds,
      status: 'pending',
      payout: 0,
      placed_at: Date.now(),
    });

    callback({ ok: true, odds });
  });

  // ─── Cancelar apuesta ────────────────────────────────────────────────────

  socket.on('foosball_cancel_bet', async ({ betId }, callback) => {
    const user = socket.data?.user;
    if (!user) { callback({ error: 'No autenticado' }); return; }

    const state = foosballEngine.getState();
    if (!state.bettingOpen) { callback({ error: 'Las apuestas ya están cerradas' }); return; }

    const bet = await getFoosballBet(betId);
    if (!bet || bet.user_id !== user.id) { callback({ error: 'Apuesta no encontrada' }); return; }
    if (bet.status !== 'pending') { callback({ error: 'La apuesta ya no se puede cancelar' }); return; }

    await deleteFoosballBet(bet.id);
    await applyBalanceDelta(user.id, bet.amount);
    callback({ ok: true, refunded: bet.amount });
  });

  // ─── Simulación (solo admin) ──────────────────────────────────────────────

  socket.on('foosball_sim_start', async ({ team1_p1, team1_p2, team2_p1, team2_p2 }, callback) => {
    if (!isAdmin(socket)) { callback({ error: 'No autorizado' }); return; }
    const result = await foosballEngine.simStart(team1_p1, team1_p2, team2_p1, team2_p2);
    callback(result);
  });

  socket.on('foosball_sim_goal', async ({ team }, callback) => {
    if (!isAdmin(socket)) { callback({ error: 'No autorizado' }); return; }
    if (team !== 1 && team !== 2) { callback({ error: 'Equipo inválido' }); return; }
    const result = await foosballEngine.simGoal(team as 1 | 2);
    callback(result);
  });

  socket.on('foosball_sim_end', async (_data, callback) => {
    if (!isAdmin(socket)) { callback({ error: 'No autorizado' }); return; }
    const result = await foosballEngine.simEnd();
    callback(result);
  });

  socket.on('foosball_sim_set_elo', async ({ name, elo }, callback) => {
    if (!isAdmin(socket)) { callback({ error: 'No autorizado' }); return; }
    if (!name || typeof elo !== 'number' || elo < 100 || elo > 3000) {
      callback({ error: 'Datos inválidos' }); return;
    }
    await foosballEngine.simUpdateElo(name, elo);
    callback({ ok: true });
  });

  socket.on('foosball_get_players', async (_data, callback) => {
    const players = await getAllFoosballPlayers();
    callback({ ok: true, players });
  });
};
