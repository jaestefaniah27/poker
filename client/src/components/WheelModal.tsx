import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket, fmtChips } from '../utils';
import { ruletaOptionsFor, ruletaSpinsFor } from '../../../shared/types';

interface WheelModalProps {
  user: any;
  token: string | null;
  onClose: () => void;
  onUpdateUser: (u: any) => void;
}

const COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];
const DARK   = ['#4338ca','#0369a1','#047857','#b45309','#b91c1c','#6d28d9','#be185d','#0f766e'];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CX = 140, CY = 140, R = 122;
const N = 8; // siempre 8 sectores
const DEG = 360 / N;

function polar(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function slicePath(r: number, a1: number, a2: number) {
  const s = polar(r, a1), e = polar(r, a2);
  const large = a2 - a1 > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)} Z`;
}

export const WheelModal = ({ user, token, onClose, onUpdateUser }: WheelModalProps) => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const expectedSpins = ruletaSpinsFor(user.ruletaLevel ?? 0);
  const [wonValue, setWonValue] = useState<number | null>(null);
  const [wonSpins, setWonSpins] = useState<number>(expectedSpins);
  const [hasSpun, setHasSpun] = useState(false);

  const wheelOptions = useMemo(() => shuffle(ruletaOptionsFor(user.ruletaLevel ?? 0)), [user.ruletaLevel]);
  const sliceAngle = DEG;

  const handleSpin = () => {
    if (isSpinning || hasSpun) return;
    setIsSpinning(true);
    setError(null);

    socket.emit('claimFreeSpinsWheel', { token }, (res: any) => {
      if (!res || res.error) {
        setError(res?.error || 'Error de conexión');
        setIsSpinning(false);
        return;
      }

      const { chosenValue, freeSpins, user: updatedUser } = res;
      const idx = wheelOptions.indexOf(chosenValue);
      const targetIdx = idx >= 0 ? idx : 0;
      const spinAngle = 3600 - (targetIdx * sliceAngle) - (sliceAngle / 2);
      setRotation(spinAngle);

      setTimeout(() => {
        setIsSpinning(false);
        setHasSpun(true);
        setWonValue(chosenValue);
        setWonSpins(freeSpins || expectedSpins);
        if (updatedUser) onUpdateUser(updatedUser);
      }, 4200);
    });
  };

  const now = Date.now();
  const nextClaim = user.lastFreeSpinsClaim ? user.lastFreeSpinsClaim + 60 * 60 * 1000 : 0;
  const isAvailable = now >= nextClaim;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4"
      onClick={() => !isSpinning && onClose()}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="relative bg-[#0d0d0d] rounded-3xl p-6 w-full max-w-sm border border-white/10 shadow-2xl flex flex-col items-center overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Background glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/10 to-transparent pointer-events-none" />

        <button
          disabled={isSpinning}
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-white text-xl disabled:opacity-20 z-10"
        >
          ✕
        </button>

        <h2 className="text-2xl font-black text-white mb-0.5 tracking-tight">Ruleta de Tiradas</h2>
        <p className="text-xs text-gray-500 text-center mb-5">
          Gira para conseguir {expectedSpins} tiradas gratis
        </p>

        {error && (
          <div className="w-full bg-red-950/40 border border-red-500/30 text-red-400 text-xs py-2 px-3 rounded-xl mb-4 text-center">
            {error === 'Demasiado pronto' ? 'Ya has girado la ruleta hace poco.' : error}
          </div>
        )}

        {/* Wheel */}
        <div className="relative flex items-center justify-center mb-5" style={{ width: 280, height: 280 }}>
          {/* Outer glow rings */}
          <div className="absolute inset-0 rounded-full"
            style={{ boxShadow: isSpinning ? '0 0 40px 8px rgba(139,92,246,0.35)' : '0 0 20px 4px rgba(139,92,246,0.15)', transition: 'box-shadow 0.5s' }} />

          {/* Pointer */}
          <div className="absolute z-30" style={{ top: -4, left: '50%', transform: 'translateX(-50%)' }}>
            <svg width="22" height="28" viewBox="0 0 22 28">
              <defs>
                <filter id="ptr-shadow">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.7" />
                </filter>
              </defs>
              <polygon
                points="11,26 1,2 21,2"
                fill="white"
                stroke="#222"
                strokeWidth="1"
                filter="url(#ptr-shadow)"
              />
            </svg>
          </div>

          {/* SVG Wheel */}
          <svg
            viewBox={`0 0 ${CX * 2} ${CY * 2}`}
            width="280"
            height="280"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: isSpinning ? 'transform 4.2s cubic-bezier(0.06, 0.85, 0.15, 1)' : 'none',
            }}
          >
            <defs>
              <filter id="slice-shadow">
                <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.4" />
              </filter>
            </defs>

            {/* Outer decorative ring background */}
            <circle cx={CX} cy={CY} r={R + 12} fill="#1a1a1a" stroke="#333" strokeWidth="1" />

            {/* Gold tick marks on outer ring */}
            {Array.from({ length: 48 }).map((_, i) => {
              const a = -90 + i * (360 / 48);
              const isMajor = i % 6 === 0;
              const p1 = polar(R + 5, a);
              const p2 = polar(R + 11 + (isMajor ? 2 : 0), a);
              return (
                <line
                  key={i}
                  x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  stroke={isMajor ? '#fbbf24' : '#444'}
                  strokeWidth={isMajor ? 2 : 1}
                  strokeLinecap="round"
                />
              );
            })}

            {/* Gold outer ring */}
            <circle cx={CX} cy={CY} r={R + 4} fill="none" stroke="url(#goldRing)" strokeWidth="3" />
            <defs>
              <linearGradient id="goldRing" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="50%" stopColor="#fef3c7" />
                <stop offset="100%" stopColor="#d97706" />
              </linearGradient>
            </defs>

            {/* Slices */}
            {wheelOptions.map((val, i) => {
              const a1 = -90 + i * DEG;
              const a2 = -90 + (i + 1) * DEG;
              const mid = -90 + (i + 0.5) * DEG;
              const tp = polar(R * 0.63, mid);
              const needsFlip = mid > 90 && mid < 270;
              const textRot = mid + (needsFlip ? 180 : 0);
              const edge = polar(R, a1);

              return (
                <g key={i}>
                  {/* Main slice */}
                  <path d={slicePath(R, a1, a2)} fill={COLORS[i % COLORS.length]} />
                  {/* Inner darker arc for depth */}
                  <path d={slicePath(R * 0.35, a1, a2)} fill={DARK[i % DARK.length]} opacity={0.6} />
                  {/* Divider line */}
                  <line
                    x1={CX} y1={CY}
                    x2={edge.x} y2={edge.y}
                    stroke="rgba(0,0,0,0.5)"
                    strokeWidth="1.5"
                  />
                  {/* Label */}
                  <text
                    x={tp.x}
                    y={tp.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={`rotate(${textRot}, ${tp.x}, ${tp.y})`}
                    fill="white"
                    fontSize="13"
                    fontWeight="900"
                    letterSpacing="0.2"
                    style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,1))', fontFamily: 'system-ui,sans-serif' }}
                  >
                    ${fmtChips(val)}
                  </text>
                </g>
              );
            })}

            {/* Inner rim shadow */}
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="2" />

            {/* Center hub */}
            <circle cx={CX} cy={CY} r={38} fill="#111" stroke="#2a2a2a" strokeWidth="3" />
            <circle cx={CX} cy={CY} r={30} fill="url(#hubGrad)" />
            <defs>
              <radialGradient id="hubGrad" cx="40%" cy="35%">
                <stop offset="0%" stopColor="#3a3a3a" />
                <stop offset="100%" stopColor="#111" />
              </radialGradient>
            </defs>
            <circle cx={CX} cy={CY} r={30} fill="none" stroke="#444" strokeWidth="1.5" />
          </svg>

          {/* Center spin button (outside SVG so it doesn't rotate) */}
          <button
            disabled={isSpinning || hasSpun || !isAvailable}
            onClick={handleSpin}
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full flex flex-col items-center justify-center font-black text-[11px] tracking-widest transition-all select-none border-2 z-20
              ${isSpinning
                ? 'bg-gray-800 border-gray-700 text-gray-500 scale-95'
                : hasSpun
                  ? 'bg-purple-950 border-purple-800 text-purple-400'
                  : !isAvailable
                    ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-white border-white text-black hover:scale-110 active:scale-95 cursor-pointer'
              }
            `}
            style={{
              boxShadow: (!isSpinning && !hasSpun && isAvailable)
                ? '0 0 20px 4px rgba(255,255,255,0.5), 0 0 6px 1px rgba(255,255,255,0.8)'
                : 'none',
            }}
          >
            {isSpinning ? (
              <span className="animate-spin text-lg">◌</span>
            ) : hasSpun ? (
              '✓'
            ) : (
              'GIRAR'
            )}
          </button>
        </div>

        {/* Won state */}
        <AnimatePresence>
          {hasSpun && wonValue && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full flex flex-col items-center"
            >
              <p className="text-amber-400 font-black text-sm mb-3 uppercase tracking-widest">
                🎉 ¡PREMIO CONSEGUIDO!
              </p>
              <div className="bg-gradient-to-b from-emerald-950/40 to-emerald-950/20 border border-emerald-500/30 rounded-2xl p-4 w-full text-center flex flex-col gap-1 mb-4">
                <span className="text-xs text-gray-400">Has desbloqueado</span>
                <span className="text-2xl font-black text-white">{wonSpins} Tiradas Gratis</span>
                <span className="text-base font-bold text-emerald-300">${fmtChips(wonValue)} por giro</span>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-2xl font-black text-sm text-black tracking-wider"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)' }}
              >
                ¡A jugar! 🎰
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {!hasSpun && !isAvailable && (
          <p className="text-xs text-gray-600 text-center mt-1">
            La ruleta no está disponible en este momento.
          </p>
        )}

        {!hasSpun && isAvailable && !isSpinning && (
          <p className="text-[11px] text-gray-600 text-center mt-1">
            Disponible una vez por hora
          </p>
        )}
      </motion.div>
    </div>
  );
};
