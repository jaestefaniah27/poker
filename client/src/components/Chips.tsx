import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { fmtChips } from '../utils';

// Chip catalogue. Rounds (<1000) are circles; plaques (>=1000) are rectangles.
// Border: striped/dashed ("rallado") < 100k, smooth/solid >= 100k.
// Physical size scales with denomination (small value -> smaller chip).
export type ChipDenom = { v: number; color: string; ring: string; label: string; premium?: 'carbon' | 'silver' | 'gold' | 'diamond'; isCustom?: boolean };

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
export const pageForAmount = (amount: number): number => {
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

export const Chip = ({ d, size = 36 }: { d: ChipDenom; size?: number }) => {
  if (d.isCustom) {
    const w = Math.max(64, size * 1.6);
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
        <span className="relative z-10 text-[14px]" style={{ textShadow: '0 0 6px rgba(6,182,212,1)' }}>{d.label}</span>
      </div>
    );
  }

  const naturalH = sizeForValue(d.v);
  // Large chips (100k+) always at their natural size regardless of premium
  const h = d.isCustom ? size * 1.1 : (d.premium || d.v >= 100000) ? Math.max(size ?? naturalH, naturalH) : (size ?? naturalH);
  const plaque = isPlaque(d.v);
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

  const smooth = isSmooth(d.v);
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

// Custom Chip Page Component
export const CustomChipControl = ({ onAdd, maxBet, pendingTotal, canBet }: { onAdd: (d: ChipDenom) => void; maxBet: number; pendingTotal: number; canBet: boolean }) => {
  const getMostSignificantDigitValue = (num: number) => {
    if (num <= 0) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(num)));
    return Math.floor(num / magnitude) * magnitude;
  };

  const MIN_PRO_CHIP = 30_000_000;
  const [val, setVal] = useState(() => {
    const stored = localStorage.getItem('customChipValue');
    let init = stored ? parseInt(stored, 10) : MIN_PRO_CHIP;
    if (init > maxBet && maxBet >= MIN_PRO_CHIP) init = getMostSignificantDigitValue(maxBet);
    return Math.max(MIN_PRO_CHIP, init);
  });

  useEffect(() => {
    if (val > maxBet && maxBet >= 30_000_000) {
      setVal(Math.max(30_000_000, getMostSignificantDigitValue(maxBet)));
    }
  }, [maxBet, val]);

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
      
      const upperLimit = Math.max(maxBet, 30_000_000);
      return Math.max(30_000_000, Math.min(upperLimit, nv));
    });
  };

  const d: ChipDenom = { v: val, label: fmtChips(val), color: '', ring: '', isCustom: true };
  const disabled = !canBet || val > maxBet || pendingTotal + val > maxBet;

  const longPressTimer = useRef<any>(null);
  const didLongPress = useRef(false);

  const handlePointerDown = () => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      let scaleName = '';
      let multiplier = 1;
      if (val >= 1_000_000_000_000_000) { scaleName = 'Qa (cuatrillones)'; multiplier = 1_000_000_000_000_000; }
      else if (val >= 1_000_000_000_000) { scaleName = 'T (trillones)'; multiplier = 1_000_000_000_000; }
      else if (val >= 1_000_000_000) { scaleName = 'B (billones)'; multiplier = 1_000_000_000; }
      else if (val >= 1_000_000) { scaleName = 'M (millones)'; multiplier = 1_000_000; }
      else if (val >= 1000) { scaleName = 'k (miles)'; multiplier = 1000; }
      
      const input = window.prompt(`Introduce el nuevo valor (ej. 5m, 10b, 2t, 1qa) o en ${scaleName || 'unidades'}:`);
      if (input !== null) {
        const clean = input.trim().toLowerCase();
        let mult = multiplier;
        let numStr = clean;
        
        if (clean.endsWith('qa')) { mult = 1_000_000_000_000_000; numStr = clean.slice(0, -2); }
        else if (clean.endsWith('t')) { mult = 1_000_000_000_000; numStr = clean.slice(0, -1); }
        else if (clean.endsWith('b')) { mult = 1_000_000_000; numStr = clean.slice(0, -1); }
        else if (clean.endsWith('m')) { mult = 1_000_000; numStr = clean.slice(0, -1); }
        else if (clean.endsWith('k')) { mult = 1000; numStr = clean.slice(0, -1); }
        
        // If the user types a raw very large number directly (e.g. 5000000000000) we assume they mean absolute units and we drop the current scale multiplier.
        if (numStr.length >= 7 && mult === multiplier && clean === numStr) {
           mult = 1; 
        }

        const num = parseFloat(numStr);
        if (!isNaN(num) && num > 0) {
          const upperLimit = Math.max(maxBet, MIN_PRO_CHIP);
          setVal(Math.max(MIN_PRO_CHIP, Math.min(upperLimit, num * mult)));
        }
      }
    }, 600);
  };

  const clearTimer = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (didLongPress.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onAdd(d);
  };

  return (
    <div className="flex items-center justify-between w-full px-2 gap-4 h-full">
      <button 
        onPointerDown={handlePointerDown}
        onPointerUp={clearTimer}
        onPointerLeave={clearTimer}
        onClick={handleClick}
        disabled={disabled} 
        className="active:scale-95 transition-transform disabled:opacity-30 shrink-0"
      >
        <Chip d={d} size={42} />
      </button>
      <div className="grid grid-cols-2 grid-rows-2 gap-1.5 flex-1 h-full py-1">
        <button onClick={() => applyChange('up')} className="bg-white/10 hover:bg-white/15 active:bg-white/20 rounded-lg text-xs font-bold text-white/80 shadow-sm flex items-center justify-center">▲</button>
        <button onClick={() => applyChange('x10')} className="bg-white/10 hover:bg-white/15 active:bg-white/20 rounded-lg text-xs font-bold text-white/80 shadow-sm flex items-center justify-center">x10</button>
        <button onClick={() => applyChange('down')} className="bg-white/10 hover:bg-white/15 active:bg-white/20 rounded-lg text-xs font-bold text-white/80 shadow-sm flex items-center justify-center">▼</button>
        <button onClick={() => applyChange('/10')} className="bg-white/10 hover:bg-white/15 active:bg-white/20 rounded-lg text-xs font-bold text-white/80 shadow-sm flex items-center justify-center">/10</button>
      </div>
    </div>
  );
};

// Paged chip rail: 5 chips visible, swipe or arrows to reveal next page (overlapping scales).
export const ChipRail = ({ page, setPage, onAdd, maxBet, pendingTotal, canBet }: {
  page: number; setPage: (p: number) => void;
  onAdd: (d: ChipDenom) => void; maxBet: number; pendingTotal: number; canBet: boolean;
}) => {
  const dragX = useRef(0);
  const dirRef = useRef(0);
  const slice = page < CHIP_PAGE_VALUES.length ? CHIP_PAGE_VALUES[page].map(defByValue) : [];
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
                <CustomChipControl onAdd={onAdd} maxBet={maxBet} pendingTotal={pendingTotal} canBet={canBet} />
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
export const chipsFromAmount = (amount: number): ChipDenom[] => {
  if (amount >= 30_000_000) {
    return [{ v: amount, label: fmtChips(amount), color: '', ring: '', isCustom: true }];
  }

  const stack: ChipDenom[] = [];
  let remaining = amount;
  const desc = [...CHIP_DEFS].sort((a, b) => b.v - a.v);
  for (const d of desc) {
    while (remaining >= d.v && stack.length < 24) {
      stack.push(d);
      remaining -= d.v;
    }
  }
  // If nothing fits but amount > 0, show one smallest chip
  if (stack.length === 0 && amount > 0) stack.push(CHIP_DEFS[0]);
  return stack;
};

// One vertical pile of same-shape chips.
export const ChipPile = ({ items, size = 36 }: { items: ChipDenom[]; size?: number }) => {
  const actualH = (d: ChipDenom) => {
    if (d.isCustom) return 42 * 1.1;
    return (d.premium || d.v >= 100000) ? sizeForValue(d.v) : size;
  };
  const actualW = (d: ChipDenom) => {
    if (d.isCustom) return 60;
    const h = actualH(d); return isPlaque(d.v) ? Math.round(h * 1.28) : h;
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
  const rounds  = chips.filter(c => c.v < 1000 && !c.isCustom);
  const plaques = chips.filter(c => !c.premium && c.v >= 1000 && c.v < 100000 && !c.isCustom);
  const larges  = chips.filter(c => (c.premium || c.v >= 100000) && !c.isCustom);
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
