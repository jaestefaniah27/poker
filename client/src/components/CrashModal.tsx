import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket, fmtChips } from '../utils';
import { JACKPOT_TIERS, JACKPOT_UNLOCK_COSTS } from '../../../shared/types';

interface CrashModalProps {
  user: { id: string; name: string; balance: number; jackpotUnlockLevel?: number };
  token: string | null;
  onClose: () => void;
  onUpdateUser: (u: any) => void;
}

type Phase = 'config' | 'playing' | 'crashed' | 'cashout';

function multiplierColor(m: number): string {
  if (m >= 10)  return '#f59e0b';
  if (m >= 5)   return '#a855f7';
  if (m >= 2)   return '#06b6d4';
  if (m >= 1.5) return '#22c55e';
  return '#9ca3af';
}

function historyColor(m: number): string {
  if (m < 1.5) return '#ef4444';
  if (m < 2)   return '#f97316';
  if (m < 5)   return '#22c55e';
  if (m < 10)  return '#06b6d4';
  return '#f59e0b';
}

export default function CrashModal({ user, token, onClose, onUpdateUser }: CrashModalProps) {
  const [phase, setPhase]       = useState<Phase>('config');
  const [betIndex, setBetIndex] = useState(0);
  
  const unlockLevel = user.jackpotUnlockLevel ?? 0;
  const isMaxLevel = unlockLevel >= JACKPOT_TIERS.length;
  const maxBetIndex = Math.max(0, unlockLevel - 1);
  const clampedBetIndex = Math.min(betIndex, maxBetIndex);
  
  const [balance, setBalance]   = useState(user.balance);
  const [multiplier, setMultiplier] = useState(1.00);
  const [crashPoint, setCrashPoint] = useState(0);
  const [winAmount, setWinAmount]   = useState(0);
  const [bet, setBet]               = useState(0);
  const [loading, setLoading]       = useState(false);
  const [history, setHistory]       = useState<number[]>([]);
  const [unlocking, setUnlocking] = useState(false);

  const handleUnlock = () => {
    if (unlocking) return;
    setUnlocking(true);
    socket.emit('unlockJackpotLevel', { token }, (res: any) => {
      setUnlocking(false);
      if (res?.error) return;
      if (res?.user) { onUpdateUser(res.user); setBalance(res.user.balance); }
    });
  };

  // Listen for server ticks
  useEffect(() => {
    const handler = (data: { multiplier: number; crashed: boolean }) => {
      setMultiplier(data.multiplier);
      if (data.crashed) {
        setCrashPoint(data.multiplier);
        setHistory(prev => [data.multiplier, ...prev].slice(0, 15));
        setPhase('crashed');
      }
    };
    socket.on('crashTick', handler);
    return () => { socket.off('crashTick', handler); };
  }, []);

  const startGame = useCallback(() => {
    if (!token || loading) return;
    const betAmt = JACKPOT_TIERS[clampedBetIndex];
    setLoading(true);
    socket.emit('crashStart', { token, bet: betAmt }, (res: any) => {
      setLoading(false);
      if (res.error) { alert(res.error); return; }
      setBet(betAmt);
      setBalance(res.newBalance ?? balance);
      setMultiplier(1.00);
      setPhase('playing');
    });
  }, [token, loading, clampedBetIndex, balance]);

  const cashout = useCallback(() => {
    if (!token || loading || phase !== 'playing') return;
    setLoading(true);
    socket.emit('crashCashout', { token }, (res: any) => {
      setLoading(false);
      if (res.error) { alert(res.error); return; }
      setMultiplier(res.multiplier);
      setWinAmount(res.winAmount);
      setBalance(res.newBalance ?? balance);
      if (res.user) onUpdateUser(res.user);
      setHistory(prev => [res.multiplier, ...prev].slice(0, 15));
      setPhase('cashout');
    });
  }, [token, loading, phase, balance, onUpdateUser]);

  const reset = () => {
    setPhase('config');
    setMultiplier(1.00);
    setWinAmount(0);
    setBet(0);
  };

  const canClose = phase !== 'playing';
  const color = multiplierColor(multiplier);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-end justify-center"
      onClick={e => { if (e.target === e.currentTarget && canClose) onClose(); }}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-md bg-[#0d0d0d] rounded-t-3xl flex flex-col"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <div>
            <h2 className="text-xl font-bold">Crash</h2>
            <p className="text-xs text-gray-500">Saldo: {fmtChips(balance)}</p>
          </div>
          <button
            onClick={() => { if (canClose) onClose(); }}
            className={`text-2xl leading-none transition-colors ${canClose ? 'text-gray-500 hover:text-white' : 'text-gray-700 cursor-not-allowed'}`}
          >×</button>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="px-6 mb-4 shrink-0">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">Últimas rondas</p>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {history.map((h, i) => (
                <span key={i} className="shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-black"
                  style={{ background: historyColor(h) + '22', color: historyColor(h), border: `1px solid ${historyColor(h)}44` }}>
                  {h.toFixed(2)}×
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Multiplier display */}
        <div className="flex-1 flex items-center justify-center px-6 py-8 min-h-[140px]">
          <AnimatePresence mode="wait">
            {phase === 'crashed' && (
              <motion.div key="crashed" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
                <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-1">💥 Crashed</p>
                <p className="text-6xl font-black text-red-500">{crashPoint.toFixed(2)}×</p>
                <p className="text-sm text-red-400/70 mt-2">Perdiste {fmtChips(bet)}</p>
              </motion.div>
            )}
            {phase === 'cashout' && (
              <motion.div key="cashout" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
                <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-1">✨ Cobrado</p>
                <p className="text-6xl font-black" style={{ color }}>{multiplier.toFixed(2)}×</p>
                <p className="text-sm text-green-400 mt-2">+{fmtChips(winAmount)}</p>
              </motion.div>
            )}
            {(phase === 'config') && (
              <motion.div key="config" className="text-center">
                <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-1">Elige tu apuesta</p>
                <p className="text-6xl font-black text-gray-700">1.00×</p>
              </motion.div>
            )}
            {phase === 'playing' && (
              <motion.div key="playing" className="text-center">
                <p className="text-[11px] uppercase tracking-widest mb-1" style={{ color: color + 'aa' }}>Multiplicador</p>
                <p className="text-6xl font-black tabular-nums" style={{ color }}>{multiplier.toFixed(2)}×</p>
                <p className="text-xs text-gray-600 mt-2">Ganarías {fmtChips(Math.floor(bet * multiplier))}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="px-6 pb-2 space-y-3 shrink-0">
          {phase === 'config' && (
            <>
              <div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2 text-center">Apuesta</p>
                <div className="flex gap-1.5 flex-wrap justify-center">
                  {JACKPOT_TIERS.slice(0, Math.max(unlockLevel, 1)).map((t, i) => (
                    <button key={i} onClick={() => setBetIndex(i)}
                      disabled={balance < t || i >= unlockLevel}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-30 disabled:pointer-events-none ${clampedBetIndex === i ? 'bg-amber-500 text-black' : 'bg-white/8 text-gray-400 hover:bg-white/15'}`}>
                      {fmtChips(t)}
                    </button>
                  ))}
                </div>
                {!isMaxLevel && (
                  <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 mt-3">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest">Nivel {unlockLevel + 1}</p>
                      <p className="text-sm font-bold text-gray-200">{fmtChips(JACKPOT_TIERS[unlockLevel])}</p>
                    </div>
                    <button onClick={handleUnlock} disabled={unlocking || balance < JACKPOT_UNLOCK_COSTS[unlockLevel]}
                      className="px-4 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded-lg text-xs font-bold active:scale-95 transition-all disabled:opacity-30">
                      {unlocking ? '...' : fmtChips(JACKPOT_UNLOCK_COSTS[unlockLevel])}
                    </button>
                  </div>
                )}
              </div>
              <button onClick={startGame} disabled={loading || balance < JACKPOT_TIERS[clampedBetIndex]}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-2xl active:scale-95 transition-all disabled:opacity-40 text-sm">
                {loading ? 'Iniciando...' : `Apostar ${fmtChips(JACKPOT_TIERS[clampedBetIndex])}`}
              </button>
            </>
          )}

          {phase === 'playing' && (
            <button onClick={cashout} disabled={loading}
              className="w-full py-4 font-black rounded-2xl active:scale-95 transition-all text-base text-black disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}>
              {loading ? 'Cobrando...' : `Cobrar ${fmtChips(Math.floor(bet * multiplier))} (${multiplier.toFixed(2)}×)`}
            </button>
          )}

          {(phase === 'crashed' || phase === 'cashout') && (
            <div className="flex gap-2">
              <button onClick={reset}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-2xl active:scale-95 transition-all text-sm">
                Otra ronda
              </button>
              <button onClick={onClose}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-2xl active:scale-95 transition-all text-sm">
                Salir
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
