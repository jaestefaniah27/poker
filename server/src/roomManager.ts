import { Room, Player, createDeck, shuffleDeck, dealCards, evaluateHands, updateHandNames, STAKE_TIERS, blindsFor, DEFAULT_BLIND_DIVISOR } from './pokerEngine';

const rooms: Map<string, Room> = new Map();

export const getRooms = () => {
  return Array.from(rooms.values()).map(r => ({
    id: r.id,
    name: r.name,
    playerCount: r.players.filter(p => p.isActive).length,
    phase: r.phase,
    buyIn: r.buyIn,
    smallBlind: r.smallBlind,
    bigBlind: r.bigBlind
  }));
};

export const createRoom = (id: string, name: string, persistent = false, tierIndex = 0, blindDivisor = DEFAULT_BLIND_DIVISOR): Room => {
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
    lastActivityAt: Date.now()
  };
  rooms.set(id, newRoom);
  return newRoom;
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
  const cashOuts = room.players
    .filter(p => p.isActive && !p.hasCashedOut && p.chips > 0)
    .map(p => ({ userId: p.userId, chips: p.chips }));

  if (!room.persistent) {
    rooms.delete(roomId);
    return cashOuts;
  }

  // Sala persistente: la vaciamos y reseteamos a estado inicial.
  room.players = [];
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
  return cashOuts;
};

export const getRoom = (id: string): Room | undefined => rooms.get(id);

// 'joined' = nuevo asiento (hay que cobrar buy-in) | 'reconnected' = vuelve sin cobrar | 'full' = mesa llena | false = error
export const joinRoom = (roomId: string, player: Player): 'joined' | 'reconnected' | 'full' | false => {
  const room = rooms.get(roomId);
  if (!room) return false;
  room.lastActivityAt = Date.now();

  const isGameActive = room.phase !== 'waiting' && room.phase !== 'showdown';
  const existing = room.players.find(p => p.userId === player.userId);

  if (existing && !existing.hasCashedOut) {
    // Reconexión a un asiento todavía vivo: NO se cobra buy-in, conserva sus fichas
    existing.isActive = true;
    existing.isOnline = true;
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
    existing.hasCashedOut = false;
    existing.hasFolded = false;
    existing.hasActed = false;
    existing.currentBet = 0;
    existing.totalContribution = 0;
    existing.isSpectating = isGameActive;
    existing.isOnline = true;
    existing.reducedTime = false;
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
    isSpectating: isGameActive // Wait for next hand if joining mid-game
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
    if (!room.persistent && room.players.every(p => !p.isActive)) rooms.delete(roomId);
    return null;
  }

  const cashOut = { userId: player.userId, chips: player.chips };

  const isInHand = room.phase !== 'waiting' && room.phase !== 'showdown' && !player.isSpectating;
  if (isInHand) {
    player.hasFolded = true;
  }

  // Retiramos sus fichas (se devuelven al saldo) y marcamos el asiento como liberado
  player.chips = 0;
  player.isActive = false;
  player.hasCashedOut = true;

  if (isInHand) {
    const signal = checkRoundEnd(room);
    // 'continue' ya avanzó el turno dentro de checkRoundEnd; si la ronda se cerró, resolvemos en síncrono
    if (signal !== 'continue') {
      resolveRoundSync(room);
    }
  }

  if (!room.persistent && room.players.every(p => !p.isActive)) {
    rooms.delete(roomId);
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
