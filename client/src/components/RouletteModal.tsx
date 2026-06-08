import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket, fmtChips, vibrate } from '../utils';
import { ChipRail, ChipStack, chipsFromAmount, pageForAmount, type ChipDenom } from './Chips';
import AnimatedNumber from './AnimatedNumber';
import Avatar from './Avatar';

const TimerCircle = ({ total, current, color }: { total: number, current: number, color: string }) => {
  const radius = 22; 
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, current / total));
  const strokeDashoffset = circumference * (1 - progress);
  
  return (
    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 52 52">
      <circle cx="26" cy="26" r={radius} stroke="#1e293b" strokeWidth="4" fill="transparent" />
      <circle 
        cx="26" cy="26" r={radius} 
        stroke={color} strokeWidth="4" fill="transparent" 
        strokeDasharray={circumference} 
        strokeDashoffset={strokeDashoffset} 
        strokeLinecap="round" 
      />
    </svg>
  );
};

const ROULETTE_NUMBERS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

const isZoneWinner = (zone: string, resultNum: number) => {
  if (zone === resultNum.toString()) return true;
  if (zone === 'red' && RED_NUMS.has(resultNum)) return true;
  if (zone === 'black' && resultNum !== 0 && !RED_NUMS.has(resultNum)) return true;
  if (zone === 'even' && resultNum !== 0 && resultNum % 2 === 0) return true;
  if (zone === 'odd' && resultNum % 2 !== 0) return true;
  if (zone === 'low' && resultNum >= 1 && resultNum <= 18) return true;
  if (zone === 'high' && resultNum >= 19 && resultNum <= 36) return true;
  if (zone.startsWith('dozen') && Math.ceil(resultNum / 12) === parseInt(zone.split('_')[1])) return true;
  if (zone.startsWith('col') && ((resultNum - parseInt(zone.split('_')[1])) % 3 === 0) && resultNum !== 0) return true;
  return false;
};

const getZoneMultiplier = (zone: string) => {
  if (!Number.isNaN(parseInt(zone)) && zone !== '0' && zone.length <= 2 && zone !== 'red' && zone !== 'black' && zone !== 'even' && zone !== 'odd' && zone !== 'low' && zone !== 'high') return 36;
  if (zone === '0') return 36;
  if (zone.startsWith('dozen') || zone.startsWith('col')) return 3;
  return 2;
};

export default function RouletteModal({
  onClose, balance, updateBalance, token, userId
}: {
  onClose: () => void; balance: number; updateBalance: (newBalance: number) => void; token: string; userId: string;
}) {
  const [bets, setBets] = useState<Record<string, number>>({});
  const [previousBets, setPreviousBets] = useState<Record<string, number>>({});
  const [payouts, setPayouts] = useState<Record<string, number>>({});
  const [activeChipPage, setActiveChipPage] = useState(() => pageForAmount(balance));
  const [activeChip, setActiveChip] = useState<ChipDenom | null>(null);

  const updateBalanceRef = useRef(updateBalance);
  useEffect(() => {
    updateBalanceRef.current = updateBalance;
  }, [updateBalance]);

  const [spinning, setSpinning] = useState(false);
  const [globalPhase, setGlobalPhase] = useState<'betting' | 'spinning'>('betting');
  const [serverNextStateAt, setServerNextStateAt] = useState(() => Date.now() + 30000);
  const [localTimeRemaining, setLocalTimeRemaining] = useState(30);
  const [initialBalance] = useState(balance);
  const [settledBalance, setSettledBalance] = useState(balance);
  const sessionDiff = settledBalance - initialBalance;

  const [result, setResult] = useState<{ num: number; win: number; net: number } | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [spinDeg, setSpinDeg] = useState(0);

  interface TablePlayer {
    id: string;
    name: string;
    avatar: string;
    totalBet: number;
    lastNet?: number; // filled after results
    bets?: Record<string, number>;
  }
  const [tablePlayers, setTablePlayers] = useState<TablePlayer[]>([]);

  const otherPlayersBets = useMemo(() => {
    const aggregated: Record<string, number> = {};
    tablePlayers.filter(p => p.id !== userId).forEach(p => {
      if (p.bets) {
        Object.entries(p.bets).forEach(([zone, amt]) => {
          aggregated[zone] = (aggregated[zone] || 0) + amt;
        });
      }
    });
    return aggregated;
  }, [tablePlayers, userId]);

  // Smooth local timer interpolation
  useEffect(() => {
    let animationFrameId: number;
    const updateTime = () => {
      const remaining = Math.max(0, (serverNextStateAt - Date.now()) / 1000);
      setLocalTimeRemaining(remaining);
      animationFrameId = requestAnimationFrame(updateTime);
    };
    updateTime();
    return () => cancelAnimationFrame(animationFrameId);
  }, [serverNextStateAt]);

  useEffect(() => {
    socket.emit('roulette_sync', { token }, (res: any) => {
      if (res.ok) {
        setGlobalPhase(res.state.phase);
        if (res.state.timeRemainingMs !== undefined) setServerNextStateAt(Date.now() + res.state.timeRemainingMs);
        setHistory(res.state.history || []);
        setBets(res.myBets || {});
        if (res.state.players) setTablePlayers(res.state.players);
      }
    });

    // Join the roulette table
    socket.emit('roulette_join', { token });

    const handleState = (state: any) => {
      setGlobalPhase(prevPhase => {
        if (prevPhase !== state.phase) {
          if (state.timeRemainingMs !== undefined) setServerNextStateAt(Date.now() + state.timeRemainingMs);
          if (prevPhase === 'spinning' && state.phase === 'betting') {
            setResult(null);
            setBets({});
            setPayouts({});
            setTablePlayers(prev => prev.map(p => ({ ...p, lastNet: undefined, totalBet: 0, bets: undefined })));
          }
        }
        return state.phase;
      });

      setServerNextStateAt(prev => {
        if (state.timeRemainingMs === undefined) return prev;
        const newTarget = Date.now() + state.timeRemainingMs;
        // Solo actualizar si hay un desvío mayor a 1 segundo para no dar tirones
        if (Math.abs(prev - newTarget) > 1000) {
          return newTarget;
        }
        return prev;
      });
      if (state.history) setHistory(state.history);
    };

    const handleSpin = ({ resultNum }: any) => {
      setSpinning(true);
      setResult(null);
      setGlobalPhase('spinning');
      setServerNextStateAt(Date.now() + 15000); // 15 seconds local override during spin
      
      const targetIndex = ROULETTE_NUMBERS.indexOf(resultNum);
      const slice = 360 / 37;
      const targetAngle = 360 - (targetIndex * slice);
      const spins = 5 * 360;
      
      setSpinDeg(prev => prev + spins + ((targetAngle - (prev % 360)) + 360) % 360);
      
      setTimeout(() => {
        setSpinning(false);
        setBets(currentBets => {
          if (Object.keys(currentBets).length > 0) {
            setPreviousBets({ ...currentBets });
          }
          
          const nextBets = { ...currentBets };
          const newPayouts: Record<string, number> = {};
          let totalBetted = 0;
          let win = 0;
          
          for (const [z, amt] of Object.entries(nextBets)) {
            totalBetted += amt;
            if (isZoneWinner(z, resultNum)) {
              const payout = getZoneMultiplier(z) * amt;
              newPayouts[z] = payout;
              win += payout;
            } else {
              delete nextBets[z];
            }
          }
          
          if (totalBetted > 0) {
            setResult({ num: resultNum, win, net: win - totalBetted });
          } else {
            setResult({ num: resultNum, win: 0, net: 0 });
          }
          
          setPayouts(newPayouts);
          return nextBets;
        });

        socket.emit('resumeSession', { token }, (res: any) => {
          if (res && res.user) {
            updateBalanceRef.current(res.user.balance);
            setSettledBalance(res.user.balance);
          }
        });
      }, 4000);
    };

    const handlePlayers = (players: TablePlayer[]) => {
      setTablePlayers(players);
    };

    const handleResults = ({ results }: any) => {
      if (!results) return;
      // Delay showing results until after spin animation completes (4s)
      setTimeout(() => {
        setTablePlayers(prev => prev.map(p => {
          const r = results[p.id];
          if (r) return { ...p, lastNet: r.net };
          return p;
        }));
      }, 4000);
    };

    socket.on('roulette_state', handleState);
    socket.on('roulette_spin', handleSpin);
    socket.on('roulette_players', handlePlayers);
    socket.on('roulette_results', handleResults);

    return () => {
      socket.off('roulette_state', handleState);
      socket.off('roulette_spin', handleSpin);
      socket.off('roulette_players', handlePlayers);
      socket.off('roulette_results', handleResults);
      socket.emit('roulette_leave', { token });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);



  // Auto-ajustar la página de fichas cuando termina un giro (basado en el nuevo saldo)
  useEffect(() => {
    if (!spinning) setActiveChipPage(pageForAmount(balance));
  }, [spinning, balance]);

  const totalBet = Object.values(bets || {}).reduce((a, b) => a + b, 0);
  const displayedTotalBet = result ? result.win - result.net : totalBet;

  const placeBet = (zone: string, e?: React.MouseEvent) => {
    if (globalPhase !== 'betting' || localTimeRemaining <= 5) return;
    if (e && e.type === 'contextmenu') { e.preventDefault(); return; }
    if (!activeChip || balance < activeChip.v) return;
    
    setBets(prev => ({ ...prev, [zone]: (prev[zone] || 0) + activeChip.v }));
    updateBalance(balance - activeChip.v);
    vibrate(10);
    
    socket.emit('roulette_place_bet', { token, bets: { [zone]: activeChip.v } }, (res: any) => {
      if (res.error) {
        socket.emit('roulette_sync', { token }, (s: any) => { if (s.ok) setBets(s.myBets || {}); });
      } else if (res.balance !== undefined) {
        updateBalance(res.balance);
      }
    });
  };

  const clearBets = () => { 
    if (globalPhase !== 'betting' || localTimeRemaining <= 5) return;
    socket.emit('roulette_clear_bets', { token }, (res: any) => {
      if (res.ok) {
        setBets({});
        if (res.balance !== undefined) updateBalance(res.balance);
      }
    });
  };

  const repeatBet = () => {
    if (globalPhase !== 'betting' || localTimeRemaining <= 5) return;
    const totalNeeded = Object.values(previousBets || {}).reduce((a, b) => a + b, 0);
    if (totalNeeded === 0 || balance < totalNeeded) return;
    
    setBets(prev => {
      const next = { ...prev };
      for (const [z, amt] of Object.entries(previousBets)) next[z] = (next[z] || 0) + amt;
      return next;
    });
    updateBalance(balance - totalNeeded);
    vibrate(10);
    
    socket.emit('roulette_place_bet', { token, bets: previousBets }, (res: any) => {
      if (res.error) socket.emit('roulette_sync', { token }, (s: any) => { if (s.ok) setBets(s.myBets || {}); });
    });
  };

  const doubleBet = () => {
    if (globalPhase !== 'betting' || localTimeRemaining <= 5) return;
    const currentBets = { ...bets };
    const totalNeeded = Object.values(currentBets || {}).reduce((a, b) => a + b, 0);
    if (totalNeeded === 0 || balance < totalNeeded) return;
    
    setBets(prev => {
      const next = { ...prev };
      for (const [z, amt] of Object.entries(currentBets)) next[z] = (next[z] || 0) + amt;
      return next;
    });
    updateBalance(balance - totalNeeded);
    vibrate(10);
    
    socket.emit('roulette_place_bet', { token, bets: currentBets }, (res: any) => {
      if (res.error) socket.emit('roulette_sync', { token }, (s: any) => { if (s.ok) setBets(s.myBets || {}); });
    });
  };

  // // Generate table layout
  // const rows = [
  //   [3,6,9,12,15,18,21,24,27,30,33,36],
  //   [2,5,8,11,14,17,20,23,26,29,32,35],
  //   [1,4,7,10,13,16,19,22,25,28,31,34]
  // ];

  const getNumColor = (n: number) => n === 0 ? '#10b981' : RED_NUMS.has(n) ? '#ef4444' : '#1f2937';

  const renderZone = (zone: string, label: React.ReactNode, colSpan = 1, rowSpan = 1, color = 'rgba(255,255,255,0.05)', textColor = 'white', border = 'border-white/10', customStyle?: React.CSSProperties) => {
    const betAmt = bets[zone] || 0;
    const chips = betAmt > 0 ? chipsFromAmount(betAmt) : [];
    const otherAmt = otherPlayersBets[zone] || 0;
    const otherChips = otherAmt > 0 ? chipsFromAmount(otherAmt) : [];

    return (
      <div 
        key={zone}
        className={`relative flex items-center justify-center font-bold select-none cursor-pointer border hover:brightness-125 transition-all ${border}`}
        style={{ gridColumn: customStyle?.gridColumn || `span ${colSpan}`, gridRow: customStyle?.gridRow || `span ${rowSpan}`, backgroundColor: color, color: textColor, ...customStyle }}
        onClick={(e) => placeBet(zone, e)}
        onContextMenu={(e) => placeBet(zone, e)}
      >
        <span className="z-0 pointer-events-none text-[10px] sm:text-base leading-none">{label}</span>
        <AnimatePresence>
          {betAmt > 0 && (
            <motion.div 
              key="original-bet"
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0, opacity: 0 }}
              className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none drop-shadow-md"
            >
              <div className="scale-[0.4] sm:scale-75 origin-center">
                <ChipStack chips={chips} size={28} />
              </div>
              <div className="absolute bg-black/60 rounded px-1 text-[8px] sm:text-[9px] text-white bottom-0.5 right-0.5">
                {fmtChips(betAmt)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {otherAmt > 0 && (
            <motion.div 
              key="other-bet"
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0, opacity: 0 }}
              className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none opacity-60 drop-shadow-md translate-x-2 -translate-y-2 sm:translate-x-4 sm:-translate-y-4"
            >
              <div className="scale-[0.35] sm:scale-[0.65] origin-center">
                <ChipStack chips={otherChips} size={28} />
              </div>
              <div className="absolute bg-slate-800/80 rounded px-1 text-[6px] sm:text-[7px] text-slate-300 top-0.5 left-0.5">
                {fmtChips(otherAmt)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(payouts[zone] || 0) > 0 && (
            <motion.div 
              key="payout"
              initial={{ y: -60, scale: 0, opacity: 0 }} 
              animate={{ y: -10, x: 10, scale: 1, opacity: 1 }} 
              exit={{ y: -60, opacity: 0 }}
              transition={{ type: 'spring', bounce: 0.5, duration: 0.6 }}
              className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none drop-shadow-xl"
            >
              <div className="scale-[0.4] sm:scale-75 origin-center">
                <ChipStack chips={chipsFromAmount(payouts[zone])} size={28} />
              </div>
              <div className="absolute bg-emerald-600/90 rounded px-1 text-[8px] sm:text-[9px] font-black text-emerald-50 bottom-1 -right-1 border border-emerald-400">
                +{fmtChips(payouts[zone])}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {result && result.num !== null && (zone === result.num.toString() || (zone === 'red' && RED_NUMS.has(result.num)) || (zone === 'black' && result.num !== 0 && !RED_NUMS.has(result.num)) || (zone === 'even' && result.num !== 0 && result.num % 2 === 0) || (zone === 'odd' && result.num % 2 !== 0) || (zone === 'low' && result.num >= 1 && result.num <= 18) || (zone === 'high' && result.num >= 19 && result.num <= 36) || (zone.startsWith('dozen') && Math.ceil(result.num / 12) === parseInt(zone.split('_')[1])) || (zone.startsWith('col') && ((result.num - parseInt(zone.split('_')[1])) % 3 === 0))) && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }} 
            animate={{ opacity: [0, 1, 0, 1], scale: [0.8, 1.1, 1, 1.1] }} 
            transition={{ duration: 1 }}
            className="absolute inset-0 ring-2 ring-yellow-400 bg-yellow-400/20 z-0"
          />
        )}
        
        {/* Marcador de cristal (Dolly) SÓLO en el número exacto */}
        {result && result.num !== null && zone === result.num.toString() && (
          <motion.div 
            className="absolute inset-0 flex items-end justify-center pb-1 pointer-events-none z-[60]"
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', bounce: 0.5, duration: 0.6 }}
          >
            <svg viewBox="0 0 32 48" className="w-7 h-10 sm:w-10 sm:h-14 drop-shadow-[0_12px_10px_rgba(0,0,0,0.6)]">
              <defs>
                <linearGradient id="baseGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.9" />
                  <stop offset="30%" stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="60%" stopColor="#94a3b8" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#475569" stopOpacity="0.95" />
                </linearGradient>
                <linearGradient id="stemGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.7" />
                  <stop offset="40%" stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="70%" stopColor="#cbd5e1" stopOpacity="0.5" />
                  <stop offset="100%" stopColor="#475569" stopOpacity="0.85" />
                </linearGradient>
                <radialGradient id="ballGrad" cx="40%" cy="30%" r="60%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="40%" stopColor="#e2e8f0" stopOpacity="0.9" />
                  <stop offset="80%" stopColor="#94a3b8" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#334155" stopOpacity="0.95" />
                </radialGradient>
              </defs>

              {/* Base Bottom Edge (gives thickness) */}
              <ellipse cx="16" cy="38" rx="14" ry="10" fill="#475569" opacity="0.8" />
              
              {/* Base Top Surface */}
              <ellipse cx="16" cy="36" rx="14" ry="10" fill="url(#baseGrad)" />
              <ellipse cx="16" cy="36" rx="11.5" ry="8" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.8" />

              {/* Lower Stem Ring Thickness */}
              <ellipse cx="16" cy="31" rx="9" ry="6" fill="#475569" opacity="0.6" />
              {/* Lower Stem Ring */}
              <ellipse cx="16" cy="29" rx="9" ry="6" fill="url(#baseGrad)" />
              
              {/* Stem */}
              <path d="M11.5 17 C11.5 24, 9 29, 9 29 A 7 4.5 0 0 0 23 29 C23 24, 20.5 17, 20.5 17 Z" fill="url(#stemGrad)" />
              <path d="M13 17 C13 24, 11 29, 11 29 A 5 3.5 0 0 0 16 32 C16.5 30, 15 24, 15 17 Z" fill="#ffffff" opacity="0.7" />

              {/* Upper Stem Ring */}
              <ellipse cx="16" cy="18" rx="5.5" ry="4" fill="#475569" opacity="0.5" />
              <ellipse cx="16" cy="17" rx="5.5" ry="4" fill="url(#baseGrad)" />

              {/* Top Ball */}
              <circle cx="16" cy="10" r="7.5" fill="url(#ballGrad)" />
              <ellipse cx="13.5" cy="7" rx="2.5" ry="1.5" fill="#ffffff" transform="rotate(-30 13.5 7)" />
            </svg>
          </motion.div>
        )}
      </div>
    );
  };

  const displayHistory = spinning ? (history || []).slice(1) : (history || []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#000000] flex justify-center"
      style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="w-full max-w-5xl flex flex-col h-full overflow-hidden relative">
        {/* Header */}
        <div className="relative flex justify-between items-center px-4 py-2 z-20 shrink-0 bg-slate-900 border-b border-slate-800">
          <div className="flex flex-col items-start gap-0.5">
            <button onClick={onClose} className="text-white/70 text-xs px-3 py-1.5 rounded-full bg-black/35 border border-white/10 backdrop-blur active:scale-95">
              ← Salir
            </button>
            <span className={`text-[10px] font-bold px-1 ${sessionDiff > 0 ? 'text-emerald-400' : sessionDiff < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
              {sessionDiff > 0 ? '+' : ''}{fmtChips(sessionDiff)}
            </span>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-extrabold tracking-[0.3em] text-amber-200/90">RULETA</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider leading-none mb-1">Saldo</div>
            <div className="text-xs sm:text-sm font-black text-amber-400">
              <AnimatedNumber value={balance} />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col px-2 pt-2 pb-0 sm:px-6 sm:pt-4 sm:pb-2 gap-3 sm:gap-6 relative">
          
          {/* Wheel Section */}
          <div className="flex justify-center items-center w-full max-w-3xl mx-auto py-0 sm:py-2 px-1 sm:px-4 relative shrink-0">
            
            {/* Left Overlay: Dual Timers */}
            <div className="absolute top-0 left-2 sm:left-4 z-20 flex flex-col gap-6 sm:gap-8 mt-2">
               {/* Spin Timer */}
               <div className="flex flex-col items-center">
                 <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-full bg-slate-900/60 backdrop-blur-sm shadow-lg">
                   <TimerCircle total={45} current={globalPhase === 'spinning' ? localTimeRemaining + 30 : localTimeRemaining} color="#3b82f6" />
                   <span className="text-sm sm:text-lg font-black text-blue-400">
                     {Math.ceil(globalPhase === 'spinning' ? localTimeRemaining + 30 : localTimeRemaining)}
                   </span>
                   <div className="absolute -bottom-4 sm:-bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                     <div className="text-[8px] sm:text-[10px] font-bold text-blue-400 uppercase tracking-widest bg-slate-900/80 px-2 py-0.5 rounded border border-blue-500/30 shadow-md">Giro</div>
                   </div>
                 </div>
               </div>

               {/* Betting Timer */}
               <div className="flex flex-col items-center">
                 <div className="relative w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-full bg-slate-900/60 backdrop-blur-sm shadow-lg">
                   <TimerCircle total={25} current={globalPhase === 'spinning' ? 0 : Math.max(0, localTimeRemaining - 5)} color={(Math.max(0, localTimeRemaining - 5) <= 0 || globalPhase === 'spinning') ? '#f43f5e' : '#10b981'} />
                   <span className={`text-sm sm:text-lg font-black ${(Math.max(0, localTimeRemaining - 5) <= 0 || globalPhase === 'spinning') ? 'text-rose-500' : 'text-emerald-400'}`}>
                     {globalPhase === 'spinning' ? '0' : Math.ceil(Math.max(0, localTimeRemaining - 5))}
                   </span>
                   <div className="absolute -bottom-4 sm:-bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                     {Math.max(0, localTimeRemaining - 5) <= 0 && globalPhase === 'betting' ? (
                       <div className="text-[8px] sm:text-[10px] font-bold text-rose-500 uppercase tracking-widest bg-slate-900/80 px-1 py-0.5 rounded border border-rose-500/50 animate-pulse text-center shadow-md">No va más</div>
                     ) : globalPhase === 'betting' ? (
                       <div className="text-[8px] sm:text-[10px] font-bold text-emerald-500 uppercase tracking-widest bg-slate-900/80 px-2 py-0.5 rounded border border-emerald-500/30 shadow-md">Apuestas</div>
                     ) : (
                       <div className="text-[8px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700 shadow-md">Bloqueado</div>
                     )}
                   </div>
                 </div>
               </div>

               {/* Total Bet */}
               <div className="mt-2 flex flex-col items-center gap-1">
                 <div className="bg-slate-900/80 rounded border border-slate-700/50 p-1 shadow-lg text-center min-w-[48px] sm:min-w-[56px]">
                   <div className="text-[7px] sm:text-[9px] text-slate-400 font-bold uppercase tracking-widest">Apostado</div>
                   <div className="text-xs sm:text-sm font-black text-amber-400 leading-tight">{fmtChips(displayedTotalBet)}</div>
                 </div>
                 {result && (
                   <div className={`text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded ${result.net > 0 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : result.net < 0 ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-slate-500/20 text-slate-400 border border-slate-500/30'}`}>
                     {result.net > 0 ? '+' : ''}{fmtChips(result.net)}
                   </div>
                 )}
               </div>
            </div>



            {/* Center: Wheel */}
            <div className="relative w-48 h-48 sm:w-72 sm:h-72 rounded-full border-[6px] sm:border-8 border-slate-800 shadow-[0_0_40px_rgba(0,0,0,0.8)] bg-slate-900 overflow-hidden shrink-0">
               <motion.div 
                 className="absolute inset-0 rounded-full"
                 animate={{ rotate: spinDeg }}
                 transition={spinning ? { duration: 4, ease: [0.2, 0.8, 0.2, 1] } : { duration: 0 }}
                 style={{ 
                   background: `conic-gradient(from -4.86deg, ${ROULETTE_NUMBERS.map((n, i) => `${getNumColor(n)} ${(i * 360) / 37}deg ${((i + 1) * 360) / 37}deg`).join(', ')})`
                 }}
               >
                 {ROULETTE_NUMBERS.map((n, i) => (
                   <div 
                     key={n} 
                     className="absolute w-full h-full flex items-start justify-center font-bold text-white text-[9px] sm:text-[11px] pt-1.5 sm:pt-2.5"
                     style={{ transform: `rotate(${i * (360 / 37)}deg)` }}
                   >
                     {n}
                   </div>
                 ))}
                 <div className="absolute inset-[15%] sm:inset-[18%] rounded-full bg-slate-800 shadow-inner flex items-center justify-center border border-slate-700">
                    <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-amber-200 to-amber-600 shadow-lg flex items-center justify-center border-2 border-amber-900/50">
                       <div className="w-4 h-4 sm:w-6 sm:h-6 rounded-full bg-amber-900/40" />
                    </div>
                 </div>
               </motion.div>
               {/* Ball indicator */}
               <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 sm:w-4 sm:h-4 bg-white rounded-full shadow-[0_0_10px_white] z-10" />
             </div>

             {/* Right Overlay: History */}
             <div className="absolute top-0 right-2 sm:right-6 z-20 flex flex-col items-center w-[30px] sm:w-[45px]">
               <div className="text-[7px] sm:text-[9px] text-slate-400 font-bold uppercase tracking-widest mb-1 sm:mb-2 bg-slate-900/80 px-1 rounded backdrop-blur-sm">Hist</div>
               <div className="flex flex-col items-center w-full shadow-xl border border-slate-700/50 rounded-md overflow-hidden bg-slate-900/50 backdrop-blur-sm">
                  <AnimatePresence>
                    {displayHistory.map((n, i) => (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.5, y: -20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }}
                        key={`${i}-${n}`} 
                        className={`w-full shrink-0 flex items-center justify-center font-bold text-white shadow-sm border-b border-black/30 ${i === 0 ? 'h-8 sm:h-12 text-sm sm:text-xl' : 'h-5 sm:h-7 text-[9px] sm:text-xs'}`} 
                        style={{ backgroundColor: getNumColor(n), opacity: 1 - (i * 0.08) }}
                      >
                        {n}
                      </motion.div>
                    ))}
                  </AnimatePresence>
               </div>
             </div>

          </div>

          {/* Player Bar (Always rendered to maintain fixed height) */}
          <div className="w-full max-w-xl mx-auto flex justify-center items-center gap-1.5 px-2 py-1 overflow-x-auto scrollbar-none shrink-0 h-[64px] sm:h-[76px]">
              {tablePlayers.filter(p => p.id !== userId).map(p => (
                <div key={p.id} className="flex flex-col items-center shrink-0 bg-slate-800/60 rounded-lg px-1.5 py-1 border border-slate-700/40 min-w-[52px] sm:min-w-[64px]">
                  <Avatar seed={p.avatar} size={24} />
                  <div className="text-[8px] sm:text-[9px] text-slate-300 font-semibold truncate max-w-[50px] sm:max-w-[60px] text-center leading-tight mt-0.5">{p.name}</div>
                  {p.totalBet > 0 && (
                    <div className="text-[7px] sm:text-[8px] font-bold text-amber-400 leading-tight">{fmtChips(p.totalBet)}</div>
                  )}
                  {p.lastNet !== undefined && p.lastNet !== 0 && (
                    <div className={`text-[7px] sm:text-[8px] font-bold leading-tight ${p.lastNet > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {p.lastNet > 0 ? '+' : ''}{fmtChips(p.lastNet)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          {/* Betting Table (Vertical Casino Layout) */}
          <div className="w-full max-w-xl mx-auto flex-1 mt-auto grid gap-0.5 sm:gap-1 select-none overflow-hidden pb-0 px-1 sm:px-0" style={{ gridTemplateColumns: 'minmax(20px, 1fr) minmax(20px, 1fr) repeat(3, minmax(35px, 1.5fr))', gridTemplateRows: 'repeat(13, minmax(0, 1fr))' }}>
            {/* Zero */}
            {renderZone('0', '0', 3, 1, '#10b981', 'white', 'border-emerald-500/50 rounded-t-xl', { gridColumn: '3 / span 3', gridRow: '1 / span 1' })}
            
            {/* Outside Bets */}
            {renderZone('low', <span className="-rotate-90 sm:rotate-0 block whitespace-nowrap">1-18</span>, 1, 2, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600 rounded-tl-xl', { gridColumn: '1 / span 1', gridRow: '2 / span 2' })}
            {renderZone('even', <span className="-rotate-90 sm:rotate-0 block whitespace-nowrap">EVEN</span>, 1, 2, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600', { gridColumn: '1 / span 1', gridRow: '4 / span 2' })}
            {renderZone('red', <div className="w-4 h-4 sm:w-6 sm:h-6 bg-red-500 rounded-full mx-auto shadow-inner border border-red-700"/>, 1, 2, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600', { gridColumn: '1 / span 1', gridRow: '6 / span 2' })}
            {renderZone('black', <div className="w-4 h-4 sm:w-6 sm:h-6 bg-slate-800 rounded-full mx-auto shadow-inner border border-slate-900"/>, 1, 2, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600', { gridColumn: '1 / span 1', gridRow: '8 / span 2' })}
            {renderZone('odd', <span className="-rotate-90 sm:rotate-0 block whitespace-nowrap">ODD</span>, 1, 2, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600', { gridColumn: '1 / span 1', gridRow: '10 / span 2' })}
            {renderZone('high', <span className="-rotate-90 sm:rotate-0 block whitespace-nowrap">19-36</span>, 1, 2, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600 rounded-bl-xl', { gridColumn: '1 / span 1', gridRow: '12 / span 2' })}

            {/* Dozens */}
            {renderZone('dozen_1', <span className="-rotate-90 block whitespace-nowrap tracking-widest">1st 12</span>, 1, 4, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600', { gridColumn: '2 / span 1', gridRow: '2 / span 4' })}
            {renderZone('dozen_2', <span className="-rotate-90 block whitespace-nowrap tracking-widest">2nd 12</span>, 1, 4, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600', { gridColumn: '2 / span 1', gridRow: '6 / span 4' })}
            {renderZone('dozen_3', <span className="-rotate-90 block whitespace-nowrap tracking-widest">3rd 12</span>, 1, 4, 'rgba(255,255,255,0.05)', 'white', 'border-slate-600', { gridColumn: '2 / span 1', gridRow: '10 / span 4' })}

            {/* Numbers */}
            {Array.from({ length: 36 }, (_, i) => i + 1).map(n => 
              renderZone(n.toString(), n.toString(), 1, 1, getNumColor(n), 'white', 'border-white/10', { gridColumn: `${((n - 1) % 3) + 3} / span 1`, gridRow: `${Math.ceil(n / 3) + 1} / span 1` })
            )}
          </div>
        </div>

        {/* Controls Footer */}
        <div className="bg-slate-800 px-2 pt-2 pb-2 sm:px-4 sm:pt-4 sm:pb-4 border-t border-slate-700 flex flex-col sm:flex-row items-center gap-1.5 sm:gap-4 shrink-0">
          {/* Chip selector */}
          <div className="flex-1 w-full max-w-sm sm:max-w-md bg-slate-900 rounded-xl p-1 sm:p-2 border border-slate-700/50 relative shadow-inner">
            <ChipRail 
              page={activeChipPage} 
              setPage={setActiveChipPage} 
              onAdd={(d) => setActiveChip(d)} 
              maxBet={Math.max(0, balance)} 
              pendingTotal={0} 
              canBet={!spinning} 
            />
            {activeChip && (
               <div className="absolute -top-3 -right-2 bg-emerald-500 text-emerald-950 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border border-emerald-300 animate-pulse">
                 SELECCIONADA: {activeChip.label}
               </div>
            )}
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={clearBets} 
              disabled={globalPhase !== 'betting' || localTimeRemaining <= 5 || Object.keys(bets || {}).length === 0}
              className="flex-1 sm:flex-none px-2 sm:px-4 py-2.5 rounded-lg font-bold bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50 transition-colors shadow-lg active:scale-95 text-xs sm:text-base whitespace-nowrap"
            >
              Borrar
            </button>
            <button 
              onClick={repeatBet} 
              disabled={globalPhase !== 'betting' || localTimeRemaining <= 5 || Object.keys(previousBets || {}).length === 0}
              className="flex-1 sm:flex-none px-2 sm:px-4 py-2.5 rounded-lg font-bold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors shadow-lg active:scale-95 text-xs sm:text-base whitespace-nowrap"
            >
              Repetir
            </button>
            <button 
              onClick={doubleBet} 
              disabled={globalPhase !== 'betting' || localTimeRemaining <= 5 || Object.keys(bets || {}).length === 0}
              className="flex-1 sm:flex-none px-2 sm:px-4 py-2.5 rounded-lg font-bold bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors shadow-lg active:scale-95 text-xs sm:text-base whitespace-nowrap"
            >
              Duplicar
            </button>
          </div>
        </div>

      </div>
    </motion.div>
  );
}
