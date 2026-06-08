import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { socket, fmtChips } from '../utils';
import { JACKPOT_TIERS, JACKPOT_UNLOCK_COSTS } from '../../../shared/types';
import BettingCarousel from './BettingCarousel';

interface MinesModalProps {
  user: { id: string; name: string; balance: number; jackpotUnlockLevel?: number };
  token: string | null;
  onClose: () => void;
  onUpdateUser: (u: any) => void;
}

type Phase = 'config' | 'playing' | 'gameover' | 'cashout';
type CellState = 'hidden' | 'safe' | 'mine' | 'mine-hit';

const MINES_PRESETS = [1, 3, 5, 10, 15, 24];

export default function MinesModal({ user, token, onClose, onUpdateUser }: MinesModalProps) {
  const [phase, setPhase] = useState<Phase>('config');
  const [betIndex, setBetIndex] = useState(0);
  
  const unlockLevel = user.jackpotUnlockLevel ?? 0;
  const isMaxLevel = unlockLevel >= JACKPOT_TIERS.length;
  const maxBetIndex = Math.max(0, unlockLevel - 1);
  const clampedBetIndex = Math.min(betIndex, maxBetIndex);
  const bet = JACKPOT_TIERS[clampedBetIndex];
  const [unlocking, setUnlocking] = useState(false);
  const [numMines, setNumMines] = useState(3);
  const [cells, setCells] = useState<CellState[]>(Array(25).fill('hidden'));
  const [multiplier, setMultiplier] = useState(1);
  const [winnable, setWinnable] = useState(0);
  const [winAmount, setWinAmount] = useState(0);
  const [balance, setBalance] = useState(user.balance);
  const [loading, setLoading] = useState(false);

  const handleUnlock = () => {
    if (unlocking) return;
    setUnlocking(true);
    socket.emit('unlockJackpotLevel', { token }, (res: any) => {
      setUnlocking(false);
      if (res?.error) return;
      if (res?.user) { onUpdateUser(res.user); setBalance(res.user.balance); }
    });
  };

  const startGame = useCallback(() => {
    if (!token || loading) return;
    setLoading(true);
    socket.emit('minesStart', { token, bet, numMines }, (res: any) => {
      setLoading(false);
      if (res.error) { alert(res.error); return; }
      setCells(Array(25).fill('hidden'));
      setMultiplier(1);
      setWinnable(0);
      setWinAmount(0);
      setBalance(res.newBalance ?? balance);
      if (res.user) onUpdateUser(res.user);
      setPhase('playing');
    });
  }, [token, bet, numMines, balance, loading, onUpdateUser]);

  const revealCell = useCallback((idx: number) => {
    if (phase !== 'playing' || cells[idx] !== 'hidden' || loading) return;
    setLoading(true);
    socket.emit('minesReveal', { token, cell: idx }, (res: any) => {
      setLoading(false);
      if (res.error) return;

      if (res.safe) {
        setCells(prev => { const next = [...prev]; next[idx] = 'safe'; return next; });
        setMultiplier(res.multiplier ?? 1);
        setWinnable(res.winnable ?? 0);

        if (res.autoWin) {
          setCells(prev => {
            const next = [...prev];
            (res.minePositions ?? []).forEach((m: number) => { if (next[m] === 'hidden') next[m] = 'mine'; });
            return next;
          });
          setWinAmount(res.winnable ?? 0);
          setBalance(res.newBalance ?? balance);
          if (res.user) onUpdateUser(res.user);
          setPhase('cashout');
        }
      } else {
        setCells(prev => {
          const next = [...prev];
          (res.minePositions ?? []).forEach((m: number) => { next[m] = m === res.hitCell ? 'mine-hit' : 'mine'; });
          return next;
        });
        setPhase('gameover');
      }
    });
  }, [phase, cells, loading, token, balance, onUpdateUser]);

  const cashout = useCallback(() => {
    if (!token || loading || winnable === 0) return;
    setLoading(true);
    socket.emit('minesCashout', { token }, (res: any) => {
      setLoading(false);
      if (res.error) { alert(res.error); return; }
      setWinAmount(res.winAmount ?? 0);
      setMultiplier(res.multiplier ?? 1);
      setBalance(res.newBalance ?? balance);
      setCells(prev => {
        const next = [...prev];
        (res.minePositions ?? []).forEach((m: number) => { if (next[m] === 'hidden') next[m] = 'mine'; });
        return next;
      });
      if (res.user) onUpdateUser(res.user);
      setPhase('cashout');
    });
  }, [token, loading, winnable, balance, onUpdateUser]);

  const reset = () => {
    setPhase('config');
    setCells(Array(25).fill('hidden'));
    setMultiplier(1);
    setWinnable(0);
    setWinAmount(0);
    // betIndex kept as-is (replay with same stake)
  };

  const canClose = phase !== 'playing';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center"
      onClick={e => { if (e.target === e.currentTarget && canClose) onClose(); }}
    >
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-md bg-[#111] rounded-t-3xl p-5"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold">Minas</h2>
            <p className="text-xs text-gray-500">Saldo: {fmtChips(balance)}</p>
          </div>
          <button
            onClick={() => { if (canClose) onClose(); }}
            className={`text-2xl leading-none transition-colors ${canClose ? 'text-gray-500 hover:text-white' : 'text-gray-700 cursor-not-allowed'}`}
          >×</button>
        </div>

        {/* Config */}
        {phase === 'config' && (
          <div className="space-y-5">
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2 text-center">Apuesta</p>
              <BettingCarousel
                tiers={JACKPOT_TIERS}
                unlockLevel={unlockLevel}
                renderItem={(t, i) => (
                  <button onClick={() => setBetIndex(i)}
                    disabled={balance < t || i >= unlockLevel}
                    className={`w-full px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-30 disabled:pointer-events-none ${clampedBetIndex === i ? 'bg-amber-500 text-black' : 'bg-white/8 text-gray-400 hover:bg-white/15'}`}>
                    {fmtChips(t)}
                  </button>
                )}
              />
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
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-2 block">Minas: <span className="text-red-400 font-black">{numMines}</span></label>
              <div className="flex gap-2 flex-wrap">
                {MINES_PRESETS.map(v => (
                  <button key={v} onClick={() => setNumMines(v)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${numMines === v ? 'border-red-500 bg-red-500/20 text-red-400' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                    {v}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-600 mt-1.5">Más minas = mayor multiplicador potencial</p>
            </div>
            <button onClick={startGame} disabled={loading}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-2xl active:scale-95 transition-all disabled:opacity-50 text-sm">
              {loading ? 'Iniciando...' : `Apostar ${fmtChips(bet)}`}
            </button>
          </div>
        )}

        {/* Game grid */}
        {phase !== 'config' && (
          <div className="space-y-4">
            {/* Stats bar */}
            <div className="flex items-center justify-between bg-white/5 rounded-2xl px-4 py-3">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Multiplicador</p>
                <p className="text-2xl font-black text-amber-400">{multiplier.toFixed(2)}×</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                  {phase === 'cashout' ? 'Cobrado' : phase === 'gameover' ? 'Perdiste' : 'Ganarías'}
                </p>
                <p className={`text-lg font-bold ${phase === 'gameover' ? 'text-red-400' : 'text-green-400'}`}>
                  {phase === 'gameover' ? `-${fmtChips(bet)}` : fmtChips(phase === 'cashout' ? winAmount : winnable)}
                </p>
              </div>
            </div>

            {/* 5x5 Grid */}
            <div className="grid grid-cols-5 gap-2">
              {cells.map((cell, idx) => (
                <motion.button
                  key={idx}
                  onClick={() => revealCell(idx)}
                  disabled={phase !== 'playing' || cell !== 'hidden' || loading}
                  whileTap={phase === 'playing' && cell === 'hidden' ? { scale: 0.85 } : {}}
                  animate={cell === 'mine-hit' ? { scale: [1, 1.2, 1] } : {}}
                  className={`aspect-square rounded-xl flex items-center justify-center text-lg transition-all border select-none
                    ${cell === 'hidden' ? 'bg-gray-800 border-gray-700 hover:border-gray-500 cursor-pointer' : 'cursor-default'}
                    ${cell === 'safe' ? 'bg-green-900/40 border-green-700' : ''}
                    ${cell === 'mine' ? 'bg-gray-900 border-gray-800' : ''}
                    ${cell === 'mine-hit' ? 'bg-red-600/60 border-red-500' : ''}
                  `}
                >
                  {cell === 'safe' && '💎'}
                  {cell === 'mine' && '💣'}
                  {cell === 'mine-hit' && '💥'}
                </motion.button>
              ))}
            </div>

            {/* Actions */}
            {phase === 'playing' && (
              <button onClick={cashout} disabled={winnable === 0 || loading}
                className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-2xl active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed text-sm">
                {winnable > 0 ? `Cobrar ${fmtChips(winnable)}` : 'Revela una celda para cobrar'}
              </button>
            )}

            {(phase === 'gameover' || phase === 'cashout') && (
              <div className="space-y-2">
                {phase === 'gameover' && (
                  <p className="text-center text-red-400 font-bold">💥 ¡Mina! Perdiste {fmtChips(bet)}</p>
                )}
                {phase === 'cashout' && (
                  <p className="text-center text-green-400 font-bold">✨ ¡Cobrado! +{fmtChips(winAmount)}</p>
                )}
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
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
