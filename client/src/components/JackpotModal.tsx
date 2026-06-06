import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket, fmtChips, vibrate, STAKE_TIERS } from '../utils';
import SlotIcon from './SlotIcon';

const SYMBOLS = ['club', 'diamond', 'heart', 'spade', 'chip', 'ace'];

const MULTIPLIER_LABEL: Record<number, string> = {
  50: '¡JACKPOT! x50',
  10: '¡ESTRELLAS! x10',
  5:  '¡TRIPLE! x5',
  1.5: 'PAR x1.5',
};

interface Props {
  user: { balance: number };
  token: string | null;
  onClose: () => void;
  onUpdateUser: (u: any) => void;
}

export default function JackpotModal({ user, token, onClose, onUpdateUser }: Props) {
  const [betIndex, setBetIndex] = useState(0);
  const [reels, setReels] = useState<string[]>(['spin', 'spin', 'spin']);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<{ symbols: string[]; multiplier: number; winAmount: number } | null>(null);
  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => {
    intervalsRef.current.forEach(clearInterval);
    timersRef.current.forEach(clearTimeout);
  }, []);

  const bet = STAKE_TIERS[betIndex];

  const handleSpin = () => {
    if (spinning) return;
    setSpinning(true);
    setResult(null);

    // Arranca los 3 carretes girando
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

    socket.emit('playJackpot', { token, bet }, (res: any) => {
      if (res?.error) {
        intervals.forEach(clearInterval);
        setSpinning(false);
        return;
      }

      // Para cada carrete con delay creciente
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

          // Tras parar el último carrete → mostrar resultado
          if (i === 2) {
            const t2 = setTimeout(() => {
              setResult(res);
              setSpinning(false);
              onUpdateUser({ ...user, balance: res.newBalance });
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
          <h2 className="text-xl font-extrabold tracking-tight text-white">🎰 Jackpot</h2>
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
          <div className="flex gap-1.5 flex-wrap justify-center">
            {STAKE_TIERS.slice(0, 8).map((t, i) => (
              <button
                key={i}
                onClick={() => setBetIndex(i)}
                disabled={spinning}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${betIndex === i ? 'bg-amber-500 text-black' : 'bg-white/8 text-gray-400 hover:bg-white/15'}`}
              >
                {fmtChips(t)}
              </button>
            ))}
          </div>
        </div>

        {/* Botón girar */}
        <button
          onClick={handleSpin}
          disabled={spinning}
          className="w-full py-4 rounded-2xl font-extrabold text-lg tracking-wider shadow-lg active:scale-95 transition-transform disabled:opacity-50 disabled:active:scale-100"
          style={{ background: spinning ? '#333' : 'linear-gradient(180deg, #f59e0b, #b45309)', color: spinning ? '#888' : '#000' }}
        >
          {spinning ? 'Girando…' : `GIRAR — ${fmtChips(bet)}`}
        </button>

        {/* Tabla de premios */}
        <div className="mt-5 rounded-2xl bg-white/4 p-4 text-[11px] text-gray-500 space-y-1">
          <p className="text-gray-400 font-semibold mb-2 uppercase tracking-wider text-[10px]">Premios</p>
          {[
            [['ace', 'ace', 'ace'], 'x50'],
            [['chip', 'chip', 'chip'], 'x10'],
            ['3 iguales', 'x5'],
            ['2 iguales', 'x1.5'],
          ].map(([combo, pay]) => (
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
