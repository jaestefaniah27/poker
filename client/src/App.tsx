import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { socket, fmtChips } from './utils';
import LoginScreen from './components/LoginScreen';
import Lobby from './components/Lobby';
import PlayingCard from './components/PlayingCard';
import Avatar from './components/Avatar';
import TurnPie from './components/TurnPie';
import DealerBadge from './components/DealerBadge';
import BetChip from './components/BetChip';
import HandRankingsModal from './components/HandRankingsModal';

function App() {
  const [user, setUser] = useState<{ id: string, name: string, balance: number, avatar: string, hasPassword: boolean } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(() => !!sessionStorage.getItem('pokerToken'));
  const [rooms, setRooms] = useState<any[]>([]);
  const [currentRoom, setCurrentRoom] = useState<any | null>(null);
  const [showBetMenu, setShowBetMenu] = useState(false);
  const [betAmount, setBetAmount] = useState(2);
  const [showRankingsModal, setShowRankingsModal] = useState(false);
  const [isPressingShowdown, setIsPressingShowdown] = useState(false);
  const [flyingChips, setFlyingChips] = useState<{id: number, x: number, y: number, tx: number, ty: number, amount: number}[]>([]);
  const [animateBetIn, setAnimateBetIn] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [viewPlayer, setViewPlayer] = useState<any>(null);
  const [newCommunityIdx, setNewCommunityIdx] = useState<number[]>([]);
  const [nowMs, setNowMs] = useState(Date.now());
  const playerAnchorRefs = useRef<Map<string, HTMLElement>>(new Map());
  const flyIdRef = useRef(0);
  const communityCardsRef = useRef<HTMLDivElement>(null);
  const winnerCardsRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const winnerNaturalRects = useRef<Map<string, DOMRect>>(new Map());
  const communityNaturalRect = useRef<DOMRect | null>(null);
  const potRef = useRef<HTMLDivElement>(null);
  const myChipsRef = useRef<HTMLDivElement>(null);
  const myBetRef = useRef<HTMLDivElement>(null);
  const opponentBetRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevRoomRef = useRef<any>(null);
  const lastBetPositionsRef = useRef<Map<string, {x: number, y: number}>>(new Map());

  useLayoutEffect(() => {
    opponentBetRefs.current.forEach((el, playerId) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        lastBetPositionsRef.current.set(playerId, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }
    });
    if (myBetRef.current && user?.id) {
      const rect = myBetRef.current.getBoundingClientRect();
      if (rect.width > 0) {
        lastBetPositionsRef.current.set('myPlayer', { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }
    }
  });

  useEffect(() => {
    const prev = prevRoomRef.current;
    const curr = currentRoom;
    if (!prev || !curr) { prevRoomRef.current = curr; return; }

    const potEl = potRef.current;
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    const potGrew = curr.pot > prev.pot && curr.phase !== 'waiting';
    if (potGrew && potEl) {
      const potRect = potEl.getBoundingClientRect();
      prev.players.forEach((prevP: any) => {
        if (prevP.currentBet > 0) {
          const isMe = prevP.userId === user?.id;
          const storedPos = isMe
            ? lastBetPositionsRef.current.get('myPlayer')
            : lastBetPositionsRef.current.get(prevP.id);
          if (!storedPos) return;
          const id = ++flyIdRef.current;
          setFlyingChips(fc => [...fc, {
            id,
            x: storedPos.x,
            y: storedPos.y,
            tx: potRect.left + potRect.width / 2,
            ty: potRect.top + potRect.height / 2,
            amount: prevP.currentBet,
          }]);
          timeoutIds.push(setTimeout(() => setFlyingChips(fc => fc.filter(c => c.id !== id)), 600));
        }
      });
    }

    const prevMyPlayer = prev.players.find((p: any) => p.userId === user?.id);
    const currMyPlayer = curr.players.find((p: any) => p.userId === user?.id);
    if (prevMyPlayer && currMyPlayer && currMyPlayer.currentBet > prevMyPlayer.currentBet) {
      setAnimateBetIn(true);
      timeoutIds.push(setTimeout(() => setAnimateBetIn(false), 400));
    }

    const prevLen = prev.communityCards?.length || 0;
    const currLen = curr.communityCards?.length || 0;
    if (currLen > prevLen) {
      const idxs: number[] = [];
      for (let i = prevLen; i < currLen; i++) idxs.push(i);
      setNewCommunityIdx(idxs);
      timeoutIds.push(setTimeout(() => setNewCommunityIdx([]), 600));
    }

    const hadWinners = prev.winners && prev.winners.length > 0;
    const hasWinners = curr.phase === 'showdown' && curr.winners && curr.winners.length > 0;
    if (!hadWinners && hasWinners) {
      const myId = curr.players.find((p: any) => p.userId === user?.id)?.id;
      const outerTimeout = setTimeout(() => {
        const potEl = potRef.current;
        if (!potEl) return;
        const potRect = potEl.getBoundingClientRect();
        curr.winners.forEach((w: any) => {
          const targetEl = w.id === myId ? myChipsRef.current : playerAnchorRefs.current.get(w.id);
          if (!targetEl) return;
          const r = targetEl.getBoundingClientRect();
          const id = ++flyIdRef.current;
          setFlyingChips(fc => [...fc, {
            id,
            x: potRect.left + potRect.width / 2,
            y: potRect.top + potRect.height / 2,
            tx: r.left + r.width / 2,
            ty: r.top + r.height / 2,
            amount: w.amount,
          }]);
          timeoutIds.push(setTimeout(() => setFlyingChips(fc => fc.filter(c => c.id !== id)), 850));
        });
      }, 80);
      timeoutIds.push(outerTimeout);
    }

    prevRoomRef.current = curr;
    return () => { timeoutIds.forEach(clearTimeout); };
  }, [currentRoom]);

  useEffect(() => {
    if (!currentRoom?.id) return;
    const id = setInterval(() => setNowMs(Date.now()), 100);
    return () => clearInterval(id);
  }, [currentRoom?.id]);

  const getWinnerCardTransform = useCallback((playerId: string) => {
    if (!isPressingShowdown) return {};
    const winnerRect = winnerNaturalRects.current.get(playerId);
    const communityRect = communityNaturalRect.current;
    if (!winnerRect || !communityRect) return {};

    const targetX = communityRect.left + communityRect.width / 2 - winnerRect.left - winnerRect.width / 2;
    const targetY = communityRect.top - 6 - winnerRect.top - winnerRect.height * 1.3;
    const scaleRatio = 1.6;

    return {
      transform: `translate(${targetX}px, ${targetY}px) scale(${scaleRatio})`,
      transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
      zIndex: 50,
    };
  }, [isPressingShowdown]);

  useEffect(() => {
    socket.on('roomsUpdated', (updatedRooms) => {
      setRooms(updatedRooms);
    });

    socket.on('roomUpdated', (room) => {
      setCurrentRoom(room);
    });

    socket.on('balanceUpdated', ({ balance }) => {
      setUser(prev => prev ? { ...prev, balance } : prev);
    });

    fetch(`http://${window.location.hostname}:3001/rooms`)
      .then(res => res.json())
      .then(data => setRooms(data))
      .catch(console.error);

    return () => {
      socket.off('roomsUpdated');
      socket.off('roomUpdated');
      socket.off('balanceUpdated');
    };
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem('pokerToken');
    if (!saved) return;
    const fallback = setTimeout(() => {
      setInitializing(false);
      sessionStorage.removeItem('pokerToken');
      sessionStorage.removeItem('pokerRoomId');
    }, 5000);
    socket.emit('resumeSession', { token: saved }, (response: any) => {
      clearTimeout(fallback);
      if (response?.user) {
        setUser(response.user);
        setToken(saved);
        const roomId = sessionStorage.getItem('pokerRoomId');
        if (roomId) socket.emit('joinRoom', { roomId, token: saved });
      } else {
        sessionStorage.removeItem('pokerToken');
        sessionStorage.removeItem('pokerRoomId');
      }
      setInitializing(false);
    });
    return () => clearTimeout(fallback);
  }, []);

  const handleLogin = (u: any, t: string) => {
    setToken(t);
    setUser(u);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('pokerToken');
    sessionStorage.removeItem('pokerRoomId');
    setCurrentRoom(null);
    setUser(null);
    setToken(null);
  };

  const joinRoom = (roomId: string) => {
    sessionStorage.setItem('pokerRoomId', roomId);
    socket.emit('joinRoom', { roomId, token });
  };

  const leaveRoom = () => {
    const roomId = currentRoom?.id;
    sessionStorage.removeItem('pokerRoomId');
    setCurrentRoom(null);
    setShowLeaveConfirm(false);
    if (roomId) socket.emit('leaveRoom', { roomId });
  };

  const startGame = () => {
    if (currentRoom) socket.emit('startGame', { roomId: currentRoom.id });
  };

  const handleAction = (action: string, amount?: number) => {
    socket.emit('playerAction', { roomId: currentRoom.id, userId: user?.id, action, amount });
    if (action === 'Raise') setShowBetMenu(false);
  };

  const handleRebuy = () => {
    if (currentRoom) socket.emit('rebuy', { roomId: currentRoom.id });
  };

  if (!user && initializing) {
    return (
      <div className="min-h-screen bg-background text-primary flex items-center justify-center font-sans">
        <div className="animate-pulse text-gray-500 text-sm tracking-widest uppercase">Cargando…</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (!currentRoom) {
    return (
      <Lobby
        user={user}
        token={token}
        rooms={rooms}
        onJoinRoom={joinRoom}
        onLogout={handleLogout}
        onUpdateUser={(u) => setUser(u)}
      />
    );
  }

  // --- Game Table ---
  const myPlayerIndex = currentRoom.players.findIndex((p: any) => p.userId === user?.id);
  const myPlayer = myPlayerIndex !== -1 ? currentRoom.players[myPlayerIndex] : null;
  const opponents = currentRoom.players.filter((p: any) => p.userId !== user?.id && p.isActive);

  const isDealer = (index: number) => currentRoom.dealerIndex === index;
  const isMyTurn = currentRoom.currentTurnIndex === myPlayerIndex && !myPlayer?.isSpectating;
  const amSpectating = myPlayer?.isSpectating === true;
  const inBettingPhase = ['preflop', 'flop', 'turn', 'river'].includes(currentRoom.phase);
  const isAllInLive = inBettingPhase && !amSpectating && !myPlayer?.hasFolded;
  const amBusted = myPlayer?.chips === 0 && !isAllInLive;
  const currentTurnPlayer = currentRoom.players[currentRoom.currentTurnIndex];
  const toCallAmount = currentRoom.highestBet - (myPlayer?.currentBet || 0);
  const minRaise = currentRoom.highestBet > 0 ? currentRoom.highestBet * 2 : (currentRoom.bigBlind || 2);

  const turnTimer = (() => {
    if (!inBettingPhase || currentRoom.currentTurnIndex < 0) return null;
    const { turnStartedAt, turnDuration, inGrace, graceStartedAt, graceDuration } = currentRoom;
    if (inGrace && graceStartedAt) {
      return { fraction: Math.max(0, Math.min(1, 1 - (nowMs - graceStartedAt) / (graceDuration || 5000))), danger: true };
    }
    if (turnStartedAt && turnDuration) {
      return { fraction: Math.max(0, Math.min(1, 1 - (nowMs - turnStartedAt) / turnDuration)), danger: false };
    }
    return null;
  })();
  const showGraceWarning = isMyTurn && currentRoom.inGrace;
  if (!isMyTurn && showBetMenu) setShowBetMenu(false);

  return (
    <div className="min-h-screen bg-background text-primary font-sans flex justify-center">
      <div className="w-full max-w-md h-screen relative flex flex-col justify-between overflow-hidden">

        {flyingChips.map(chip => (
          <div
            key={chip.id}
            className="fixed pointer-events-none z-[200]"
            style={{
              left: chip.x,
              top: chip.y,
              transform: 'translate(-50%, -50%)',
              animation: 'flyChip 0.55s cubic-bezier(0.4, 0, 0.2, 1) both',
              '--tx': `${chip.tx - chip.x}px`,
              '--ty': `${chip.ty - chip.y}px`,
            } as React.CSSProperties}
          >
            <div className="bg-[#2A2A2A] text-[#FDE047] text-[10px] font-bold px-2 py-0.5 rounded-full border border-gray-700 shadow-md">
              {chip.amount}
            </div>
          </div>
        ))}

        {showLeaveConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div className="bg-[#1a1a1a] rounded-2xl p-6 mx-6 w-full max-w-xs shadow-2xl flex flex-col gap-4">
              <p className="text-white text-center font-semibold text-base">¿Salir de la mesa?</p>
              <p className="text-gray-400 text-center text-sm">Perderás tu apuesta si hay una mano en curso.</p>
              <div className="flex gap-3 mt-1">
                <button
                  onClick={() => setShowLeaveConfirm(false)}
                  className="flex-1 py-3 rounded-full bg-surfaceLight text-gray-300 font-semibold text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={leaveRoom}
                  className="flex-1 py-3 rounded-full bg-red-600 hover:bg-red-500 text-white font-semibold text-sm"
                >
                  Salir
                </button>
              </div>
            </div>
          </div>
        )}

        {viewPlayer && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
            onClick={() => setViewPlayer(null)}
          >
            <div
              className="bg-[#1a1a1a] rounded-2xl p-6 mx-6 w-full max-w-xs shadow-2xl flex flex-col items-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <Avatar seed={viewPlayer.avatar || viewPlayer.userId} />
              <p className="text-white font-semibold text-base">{viewPlayer.name}</p>
              <div className="flex flex-col items-center gap-1">
                <span className="text-gray-400 text-xs uppercase tracking-wider">Saldo</span>
                {(() => {
                  const net = (viewPlayer.balance || 0) + (viewPlayer.chips || 0);
                  return (
                    <span className={`font-mono text-2xl font-bold ${net < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {net < 0 ? `-$${fmtChips(Math.abs(net))}` : `$${fmtChips(net)}`}
                    </span>
                  );
                })()}
                <span className="text-gray-500 text-xs">{fmtChips(viewPlayer.chips)} fichas en mesa</span>
              </div>
              <button
                onClick={() => setViewPlayer(null)}
                className="mt-2 w-full py-2.5 rounded-full bg-surfaceLight text-gray-300 font-semibold text-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        <header className="px-6 py-4 flex justify-between items-center mt-2">
          <button onClick={() => setShowLeaveConfirm(true)} className="text-white opacity-80 hover:opacity-100">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="flex flex-col items-center leading-tight">
            <span className="text-sm font-semibold text-white truncate max-w-[160px]">{currentRoom.name}</span>
            {currentRoom.bigBlind != null && (
              <span className="text-[11px] text-emerald-300/80 font-semibold">{fmtChips(currentRoom.smallBlind)}/{fmtChips(currentRoom.bigBlind)}</span>
            )}
          </div>
          <div className="w-6" />
        </header>

        <div
          className="pt-2 px-4 flex justify-center gap-4 cursor-pointer select-none touch-none"
          onPointerDown={() => {
            if (currentRoom.phase === 'showdown') {
              winnerCardsRefs.current.forEach((el, playerId) => {
                winnerNaturalRects.current.set(playerId, el.getBoundingClientRect());
              });
              if (communityCardsRef.current) {
                communityNaturalRect.current = communityCardsRef.current.getBoundingClientRect();
              }
              setIsPressingShowdown(true);
            }
          }}
          onPointerUp={() => setIsPressingShowdown(false)}
          onPointerLeave={() => setIsPressingShowdown(false)}
          onPointerCancel={() => setIsPressingShowdown(false)}
        >
          {opponents.map((p: any) => {
            const indexInRoom = currentRoom.players.findIndex((player: any) => player.id === p.id);
            const hasFolded = p.hasFolded;
            const isSpectating = p.isSpectating === true;
            return (
              <div key={p.id} className="flex flex-col items-center">
                <div
                  className="relative mb-2 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setViewPlayer(p); }}
                >
                  {indexInRoom === currentRoom.currentTurnIndex && turnTimer && (
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-20">
                      <TurnPie fraction={turnTimer.fraction} danger={turnTimer.danger} />
                    </div>
                  )}
                  <Avatar seed={p.avatar || p.userId} opacity={hasFolded || isSpectating || p.isOnline === false ? 0.3 : 1} />
                  {isDealer(indexInRoom) && <DealerBadge />}
                  {hasFolded && (
                     <div className="absolute inset-0 flex items-center justify-center">
                       <span className="text-[10px] bg-black/60 px-1 rounded font-semibold text-white">Fold</span>
                     </div>
                  )}
                  {isSpectating && (
                     <div className="absolute inset-0 flex items-center justify-center">
                       <span className="text-[10px] bg-black/60 px-1 rounded font-semibold text-white">Next</span>
                     </div>
                  )}
                </div>
                <span className="text-[11px] text-gray-400 mt-2 font-medium truncate w-14 text-center">{p.name}</span>
                {p.isOnline === false && (
                  <span className="text-[9px] bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide mb-0.5">Offline</span>
                )}
                <span
                  className="text-[12px] text-gray-500 font-medium mb-1"
                  ref={(el) => { if (el) playerAnchorRefs.current.set(p.id, el); }}
                >{fmtChips(p.chips)}</span>
                <div className="h-5 flex items-center justify-center">
                  {p.currentBet > 0 && (
                    <div ref={(el) => { if (el) opponentBetRefs.current.set(p.id, el); }}>
                      <BetChip amount={p.currentBet} />
                    </div>
                  )}
                </div>

                {currentRoom.phase === 'showdown' && p.cards?.length > 0 && !hasFolded && currentRoom.winners?.[0]?.handName !== 'Won by fold' && (
                  <div
                    className="flex gap-1 mt-2 relative"
                    ref={(el) => { if (el) winnerCardsRefs.current.set(p.id, el); }}
                    style={{
                      ...( currentRoom.winners?.some((w:any) => w.id === p.id)
                        ? getWinnerCardTransform(p.id)
                        : {}
                      ),
                      transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                      zIndex: currentRoom.winners?.some((w:any) => w.id === p.id) ? 50 : undefined,
                    }}
                  >
                     {p.cards.map((c: any, i: number) => {
                       const cardStr = `${c.rank}${c.suit}`;
                       const isWinning = currentRoom.winners?.some((w:any) => w.winningCards?.includes(cardStr));

                       return (
                         <PlayingCard
                           key={i}
                           rank={c.rank} suit={c.suit}
                           className={`w-10 aspect-[2/3] shadow-sm animate-deal ${!isWinning ? 'brightness-[0.4]' : ''}`}
                           style={{ animationDelay: `${i * 0.1}s` }}
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
          <div className="flex gap-1.5 mb-2 relative" ref={communityCardsRef}>
            {[0, 1, 2, 3, 4].map(index => {
              const card = currentRoom.communityCards?.[index];
              if (card) {
                const cardStr = `${card.rank}${card.suit}`;
                const isWinning = currentRoom.phase === 'showdown'
                   ? currentRoom.winners?.some((w:any) => w.winningCards?.includes(cardStr))
                   : true;
                const justRevealed = newCommunityIdx.includes(index);
                return <PlayingCard key={index} rank={card.rank} suit={card.suit} className={`w-16 aspect-[2/3] ${justRevealed ? 'animate-deal' : ''} ${!isWinning ? 'brightness-[0.4]' : ''}`} />;
              }
              return <PlayingCard key={index} hidden className="w-16 aspect-[2/3]" />;
            })}

            <div className="absolute -bottom-8 right-0 text-white font-medium text-2xl" ref={potRef}>
              {fmtChips(currentRoom.pot)}
            </div>

            {currentRoom.phase === 'showdown' && currentRoom.winners && currentRoom.winners.length > 0 && (
               <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-white text-black px-4 py-1 rounded-full text-xs font-bold whitespace-nowrap shadow-md z-10">
                 {currentRoom.winners[0].handName}
               </div>
            )}
          </div>
        </div>

        <div className="p-4 flex flex-col justify-end relative">

          {showGraceWarning && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-red-600/90 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg animate-pulse z-30 whitespace-nowrap pointer-events-none">
              ¡Se te acaba el tiempo! Haz algo ya
            </div>
          )}

          {myPlayer?.currentBet > 0 && !showBetMenu && (
             <div className="absolute top-0 left-6 -mt-8" ref={myBetRef}>
               <BetChip amount={myPlayer.currentBet} animateIn={animateBetIn} />
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
                <div className="flex mt-2 gap-2">
                  <button onClick={() => setBetAmount(prev => Math.max(minRaise, Math.min(myPlayer.chips, prev + (currentRoom.bigBlind || 2))))} className="flex-1 bg-surfaceLight hover:bg-gray-700 text-gray-200 px-4 py-2 rounded-full text-sm font-semibold transition-colors">+1 BB</button>
                  <button onClick={() => setBetAmount(Math.max(minRaise, Math.min(myPlayer.chips, Math.floor(currentRoom.pot / 2))))} className="flex-1 bg-surfaceLight hover:bg-gray-700 text-gray-200 px-4 py-2 rounded-full text-sm font-semibold transition-colors">1/2 Pot</button>
                  <button onClick={() => setBetAmount(Math.max(minRaise, Math.min(myPlayer.chips, currentRoom.pot)))} className="flex-1 bg-surfaceLight hover:bg-gray-700 text-gray-200 px-4 py-2 rounded-full text-sm font-semibold transition-colors">Pot</button>
                  <button onClick={() => setBetAmount(myPlayer.chips)} className="flex-1 bg-surfaceLight hover:bg-gray-700 text-gray-200 px-4 py-2 rounded-full text-sm font-semibold transition-colors">All-in</button>
                </div>
                <div className="flex flex-1 rounded-2xl overflow-hidden bg-surfaceLight transition-colors shadow-sm mt-4">
                  <button className="hover:bg-gray-700 text-gray-300 px-4 py-3 font-semibold text-lg flex-1" onClick={() => handleAction('Raise', betAmount)}>
                    Raise {fmtChips(betAmount)}
                  </button>
                  <button onClick={() => setShowBetMenu(false)} className="px-4 text-gray-400">✕</button>
                </div>
             </div>
          )}

          {currentRoom.phase === 'showdown' ? (
             <div className="mb-6 flex justify-center w-full gap-2">
                {amBusted && (
                  <button
                    onClick={handleRebuy}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white flex-1 max-w-[200px] py-3 rounded-full text-lg font-semibold transition-colors shadow-lg"
                  >
                    Recomprar 1000
                  </button>
                )}
                {(() => {
                  const remaining = currentRoom.showdownAt
                    ? Math.max(0, Math.ceil((5000 - (nowMs - currentRoom.showdownAt)) / 1000))
                    : 0;
                  const locked = remaining > 0;
                  return (
                    <button
                      disabled={locked}
                      onClick={() => { if (!locked) socket.emit('nextHand', { roomId: currentRoom.id }); }}
                      className={`flex-1 max-w-[200px] py-3 rounded-full text-lg font-semibold transition-colors shadow-lg ${locked ? 'bg-surface text-gray-500 cursor-not-allowed' : 'bg-surfaceLight hover:bg-gray-700 text-white'}`}
                    >
                      {locked ? `Next hand (${remaining})` : 'Next hand'}
                    </button>
                  );
                })()}
             </div>
          ) : amBusted ? (
            <div className="mb-6 flex flex-col items-center gap-2">
              <button
                onClick={handleRebuy}
                className="bg-emerald-600 hover:bg-emerald-500 text-white w-full max-w-[200px] py-3 rounded-full text-lg font-semibold transition-colors shadow-lg"
              >
                Recomprar 1000
              </button>
              <span className="text-gray-500 text-xs italic">Te quedaste sin fichas</span>
            </div>
          ) : amSpectating ? (
            <div className="flex justify-center mb-6 h-12 items-center text-gray-400 text-sm italic">
              Joining next hand...
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
                    All-in {fmtChips(myPlayer.chips)}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleAction(toCallAmount === 0 ? 'Check' : 'Call')}
                      className="bg-surfaceLight hover:bg-gray-700 text-gray-200 px-4 rounded-full text-sm font-semibold flex-1 transition-colors"
                    >
                      {toCallAmount === 0 ? 'Check' : `Call ${fmtChips(toCallAmount)}`}
                    </button>

                    {(myPlayer.chips + myPlayer.currentBet) > currentRoom.highestBet && (() => {
                      const quickRaise = Math.min(minRaise, myPlayer.chips + myPlayer.currentBet);
                      return (
                        <>
                          <button
                            onClick={() => handleAction('Raise', quickRaise)}
                            className="bg-surfaceLight hover:bg-gray-700 text-gray-200 px-4 rounded-full text-sm font-semibold flex-1 transition-colors"
                          >
                            Raise {fmtChips(quickRaise)}
                          </button>

                          <button
                            onClick={() => {
                              setBetAmount(Math.min(minRaise, myPlayer.chips + myPlayer.currentBet));
                              setShowBetMenu(true);
                            }}
                            className="bg-surfaceLight hover:bg-gray-700 text-gray-200 w-12 rounded-full text-lg font-semibold transition-colors flex items-center justify-center"
                          >
                            ↑
                          </button>
                        </>
                      );
                    })()}
                  </>
                )}
              </div>
            ) : (
              <div className="flex justify-center mb-6 h-12 items-center text-gray-400 text-sm italic">
                 {currentRoom.currentTurnIndex === -1
                   ? 'Repartiendo cartas...'
                   : `Waiting for ${currentTurnPlayer?.name}...`}
              </div>
            )
          ) : (
             currentRoom.players[0]?.userId === user?.id && currentRoom.phase === 'waiting' && (
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
            <div className="flex gap-2 ml-2 relative z-10">
              {myPlayer?.cards?.length > 0 ? (
                <>
                  {myPlayer.cards.map((c: any, i: number) => {
                    const cardStr = `${c.rank}${c.suit}`;
                    const isWinning = currentRoom.phase === 'showdown'
                       ? currentRoom.winners?.some((w:any) => w.winningCards?.includes(cardStr))
                       : true;
                    const dimmed = myPlayer.hasFolded || !isWinning;

                    return (
                      <PlayingCard
                        key={i}
                        rank={c.rank}
                        suit={c.suit}
                        className={`w-20 aspect-[2/3] shadow-xl transform hover:-translate-y-4 transition-all ${dimmed ? 'brightness-[0.35] saturate-50' : ''}`}
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
              <div
                className="relative mb-1 cursor-pointer"
                onClick={() => setViewPlayer(myPlayer || { name: user.name, avatar: user.avatar, userId: user.id, balance: user.balance, chips: 0 })}
              >
                 {isMyTurn && turnTimer && (
                   <div className="absolute -right-7 top-1/2 -translate-y-1/2 z-20">
                     <TurnPie fraction={turnTimer.fraction} danger={turnTimer.danger} />
                   </div>
                 )}
                 <Avatar seed={user.avatar} />
                 {isDealer(myPlayerIndex) && <DealerBadge />}
              </div>
              <div className="text-[11px] text-gray-400 font-bold mb-1">{user.name}</div>
              <div className="text-white font-medium text-lg" ref={myChipsRef}>{fmtChips(myPlayer ? myPlayer.chips : user.balance)}</div>
            </div>
          </div>
        </div>
      </div>

      {showRankingsModal && (
        <HandRankingsModal
          myHandName={myPlayer?.handName}
          onClose={() => setShowRankingsModal(false)}
        />
      )}
    </div>
  );
}

export default App;
