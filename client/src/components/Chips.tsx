import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fmtChips } from '../utils';

// Chip catalogue. Rounds (<1000) are circles; plaques (>=1000) are rectangles.
// Border: striped/dashed ("rallado") < 100k, smooth/solid >= 100k.
// Physical size scales with denomination (small value -> smaller chip).
export type ChipDenom = { v: number; color: string; ring: string; label: string; premium?: 'carbon' | 'silver' | 'gold' | 'diamond'; isCustom?: boolean; baseV?: number };

// --- Multiplicador automático de fichas ---
// Si el saldo del jugador es >= 1000x el valor de la ficha mayor (5M => 5B),
// todas las fichas valen 1000x más y se reetiquetan (k->M, M->B, ...). Apilable:
// >=5B => x1000, >=5T => x1.000.000, >=5Q => x1.000.000.000.
const LARGEST_CHIP = 5_000_000;
export const CHIP_MULT_THRESHOLD = LARGEST_CHIP * 1000; // 5B — saldo mínimo para tener multiplicador

export const chipMultEnabled = (): boolean => localStorage.getItem('chipMultiplierEnabled') !== '0';

export const chipMultiplierFor = (balance: number): number => {
  if (!chipMultEnabled()) return 1;
  let mult = 1;
  while (balance >= LARGEST_CHIP * mult * 1000) mult *= 1000;
  return mult;
};

// nº de escalones de 1000 que representa el multiplicador (1->0, 1000->1, 1e6->2...).
const multSteps = (mult: number): number => Math.round(Math.log(mult) / Math.log(1000));

const SUFFIXES = ['', 'k', 'M', 'B', 'T', 'Q'];
const shiftSuffix = (label: string, steps: number): string => {
  const m = label.match(/^([\d.]+)([a-zA-Z]?)$/);
  if (!m) return label;
  const [, num, suf] = m;
  const idx = SUFFIXES.indexOf(suf);
  if (idx < 0) return label;
  return num + SUFFIXES[Math.min(idx + steps, SUFFIXES.length - 1)];
};

// Escala una ficha base a su valor real con etiqueta desplazada, preservando `baseV`
// para que la apariencia (tamaño/forma/borde/premium) siga atada a la ficha base.
export const scaleDef = (d: ChipDenom, mult: number): ChipDenom => {
  if (mult <= 1 || d.isCustom) return d;
  const steps = multSteps(mult);
  const isRound = d.v < 1000; // las redondas se ven idénticas (sin sufijo)
  return { ...d, v: d.v * mult, baseV: d.v, label: isRound ? d.label : shiftSuffix(d.label, steps) };
};

// Valor "visual" — el de la ficha base, usado para decidir forma/tamaño/borde.
const vis = (d: ChipDenom): number => d.baseV ?? d.v;

export const CHIP_DEFS: ChipDenom[] = [
  { v: 25,     color: '#10b981', ring: '#064e3b', label: '25'   },
  { v: 50,     color: '#3b82f6', ring: '#1e3a8a', label: '50'   },
  { v: 100,    color: '#1f2937', ring: '#0b1320', label: '100'  },
  { v: 250,    color: '#ec4899', ring: '#831843', label: '250'  },
  { v: 500,    color: '#a855f7', ring: '#581c87', label: '500'  },
  { v: 1000,   color: '#f59e0b', ring: '#7c2d12', label: '1k'   },
  { v: 2500,   color: '#22c55e', ring: '#14532d', label: '2.5k' },
  { v: 5000,   color: '#ef4444', ring: '#7f1d1d', label: '5k'   },
  { v: 10000,  color: '#06b6d4', ring: '#155e63', label: '10k'  },
  { v: 25000,  color: '#84cc16', ring: '#3f6212', label: '25k'  },
  { v: 50000,  color: '#f97316', ring: '#7c2d12', label: '50k'  },
  { v: 100000,  color: '#18181b', ring: '#71717a', label: '100k', premium: 'carbon'  },
  { v: 200000,  color: '#3b82f6', ring: '#1e3a8a', label: '200k'                    },
  { v: 250000,  color: '#ef4444', ring: '#7f1d1d', label: '250k'                    },
  { v: 500000,  color: '#f8fafc', ring: '#94a3b8', label: '500k'                    },
  { v: 1000000, color: '#fbbf24', ring: '#78350f', label: '1M',   premium: 'gold'    },
  { v: 2000000, color: '#a78bfa', ring: '#3b0764', label: '2M',   premium: 'silver'  },
  { v: 5000000, color: '#f43f5e', ring: '#881337', label: '5M',   premium: 'diamond' },
];

export const defByValue = (v: number): ChipDenom => CHIP_DEFS.find(d => d.v === v) || CHIP_DEFS[0];

// Pages overlap on purpose so adjacent scales share a chip or two.
export const CHIP_PAGE_VALUES: number[][] = [
  [25, 50, 100, 250, 500],
  [500, 1000, 2500, 5000, 10000],
  [5000, 10000, 25000, 50000, 100000],
  [100000, 200000, 250000, 500000],
  [500000, 1000000, 2000000, 5000000],
];
export const CHIP_PAGES = CHIP_PAGE_VALUES.length + 1;

// Default page scaled to a stack (umbrales fijos por buy-in):
//  <=1k → p0 | <=25k → p1 (5k,10k,25k) | <=100k → p2 (50k,100k) | resto → p3 (250k,500k)
export const pageForAmount = (amount: number, mult = 1): number => {
  amount = amount / mult; // umbrales en valor base de ficha
  if (amount < 5000) return 0;
  if (amount < 50000) return 1;
  if (amount < 250000) return 2;
  if (amount < 2000000) return 3;
  if (amount < 120000000) return 4;
  return 5;
};

export const isPlaque = (v: number) => v >= 1000;
export const isSmooth = (v: number) => v >= 100000; // smooth border, no stripes

// Physical diameter/height by denomination.
export const sizeForValue = (v: number): number => {
  if (v < 1000) return 35;
  if (v < 10000) return 38;
  if (v < 100000) return 41;
  return 58; // Premium — todas del mismo tamaño
};

export const Chip = ({ d, size = 36, forceSize = false }: { d: ChipDenom; size?: number; forceSize?: boolean }) => {
  if (d.isCustom) {
    // forceSize (miniaturas): sin ancho mínimo de 64 → cabe en la zona sidebets.
    const w = forceSize ? size * 1.6 : Math.max(64, size * 1.6);
    const h = size * 1.1;
    return (
      <div
        className="flex items-center justify-center font-black text-cyan-300 relative shrink-0 overflow-hidden"
        style={{
          width: w, height: h,
          borderRadius: 8,
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          boxShadow: '0 4px 10px rgba(0,0,0,0.5), 0 0 12px rgba(6,182,212,0.4), inset 0 0 8px rgba(6,182,212,0.2)',
          border: '2px solid #06b6d4'
        }}
      >
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, #06b6d4 4px, #06b6d4 8px)' }} />
        <span className="relative z-10" style={{ fontSize: forceSize ? Math.round(size * 0.5) : 14, textShadow: '0 0 6px rgba(6,182,212,1)' }}>{d.label}</span>
      </div>
    );
  }

  const naturalH = sizeForValue(vis(d));
  // Large chips (100k+) always at their natural size regardless of premium...
  // ...salvo forceSize: respeta el size pedido (para miniaturas, p.ej. zona sidebets).
  const h = d.isCustom ? size * 1.1 : forceSize ? size : (d.premium || vis(d) >= 100000) ? Math.max(size ?? naturalH, naturalH) : (size ?? naturalH);
  const plaque = isPlaque(vis(d));
  const w = d.isCustom ? Math.max(64, (size || 36) * 1.6) : plaque ? Math.round(h * 1.28) : h;
  const radius = d.isCustom ? 8 : plaque ? Math.round(h * 0.13) : 9999;
  const innerRadius = d.isCustom ? 8 : plaque ? Math.round(h * 0.07) : 9999;
  const fontSize = d.isCustom ? 14 : d.label.length >= 4 ? h * 0.26 : h * 0.3;

  if (d.premium) {
    const p = d.premium;
    const bg =
      p === 'carbon'
        ? `repeating-linear-gradient(45deg, transparent 0px, transparent 3px, rgba(255,255,255,0.04) 3px, rgba(255,255,255,0.04) 4px),
           repeating-linear-gradient(-45deg, transparent 0px, transparent 3px, rgba(255,255,255,0.04) 3px, rgba(255,255,255,0.04) 4px),
           linear-gradient(150deg, #2d2d30 0%, #0d0d0f 55%, #222225 100%)`
      : p === 'silver'
        ? `linear-gradient(150deg, #f8f8f8 0%, #d0d0d0 18%, #808080 42%, #b0b0b0 65%, #efefef 100%)`
      : p === 'gold'
        ? `linear-gradient(150deg, #fffacd 0%, #f5c518 18%, #8b5e00 48%, #c4870a 68%, #fde06a 100%)`
        : /* diamond */
          `linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(186,230,253,0.88) 22%, rgba(255,255,255,0.96) 42%, rgba(224,242,254,0.82) 62%, rgba(255,255,255,0.97) 78%, rgba(186,230,253,0.9) 100%)`;

    const border =
      p === 'carbon'  ? '2px solid #71717a'
      : p === 'silver' ? '2px solid #9ca3af'
      : p === 'gold'   ? '2.5px solid #92400e'
                       : '2.5px solid rgba(147,197,253,0.85)';

    const shadow =
      p === 'carbon'
        ? '0 6px 18px rgba(0,0,0,0.75), inset 0 -4px 8px rgba(0,0,0,0.55), inset 0 3px 5px rgba(255,255,255,0.09)'
      : p === 'silver'
        ? '0 6px 16px rgba(0,0,0,0.4), inset 0 -3px 6px rgba(0,0,0,0.15), inset 0 4px 8px rgba(255,255,255,0.65)'
      : p === 'gold'
        ? '0 4px 10px rgba(0,0,0,0.4), inset 0 -3px 6px rgba(100,50,0,0.3), inset 0 4px 8px rgba(255,220,80,0.45)'
        : '0 6px 22px rgba(100,180,255,0.45), 0 0 14px rgba(200,240,255,0.25), inset 0 -3px 6px rgba(100,150,200,0.2), inset 0 4px 10px rgba(255,255,255,0.8)';

    const textColor =
      p === 'carbon'  ? '#d4d4d8'
      : p === 'silver' ? '#1a1a1a'
      : p === 'gold'   ? '#3d1500'
                       : '#0369a1';
    const innerBorder =
      p === 'carbon'  ? 'rgba(255,255,255,0.12)'
      : p === 'silver' ? 'rgba(180,180,180,0.5)'
      : p === 'gold'   ? 'rgba(255,195,0,0.45)'
                       : 'rgba(147,197,253,0.5)';

    return (
      <div
        className="flex items-center justify-center font-extrabold relative shrink-0"
        style={{ width: w, height: h, borderRadius: radius, background: bg, boxShadow: shadow, border, color: textColor }}
      >
        <div
          className="absolute flex items-center justify-center"
          style={{ inset: 4, borderRadius: innerRadius, border: `1px solid ${innerBorder}` }}
        >
          <span style={{
            fontSize, fontWeight: 900, letterSpacing: '-0.02em',
            textShadow:
              p === 'carbon'  ? '0 1px 3px rgba(0,0,0,0.9)'
              : p === 'silver' ? '0 1px 0 rgba(255,255,255,0.85), 0 -1px 0 rgba(0,0,0,0.35)'
              : p === 'gold'   ? '0 1px 0 rgba(255,210,60,0.7), 0 -1px 0 rgba(100,40,0,0.5)'
                               : '0 0 10px rgba(56,189,248,0.85), 0 0 4px rgba(186,230,253,0.9), 0 1px 0 rgba(255,255,255,0.95), 0 -1px 0 rgba(14,165,233,0.6), 1px 0 0 rgba(125,211,252,0.5), -1px 0 0 rgba(125,211,252,0.5)',
          }}>{d.label}</span>
        </div>
      </div>
    );
  }

  const smooth = isSmooth(vis(d));
  return (
    <div
      className="flex items-center justify-center font-extrabold text-white relative shrink-0"
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        background: `radial-gradient(circle at 35% 30%, ${d.color}dd, ${d.color})`,
        boxShadow: `0 4px 10px rgba(0,0,0,0.45), inset 0 -3px 6px rgba(0,0,0,0.35), inset 0 2px 3px rgba(255,255,255,0.25)`,
        border: smooth ? `2px solid ${d.ring}` : `3px dashed ${d.ring}`,
      }}
    >
      <div
        className="absolute border border-white/15 flex items-center justify-center"
        style={{ inset: 4, borderRadius: innerRadius }}
      >
        <span style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)', fontSize }}>{d.label}</span>
      </div>
    </div>
  );
};

// --- Keypad Modal ---
const KeypadModal = ({ initialValue, maxBet, mult = 1, onSave, onClose }: { initialValue: number, maxBet: number, mult?: number, onSave: (v: number) => void, onClose: () => void }) => {
  const minScale = 1_000_000 * mult; // con multiplicador, la escala mínima sube (M->B->T...)
  const minProChip = 30_000_000 * mult;
  const [numStr, setNumStr] = useState('');
  const [scale, setScale] = useState<number>(minScale); // Default M (o B/T... con multiplicador)

  useEffect(() => {
    if (initialValue >= 1_000_000_000_000_000) { setScale(1_000_000_000_000_000); setNumStr(Math.floor(initialValue / 1_000_000_000_000_000).toString()); }
    else if (initialValue >= 1_000_000_000_000) { setScale(1_000_000_000_000); setNumStr(Math.floor(initialValue / 1_000_000_000_000).toString()); }
    else if (initialValue >= 1_000_000_000) { setScale(1_000_000_000); setNumStr(Math.floor(initialValue / 1_000_000_000).toString()); }
    else { setScale(1_000_000); setNumStr(Math.floor(initialValue / 1_000_000).toString()); }
  }, [initialValue]);

  const handleKey = (k: string) => {
    if (k === 'DEL') {
      setNumStr(s => s.slice(0, -1));
    } else {
      setNumStr(s => {
        if (s.length > 8) return s; // limit length
        if (s === '0' && k !== '.') return k;
        return s + k;
      });
    }
  };

  const handleSave = () => {
    let finalNum = parseFloat(numStr || '0') * scale;
    if (isNaN(finalNum) || finalNum < minProChip) finalNum = minProChip;
    if (finalNum > maxBet && maxBet >= minProChip) finalNum = maxBet;
    onSave(finalNum);
  };

  const scaleLabel = scale === 1_000_000_000_000_000 ? 'Q' : scale === 1_000_000_000_000 ? 'T' : scale === 1_000_000_000 ? 'B' : 'M';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-slate-900/90 border border-white/10 rounded-3xl p-5 shadow-2xl w-full max-w-[320px] flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-1">
          <h3 className="text-white/80 font-bold text-lg">Ficha Pro</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors w-8 h-8 flex items-center justify-center rounded-full bg-white/5 active:bg-white/10">✕</button>
        </div>

        <div className="bg-black/50 border border-white/5 rounded-2xl p-4 flex flex-col items-end justify-center min-h-[80px] shadow-inner relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 pointer-events-none" />
          <div className="flex items-baseline gap-2 relative z-10">
            <span className="text-4xl font-black text-white tracking-tight">{numStr || '0'}</span>
            <span className="text-xl font-bold text-cyan-400">{scaleLabel}</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {[{l:'M', v:1_000_000}, {l:'B', v:1_000_000_000}, {l:'T', v:1_000_000_000_000}, {l:'Q', v:1_000_000_000_000_000}].filter(s => s.v >= minScale).map(s => (
            <button 
              key={s.l} 
              onClick={() => setScale(s.v)}
              className={`py-3 rounded-xl font-bold text-sm transition-all ${scale === s.v ? 'bg-cyan-500 text-white shadow-[0_0_15px_rgba(6,182,212,0.5)]' : 'bg-white/5 text-white/60 hover:bg-white/10 active:bg-white/20'}`}
            >
              {s.l}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {['1','2','3','4','5','6','7','8','9','0'].map(k => (
            <button 
              key={k} 
              onClick={() => handleKey(k)}
              className={`py-4 rounded-xl font-bold text-xl transition-all bg-white/5 text-white hover:bg-white/10 active:bg-white/20 ${k === '0' ? 'col-span-2' : ''}`}
            >
              {k}
            </button>
          ))}
          <button 
            onClick={() => handleKey('DEL')}
            className="py-4 rounded-xl font-bold text-lg transition-all bg-red-500/20 text-red-400 hover:bg-red-500/30 active:bg-red-500/40 flex items-center justify-center"
          >
            ⌫
          </button>
        </div>

        <button 
          onClick={handleSave}
          className="w-full py-4 rounded-xl font-black text-lg transition-all bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_4px_15px_rgba(16,185,129,0.3)] hover:brightness-110 active:scale-[0.98] active:brightness-90 mt-1"
        >
          OK
        </button>
      </motion.div>
    </div>
  );
};

// Custom Chip Page Component
export const CustomChipControl = ({ onAdd, maxBet, pendingTotal, canBet, mult = 1 }: { onAdd: (d: ChipDenom) => void; maxBet: number; pendingTotal: number; canBet: boolean; mult?: number }) => {
  const getMostSignificantDigitValue = (num: number) => {
    if (num <= 0) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(num)));
    return Math.floor(num / magnitude) * magnitude;
  };

  const MIN_PRO_CHIP = 30_000_000 * mult;
  const [val, setVal] = useState(() => {
    const stored = localStorage.getItem('customChipValue');
    let init = stored ? parseInt(stored, 10) : MIN_PRO_CHIP;
    if (init > maxBet && maxBet >= MIN_PRO_CHIP) init = getMostSignificantDigitValue(maxBet);
    return Math.max(MIN_PRO_CHIP, init);
  });
  
  const [showKeypad, setShowKeypad] = useState(false);

  useEffect(() => {
    if (val > maxBet && maxBet >= MIN_PRO_CHIP) {
      setVal(Math.max(MIN_PRO_CHIP, getMostSignificantDigitValue(maxBet)));
    }
  }, [maxBet, val, MIN_PRO_CHIP]);

  useEffect(() => {
    localStorage.setItem('customChipValue', val.toString());
  }, [val]);

  const getStep = (v: number) => {
    if (v >= 1_000_000_000_000_000) return 1_000_000_000_000_000;
    if (v >= 1_000_000_000_000) return 1_000_000_000_000;
    if (v >= 1_000_000_000) return 1_000_000_000;
    if (v >= 1_000_000) return 1_000_000;
    if (v >= 1000) return 1000;
    return 1;
  };

  const applyChange = (type: 'up' | 'down' | 'x10' | '/10') => {
    setVal(v => {
      let nv = v;
      if (type === 'x10') nv = v * 10;
      else if (type === '/10') nv = Math.floor(v / 10);
      else if (type === 'up') {
        const step = getStep(v);
        nv = Math.floor(v / step) * step + step;
      }
      else if (type === 'down') {
        const step = getStep(Math.max(1, v - 1));
        if (v % step === 0) {
          nv = v - step;
        } else {
          nv = Math.floor(v / step) * step;
        }
      }
      
      const upperLimit = Math.max(maxBet, MIN_PRO_CHIP);
      return Math.max(MIN_PRO_CHIP, Math.min(upperLimit, nv));
    });
  };

  const d: ChipDenom = { v: val, label: fmtChips(val), color: '', ring: '', isCustom: true };
  const disabled = !canBet || val > maxBet || pendingTotal + val > maxBet;

  return (
    <>
      <div className="flex items-center justify-between w-full px-2 gap-2 h-full">
        <button 
          onClick={() => onAdd(d)}
          disabled={disabled} 
          className="active:scale-95 transition-transform disabled:opacity-30 shrink-0"
        >
          <Chip d={d} size={42} />
        </button>
        
        <div className="flex gap-1.5 flex-1 h-full py-1">
          <button 
            onClick={() => setShowKeypad(true)} 
            className="bg-white/10 hover:bg-white/15 active:bg-white/20 rounded-lg shadow-sm flex flex-col items-center justify-center w-[42px] shrink-0 transition-colors"
          >
            <span className="text-xl">⌨</span>
          </button>
          <div className="grid grid-cols-2 grid-rows-2 gap-1.5 flex-1">
            <button onClick={() => applyChange('up')} className="bg-white/10 hover:bg-white/15 active:bg-white/20 rounded-lg text-xs font-bold text-white/80 shadow-sm flex items-center justify-center transition-colors">▲</button>
            <button onClick={() => applyChange('x10')} className="bg-white/10 hover:bg-white/15 active:bg-white/20 rounded-lg text-[10px] font-bold text-white/80 shadow-sm flex items-center justify-center transition-colors">x10</button>
            <button onClick={() => applyChange('down')} className="bg-white/10 hover:bg-white/15 active:bg-white/20 rounded-lg text-xs font-bold text-white/80 shadow-sm flex items-center justify-center transition-colors">▼</button>
            <button onClick={() => applyChange('/10')} className="bg-white/10 hover:bg-white/15 active:bg-white/20 rounded-lg text-[10px] font-bold text-white/80 shadow-sm flex items-center justify-center transition-colors">/10</button>
          </div>
        </div>
      </div>
      
      <AnimatePresence>
        {showKeypad && (
          <KeypadModal
            initialValue={val}
            maxBet={maxBet}
            mult={mult}
            onSave={(newVal) => {
              setVal(newVal);
              setShowKeypad(false);
            }} 
            onClose={() => setShowKeypad(false)} 
          />
        )}
      </AnimatePresence>
    </>
  );
};

// Paged chip rail: 5 chips visible, swipe or arrows to reveal next page (overlapping scales).
export const ChipRail = ({ page, setPage, onAdd, maxBet, pendingTotal, canBet, mult = 1 }: {
  page: number; setPage: (p: number) => void;
  onAdd: (d: ChipDenom) => void; maxBet: number; pendingTotal: number; canBet: boolean; mult?: number;
}) => {
  const dragX = useRef(0);
  const dirRef = useRef(0);
  const slice = page < CHIP_PAGE_VALUES.length ? CHIP_PAGE_VALUES[page].map(defByValue).map(d => scaleDef(d, mult)) : [];
  const go = (delta: number) => {
    const np = Math.max(0, Math.min(CHIP_PAGES - 1, page + delta));
    if (np !== page) { dirRef.current = delta; setPage(np); }
  };
  const dir = dirRef.current;
  return (
    <div>
      <div className="flex items-center gap-1 select-none" style={{ touchAction: 'pan-y' }}>
        <button onClick={() => go(-1)} disabled={page === 0}
          className="shrink-0 w-5 h-8 rounded-lg bg-white/10 border border-white/15 text-white/70 text-base leading-none disabled:opacity-20 active:scale-90">‹</button>
        <div
          className="relative flex-1 overflow-hidden"
          onPointerDown={e => { dragX.current = e.clientX; }}
          onPointerUp={e => { const dx = e.clientX - dragX.current; if (dx > 40) go(-1); else if (dx < -40) go(1); }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={page}
              initial={{ x: dir >= 0 ? 90 : -90, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: dir >= 0 ? -90 : 90, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              className="flex items-center justify-between h-full min-h-[64px]"
            >
              {page < CHIP_PAGE_VALUES.length ? (
                slice.map(d => {
                  const disabled = !canBet || d.v > maxBet || pendingTotal + d.v > maxBet;
                  return (
                    <button key={d.v} onClick={() => onAdd(d)} disabled={disabled}
                      className="active:scale-90 transition-transform disabled:opacity-20 shrink-0">
                      <Chip d={d} />
                    </button>
                  );
                })
              ) : (
                <CustomChipControl onAdd={onAdd} maxBet={maxBet} pendingTotal={pendingTotal} canBet={canBet} mult={mult} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <button onClick={() => go(1)} disabled={page >= CHIP_PAGES - 1}
          className="shrink-0 w-5 h-8 rounded-lg bg-white/10 border border-white/15 text-white/70 text-base leading-none disabled:opacity-20 active:scale-90">›</button>
      </div>
      {/* page dots */}
      <div className="flex justify-center gap-1 mt-1.5">
        {Array.from({ length: CHIP_PAGES }).map((_, i) => (
          <button key={i} onClick={() => { dirRef.current = i > page ? 1 : -1; setPage(i); }}
            className={`h-1.5 rounded-full transition-all ${i === page ? 'w-4 bg-amber-300' : 'w-1.5 bg-white/25'}`} />
        ))}
      </div>
    </div>
  );
};

// Build a stack of chip glyphs from an amount (greedy biggest denoms first, cap at 6 visual chips)
export const chipsFromAmount = (amount: number, mult = 1): ChipDenom[] => {
  if (amount >= 30_000_000 * mult) {
    return [{ v: amount, label: fmtChips(amount), color: '', ring: '', isCustom: true }];
  }

  const stack: ChipDenom[] = [];
  let remaining = amount;
  const desc = CHIP_DEFS.map(d => scaleDef(d, mult)).sort((a, b) => b.v - a.v);
  for (const d of desc) {
    while (remaining >= d.v && stack.length < 24) {
      stack.push(d);
      remaining -= d.v;
    }
  }
  // If nothing fits but amount > 0, show one smallest chip
  if (stack.length === 0 && amount > 0) stack.push(scaleDef(CHIP_DEFS[0], mult));
  return stack;
};

// One vertical pile of same-shape chips.
export const ChipPile = ({ items, size = 36 }: { items: ChipDenom[]; size?: number }) => {
  const actualH = (d: ChipDenom) => {
    if (d.isCustom) return 42 * 1.1;
    return (d.premium || vis(d) >= 100000) ? sizeForValue(vis(d)) : size;
  };
  const actualW = (d: ChipDenom) => {
    if (d.isCustom) return 60;
    const h = actualH(d); return isPlaque(vis(d)) ? Math.round(h * 1.28) : h;
  };
  const pileW = Math.max(...items.map(d => actualW(d)));
  const pileH = Math.max(...items.map(d => actualH(d)));
  return (
    <motion.div layout className="relative" style={{ width: pileW, height: pileH + items.length * 4 }}>
      {items.map((d, i) => (
        <motion.div
          key={i}
          initial={{ y: -40, opacity: 0, scale: 0.7 }}
          animate={{ y: -(i * 4), opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 360, damping: 22 }}
          style={{ position: 'absolute', left: (pileW - actualW(d)) / 2, bottom: 0, zIndex: i }}
        >
          <Chip d={d} size={d.isCustom ? 42 : size} />
        </motion.div>
      ))}
    </motion.div>
  );
};

export const chunkArray = <T,>(arr: T[], size: number): T[][] => {
  if (arr.length === 0) return [];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
};

export const createColumns = <T,>(arr: T[], itemsPerStack: number, stacksPerCol: number): T[][][] => {
  const chunks = chunkArray(arr, itemsPerStack);
  return chunkArray(chunks, stacksPerCol);
};

// Betting circle stack: rounds / plaques / larges in SEPARATE piles (never mixed).
export const ChipStack = ({ chips, size = 36 }: { chips: ChipDenom[]; size?: number }) => {
  const rounds  = chips.filter(c => vis(c) < 1000 && !c.isCustom);
  const plaques = chips.filter(c => !c.premium && vis(c) >= 1000 && vis(c) < 100000 && !c.isCustom);
  const larges  = chips.filter(c => (c.premium || vis(c) >= 100000) && !c.isCustom);
  const customs = chips.filter(c => c.isCustom);

  const roundCols = createColumns(rounds, 10, 2);
  const plaqueCols = createColumns(plaques, 10, 2);
  const largeCols = createColumns(larges, 8, 1);
  const customCols = createColumns(customs, 1, 2);

  const renderCol = (col: ChipDenom[][], prefix: string, colIndex: number) => (
    <motion.div layout key={`${prefix}-col-${colIndex}`} className="grid">
      {col.map((chunk, i) => (
        <div 
          key={`${prefix}-chunk-${i}`} 
          className="col-start-1 row-start-1 flex items-end justify-center" 
          style={{ marginBottom: (col.length - 1 - i) * (prefix === 'customs' ? 44 : 34) + (prefix === 'customs' ? 14 : 0), zIndex: i }}
        >
          <ChipPile items={chunk} size={size} />
        </div>
      ))}
    </motion.div>
  );

  return (
    <motion.div layout className="flex items-end justify-center gap-1.5">
      {roundCols.map((col, i) => renderCol(col, 'rounds', i))}
      {plaqueCols.map((col, i) => renderCol(col, 'plaques', i))}
      {largeCols.map((col, i) => renderCol(col, 'larges', i))}
      {customCols.map((col, i) => renderCol(col, 'customs', i))}
    </motion.div>
  );
};
