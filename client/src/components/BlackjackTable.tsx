import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket, fmtChips, vibrate, STAKE_TIERS } from '../utils';
import PlayingCard from './PlayingCard';
import Slider from './Slider';
import Avatar from './Avatar';
import AnimatedNumber from './AnimatedNumber';
import type { Room, Player, Card } from '../../../shared/types';

interface Props {
  room: Room;
  user: { id: string; name: string; balance: number; avatar: string; hasPassword: boolean };
  onLeave: () => void;
}

const cardPoints = (rank: string): number => {
  if (rank === 'A') return 11;
  if (rank === 'K' || rank === 'Q' || rank === 'J' || rank === 'T') return 10;
  const n = parseInt(rank, 10);
  return Number.isFinite(n) ? n : 0;
};

const handTotalDisplay = (cards: Card[]): { total: number; soft: boolean; bust: boolean; hasHidden: boolean } => {
  const hasHidden = cards.some(c => (c.rank as unknown as string) === '?');
  const visible = cards.filter(c => (c.rank as unknown as string) !== '?');
  let total = 0;
  let aces = 0;
  for (const c of visible) {
    total += cardPoints(c.rank);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 && total <= 21, bust: total > 21, hasHidden };
};

// Chip catalogue. Rounds (<1000) are circles; plaques (>=1000) are rectangles.
// Border: striped/dashed ("rallado") < 100k, smooth/solid >= 100k.
// Physical size scales with denomination (small value -> smaller chip).
type ChipDenom = { v: number; color: string; ring: string; label: string; premium?: 'carbon' | 'silver' | 'gold' | 'diamond' };

const CHIP_DEFS: ChipDenom[] = [
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

const defByValue = (v: number): ChipDenom => CHIP_DEFS.find(d => d.v === v) || CHIP_DEFS[0];

// Pages overlap on purpose so adjacent scales share a chip or two.
const CHIP_PAGE_VALUES: number[][] = [
  [25, 50, 100, 250, 500],
  [500, 1000, 2500, 5000, 10000],
  [5000, 10000, 25000, 50000, 100000],
  [100000, 200000, 250000, 500000],
  [500000, 1000000, 2000000, 5000000],
];
const CHIP_PAGES = CHIP_PAGE_VALUES.length;

// Default page scaled to a stack (umbrales fijos por buy-in):
//  <=1k → p0 | <=25k → p1 (5k,10k,25k) | <=100k → p2 (50k,100k) | resto → p3 (250k,500k)
const pageForAmount = (amount: number): number => {
  if (amount <= 1000) return 0;
  if (amount <= 25000) return 1;
  if (amount <= 100000) return 2;
  if (amount <= 500000) return 3;
  return 4;
};

const isPlaque = (v: number) => v >= 1000;
const isSmooth = (v: number) => v >= 100000; // smooth border, no stripes

// Physical diameter/height by denomination.
const sizeForValue = (v: number): number => {
  if (v < 1000) return 35;
  if (v < 10000) return 38;
  if (v < 100000) return 41;
  return 58; // Premium — todas del mismo tamaño
};

const Chip = ({ d, size }: { d: ChipDenom; size?: number }) => {
  const naturalH = sizeForValue(d.v);
  // Large chips (100k+) always at their natural size regardless of premium
  const h = (d.premium || d.v >= 100000) ? Math.max(size ?? naturalH, naturalH) : (size ?? naturalH);
  const plaque = isPlaque(d.v);
  const w = plaque ? Math.round(h * 1.28) : h;
  const radius = plaque ? Math.round(h * 0.13) : 9999;
  const innerRadius = plaque ? Math.round(h * 0.07) : 9999;
  const fontSize = d.label.length >= 4 ? h * 0.26 : h * 0.3;

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

// Paged chip rail: 5 chips visible, swipe or arrows to reveal next page (overlapping scales).
const ChipRail = ({ page, setPage, onAdd, maxBet, pendingTotal, canBet }: {
  page: number; setPage: (p: number) => void;
  onAdd: (d: ChipDenom) => void; maxBet: number; pendingTotal: number; canBet: boolean;
}) => {
  const dragX = useRef(0);
  const dirRef = useRef(0);
  const slice = CHIP_PAGE_VALUES[page].map(defByValue);
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
              className="flex items-center justify-between"
            >
              {slice.map(d => {
                const disabled = !canBet || d.v > maxBet || pendingTotal + d.v > maxBet;
                return (
                  <button key={d.v} onClick={() => onAdd(d)} disabled={disabled}
                    className="active:scale-90 transition-transform disabled:opacity-20 shrink-0">
                    <Chip d={d} />
                  </button>
                );
              })}
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
const chipsFromAmount = (amount: number): ChipDenom[] => {
  const stack: ChipDenom[] = [];
  let remaining = amount;
  const desc = [...CHIP_DEFS].sort((a, b) => b.v - a.v);
  for (const d of desc) {
    while (remaining >= d.v && stack.length < 6) {
      stack.push(d);
      remaining -= d.v;
    }
  }
  // If nothing fits but amount > 0, show one smallest chip
  if (stack.length === 0 && amount > 0) stack.push(CHIP_DEFS[0]);
  return stack;
};

// One vertical pile of same-shape chips.
const ChipPile = ({ items, size }: { items: ChipDenom[]; size: number }) => {
  // Large chips (100k+) always use their natural size regardless of premium
  const actualH = (d: ChipDenom) => (d.premium || d.v >= 100000) ? sizeForValue(d.v) : size;
  const actualW = (d: ChipDenom) => { const h = actualH(d); return isPlaque(d.v) ? Math.round(h * 1.28) : h; };
  const pileW = Math.max(...items.map(d => actualW(d)));
  const pileH = Math.max(...items.map(d => actualH(d)));
  return (
    <div className="relative" style={{ width: pileW, height: pileH + items.length * 4 }}>
      {items.map((d, i) => (
        <motion.div
          key={i}
          initial={{ y: -40, opacity: 0, scale: 0.7 }}
          animate={{ y: -(i * 4), opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 360, damping: 22 }}
          style={{ position: 'absolute', left: (pileW - actualW(d)) / 2, bottom: 0, zIndex: i }}
        >
          <Chip d={d} size={size} />
        </motion.div>
      ))}
    </div>
  );
};

// Betting circle stack: rounds / plaques / larges in SEPARATE piles (never mixed).
const ChipStack = ({ chips, size = 36 }: { chips: ChipDenom[]; size?: number }) => {
  const rounds  = chips.filter(c => c.v < 1000);
  const plaques = chips.filter(c => !c.premium && c.v >= 1000 && c.v < 100000);
  const larges  = chips.filter(c => c.premium || c.v >= 100000);
  return (
    <div className="flex items-end justify-center gap-1.5">
      {rounds.length  > 0 && <ChipPile items={rounds}  size={size} />}
      {plaques.length > 0 && <ChipPile items={plaques} size={size} />}
      {larges.length  > 0 && <ChipPile items={larges}  size={size} />}
    </div>
  );
};

const TotalPill = ({ total, soft, bust, hasHidden, accent = 'sky', size = 'sm' }: { total: number; soft: boolean; bust: boolean; hasHidden: boolean; accent?: 'sky' | 'amber' | 'rose' | 'emerald'; size?: 'xs' | 'sm' }) => {
  if (total === 0 && !hasHidden) return null;
  const palette: Record<string, string> = {
    sky:     'bg-white text-slate-900',
    amber:   'bg-amber-300 text-amber-950',
    rose:    'bg-rose-500 text-white',
    emerald: 'bg-emerald-400 text-emerald-950',
  };
  // Bust still shows total but in rose; soft uses sky/amber by default
  const cls = bust ? palette.rose : palette[accent];
  const sizing = size === 'xs' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-0.5 text-[11px]';
  return (
    <div className={`inline-flex items-center gap-1 rounded-full font-extrabold shadow ${sizing} ${cls}`}>
      <span>{total}{hasHidden ? '+' : ''}</span>
      {soft && !hasHidden && !bust && <span className="opacity-70">S</span>}
      {bust && <span className="opacity-80">·BUST</span>}
    </div>
  );
};

// Linear card row — cards laid out left-to-right with controlled overlap.
// Each card's top-left rank stays visible (overlap eats only right side).
// Step decreases as n grows → existing cards slide together to make room for the new one.
const CardFan = ({ cards, big = false, faceDownDeal = false }: { cards: Card[]; big?: boolean; faceDownDeal?: boolean }) => {
  const cardW = big ? 72 : 50;
  const cardH = big ? 108 : 72;
  const cls = big ? 'w-[72px] h-[108px]' : 'w-[50px] h-[72px]';
  const n = cards.length;
  const step = n <= 1 ? cardW
    : n === 2 ? Math.round(cardW * 0.74)
    : n === 3 ? Math.round(cardW * 0.62)
    : n === 4 ? Math.round(cardW * 0.50)
    : n <= 5  ? Math.round(cardW * 0.43)
    : Math.round(cardW * 0.37);
  const containerW = cardW + step * (n - 1);

  // Track which positions had hidden cards in the PREVIOUS render to detect flip reveals
  const wasHiddenRef = useRef<Record<number, boolean>>({});
  const prevWasHidden = wasHiddenRef.current;
  useEffect(() => {
    const next: Record<number, boolean> = {};
    cards.forEach((c, i) => { next[i] = (c.rank as unknown as string) === '?'; });
    wasHiddenRef.current = next;
  }); // runs after every render — keeps ref in sync

  return (
    <div className="relative" style={{ width: Math.max(cardW, containerW), height: cardH, perspective: 800 }}>
      <AnimatePresence initial={false}>
        {cards.map((c, i) => {
          const hidden = (c.rank as unknown as string) === '?';
          const isFlipReveal = prevWasHidden[i] === true && !hidden;
          return (
            <motion.div
              key={`${i}-${c.rank}-${c.suit}`}
              layout="position"
              initial={isFlipReveal
                ? { opacity: 1, x: 0, y: 0, rotate: 0 }
                : { x: 90, y: -70, opacity: 0, rotate: 14 }}
              animate={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
              exit={hidden
                ? { opacity: 0, transition: { duration: 0 } }
                : { opacity: 0, scale: 0.8 }}
              transition={{
                type: 'spring',
                stiffness: isFlipReveal ? 280 : 230,
                damping: isFlipReveal ? 24 : 22,
                delay: faceDownDeal ? i * 0.18 : (isFlipReveal ? 0 : (i < n - 1 ? 0 : 0.05)),
                layout: { type: 'spring', stiffness: 320, damping: 28 },
              }}
              style={{ position: 'absolute', left: i * step, top: 0, zIndex: i, width: cardW, height: cardH }}
            >
              {/* Rotación aislada en elemento interno → layout mide el tamaño completo, no la carta girada (evita carta "pequeñita") */}
              <motion.div
                initial={isFlipReveal ? { rotateY: -90 } : false}
                animate={{ rotateY: 0 }}
                transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                style={{ width: cardW, height: cardH, transformStyle: 'preserve-3d' }}
              >
                <PlayingCard rank={c.rank} suit={c.suit} hidden={hidden} className={cls} compact />
              </motion.div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};



// Mano compacta para oponentes: cartas pequeñas muy superpuestas (estilo escritorio).
const MiniHand = ({ cards }: { cards: Card[] }) => {
  const n = cards.length;
  const cw = 32, ch = 44, step = 16;
  return (
    <div className="relative" style={{ width: cw + step * Math.max(0, n - 1), height: ch }}>
      {cards.map((c, i) => {
        const hidden = (c.rank as unknown as string) === '?';
        return (
          <div key={i} className="absolute" style={{ left: i * step, top: 0, zIndex: i }}>
            <PlayingCard rank={c.rank} suit={c.suit} hidden={hidden} compact className="w-8 h-11" />
          </div>
        );
      })}
    </div>
  );
};

const BlackjackTable = ({ room, user, onLeave }: Props) => {
  const myPlayer = room.players.find(p => p.userId === user.id) || null;
  const opponents = room.players.filter(p => p.userId !== user.id && p.isActive);
  const rawPhase = room.bjPhase || 'waiting';
  const phase = (rawPhase === 'resolve' && myPlayer?.bjHasContinued) ? 'betting' : rawPhase;
  // Modelo concurrente: puedo actuar sobre mi mano mientras esté 'playing' (sin esperar turno).
  const canAct = phase === 'playerAction' && myPlayer?.bjStatus === 'playing';

  const minBet = room.minBet || 1;
  const myChips = myPlayer?.chips || 0;
  // Sin tope de mesa: puedes apostar todas tus fichas. Las que no puedas pagar salen transparentes.
  const maxBet = myChips;
  const myBet = myPlayer?.bet || 0;
  const canBet = phase === 'betting' && myPlayer && !myPlayer.isSpectating && myChips > 0 && myBet === 0;

  // Chips dropped into the betting circle (pre-deal)
  const [pendingChips, setPendingChips] = useState<ChipDenom[]>([]);
  const pendingTotal = useMemo(() => pendingChips.reduce((s, c) => s + c.v, 0), [pendingChips]);
  // Composición EXACTA apostada (no se reordena al repartir): se muestra tal cual durante la mano.
  const [placedComposition, setPlacedComposition] = useState<ChipDenom[]>([]);
  
  const [hideLostChips, setHideLostChips] = useState(false);
  const [showRebuyModal, setShowRebuyModal] = useState(false);
  const [rebuyTierIndex, setRebuyTierIndex] = useState(1);

  useEffect(() => {
    if (phase === 'betting' && myBet === 0) { setPendingChips([]); setPlacedComposition([]); setHideLostChips(false); }
    else if (phase === 'waiting') { setPendingChips([]); setPlacedComposition([]); setHideLostChips(false); }
    else if (phase !== 'betting') { 
      setPendingChips([]); 
      // Si la fase avanza pero el servidor dice que no apostamos, limpiamos la mesa para no quedar atascados en estado zombie
      if (myBet === 0) setPlacedComposition([]); 
    } 
    if (phase !== 'resolve') setHideLostChips(false);
  }, [phase, room.id, myBet]);

  // Ocultar fichas automáticamente si se pierde la mano
  useEffect(() => {
    if (phase === 'resolve' && myPlayer && myBet > 0) {
      if (myPlayer.bjResult === 'lose' || myPlayer.bjStatus === 'bust') {
        // Un pequeño timeout para que el usuario vea el resultado un instante antes de que desaparezcan
        const t = setTimeout(() => setHideLostChips(true), 1200);
        return () => clearTimeout(t);
      }
    }
  }, [phase, myPlayer?.bjResult, myBet]);

  // Remember last placed bet for one-tap REBET in the next round
  const [lastBet, setLastBet] = useState(0);
  useEffect(() => { if (myBet > 0) setLastBet(myBet); }, [myBet]);

  // Paged chip rail: default page escalada al stack del jugador (sin deslizar manualmente)
  const [chipPage, setChipPage] = useState(() => pageForAmount(maxBet));
  useEffect(() => {
    if (phase === 'betting') setChipPage(pageForAmount(maxBet));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, room.id]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const bettingLeft = (phase === 'betting' && room.bettingDeadline) ? Math.max(0, Math.ceil((room.bettingDeadline - now) / 1000)) : null;

  useEffect(() => { if (canAct) vibrate([200]); }, [canAct]);

  // Reset auto-place flag at the start of each betting round
  useEffect(() => {
    if (phase === 'betting' && myBet === 0) autoPlacedRef.current = false;
  }, [phase, myBet]);
  // Auto-place pending chips when betting deadline expires
  useEffect(() => {
    if (room.bjPhase !== 'betting') return;
    if (!room.bettingDeadline || now < room.bettingDeadline) return;
    if (!canBet || pendingTotal < minBet || autoPlacedRef.current) return;
    autoPlacedRef.current = true;
    setPlacedComposition([...pendingChips]);
    socket.emit('bjPlaceBet', { roomId: room.id, amount: pendingTotal });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, room.bettingDeadline, room.bjPhase]);

  const dealerCards = (phase === 'betting' || phase === 'waiting') ? [] : (room.dealerCards || []);
  const dealer = useMemo(() => {
    const cards = dealerCards;
    return { cards, ...handTotalDisplay(cards) };
  }, [dealerCards]);

  const addChip = (d: ChipDenom) => {
    if (!canBet) return;
    if (pendingTotal + d.v > maxBet) return;
    setPendingChips(s => [...s, d]);
    vibrate(20);
  };
  const clearBet = () => setPendingChips([]);
  const halfBet = () => {
    const target = Math.max(minBet, Math.floor(maxBet / 2));
    setPendingChips(chipsFromAmount(target));
  };
  const allInBet = () => setPendingChips(chipsFromAmount(maxBet));
  const placeBet = () => {
    if (!canBet || pendingTotal < minBet) return;
    setPlacedComposition([...pendingChips]); // snapshot exacto: no se reordena al repartir
    socket.emit('bjPlaceBet', { roomId: room.id, amount: pendingTotal });
  };
  const sendAction = (action: 'Hit' | 'Stand' | 'Double') => {
    socket.emit('bjAction', { roomId: room.id, action });
    vibrate(15);
  };
  const startRound = () => socket.emit('bjStartRound', { roomId: room.id });

  // Chips visibles en el círculo: pendientes mientras apuestas, o la composición exacta apostada.
  const basePlacedChips = placedComposition.length > 0
    ? placedComposition
    : myBet > 0
      ? chipsFromAmount(myPlayer?.bjDoubled ? myBet / 2 : myBet)
      : [];

  const _circleChips = pendingChips.length > 0
    ? pendingChips
    : myPlayer?.bjDoubled
      ? [...basePlacedChips, ...basePlacedChips]
      : basePlacedChips;

  const circleChips = hideLostChips ? [] : _circleChips;

  const circleAmount = pendingChips.length > 0 ? pendingTotal : myBet;

  const continueRound = () => {
    const result = myPlayer?.bjResult;
    setHideLostChips(true); // Forzar que desaparezcan de la mesa ya mismo

    // Calcular offsets para animación de recogida de cartas hacia el zapato
    const shoeRect = shoeRef.current?.getBoundingClientRect();
    if (shoeRect) {
      const sx = shoeRect.left + shoeRect.width / 2;
      const sy = shoeRect.top + shoeRect.height / 2;
      const dc = dealerCardsRef.current?.getBoundingClientRect();
      if (dc) setDealerCollectTarget({ x: sx - (dc.left + dc.width / 2), y: sy - (dc.top + dc.height / 2) });
      const pc = playerCardsRef.current?.getBoundingClientRect();
      if (pc) setPlayerCollectTarget({ x: sx - (pc.left + pc.width / 2), y: sy - (pc.top + pc.height / 2) });
    }
    setCollecting(true);

    if ((result === 'win' || result === 'blackjack' || result === 'push') && myBet > 0) {
      const circle = circleRef.current?.getBoundingClientRect();
      const count = countRef.current?.getBoundingClientRect();
      if (circle && count) {
        let glyphs: ChipDenom[] = [];
        if (result === 'push') glyphs = circleChips;
        else if (result === 'win') glyphs = [...circleChips, ...circleChips];
        else {
          const amount = myBet + Math.abs(myPlayer?.bjDelta || 0);
          glyphs = chipsFromAmount(amount);
        }
        const fromX = circle.left + circle.width / 2;
        const fromY = circle.top + circle.height / 2;
        const toX = count.left + count.width / 2;
        const toY = count.top + count.height / 2;
        const spawned = glyphs.map((d, i) => ({
          id: ++flyIdRef.current, x: fromX, y: fromY, tx: toX, ty: toY, d, delay: i * 0.08,
        }));
        setFlyChips(fc => [...fc, ...spawned]);
        vibrate([60, 40, 120]);
        const ttl = 700 + glyphs.length * 80 + 400;
        const ids = spawned.map(s => s.id);
        setTimeout(() => setFlyChips(fc => fc.filter(c => !ids.includes(c.id))), ttl);
      }
      setTimeout(() => socket.emit('bjContinue', { roomId: room.id }), 600);
    } else {
      setTimeout(() => socket.emit('bjContinue', { roomId: room.id }), 500);
    }
  };
  const openRebuyModal = () => {
    // Preseleccionar tier más cercano al lastBuyIn anterior
    const last = myPlayer?.lastBuyIn || 0;
    const idx = last > 0 ? Math.max(0, STAKE_TIERS.findIndex(t => t >= last)) : 1;
    setRebuyTierIndex(idx === -1 ? STAKE_TIERS.length - 1 : idx);
    setShowRebuyModal(true);
    vibrate(20);
  };
  const confirmRebuy = () => {
    const amount = STAKE_TIERS[rebuyTierIndex];
    socket.emit('bjRebuy', { roomId: room.id, amount });
    setShowRebuyModal(false);
  };

  // --- Reparto secuencial: cuántas cartas mostrar por actor ---
  // dealDone=true → mostrar todas (hits, fin de reparto). Mientras false, se muestran revealedX cartas.
  const [revealedPlayer, setRevealedPlayer] = useState(0);
  const [revealedDealer, setRevealedDealer] = useState(0);
  const [dealDone, setDealDone] = useState(true);
  const dealingRef = useRef(false);

  // --- Resolve: dealer roba carta a carta; el resultado solo se muestra tras la última ---
  const [resolveReady, setResolveReady] = useState(false);
  const [dealerResolveCount, setDealerResolveCount] = useState(99);
  const showResult = phase === 'resolve' && resolveReady;

  const myCards = (phase === 'betting' || phase === 'waiting') ? [] : (myPlayer?.cards || []);
  // Sliced versions for sequential deal animation (dealDone → show all)
  const displayMyCards = dealDone ? myCards : myCards.slice(0, revealedPlayer);
  const displayDealerCards = phase === 'resolve'
    ? dealer.cards.slice(0, dealerResolveCount)
    : (dealDone ? dealer.cards : dealer.cards.slice(0, revealedDealer));
  const myTotals = myPlayer ? handTotalDisplay(displayMyCards) : null;
  const displayDealerTotals = handTotalDisplay(displayDealerCards);

  const canDouble = canAct && myCards.length === 2 && myChips >= myBet * 2;
  const canRebuy = !!myPlayer && myPlayer.isActive && myChips <= 0 && phase !== 'dealing';

  // Fichas disponibles mostradas: restan la apuesta en mesa (ves cuánto te queda en todo momento).
  // En 'resolve' el servidor ya liquidó, así que mostramos el stack real.
  const wager = phase === 'betting' ? (myBet > 0 ? myBet : pendingTotal)
    : phase === 'resolve' ? 0 : myBet;
  const displayedChips = phase === 'resolve' ? myChips : Math.max(0, myChips - wager);

  // --- Anclas para animar fichas (círculo, contador de fichas, zona dealer) ---
  const circleRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLDivElement>(null);
  const dealerRef = useRef<HTMLDivElement>(null);
  const [flyChips, setFlyChips] = useState<{ id: number; x: number; y: number; tx: number; ty: number; d: ChipDenom; delay: number }[]>([]);
  const flyIdRef = useRef(0);
  const lastResolveRef = useRef<string>('');
  const autoPlacedRef = useRef(false);

  // --- Recogida de cartas al Continuar ---
  const [collecting, setCollecting] = useState(false);
  const [dealerCollectTarget, setDealerCollectTarget] = useState({ x: 0, y: 0 });
  const [playerCollectTarget, setPlayerCollectTarget] = useState({ x: 0, y: 0 });
  const shoeRef = useRef<HTMLDivElement>(null);
  const dealerCardsRef = useRef<HTMLDivElement>(null);
  const playerCardsRef = useRef<HTMLDivElement>(null);

  // Resolve: el dealer roba sus cartas una a una; al revelar la última, marca resolveReady → se muestra el resultado.
  // useLayoutEffect: clampa dealerResolveCount a 2 ANTES del primer paint → no se ve el total final un instante.
  useLayoutEffect(() => {
    if (phase !== 'resolve') { setResolveReady(false); setDealerResolveCount(99); return; }
    const total = dealer.cards.length;
    const startCount = Math.min(2, total); // hole + up ya visibles desde dealerAction
    setDealerResolveCount(startCount);
    setResolveReady(false);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let delay = 500;
    for (let c = startCount + 1; c <= total; c++) {
      const cc = c;
      timers.push(setTimeout(() => { setDealerResolveCount(cc); vibrate(15); }, delay));
      delay += 650;
    }
    timers.push(setTimeout(() => setResolveReady(true), delay + 150));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, room.id, myPlayer?.id, dealer.cards.length]);

  // Al revelar la última carta del dealer (resolveReady): pierde → fichas al dealer. Gana/bj → dealer empuja premio al círculo.
  useEffect(() => {
    if (phase !== 'resolve' || !myPlayer || !resolveReady) { if (phase !== 'resolve') lastResolveRef.current = ''; return; }
    const key = `${room.id}:${myPlayer.bjResult}:${myBet}:${myPlayer.bjDelta}`;
    if (lastResolveRef.current === key) return;
    lastResolveRef.current = key;
    const result = myPlayer.bjResult;
    if (!result) return;
    const circle = circleRef.current?.getBoundingClientRect();
    const dealerEl = dealerRef.current?.getBoundingClientRect();
    if (!circle || !dealerEl) return;

    if (result === 'lose') {
      // Fichas del jugador vuelan al dealer
      const glyphs = circleChips.length > 0 ? circleChips : chipsFromAmount(myBet);
      const spawned = glyphs.map((d, i) => ({
        id: ++flyIdRef.current,
        x: circle.left + circle.width / 2, y: circle.top + circle.height / 2,
        tx: dealerEl.left + dealerEl.width / 2, ty: dealerEl.top + dealerEl.height / 2,
        d, delay: i * 0.08,
      }));
      setFlyChips(fc => [...fc, ...spawned]);
      const ttl = 700 + glyphs.length * 80 + 400;
      const ids = spawned.map(s => s.id);
      setTimeout(() => setFlyChips(fc => fc.filter(c => !ids.includes(c.id))), ttl);
    } else if ((result === 'win' || result === 'blackjack') && (myPlayer.bjDelta || 0) > 0) {
      // Dealer empuja fichas de premio hacia el círculo
      const prizeAmount = Math.abs(myPlayer.bjDelta || 0);
      const glyphs = result === 'win' ? circleChips : chipsFromAmount(prizeAmount);
      const spawned = glyphs.map((d, i) => ({
        id: ++flyIdRef.current,
        x: dealerEl.left + dealerEl.width / 2, y: dealerEl.top + dealerEl.height / 2,
        tx: circle.left + circle.width / 2, ty: circle.top + circle.height / 2,
        d, delay: 0.2 + i * 0.08,
      }));
      setFlyChips(fc => [...fc, ...spawned]);
      vibrate([30, 20, 80]);
      const ttl = 300 + 700 + glyphs.length * 80 + 400;
      const ids = spawned.map(s => s.id);
      setTimeout(() => setFlyChips(fc => fc.filter(c => !ids.includes(c.id))), ttl);
    }
    // push: sin animación (solo se devuelve la apuesta, sin fichas nuevas)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, myPlayer?.bjResult, room.id, resolveReady]);

  useEffect(() => {
    if (phase !== 'resolve') setCollecting(false);
  }, [phase]);

  // Si el jugador está busted (sin fichas) al llegar a resolve, continuar automáticamente
  // para no bloquear la UI y mostrar solo el botón de recompra.
  useEffect(() => {
    if (showResult && myChips <= 0 && myPlayer?.isActive) {
      continueRound();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResult, myChips]);

  // Pre-armar el gate en betting/waiting: cartas ocultas ANTES de entrar a playerAction → sin flash.
  // useLayoutEffect para que se aplique antes del paint en la transición de fase.
  useLayoutEffect(() => {
    if (phase === 'betting' || phase === 'waiting') {
      dealingRef.current = false;
      setDealDone(false);
      setRevealedPlayer(0);
      setRevealedDealer(0);
    }
  }, [phase]);

  // Sequential deal: P1 → D1 → P2 → D2 (orden real del blackjack).
  useEffect(() => {
    const fullHand = (myPlayer?.cards || []).filter(c => (c.rank as unknown as string) !== '?');
    if (fullHand.length < 2) return;
    if (phase !== 'playerAction' && phase !== 'dealerAction') return;
    if (dealingRef.current) return;
    dealingRef.current = true;
    setDealDone(false);
    setRevealedPlayer(0);
    setRevealedDealer(0);
    const t1 = setTimeout(() => setRevealedPlayer(1),  200);  // P1
    const t2 = setTimeout(() => setRevealedDealer(1), 750);   // D1
    const t3 = setTimeout(() => setRevealedPlayer(2), 1300);  // P2
    const t4 = setTimeout(() => setRevealedDealer(2), 1850);  // D2
    const t5 = setTimeout(() => setDealDone(true), 2300);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, myPlayer?.id]);

  return (
    <div
      className="text-white select-none overflow-hidden"
      style={{
        // Capa de fondo a PANTALLA COMPLETA (cubre safe-areas: sin franjas negras en standalone).
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(ellipse 130% 80% at 50% 35%, #14743f 0%, #0d4f2c 40%, #07321b 75%, #02110a 100%)',
      }}
    >
      {/* Felt micro-texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.06]"
        style={{ backgroundImage: 'repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.4) 0, rgba(255,255,255,0.4) 1px, transparent 1px, transparent 6px)' }}
      />
      {/* Outer gold rim arc — subtle casino frame */}
      <div
        className="absolute inset-3 rounded-[40px] pointer-events-none"
        style={{ boxShadow: 'inset 0 0 0 2px rgba(217,164,65,0.18), inset 0 0 60px rgba(0,0,0,0.5)' }}
      />

      {/* Contenido a 100dvh (altura visible real): deja la barra de URL del navegador fuera,
          y en standalone el fondo de arriba cubre toda la pantalla. */}
      <div
        className="relative w-full flex flex-col"
        style={{ height: '100dvh', paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >

      {/* Header */}
      <div className="relative flex justify-between items-center px-4 py-2 z-20">
        <button onClick={onLeave} className="text-white/70 text-xs px-3 py-1.5 rounded-full bg-black/35 border border-white/10 backdrop-blur active:scale-95">
          ← Salir
        </button>
        <div className="text-center">
          <div className="text-[10px] font-extrabold tracking-[0.3em] text-amber-200/90">BLACKJACK</div>
          <div className="text-[10px] text-white/50 -mt-0.5">
            Apuesta desde {fmtChips(minBet)} · Paga 6:5
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-white/50 leading-none">{user.name}</div>
          <div className={`font-mono text-xs font-bold ${user.balance < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
            {user.balance < 0 ? `-$${fmtChips(Math.abs(user.balance))}` : `$${fmtChips(user.balance)}`}
          </div>
        </div>
      </div>

      {/* ===== Columna central: SLOTS DE ALTURA FIJA. Nada cambia de tamaño entre fases → nada salta. ===== */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col overflow-hidden">

      {/* Dealer (slot fijo) */}
      <div ref={dealerRef} className="relative flex flex-col items-center pt-1 z-10 shrink-0" style={{ height: 130 }}>
        <div className="text-[9px] uppercase tracking-[0.4em] text-amber-200/70 font-bold mb-1">Dealer</div>
        {/* Zapato — ancla para la recogida de cartas */}
        <div ref={shoeRef} className="absolute right-3 top-1/2 -translate-y-1/2 z-20 pointer-events-none opacity-70">
          <div className="relative" style={{ width: 42, height: 58 }}>
            {[4, 3, 2, 1, 0].map(i => (
              <div key={i} className="absolute" style={{ left: i * 2.5, top: i * 1.5, zIndex: 5 - i }}>
                <PlayingCard hidden className="w-8" style={{ height: 48 }} />
              </div>
            ))}
          </div>
        </div>
        <motion.div
          ref={dealerCardsRef}
          className="relative flex items-center justify-center gap-2"
          style={{ height: 110 }}
          animate={collecting ? { x: dealerCollectTarget.x, y: dealerCollectTarget.y, opacity: 0, scale: 0.3 } : { x: 0, y: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 1, 1] }}
        >
          {dealer.cards.length === 0 ? (
            <div className="w-[72px] h-[108px] rounded-xl border-2 border-dashed border-white/12" />
          ) : (
            <>
              {/* CardFan SIEMPRE montado (aunque vacío) → AnimatePresence anima la PRIMERA carta al añadirse */}
              <CardFan cards={displayDealerCards} big faceDownDeal />
              {displayDealerCards.length >= 2 && (
                <motion.div layout transition={{ layout: { type: 'spring', stiffness: 320, damping: 30 } }} className="self-start mt-1">
                  <TotalPill total={displayDealerTotals.total} soft={displayDealerTotals.soft} bust={displayDealerTotals.bust} hasHidden={displayDealerTotals.hasHidden} accent="amber" />
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      </div>

      {/* ===== Oponentes: entre dealer y mis cartas (Altura reservada permanentemente) ===== */}
      <div className="relative z-10 shrink-0 w-full flex justify-center py-1" style={{ minHeight: 96 }}>
        {opponents.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-2 items-start w-full justify-center">
            {opponents.map((p: Player) => {
              const isTurn = phase === 'playerAction' && p.bjStatus === 'playing';
              const t = handTotalDisplay(p.cards || []);
              const isBust = p.bjStatus === 'bust' || t.bust;
              const result = showResult ? p.bjResult : undefined;
              const opacity = p.isOnline === false ? 0.5 : 1;
              return (
                <motion.div
                  key={p.userId}
                  className={`shrink-0 flex flex-col items-center gap-0.5 px-1.5 pt-1 pb-1 rounded-xl border backdrop-blur transition-colors duration-300 ${isTurn ? 'bg-amber-400/20 border-amber-300/70' : 'bg-black/45 border-white/10'}`}
                  style={{ opacity, minWidth: 88 }}
                >
                  <div className="flex items-center gap-1 self-stretch">
                    <Avatar seed={p.avatar || p.userId} size={16} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-bold truncate leading-tight">{p.name}</div>
                      <div className="text-[8px] text-white/50 font-mono leading-none">{fmtChips(p.chips)}</div>
                    </div>
                    {(p.cards?.length || 0) > 0 && (
                      <TotalPill total={t.total} soft={t.soft} bust={isBust} hasHidden={t.hasHidden}
                        accent={p.bjStatus === 'blackjack' ? 'amber' : 'sky'} size="xs" />
                    )}
                  </div>
                  <div className="flex justify-center items-center" style={{ height: 44 }}>
                    {(p.cards?.length || 0) > 0 ? (
                      <MiniHand cards={p.cards || []} />
                    ) : (
                      <div className="text-[9px] text-white/35 uppercase tracking-wider">
                        {(p.bet || 0) > 0 ? '· apostado ·' : '· esperando ·'}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 justify-center min-h-[12px]">
                    {(p.bet || 0) > 0 && !result && (
                      <span className="text-[8px] font-bold text-yellow-200 bg-yellow-400/10 border border-yellow-300/30 px-1.5 rounded-full leading-tight">
                        {fmtChips(p.bet || 0)}{p.bjDoubled ? '×2' : ''}
                      </span>
                    )}
                    {result && (
                      <span className={`text-[8px] font-extrabold px-1.5 rounded-full leading-tight ${
                        result === 'blackjack' ? 'bg-amber-300 text-amber-950' :
                        result === 'win' ? 'bg-emerald-400 text-emerald-950' :
                        result === 'push' ? 'bg-sky-300 text-sky-950' : 'bg-rose-500 text-white'
                      }`}>
                        {result === 'blackjack' ? 'BJ' : result === 'win' ? 'GANA' : result === 'push' ? '=' : 'PIERDE'}
                      </span>
                    )}
                    {p.bjDelta != null && p.bjDelta !== 0 && showResult && (
                      <span className={`text-[8px] font-mono font-bold ${p.bjDelta > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {p.bjDelta > 0 ? '+' : ''}{fmtChips(p.bjDelta)}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Spacer constante (todos los slots son fijos → este reparto es igual en toda fase) */}
      <div className="flex-1 min-h-0" />

      {/* Cartas del jugador (slot fijo SIEMPRE reservado: placeholder cuando no hay cartas) */}
      <motion.div
        ref={playerCardsRef}
        className="relative z-10 px-4 shrink-0 flex items-center justify-center gap-2"
        style={{ height: 110 }}
        animate={collecting ? { x: playerCollectTarget.x, y: playerCollectTarget.y, opacity: 0, scale: 0.3 } : { x: 0, y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, delay: 0.07, ease: [0.4, 0, 1, 1] }}
      >
        {myPlayer && myCards.length > 0 ? (
          <>
            {/* CardFan SIEMPRE montado (aunque vacío) → AnimatePresence anima la PRIMERA carta al añadirse */}
            <CardFan cards={displayMyCards} big />
            {myTotals && displayMyCards.length >= 2 && (
              <AnimatePresence>
                <motion.div
                  key="player-total"
                  layout
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20, layout: { type: 'spring', stiffness: 320, damping: 30 } }}
                  className="self-start mt-1"
                >
                  <TotalPill total={myTotals.total} soft={myTotals.soft} bust={myTotals.bust} hasHidden={false}
                    accent={myPlayer.bjStatus === 'blackjack' ? 'amber' : 'sky'} />
                </motion.div>
              </AnimatePresence>
            )}
          </>
        ) : (
          <div className="w-[72px] h-[108px] rounded-xl border-2 border-dashed border-white/10" />
        )}
      </motion.div>

      {/* Spacer constante para mantener la distancia idéntica a cuando el texto de estado estaba aquí arriba */}
      <div className="relative z-10 shrink-0 pointer-events-none" style={{ height: 16 }} />

      {/* Rectángulo de apuesta (slot fijo: área de apuesta + texto de estado integrado SIEMPRE reservado → no salta) */}
      <div className="relative flex flex-col items-center z-10 shrink-0 pb-2" style={{ height: 130 }}>
        <motion.div
          ref={circleRef}
          className="relative rounded-[24px] flex items-center justify-center shrink-0 transition-colors duration-500"
          style={{
            width: 270,
            height: 100,
            border: (phase === 'betting' || circleChips.length > 0) ? '2px dashed rgba(255,215,140,0.25)' : '2px dashed transparent',
          }}
          animate={canBet && pendingTotal > 0 ? { scale: [1, 1.04, 1] } : { scale: 1 }}
          transition={{ duration: 1.4, repeat: canBet && pendingTotal > 0 ? Infinity : 0 }}
        >
          <AnimatePresence mode="wait">
            {circleChips.length > 0 ? (
              <motion.div
                key="bet-chips"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.2 }}
                className="flex items-end justify-center gap-1.5"
              >
                <div className="flex items-end justify-center gap-1.5 transition-transform duration-300">
                  <ChipStack chips={circleChips} size={34} />
                </div>

                <AnimatePresence>
                  {showResult && (myPlayer?.bjResult === 'win' || myPlayer?.bjResult === 'blackjack') && myBet > 0 && (myPlayer.bjDelta || 0) > 0 && (
                    <motion.div
                      key="prize-chips"
                      layout
                      initial={{ x: -20, y: -40, opacity: 0, scale: 0.6 }}
                      animate={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.25 }}
                    >
                      <ChipStack chips={myPlayer.bjResult === 'win' ? circleChips : chipsFromAmount(Math.abs(myPlayer.bjDelta || 0))} size={34} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : <span key="empty" />}
          </AnimatePresence>
        </motion.div>

        {/* Estado movido justo debajo del rectángulo de apuestas, integrado en su misma altura (no suma altura total) */}
        <div className="relative flex justify-center items-center pointer-events-none shrink-0" style={{ height: 16 }}>
          {phase === 'waiting' && <div className="text-[10px] text-white/40 uppercase tracking-widest">Esperando</div>}
          {phase === 'betting' && (
            <div className={`text-[10px] uppercase tracking-widest font-bold ${bettingLeft != null && bettingLeft <= 5 ? 'text-red-400' : 'text-amber-200/80'}`}>
              {bettingLeft != null ? `Apuesten · ${bettingLeft}s` : 'Apuesten'}
            </div>
          )}
          {phase === 'dealing' && <div className="text-[10px] text-white/60 uppercase tracking-widest">Repartiendo</div>}
          {phase === 'playerAction' && (
            <div className="text-[10px] text-amber-200 uppercase tracking-widest font-bold">
              {canAct ? 'Tu turno · pide o plántate' : 'Esperando a los demás'}
            </div>
          )}
          {phase === 'dealerAction' && <div className="text-[10px] text-amber-200 uppercase tracking-widest font-bold">Dealer juega</div>}
          {phase === 'resolve' && <div className="text-[10px] text-emerald-200/70 uppercase tracking-widest font-bold">Resultado</div>}
        </div>
      </div>

      </div>{/* fin columna central */}

      {/* ===== Bottom bar: name + chips + actions ===== */}
      {/* shrink-0 + safe-area inferior: los botones nunca quedan bajo el home indicator / barra del navegador */}
      <div
        className="relative z-10 px-4 pt-2 shrink-0"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.0), rgba(0,0,0,0.65))',
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* compact player row */}
        <div className="relative flex items-center gap-2 mb-2">
          <div className="relative shrink-0">
            <Avatar seed={user.avatar} size={32} />
            {canAct && (
              <motion.div
                className="absolute inset-0 rounded-full pointer-events-none"
                animate={{ boxShadow: ['0 0 0 0 rgba(251,191,36,0.55)', '0 0 0 9px rgba(251,191,36,0)'] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold truncate">{user.name}</div>
            <div ref={countRef} className="text-[11px] text-amber-200 font-mono font-bold inline-flex items-center gap-1">
              <AnimatedNumber value={displayedChips} maxDurationMs={650} baseStepMs={6} /> fichas
            </div>
          </div>
          {/* Bet pill — centrada absolutamente en la fila */}
          <div className="absolute inset-x-0 flex justify-center pointer-events-none">
            <AnimatePresence>
              {(circleAmount > 0 || (showResult && myPlayer?.bjDelta != null && myPlayer.bjDelta !== 0)) && (
                <motion.div
                  key="bet-pill"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                  className={`px-2.5 py-1 rounded-full font-mono font-bold text-[11px] border ${
                    showResult && myPlayer?.bjDelta != null
                      ? myPlayer.bjDelta > 0
                        ? 'bg-emerald-400/20 border-emerald-300/50 text-emerald-200'
                        : 'bg-rose-500/20 border-rose-400/50 text-rose-200'
                      : 'bg-yellow-400/20 border-yellow-300/40 text-yellow-100'
                  }`}
                >
                  {showResult && myPlayer?.bjDelta != null
                    ? `${myPlayer.bjDelta > 0 ? '+' : ''}${fmtChips(myPlayer.bjDelta)}`
                    : fmtChips(circleAmount)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Action area — altura CONSTANTE (no salta). Los controles RELLENAN el espacio
            (botones más grandes) para no desperdiciar el fondo. */}
        <div style={{ height: 132 }} className="flex flex-col">
          {/* Sin fichas → recompra (prioritario). */}
          {canRebuy && (
            <button onClick={openRebuyModal}
              className="flex-1 w-full bg-gradient-to-b from-rose-400 to-rose-600 text-white font-extrabold rounded-2xl tracking-wider shadow-lg active:scale-95">
              RECOMPRAR
            </button>
          )}
          {!canRebuy && phase === 'waiting' && !myPlayer?.isSpectating && myChips > 0 && (
            <button onClick={startRound}
              className="flex-1 w-full bg-gradient-to-b from-sky-400 to-sky-600 text-white font-extrabold rounded-2xl tracking-wider shadow-lg active:scale-95">
              EMPEZAR
            </button>
          )}

          {!canRebuy && phase === 'betting' && canBet && (
            <div className="flex-1 flex flex-col gap-2 justify-center">
              <ChipRail page={chipPage} setPage={setChipPage} onAdd={addChip} maxBet={maxBet} pendingTotal={pendingTotal} canBet={!!canBet} />
              <div className="grid grid-cols-4 gap-1.5">
                <button onClick={clearBet} disabled={pendingTotal === 0}
                  className="py-3 rounded-2xl bg-white/8 border border-white/15 text-[11px] font-bold text-white/80 active:scale-95 disabled:opacity-30">BORRAR</button>
                <button onClick={allInBet}
                  className="py-3 rounded-2xl bg-white/8 border border-white/15 text-[11px] font-bold text-white/80 active:scale-95">MAX</button>
                {lastBet > 0 && lastBet <= maxBet ? (
                  <button onClick={() => setPendingChips(chipsFromAmount(lastBet))}
                    className="py-3 rounded-2xl bg-yellow-400/20 border border-yellow-300/40 text-[11px] font-bold text-yellow-100 active:scale-95 leading-tight">
                    REBET<br/><span className="text-[9px] opacity-80">{fmtChips(lastBet)}</span></button>
                ) : (
                  <button onClick={halfBet}
                    className="py-3 rounded-2xl bg-white/8 border border-white/15 text-[11px] font-bold text-white/80 active:scale-95">½</button>
                )}
                <button onClick={placeBet} disabled={pendingTotal < minBet}
                  className="py-3 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-extrabold text-[12px] tracking-wider shadow-lg active:scale-95 disabled:active:scale-100">LISTO</button>
              </div>
            </div>
          )}
          {!canRebuy && phase === 'betting' && myBet > 0 && (
            <div className="flex-1 flex items-center justify-center text-[11px] text-white/50">
              Apostado · esperando al resto{bettingLeft != null ? ` · ${bettingLeft}s` : ''}
            </div>
          )}
          {!canRebuy && phase === 'betting' && myPlayer?.isSpectating && (
            <div className="flex-1 flex items-center justify-center text-[11px] text-white/50">Te unes en la próxima ronda</div>
          )}

          {phase === 'playerAction' && canAct && (
            <div className="flex-1 grid grid-cols-3 gap-2 items-stretch">
              <ActionBtn label="CARTA" onClick={() => sendAction('Hit')} disabled={!dealDone} from="#34d399" to="#059669" />
              <ActionBtn label="PLANTAR" onClick={() => sendAction('Stand')} disabled={!dealDone} from="#f87171" to="#b91c1c" />
              <ActionBtn label="DOBLAR" onClick={() => sendAction('Double')} disabled={!dealDone || !canDouble} from="#fbbf24" to="#b45309" />
            </div>
          )}
          {phase === 'playerAction' && !canAct && (
            <div className="flex-1 flex items-center justify-center text-[11px] text-white/40">
              {myPlayer?.bjStatus === 'bust' ? 'Te pasaste · esperando al dealer' : 'Plantado · esperando a los demás'}
            </div>
          )}
          {(phase === 'dealerAction' || (phase === 'resolve' && !resolveReady)) && (
            <div className="flex-1 flex items-center justify-center text-[11px] text-amber-200/80 font-semibold tracking-wide">El dealer juega...</div>
          )}
          {showResult && !canRebuy && (
            <button onClick={continueRound}
              className={`flex-1 w-full font-extrabold rounded-2xl tracking-wider shadow-lg active:scale-95 flex flex-col items-center justify-center gap-0.5 ${
                myPlayer?.bjResult === 'win' || myPlayer?.bjResult === 'blackjack'
                  ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white'
                  : myPlayer?.bjResult === 'lose'
                  ? 'bg-gradient-to-b from-slate-500 to-slate-700 text-white'
                  : myPlayer?.bjResult === 'push'
                  ? 'bg-gradient-to-b from-sky-400 to-sky-600 text-white'
                  : 'bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950'
              }`}>
              {myPlayer?.bjResult === 'blackjack' && <span className="text-sm font-black leading-none">BLACKJACK!</span>}
              {myPlayer?.bjResult === 'win' && <span className="text-sm font-black leading-none">GANAS</span>}
              {myPlayer?.bjResult === 'lose' && <span className="text-sm font-black leading-none">PIERDES</span>}
              {myPlayer?.bjResult === 'push' && <span className="text-sm font-black leading-none">EMPATE</span>}
              <span className="text-base leading-none">CONTINUAR</span>
            </button>
          )}
          {phase === 'dealing' && (
            <div className="flex-1 flex items-center justify-center text-[11px] text-white/50">Repartiendo...</div>
          )}
        </div>
      </div>
      </div>{/* fin contenido 100dvh */}

      {/* ===== Capa de vuelo de fichas (win→cuenta / lose→dealer) ===== */}
      <div className="fixed inset-0 pointer-events-none z-50">
        <AnimatePresence>
          {flyChips.map(fc => (
            <motion.div
              key={fc.id}
              initial={{ x: fc.x, y: fc.y, opacity: 0, scale: 0.5 }}
              animate={{ x: fc.tx, y: fc.ty, opacity: [0, 1, 1, 0], scale: [0.5, 1, 1, 0.6] }}
              transition={{ duration: 0.7, delay: fc.delay, ease: [0.4, 0, 0.2, 1], times: [0, 0.15, 0.8, 1] }}
              style={{ position: 'absolute', left: 0, top: 0, marginLeft: -18, marginTop: -18 }}
            >
              <Chip d={fc.d} size={34} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {/* ===== Modal recompra ===== */}
      <AnimatePresence>
        {showRebuyModal && (
          <motion.div
            className="fixed inset-0 z-[60] bg-black/80 flex items-end justify-center pb-safe"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowRebuyModal(false)}
          >
            <motion.div
              className="w-full max-w-sm bg-[#1a2a1a] rounded-t-3xl p-6 border-t border-white/10"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              onClick={e => e.stopPropagation()}
            >
              <p className="text-center text-xs text-white/50 mb-4 uppercase tracking-wider">¿Con cuánto recompras?</p>
              <div className="text-center mb-5">
                <p className="text-5xl font-extrabold text-rose-300">{fmtChips(STAKE_TIERS[rebuyTierIndex])}</p>
                <p className="text-xs text-white/40 mt-1">fichas</p>
              </div>
              <Slider min={0} max={STAKE_TIERS.length - 1} step={1} value={rebuyTierIndex} onChange={v => setRebuyTierIndex(v)} accent="rose" formatLabel={v => fmtChips(STAKE_TIERS[v])} />
              <div className="flex justify-between px-1 mb-6 mt-1">
                {STAKE_TIERS.map((t, i) => (
                  <button key={i} onClick={() => setRebuyTierIndex(i)} className={`text-[9px] ${i === rebuyTierIndex ? 'text-white font-bold' : 'text-white/35'}`}>{fmtChips(t)}</button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowRebuyModal(false)} className="flex-1 py-3 rounded-2xl border border-white/20 text-white/60 font-bold text-sm active:scale-95">
                  Cancelar
                </button>
                <button onClick={confirmRebuy} className="flex-1 py-3 rounded-2xl bg-gradient-to-b from-rose-400 to-rose-600 text-white font-extrabold text-sm shadow-lg active:scale-95">
                  RECOMPRAR
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ActionBtn = ({ label, onClick, disabled, from, to }: { label: string; onClick: () => void; disabled?: boolean; from: string; to: string }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="h-full min-h-[52px] flex items-center justify-center rounded-2xl font-extrabold text-white shadow-lg active:scale-95 disabled:opacity-35 disabled:active:scale-100 text-[13px] tracking-wider"
    style={{ background: `linear-gradient(180deg, ${from}, ${to})` }}
  >
    {label}
  </button>
);

export default BlackjackTable;
