import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket, fmtChips, vibrate } from '../utils';
import PlayingCard from './PlayingCard';
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
type ChipDenom = { v: number; color: string; ring: string; label: string };

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
  { v: 100000, color: '#d946ef', ring: '#701a75', label: '100k' },
  { v: 200000, color: '#14b8a6', ring: '#115e59', label: '200k' },
  { v: 250000, color: '#facc15', ring: '#854d0e', label: '250k' },
  { v: 500000, color: '#fb7185', ring: '#9f1239', label: '500k' },
];

const defByValue = (v: number): ChipDenom => CHIP_DEFS.find(d => d.v === v) || CHIP_DEFS[0];

// Pages overlap on purpose so adjacent scales share a chip or two.
const CHIP_PAGE_VALUES: number[][] = [
  [25, 50, 100, 250, 500],
  [500, 1000, 2500, 5000, 10000],
  [5000, 10000, 25000, 50000, 100000],
  [50000, 100000, 200000, 250000, 500000],
];
const CHIP_PAGES = CHIP_PAGE_VALUES.length;

// Default page scaled to a stack (umbrales fijos por buy-in):
//  <=1k → p0 | <=25k → p1 (5k,10k,25k) | <=100k → p2 (50k,100k) | resto → p3 (250k,500k)
const pageForAmount = (amount: number): number => {
  if (amount <= 1000) return 0;
  if (amount <= 25000) return 1;
  if (amount <= 100000) return 2;
  return 3;
};

const isPlaque = (v: number) => v >= 1000;
const isSmooth = (v: number) => v >= 100000; // smooth border, no stripes

// Physical diameter/height by denomination.
const sizeForValue = (v: number): number => {
  if (v < 100) return 30;
  if (v < 500) return 33;
  if (v < 1000) return 35;
  if (v < 10000) return 38;
  if (v < 100000) return 41;
  return 45;
};

const Chip = ({ d, size }: { d: ChipDenom; size?: number }) => {
  const h = size ?? sizeForValue(d.v);
  const plaque = isPlaque(d.v);
  const smooth = isSmooth(d.v);
  const w = plaque ? Math.round(h * 1.28) : h;
  const radius = plaque ? 6 : 9999;
  const innerRadius = plaque ? 3 : 9999;
  const fontSize = d.label.length >= 4 ? h * 0.26 : h * 0.3;
  return (
    <div
      className="flex items-center justify-center font-extrabold text-white relative"
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
  const chipW = (v: number) => (v >= 1000 ? Math.round(size * 1.28) : size);
  const pileW = Math.max(size, ...items.map(d => chipW(d.v)));
  return (
    <div className="relative" style={{ width: pileW, height: size + items.length * 4 }}>
      {items.map((d, i) => (
        <motion.div
          key={i}
          initial={{ y: -40, opacity: 0, scale: 0.7 }}
          animate={{ y: -(i * 4), opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 360, damping: 22 }}
          style={{ position: 'absolute', left: (pileW - chipW(d.v)) / 2, bottom: 0, zIndex: i }}
        >
          <Chip d={d} size={size} />
        </motion.div>
      ))}
    </div>
  );
};

// Betting circle stack: round chips and square plaques go in SEPARATE piles (never mixed).
const ChipStack = ({ chips, size = 36 }: { chips: ChipDenom[]; size?: number }) => {
  const rounds = chips.filter(c => c.v < 1000);
  const plaques = chips.filter(c => c.v >= 1000);
  return (
    <div className="flex items-end justify-center gap-1.5">
      {rounds.length > 0 && <ChipPile items={rounds} size={size} />}
      {plaques.length > 0 && <ChipPile items={plaques} size={size} />}
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
const CardFan = ({ cards, big = false, faceDownDeal = false }: { cards: Card[]; big?: boolean; faceDownDeal?: boolean }) => {
  const cardW = big ? 72 : 50;
  const cardH = big ? 108 : 72;
  const cls = big ? 'w-[72px] h-[108px]' : 'w-[50px] h-[72px]';
  const n = cards.length;
  const step = n <= 1 ? cardW : Math.round(cardW * 0.62);
  const containerW = cardW + step * (n - 1);
  return (
    <div className="relative" style={{ width: Math.max(cardW, containerW), height: cardH }}>
      <AnimatePresence initial={false}>
        {cards.map((c, i) => {
          const hidden = (c.rank as unknown as string) === '?';
          return (
            <motion.div
              key={`${i}-${c.rank}-${c.suit}`}
              initial={{ x: -120, y: -160, opacity: 0, rotate: -15 }}
              animate={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 230, damping: 22, delay: faceDownDeal ? i * 0.18 : i * 0.1 }}
              style={{
                position: 'absolute',
                left: i * step,
                top: 0,
                zIndex: i,
              }}
            >
              <PlayingCard rank={c.rank} suit={c.suit} hidden={hidden} className={cls} compact />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

const ResultBadge = ({ result, big = false }: { result?: string; big?: boolean }) => {
  const map: Record<string, { txt: string; from: string; to: string; text: string }> = {
    blackjack: { txt: 'BLACKJACK!', from: '#fde047', to: '#f59e0b', text: '#451a03' },
    win:       { txt: 'GANAS',      from: '#34d399', to: '#059669', text: '#022c22' },
    lose:      { txt: 'PIERDES',    from: '#fb7185', to: '#be123c', text: '#fff'    },
    push:      { txt: 'EMPATE',     from: '#7dd3fc', to: '#0284c7', text: '#082f49' },
  };
  if (!result || !map[result]) return null;
  const m = map[result];
  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      className={`rounded-full font-black tracking-wider shadow-2xl ${big ? 'px-5 py-1.5 text-lg' : 'px-3 py-1 text-xs'}`}
      style={{
        background: `linear-gradient(135deg, ${m.from}, ${m.to})`,
        color: m.text,
        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
        boxShadow: `0 0 30px ${m.from}66, 0 8px 20px rgba(0,0,0,0.5)`,
      }}
    >
      {m.txt}
    </motion.div>
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
  const phase = room.bjPhase || 'waiting';
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
  useEffect(() => {
    if (phase === 'betting' && myBet === 0) { setPendingChips([]); setPlacedComposition([]); }
    else if (phase === 'waiting') { setPendingChips([]); setPlacedComposition([]); }
  }, [phase, room.id, myBet]);
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
  const bettingLeft = room.bettingDeadline ? Math.max(0, Math.ceil((room.bettingDeadline - now) / 1000)) : null;

  useEffect(() => { if (canAct) vibrate([200]); }, [canAct]);

  const dealer = useMemo(() => {
    const cards = room.dealerCards || [];
    return { cards, ...handTotalDisplay(cards) };
  }, [room.dealerCards]);

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
  const continueRound = () => socket.emit('bjContinue', { roomId: room.id });
  const rebuy = () => { socket.emit('bjRebuy', { roomId: room.id }); vibrate(20); };

  const myTotals = myPlayer ? handTotalDisplay(myPlayer.cards || []) : null;

  // Chips visibles en el círculo: pendientes mientras apuestas, o la composición exacta apostada.
  const circleChips = pendingChips.length > 0
    ? pendingChips
    : myBet > 0
      ? (placedComposition.length > 0 ? placedComposition : chipsFromAmount(myBet))
      : [];
  const circleAmount = pendingChips.length > 0 ? pendingTotal : myBet;

  const canDouble = canAct && (myPlayer?.cards?.length || 0) === 2 && myChips >= myBet * 2;
  const canRebuy = !!myPlayer && myChips <= 0 && (phase === 'waiting' || phase === 'betting' || phase === 'resolve');

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

  // Al entrar en 'resolve': lanza fichas del círculo a tu cuenta (ganas/empate) o al dealer (pierdes).
  useEffect(() => {
    if (phase !== 'resolve' || !myPlayer) { if (phase !== 'resolve') lastResolveRef.current = ''; return; }
    const key = `${room.id}:${myPlayer.bjResult}:${myBet}:${myPlayer.bjDelta}`;
    if (lastResolveRef.current === key) return;
    lastResolveRef.current = key;
    const result = myPlayer.bjResult;
    if (!result) return;
    const circle = circleRef.current?.getBoundingClientRect();
    const count = countRef.current?.getBoundingClientRect();
    const dealerEl = dealerRef.current?.getBoundingClientRect();
    if (!circle) return;
    const toDealer = result === 'lose';
    const targetRect = toDealer ? dealerEl : count;
    if (!targetRect) return;
    // Importe que se mueve: gano = apuesta + ganancia; empate = apuesta; pierdo = apuesta.
    const amount = result === 'lose' ? myBet
      : result === 'push' ? myBet
      : myBet + Math.abs(myPlayer.bjDelta || myBet); // win/blackjack: vuelve apuesta + premio
    const glyphs = chipsFromAmount(amount);
    const fromX = circle.left + circle.width / 2;
    const fromY = circle.top + circle.height / 2;
    const toX = targetRect.left + targetRect.width / 2;
    const toY = targetRect.top + targetRect.height / 2;
    const spawned = glyphs.map((d, i) => ({
      id: ++flyIdRef.current, x: fromX, y: fromY, tx: toX, ty: toY, d, delay: i * 0.08,
    }));
    setFlyChips(fc => [...fc, ...spawned]);
    if (result !== 'lose') vibrate([60, 40, 120]);
    const ttl = 700 + glyphs.length * 80 + 400;
    const ids = spawned.map(s => s.id);
    setTimeout(() => setFlyChips(fc => fc.filter(c => !ids.includes(c.id))), ttl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, myPlayer?.bjResult, room.id]);

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
            Apuesta desde {fmtChips(minBet)} · Paga 3:2
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
        <div className="relative flex items-center justify-center gap-2" style={{ height: 110 }}>
          {dealer.cards.length === 0 ? (
            <div className="w-[72px] h-[108px] rounded-xl border-2 border-dashed border-white/12" />
          ) : (
            <>
              <CardFan cards={dealer.cards} big faceDownDeal />
              <div className="self-start mt-1">
                <TotalPill total={dealer.total} soft={dealer.soft} bust={dealer.bust} hasHidden={dealer.hasHidden} accent="amber" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== Oponentes: entre dealer y mis cartas ===== */}
      {opponents.length > 0 && (
        <div className="relative z-10 shrink-0 w-full flex justify-center py-1">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-2 items-start">
            {opponents.map((p: Player) => {
              const isTurn = phase === 'playerAction' && p.bjStatus === 'playing';
              const t = handTotalDisplay(p.cards || []);
              const isBust = p.bjStatus === 'bust' || t.bust;
              const result = phase === 'resolve' ? p.bjResult : undefined;
              const opacity = p.isOnline === false ? 0.5 : 1;
              return (
                <motion.div
                  key={p.userId}
                  animate={isTurn ? { boxShadow: ['0 0 0 0 rgba(251,191,36,0)', '0 0 16px rgba(251,191,36,0.5)', '0 0 0 0 rgba(251,191,36,0)'] } : {}}
                  transition={{ duration: 1.5, repeat: isTurn ? Infinity : 0 }}
                  className={`shrink-0 flex flex-col items-center gap-0.5 px-1.5 pt-1 pb-1 rounded-xl border backdrop-blur ${isTurn ? 'bg-amber-400/20 border-amber-300/70' : 'bg-black/45 border-white/10'}`}
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
                    {p.bjDelta != null && p.bjDelta !== 0 && phase === 'resolve' && (
                      <span className={`text-[8px] font-mono font-bold ${p.bjDelta > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {p.bjDelta > 0 ? '+' : ''}{fmtChips(p.bjDelta)}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Spacer constante (todos los slots son fijos → este reparto es igual en toda fase) */}
      <div className="flex-1 min-h-0" />

      {/* Cartas del jugador (slot fijo SIEMPRE reservado: placeholder cuando no hay cartas) */}
      <div className="relative z-10 px-4 shrink-0 flex items-center justify-center gap-2" style={{ height: 110 }}>
        {myPlayer && (myPlayer.cards?.length || 0) > 0 ? (
          <>
            <CardFan cards={myPlayer.cards || []} big />
            {myTotals && (
              <div className="self-start mt-1">
                <TotalPill total={myTotals.total} soft={myTotals.soft} bust={myTotals.bust} hasHidden={false}
                  accent={myPlayer.bjStatus === 'blackjack' ? 'amber' : 'sky'} />
              </div>
            )}
          </>
        ) : (
          <div className="w-[72px] h-[108px] rounded-xl border-2 border-dashed border-white/10" />
        )}
      </div>

      {/* Estado (slot fijo) */}
      <div className="relative z-10 flex justify-center items-center pointer-events-none shrink-0" style={{ height: 16 }}>
        {phase === 'waiting' && <div className="text-[10px] text-white/40 uppercase tracking-widest">Esperando</div>}
        {phase === 'betting' && (
          <div className="text-[10px] text-amber-200/80 uppercase tracking-widest font-bold">
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

      {/* Círculo de apuesta (slot fijo: círculo + línea de importe SIEMPRE reservada → no salta al apostar) */}
      <div className="relative flex flex-col items-center z-10 shrink-0 pb-2" style={{ height: 120 }}>
        <motion.div
          ref={circleRef}
          className="relative rounded-full flex items-center justify-center shrink-0"
          style={{
            width: 100,
            height: 100,
            border: '2px dashed rgba(255,215,140,0.55)',
            background: 'radial-gradient(circle at 50% 35%, rgba(255,215,140,0.10), rgba(0,0,0,0.25))',
            boxShadow: '0 0 30px rgba(0,0,0,0.5), inset 0 0 30px rgba(0,0,0,0.4)',
          }}
          animate={canBet && pendingTotal > 0 ? { scale: [1, 1.04, 1] } : { scale: 1 }}
          transition={{ duration: 1.4, repeat: canBet && pendingTotal > 0 ? Infinity : 0 }}
        >
          {circleChips.length > 0 && phase !== 'resolve' ? (
            <ChipStack chips={circleChips} size={34} />
          ) : (
            <span className="text-[9px] text-white/30 uppercase tracking-[0.25em] font-bold">Apuesta</span>
          )}
          {/* Banner de resultado sobre el círculo */}
          {phase === 'resolve' && myPlayer?.bjResult && (
            <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ top: -16 }}>
              <ResultBadge result={myPlayer.bjResult} big />
            </div>
          )}
        </motion.div>
        {/* Línea de importe: altura fija reservada siempre (el círculo nunca se mueve) */}
        <div className="h-6 flex items-center justify-center mt-1">
          {phase === 'resolve' ? (
            myPlayer?.bjDelta != null && myPlayer.bjDelta !== 0 ? (
              <span className={`font-mono font-extrabold text-base ${myPlayer.bjDelta > 0 ? 'text-emerald-300' : 'text-rose-300'}`}
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                {myPlayer.bjDelta > 0 ? '+' : ''}{fmtChips(myPlayer.bjDelta)}
              </span>
            ) : null
          ) : circleAmount > 0 ? (
            <span className="text-yellow-200 font-mono font-bold text-sm">
              {fmtChips(circleAmount)}{myPlayer?.bjDoubled ? ' ×2' : ''}
            </span>
          ) : null}
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
        <div className="flex items-center gap-2 mb-2">
          <div className="relative">
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
        </div>

        {/* Action area — altura CONSTANTE (no salta). Los controles RELLENAN el espacio
            (botones más grandes) para no desperdiciar el fondo. */}
        <div style={{ height: 132 }} className="flex flex-col">
          {/* Sin fichas → recompra (prioritario). */}
          {canRebuy && (
            <button onClick={rebuy}
              className="flex-1 w-full bg-gradient-to-b from-rose-400 to-rose-600 text-white font-extrabold rounded-2xl tracking-wider shadow-lg active:scale-95">
              RECOMPRAR {fmtChips(myPlayer?.lastBuyIn || 1000)}
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
                  className="py-3 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-extrabold text-[12px] tracking-wider shadow-lg active:scale-95 disabled:active:scale-100">REPARTIR</button>
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
              <ActionBtn label="CARTA" onClick={() => sendAction('Hit')} from="#34d399" to="#059669" />
              <ActionBtn label="PLANTAR" onClick={() => sendAction('Stand')} from="#f87171" to="#b91c1c" />
              <ActionBtn label="DOBLAR" onClick={() => sendAction('Double')} disabled={!canDouble} from="#fbbf24" to="#b45309" />
            </div>
          )}
          {phase === 'playerAction' && !canAct && (
            <div className="flex-1 flex items-center justify-center text-[11px] text-white/40">
              {myPlayer?.bjStatus === 'bust' ? 'Te pasaste · esperando al dealer' : 'Plantado · esperando a los demás'}
            </div>
          )}
          {phase === 'dealerAction' && (
            <div className="flex-1 flex items-center justify-center text-[11px] text-amber-200/80 font-semibold tracking-wide">El dealer juega...</div>
          )}
          {phase === 'resolve' && (
            <button onClick={continueRound}
              className="flex-1 w-full bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 font-extrabold rounded-2xl tracking-wider shadow-lg active:scale-95">
              CONTINUAR
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
