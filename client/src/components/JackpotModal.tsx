import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket, fmtChips, vibrate } from '../utils';
import { JACKPOT_TIERS, JACKPOT_UNLOCK_COSTS } from '../../../shared/types';
import SlotIcon from './SlotIcon';

const SYMBOLS = ['club', 'diamond', 'heart', 'spade', 'chip', 'crown', 'ace'];

const MULTIPLIER_LABEL: Record<number, string> = {
  50: '¡JACKPOT! x50',
  20: '¡CORONA! x20',
  10: '¡ESTRELLAS! x10',
  3:  '¡TRIPLE! x3',
  1.5: 'PAR x1.5',
};

interface Props {
  user: {
    balance: number;
    freeSpinPools?: Record<string, number>;
    jackpotUnlockLevel?: number;
  };
  token: string | null;
  onClose: () => void;
  onUpdateUser: (u: any) => void;
}

export default function JackpotModal({ user, token, onClose, onUpdateUser }: Props) {
  const [balance, setBalance] = useState(user.balance);
  const [betIndex, setBetIndex] = useState(0);
  // null = paying; number = using free spin of this value
  const [freeSpinSelected, setFreeSpinSelected] = useState<number | null>(null);
  const [reels, setReels] = useState<string[]>(['spin', 'spin', 'spin']);
  const [spinning, setSpinning] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [result, setResult] = useState<{ symbols: string[]; multiplier: number; winAmount: number } | null>(null);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => {
    intervalsRef.current.forEach(clearInterval);
    timersRef.current.forEach(clearTimeout);
  }, []);

  const pools = user.freeSpinPools ?? {};
  const hasFreeSpins = Object.values(pools).some(c => c > 0);
  const unlockLevel = user.jackpotUnlockLevel ?? 0;
  const isLocked = !hasFreeSpins && unlockLevel === 0;
  const isMaxLevel = unlockLevel >= JACKPOT_TIERS.length;

  const maxBetIndex = Math.max(0, unlockLevel - 1);
  const clampedBetIndex = Math.min(betIndex, maxBetIndex);
  const bet = JACKPOT_TIERS[clampedBetIndex];

  // Reset free spin selection if that pool runs out
  useEffect(() => {
    if (freeSpinSelected !== null && !(pools[String(freeSpinSelected)] > 0)) {
      setFreeSpinSelected(null);
    }
  }, [pools, freeSpinSelected]);

  const handleUnlock = () => {
    if (unlocking) return;
    setUnlocking(true);
    socket.emit('unlockJackpotLevel', { token }, (res: any) => {
      setUnlocking(false);
      if (res?.error) return;
      if (res?.user) { onUpdateUser(res.user); setBalance(res.user.balance); }
    });
  };

  const handleSpin = () => {
    if (spinning) return;
    setSpinning(true);
    setResult(null);

    const intervals = [0, 1, 2].map(i =>
      setInterval(() => {
        setReels(prev => {
          const next = [...prev];
          next[i] = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
          return next;
        });
      }, 75)
    );
    intervalsRef.current = intervals;

    const spinBet = freeSpinSelected ?? bet;
    socket.emit('playJackpot', { token, bet: spinBet, useFreeSpin: freeSpinSelected !== null }, (res: any) => {
      if (res?.error) {
        intervals.forEach(clearInterval);
        setSpinning(false);
        return;
      }

      const stops = [900, 1500, 2100];
      stops.forEach((delay, i) => {
        const t = setTimeout(() => {
          clearInterval(intervals[i]);
          setReels(prev => {
            const next = [...prev];
            next[i] = res.symbols[i];
            return next;
          });
          vibrate(30);

          if (i === 2) {
            const t2 = setTimeout(() => {
              setResult(res);
              setSpinning(false);
              if (res.user) {
                onUpdateUser(res.user);
                setBalance(res.user.balance);
              } else if (res.newBalance != null) {
                onUpdateUser({ ...user, balance: res.newBalance });
                setBalance(res.newBalance);
              }
              if (res.multiplier >= 5) vibrate([80, 40, 80, 40, 200]);
              else if (res.multiplier > 0) vibrate([60, 30, 60]);
            }, 250);
            timersRef.current.push(t2);
          }
        }, delay);
        timersRef.current.push(t);
      });
    });
  };

  const isWin = result && result.multiplier > 0;
  const isBig = result && result.multiplier >= 10;
  const spinDisabled = spinning || (freeSpinSelected !== null
    ? !(pools[String(freeSpinSelected)] > 0)
    : (isLocked || balance < bet));

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/80"
      style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="w-full max-w-md bg-[#111] rounded-t-3xl border-t border-white/10 p-6 pb-10"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-white">Jackpot</h2>
            <p className="text-xs text-gray-500 mt-0.5">{fmtChips(balance)}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Carretes */}
        <div className="flex justify-center gap-3 mb-6">
          {reels.map((sym, i) => (
            <motion.div
              key={i}
              className="w-24 h-24 rounded-2xl bg-[#1c1c1c] border border-white/10 flex items-center justify-center p-3 shadow-inner"
              animate={spinning && i >= (result ? 3 : 0)
                ? { scale: [1, 1.04, 1], transition: { repeat: Infinity, duration: 0.15 } }
                : { scale: 1 }}
            >
              <SlotIcon symbol={sym} className="w-16 h-16" />
            </motion.div>
          ))}
        </div>

        {/* Resultado */}
        <div className="h-10 flex items-center justify-center mb-5">
          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`text-center font-extrabold text-lg ${isBig ? 'text-amber-300' : isWin ? 'text-emerald-400' : 'text-gray-500'}`}
              >
                {isWin
                  ? `${MULTIPLIER_LABEL[result.multiplier] ?? `x${result.multiplier}`} — +${fmtChips(result.winAmount)}`
                  : 'Sin suerte… inténtalo de nuevo'}
                {(result as any).addedXp && <div className="text-[10px] text-emerald-300/80 mt-1 font-bold">+{(result as any).addedXp} XP</div>}
              </motion.div>
            )}
            {!result && !spinning && (
              <motion.div key="idle" className="text-xs text-gray-600 uppercase tracking-widest">
                Pulsa girar para jugar
              </motion.div>
            )}
            {spinning && !result && (
              <motion.div key="spin" className="text-xs text-amber-400/70 uppercase tracking-widest animate-pulse">
                Girando…
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Selector de apuesta */}
        <div className="mb-5">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2 text-center">Apuesta</p>

          {isLocked ? (
            <div className="bg-yellow-950/20 border border-yellow-500/20 rounded-xl py-2 px-3 text-center text-xs text-yellow-400/70">
              🔒 Desbloquea para apostar
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex gap-1.5 flex-wrap justify-center">
                {JACKPOT_TIERS.slice(0, Math.max(unlockLevel, 1)).map((t, i) => {
                  const poolCount = pools[String(t)] || 0;
                  const isFreeSpinTier = poolCount > 0;
                  const isSelected = isFreeSpinTier
                    ? freeSpinSelected === t
                    : (freeSpinSelected === null && clampedBetIndex === i);
                  const isDisabled = spinning || (i >= unlockLevel && !isFreeSpinTier) || (!isFreeSpinTier && balance < t);
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        if (isFreeSpinTier) {
                          setFreeSpinSelected(t);
                        } else {
                          setBetIndex(i);
                          setFreeSpinSelected(null);
                        }
                      }}
                      disabled={isDisabled}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-30 disabled:pointer-events-none border ${
                        isSelected
                          ? isFreeSpinTier
                            ? 'bg-pink-600 text-white border-transparent shadow-[0_0_10px_rgba(236,72,153,0.5)]'
                            : 'bg-amber-500 text-black border-transparent'
                          : isFreeSpinTier
                            ? 'bg-pink-950/40 text-pink-400 border-pink-500/40 hover:bg-pink-900/50'
                            : 'bg-white/8 text-gray-400 border-transparent hover:bg-white/15'
                      }`}
                    >
                      {fmtChips(t)}
                    </button>
                  );
                })}
              </div>

              {!isMaxLevel && (
                <div className="flex items-center justify-between bg-white/4 rounded-xl px-3 py-2">
                  <span className="text-[11px] text-gray-500">
                    Siguiente: <span className="text-gray-300 font-bold">{fmtChips(JACKPOT_TIERS[unlockLevel])}</span>
                  </span>
                  <button
                    onClick={handleUnlock}
                    disabled={unlocking || spinning || balance < JACKPOT_UNLOCK_COSTS[unlockLevel]}
                    className="px-3 py-1 rounded-lg text-[11px] font-bold bg-amber-600/30 text-amber-400 hover:bg-amber-600/50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    {unlocking ? '…' : `Subir nivel — ${fmtChips(JACKPOT_UNLOCK_COSTS[unlockLevel])}`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Botón desbloquear o girar */}
        {isLocked ? (
          <button
            onClick={handleUnlock}
            disabled={unlocking}
            className="w-full py-4 rounded-2xl font-extrabold text-lg tracking-wider shadow-lg active:scale-95 transition-transform disabled:opacity-30 disabled:pointer-events-none"
            style={{ background: unlocking ? '#333' : 'linear-gradient(180deg, #f59e0b, #b45309)', color: unlocking ? '#888' : '#000' }}
          >
            {unlocking ? 'Desbloqueando…' : `🔓 DESBLOQUEAR — ${fmtChips(JACKPOT_UNLOCK_COSTS[0])}`}
          </button>
        ) : (
          <button
            onClick={handleSpin}
            disabled={spinDisabled}
            className="w-full py-4 rounded-2xl font-extrabold text-lg tracking-wider shadow-lg active:scale-95 transition-transform disabled:opacity-30 disabled:pointer-events-none disabled:active:scale-100"
            style={{
              background: spinDisabled
                ? '#333'
                : freeSpinSelected !== null
                  ? 'linear-gradient(180deg, #ec4899, #be185d)'
                  : 'linear-gradient(180deg, #f59e0b, #b45309)',
              color: spinDisabled ? '#888' : '#000',
            }}
          >
            {spinning
              ? 'Girando…'
              : freeSpinSelected !== null
                ? `GIRAR GRATIS — quedan ${pools[String(freeSpinSelected)] ?? 0}`
                : `GIRAR — ${fmtChips(bet)}`}
          </button>
        )}

        {/* Tabla de premios */}
        <div className="mt-5 rounded-2xl bg-white/4 p-4 text-[11px] text-gray-500 space-y-1">
          <p className="text-gray-400 font-semibold mb-2 uppercase tracking-wider text-[10px]">Premios</p>
          {([
            [['ace', 'ace', 'ace'], 'x50'],
            [['crown', 'crown', 'crown'], 'x20'],
            [['chip', 'chip', 'chip'], 'x10'],
            ['3 iguales', 'x3'],
            ['2 iguales', 'x1.5'],
          ] as [string | string[], string][]).map(([combo, pay]) => (
            <div key={pay as string} className="flex justify-between items-center h-6">
              <span className="flex items-center gap-0.5">
                {Array.isArray(combo) ? (
                  combo.map((sym, idx) => <SlotIcon key={idx} symbol={sym} className="w-4 h-4" />)
                ) : (
                  combo
                )}
              </span>
              <span className="text-amber-400/80 font-bold">{pay as string}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
