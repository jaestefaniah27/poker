import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';

const socket: Socket = io('http://localhost:3001');

// Componente para una carta individual
const PlayingCard = ({ rank, suit, hidden = false, className = '', style }: { rank?: string, suit?: string, hidden?: boolean, className?: string, style?: React.CSSProperties }) => {
  const isMini = className.includes('w-10');
  const isSmall = className.includes('w-16');

  const pClass = isMini ? 'p-0.5' : isSmall ? 'p-1.5' : 'p-2';
  const rankClass = isMini ? 'text-[9px]' : isSmall ? 'text-lg' : 'text-xl';
  const suitClass = isMini ? 'text-xl' : isSmall ? 'text-3xl' : 'text-4xl';
  const roundedClass = isMini ? 'rounded-md' : isSmall ? 'rounded-lg' : 'rounded-xl';

  if (hidden) {
    return (
      <div className={`bg-white ${roundedClass} shadow-md relative overflow-hidden ${className}`} style={style}>
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
    <div className={`bg-white ${roundedClass} shadow-md flex flex-col justify-between ${pClass} ${colorClass} ${className}`} style={style}>
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

// --- Menú de Perfil (cambiar nombre, avatar, contraseña) ---
const ProfileModal = ({ user, token, onClose, onUpdate }: {
  user: { id: string, name: string, balance: number, avatar: string, hasPassword: boolean },
  token: string | null,
  onClose: () => void,
  onUpdate: (u: any) => void,
}) => {
  const [name, setName] = useState(user.name);
  const [avatarSeed, setAvatarSeed] = useState(user.avatar);
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean, text: string } | null>(null);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const emit = (event: string, payload: any, okText: string) => {
    socket.emit(event, { token, ...payload }, (res: any) => {
      if (res?.error) { flash(false, res.error); return; }
      if (res?.user) onUpdate(res.user);
      flash(true, okText);
      setCurPwd(''); setNewPwd('');
    });
  };

  const saveName = () => {
    if (name.trim() === user.name) { flash(false, 'El nombre no ha cambiado'); return; }
    emit('changeName', { newName: name.trim() }, 'Nombre actualizado');
  };
  const saveAvatar = () => emit('changeAvatar', { avatar: avatarSeed }, 'Avatar actualizado');
  const shuffleAvatar = () => setAvatarSeed(Math.random().toString(36).slice(2, 10));
  const savePassword = () => emit('setPassword', { currentPassword: curPwd, newPassword: newPwd },
    user.hasPassword ? 'Contraseña cambiada' : 'Contraseña añadida');
  const removePassword = () => emit('removePassword', { currentPassword: curPwd }, 'Contraseña eliminada');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-[#1a1a1a] rounded-2xl p-6 w-full max-w-sm shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-white font-bold text-lg">Mi perfil</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-surfaceLight flex items-center justify-center">
            <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${avatarSeed}&backgroundColor=transparent`} alt="avatar" className="w-full h-full object-cover scale-125" />
          </div>
          <div className="flex gap-2">
            <button onClick={shuffleAvatar} className="bg-surfaceLight hover:bg-gray-700 text-gray-200 text-xs px-3 py-2 rounded-full transition-colors">🎲 Aleatorio</button>
            <button onClick={saveAvatar} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2 rounded-full transition-colors">Guardar avatar</button>
          </div>
        </div>

        {/* Nombre */}
        <div className="mb-6">
          <label className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Nombre</label>
          <div className="flex gap-2 mt-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 bg-background border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gray-400"
            />
            <button onClick={saveName} className="bg-surfaceLight hover:bg-gray-700 text-white text-sm px-4 rounded-xl transition-colors">Guardar</button>
          </div>
        </div>

        {/* Contraseña */}
        <div className="mb-2">
          <label className="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">
            {user.hasPassword ? 'Contraseña' : 'Añadir contraseña (opcional)'}
          </label>
          <div className="space-y-2 mt-2">
            {user.hasPassword && (
              <input
                type="password" value={curPwd} onChange={(e) => setCurPwd(e.target.value)}
                placeholder="Contraseña actual"
                className="w-full bg-background border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gray-400"
              />
            )}
            <input
              type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
              placeholder={user.hasPassword ? 'Nueva contraseña' : 'Contraseña (mín. 4)'}
              className="w-full bg-background border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gray-400"
            />
            <div className="flex gap-2">
              <button onClick={savePassword} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-sm py-2.5 rounded-xl transition-colors">
                {user.hasPassword ? 'Cambiar contraseña' : 'Añadir contraseña'}
              </button>
              {user.hasPassword && (
                <button onClick={removePassword} className="flex-1 bg-red-600 hover:bg-red-500 text-white text-sm py-2.5 rounded-xl transition-colors">
                  Quitar
                </button>
              )}
            </div>
          </div>
        </div>

        {msg && (
          <p className={`text-xs text-center mt-4 ${msg.ok ? 'text-emerald-400' : 'text-amber-400'}`}>{msg.text}</p>
        )}
      </div>
    </div>
  );
};

// Temporizador "quesito" para el rival en turno: sector verde claro = tiempo restante, verde oscuro = gastado
const TurnPie = ({ fraction, danger }: { fraction: number, danger?: boolean }) => {
  const r = 15, cx = 17, cy = 17;
  const bright = danger ? '#ef4444' : '#22c55e';
  const dark = danger ? '#7f1d1d' : '#14532d';
  const f = Math.max(0, Math.min(0.9999, fraction));
  const rad = (d: number) => (d * Math.PI) / 180;
  const a0 = -90, a1 = -90 + 360 * f;
  const x1 = cx + r * Math.cos(rad(a0)), y1 = cy + r * Math.sin(rad(a0));
  const x2 = cx + r * Math.cos(rad(a1)), y2 = cy + r * Math.sin(rad(a1));
  const large = f > 0.5 ? 1 : 0;
  const sector = fraction <= 0 ? '' : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" className="drop-shadow-md">
      <circle cx={cx} cy={cy} r={r} fill={dark} />
      {sector && <path d={sector} fill={bright} />}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" />
    </svg>
  );
};

// Perímetro verde que rodea mi cuadro y se va consumiendo según el tiempo restante.
// Usa el tamaño real (px) del cuadro para que el dash recorra el perímetro de verdad.
const TurnPerimeter = ({ fraction, danger, w, h }: { fraction: number, danger?: boolean, w: number, h: number }) => {
  if (!w || !h) return null;
  const sw = 3, inset = sw / 2 + 0.5;
  const rw = w - inset * 2, rh = h - inset * 2;
  const rr = Math.min(22, rw / 2, rh / 2);
  const perim = 2 * (rw - 2 * rr) + 2 * (rh - 2 * rr) + 2 * Math.PI * rr;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 pointer-events-none z-20">
      <rect
        x={inset} y={inset} width={rw} height={rh} rx={rr} ry={rr} fill="none"
        stroke={danger ? '#ef4444' : '#22c55e'} strokeWidth={sw} strokeLinecap="round"
        strokeDasharray={perim} strokeDashoffset={perim * (1 - f)}
        style={{ transition: 'stroke-dashoffset 0.12s linear' }}
      />
    </svg>
  );
};

// Dealer Badge
const DealerBadge = () => (
  <div className="absolute -bottom-1 -right-1 bg-white text-black text-[11px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center border-2 border-black z-10 shadow-md">
    D
  </div>
);

// Chip Badge (Yellow circle for bets)
const BetChip = ({ amount, animateIn = false }: { amount: number, animateIn?: boolean }) => (
  <div
    className="bg-[#2A2A2A] text-[#FDE047] text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 border border-gray-700 shadow-md"
    style={animateIn ? { animation: 'chipPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both' } : {}}
  >
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
  const [loginPassword, setLoginPassword] = useState('');
  const [needPassword, setNeedPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [user, setUser] = useState<{ id: string, name: string, balance: number, avatar: string, hasPassword: boolean } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  // Hay sesión guardada en esta pestaña -> evitamos parpadear el formulario mientras auto-logueamos.
  // sessionStorage es POR PESTAÑA: así puedes tener varios usuarios distintos en pestañas distintas.
  const [initializing, setInitializing] = useState(() => !!sessionStorage.getItem('pokerToken'));
  const [rooms, setRooms] = useState<any[]>([]);
  const [currentRoom, setCurrentRoom] = useState<any | null>(null);
  const [newRoomName, setNewRoomName] = useState('');
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
  const potRef = useRef<HTMLDivElement>(null);
  const myChipsRef = useRef<HTMLDivElement>(null);
  const myBetRef = useRef<HTMLDivElement>(null);
  const opponentBetRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevRoomRef = useRef<any>(null);
  // Persistent snapshot of bet chip positions captured after every render
  const lastBetPositionsRef = useRef<Map<string, {x: number, y: number}>>(new Map());

  // After every render, record current bet chip positions into the persistent snapshot
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
  }); // no deps — runs after every render

  // Detect bet changes and trigger chip animations
  useEffect(() => {
    const prev = prevRoomRef.current;
    const curr = currentRoom;
    if (!prev || !curr) { prevRoomRef.current = curr; return; }

    const potEl = potRef.current;

    // Detect bets being collected to pot (currentBet resets to 0 while pot grows)
    const potGrew = curr.pot > prev.pot && curr.phase !== 'waiting';
    if (potGrew && potEl) {
      const potRect = potEl.getBoundingClientRect();
      prev.players.forEach((prevP: any) => {
        if (prevP.currentBet > 0) {
          // Use the stored position snapshot (captured before this render removed the chip)
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
          setTimeout(() => setFlyingChips(fc => fc.filter(c => c.id !== id)), 600);
        }
      });
    }

    // Detect local player placing a bet (currentBet increases)
    const prevMyPlayer = prev.players.find((p: any) => p.userId === user?.id);
    const currMyPlayer = curr.players.find((p: any) => p.userId === user?.id);
    if (prevMyPlayer && currMyPlayer && currMyPlayer.currentBet > prevMyPlayer.currentBet) {
      setAnimateBetIn(true);
      setTimeout(() => setAnimateBetIn(false), 400);
    }

    // Detect newly revealed community cards (flop/turn/river) to animate their reveal
    const prevLen = prev.communityCards?.length || 0;
    const currLen = curr.communityCards?.length || 0;
    if (currLen > prevLen) {
      const idxs: number[] = [];
      for (let i = prevLen; i < currLen; i++) idxs.push(i);
      setNewCommunityIdx(idxs);
      setTimeout(() => setNewCommunityIdx([]), 600);
    }

    // Detect winner(s) appearing at showdown -> fly chips from the pot to each winner
    const hadWinners = prev.winners && prev.winners.length > 0;
    const hasWinners = curr.phase === 'showdown' && curr.winners && curr.winners.length > 0;
    if (!hadWinners && hasWinners) {
      const myId = curr.players.find((p: any) => p.userId === user?.id)?.id;
      // pequeño retardo para que el DOM del showdown esté colocado
      setTimeout(() => {
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
          setTimeout(() => setFlyingChips(fc => fc.filter(c => c.id !== id)), 850);
        });
      }, 80);
    }

    prevRoomRef.current = curr;
  }, [currentRoom]);

  // Reloj que avanza ~10 veces/seg mientras estamos en una sala, para pintar el temporizador de turno
  useEffect(() => {
    if (!currentRoom?.id) return;
    const id = setInterval(() => setNowMs(Date.now()), 100);
    return () => clearInterval(id);
  }, [currentRoom?.id]);

  // Calculate transform for winner cards to fly to community cards area
  const getWinnerCardTransform = useCallback((playerId: string) => {
    if (!isPressingShowdown || !communityCardsRef.current) return {};
    const winnerEl = winnerCardsRefs.current.get(playerId);
    if (!winnerEl) return {};

    const communityRect = communityCardsRef.current.getBoundingClientRect();
    const winnerRect = winnerEl.getBoundingClientRect();

    // Target: just above community cards, centered. Gap = 6px (matches gap-1.5)
    // Scale is center-origin, so bottom of scaled = (center + deltaY) + height*0.8
    // We want that bottom = communityRect.top - 6
    const targetX = communityRect.left + communityRect.width / 2 - winnerRect.left - winnerRect.width / 2;
    const targetY = communityRect.top - 6 - winnerRect.top - winnerRect.height * 1.3;
    const scaleRatio = 1.6; // w-10 (40px) -> w-16 (64px) = 1.6x

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

    // El servidor es la fuente de verdad del saldo; sincronizamos en cada movimiento de dinero
    socket.on('balanceUpdated', ({ balance }) => {
      setUser(prev => prev ? { ...prev, balance } : prev);
    });

    fetch('http://localhost:3001/rooms')
      .then(res => res.json())
      .then(data => setRooms(data))
      .catch(console.error);

    return () => {
      socket.off('roomsUpdated');
      socket.off('roomUpdated');
      socket.off('balanceUpdated');
    };
  }, []);

  // Auto-login al cargar/recargar: usamos el token de sesión guardado (no requiere contraseña)
  useEffect(() => {
    const saved = sessionStorage.getItem('pokerToken');
    if (!saved) return;
    socket.emit('resumeSession', { token: saved }, (response: any) => {
      if (response.user) {
        setUser(response.user);
        setToken(saved);
        // Si estábamos sentados en una sala, volvemos a ella automáticamente (conservando saldo/asiento)
        const roomId = sessionStorage.getItem('pokerRoomId');
        if (roomId) socket.emit('joinRoom', { roomId, token: saved });
      } else {
        sessionStorage.removeItem('pokerToken');
        sessionStorage.removeItem('pokerRoomId');
      }
      setInitializing(false);
    });
  }, []);

  const handleLogin = () => {
    if (!playerName.trim()) return;
    setLoginError('');
    socket.emit('login', { name: playerName.trim(), password: loginPassword || undefined }, (response: any) => {
      if (response.needPassword) {
        setNeedPassword(true);
        setLoginError('Esta cuenta tiene contraseña. Introdúcela para entrar.');
        return;
      }
      if (response.error) {
        setLoginError(response.error);
        return;
      }
      if (response.user && response.token) {
        sessionStorage.setItem('pokerToken', response.token);
        setToken(response.token);
        setUser(response.user);
        setPlayerName('');
        setLoginPassword('');
        setNeedPassword(false);
        setLoginError('');
      }
    });
  };

  const handleLogout = () => {
    sessionStorage.removeItem('pokerToken');
    sessionStorage.removeItem('pokerRoomId');
    setCurrentRoom(null);
    setUser(null);
    setToken(null);
    setShowProfile(false);
  };

  const createRoom = () => {
    if (!newRoomName.trim()) return;
    socket.emit('createRoom', { roomName: newRoomName }, (res: any) => {
      sessionStorage.setItem('pokerRoomId', res.roomId);
      socket.emit('joinRoom', { roomId: res.roomId, token });
    });
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
    if (currentRoom) {
      socket.emit('startGame', { roomId: currentRoom.id });
    }
  };

  const handleAction = (action: string, amount?: number) => {
    socket.emit('playerAction', { roomId: currentRoom.id, userId: user?.id, action, amount });
    if (action === 'Raise') {
      setShowBetMenu(false);
    }
  };

  const handleRebuy = () => {
    if (currentRoom) socket.emit('rebuy', { roomId: currentRoom.id });
  };

  // Mientras recuperamos la sesión guardada, no parpadeamos el formulario de login
  if (!user && initializing) {
    return (
      <div className="min-h-screen bg-background text-primary flex items-center justify-center font-sans">
        <div className="animate-pulse text-gray-500 text-sm tracking-widest uppercase">Cargando…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background text-primary flex items-center justify-center p-4 font-sans">
        <div className="max-w-sm w-full space-y-8">
          <div className="text-center">
            <h1 className="text-5xl font-extrabold tracking-tighter mb-2">Offsuit</h1>
            <p className="text-gray-400 text-sm tracking-wide uppercase">Simple. Modern. Poker.</p>
          </div>
          <div className="bg-surface p-6 rounded-3xl shadow-2xl border border-surfaceLight space-y-4">
            <div>
              <input
                type="text"
                value={playerName}
                disabled={needPassword}
                onChange={(e) => { setPlayerName(e.target.value); setNeedPassword(false); setLoginPassword(''); setLoginError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                className={`w-full bg-background border border-gray-700 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-gray-400 transition-colors text-center text-lg placeholder-gray-600 ${needPassword ? 'opacity-60' : ''}`}
                placeholder="Tu nombre"
              />
            </div>
            {/* La contraseña solo se despliega si la cuenta está protegida */}
            {needPassword && (
              <div>
                <input
                  type="password"
                  autoFocus
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="w-full bg-background border border-amber-500 rounded-2xl px-5 py-4 text-white focus:outline-none transition-colors text-center text-lg placeholder-gray-600"
                  placeholder="Contraseña"
                />
              </div>
            )}
            {loginError && (
              <p className={`text-xs text-center ${needPassword ? 'text-amber-400' : 'text-red-400'}`}>{loginError}</p>
            )}
            <button
              className="w-full bg-white text-black font-bold py-4 px-4 rounded-2xl transition-transform active:scale-95"
              onClick={handleLogin}
            >
              {needPassword ? 'Entrar' : 'Play'}
            </button>
            {needPassword && (
              <button
                className="w-full text-gray-500 hover:text-white text-xs transition-colors"
                onClick={() => { setNeedPassword(false); setLoginPassword(''); setLoginError(''); }}
              >
                ← Cambiar de usuario
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!currentRoom) {
    return (
      <div className="min-h-screen bg-background text-primary p-6 flex flex-col items-center font-sans">
        {showProfile && (
          <ProfileModal
            user={user}
            token={token}
            onClose={() => setShowProfile(false)}
            onUpdate={(u) => setUser(u)}
          />
        )}
        <div className="w-full max-w-md">
          <header className="flex justify-between items-center mb-10 pt-4">
            <h1 className="text-3xl font-bold tracking-tight">Lobby</h1>
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end leading-tight">
                <span className="text-xs text-gray-400 font-medium">{user.name}</span>
                <span className={`font-mono text-sm ${user.balance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {user.balance < 0 ? `-$${Math.abs(user.balance)}` : `$${user.balance}`}
                </span>
              </div>
              <button
                onClick={() => setShowProfile(true)}
                title="Mi perfil"
                className="rounded-full ring-2 ring-transparent hover:ring-gray-500 transition-all relative"
              >
                <Avatar seed={user.avatar} />
                {user.hasPassword && (
                  <span className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 rounded-full w-3.5 h-3.5 flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                )}
              </button>
              <button
                onClick={handleLogout}
                title="Cerrar sesión"
                className="text-gray-500 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
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
  const myPlayerIndex = currentRoom.players.findIndex((p: any) => p.userId === user?.id);
  const myPlayer = myPlayerIndex !== -1 ? currentRoom.players[myPlayerIndex] : null;
  const opponents = currentRoom.players.filter((p: any) => p.userId !== user?.id && p.isActive);
  
  const isDealer = (index: number) => currentRoom.dealerIndex === index;
  const isMyTurn = currentRoom.currentTurnIndex === myPlayerIndex && !myPlayer?.isSpectating;
  const amSpectating = myPlayer?.isSpectating === true;
  // Arruinado: sin fichas y fuera de juego. Un all-in en una fase de apuestas (no foldeado) NO es estar arruinado.
  const inBettingPhase = ['preflop', 'flop', 'turn', 'river'].includes(currentRoom.phase);
  const isAllInLive = inBettingPhase && !amSpectating && !myPlayer?.hasFolded;
  const amBusted = myPlayer?.chips === 0 && !isAllInLive;
  const currentTurnPlayer = currentRoom.players[currentRoom.currentTurnIndex];
  const toCallAmount = currentRoom.highestBet - (myPlayer?.currentBet || 0);
  const minRaise = currentRoom.highestBet > 0 ? currentRoom.highestBet * 2 : 2;

  // --- Fracción restante del temporizador del turno actual (la pinta el cliente con el reloj nowMs) ---
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

  return (
    <div className="min-h-screen bg-background text-primary font-sans flex justify-center">
      <div className="w-full max-w-md h-screen relative flex flex-col justify-between overflow-hidden">

        {/* Flying chips overlay */}
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
                      {net < 0 ? `-$${Math.abs(net)}` : `$${net}`}
                    </span>
                  );
                })()}
                <span className="text-gray-500 text-xs">{viewPlayer.chips} fichas en mesa</span>
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
        </header>

        <div 
          className="pt-2 px-4 flex justify-center gap-4 cursor-pointer select-none touch-none"
          onPointerDown={() => {
            if (currentRoom.phase === 'showdown') setIsPressingShowdown(true);
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
                  {/* Temporizador "quesito" cuando es el turno de este rival */}
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
                >{p.chips}</span>
                <div className="h-5 flex items-center justify-center">
                  {p.currentBet > 0 && (
                    <div ref={(el) => { if (el) opponentBetRefs.current.set(p.id, el); }}>
                      <BetChip amount={p.currentBet} />
                    </div>
                  )}
                </div>
                
                {/* Cartas del rival en Showdown */}
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

          {showGraceWarning && (
            <div className="mb-3 mx-auto bg-red-600/90 text-white text-sm font-semibold px-4 py-2 rounded-full shadow-lg animate-pulse">
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
             <div className="mb-6 flex justify-center w-full gap-2">
                {amBusted && (
                  <button
                    onClick={handleRebuy}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white flex-1 max-w-[200px] py-3 rounded-full text-lg font-semibold transition-colors shadow-lg"
                  >
                    Recomprar 1000
                  </button>
                )}
                <button
                  onClick={() => socket.emit('nextHand', { roomId: currentRoom.id })}
                  className="bg-surfaceLight hover:bg-gray-700 text-white flex-1 max-w-[200px] py-3 rounded-full text-lg font-semibold transition-colors shadow-lg"
                >
                  Next hand
                </button>
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

                    {/* Solo mostrar raise si el jugador puede subir por encima del highestBet actual */}
                    {(myPlayer.chips + myPlayer.currentBet) > currentRoom.highestBet && (() => {
                      const quickRaise = Math.min(minRaise, myPlayer.chips + myPlayer.currentBet);
                      return (
                        <>
                          <button
                            onClick={() => handleAction('Raise', quickRaise)}
                            className="bg-surfaceLight hover:bg-gray-700 text-gray-200 px-4 rounded-full text-sm font-semibold flex-1 transition-colors"
                          >
                            Raise {quickRaise}
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
              {/* Perímetro verde de mi tiempo de turno */}
              {isMyTurn && turnTimer && (
                <TurnPerimeter fraction={turnTimer.fraction} danger={turnTimer.danger} />
              )}
              <div className="text-[10px] text-gray-400 mb-2 font-semibold">
                {currentRoom.phase === 'waiting' ? 'Waiting' : (myPlayer?.handName || 'High Card')}
              </div>
              <div
                className="relative mb-1 cursor-pointer"
                onClick={() => setViewPlayer(myPlayer || { name: user.name, avatar: user.avatar, userId: user.id, balance: user.balance, chips: 0 })}
              >
                 <Avatar seed={user.avatar} />
                 {isDealer(myPlayerIndex) && <DealerBadge />}
              </div>
              <div className="text-[11px] text-gray-400 font-bold mb-1">{user.name}</div>
              <div className="text-white font-medium text-lg" ref={myChipsRef}>{myPlayer ? myPlayer.chips : user.balance}</div>
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
