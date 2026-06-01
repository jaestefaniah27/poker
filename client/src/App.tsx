import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

const socket: Socket = io('http://localhost:3001');

// Componente para una carta individual
const PlayingCard = ({ rank, suit, hidden = false, className = '' }: { rank?: string, suit?: string, hidden?: boolean, className?: string }) => {
  const isMini = className.includes('w-10');
  const isSmall = className.includes('w-16');
  
  const pClass = isMini ? 'p-0.5' : isSmall ? 'p-1.5' : 'p-2';
  const rankClass = isMini ? 'text-[9px]' : isSmall ? 'text-lg' : 'text-xl';
  const suitClass = isMini ? 'text-xl' : isSmall ? 'text-3xl' : 'text-4xl';
  const roundedClass = isMini ? 'rounded-md' : isSmall ? 'rounded-lg' : 'rounded-xl';

  if (hidden) {
    return (
      <div className={`bg-white ${roundedClass} shadow-md relative overflow-hidden ${className}`}>
        <div className="absolute inset-1 rounded-lg border-2 border-gray-200">
           <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, #000000 5px, #000000 7px)' }}></div>
        </div>
      </div>
    );
  }

  const isRed = suit === 'h' || suit === 'd';
  const colorClass = isRed ? 'text-accent' : 'text-slate-900';
  const suitSymbol = suit === 'h' ? '♥' : suit === 'd' ? '♦' : suit === 'c' ? '♣' : '♠';

  const displayRank = rank === 'T' ? '10' : rank;

  return (
    <div className={`bg-white ${roundedClass} shadow-md flex flex-col justify-between ${pClass} ${colorClass} ${className}`}>
      <div className={`text-left font-bold leading-none ${rankClass}`}>{displayRank}</div>
      <div className={`text-center flex-1 flex items-center justify-center ${suitClass}`}>{suitSymbol}</div>
      <div className={`text-left font-bold leading-none rotate-180 ${rankClass}`}>{displayRank}</div>
    </div>
  );
};

// Avatar Component
const Avatar = ({ seed, opacity = 1 }: { seed: string, opacity?: number }) => {
  return (
    <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden" style={{ opacity }}>
      <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=transparent`} alt="avatar" className="w-full h-full object-cover scale-125" />
    </div>
  );
};

// Dealer Badge
const DealerBadge = () => (
  <div className="absolute -bottom-1 -right-1 bg-white text-black text-[11px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center border-2 border-black z-10 shadow-md">
    D
  </div>
);

// Chip Badge (Yellow circle for bets)
const BetChip = ({ amount }: { amount: number }) => (
  <div className="bg-[#2A2A2A] text-[#FDE047] text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 border border-gray-700 shadow-md">
    {amount}
  </div>
);

// MiniCard para Hand Rankings
const MiniCard = ({ rank, suit, active = true }: { rank: string, suit: string, active?: boolean }) => {
  const isRed = suit === 'h' || suit === 'd';
  const colorClass = isRed ? 'text-accent' : 'text-slate-900';
  const suitSymbol = suit === 'h' ? '♥' : suit === 'd' ? '♦' : suit === 'c' ? '♣' : '♠';
  const displayRank = rank === 'T' ? '10' : rank;
  
  return (
    <div className={`bg-white rounded shadow-sm flex flex-col justify-between p-1 w-[26px] h-9 ${colorClass} ${!active ? 'opacity-40 brightness-75 bg-gray-300' : ''}`}>
      <div className="text-left font-bold text-[9px] leading-none">{displayRank}</div>
      <div className="text-center text-[10px] -mt-0.5">{suitSymbol}</div>
    </div>
  );
};

const HAND_RANKINGS = [
  { name: "Royal Flush", desc: "Highest-ranking straight flush", cards: [{r:'A',s:'h'}, {r:'K',s:'h'}, {r:'Q',s:'h'}, {r:'J',s:'h'}, {r:'10',s:'h'}], active: [0,1,2,3,4] },
  { name: "Straight Flush", desc: "5 same-suit cards in sequence", cards: [{r:'J',s:'c'}, {r:'10',s:'c'}, {r:'9',s:'c'}, {r:'8',s:'c'}, {r:'7',s:'c'}], active: [0,1,2,3,4] },
  { name: "Four of a Kind", desc: "4 cards of the same rank", cards: [{r:'8',s:'s'}, {r:'8',s:'h'}, {r:'8',s:'c'}, {r:'8',s:'d'}, {r:'6',s:'s'}], active: [0,1,2,3] },
  { name: "Full House", desc: "Three of a kind with a pair", cards: [{r:'A',s:'h'}, {r:'A',s:'c'}, {r:'A',s:'d'}, {r:'10',s:'s'}, {r:'10',s:'d'}], active: [0,1,2,3,4] },
  { name: "Flush", desc: "5 cards of the same suit", cards: [{r:'K',s:'s'}, {r:'J',s:'s'}, {r:'9',s:'s'}, {r:'8',s:'s'}, {r:'2',s:'s'}], active: [0,1,2,3,4] },
  { name: "Straight", desc: "5 cards in sequence", cards: [{r:'10',s:'c'}, {r:'9',s:'d'}, {r:'8',s:'s'}, {r:'7',s:'h'}, {r:'6',s:'s'}], active: [0,1,2,3,4] },
  { name: "Three of a Kind", desc: "3 cards of the same rank", cards: [{r:'7',s:'s'}, {r:'7',s:'h'}, {r:'7',s:'c'}, {r:'K',s:'h'}, {r:'J',s:'c'}], active: [0,1,2] },
  { name: "Two Pair", desc: "2 cards of the same rank twice", cards: [{r:'J',s:'s'}, {r:'J',s:'h'}, {r:'4',s:'s'}, {r:'4',s:'d'}, {r:'Q',s:'c'}], active: [0,1,2,3] },
  { name: "Pair", desc: "2 cards of the same rank", cards: [{r:'K',s:'s'}, {r:'K',s:'d'}, {r:'9',s:'s'}, {r:'2',s:'c'}, {r:'10',s:'s'}], active: [0,1] },
  { name: "High Card", desc: "Highest-ranking card", cards: [{r:'A',s:'c'}, {r:'7',s:'s'}, {r:'3',s:'h'}, {r:'9',s:'s'}, {r:'2',s:'c'}], active: [0] },
];

function App() {
  const [playerName, setPlayerName] = useState('');
  const [user, setUser] = useState<{ id: string, name: string, balance: number } | null>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [currentRoom, setCurrentRoom] = useState<any | null>(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [showBetMenu, setShowBetMenu] = useState(false);
  const [betAmount, setBetAmount] = useState(2); 
  const [showRankingsModal, setShowRankingsModal] = useState(false);

  useEffect(() => {
    socket.on('roomsUpdated', (updatedRooms) => {
      setRooms(updatedRooms);
    });

    socket.on('roomUpdated', (room) => {
      setCurrentRoom(room);
    });

    fetch('http://localhost:3001/rooms')
      .then(res => res.json())
      .then(data => setRooms(data))
      .catch(console.error);

    return () => {
      socket.off('roomsUpdated');
      socket.off('roomUpdated');
    };
  }, []);

  const handleLogin = () => {
    if (!playerName.trim()) return;
    socket.emit('login', { userId: null, name: playerName }, (response: any) => {
      if (response.user) {
        setUser(response.user);
      }
    });
  };

  const createRoom = () => {
    if (!newRoomName.trim()) return;
    socket.emit('createRoom', { roomName: newRoomName }, (res: any) => {
      socket.emit('joinRoom', { roomId: res.roomId, user });
    });
  };

  const joinRoom = (roomId: string) => {
    socket.emit('joinRoom', { roomId, user });
  };

  const leaveRoom = () => {
    setCurrentRoom(null);
    socket.emit('leaveRoom');
  };

  const startGame = () => {
    if (currentRoom) {
      socket.emit('startGame', { roomId: currentRoom.id });
    }
  };

  const handleAction = (type: string, amount?: number) => {
    if (!currentRoom) return;
    socket.emit('playerAction', { roomId: currentRoom.id, action: type, amount });
    if (type === 'Raise') {
      setShowBetMenu(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-primary flex items-center justify-center p-4 font-sans">
        <div className="max-w-sm w-full space-y-8">
          <div className="text-center">
            <h1 className="text-5xl font-extrabold tracking-tighter mb-2">Offsuit</h1>
            <p className="text-gray-400 text-sm tracking-wide uppercase">Simple. Modern. Poker.</p>
          </div>
          <div className="bg-surface p-6 rounded-3xl shadow-2xl border border-surfaceLight space-y-6">
            <div>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className="w-full bg-background border border-gray-700 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-gray-400 transition-colors text-center text-lg placeholder-gray-600"
                placeholder="Enter your name"
              />
            </div>
            <button 
              className="w-full bg-white text-black font-bold py-4 px-4 rounded-2xl transition-transform active:scale-95"
              onClick={handleLogin}
            >
              Play
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!currentRoom) {
    return (
      <div className="min-h-screen bg-background text-primary p-6 flex flex-col items-center font-sans">
        <div className="w-full max-w-md">
          <header className="flex justify-between items-center mb-10 pt-4">
            <h1 className="text-3xl font-bold tracking-tight">Lobby</h1>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm">${user.balance}</span>
              <Avatar seed={user.id} />
            </div>
          </header>

          <div className="space-y-6">
            <div className="bg-surface p-5 rounded-3xl border border-surfaceLight">
              <h2 className="text-sm text-gray-400 uppercase tracking-wider font-semibold mb-4">Create Game</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Room name..."
                  className="flex-1 bg-background border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-gray-400 text-sm"
                />
                <button 
                  onClick={createRoom}
                  className="bg-white text-black px-6 py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform"
                >
                  Create
                </button>
              </div>
            </div>

            <div className="bg-surface p-5 rounded-3xl border border-surfaceLight">
              <h2 className="text-sm text-gray-400 uppercase tracking-wider font-semibold mb-4">Join Game</h2>
              {rooms.length === 0 ? (
                <p className="text-gray-500 text-center py-4 text-sm">No active games found.</p>
              ) : (
                <div className="space-y-2">
                  {rooms.map(room => (
                    <button 
                      key={room.id}
                      onClick={() => joinRoom(room.id)}
                      className="w-full flex justify-between items-center bg-background p-4 rounded-2xl border border-gray-800 hover:border-gray-500 transition-colors text-left"
                    >
                      <div>
                        <h3 className="font-semibold text-lg">{room.name}</h3>
                        <p className="text-xs text-gray-500">{room.playerCount} Players • {room.phase}</p>
                      </div>
                      <div className="bg-surfaceLight w-8 h-8 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Pantalla de Mesa de Juego ---
  const myPlayerIndex = currentRoom.players.findIndex((p: any) => p.id === socket.id);
  const myPlayer = currentRoom.players[myPlayerIndex];
  const opponents = currentRoom.players.filter((p: any) => p.id !== socket.id);
  
  const isDealer = (index: number) => currentRoom.dealerIndex === index;
  const isMyTurn = currentRoom.currentTurnIndex === myPlayerIndex;
  const currentTurnPlayer = currentRoom.players[currentRoom.currentTurnIndex];
  const toCallAmount = currentRoom.highestBet - (myPlayer?.currentBet || 0);
  const minRaise = currentRoom.highestBet > 0 ? currentRoom.highestBet * 2 : 2;

  return (
    <div className="min-h-screen bg-background text-primary font-sans flex justify-center">
      <div className="w-full max-w-md h-screen relative flex flex-col justify-between overflow-hidden">
        
        <header className="px-6 py-4 flex justify-between items-center mt-2">
          <button onClick={leaveRoom} className="text-white opacity-80 hover:opacity-100">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
        </header>

        <div className="pt-2 px-4 flex justify-center gap-4">
          {opponents.map((p: any) => {
            const indexInRoom = currentRoom.players.findIndex((player: any) => player.id === p.id);
            const hasFolded = p.hasFolded;
            return (
              <div key={p.id} className="flex flex-col items-center">
                <div className="relative mb-2">
                  <Avatar seed={p.userId} opacity={hasFolded ? 0.3 : 1} />
                  {isDealer(indexInRoom) && <DealerBadge />}
                  {hasFolded && (
                     <div className="absolute inset-0 flex items-center justify-center">
                       <span className="text-[10px] bg-black/60 px-1 rounded font-semibold text-white">Fold</span>
                     </div>
                  )}
                </div>
                <span className="text-[11px] text-gray-400 mt-2 font-medium truncate w-14 text-center">{p.name}</span>
                <span className="text-[12px] text-gray-500 font-medium mb-1">{p.chips}</span>
                {p.currentBet > 0 && <BetChip amount={p.currentBet} />}
                
                {/* Cartas del rival en Showdown */}
                {currentRoom.phase === 'showdown' && p.cards?.length > 0 && !hasFolded && currentRoom.winners?.[0]?.handName !== 'Won by fold' && (
                  <div className="flex gap-1 mt-2">
                     {p.cards.map((c: any, i: number) => {
                       const cardStr = `${c.rank}${c.suit}`;
                       const isWinning = currentRoom.winners?.some((w:any) => w.winningCards?.includes(cardStr));
                       return (
                         <PlayingCard 
                           key={i} 
                           rank={c.rank} suit={c.suit} 
                           className={`w-10 aspect-[2/3] shadow-sm ${!isWinning ? 'brightness-[0.4]' : ''}`} 
                         />
                       );
                     })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div 
          className="flex-1 flex flex-col justify-center items-center py-6 cursor-pointer"
          onClick={() => setShowRankingsModal(true)}
        >
          <div className="flex gap-1.5 mb-2 relative">
            {[0, 1, 2, 3, 4].map(index => {
              const card = currentRoom.communityCards?.[index];
              if (card) {
                const cardStr = `${card.rank}${card.suit}`;
                const isWinning = currentRoom.phase === 'showdown' 
                   ? currentRoom.winners?.some((w:any) => w.winningCards?.includes(cardStr))
                   : true;
                return <PlayingCard key={index} rank={card.rank} suit={card.suit} className={`w-16 aspect-[2/3] ${!isWinning ? 'brightness-[0.4]' : ''}`} />;
              }
              return <PlayingCard key={index} hidden className="w-16 aspect-[2/3]" />;
            })}
            
            <div className="absolute -bottom-8 right-0 text-white font-medium text-2xl">
              {currentRoom.pot}
            </div>

            {currentRoom.phase === 'showdown' && currentRoom.winners && currentRoom.winners.length > 0 && (
               <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-white text-black px-4 py-1 rounded-full text-xs font-bold whitespace-nowrap shadow-md z-10">
                 {currentRoom.winners[0].handName}
               </div>
            )}
          </div>
        </div>

        <div className="p-4 flex flex-col justify-end relative">
          
          {myPlayer?.currentBet > 0 && !showBetMenu && (
             <div className="absolute top-0 left-6 -mt-8">
               <BetChip amount={myPlayer.currentBet} />
             </div>
          )}

          {showBetMenu && (
             <div className="mb-4">
                <input 
                  type="range" 
                  min={minRaise} 
                  max={Math.max(minRaise, myPlayer?.chips || 1000)} 
                  value={betAmount} 
                  onChange={(e) => setBetAmount(parseInt(e.target.value))}
                  className="w-full accent-white"
                />
                <div className="flex justify-between mt-2 gap-2">
                  <button onClick={() => setBetAmount(Math.max(minRaise, Math.min(myPlayer.chips, 2)))} className="flex-1 bg-gray-800 text-gray-400 text-xs py-1.5 rounded-full hover:text-white transition-colors">1 BB</button>
                  <button onClick={() => setBetAmount(Math.max(minRaise, Math.min(myPlayer.chips, Math.floor(currentRoom.pot / 2))))} className="flex-1 bg-gray-800 text-gray-400 text-xs py-1.5 rounded-full hover:text-white transition-colors">1/2 Pot</button>
                  <button onClick={() => setBetAmount(Math.max(minRaise, Math.min(myPlayer.chips, currentRoom.pot)))} className="flex-1 bg-gray-800 text-gray-400 text-xs py-1.5 rounded-full hover:text-white transition-colors">Pot</button>
                  <button onClick={() => setBetAmount(myPlayer.chips)} className="flex-1 bg-gray-800 text-gray-400 text-xs py-1.5 rounded-full hover:text-white transition-colors">All-in</button>
                </div>
                <div className="flex flex-1 rounded-2xl overflow-hidden bg-surfaceLight transition-colors shadow-sm mt-4">
                  <button className="hover:bg-gray-700 text-gray-300 px-4 py-3 font-semibold text-lg flex-1" onClick={() => handleAction('Raise', betAmount)}>
                    Raise {betAmount}
                  </button>
                  <button onClick={() => setShowBetMenu(false)} className="px-4 text-gray-400">✕</button>
                </div>
             </div>
          )}

          {currentRoom.phase === 'showdown' ? (
             <div className="mb-6 flex justify-center w-full">
                <button 
                  onClick={() => socket.emit('nextHand', { roomId: currentRoom.id })}
                  className="bg-surfaceLight hover:bg-gray-700 text-white w-full max-w-[200px] py-3 rounded-full text-lg font-semibold transition-colors shadow-lg"
                >
                  Next hand
                </button>
             </div>
          ) : currentRoom.phase !== 'waiting' && !showBetMenu ? (
            isMyTurn ? (
              <div className="flex gap-2 mb-6 h-12">
                <button 
                  onClick={() => handleAction('Fold')}
                  className="bg-surface hover:bg-gray-800 text-gray-400 px-4 rounded-full text-sm font-semibold transition-colors border border-transparent hover:border-gray-700"
                >
                  Fold
                </button>
                
                {myPlayer.chips <= toCallAmount ? (
                  <button 
                    onClick={() => handleAction('Call')}
                    className="bg-surfaceLight hover:bg-gray-700 text-gray-200 px-4 rounded-full text-sm font-semibold flex-1 transition-colors"
                  >
                    All-in {myPlayer.chips}
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={() => handleAction(toCallAmount === 0 ? 'Check' : 'Call')}
                      className="bg-surfaceLight hover:bg-gray-700 text-gray-200 px-4 rounded-full text-sm font-semibold flex-1 transition-colors"
                    >
                      {toCallAmount === 0 ? 'Check' : `Call ${toCallAmount}`}
                    </button>

                    <button 
                      onClick={() => handleAction('Raise', currentRoom.highestBet * 2 || 2)}
                      className="bg-surfaceLight hover:bg-gray-700 text-gray-200 px-4 rounded-full text-sm font-semibold flex-1 transition-colors"
                    >
                      Raise {currentRoom.highestBet * 2 || 2}
                    </button>
                    
                    <button 
                      onClick={() => {
                        setBetAmount(minRaise);
                        setShowBetMenu(true);
                      }} 
                      className="bg-surfaceLight hover:bg-gray-700 text-gray-200 w-12 rounded-full text-lg font-semibold transition-colors flex items-center justify-center"
                    >
                      ↑
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex justify-center mb-6 h-12 items-center text-gray-400 text-sm italic">
                 Waiting for {currentTurnPlayer?.name}...
              </div>
            )
          ) : (
             currentRoom.players[0]?.id === socket.id && currentRoom.phase === 'waiting' && (
               <div className="flex justify-center mb-6">
                 <button 
                  onClick={startGame}
                  className="bg-white text-black px-10 py-4 rounded-full text-lg font-bold shadow-lg transition-transform active:scale-95"
                 >
                   Start Game
                 </button>
               </div>
             )
          )}

          <div className="flex justify-between items-end pb-4">
            <div className="flex gap-2 ml-2">
              {myPlayer?.cards?.length > 0 ? (
                <>
                  {myPlayer.cards.map((c: any, i: number) => {
                    const cardStr = `${c.rank}${c.suit}`;
                    const isWinning = currentRoom.phase === 'showdown' 
                       ? currentRoom.winners?.some((w:any) => w.winningCards?.includes(cardStr))
                       : true;
                    return (
                      <PlayingCard 
                        key={i} 
                        rank={c.rank} 
                        suit={c.suit} 
                        className={`w-20 aspect-[2/3] shadow-xl transform hover:-translate-y-4 transition-transform ${!isWinning ? 'brightness-[0.4]' : ''}`} 
                      />
                    );
                  })}
                </>
              ) : (
                <>
                   <PlayingCard hidden className="w-24 aspect-[2/3]" />
                   <PlayingCard hidden className="w-24 aspect-[2/3]" />
                </>
              )}
            </div>

            <div className="bg-surfaceLight rounded-3xl p-4 min-w-[140px] flex flex-col items-center shadow-2xl relative">
              <div className="text-[10px] text-gray-400 mb-2 font-semibold">
                {currentRoom.phase === 'waiting' ? 'Waiting' : (myPlayer?.handName || 'High Card')}
              </div>
              <div className="relative mb-1">
                 <Avatar seed={user.id} />
                 {isDealer(myPlayerIndex) && <DealerBadge />}
              </div>
              <div className="text-[11px] text-gray-400 font-bold mb-1">{user.name}</div>
              <div className="text-white font-medium text-lg">{myPlayer?.chips || user.balance}</div>
            </div>
          </div>
        </div>
      </div>

      {/* MENÚ DE RANKING DE MANOS */}
      {showRankingsModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#1F1F23] w-full max-w-md h-[95vh] rounded-t-[32px] sm:rounded-[32px] flex flex-col relative animate-in slide-in-from-bottom-8 duration-300 overflow-hidden shadow-2xl">
            
            <div className="w-full flex justify-center pt-4 pb-2 cursor-pointer" onClick={() => setShowRankingsModal(false)}>
              <div className="w-10 h-1.5 bg-gray-600 rounded-full"></div>
            </div>

            <div className="p-4 flex items-center justify-between pb-6">
              <h2 className="text-xl font-semibold text-white text-center w-full">Hand rankings</h2>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-8">
              <div className="space-y-1.5">
                {HAND_RANKINGS.map((rank, i) => {
                  const isMyHand = myPlayer?.handName === rank.name;
                  return (
                    <div 
                      key={i} 
                      className={`flex items-center gap-4 p-3 rounded-2xl transition-colors ${isMyHand ? 'bg-white/10 ring-1 ring-white/30' : 'hover:bg-white/5'}`}
                    >
                      <div className="flex gap-0.5 shrink-0">
                        {rank.cards.map((c, j) => (
                          <MiniCard key={j} rank={c.r} suit={c.s} active={rank.active.includes(j)} />
                        ))}
                      </div>
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-white font-semibold text-[15px] truncate">{rank.name}</span>
                        <span className="text-gray-400 text-[11px] truncate">{rank.desc}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
