import { useState } from 'react';
import { motion } from 'framer-motion';
import Avatar from './Avatar';
import { fmtChips, playCheckSound, vibrate } from '../utils';

interface Props {
  targetName: string;
  targetAvatar?: number;
  targetLevel?: number;
  balance: number;
  onClose: () => void;
  onSend: (amount: number) => void;
}

function quickAmounts(balance: number): number[] {
  const n = Math.floor(Math.log10(Math.max(balance, 10)));
  const base = Math.pow(10, Math.max(0, n - 6));
  return [base, base * 100, base * 10_000, base * 1_000_000];
}

export default function GiftModal({ targetName, targetAvatar, targetLevel, balance, onClose, onSend }: Props) {
  const [amountStr, setAmountStr] = useState('');
  const [loading, setLoading] = useState(false);

  const parsedAmount = parseInt(amountStr.replace(/\D/g, ''), 10) || 0;
  const valid = parsedAmount > 0 && parsedAmount <= balance;

  const handleSend = () => {
    if (!valid || loading) return;
    setLoading(true);
    playCheckSound();
    vibrate(50);
    onSend(parsedAmount);
  };

  const addAmount = (val: number) => {
    vibrate(20);
    setAmountStr(String(Math.min(balance, parsedAmount + val)));
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={e => e.stopPropagation()}
        className="relative bg-surface p-6 rounded-3xl w-full max-w-sm border border-surfaceLight shadow-2xl"
      >
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="relative">
            <Avatar seed={String(targetAvatar ?? 1)} size={64} />
            {targetLevel != null && (
              <span className="absolute -bottom-1 -right-1 px-2 py-0.5 rounded-full bg-amber-500 border-2 border-surface text-black text-xs font-black">
                {targetLevel}
              </span>
            )}
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold text-white mb-1">Regalar a {targetName}</h2>
            <p className="text-xs text-gray-400 uppercase tracking-widest">Enviar fichas</p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div className="relative">
            <input
              type="text"
              value={amountStr ? fmtChips(parseInt(amountStr.replace(/\D/g, ''), 10)) : ''}
              onChange={() => {
                // Allow simple typing without auto-formatting while typing
                // Actually, just let them type digits, much easier and less buggy
                // The formatting in the value above will make editing hard. Let's just use raw digits for input.
              }}
              className="hidden"
            />
            {/* Real input for digits */}
            <input
              type="text"
              value={amountStr}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '');
                setAmountStr(val);
              }}
              placeholder="0"
              className="w-full bg-black/40 border border-white/10 rounded-2xl py-4 text-center text-3xl font-black text-amber-400 focus:outline-none focus:border-amber-500/50 transition-colors"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-gray-500 font-bold">$</span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {quickAmounts(balance).map(amt => (
              <button
                key={amt}
                onClick={() => addAmount(amt)}
                className="py-2 rounded-xl bg-white/5 border border-white/5 text-xs font-bold text-gray-300 hover:bg-white/10 active:scale-95 transition-all"
              >
                +{fmtChips(amt)}
              </button>
            ))}
          </div>
          
          <div className="flex justify-between items-center px-2">
            <span className="text-xs text-gray-500 font-medium">Saldo disponible:</span>
            <span className="text-sm font-bold text-emerald-400">${fmtChips(balance)}</span>
          </div>
          {parsedAmount > 0 && valid && (
            <>
              <div className="flex justify-between items-center px-2 mt-2">
                <span className="text-xs text-rose-500/80 font-medium">Hacienda (20%):</span>
                <span className="text-sm font-bold text-rose-500/80">-${fmtChips(Math.floor(parsedAmount * 0.2))}</span>
              </div>
              <div className="flex justify-between items-center px-2 mt-1">
                <span className="text-xs text-emerald-400/80 font-medium">{targetName} recibe:</span>
                <span className="text-sm font-bold text-emerald-400/80">${fmtChips(parsedAmount - Math.floor(parsedAmount * 0.2))}</span>
              </div>
            </>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={!valid || loading}
          className={`w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider transition-all active:scale-[0.98] ${
            valid 
              ? 'bg-amber-500 text-black shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:bg-amber-400' 
              : 'bg-white/5 text-gray-500 cursor-not-allowed'
          }`}
        >
          {loading ? 'Enviando...' : `Enviar Regalo`}
        </button>
        
        {parsedAmount > 0 && valid && (
          <p className="text-center text-[10px] text-emerald-400/80 font-bold mt-3">
            +{100 + Math.floor(parsedAmount / 1000000)} XP por regalar
          </p>
        )}
      </motion.div>
    </div>
  );
}
