import { useState, useEffect } from 'react';
import Avatar from './Avatar';
import ProfileModal from './ProfileModal';
import MatchHistoryModal from './MatchHistoryModal';
import JackpotModal from './JackpotModal';
import SlotIcon from './SlotIcon';
import { AnimatePresence } from 'framer-motion';
import Slider from './Slider';
import { socket, STAKE_TIERS, BLIND_DIVISORS, DEFAULT_BLIND_DIVISOR, BLIND_LABELS, blindsFor, fmtChips, getStorage } from '../utils';
import { BLIND_LEVEL_DURATIONS, dailyAmountFor, hourlyAmountFor } from '../../../shared/types';
import { WheelModal } from './WheelModal';
import TriviaModal from './TriviaModal';
import MinesModal from './MinesModal';
import CrashModal from './CrashModal';
import WordleModal from './WordleModal';
import RouletteModal from './RouletteModal';
import OnlinePlayersModal from './OnlinePlayersModal';
import LevelsModal from './LevelsModal';

interface LobbyProps {
  user: { 
    id: string; 
    name: string; 
    balance: number; 
    avatar: string; 
    hasPassword: boolean; 
    lastDailyClaim: string | null; 
    lastHourlyClaim: number | null;
    freeSpinsLeft?: number;
    freeSpinValue?: number;
    lastFreeSpinsClaim?: number | null;
    level?: number;
    xp?: number;
    levelPoints?: number;
    paguitaLevel?: number;
    dietaLevel?: number;
    ruletaLevel?: number;
    triviaLevel?: number;
    jackpotUnlockLevel?: number;
  };
  token: string | null;
  rooms: any[];
  onJoinRoom: (roomId: string, buyInAmount?: number) => void;
  onLogout: () => void;
  onUpdateUser: (u: any) => void;
  onlineCount?: number;
}

interface LeaderboardEntry {
  userId: string;
  name: string;
  balance: number;
  avatar: string;
  level?: number;
  lastSeen?: number;
  isOnline?: boolean;
}

const formatLastSeen = (ts?: number) => {
  if (!ts) return 'nunca';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'hace <1m';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
};

const Lobby = ({ user, token, rooms, onJoinRoom, onLogout, onUpdateUser, onlineCount = 0 }: LobbyProps) => {
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showJackpot, setShowJackpot] = useState(false);
  const [showTrivia, setShowTrivia] = useState(false);
  const [showMines, setShowMines] = useState(false);
  const [showCrash, setShowCrash] = useState(false);
  const [showWordle, setShowWordle] = useState(false);
  const [showOnlinePlayers, setShowOnlinePlayers] = useState(false);
  const [showLevels, setShowLevels] = useState(false);
  const [showRoulette, setShowRoulette] = useState(false);

  // Create section (poker only)
  const [newRoomName, setNewRoomName] = useState(`Sala de ${user.name}`);
  const [showStakeSlider, setShowStakeSlider] = useState(false);
  const [createTierIndex, setCreateTierIndex] = useState(STAKE_TIERS.length - 1);
  const [createBlindDivisor, setCreateBlindDivisor] = useState(DEFAULT_BLIND_DIVISOR);
  const [createBlindDuration, setCreateBlindDuration] = useState(0); // ms; 0 = mesa cash

  // BlackJack buy-in modal: el jugador elige con cuánto entra
  const [buyInRoom, setBuyInRoom] = useState<{ id: string; name: string } | null>(null);
  const [buyInTierIndex, setBuyInTierIndex] = useState(1); // default 5000

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Jackpot State
  const [jackpotState, setJackpotState] = useState<{ globalSpins: number, recentWins: Array<{type: string, playerName: string, spinNumber: number, winAmount: number}> } | null>(null);

  // Presence State
  const [jackpotViewers, setJackpotViewers] = useState<{id: string, name: string, avatar: string}[]>([]);
  const [roulettePlayers, setRoulettePlayers] = useState<{id: string, name: string, avatar: string}[]>([]);

  // MINISTERIO DE DERECHOS SOCIALES
  const [now, setNow] = useState(Date.now());
  const [claimingDaily, setClaimingDaily] = useState(false);
  const [claimingHourly, setClaimingHourly] = useState(false);
  const [showWheelModal, setShowWheelModal] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const dailyAvailable = user.lastDailyClaim !== todayStr;
  const hourlyNextAt = user.lastHourlyClaim ? user.lastHourlyClaim + 30 * 60 * 1000 : 0;
  const hourlyAvailable = now >= hourlyNextAt;
  const hourlySecs = hourlyAvailable ? 0 : Math.ceil((hourlyNextAt - now) / 1000);
  const hourlyMM = String(Math.floor(hourlySecs / 60)).padStart(2, '0');
  const hourlySS = String(hourlySecs % 60).padStart(2, '0');

  const freeSpinsNextAt = user.lastFreeSpinsClaim ? user.lastFreeSpinsClaim + 60 * 60 * 1000 : 0;
  const freeSpinsAvailable = now >= freeSpinsNextAt;
  const freeSpinsSecs = freeSpinsAvailable ? 0 : Math.ceil((freeSpinsNextAt - now) / 1000);
  const freeSpinsMM = String(Math.floor(freeSpinsSecs / 60)).padStart(2, '0');
  const freeSpinsSS = String(freeSpinsSecs % 60).padStart(2, '0');

  const handleClaimDaily = () => {
    if (!dailyAvailable || claimingDaily) return;
    setClaimingDaily(true);
    socket.emit('claimDaily', { token }, (res: any) => {
      setClaimingDaily(false);
      if (res?.ok && res.user) onUpdateUser(res.user);
    });
  };

  const handleClaimHourly = () => {
    if (!hourlyAvailable || claimingHourly) return;
    setClaimingHourly(true);
    socket.emit('claimHourly', { token }, (res: any) => {
      setClaimingHourly(false);
      if (res?.ok && res.user) onUpdateUser(res.user);
    });
  };

  const handleAdminAddBalance = () => {
    socket.emit('adminAddBalance', { token }, (res: any) => {
      if (res?.user) onUpdateUser(res.user);
    });
  };

  const handleAdminAddBalance1B = () => {
    socket.emit('adminAddBalance1B', { token }, (res: any) => {
      if (res?.user) onUpdateUser(res.user);
    });
  };

  const handleAdminAddXp = () => {
    socket.emit('adminAddXp', { token }, (res: any) => {
      if (res?.user) onUpdateUser(res.user);
    });
  };

  const handleAdminResetJackpotLevel = () => {
    socket.emit('adminResetJackpotLevel', { token }, (res: any) => {
      if (res?.user) onUpdateUser(res.user);
    });
  };

  useEffect(() => {
    const fetchLeaderboard = () => {
      socket.emit('getLeaderboard', {}, (data: LeaderboardEntry[]) => {
        if (Array.isArray(data)) setLeaderboard(data);
      });
    };
    fetchLeaderboard();
    socket.on('leaderboardUpdated', fetchLeaderboard);

    socket.emit('getJackpotState', (state: any) => {
      if (state) setJackpotState(state);
    });
    const handleJackpotUpdate = (state: any) => setJackpotState(state);
    socket.on('jackpotStateUpdated', handleJackpotUpdate);

    const handleJackpotViewers = (viewers: any[]) => setJackpotViewers(viewers);
    const handleRoulettePlayers = (players: any[]) => setRoulettePlayers(players);
    socket.on('jackpot_viewers', handleJackpotViewers);
    socket.on('roulette_players', handleRoulettePlayers);

    return () => {
      socket.off('leaderboardUpdated', fetchLeaderboard);
      socket.off('jackpotStateUpdated', handleJackpotUpdate);
      socket.off('jackpot_viewers', handleJackpotViewers);
      socket.off('roulette_players', handleRoulettePlayers);
    };
  }, []);

  const openStakeSlider = () => {
    if (!newRoomName.trim()) return;
    setCreateTierIndex(STAKE_TIERS.length - 1);
    setCreateBlindDivisor(DEFAULT_BLIND_DIVISOR);
    setCreateBlindDuration(0);
    setShowStakeSlider(true);
  };

  const confirmCreateRoom = () => {
    if (!newRoomName.trim()) return;
    socket.emit('createRoom', {
      roomName: newRoomName,
      tierIndex: createTierIndex,
      blindDivisor: createBlindDivisor,
      blindLevelDuration: createBlindDuration,
      gameType: 'poker',
    }, (res: any) => {
      if (!res?.roomId) return;
      setShowStakeSlider(false);
      getStorage().setItem('pokerRoomId', res.roomId);
      socket.emit('joinRoom', { roomId: res.roomId, token });
    });
  };

  // Click en una sala: BJ abre modal de buy-in; poker entra directo.
  const handleRoomClick = (room: any) => {
    if (room.gameType === 'blackjack') {
      setBuyInTierIndex(1);
      setBuyInRoom({ id: room.id, name: room.name });
    } else {
      onJoinRoom(room.id);
    }
  };

  const confirmBuyIn = (overrideAmount?: number) => {
    if (!buyInRoom) return;
    const amount = overrideAmount ?? STAKE_TIERS[buyInTierIndex];
    onJoinRoom(buyInRoom.id, amount);
    setBuyInRoom(null);
  };

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="h-full w-full overflow-y-auto scrollbar-hide bg-background text-primary flex flex-col items-center font-sans" style={{ padding: 'max(1.5rem, env(safe-area-inset-top, 0px)) 1.5rem max(1.5rem, env(safe-area-inset-bottom, 0px))' }}>
      {showWheelModal && (
        <WheelModal user={user} token={token} onClose={() => setShowWheelModal(false)} onUpdateUser={onUpdateUser} />
      )}
      {showLevels && (
        <LevelsModal user={user} token={token} onClose={() => setShowLevels(false)} onUpdateUser={onUpdateUser} />
      )}
      {showProfile && (
        <ProfileModal user={user} token={token} onClose={() => setShowProfile(false)} onUpdate={onUpdateUser} />
      )}
      {showHistory && (
        <MatchHistoryModal token={token} onClose={() => setShowHistory(false)} />
      )}
      <AnimatePresence>
        {showJackpot && (
          <JackpotModal user={user} token={token} onClose={() => setShowJackpot(false)} onUpdateUser={onUpdateUser} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showTrivia && (
          <TriviaModal token={token} onClose={() => setShowTrivia(false)} onUpdateUser={onUpdateUser} />
        )}
      </AnimatePresence>
      {showMines && (
        <MinesModal user={user} token={token} onClose={() => setShowMines(false)} onUpdateUser={onUpdateUser} />
      )}
      {showCrash && (
        <CrashModal user={user} token={token} onClose={() => setShowCrash(false)} onUpdateUser={onUpdateUser} />
      )}
      {showWordle && (
        <WordleModal user={user} token={token} onClose={() => setShowWordle(false)} onUpdateUser={onUpdateUser} />
      )}
      {showOnlinePlayers && (
        <OnlinePlayersModal onClose={() => setShowOnlinePlayers(false)} />
      )}
      <AnimatePresence>
        {showRoulette && (
          <RouletteModal token={token || ''} balance={user.balance} userId={user.id} updateBalance={(b) => onUpdateUser({...user, balance: b})} onClose={() => setShowRoulette(false)} />
        )}
      </AnimatePresence>

      <div className="w-full max-w-md">
        {/* Header */}
        <header className="flex justify-between items-center mb-8 pt-4">
          <div 
            className="flex flex-col gap-0.5 cursor-pointer hover:opacity-80 transition-opacity active:scale-95"
            onClick={() => setShowOnlinePlayers(true)}
            title="Ver jugadores en línea"
          >
            <h1 className="text-3xl font-bold tracking-tight">Lobby</h1>
            {onlineCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-gray-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                {onlineCount} {onlineCount === 1 ? 'persona' : 'personas'} online
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowLevels(true)}
              title="Niveles"
              className="relative flex flex-col items-center justify-center px-2.5 py-1 rounded-xl border border-amber-500/30 bg-amber-500/10 active:scale-95 transition-all"
            >
              <span className="text-[8px] text-amber-300/80 uppercase tracking-wider font-bold leading-none">Nv</span>
              <span className="text-sm font-black text-amber-300 leading-none">{user.level ?? 1}</span>
              {(user.levelPoints ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-black text-white animate-pulse">
                  {user.levelPoints}
                </span>
              )}
            </button>
            <div className="flex flex-col items-end leading-tight">
              <span className="text-xs text-gray-400 font-medium">{user.name}</span>
              <span className={`font-mono text-sm ${user.balance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                {user.balance < 0 ? `-$${fmtChips(Math.abs(user.balance))}` : `$${fmtChips(user.balance)}`}
              </span>
            </div>
            <button onClick={() => setShowProfile(true)} title="Mi perfil" className="rounded-full ring-2 ring-transparent hover:ring-gray-500 transition-all relative">
              <Avatar seed={user.avatar} />
              {user.hasPassword && (
                <span className="absolute -bottom-0.5 -right-0.5 bg-emerald-500 rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </span>
              )}
            </button>
            <button onClick={() => window.location.reload()} title="Recargar" className="text-gray-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button onClick={onLogout} title="Cerrar sesión" className="text-gray-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </header>

        <div className="space-y-5">
          {/* ---- MINISTERIO DE DERECHOS SOCIALES ---- */}
          <div className="bg-surface p-5 rounded-3xl border border-surfaceLight">
            <h2 className="text-sm text-gray-400 uppercase tracking-wider font-semibold mb-4">Ministerio de Derechos Sociales</h2>
            <div className="flex gap-2">
              {/* Diario */}
              <button
                onClick={handleClaimDaily}
                disabled={!dailyAvailable || claimingDaily}
                className="flex-1 flex flex-col items-center justify-between gap-1 py-3 px-1.5 rounded-2xl border transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 disabled:active:scale-100"
                style={{ borderColor: dailyAvailable ? '#f59e0b' : '#374151', background: dailyAvailable ? 'rgba(245,158,11,0.1)' : 'transparent' }}
              >
                <span className="text-[10px] font-extrabold tracking-wider text-center">PAGUITA</span>
                <span className="text-xs font-bold text-amber-400">+{fmtChips(dailyAmountFor(user.paguitaLevel ?? 0))}</span>
                <span className="text-[9px] text-gray-400 text-center">{dailyAvailable ? 'Bono diario' : 'Mañana'}</span>
              </button>

              {/* Cada 30 min */}
              <button
                onClick={handleClaimHourly}
                disabled={!hourlyAvailable || claimingHourly}
                className="flex-1 flex flex-col items-center justify-between gap-1 py-3 px-1.5 rounded-2xl border transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 disabled:active:scale-100"
                style={{ borderColor: hourlyAvailable ? '#34d399' : '#374151', background: hourlyAvailable ? 'rgba(52,211,153,0.1)' : 'transparent' }}
              >
                <span className="text-[10px] font-extrabold tracking-wider text-center">DIETAS</span>
                <span className="text-xs font-bold text-emerald-400">+{fmtChips(hourlyAmountFor(user.dietaLevel ?? 0))}</span>
                <span className="text-[9px] text-gray-400 text-center">{hourlyAvailable ? '30 min' : `${hourlyMM}:${hourlySS}`}</span>
              </button>

              {/* Ruleta */}
              <button
                onClick={() => setShowWheelModal(true)}
                disabled={!freeSpinsAvailable}
                className="flex-1 flex flex-col items-center justify-between gap-1 py-3 px-1.5 rounded-2xl border transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 disabled:active:scale-100"
                style={{ borderColor: freeSpinsAvailable ? '#a855f7' : '#374151', background: freeSpinsAvailable ? 'rgba(168,85,247,0.1)' : 'transparent' }}
              >
                <span className="text-[10px] font-extrabold tracking-wider text-center">RULETA</span>
                <span className="text-xs font-bold text-purple-400">10 Gs</span>
                <span className="text-[9px] text-gray-400 text-center">
                  {freeSpinsAvailable ? 'Girar' : `${freeSpinsMM}:${freeSpinsSS}`}
                </span>
              </button>
            </div>
            {user.name === 'Jorge' && (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={handleAdminAddBalance}
                    className="flex-1 py-2 rounded-2xl text-xs font-bold text-red-400 border border-red-900/40 bg-red-500/8 active:scale-95 transition-all"
                  >
                    💸 +20M (Admin)
                  </button>
                  <button
                    onClick={handleAdminAddXp}
                    className="flex-1 py-2 rounded-2xl text-xs font-bold text-amber-400 border border-amber-900/40 bg-amber-500/8 active:scale-95 transition-all"
                  >
                    ⭐ +1000 XP (Admin)
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAdminAddBalance1B}
                    className="flex-1 py-2 rounded-2xl text-xs font-bold text-emerald-400 border border-emerald-900/40 bg-emerald-500/8 active:scale-95 transition-all"
                  >
                    💸 +1B (Admin)
                  </button>
                  <button
                    onClick={handleAdminResetJackpotLevel}
                    className="flex-1 py-2 rounded-2xl text-xs font-bold text-blue-400 border border-blue-900/40 bg-blue-500/8 active:scale-95 transition-all"
                  >
                    🔄 Nivel Jackpot
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ---- Mini-juegos ---- */}
          <div className="bg-surface p-5 rounded-3xl border border-surfaceLight">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm text-gray-400 uppercase tracking-wider font-semibold">MINIJUEGOS</h2>
              <span className="text-amber-500/80 text-[11px] font-bold uppercase tracking-widest bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                Nivel {(user.jackpotUnlockLevel ?? 0) + 1}
              </span>
            </div>
            <div className="flex flex-col gap-3 mb-4">
              <button
                onClick={() => setShowJackpot(true)}
                className="w-full flex flex-col items-center gap-1 py-3 px-3 rounded-2xl border border-amber-900/40 hover:border-amber-600/60 bg-amber-500/8 active:scale-[0.98] transition-all text-left"
              >
                <SlotIcon symbol="crown" className="w-9 h-9" />
                <span className="text-xs font-bold text-amber-400">Jackpot</span>
                <span className="text-[10px] text-gray-500 mb-1">Tragaperras</span>
                
                {/* Historial de Jackpot */}
                {jackpotState && jackpotState.recentWins.length > 0 && (
                  <div className="space-y-1 w-full mt-2">
                    {jackpotState.recentWins.map((win, i) => {
                      const spinsAgo = jackpotState.globalSpins - win.spinNumber;
                      const timeLabel = spinsAgo === 0 ? '¡AHORA!' : `hace ${spinsAgo}t`;
                      return (
                        <div key={i} className="bg-black/40 rounded-lg p-1.5 px-2 flex items-center justify-between text-[10px]">
                          <span className="font-bold flex items-center gap-0.5 shrink-0">
                            <SlotIcon symbol={win.type} className="w-3.5 h-3.5" />
                            <SlotIcon symbol={win.type} className="w-3.5 h-3.5" />
                            <SlotIcon symbol={win.type} className="w-3.5 h-3.5" />
                            {win.winAmount > 0 && <span className="text-amber-400 font-bold shrink-0">+{fmtChips(win.winAmount)}</span>}
                          </span>
                          <span className="text-gray-400 truncate ml-2 text-right flex items-center gap-1.5">
                            {timeLabel} <span className="text-gray-300 font-semibold">{win.playerName}</span>
                            
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* Presence */}
                {jackpotViewers.length > 0 && (
                  <div className="flex items-center gap-1 mt-1 bg-black/40 rounded-full px-2 py-0.5">
                    <div className="flex -space-x-1.5">
                      {jackpotViewers.slice(0, 3).map(v => (
                        <div key={v.id} className="relative z-10 w-4 h-4 rounded-full border border-black overflow-hidden bg-slate-800 shrink-0">
                          <Avatar seed={v.avatar} size={16} />
                        </div>
                      ))}
                    </div>
                    <span className="text-[9px] text-gray-400 ml-1 truncate max-w-[120px]">
                      {jackpotViewers.length === 1 && jackpotViewers[0].name}
                      {jackpotViewers.length === 2 && `${jackpotViewers[0].name}, ${jackpotViewers[1].name}`}
                      {jackpotViewers.length > 2 && `${jackpotViewers[0].name}, ${jackpotViewers[1].name} y ${jackpotViewers.length - 2} más`}
                    </span>
                  </div>
                )}
              </button>
              
              {/* Roulette Button */}
              <button
                onClick={() => setShowRoulette(true)}
                className="w-full flex flex-col items-center gap-1 py-3 px-3 rounded-2xl border border-emerald-900/40 hover:border-emerald-600/60 bg-emerald-500/8 active:scale-[0.98] transition-all text-left"
              >
                <div className="relative w-10 h-10 rounded-full border-4 border-slate-800 shadow-[0_0_15px_rgba(16,185,129,0.3)] bg-slate-900 overflow-hidden flex items-center justify-center">
                  <div className="absolute inset-0" style={{ background: 'conic-gradient(#ef4444 0deg 90deg, #1f2937 90deg 180deg, #ef4444 180deg 270deg, #1f2937 270deg 360deg)' }} />
                  <div className="w-4 h-4 rounded-full bg-gradient-to-br from-amber-200 to-amber-600 border border-amber-900/50 relative z-10" />
                </div>
                <span className="text-xs font-bold text-emerald-400 mt-1">Ruleta</span>
                <span className="text-[10px] text-gray-500 mb-1">Apuesta y gana hasta x36</span>
                
                {/* Presence */}
                {roulettePlayers.length > 0 && (
                  <div className="flex items-center gap-1 mt-1 bg-black/40 rounded-full px-2 py-0.5">
                    <div className="flex -space-x-1.5">
                      {roulettePlayers.slice(0, 3).map(v => (
                        <div key={v.id} className="relative z-10 w-4 h-4 rounded-full border border-black overflow-hidden bg-slate-800 shrink-0">
                          <Avatar seed={v.avatar} size={16} />
                        </div>
                      ))}
                    </div>
                    <span className="text-[9px] text-gray-400 ml-1 truncate max-w-[120px]">
                      {roulettePlayers.length === 1 && roulettePlayers[0].name}
                      {roulettePlayers.length === 2 && `${roulettePlayers[0].name}, ${roulettePlayers[1].name}`}
                      {roulettePlayers.length > 2 && `${roulettePlayers[0].name}, ${roulettePlayers[1].name} y ${roulettePlayers.length - 2} más`}
                    </span>
                  </div>
                )}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => setShowTrivia(true)}
                  className="flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-2xl border border-purple-900/40 hover:border-purple-600/60 bg-purple-500/8 active:scale-[0.98] transition-all"
                >
                  <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none">
                    <defs>
                      <linearGradient id="triviaG" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#c084fc"/>
                        <stop offset="100%" stopColor="#7c3aed"/>
                      </linearGradient>
                    </defs>
                    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="url(#triviaG)" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-xs font-bold text-purple-400">Trivia</span>
                  <span className="text-[10px] text-gray-500 text-center">Fichas o giros jackpot</span>
                </button>
                <button
                  onClick={() => setShowMines(true)}
                  className="flex-1 flex flex-col items-center gap-1 py-3 px-2 rounded-2xl border border-red-900/40 hover:border-red-600/60 bg-red-500/8 active:scale-[0.98] transition-all"
                >
                  <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.5" opacity="0.5"/>
                    <circle cx="12" cy="12" r="5" stroke="#ef4444" strokeWidth="1.5" opacity="0.7"/>
                    <circle cx="12" cy="12" r="2.5" fill="#ef4444"/>
                    <line x1="12" y1="2" x2="12" y2="6.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="12" y1="17.5" x2="12" y2="22" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="2" y1="12" x2="6.5" y2="12" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="17.5" y1="12" x2="22" y2="12" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <span className="text-xs font-bold text-red-400">Minas</span>
                  <span className="text-[10px] text-gray-500 text-center">Revela · Cobra cuando quieras</span>
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCrash(true)}
                  className="flex-1 flex flex-col items-center gap-1 py-3 px-3 rounded-2xl border border-cyan-900/40 hover:border-cyan-600/60 bg-cyan-500/8 active:scale-[0.98] transition-all"
                >
                  <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none">
                    <defs>
                      <linearGradient id="crashG" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#06b6d4"/>
                        <stop offset="100%" stopColor="#a855f7"/>
                      </linearGradient>
                    </defs>
                    <polyline points="2,18 8,10 13,14 22,4" stroke="url(#crashG)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="17,4 22,4 22,9" stroke="url(#crashG)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-xs font-bold text-cyan-400">Crash</span>
                  <span className="text-[10px] text-gray-500 text-center">Multiplica · Cobra antes del crash</span>
                </button>
                <button
                  onClick={() => setShowWordle(true)}
                  className="flex-1 flex flex-col items-center gap-1 py-3 px-3 rounded-2xl border border-emerald-900/40 hover:border-emerald-600/60 bg-emerald-500/8 active:scale-[0.98] transition-all"
                >
                  <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none">
                    <rect x="2" y="4" width="4" height="4" rx="1" fill="#16a34a"/>
                    <rect x="7" y="4" width="4" height="4" rx="1" fill="#ca8a04"/>
                    <rect x="12" y="4" width="4" height="4" rx="1" fill="#374151"/>
                    <rect x="17" y="4" width="4" height="4" rx="1" fill="#374151"/>
                    <rect x="2" y="10" width="4" height="4" rx="1" fill="#ca8a04"/>
                    <rect x="7" y="10" width="4" height="4" rx="1" fill="#16a34a"/>
                    <rect x="12" y="10" width="4" height="4" rx="1" fill="#374151"/>
                    <rect x="17" y="10" width="4" height="4" rx="1" fill="#374151"/>
                    <rect x="2" y="16" width="4" height="4" rx="1" fill="#16a34a"/>
                    <rect x="7" y="16" width="4" height="4" rx="1" fill="#16a34a"/>
                    <rect x="12" y="16" width="4" height="4" rx="1" fill="#16a34a"/>
                    <rect x="17" y="16" width="4" height="4" rx="1" fill="#16a34a"/>
                  </svg>
                  <span className="text-xs font-bold text-emerald-400">Wordle</span>
                  <span className="text-[10px] text-gray-500 text-center">Adivina · Hasta 5M de premio</span>
                </button>
              </div>
            </div>
          </div>

          {/* ---- Create Game ---- */}
          <div className="bg-surface p-5 rounded-3xl border border-surfaceLight">
            <h2 className="text-sm text-gray-400 uppercase tracking-wider font-semibold mb-4">Crear partida</h2>
            <div className="flex gap-2">
              <input
                type="text" value={newRoomName}
                onChange={e => setNewRoomName(e.target.value)}
                placeholder="Nombre de la partida..."
                className="flex-1 bg-background border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-gray-400 text-sm"
              />
              <button onClick={openStakeSlider} className="bg-white text-black px-6 py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform">
                Crear
              </button>
            </div>
          </div>

          {/* ---- Join Game ---- */}
          <div className="bg-surface p-5 rounded-3xl border border-surfaceLight">
            <h2 className="text-sm text-gray-400 uppercase tracking-wider font-semibold mb-4">JUEGOS DE CARTAS</h2>
            {rooms.length === 0 ? (
              <p className="text-gray-500 text-center py-4 text-sm">No hay partidas activas.</p>
            ) : (
              <div className="space-y-2">
                {[...rooms]
                  .sort((a, b) => {
                    const aActive = a.playerCount > 0 ? 1 : 0;
                    const bActive = b.playerCount > 0 ? 1 : 0;
                    return bActive - aActive;
                  })
                  .map(room => {
                  const isBJ = room.gameType === 'blackjack';
                  const hasPlayers = room.playerCount > 0;
                  return (
                  <button key={room.id} onClick={() => handleRoomClick(room)}
                    className={`w-full flex justify-between items-center bg-background p-4 rounded-2xl border transition-colors text-left ${
                      hasPlayers ? 'border-yellow-400 border-[1.5px] shadow-[0_0_12px_rgba(250,204,21,0.15)] hover:border-yellow-300'
                      : isBJ ? 'border-sky-900/40 hover:border-sky-600/60' 
                      : room.isTournament ? 'border-amber-900/40 hover:border-amber-600/60' 
                      : 'border-gray-800 hover:border-gray-500'}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isBJ ? 'bg-sky-500/20 text-sky-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
                          {isBJ ? 'BJ' : 'PK'}
                        </span>
                        <h3 className="font-semibold text-base">{room.name}</h3>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{room.playerCount}/8 jugadores • {isBJ ? (room.phase || 'waiting') : room.phase}</p>
                      {isBJ ? (
                        <p className="text-xs mt-0.5">
                          <span className="text-sky-300/80 font-semibold">Apuesta desde {fmtChips(room.minBet || 25)} · sin tope</span>
                          <span className="text-gray-600"> • </span>
                          <span className="text-emerald-300/80 font-semibold">Buy-in libre</span>
                        </p>
                      ) : room.bigBlind != null && (
                        <p className="text-xs mt-0.5">
                          <span className="text-emerald-300/80 font-semibold">{fmtChips(room.smallBlind)}/{fmtChips(room.bigBlind)}</span>
                          <span className="text-gray-600"> • </span>
                          <span className="text-rose-300/80 font-semibold">Entrada {fmtChips(room.buyIn)}</span>
                          {room.isTournament && (
                            <>
                              <span className="text-gray-600"> • </span>
                              <span className="text-amber-400/80 font-semibold">Ciegas suben</span>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isBJ ? 'bg-sky-500/20' : room.isTournament ? 'bg-amber-500/20' : 'bg-surfaceLight'}`}>
                      <svg className={`w-4 h-4 ${isBJ ? 'text-sky-400' : room.isTournament ? 'text-amber-400' : 'text-white'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                );
                })}
              </div>
            )}
          </div>

          {/* ---- Mi historial ---- */}
          <button
            onClick={() => setShowHistory(true)}
            className="w-full flex items-center justify-between bg-surface p-4 rounded-3xl border border-surfaceLight hover:border-gray-500 transition-colors active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-amber-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-sm">Mis partidas</h3>
                <p className="text-[11px] text-gray-500">Entrada · máximo · salida · diferencia</p>
              </div>
            </div>
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* ---- Leaderboard ---- */}
          <div className="bg-surface p-5 rounded-3xl border border-surfaceLight">
            <h2 className="text-sm text-gray-400 uppercase tracking-wider font-semibold mb-4">Ranking</h2>
            {leaderboard.length === 0 ? (
              <p className="text-gray-500 text-center py-4 text-sm">Cargando ranking...</p>
            ) : (
              <div className="space-y-1.5">
                {leaderboard.map((entry, i) => {
                  const isMe = entry.name === user.name;
                  let borderCls = isMe ? 'border-emerald-500/30' : 'border-transparent';
                  let bgCls = isMe ? 'bg-emerald-500/10' : 'bg-background';
                  
                  if (i === 0) { borderCls = 'border-yellow-400/60 shadow-[0_0_12px_rgba(250,204,21,0.15)]'; bgCls = isMe ? 'bg-emerald-500/10' : 'bg-yellow-400/5'; }
                  else if (i === 1) { borderCls = 'border-slate-300/60 shadow-[0_0_12px_rgba(203,213,225,0.15)]'; bgCls = isMe ? 'bg-emerald-500/10' : 'bg-slate-300/5'; }
                  else if (i === 2) { borderCls = 'border-amber-600/60 shadow-[0_0_12px_rgba(217,119,6,0.15)]'; bgCls = isMe ? 'bg-emerald-500/10' : 'bg-amber-600/5'; }

                  return (
                    <div
                      key={entry.name}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors border ${bgCls} ${borderCls}`}
                    >
                      <span className="w-7 text-center text-sm font-bold shrink-0">
                        {i < 3 ? medals[i] : <span className="text-gray-600">{i + 1}</span>}
                      </span>
                      <div className="relative shrink-0">
                        <Avatar seed={entry.avatar} size={28} />
                        <span className="absolute -top-1 -left-1 z-10 min-w-[14px] h-3.5 px-0.5 rounded-full bg-amber-500 border border-black/40 flex items-center justify-center text-[8px] font-black text-black leading-none">
                          {entry.level ?? 1}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate flex-1 ${isMe ? 'text-emerald-300' : 'text-gray-300'}`}>
                          {entry.name}
                        </div>
                        <div className="text-[10px] text-gray-500 font-medium">
                          {entry.isOnline ? <span className="text-emerald-400">En línea</span> : formatLastSeen(entry.lastSeen)}
                        </div>
                      </div>
                      <span className={`font-mono text-sm font-semibold shrink-0 ${entry.balance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {entry.balance < 0 ? `-$${fmtChips(Math.abs(entry.balance))}` : `$${fmtChips(entry.balance)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stake + blind-speed modal (poker) */}
      {showStakeSlider && (() => {
        const buyIn = STAKE_TIERS[createTierIndex];
        const { smallBlind, bigBlind } = blindsFor(buyIn, createBlindDivisor);
        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setShowStakeSlider(false)}>
            <div className="w-full max-w-md bg-surface rounded-3xl p-6 border border-surfaceLight max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <h2 className="text-center text-lg font-bold mb-1 truncate">{newRoomName}</h2>
              <p className="text-center text-xs text-gray-500 mb-4 uppercase tracking-wider">Configura la partida</p>

              <div className="text-center mb-4">
                <p className="text-sm text-emerald-300/80 font-semibold">Ciegas iniciales</p>
                <p className="text-4xl font-extrabold text-emerald-200">{fmtChips(smallBlind)} / {fmtChips(bigBlind)}</p>
              </div>
              <div className="text-center mb-6">
                <p className="text-sm text-rose-300/80 font-semibold">Entrada</p>
                <p className="text-4xl font-extrabold text-rose-300">{fmtChips(buyIn)}</p>
              </div>

              <p className="text-[11px] text-gray-500 mb-1 px-1">Entrada</p>
              <Slider min={0} max={STAKE_TIERS.length - 1} step={1} value={createTierIndex} onChange={v => setCreateTierIndex(v)} accent="rose" formatLabel={v => fmtChips(STAKE_TIERS[v])} />
              <div className="flex justify-between px-1 mb-5 mt-1">
                {STAKE_TIERS.map((b, i) => (
                  <button key={i} onClick={() => setCreateTierIndex(i)} className={`text-[9px] ${i === createTierIndex ? 'text-white font-bold' : 'text-gray-600'}`}>{fmtChips(b)}</button>
                ))}
              </div>

              <p className="text-[11px] text-gray-500 mb-1 px-1">Ciegas iniciales</p>
              <div className="flex gap-1.5 mb-5">
                {BLIND_DIVISORS.map(d => (
                  <button key={d} onClick={() => setCreateBlindDivisor(d)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${d === createBlindDivisor ? 'bg-emerald-500 text-black' : 'bg-background border border-gray-700 text-gray-400'}`}>
                    {BLIND_LABELS[d]}
                  </button>
                ))}
              </div>

              <p className="text-[11px] text-gray-500 mb-1 px-1">Subida de ciegas</p>
              <div className="flex gap-1.5 mb-2">
                {BLIND_LEVEL_DURATIONS.map(opt => (
                  <button key={opt.key} onClick={() => setCreateBlindDuration(opt.ms)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${opt.ms === createBlindDuration ? 'bg-amber-500 text-black' : 'bg-background border border-gray-700 text-gray-400'}`}>
                    <div>{opt.label}</div>
                    <div className="text-[9px] opacity-70">{opt.sub}</div>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-600 mb-6 px-1">
                {createBlindDuration === 0
                  ? 'Mesa cash: las ciegas no suben y puedes recomprar al quedarte sin fichas.'
                  : 'Torneo: las ciegas suben con el tiempo, sin recompra. Gana quien se quede con todas las fichas.'}
              </p>

              <div className="flex gap-2">
                <button onClick={() => setShowStakeSlider(false)} className="flex-1 bg-background border border-gray-700 text-gray-300 py-3 rounded-xl font-semibold text-sm active:scale-95 transition-transform">Cancelar</button>
                <button onClick={confirmCreateRoom} className="flex-1 bg-white text-black py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform">Crear</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* BlackJack buy-in modal */}
      {buyInRoom && (() => {
        const amount = STAKE_TIERS[buyInTierIndex];
        return (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setBuyInRoom(null)}>
            <div className="w-full max-w-md bg-surface rounded-3xl p-6 border border-surfaceLight" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-sky-500/20 text-sky-300">BJ</span>
                <h2 className="text-lg font-bold truncate">{buyInRoom.name}</h2>
              </div>
              <p className="text-center text-xs text-gray-500 mb-6 uppercase tracking-wider">¿Con cuánto quieres entrar?</p>

              <div className="text-center mb-6">
                <p className="text-sm text-emerald-300/80 font-semibold">Buy-in</p>
                <p className="text-5xl font-extrabold text-emerald-200">{fmtChips(amount)}</p>
              </div>

              <Slider min={0} max={STAKE_TIERS.length - 1} step={1} value={buyInTierIndex} onChange={v => setBuyInTierIndex(v)} accent="emerald" formatLabel={v => fmtChips(STAKE_TIERS[v])} />
              <div className="flex justify-between px-1 mb-5 mt-1">
                {STAKE_TIERS.map((b, i) => (
                  <button key={i} onClick={() => setBuyInTierIndex(i)} className={`text-[9px] ${i === buyInTierIndex ? 'text-white font-bold' : 'text-gray-600'}`}>{fmtChips(b)}</button>
                ))}
              </div>

              <p className="text-[10px] text-gray-600 mb-6 px-1">
                Entras con estas fichas. Al salir, tus fichas vuelven al saldo.
              </p>

              <div className="flex gap-2 mb-2">
                <button onClick={() => setBuyInRoom(null)} className="flex-1 bg-background border border-gray-700 text-gray-300 py-3 rounded-xl font-semibold text-sm active:scale-95 transition-transform">Cancelar</button>
                <button onClick={() => confirmBuyIn()} className="flex-1 bg-sky-500 text-black py-3 rounded-xl font-bold text-sm active:scale-95 transition-transform">Entrar con {fmtChips(amount)}</button>
              </div>
              {user.balance > 0 && (
                <button onClick={() => confirmBuyIn(user.balance)} className="w-full bg-amber-500/15 border border-amber-500/30 text-amber-400 py-2.5 rounded-xl font-bold text-sm active:scale-95 transition-transform">
                  💰 Todo mi saldo — {fmtChips(user.balance)}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      <div className="mt-8 mb-6 text-center flex flex-col items-center gap-2">
        <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">
          Creado por Jorge Alejandro Estefanía Hidalgo
        </p>
      </div>
    </div>
  );
};

export default Lobby;
