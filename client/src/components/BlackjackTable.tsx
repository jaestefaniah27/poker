import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket, fmtChips, vibrate, STAKE_TIERS } from '../utils';
import PlayingCard from './PlayingCard';
import Slider from './Slider';
import Avatar from './Avatar';
import AnimatedNumber from './AnimatedNumber';
import type { Room, Player, Card } from '../../../shared/types';
import type { ChipDenom } from './Chips';
import { CHIP_DEFS, CHIP_PAGES, CHIP_PAGE_VALUES, defByValue, chipsFromAmount, Chip, CustomChipControl, ChipRail, ChipPile, ChipStack, pageForAmount } from './Chips';


interface Props {
  room: Room;
  user: { id: string; name: string; balance: number; avatar: string; hasPassword: boolean; level?: number };
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
const CardFan = ({ cards, big = false, mini = false, micro = false, faceDownDeal = false }: { cards: Card[]; big?: boolean; mini?: boolean; micro?: boolean; faceDownDeal?: boolean }) => {
  const cardW = micro ? 32 : (mini ? 38 : (big ? 72 : 50));
  const cardH = micro ? 44 : (mini ? 54 : (big ? 108 : 72));
  const cls = micro ? 'w-[32px] h-[44px]' : (mini ? 'w-[38px] h-[54px]' : (big ? 'w-[72px] h-[108px]' : 'w-[50px] h-[72px]'));
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
                ? { opacity: 1, x: 0, y: 0 }
                : { x: 90, y: -70, opacity: 0 }}
              animate={{ x: 0, y: 0, opacity: 1 }}
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
                initial={isFlipReveal ? { rotateY: -90, rotate: 0 } : { rotateY: 0, rotate: 14 }}
                animate={{ rotateY: 0, rotate: 0 }}
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
const MiniHand = ({ cards, size = 'mini' }: { cards: Card[], size?: 'mini' | 'micro' }) => {
  const n = cards.length;
  const cw = size === 'micro' ? 24 : 32;
  const ch = size === 'micro' ? 34 : 44;
  const step = size === 'micro' ? 12 : 16;
  const cardCls = size === 'micro' ? 'w-6 h-[34px]' : 'w-8 h-11';
  return (
    <div className="relative" style={{ width: cw + step * Math.max(0, n - 1), height: ch }}>
      {cards.map((c, i) => {
        const hidden = (c.rank as unknown as string) === '?';
        return (
          <div key={i} className="absolute" style={{ left: i * step, top: 0, zIndex: i }}>
            <PlayingCard rank={c.rank} suit={c.suit} hidden={hidden} compact className={cardCls} />
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

  const initialNetWorthRef = useRef<number | null>(null);
  const lastValidDiffRef = useRef<number>(0);

  if (myPlayer) {
    if (initialNetWorthRef.current === null) {
      initialNetWorthRef.current = user.balance + myPlayer.chips + (myPlayer.bet || 0);
    }
    // Solo actualizamos el diff cuando la fase real del servidor es betting o waiting.
    // Si la fase local es betting (porque le dimos a Continuar) pero el servidor sigue en resolve,
    // myPlayer.bet aún tiene la apuesta vieja y causaría un pico temporal erróneo.
    if ((phase === 'betting' && rawPhase === 'betting') || phase === 'waiting') {
      const currentNetWorth = user.balance + myPlayer.chips + (myPlayer.bet || 0);
      lastValidDiffRef.current = currentNetWorth - (initialNetWorthRef.current || currentNetWorth);
    }
  }

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
      if (myPlayer.bjResult === 'lose' || myPlayer.bjStatus === 'bust' || myPlayer.bjResult === 'surrender') {
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
    if (pendingChips.length >= 16) return; // Strict limit: max 16 chips per bet to prevent overflow
    
    // Limitar visualmente para que no se salgan del rectángulo
    const newChips = [...pendingChips, d];
    const rounds = newChips.filter(c => c.v < 1000 && !c.isCustom);
    const plaques = newChips.filter(c => !c.premium && c.v >= 1000 && c.v < 100000 && !c.isCustom);
    const larges = newChips.filter(c => (c.premium || c.v >= 100000) && !c.isCustom);
    const customs = newChips.filter(c => c.isCustom);

    const roundCols = Math.ceil(rounds.length / 20); // 10 fichas * 2 filas = 20 por columna
    const plaqueCols = Math.ceil(plaques.length / 20);
    const largeCols = Math.ceil(larges.length / 8);
    const customCols = Math.ceil(customs.length / 2);

    if (largeCols > 2) return; // Límite estricto de 2 columnas para fichas grandes

    const totalCols = roundCols + plaqueCols + largeCols + customCols;
    const totalW = roundCols * 36 + plaqueCols * 46 + largeCols * 56 + customCols * 60 + Math.max(0, totalCols - 1) * 6;

    if (totalW > 220) return; // Límite de anchura visual de la zona de apuestas

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
  const sendAction = (action: 'Hit' | 'Stand' | 'Double' | 'Surrender' | 'Split') => {
    socket.emit('bjAction', { roomId: room.id, action });
    vibrate(15);
  };
  const startRound = () => socket.emit('bjStartRound', { roomId: room.id });

  // --- Resolve: dealer roba carta a carta; el resultado solo se muestra tras la última ---
  const [resolveReady, setResolveReady] = useState(false);
  const [dealerResolveCount, setDealerResolveCount] = useState(99);
  const showResult = phase === 'resolve' && resolveReady;
  const [prizeArrived, setPrizeArrived] = useState(false);

  useEffect(() => {
    if (phase === 'betting') setPrizeArrived(false);
  }, [phase]);

  const myHands = (phase === 'betting' || phase === 'waiting') ? [] : (myPlayer?.bjHands || (myPlayer?.cards?.length ? [{ cards: myPlayer.cards, bet: myBet, status: myPlayer?.bjStatus || 'playing' }] : []));
  const activeHandIndex = Math.min(myPlayer?.bjActiveHandIndex ?? 0, Math.max(0, myHands.length - 1));

  const originalBetAmount = (myHands.length > 0 && myHands[0])
    ? ((myHands[0] as any).doubled ? myHands[0].bet / 2 : myHands[0].bet)
    : (myPlayer?.bjDoubled ? myBet / 2 : myBet);

  const basePlacedChips = placedComposition.length > 0
    ? placedComposition
    : originalBetAmount > 0
      ? chipsFromAmount(originalBetAmount)
      : [];

  let _circleChips = pendingChips.length > 0 ? pendingChips : [];
  if (pendingChips.length === 0) {
    if (myHands.length > 0) {
      _circleChips = [];
      myHands.forEach((h: any) => {
        if (!h) return;
        _circleChips.push(...basePlacedChips);
        if (h.doubled) _circleChips.push(...basePlacedChips);
      });
    } else {
      _circleChips = myPlayer?.bjDoubled ? [...basePlacedChips, ...basePlacedChips] : basePlacedChips;
    }
  }

  let finalCircleChips = _circleChips;
  if (showResult && prizeArrived && (myPlayer?.bjResult === 'win' || myPlayer?.bjResult === 'blackjack') && myBet > 0 && (myPlayer?.bjDelta || 0) > 0) {
    // Cuando el dealer paga, compactamos la apuesta original + el premio en las fichas más grandes
    // para evitar que la suma de dos montones pequeños sature y desborde el área visual.
    finalCircleChips = chipsFromAmount(myBet + (myPlayer?.bjDelta || 0));
  }

  const circleChips = hideLostChips ? [] : finalCircleChips;

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
        const glyphs = circleChips;
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

  const myCards = myHands.length > 0 ? (myHands[activeHandIndex]?.cards || []) : [];
  const displayMyCards = dealDone ? myCards : myCards.slice(0, revealedPlayer);
  const displayDealerCards = phase === 'resolve'
    ? dealer.cards.slice(0, dealerResolveCount)
    : (dealDone ? dealer.cards : dealer.cards.slice(0, revealedDealer));
  const displayDealerTotals = handTotalDisplay(displayDealerCards);

  const totalBet = myHands.reduce((acc: number, h: any) => acc + h.bet, 0);
  const activeHandBet = myHands.length > 0 ? (myHands[activeHandIndex]?.bet ?? myBet) : myBet;
  const canDoubleHand = canAct && myCards.length === 2 && myChips >= totalBet + activeHandBet;

  const isPair = myCards.length === 2 && myCards[0].rank === myCards[1].rank;
  const canSplit = canAct && isPair && myHands.length < 4 && myChips >= totalBet + activeHandBet;

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

  // Congelar el contador de fichas durante el reveal del dealer + vuelo de fichas.
  // Se captura el valor pre-resolve y se descongela cuando las fichas aterrizan.
  const [frozenChips, setFrozenChips] = useState<number | null>(null);
  const lastNonResolveChipsRef = useRef<number>(0);
  if (phase !== 'resolve') lastNonResolveChipsRef.current = displayedChips;
  useEffect(() => {
    if (phase === 'resolve') setFrozenChips(lastNonResolveChipsRef.current);
    else setFrozenChips(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, room.id]);

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
      setTimeout(() => setFrozenChips(null), ttl + 100);
    } else if ((result === 'win' || result === 'blackjack') && (myPlayer.bjDelta || 0) > 0) {
      // Dealer empuja fichas de premio hacia el círculo
      const prizeAmount = Math.abs(myPlayer.bjDelta || 0);
      const glyphs = chipsFromAmount(prizeAmount);
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
      setTimeout(() => setFrozenChips(null), ttl + 100);
      
      const arrivalDelay = (0.2 + Math.max(0, glyphs.length - 1) * 0.08 + 0.5) * 1000;
      setTimeout(() => setPrizeArrived(true), arrivalDelay);
    } else {
      // push u otro: sin animación de fichas, descongelar rápido
      setTimeout(() => setFrozenChips(null), 600);
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
        <div className="flex flex-col items-start gap-0.5">
          <button onClick={onLeave} className="text-white/70 text-xs px-3 py-1.5 rounded-full bg-black/35 border border-white/10 backdrop-blur active:scale-95">
            ← Salir
          </button>
          {myPlayer && (() => {
            const diff = lastValidDiffRef.current;
            return (
              <span className={`text-[10px] font-bold px-1 ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                {diff > 0 ? '+' : ''}{fmtChips(diff)}
              </span>
            );
          })()}
        </div>
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
              const oppHands = p.bjHands && p.bjHands.length > 0 ? p.bjHands : ((p.cards?.length || 0) > 0 ? [{ cards: p.cards, status: p.bjStatus }] : []);
              const totalOppBet = oppHands.reduce((acc: number, h: any) => acc + (h.bet || 0), 0) || p.bet || 0;
              return (
                <motion.div
                  key={p.userId}
                  className={`shrink-0 flex flex-col items-center gap-0.5 px-1.5 pt-1 pb-1 rounded-xl border backdrop-blur transition-colors duration-300 ${isTurn ? 'bg-amber-400/20 border-amber-300/70' : 'bg-black/45 border-white/10'}`}
                  style={{ opacity, minWidth: 88 }}
                >
                  <div className="flex items-center gap-1 self-stretch">
                    <div className="relative shrink-0">
                      <Avatar seed={p.avatar || p.userId} size={16} />
                      <span className="absolute -top-1 -left-1 min-w-[12px] h-3 px-0.5 rounded-full bg-amber-500 border border-black/40 flex items-center justify-center text-[7px] font-black text-black leading-none">
                        {p.level ?? 1}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[9px] font-bold truncate leading-tight">{p.name}</div>
                      <div className="text-[8px] text-white/50 font-mono leading-none">{fmtChips(p.chips)}</div>
                    </div>
                    {oppHands.length === 1 && (oppHands[0].cards?.length || 0) > 0 && (
                      <TotalPill total={t.total} soft={t.soft} bust={isBust} hasHidden={t.hasHidden}
                        accent={p.bjStatus === 'blackjack' ? 'amber' : 'sky'} size="xs" />
                    )}
                  </div>
                  <div className="flex justify-center items-center gap-1.5" style={{ minHeight: 44 }}>
                    {oppHands.length > 0 ? (
                      oppHands.length === 1 ? (
                        <MiniHand cards={oppHands[0].cards} />
                      ) : (
                        oppHands.map((h: any, i: number) => {
                          const ht = handTotalDisplay(h.cards);
                          const hBust = h.status === 'bust' || ht.bust;
                          return (
                            <div key={i} className={`flex flex-col items-center justify-end gap-0.5 ${h.status === 'playing' ? 'scale-105 drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]' : 'opacity-80 scale-95'}`}>
                              <MiniHand cards={h.cards} size={oppHands.length > 2 ? 'micro' : 'mini'} />
                              <TotalPill total={ht.total} soft={ht.soft} bust={hBust} hasHidden={ht.hasHidden} accent={h.status === 'blackjack' ? 'amber' : 'sky'} size="xs" />
                            </div>
                          );
                        })
                      )
                    ) : (
                      <div className="text-[9px] text-white/35 uppercase tracking-wider">
                        {(p.bet || 0) > 0 ? '· apostado ·' : '· esperando ·'}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 justify-center min-h-[12px]">
                    {totalOppBet > 0 && !result && (
                      <span className="text-[8px] font-bold text-yellow-200 bg-yellow-400/10 border border-yellow-300/30 px-1.5 rounded-full leading-tight">
                        {fmtChips(totalOppBet)}{p.bjDoubled ? '×2' : ''}
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
        className="relative z-10 w-full px-1 shrink-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-2"
        style={{ minHeight: 110 }}
        animate={collecting ? { x: playerCollectTarget.x, y: playerCollectTarget.y, opacity: 0, scale: 0.3 } : { x: 0, y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, delay: 0.07, ease: [0.4, 0, 1, 1] }}
      >
        {myPlayer && myHands.length > 0 ? (
          myHands.map((hand: any, idx: number) => {
            const isHandActive = idx === activeHandIndex && canAct;
            const hCards = (idx === 0 && !dealDone) ? displayMyCards : hand.cards;
            const hTotals = handTotalDisplay(hCards);
            
            let classStr = '';
            if (showResult && hand.result) {
              if (hand.result === 'win' || hand.result === 'blackjack') {
                classStr = 'scale-105 z-20';
              } else if (hand.result === 'push') {
                classStr = 'scale-95 opacity-70 z-10';
              } else {
                classStr = 'scale-90 opacity-30 brightness-50 z-10';
              }
            } else {
              classStr = isHandActive ? 'scale-110 z-20' : myHands.length > 1 ? 'scale-90 opacity-40 brightness-75 z-10' : '';
            }

            return (
              <div key={idx} className={`relative flex items-center transition-all duration-300 ${classStr}`}>
                <CardFan cards={hCards} big={myHands.length === 1} mini={myHands.length === 3} micro={myHands.length === 4} />
                {hTotals && hCards.length >= 2 && (
                  <AnimatePresence>
                    <motion.div
                      layout
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 20, layout: { type: 'spring', stiffness: 320, damping: 30 } }}
                      className="self-start mt-1 ml-1"
                    >
                      <TotalPill total={hTotals.total} soft={hTotals.soft} bust={hTotals.bust} hasHidden={false}
                        accent={hand.status === 'blackjack' ? 'amber' : 'sky'} 
                        size={myHands.length > 2 ? 'xs' : undefined} />
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            );
          })
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
            <span className="absolute -top-1 -left-1 z-10 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 border border-black/40 flex items-center justify-center text-[9px] font-black text-black leading-none">
              {myPlayer?.level ?? user.level ?? 1}
            </span>
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
              <AnimatedNumber value={frozenChips ?? displayedChips} maxDurationMs={650} baseStepMs={6} /> fichas
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
            <div className={`flex-1 grid gap-2 items-stretch ${canSplit ? 'grid-rows-2' : ''}`}>
              <div className={`grid gap-2 items-stretch ${canSplit ? 'grid-cols-3' : 'grid-cols-4'}`}>
                <ActionBtn label="CARTA" onClick={() => sendAction('Hit')} disabled={!dealDone} from="#34d399" to="#059669" />
                <ActionBtn label="PLANTAR" onClick={() => sendAction('Stand')} disabled={!dealDone} from="#f87171" to="#b91c1c" />
                <ActionBtn label="DOBLAR" onClick={() => sendAction('Double')} disabled={!dealDone || !canDoubleHand} from="#fbbf24" to="#b45309" />
                {!canSplit && (
                  <ActionBtn label="RENDIR" onClick={() => sendAction('Surrender')} disabled={!dealDone || myCards.length !== 2} from="#9ca3af" to="#4b5563" />
                )}
              </div>
              {canSplit && (
                <div className="grid grid-cols-2 gap-2 items-stretch">
                  <ActionBtn label="DIVIDIR" onClick={() => sendAction('Split')} disabled={!dealDone || !canSplit} from="#818cf8" to="#4f46e5" />
                  <ActionBtn label="RENDIR" onClick={() => sendAction('Surrender')} disabled={!dealDone || myCards.length !== 2} from="#9ca3af" to="#4b5563" />
                </div>
              )}
            </div>
          )}
          {phase === 'playerAction' && !canAct && (
            <div className="flex-1 flex items-center justify-center text-[11px] text-white/40">
              {myPlayer?.bjStatus === 'bust' ? 'Te pasaste · esperando al dealer' : myPlayer?.bjStatus === 'surrender' ? 'Te rendiste · esperando al resto' : 'Plantado · esperando a los demás'}
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
                  : myPlayer?.bjResult === 'lose' || myPlayer?.bjResult === 'surrender'
                  ? 'bg-gradient-to-b from-slate-500 to-slate-700 text-white'
                  : myPlayer?.bjResult === 'push'
                  ? 'bg-gradient-to-b from-sky-400 to-sky-600 text-white'
                  : 'bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950'
              }`}>
              {myPlayer?.bjResult === 'blackjack' && <span className="text-sm font-black leading-none">BLACKJACK!</span>}
              {myPlayer?.bjResult === 'win' && <span className="text-sm font-black leading-none">GANAS</span>}
              {myPlayer?.bjResult === 'lose' && <span className="text-sm font-black leading-none">PIERDES</span>}
              {myPlayer?.bjResult === 'push' && <span className="text-sm font-black leading-none">EMPATE</span>}
              {myPlayer?.bjResult === 'surrender' && <span className="text-sm font-black leading-none">TE RINDES</span>}
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
                <button
                  onClick={confirmRebuy}
                  disabled={user.balance < STAKE_TIERS[rebuyTierIndex]}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-b from-rose-400 to-rose-600 text-white font-extrabold text-sm shadow-lg active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
                >
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
