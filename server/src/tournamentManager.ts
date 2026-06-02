import { v4 as uuidv4 } from 'uuid';
import {
  Tournament, TournamentPlayer, TournamentSummary, TournamentRequest, BlindLevel,
  TOURNAMENT_BLIND_STRUCTURES, TOURNAMENT_STARTING_CHIPS, PRIZE_STRUCTURES,
  Room, Player
} from '../../shared/types';
import { createRoom, getRoom, startGame } from './roomManager';

const tournaments: Map<string, Tournament> = new Map();

// Blind escalation timers
const blindTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

// ---- Queries ----

const toSummary = (t: Tournament): TournamentSummary => ({
  id: t.id,
  name: t.name,
  status: t.status,
  buyIn: t.buyIn,
  playerCount: t.players.filter(p => !p.isEliminated).length,
  pendingCount: t.pendingRequests.length,
  maxPlayers: t.maxPlayers,
  prizePool: t.prizePool,
  currentBlindLevel: t.currentBlindLevel,
  blindLevels: t.blindLevels,
  creatorId: t.creatorId,
});

export const getTournaments = (): TournamentSummary[] => {
  return Array.from(tournaments.values())
    .filter(t => t.status !== 'finished')
    .map(toSummary);
};

export const getTournament = (id: string): Tournament | undefined => tournaments.get(id);

export const getFinishedTournaments = (): TournamentSummary[] => {
  return Array.from(tournaments.values())
    .filter(t => t.status === 'finished')
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))
    .slice(0, 10)
    .map(toSummary);
};

// ---- Creation ----

export const createTournament = (
  name: string,
  buyIn: number,
  maxPlayers: number,
  blindStructure: string,
  creatorId: string
): Tournament => {
  const structure = TOURNAMENT_BLIND_STRUCTURES[blindStructure] || TOURNAMENT_BLIND_STRUCTURES.normal;
  const id = 'torneo-' + uuidv4().slice(0, 8);

  const tournament: Tournament = {
    id,
    name,
    status: 'registering',
    buyIn,
    startingChips: TOURNAMENT_STARTING_CHIPS,
    maxPlayers: Math.min(8, Math.max(2, maxPlayers)),
    blindLevels: structure.levels,
    currentBlindLevel: 0,
    players: [],
    pendingRequests: [],
    createdAt: Date.now(),
    prizePool: 0,
    prizeStructure: [],
    creatorId,
  };

  tournaments.set(id, tournament);
  return tournament;
};

// ---- Registration (request-based) ----

// Creator is auto-approved when creating the tournament
export const addCreator = (tournamentId: string, userId: string, name: string, avatar: string): void => {
  const t = tournaments.get(tournamentId);
  if (!t) return;
  t.players.push({ userId, name, avatar, chips: 0, isEliminated: false, prizeWon: 0 });
  t.prizePool = t.players.length * t.buyIn;
};

// Other players submit a request — host must approve
export const requestJoin = (
  tournamentId: string,
  userId: string,
  name: string,
  avatar: string
): { ok: boolean; error?: string } => {
  const t = tournaments.get(tournamentId);
  if (!t) return { ok: false, error: 'Torneo no encontrado' };
  if (t.status !== 'registering') return { ok: false, error: 'El torneo ya empezó' };
  if (t.players.length >= t.maxPlayers) return { ok: false, error: 'Torneo lleno' };
  if (t.players.some(p => p.userId === userId)) return { ok: false, error: 'Ya estás inscrito' };
  if (t.pendingRequests.some(r => r.userId === userId)) return { ok: false, error: 'Solicitud ya enviada' };

  t.pendingRequests.push({ userId, name, avatar, requestedAt: Date.now() });
  return { ok: true };
};

// Host approves a request
export const approveRequest = (
  tournamentId: string,
  hostId: string,
  requestUserId: string
): { ok: boolean; error?: string } => {
  const t = tournaments.get(tournamentId);
  if (!t) return { ok: false, error: 'Torneo no encontrado' };
  if (t.creatorId !== hostId) return { ok: false, error: 'Solo el host puede aceptar' };
  if (t.status !== 'registering') return { ok: false, error: 'El torneo ya empezó' };

  const reqIdx = t.pendingRequests.findIndex(r => r.userId === requestUserId);
  if (reqIdx === -1) return { ok: false, error: 'Solicitud no encontrada' };

  if (t.players.length >= t.maxPlayers) return { ok: false, error: 'Torneo lleno' };

  const req = t.pendingRequests.splice(reqIdx, 1)[0];
  t.players.push({ userId: req.userId, name: req.name, avatar: req.avatar, chips: 0, isEliminated: false, prizeWon: 0 });
  t.prizePool = t.players.length * t.buyIn;
  return { ok: true };
};

// Host rejects a request
export const rejectRequest = (
  tournamentId: string,
  hostId: string,
  requestUserId: string
): { ok: boolean; error?: string } => {
  const t = tournaments.get(tournamentId);
  if (!t) return { ok: false, error: 'Torneo no encontrado' };
  if (t.creatorId !== hostId) return { ok: false, error: 'Solo el host puede rechazar' };

  const reqIdx = t.pendingRequests.findIndex(r => r.userId === requestUserId);
  if (reqIdx === -1) return { ok: false, error: 'Solicitud no encontrada' };

  t.pendingRequests.splice(reqIdx, 1);
  return { ok: true };
};

// Accepted player withdraws before tournament starts
export const withdrawFromTournament = (
  tournamentId: string,
  userId: string
): { ok: boolean; error?: string } => {
  const t = tournaments.get(tournamentId);
  if (!t) return { ok: false, error: 'Torneo no encontrado' };
  if (t.status !== 'registering') return { ok: false, error: 'El torneo ya empezó' };
  if (t.creatorId === userId) return { ok: false, error: 'El host no puede abandonar su torneo' };

  // Check pending request
  const reqIdx = t.pendingRequests.findIndex(r => r.userId === userId);
  if (reqIdx !== -1) { t.pendingRequests.splice(reqIdx, 1); return { ok: true }; }

  // Check accepted player
  const playerIdx = t.players.findIndex(p => p.userId === userId);
  if (playerIdx !== -1) {
    t.players.splice(playerIdx, 1);
    t.prizePool = t.players.length * t.buyIn;
    return { ok: true };
  }

  return { ok: false, error: 'No estás en este torneo' };
};

// ---- Start Tournament ----

export const startTournament = (
  tournamentId: string,
  userId: string
): { ok: boolean; error?: string; roomId?: string } => {
  const t = tournaments.get(tournamentId);
  if (!t) return { ok: false, error: 'Torneo no encontrado' };
  if (t.status !== 'registering') return { ok: false, error: 'El torneo ya empezó' };
  if (t.creatorId !== userId) return { ok: false, error: 'Solo el creador puede iniciar el torneo' };
  if (t.players.length < 2) return { ok: false, error: 'Se necesitan al menos 2 jugadores' };

  // Set prize structure based on player count
  t.prizeStructure = PRIZE_STRUCTURES[Math.min(t.players.length, 8)] || PRIZE_STRUCTURES[8];

  // Give starting chips
  t.players.forEach(p => { p.chips = t.startingChips; });

  // Create game room for the tournament
  const roomId = 'troom-' + t.id;
  const firstBlinds = t.blindLevels[0];

  // We create a custom room via createRoom, then override blinds
  createRoom(roomId, `🏆 ${t.name}`, false, 0);
  const room = getRoom(roomId);
  if (!room) return { ok: false, error: 'Error creando sala de torneo' };

  // Override room settings for tournament
  room.buyIn = t.startingChips; // Tournament uses startingChips, not buy-in money
  room.smallBlind = firstBlinds.smallBlind;
  room.bigBlind = firstBlinds.bigBlind;

  t.roomId = roomId;
  t.status = 'running';
  t.startedAt = Date.now();
  t.currentBlindLevel = 0;
  t.blindTimer = Date.now();

  // Start blind escalation timer
  scheduleBlindIncrease(tournamentId);

  return { ok: true, roomId };
};

// ---- Blind Escalation ----

const scheduleBlindIncrease = (tournamentId: string) => {
  const t = tournaments.get(tournamentId);
  if (!t || t.status !== 'running') return;

  const currentLevel = t.blindLevels[t.currentBlindLevel];
  if (!currentLevel) return;

  // Clear existing timer
  const existing = blindTimers.get(tournamentId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    advanceBlinds(tournamentId);
  }, currentLevel.duration);

  blindTimers.set(tournamentId, timer);
};

export const advanceBlinds = (tournamentId: string): BlindLevel | null => {
  const t = tournaments.get(tournamentId);
  if (!t || t.status !== 'running') return null;

  const nextLevel = t.currentBlindLevel + 1;
  if (nextLevel >= t.blindLevels.length) {
    // Stay on last level forever
    return t.blindLevels[t.currentBlindLevel];
  }

  t.currentBlindLevel = nextLevel;
  t.blindTimer = Date.now();
  const newBlinds = t.blindLevels[nextLevel];

  // Update the room's blinds
  if (t.roomId) {
    const room = getRoom(t.roomId);
    if (room) {
      room.smallBlind = newBlinds.smallBlind;
      room.bigBlind = newBlinds.bigBlind;
    }
  }

  // Schedule next increase
  scheduleBlindIncrease(tournamentId);

  return newBlinds;
};

export const getCurrentBlinds = (tournamentId: string): { level: number; blinds: BlindLevel; timeLeft: number } | null => {
  const t = tournaments.get(tournamentId);
  if (!t || t.status !== 'running') return null;

  const blinds = t.blindLevels[t.currentBlindLevel];
  if (!blinds) return null;

  const elapsed = Date.now() - (t.blindTimer || 0);
  const timeLeft = Math.max(0, blinds.duration - elapsed);

  return { level: t.currentBlindLevel, blinds, timeLeft };
};

// ---- Player Elimination ----

export const checkElimination = (
  tournamentId: string,
  userId: string
): { eliminated: boolean; position?: number } => {
  const t = tournaments.get(tournamentId);
  if (!t || t.status !== 'running') return { eliminated: false };

  const player = t.players.find(p => p.userId === userId);
  if (!player || player.isEliminated) return { eliminated: false };

  // Check if player has 0 chips in the room
  if (t.roomId) {
    const room = getRoom(t.roomId);
    if (room) {
      const roomPlayer = room.players.find(p => p.userId === userId);
      if (roomPlayer && roomPlayer.chips <= 0 && !roomPlayer.isSpectating) {
        // Player is busted — eliminate
        const alive = t.players.filter(p => !p.isEliminated).length;
        player.isEliminated = true;
        player.finishPosition = alive; // If 3 alive when eliminated, position = 3
        player.chips = 0;

        return { eliminated: true, position: alive };
      }
    }
  }

  return { eliminated: false };
};

export const getAlivePlayers = (tournamentId: string): TournamentPlayer[] => {
  const t = tournaments.get(tournamentId);
  if (!t) return [];
  return t.players.filter(p => !p.isEliminated);
};

// ---- Finish Tournament ----

export const checkTournamentEnd = (
  tournamentId: string
): { finished: boolean; winner?: TournamentPlayer } => {
  const t = tournaments.get(tournamentId);
  if (!t || t.status !== 'running') return { finished: false };

  const alive = t.players.filter(p => !p.isEliminated);
  if (alive.length > 1) return { finished: false };

  // We have a winner!
  const winner = alive[0];
  if (winner) {
    winner.finishPosition = 1;
    winner.isEliminated = true; // Mark as done
  }

  // Distribute prizes
  distributePrizes(t);

  t.status = 'finished';
  t.finishedAt = Date.now();

  // Clean up blind timer
  const timer = blindTimers.get(tournamentId);
  if (timer) {
    clearTimeout(timer);
    blindTimers.delete(tournamentId);
  }

  return { finished: true, winner };
};

const distributePrizes = (t: Tournament) => {
  // Sort by finish position (1 = best)
  const ranked = [...t.players].sort((a, b) => (a.finishPosition || 99) - (b.finishPosition || 99));

  for (let i = 0; i < t.prizeStructure.length && i < ranked.length; i++) {
    const pct = t.prizeStructure[i];
    ranked[i].prizeWon = Math.floor(t.prizePool * pct / 100);
  }

  // Any remainder goes to 1st place
  const totalDistributed = ranked.reduce((sum, p) => sum + p.prizeWon, 0);
  const remainder = t.prizePool - totalDistributed;
  if (remainder > 0 && ranked.length > 0) {
    ranked[0].prizeWon += remainder;
  }
};

// ---- Sync chips from room to tournament ----

export const syncChipsFromRoom = (tournamentId: string) => {
  const t = tournaments.get(tournamentId);
  if (!t || !t.roomId) return;

  const room = getRoom(t.roomId);
  if (!room) return;

  for (const tp of t.players) {
    if (tp.isEliminated) continue;
    const rp = room.players.find(p => p.userId === tp.userId);
    if (rp) tp.chips = rp.chips;
  }
};

// ---- Get tournament for a room ----

export const getTournamentByRoomId = (roomId: string): Tournament | undefined => {
  for (const t of tournaments.values()) {
    if (t.roomId === roomId) return t;
  }
  return undefined;
};

// ---- Cleanup ----

export const cleanupTournament = (tournamentId: string) => {
  const timer = blindTimers.get(tournamentId);
  if (timer) {
    clearTimeout(timer);
    blindTimers.delete(tournamentId);
  }
  // Keep tournament in memory for results viewing; auto-clean after 1 hour
  setTimeout(() => { tournaments.delete(tournamentId); }, 60 * 60 * 1000);
};
