import { Player, Room, STAKE_TIERS, blindsFor, HandHistory, nextBlinds, GameType, levelFromXp } from '../../shared/types';
import { createDeck, shuffleDeck, dealCards, evaluateHands, updateHandNames, DEFAULT_BLIND_DIVISOR } from './pokerEngine';
import { dealBlackjack, dealerPlay as bjDealerPlay, resolveBlackjack, resetBlackjackHand, handValue as bjHandValue } from './blackjackEngine';
import { deleteRoomFromDB, recordMatchHistory, addXp, getUser } from './db';

// Calidad de mano de poker → rango 1..10 (pokersolver hand.name en inglés).
const HAND_RANK: Record<string, number> = {
  'High Card': 1, 'Pair': 2, 'Two Pair': 3, 'Three of a Kind': 4,
  'Straight': 5, 'Flush': 6, 'Full House': 7, 'Four of a Kind': 8,
  'Straight Flush': 9, 'Royal Flush': 10,
};
const handRank = (name?: string): number => (name && HAND_RANK[name]) || 1;

// XP poker: perder da poco, ganar bastante; escala con la calidad de la mano.
const pokerXp = (won: boolean, handName?: string): number =>
  (won ? 25 : 5) + handRank(handName) * (won ? 5 : 1);

// XP blackjack: blackjack > victoria > empate > derrota.
const blackjackXp = (result?: string): number =>
  result === 'blackjack' ? 200 : result === 'win' ? 100 : result === 'push' ? 30 : 10;

// Hook para re-emitir la sala tras refrescar niveles (lo registra socketHelpers).
let broadcastHook: ((roomId: string) => void) | null = null;
export const setRoomBroadcastHook = (fn: (roomId: string) => void) => { broadcastHook = fn; };

// Otorga XP por mano, refresca player.level en memoria y re-emite la sala. Fire-and-forget.
const awardHandXp = async (room: Room, entries: { userId: string; amount: number }[]) => {
  const merged = new Map<string, number>();
  for (const e of entries) merged.set(e.userId, (merged.get(e.userId) ?? 0) + e.amount);
  for (const [userId, amount] of merged) {
    try {
      await addXp(userId, amount);
      const u = await getUser(userId);
      const p = room.players.find(pl => pl.userId === userId);
      if (u && p) p.level = levelFromXp(u.xp ?? 0);
    } catch (err) {
      console.error('Error otorgando XP de mano:', err);
    }
  }
  broadcastHook?.(room.id);
};
import { broadcastRoom } from './socketHelpers';
import { v4 as uuidv4 } from 'uuid';

// Cierra la sesión de un jugador en una sala: persiste el historial (entrada / pico / salida)
// y limpia los campos de sesión. Devuelve las fichas con las que sale (cash_out).
const closePlayerSession = (room: Room, player: Player, cashOutChips: number) => {
  const buyIn = player.sessionBuyIn;
  if (buyIn == null || buyIn <= 0) return;
  const maxChips = Math.max(player.sessionMaxChips ?? cashOutChips, cashOutChips);
  recordMatchHistory(
    player.userId,
    room.name,
    buyIn,
    maxChips,
    cashOutChips,
    Date.now()
  ).catch(e => console.error('Error guardando historial de partida:', e));
  player.sessionBuyIn = undefined;
  player.sessionMaxChips = undefined;
  player.sessionStartedAt = undefined;
};

// Recorre los jugadores activos y actualiza su pico de fichas. Llamar tras cada endRound.
export const bumpMaxChips = (room: Room) => {
  room.players.forEach(p => {
    if (!p.isActive) return;
    if (p.sessionBuyIn == null) return;
    const cur = p.sessionMaxChips ?? 0;
    if (p.chips > cur) p.sessionMaxChips = p.chips;
  });
};

const rooms: Map<string, Room> = new Map();

// Timers de escalado de ciegas (solo salas en modo torneo)
const blindTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

export const clearBlindTimer = (roomId: string) => {
  const t = blindTimers.get(roomId);
  if (t) { clearTimeout(t); blindTimers.delete(roomId); }
};

export const getRooms = () => {
  return Array.from(rooms.values())
    .sort((a, b) => (a.persistent === b.persistent ? 0 : a.persistent ? 1 : -1))
    .map(r => ({
      id: r.id,
      name: r.name,
      playerCount: r.players.filter(p => p.isActive).length,
      phase: r.phase,
      buyIn: r.buyIn,
      smallBlind: r.smallBlind,
      bigBlind: r.bigBlind,
      isTournament: !!r.isTournament,
      blindLevelDuration: r.blindLevelDuration || 0,
      gameType: r.gameType || 'poker',
      minBet: r.minBet,
      maxBet: r.maxBet
    }));
};

export const createRoom = (
  id: string, name: string, persistent = false, tierIndex = 0,
  blindDivisor = DEFAULT_BLIND_DIVISOR, blindLevelDuration = 0,
  gameType: GameType = 'poker', minBet?: number, maxBet?: number
): Room => {
  const buyIn = STAKE_TIERS[tierIndex] ?? STAKE_TIERS[0];
  const { smallBlind, bigBlind } = blindsFor(buyIn, blindDivisor);
  const newRoom: Room = {
    id,
    name,
    players: [],
    communityCards: [],
    pot: 0,
    phase: 'waiting',
    buyIn,
    smallBlind,
    bigBlind,
    currentTurnIndex: 0,
    dealerIndex: 0,
    deck: [],
    highestBet: 0,
    winners: [],
    persistent,
    lastActivityAt: Date.now(),
    isTournament: gameType === 'poker' && blindLevelDuration > 0,
    blindLevelDuration: gameType === 'poker' ? blindLevelDuration : 0,
    blindLevel: 0,
    startingChips: buyIn,
    startingSmallBlind: smallBlind,
    startingBigBlind: bigBlind,
    gameType,
    bjPhase: gameType === 'blackjack' ? 'waiting' : undefined,
    dealerCards: gameType === 'blackjack' ? [] : undefined,
    minBet: gameType === 'blackjack' ? Math.max(1, minBet || 1) : undefined,
    maxBet: gameType === 'blackjack' ? Math.max(1, maxBet || Math.floor(buyIn / 4)) : undefined
  };
  rooms.set(id, newRoom);
  return newRoom;
};

export const restoreRoom = (room: Room) => {
  rooms.set(room.id, room);
};

// Marca actividad real en la sala (acción de jugador, join, nueva mano). Resetea el contador de inactividad.
export const touchRoom = (roomId: string) => {
  const room = rooms.get(roomId);
  if (room) room.lastActivityAt = Date.now();
};

// Echa a TODOS de la sala (limpieza por inactividad). Devuelve los cash-outs pendientes para que la
// capa de BD reintegre las fichas al saldo. Borra la sala si no es persistente; si lo es, la vacía.
export const evictAll = (roomId: string): { userId: string; chips: number }[] => {
  const room = rooms.get(roomId);
  if (!room) return [];
  // Grabar historial para TODOS los jugadores con sesión abierta (incluso los busted con chips=0)
  room.players
    .filter(p => p.isActive && !p.hasCashedOut)
    .forEach(p => closePlayerSession(room, p, p.chips));
  const cashOuts = room.players
    .filter(p => p.isActive && !p.hasCashedOut && p.chips > 0)
    .map(p => ({ userId: p.userId, chips: p.chips }));

  if (!room.persistent) {
    clearBlindTimer(roomId);
    rooms.delete(roomId);
    deleteRoomFromDB(roomId).catch(e => console.error('DB delete error', e));
    return cashOuts;
  }

  // Sala persistente: la vaciamos y reseteamos a estado inicial.
  room.players = [];
  room.lastActivityAt = Date.now();
  room.communityCards = [];
  room.pot = 0;
  room.phase = 'waiting';
  room.currentTurnIndex = -1;
  room.highestBet = 0;
  room.winners = [];
  room.showdownAt = undefined;
  room.turnStartedAt = undefined;
  room.turnDuration = undefined;
  room.inGrace = false;
  room.paused = false;
  room.lastActivityAt = Date.now();
  // BlackJack: resetear su máquina de estados para que arranque limpio al volver alguien
  if (room.gameType === 'blackjack') {
    room.bjPhase = 'waiting';
    room.bjTurnUserId = undefined;
    room.bettingDeadline = undefined;
    room.dealerCards = [];
  }
  return cashOuts;
};

export const getRoom = (id: string): Room | undefined => rooms.get(id);

// 'joined' = nuevo asiento (hay que cobrar buy-in) | 'reconnected' = vuelve sin cobrar | 'full' = mesa llena | false = error
export const joinRoom = (roomId: string, player: Player): 'joined' | 'reconnected' | 'full' | false => {
  const room = rooms.get(roomId);
  if (!room) return false;
  room.lastActivityAt = Date.now();

  const isGameActive = room.gameType === 'blackjack'
    ? (room.bjPhase != null && room.bjPhase !== 'waiting' && room.bjPhase !== 'betting')
    : (room.phase !== 'waiting' && room.phase !== 'showdown');
  const existing = room.players.find(p => p.userId === player.userId);

  if (existing && !existing.hasCashedOut) {
    // Reconexión a un asiento todavía vivo: NO se cobra buy-in, conserva sus fichas
    existing.isActive = true;
    existing.isOnline = true;
    existing.offlineSince = undefined;
    existing.reducedTime = false; // al reconectar recupera sus tiempos normales
    existing.id = player.id;
    existing.name = player.name;
    existing.avatar = player.avatar;
    return 'reconnected';
  }

  if (existing && existing.hasCashedOut) {
    if (room.players.filter(p => p.isActive).length >= 8) return 'full';
    // Se había levantado de la mesa; vuelve a sentarse => nuevo buy-in
    existing.isActive = true;
    existing.id = player.id;
    existing.name = player.name;
    existing.avatar = player.avatar;
    existing.chips = player.chips;
    existing.balance = player.balance;
    if (player.lastBuyIn) existing.lastBuyIn = player.lastBuyIn;
    existing.hasCashedOut = false;
    existing.hasFolded = false;
    existing.hasActed = false;
    existing.currentBet = 0;
    existing.totalContribution = 0;
    existing.isSpectating = isGameActive;
    existing.isOnline = true;
    existing.offlineSince = undefined;
    existing.reducedTime = false;
    existing.sessionBuyIn = player.chips;
    existing.sessionMaxChips = player.chips;
    existing.sessionStartedAt = Date.now();
    return 'joined';
  }

  if (room.players.filter(p => p.isActive).length >= 8) return 'full';

  room.players.push({
    ...player,
    hasFolded: false,
    hasActed: false,
    currentBet: 0,
    totalContribution: 0,
    hasCashedOut: false,
    isOnline: true,
    reducedTime: false,
    isSpectating: isGameActive, // Wait for next hand if joining mid-game
    sessionBuyIn: player.chips,
    sessionMaxChips: player.chips,
    sessionStartedAt: Date.now(),
    bet: room.gameType === 'blackjack' ? 0 : undefined,
    bjStatus: room.gameType === 'blackjack' ? 'idle' : undefined
  });
  return 'joined';
};

// Devuelve la info para hacer cash-out del saldo en la capa de BD, o null si no hay nada que retirar
export const leaveRoom = (roomId: string, socketId: string): { userId: string; chips: number } | null => {
  const room = rooms.get(roomId);
  if (!room) return null;
  const player = room.players.find(p => p.id === socketId);
  if (!player || player.hasCashedOut) {
    // Ya estaba retirado: solo comprobamos si la sala quedó vacía (las persistentes nunca se borran)
    if (!room.persistent && room.players.every(p => !p.isActive)) {
        rooms.delete(roomId);
        deleteRoomFromDB(roomId).catch(e => console.error('DB delete error', e));
    }
    return null;
  }

  const isInHand = room.gameType === 'blackjack'
    ? (room.bjPhase != null && room.bjPhase !== 'waiting' && room.bjPhase !== 'betting' && room.bjPhase !== 'resolve')
    : (room.phase !== 'waiting' && room.phase !== 'showdown' && !player.isSpectating);

  const cashOut = { userId: player.userId, chips: player.chips };

  // Blackjack: si el jugador se va a mitad de mano (isInHand), pierde su apuesta total de esa mano.
  if (isInHand && room.gameType === 'blackjack' && (player.bet || 0) > 0) {
    let lostBet = player.bet || 0;
    if (player.bjHands && player.bjHands.length > 0) {
       lostBet = player.bjHands.reduce((sum, h) => sum + h.bet, 0);
    }
    player.chips = Math.max(0, player.chips - lostBet);
    cashOut.chips = player.chips;
    player.bet = 0;
    player.bjStatus = 'idle';
  }
  
  closePlayerSession(room, player, player.chips);

  if (isInHand && room.gameType !== 'blackjack') {
    player.hasFolded = true;
  }
  if (isInHand && room.gameType === 'blackjack') {
    // En blackjack, el jugador que se va abandona la mano: bet a 0, status idle.
    player.bet = 0;
    player.bjStatus = 'idle';
  }

  // Retiramos sus fichas (se devuelven al saldo) y marcamos el asiento como liberado
  player.chips = 0;
  player.isActive = false;
  player.hasCashedOut = true;
  player.cards = [];
  player.bjHands = undefined;
  player.bjActiveHandIndex = undefined;
  player.handName = undefined;

  if (isInHand && room.gameType !== 'blackjack') {
    const signal = checkRoundEnd(room);
    // 'continue' ya avanzó el turno dentro de checkRoundEnd; si la ronda se cerró, resolvemos en síncrono
    if (signal !== 'continue') {
      resolveRoundSync(room);
    }
  }

  // Clean up empty room
  if (room.players.every(p => !p.isActive)) {
    if (!room.persistent) {
      clearBlindTimer(roomId);
      rooms.delete(roomId);
      deleteRoomFromDB(roomId).catch(e => console.error('DB delete error', e));
    } else {
      room.phase = 'waiting';
      room.communityCards = [];
      room.pot = 0;
      room.highestBet = 0;
      room.currentTurnIndex = -1;
      room.winners = [];
      room.players.forEach(p => {
        p.cards = [];
        p.currentBet = 0;
        p.hasActed = false;
        p.totalContribution = 0;
        p.handName = undefined;
      });
    }
  }
  return cashOut;
};

// Recompra: el jugador arruinado vuelve a comprar fichas (el cobro del saldo se hace en la capa de BD)
export const rebuy = (roomId: string, userId: string, buyIn: number): boolean => {
  const room = rooms.get(roomId);
  if (!room) return false;
  const player = room.players.find(p => p.userId === userId);
  if (!player || player.chips > 0) return false; // Solo se recompra estando a 0
  player.chips = buyIn;
  player.balance -= buyIn;
  player.hasCashedOut = false;
  player.isSpectating = true; // Se incorpora en la siguiente mano
  player.sessionBuyIn = (player.sessionBuyIn ?? 0) + buyIn;
  if (buyIn > (player.sessionMaxChips ?? 0)) player.sessionMaxChips = buyIn;
  if (!player.sessionStartedAt) player.sessionStartedAt = Date.now();
  return true;
};

export const startGame = (roomId: string) => {
  const room = rooms.get(roomId);
  // Se necesitan al menos 2 jugadores activos CON fichas para repartir
  if (!room || room.players.filter(p => p.isActive && p.chips > 0).length < 2) return false;

  room.deck = createDeck();
  shuffleDeck(room.deck);
  room.communityCards = [];
  room.pot = 0;
  room.highestBet = 0;
  room.winners = [];
  room.inGrace = false;

  // Los activos con fichas entran en la mano; los arruinados (chips 0) quedan como espectadores hasta que recompren
  room.players.filter(p => p.isActive).forEach(p => {
    p.isSpectating = p.chips <= 0;
    if (p.isSpectating) { p.cards = []; p.hasFolded = false; p.currentBet = 0; p.handName = ''; }
    // Si sigue offline al EMPEZAR esta mano, su turno se reduce a 8s sin gracia
    p.reducedTime = p.isOnline === false;
  });

  dealCards(room); // This also resets hasFolded, hasActed, currentBet
  updateHandNames(room);
  
  room.phase = 'preflop';
  
  // Avanzar el dealer al siguiente jugador que entra en la mano (activo y no espectador)
  do {
    room.dealerIndex = (room.dealerIndex + 1) % room.players.length;
  } while (!room.players[room.dealerIndex].isActive || room.players[room.dealerIndex].isSpectating);

  const activePlayers = room.players.filter(p => p.isActive && !p.isSpectating);
  const numActive = activePlayers.length;

  const dealerActiveIndex = activePlayers.findIndex(p => p.id === room.players[room.dealerIndex].id);
  
  let sbActiveIndex = numActive === 2 ? dealerActiveIndex : (dealerActiveIndex + 1) % numActive;
  let bbActiveIndex = numActive === 2 ? (dealerActiveIndex + 1) % numActive : (dealerActiveIndex + 2) % numActive;
  
  const sbAmount = room.smallBlind;
  const bbAmount = room.bigBlind;
  
  if (activePlayers[sbActiveIndex]) {
    const amount = Math.min(sbAmount, activePlayers[sbActiveIndex].chips);
    activePlayers[sbActiveIndex].currentBet = amount;
    activePlayers[sbActiveIndex].chips -= amount;
    activePlayers[sbActiveIndex].totalContribution += amount;
  }
  if (activePlayers[bbActiveIndex]) {
    const amount = Math.min(bbAmount, activePlayers[bbActiveIndex].chips);
    activePlayers[bbActiveIndex].currentBet = amount;
    activePlayers[bbActiveIndex].chips -= amount;
    activePlayers[bbActiveIndex].totalContribution += amount;
  }
  
  room.highestBet = Math.min(bbAmount, activePlayers[bbActiveIndex]?.currentBet || 0);
  
  // Turno es del siguiente al BB
  let turnActiveIndex = (bbActiveIndex + 1) % numActive;
  room.currentTurnIndex = room.players.findIndex(p => p.id === activePlayers[turnActiveIndex].id);

  // Modo torneo: arrancar reloj de ciegas en la primera mano (idempotente)
  startBlindEscalation(room.id);

  return true;
};

export const handlePlayerAction = (roomId: string, userId: string, actionType: string, amount?: number) => {
  const room = rooms.get(roomId);
  if (!room || room.phase === 'waiting' || room.phase === 'showdown') return false;

  const playerIndex = room.players.findIndex(p => p.userId === userId);
  if (playerIndex === -1 || playerIndex !== room.currentTurnIndex) return false;

  const player = room.players[playerIndex];
  
  // Calcular cantidad requerida para igualar
  const toCall = room.highestBet - player.currentBet;

  if (actionType === 'Fold') {
    player.hasFolded = true;
  } 
  else if (actionType === 'Check') {
    if (toCall > 0) return false; // No puede hacer check si debe igualar
  } 
  else if (actionType === 'Call') {
    const callAmount = Math.min(toCall, player.chips);
    player.chips -= callAmount;
    player.currentBet += callAmount;
    player.totalContribution += callAmount;
  } 
  else if (actionType === 'Raise') {
    const raiseTotal = amount || 0; 
    
    // Si intenta subir menos o igual a lo que ya hay apostado, no es un Raise válido
    // (A menos que esté yendo All-in por menos de highestBet, lo cual en las reglas suele ser un Call, 
    // pero aquí lo bloqueamos como Raise para forzarle a usar Call).
    if (raiseTotal <= room.highestBet && raiseTotal < player.chips + player.currentBet) return false;

    const additionalAmount = raiseTotal - player.currentBet;
    if (additionalAmount <= 0) return false;
    
    // Si intenta subir más de lo que tiene, le limitamos al All-in
    const actualAdditional = Math.min(additionalAmount, player.chips);
    
    player.chips -= actualAdditional;
    player.currentBet += actualAdditional;
    player.totalContribution += actualAdditional;
    
    if (player.currentBet > room.highestBet) {
      room.highestBet = player.currentBet;
      // Nueva apuesta, los demás deben volver a hablar
      room.players.forEach(p => {
        if (p.id !== player.id && !p.hasFolded && p.isActive) {
          p.hasActed = false;
        }
      });
    }
  }

  player.hasActed = true;
  const signal = checkRoundEnd(room);
  return signal; // 'advancePhase' | 'endRound' | 'continue'
};

const checkRoundEnd = (room: Room): 'advancePhase' | 'endRound' | 'continue' => {
  const activePlayers = room.players.filter(p => p.isActive && !p.hasFolded && !p.isSpectating);
  
  if (activePlayers.length <= 1) {
    return 'endRound';
  }

  const allActedAndMatched = activePlayers.every(p => (p.hasActed && p.currentBet === room.highestBet) || p.chips === 0);

  if (allActedAndMatched) {
    return 'advancePhase';
  } else {
    advanceTurn(room);
    return 'continue';
  }
};

const advanceTurn = (room: Room) => {
  const numPlayers = room.players.length;
  if (numPlayers === 0) { room.currentTurnIndex = -1; return; }
  let nextIndex = (room.currentTurnIndex + 1) % numPlayers;
  let count = 0;

  while (count < numPlayers && (
    !room.players[nextIndex].isActive ||
    room.players[nextIndex].hasFolded ||
    room.players[nextIndex].chips === 0 ||
    room.players[nextIndex].isSpectating
  )) {
    nextIndex = (nextIndex + 1) % numPlayers;
    count++;
  }

  room.currentTurnIndex = count < numPlayers ? nextIndex : -1;
};

export const gatherBetsToPot = (room: Room) => {
  room.players.forEach(p => {
    room.pot += p.currentBet;
    p.currentBet = 0;
  });
};

// Jugadores que siguen vivos en la mano (no foldeados ni espectadores)
export const contenders = (room: Room): Player[] =>
  room.players.filter(p => p.isActive && !p.hasFolded && !p.isSpectating);

// ¿Se acabó toda decisión de apuesta en lo que queda de mano? (como mucho 1 jugador con fichas)
export const bettingClosed = (room: Room): boolean => {
  const withChips = room.players.filter(p => p.isActive && !p.hasFolded && !p.isSpectating && p.chips > 0);
  return withChips.length <= 1;
};

// Coloca el turno en el primer jugador que PUEDE actuar tras el dealer. Si no hay nadie, deja -1.
const setTurnToFirstActor = (room: Room) => {
  const len = room.players.length;
  let nextTurn = (room.dealerIndex + 1) % len;
  let guard = 0;
  while (guard < len && (
    !room.players[nextTurn].isActive ||
    room.players[nextTurn].hasFolded ||
    room.players[nextTurn].chips === 0 ||
    room.players[nextTurn].isSpectating
  )) {
    nextTurn = (nextTurn + 1) % len;
    guard++;
  }
  room.currentTurnIndex = guard < len ? nextTurn : -1;
};

// Reparte la siguiente calle (flop/turn/river) o pasa a showdown desde river. NO calcula ganadores.
export const advanceStreet = (room: Room) => {
  gatherBetsToPot(room);
  room.players.forEach(p => { p.hasActed = false; });
  room.highestBet = 0;

  if (room.phase === 'preflop') {
    room.phase = 'flop';
    room.communityCards.push(room.deck.pop()!, room.deck.pop()!, room.deck.pop()!);
  } else if (room.phase === 'flop') {
    room.phase = 'turn';
    room.communityCards.push(room.deck.pop()!);
  } else if (room.phase === 'turn') {
    room.phase = 'river';
    room.communityCards.push(room.deck.pop()!);
  } else if (room.phase === 'river') {
    room.phase = 'showdown';
  }

  updateHandNames(room);

  if (room.phase !== 'showdown') setTurnToFirstActor(room);
};

// Resolución SÍNCRONA: se usa cuando un jugador abandona y hay que cerrar la mano sin animación.
// (El flujo normal con animaciones lo orquesta index.ts calle a calle con retardos.)
export const resolveRoundSync = (room: Room) => {
  for (let guard = 0; guard < 8; guard++) {
    if (contenders(room).length <= 1) { endRound(room); return; }
    if (room.phase === 'showdown') { endRound(room); return; }
    if (room.phase === 'river') { advanceStreet(room); endRound(room); return; }
    advanceStreet(room);
    if (!bettingClosed(room)) return; // aún se puede apostar con normalidad
  }
};

export const endRound = (room: Room) => {
  gatherBetsToPot(room);
  const totalPotForHistory = room.pot;
  room.phase = 'showdown';
  room.currentTurnIndex = -1; // En showdown ya no hay turno de nadie
  room.showdownAt = Date.now(); // marca el inicio del showdown: "next hand" bloqueado 5s
  const activePlayers = room.players.filter(p => p.isActive && !p.hasFolded && !p.isSpectating);

  if (activePlayers.length === 1) {
    // Solo queda uno, se lo lleva todo
    const winner = activePlayers[0];
    const won = room.pot;
    winner.chips += won;
    room.pot = 0;
    room.winners = [{ id: winner.id, amount: won, handName: 'Won by fold', winningCards: [] }];
  } else if (activePlayers.length > 1) {
    // Showdown con múltiples jugadores, calculamos side pots
    let remainingPot = room.pot;
    let playersForPot = [...activePlayers].sort((a, b) => a.totalContribution - b.totalContribution);
    room.winners = [];

    while (remainingPot > 0 && playersForPot.length > 0) {
      // Cogemos el que menos aportó de los que quedan
      const minContribution = playersForPot[0].totalContribution;
      
      // Construimos el bote secundario actual basado en esta aportación mínima
      // Todos los que llegaron hasta aquí (incluidos fold) pueden haber contribuido a este bote.
      // Simplificación: asumimos que el remainingPot se compone de lo que queda de las aportaciones.
      let currentSidePot = 0;
      room.players.forEach(p => {
        const amountFromPlayer = Math.min(p.totalContribution, minContribution);
        currentSidePot += amountFromPlayer;
        p.totalContribution -= amountFromPlayer; // Lo descontamos
      });
      remainingPot -= currentSidePot;

      if (currentSidePot > 0) {
        // ¿Quién gana este bote? Solo los activePlayers que llegaron a este bote pueden ganarlo
        const eligiblePlayers = playersForPot.filter(p => p.isActive && !p.hasFolded);
        
        // Creamos una sala temporal para evaluar la mano solo con los elegibles
        const tempRoom: Room = { ...room, players: eligiblePlayers };
        const evaluatedWinnersInfo = evaluateHands(tempRoom); 
        // evaluatedWinnersInfo: { playerId, handName, winningCards }[]
        
        const splitAmount = Math.floor(currentSidePot / evaluatedWinnersInfo.length);
        
        evaluatedWinnersInfo.forEach((wInfo: any) => {
          const winner = room.players.find(p => p.id === wInfo.playerId);
          if (winner) {
            winner.chips += splitAmount;
            
            // Añadir al registro de ganadores
            const existingWinner = room.winners?.find(w => w.id === winner.id);
            if (existingWinner) {
              existingWinner.amount += splitAmount;
            } else {
              room.winners?.push({
                id: winner.id,
                amount: splitAmount,
                handName: wInfo.handName,
                winningCards: wInfo.winningCards
              });
            }
          }
        });
      }
      
      // Quitamos de playersForPot a los que ya cubrieron su totalContribution máxima
      playersForPot = playersForPot.filter(p => p.totalContribution > 0);
    }
    room.pot = 0; // Vaciamos el bote global
  }

  const wonByFold = activePlayers.length === 1;
  const historyEntry: HandHistory = {
    id: uuidv4(),
    timestamp: Date.now(),
    communityCards: [...room.communityCards],
    pot: totalPotForHistory,
    wonByFold,
    winners: room.winners ? room.winners.map(w => {
      const winnerPlayer = room.players.find(p => p.id === w.id);
      return {
        userId: winnerPlayer ? winnerPlayer.userId : w.id,
        amount: w.amount,
        handName: w.handName,
        winningCards: [...w.winningCards]
      };
    }) : [],
    players: room.players.filter(p => p.isActive).map(p => {
      const winnerData = room.winners?.find(w => w.id === p.id);
      return {
        userId: p.userId,
        name: p.name,
        cards: [...p.cards],
        chipsDelta: winnerData ? winnerData.amount : 0,
        handName: p.handName,
        hasFolded: p.hasFolded
      };
    })
  };

  if (!room.history) room.history = [];
  room.history.unshift(historyEntry);
  if (room.history.length > 3) room.history.pop();

  bumpMaxChips(room);

  // XP a todos los que jugaron esta mano: ganadores mucha, perdedores poca; escala con la mano.
  awardHandXp(
    room,
    room.players
      .filter(p => p.isActive && !p.isSpectating && p.cards.length > 0)
      .map(p => ({
        userId: p.userId,
        amount: pokerXp(!!room.winners?.some(w => w.id === p.id), p.handName),
      }))
  ).catch(err => console.error('Error XP poker:', err));

  // La sala se queda en 'showdown' esperando a que llamen a nextHand()
};

export const nextHand = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room || room.phase !== 'showdown') return false;

  room.phase = 'waiting';
  room.players.forEach(p => {
    p.currentBet = 0;
    p.hasActed = false;
    p.totalContribution = 0;
  });
  room.highestBet = 0;
  room.winners = [];
  return true;
};

// ---- Modo torneo: escalado de ciegas ----

// Arranca el reloj de ciegas en la primera mano (idempotente).
export const startBlindEscalation = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room || !room.isTournament || !room.blindLevelDuration) return;
  if (room.blindLevelStartedAt) return; // ya en marcha
  room.blindLevelStartedAt = Date.now();
  scheduleBlindEscalation(roomId);
};

const scheduleBlindEscalation = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room || !room.isTournament || !room.blindLevelDuration) return;
  clearBlindTimer(roomId);
  const t = setTimeout(() => escalateBlinds(roomId), room.blindLevelDuration);
  blindTimers.set(roomId, t);
};

const escalateBlinds = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room || !room.isTournament || room.tournamentEnded) return;
  const nb = nextBlinds(room.bigBlind);
  room.smallBlind = nb.smallBlind;
  room.bigBlind = nb.bigBlind;
  room.blindLevel = (room.blindLevel || 0) + 1;
  room.blindLevelStartedAt = Date.now();
  scheduleBlindEscalation(roomId);
  broadcastRoom(roomId);
};

// Marca a los jugadores recién eliminados (chips 0) con su orden de bust.
export const markBustedPlayers = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room || !room.isTournament) return;
  room.players.forEach(p => {
    if (p.isActive && p.chips <= 0 && p.bustedSeq == null) {
      room.bustCounter = (room.bustCounter || 0) + 1;
      p.bustedSeq = room.bustCounter;
    }
  });
};

// El torneo termina cuando, habiendo empezado (>=2 jugadores), solo 1 conserva fichas.
export const checkTournamentEnd = (roomId: string): { ended: boolean; winner?: Player } => {
  const room = rooms.get(roomId);
  if (!room || !room.isTournament) return { ended: false };
  const active = room.players.filter(p => p.isActive);
  const withChips = active.filter(p => p.chips > 0);
  if (active.length >= 2 && withChips.length <= 1) {
    return { ended: true, winner: withChips[0] };
  }
  return { ended: false };
};

// Reinicia el torneo con la misma config. Devuelve deltas de saldo a aplicar en BD.
export const restartTournament = (roomId: string): { userId: string; socketId: string; delta: number }[] => {
  const room = rooms.get(roomId);
  if (!room) return [];
  clearBlindTimer(roomId);
  const buyIn = room.startingChips ?? room.buyIn;
  const deltas: { userId: string; socketId: string; delta: number }[] = [];
  room.players.forEach(p => {
    if (!p.isActive) return;
    const delta = p.chips - buyIn; // banca ganancias / cobra nueva entrada
    deltas.push({ userId: p.userId, socketId: p.id, delta });
    p.balance += delta;
    // Cerramos historial de la sesión que acaba (cash_out = fichas actuales)
    closePlayerSession(room, p, p.chips);
    p.chips = buyIn;
    p.isSpectating = false;
    p.hasCashedOut = false;
    p.bustedSeq = undefined;
    p.cards = [];
    p.currentBet = 0;
    p.hasFolded = false;
    p.hasActed = false;
    p.totalContribution = 0;
    p.handName = '';
    // Arrancamos sesión nueva con el nuevo buy-in
    p.sessionBuyIn = buyIn;
    p.sessionMaxChips = buyIn;
    p.sessionStartedAt = Date.now();
  });
  room.tournamentEnded = false;
  room.phase = 'waiting';
  room.blindLevel = 0;
  room.bustCounter = 0;
  room.blindLevelStartedAt = undefined;
  room.smallBlind = room.startingSmallBlind ?? room.smallBlind;
  room.bigBlind = room.startingBigBlind ?? room.bigBlind;
  room.communityCards = [];
  room.pot = 0;
  room.highestBet = 0;
  room.winners = [];
  return deltas;
};

export const findActiveRoomForUser = (userId: string): string | undefined => {
  for (const room of rooms.values()) {
    const player = room.players.find(p => p.userId === userId);
    if (player && player.isActive && !player.hasCashedOut) {
      return room.id;
    }
  }
  return undefined;
};

export const resumeBlindTimers = () => {
  for (const [roomId, room] of rooms.entries()) {
    if (room.isTournament && room.blindLevelDuration && room.blindLevelStartedAt) {
      const elapsed = Date.now() - room.blindLevelStartedAt;
      const remaining = Math.max(0, room.blindLevelDuration - elapsed);
      clearBlindTimer(roomId);
      const t = setTimeout(() => escalateBlinds(roomId), remaining);
      blindTimers.set(roomId, t);
    }
  }
};

// ============================================================
// BLACKJACK
// ============================================================

export const BJ_BETTING_DURATION = 7_000;
export const BJ_PLAYER_ACTION_DURATION = 15_000;
export const BJ_RESOLVE_DURATION = 7_000;
export const BJ_DEALER_REVEAL_DELAY = 1_400; // dealer pause before flipping/playing

// Arranca una nueva ronda de blackjack: limpia mano previa, abre fase betting.
// Devuelve false si no hay al menos 1 jugador activo con fichas.
export const startBlackjackRound = (roomId: string): boolean => {
  const room = rooms.get(roomId);
  if (!room || room.gameType !== 'blackjack') return false;
  
  // Guardar apuestas tempranas (jugadores que ya apostaron durante resolve)
  const earlyBets = new Map<string, { bet: number; status: string }>();
  room.players.forEach(p => {
    if (p.bjHasContinued && (p.bet || 0) > 0) {
      earlyBets.set(p.userId, { bet: p.bet!, status: p.bjStatus || 'playing' });
    }
  });
  
  // Activar de espectador a participante a los que entraron en la ronda anterior
  room.players.forEach(p => {
    if (p.isActive && p.isSpectating) p.isSpectating = false;
    if (p.isActive) p.reducedTime = p.isOnline === false;
    p.bjHasContinued = false;
  });
  const eligibles = room.players.filter(p => p.isActive && !p.isSpectating && p.chips > 0);
  if (eligibles.length < 1) return false;
  resetBlackjackHand(room);
  room.bjPhase = 'betting';
  room.bjTurnUserId = undefined;
  room.dealerCards = [];
  room.lastActivityAt = Date.now();
  
  // Restaurar apuestas tempranas
  for (const [userId, saved] of earlyBets) {
    const p = room.players.find(pl => pl.userId === userId);
    if (p && p.isActive && !p.isSpectating && p.chips > 0) {
      p.bet = saved.bet;
      p.bjStatus = 'playing';
    }
  }
  
  // Preservar bettingDeadline SOLO si hay apuestas tempranas Y el deadline aún no ha expirado.
  // En cualquier otro caso, limpiar para que el timer se re-arme al apostar.
  if (earlyBets.size > 0 && room.bettingDeadline && room.bettingDeadline > Date.now()) {
    // Timer sigue vivo — no tocamos nada
  } else {
    room.bettingDeadline = undefined;
  }
  
  return true;
};

// Coloca apuesta del jugador. Devuelve true si la apuesta queda registrada.
export const placeBlackjackBet = (roomId: string, userId: string, amount: number): boolean => {
  const room = rooms.get(roomId);
  if (!room || room.gameType !== 'blackjack') return false;
  const player = room.players.find(p => p.userId === userId);
  if (!player || !player.isActive || player.isSpectating || player.chips <= 0) return false;
  
  if (room.bjPhase !== 'betting') {
    if (!(room.bjPhase === 'resolve' && player.bjHasContinued)) return false;
  }
  
  const min = room.minBet || 1;
  const max = Math.min(room.maxBet || player.chips, player.chips);
  const safe = Math.floor(Math.max(min, Math.min(max, amount)));
  if (!Number.isFinite(safe) || safe <= 0) return false;
  player.bet = safe;
  player.bjStatus = 'playing'; // se mantendrá hasta deal; deal sobrescribe a blackjack si procede
  room.lastActivityAt = Date.now();
  return true;
};

// ¿Todos los jugadores activos con fichas ya apostaron?
export const allBlackjackBetsIn = (room: Room): boolean => {
  if (room.bjPhase !== 'betting') return false;
  const eligibles = room.players.filter(p => p.isActive && !p.isSpectating && p.chips > 0);
  return eligibles.length > 0 && eligibles.every(p => (p.bet || 0) > 0);
};

// Reparte. Si NADIE apostó, vuelve a betting (skip ronda). Si todos tienen blackjack/bust, salta a resolve.
// Devuelve siguiente bjPhase resultante.
export const dealBlackjackHands = (roomId: string): 'playerAction' | 'dealerAction' | 'betting' | null => {
  const room = rooms.get(roomId);
  if (!room || room.gameType !== 'blackjack') return null;
  
  // Limpiar apuestas de los que estaban admirando sin darle a continuar
  room.players.forEach(p => {
    if (!p.bjHasContinued && room.bjPhase === 'resolve') p.bet = 0;
  });
  
  const bettors = room.players.filter(p => p.isActive && !p.isSpectating && (p.bet || 0) > 0);
  if (bettors.length === 0) {
    // Nadie apostó → reabrir betting
    room.bjPhase = 'betting';
    room.bettingDeadline = undefined;
    return 'betting';
  }
  // Asegurar que bajamos la bandera de continuación para todos al repartir
  room.players.forEach(p => p.bjHasContinued = false);
  // Matar el deadline de apuestas: ya repartimos → el timer del cliente no debe quedarse pillado en 0
  room.bettingDeadline = undefined;

  // Asegurar mazo fresco al inicio de cada ronda
  room.deck = createDeck();
  shuffleDeck(room.deck);
  room.bjPhase = 'dealing';
  dealBlackjack(room);
  // Si todos los que apostaron sacaron blackjack → directo a dealer
  const stillPlaying = bettors.filter(p => p.bjStatus === 'playing');
  if (stillPlaying.length === 0) {
    room.bjPhase = 'dealerAction';
    room.bjTurnUserId = undefined;
    return 'dealerAction';
  }
  // Modelo concurrente: todos juegan su mano a la vez (sin turno). bjTurnUserId no se usa.
  room.bjPhase = 'playerAction';
  room.bjTurnUserId = undefined;
  return 'playerAction';
};

// ¿Queda algún jugador con mano viva ('playing')?
const anyStillPlaying = (room: Room): boolean =>
  room.players.some(p => {
    if (!p.isActive || p.isSpectating || (p.bet || 0) === 0) return false;
    if (p.bjHands && p.bjHands.length > 0) return p.bjHands.some(h => h.status === 'playing');
    return p.bjStatus === 'playing';
  });

export const blackjackPlayerAction = (
  roomId: string, userId: string, action: 'Hit' | 'Stand' | 'Double' | 'Surrender' | 'Split'
): 'playerAction' | 'dealerAction' | null => {
  const room = rooms.get(roomId);
  if (!room || room.gameType !== 'blackjack' || room.bjPhase !== 'playerAction') return null;
  // Concurrente: cada jugador actúa sobre SU mano cuando quiera (no hay turno).
  const player = room.players.find(p => p.userId === userId);
  if (!player) return null;

  if (player.bjHands && player.bjHands.length > 0) {
    const activeIndex = player.bjActiveHandIndex ?? 0;
    const hand = player.bjHands[activeIndex];
    if (!hand || hand.status !== 'playing') return null;

    if (action === 'Hit') {
      if (room.deck.length === 0) { room.deck = createDeck(); shuffleDeck(room.deck); }
      hand.cards.push(room.deck.pop()!);
      const v = bjHandValue(hand.cards);
      if (v.total > 21) hand.status = 'bust';
      else if (v.total === 21) hand.status = 'stand';
    } else if (action === 'Stand') {
      hand.status = 'stand';
    } else if (action === 'Double') {
      if (hand.cards.length !== 2) return null;
      const totalBet = player.bjHands.reduce((sum, h) => sum + h.bet, 0);
      if (player.chips < totalBet + hand.bet) return null;
      hand.doubled = true;
      hand.bet *= 2;
      if (room.deck.length === 0) { room.deck = createDeck(); shuffleDeck(room.deck); }
      hand.cards.push(room.deck.pop()!);
      const v = bjHandValue(hand.cards);
      hand.status = v.total > 21 ? 'bust' : 'stand';
    } else if (action === 'Surrender') {
      if (hand.cards.length !== 2) return null;
      hand.status = 'surrender';
    } else if (action === 'Split') {
      if (hand.cards.length !== 2) return null;
      if (player.bjHands.length >= 4) return null; // Max splits
      const p1 = bjHandValue([hand.cards[0]]).total;
      const p2 = bjHandValue([hand.cards[1]]).total;
      const isPair = hand.cards[0].rank === hand.cards[1].rank;
      if (!isPair) return null;

      const totalBet = player.bjHands.reduce((sum, h) => sum + h.bet, 0);
      if (player.chips < totalBet + hand.bet) return null;

      const splitCard = hand.cards.pop()!;
      const newHand: import('../../shared/types').BjHand = {
        cards: [splitCard],
        bet: hand.bet,
        status: 'playing'
      };

      player.bjHands.splice(activeIndex + 1, 0, newHand);

      if (room.deck.length < 2) { room.deck = createDeck(); shuffleDeck(room.deck); }
      newHand.cards.push(room.deck.pop()!);
      hand.cards.push(room.deck.pop()!);

      if (bjHandValue(newHand.cards).total === 21) newHand.status = 'stand';
      if (bjHandValue(hand.cards).total === 21) hand.status = 'stand';

      player.bjActiveHandIndex = activeIndex + 1; // Play the new hand first
    } else {
      return null;
    }

    if (player.bjHands[player.bjActiveHandIndex!].status !== 'playing') {
      let nextActive = -1;
      for (let i = player.bjHands.length - 1; i >= 0; i--) {
        if (player.bjHands[i].status === 'playing') {
          nextActive = i;
          break;
        }
      }
      if (nextActive !== -1) player.bjActiveHandIndex = nextActive;
    }

    player.bjStatus = player.bjHands.some(h => h.status === 'playing') ? 'playing' : player.bjHands[0].status;
    player.cards = player.bjHands[0].cards;
    player.bet = player.bjHands.reduce((acc, h) => acc + h.bet, 0);

  } else {
    // legacy mode
    if (player.bjStatus !== 'playing') return null;
    if (action === 'Hit') {
      if (room.deck.length === 0) { room.deck = createDeck(); shuffleDeck(room.deck); }
      player.cards.push(room.deck.pop()!);
      const v = bjHandValue(player.cards);
      if (v.total > 21) player.bjStatus = 'bust';
      else if (v.total === 21) player.bjStatus = 'stand';
    } else if (action === 'Stand') {
      player.bjStatus = 'stand';
    } else if (action === 'Double') {
      if (player.cards.length !== 2) return null;
      if (player.chips < (player.bet || 0) * 2) return null;
      player.bjDoubled = true;
      player.bet = (player.bet || 0) * 2;
      if (room.deck.length === 0) { room.deck = createDeck(); shuffleDeck(room.deck); }
      player.cards.push(room.deck.pop()!);
      const v = bjHandValue(player.cards);
      player.bjStatus = v.total > 21 ? 'bust' : 'stand';
    } else if (action === 'Surrender') {
      if (player.cards.length !== 2) return null;
      player.bjStatus = 'surrender';
    } else {
      return null;
    }
  }

  room.lastActivityAt = Date.now();
  if (anyStillPlaying(room)) return 'playerAction';
  room.bjPhase = 'dealerAction';
  room.bjTurnUserId = undefined;
  return 'dealerAction';
};

export const forceStandRemaining = (roomId: string): boolean => {
  const room = rooms.get(roomId);
  if (!room || room.gameType !== 'blackjack' || room.bjPhase !== 'playerAction') return false;
  let changed = false;
  room.players.forEach(p => {
    if (p.isActive && !p.isSpectating && (p.bet || 0) > 0) {
      if (p.bjHands && p.bjHands.length > 0) {
        p.bjHands.forEach(h => {
          if (h.status === 'playing') {
            h.status = 'stand';
            changed = true;
          }
        });
        p.bjStatus = p.bjHands.some(h => h.status === 'playing') ? 'playing' : p.bjHands[0].status;
      } else if (p.bjStatus === 'playing') {
        p.bjStatus = 'stand';
        changed = true;
      }
    }
  });
  room.bjPhase = 'dealerAction';
  room.bjTurnUserId = undefined;
  return changed;
};

// Recompra en blackjack: usa el importe indicado (o el último buy-in si no se especifica).
// Devuelve el importe recomprado, o 0 si no procede.
export const rebuyBlackjack = (roomId: string, userId: string, requestedAmount?: number): number => {
  const room = rooms.get(roomId);
  if (!room || room.gameType !== 'blackjack') return 0;
  const player = room.players.find(p => p.userId === userId);
  if (!player || !player.isActive || player.chips > 0) return 0;
  const amount = requestedAmount && requestedAmount > 0 ? requestedAmount : (player.lastBuyIn && player.lastBuyIn > 0 ? player.lastBuyIn : 1000);
  player.chips = amount;
  player.balance -= amount;
  player.lastBuyIn = amount;
  player.isSpectating = false;
  player.sessionBuyIn = (player.sessionBuyIn ?? 0) + amount;
  if (amount > (player.sessionMaxChips ?? 0)) player.sessionMaxChips = amount;
  room.lastActivityAt = Date.now();
  return amount;
};

// Ejecuta dealerPlay + resolve. Pasa a fase 'resolve'.
export const finishBlackjackHand = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room || room.gameType !== 'blackjack') return;
  // Si nadie quedó vivo (todos bust), dealer no necesita jugar pero igual revelamos
  const anyStanding = room.players.some(p =>
    p.isActive && (p.bet || 0) > 0 && (p.bjStatus === 'stand' || p.bjStatus === 'blackjack')
  );
  if (anyStanding) bjDealerPlay(room);
  resolveBlackjack(room);
  room.bjPhase = 'resolve';
  room.showdownAt = Date.now();
  bumpMaxChips(room);

  // XP a los que apostaron: escala con el resultado (blackjack > win > push > derrota).
  awardHandXp(
    room,
    room.players
      .filter(p => p.isActive && (p.bet || 0) > 0)
      .map(p => ({ userId: p.userId, amount: blackjackXp(p.bjResult) }))
  ).catch(err => console.error('Error XP blackjack:', err));
  
  // Auto-continuar a los que NO apostaron en esta ronda: no participaron,
  // así que no necesitan pulsar Continuar para admirar nada.
  room.players.forEach(p => {
    if (p.isActive && !p.isSpectating && (p.bet || 0) === 0) {
      p.bjHasContinued = true;
    }
  });
};

// Devuelve true si el bjPhase y la fecha indican que el dealer debe revelar/jugar.
export const shouldRunDealer = (room: Room): boolean =>
  room.gameType === 'blackjack' && room.bjPhase === 'dealerAction';
