import { Room, Player, createDeck, shuffleDeck, dealCards, evaluateHands, updateHandNames } from './pokerEngine';

const rooms: Map<string, Room> = new Map();

export const getRooms = () => {
  return Array.from(rooms.values()).map(r => ({
    id: r.id,
    name: r.name,
    playerCount: r.players.filter(p => p.isActive).length,
    phase: r.phase
  }));
};

export const createRoom = (id: string, name: string): Room => {
  const newRoom: Room = {
    id,
    name,
    players: [],
    communityCards: [],
    pot: 0,
    phase: 'waiting',
    currentTurnIndex: 0,
    dealerIndex: 0,
    deck: [],
    highestBet: 0,
    winners: []
  };
  rooms.set(id, newRoom);
  return newRoom;
};

export const getRoom = (id: string): Room | undefined => rooms.get(id);

export const joinRoom = (roomId: string, player: Player) => {
  const room = rooms.get(roomId);
  if (!room) return false;
  
  const existing = room.players.find(p => p.userId === player.userId);
  if (existing) {
    existing.isActive = true;
    existing.id = player.id; // Update socket id
  } else {
    // Add missing defaults for new players
    const newPlayer = {
      ...player,
      hasFolded: false,
      hasActed: false,
      currentBet: 0,
      totalContribution: 0
    };
    room.players.push(newPlayer);
  }
  return true;
};

export const leaveRoom = (roomId: string, socketId: string) => {
  const room = rooms.get(roomId);
  if (!room) return;
  const player = room.players.find(p => p.id === socketId);
  if (player) {
    player.isActive = false;
    if (room.phase !== 'waiting') {
      player.hasFolded = true;
      checkRoundEnd(room); // User leaving might trigger round end
    }
    // Si la sala se queda vacía, la borramos
    if (room.players.every(p => !p.isActive)) {
      rooms.delete(roomId);
    }
  }
};

export const startGame = (roomId: string) => {
  const room = rooms.get(roomId);
  if (!room || room.players.filter(p => p.isActive).length < 2) return false;

  room.deck = createDeck();
  shuffleDeck(room.deck);
  room.communityCards = [];
  room.pot = 0;
  room.highestBet = 0;
  room.winners = [];
  
  dealCards(room); // This also resets hasFolded, hasActed, currentBet
  updateHandNames(room);
  
  room.phase = 'preflop';
  
  // Avanzar el dealer al siguiente jugador activo
  do {
    room.dealerIndex = (room.dealerIndex + 1) % room.players.length;
  } while (!room.players[room.dealerIndex].isActive);

  const activePlayers = room.players.filter(p => p.isActive);
  const numActive = activePlayers.length;

  const dealerActiveIndex = activePlayers.findIndex(p => p.id === room.players[room.dealerIndex].id);
  
  let sbActiveIndex = numActive === 2 ? dealerActiveIndex : (dealerActiveIndex + 1) % numActive;
  let bbActiveIndex = numActive === 2 ? (dealerActiveIndex + 1) % numActive : (dealerActiveIndex + 2) % numActive;
  
  const sbAmount = 1;
  const bbAmount = 2;
  
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

export const handlePlayerAction = (roomId: string, socketId: string, actionType: string, amount?: number) => {
  const room = rooms.get(roomId);
  if (!room || room.phase === 'waiting' || room.phase === 'showdown') return false;

  const playerIndex = room.players.findIndex(p => p.id === socketId);
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
  checkRoundEnd(room);
  return true;
};

const checkRoundEnd = (room: Room) => {
  const activePlayers = room.players.filter(p => p.isActive && !p.hasFolded);
  
  if (activePlayers.length <= 1) {
    endRound(room);
    return;
  }

  const allActedAndMatched = activePlayers.every(p => p.hasActed && p.currentBet === room.highestBet || p.chips === 0);

  if (allActedAndMatched) {
    advancePhase(room);
  } else {
    advanceTurn(room);
  }
};

const advanceTurn = (room: Room) => {
  const numPlayers = room.players.length;
  let nextIndex = (room.currentTurnIndex + 1) % numPlayers;
  
  // Find next active and not folded player
  while (!room.players[nextIndex].isActive || room.players[nextIndex].hasFolded || room.players[nextIndex].chips === 0) {
    nextIndex = (nextIndex + 1) % numPlayers;
    // Evitar loop infinito si algo va mal
    if (nextIndex === room.currentTurnIndex) break;
  }
  
  room.currentTurnIndex = nextIndex;
};

const gatherBetsToPot = (room: Room) => {
  room.players.forEach(p => {
    room.pot += p.currentBet;
    p.currentBet = 0;
  });
};

const advancePhase = (room: Room) => {
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
    endRound(room);
    return; // Ya terminamos
  }

  updateHandNames(room);

  // Setear el turno al primer jugador activo después del dealer
  let nextTurn = (room.dealerIndex + 1) % room.players.length;
  while (!room.players[nextTurn].isActive || room.players[nextTurn].hasFolded || room.players[nextTurn].chips === 0) {
    nextTurn = (nextTurn + 1) % room.players.length;
  }
  room.currentTurnIndex = nextTurn;
};

const endRound = (room: Room) => {
  gatherBetsToPot(room);
  room.phase = 'showdown';
  const activePlayers = room.players.filter(p => p.isActive && !p.hasFolded);

  if (activePlayers.length === 1) {
    // Solo queda uno, se lo lleva todo
    const winner = activePlayers[0];
    winner.chips += room.pot;
    room.pot = 0;
    room.winners = [{ id: winner.id, amount: room.pot, handName: 'Won by fold', winningCards: [] }];
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
