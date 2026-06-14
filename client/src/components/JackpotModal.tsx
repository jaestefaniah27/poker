import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket, fmtChips, vibrate } from '../utils';
import { sfx } from '../sounds';
import { JACKPOT_TIERS, JACKPOT_UNLOCK_COSTS } from '../../../shared/types';
import SlotIcon from './SlotIcon';
import BettingCarousel from './BettingCarousel';

const SYMBOLS = ['club', 'diamond', 'heart', 'spade', 'chip', 'crown', 'ace'];

const MULTIPLIER_LABEL: Record<number, string> = {
  50: '¡JACKPOT! x50',
  20: '¡CORONA! x20',
  10: '¡ESTRELLAS! x10',
  3:  '¡TRIPLE! x3',
  1: 'PAR x1',
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
  const [reels, setReels] = useState<{ symbol: string; tick: number }[]>([
    { symbol: 'spin', tick: 0 },
    { symbol: 'spin', tick: 0 },
    { symbol: 'spin', tick: 0 }
  ]);
  const [spinning, setSpinning] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [result, setResult] = useState<{ symbols: string[]; multiplier: number; winAmount: number; finalWinAmount?: number; taxEvent?: { type: 'none'|'tax'|'fraud'; amount: number } } | null>(null);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    socket.emit('jackpot_join', { token });
    return () => {
      socket.emit('jackpot_leave', { token });
      intervalsRef.current.forEach(clearInterval);
      timersRef.current.forEach(clearTimeout);
    };
  }, [token]);

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
          next[i] = { symbol: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)], tick: prev[i].tick + 1 };
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

      const isTease = res.symbols[0] === res.symbols[1];
      const delay1 = 200 + Math.random() * 400;
      const delay2 = delay1 + 250 + Math.random() * 400;
      const teaseExtra = (isTease && Math.random() < 0.5) ? (1000 + Math.random() * 1500) : 0;
      const delay3 = delay2 + 250 + Math.random() * 500 + teaseExtra;

      const stops = [delay1, delay2, delay3];
      stops.forEach((delay, i) => {
        const t = setTimeout(() => {
          clearInterval(intervals[i]);
          setReels(prev => {
            const next = [...prev];
            next[i] = { symbol: res.symbols[i], tick: prev[i].tick + 1 };
            return next;
          });
          vibrate(30);
          sfx.tick();

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
              if (res.multiplier >= 10) { vibrate([80, 40, 80, 40, 200]); sfx.jackpot(); }
              else if (res.multiplier >= 5) { vibrate([80, 40, 80, 40, 200]); sfx.bigWin(); }
              else if (res.multiplier > 0) { vibrate([60, 30, 60]); sfx.win(); }
              else sfx.lose();

              // El premio se acredita en el servidor SOLO ahora, al terminar la
              // animación. Hasta aquí el saldo solo reflejaba el descuento.
              socket.emit('claimJackpot', { token }, (cr: any) => {
                if (!cr?.ok) return;
                if (cr.user) { onUpdateUser(cr.user); setBalance(cr.user.balance); }
                else if (cr.newBalance != null) { setBalance(cr.newBalance); }
              });
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
        className="w-full max-w-md bg-[#111] rounded-t-3xl border-t border-white/10 px-4 pt-4 pb-1 flex flex-col"
        style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom, 0px))' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-white">Jackpot</h2>
            <p className="text-xs text-gray-500 mt-0.5">{fmtChips(balance)}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Carretes */}
        <div className="flex justify-center gap-3 mb-4">
          {reels.map((reel, i) => (
            <div
              key={i}
              className="w-24 h-24 rounded-2xl bg-[#1c1c1c] border border-white/10 flex items-center justify-center shadow-inner overflow-hidden relative"
            >
              <AnimatePresence>
                <motion.div
                  key={`${i}-${reel.tick}`}
                  initial={{ y: -90, filter: 'blur(3px)' }}
                  animate={{ y: 0, filter: 'blur(0px)' }}
                  exit={{ y: 90, filter: 'blur(3px)' }}
                  transition={{ duration: 0.07, ease: "linear" }}
                  className="absolute flex items-center justify-center w-full h-full"
                >
                  <SlotIcon symbol={reel.symbol} className="w-16 h-16" />
                </motion.div>
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Resultado */}
        <div className="h-10 flex items-center justify-center mb-3">
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
                  ? `${MULTIPLIER_LABEL[result.multiplier] ?? `x${result.multiplier}`} — +${fmtChips(result.finalWinAmount ?? result.winAmount)}`
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

        {/* Hacienda Tax Event Banner */}
        <AnimatePresence>
          {result?.taxEvent && result.taxEvent.type !== 'none' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`mb-4 p-4 rounded-2xl border-2 flex flex-col items-center text-center shadow-[0_0_20px_rgba(225,29,72,0.3)] ${
                result.taxEvent.type === 'fraud' 
                  ? 'bg-red-950/90 border-red-500 text-red-100'
                  : 'bg-rose-950/90 border-rose-500 text-rose-100'
              }`}
            >
              <div className="text-3xl mb-1">🚨</div>
              <h3 className="font-black text-lg mb-1 uppercase tracking-wider">
                {result.taxEvent.type === 'fraud' ? '¡INVESTIGACIÓN POR FRAUDE!' : 'HACIENDA SOMOS TODOS'}
              </h3>
              <p className="text-[11px] font-medium opacity-90 leading-tight">
                {result.taxEvent.type === 'fraud' 
                  ? 'Hacienda ha detectado irregularidades y te ha embargado el 100% de tu premio.'
                  : 'Hacienda se ha llevado el 10% de tu premio en concepto de impuestos.'}
              </p>
              <div className="mt-2 font-mono text-xl font-bold text-red-400">
                -{fmtChips(result.taxEvent.amount)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Selector de apuesta */}
        <div className="mb-2">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2 text-center">Apuesta</p>

          {isLocked ? (
            <div className="bg-yellow-950/20 border border-yellow-500/20 rounded-xl py-2 px-3 text-center text-xs text-yellow-400/70">
              🔒 Desbloquea para apostar
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <BettingCarousel
                tiers={JACKPOT_TIERS}
                unlockLevel={unlockLevel}
                renderItem={(t, i) => {
                  const poolCount = pools[String(t)] || 0;
                  const isFreeSpinTier = poolCount > 0;
                  const isSelected = isFreeSpinTier
                    ? freeSpinSelected === t
                    : (freeSpinSelected === null && clampedBetIndex === i);
                  const isDisabled = spinning || (i >= unlockLevel && !isFreeSpinTier) || (!isFreeSpinTier && balance < t);
                  return (
                    <button
                      onClick={() => {
                        if (isFreeSpinTier) {
                          setFreeSpinSelected(t);
                        } else {
                          setBetIndex(i);
                          setFreeSpinSelected(null);
                        }
                      }}
                      disabled={isDisabled}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-30 disabled:pointer-events-none border w-full ${
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
                }}
              />

              {!isMaxLevel && (
                <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-2 mt-2">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest">Nivel {unlockLevel + 1}</p>
                    <p className="text-sm font-bold text-gray-200">{fmtChips(JACKPOT_TIERS[unlockLevel])}</p>
                  </div>
                  <button onClick={handleUnlock} disabled={unlocking || spinning || balance < JACKPOT_UNLOCK_COSTS[unlockLevel]}
                    className="px-4 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/50 rounded-lg text-xs font-bold active:scale-95 transition-all disabled:opacity-30">
                    {unlocking ? '...' : fmtChips(JACKPOT_UNLOCK_COSTS[unlockLevel])}
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
            className="w-full py-3 rounded-2xl font-extrabold text-lg tracking-wider shadow-lg active:scale-95 transition-transform disabled:opacity-30 disabled:pointer-events-none"
            style={{ background: unlocking ? '#333' : 'linear-gradient(180deg, #f59e0b, #b45309)', color: unlocking ? '#888' : '#000' }}
          >
            {unlocking ? 'Desbloqueando…' : `🔓 DESBLOQUEAR — ${fmtChips(JACKPOT_UNLOCK_COSTS[0])}`}
          </button>
        ) : (
          <button
            onClick={handleSpin}
            disabled={spinDisabled}
            className="w-full py-3 rounded-2xl font-extrabold text-xl tracking-wider shadow-[0_0_20px_rgba(236,72,153,0.3)] active:scale-95 transition-all disabled:opacity-30 disabled:pointer-events-none disabled:active:scale-100"
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
        <div className="mt-3 rounded-2xl bg-white/4 p-3 text-[11px] text-gray-500 space-y-1">
          <p className="text-gray-400 font-semibold mb-2 uppercase tracking-wider text-[10px]">Premios</p>
          {([
            [['ace', 'ace', 'ace'], 'x50'],
            [['crown', 'crown', 'crown'], 'x20'],
            [['chip', 'chip', 'chip'], 'x10'],
            ['3 iguales', 'x3'],
            ['2 iguales', 'x1'],
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
