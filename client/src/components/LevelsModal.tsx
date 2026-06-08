import { motion } from 'framer-motion';
import { socket, fmtChips } from '../utils';
import {
  xpForLevel, dailyAmountFor, hourlyAmountFor, ruletaOptionsFor, ruletaSpinsFor, triviaRewardsFor,
  RULETA_MAX_LEVEL, TRIVIA_MAX_LEVEL, PAGUITA_MAX_LEVEL, DIETA_MAX_LEVEL,
  triviaCooldownMs, triviaSpinCount,
} from '../../../shared/types';
import type { LevelTrack } from '../../../shared/types';

interface LevelsModalProps {
  user: any;
  token: string | null;
  onClose: () => void;
  onUpdateUser: (u: any) => void;
}

const LevelsModal = ({ user, token, onClose, onUpdateUser }: LevelsModalProps) => {
  const level = user.level ?? 1;
  const xp = user.xp ?? 0;
  const points = user.levelPoints ?? 0;
  const paguitaLevel = user.paguitaLevel ?? 0;
  const dietaLevel = user.dietaLevel ?? 0;
  const ruletaLevel = user.ruletaLevel ?? 0;
  const triviaLevel = user.triviaLevel ?? 0;

  const xpThis = xpForLevel(level);
  const xpNext = xpForLevel(level + 1);
  const xpProgress = Math.max(0, Math.min(1, (xp - xpThis) / (xpNext - xpThis)));

  const upgrade = (track: LevelTrack) => {
    if (points <= 0) return;
    socket.emit('spendLevelPoint', { token, track }, (res: any) => {
      if (res?.ok && res.user) onUpdateUser(res.user);
    });
  };

  const resetXp = () => {
    socket.emit('adminResetXp', { token }, (res: any) => {
      if (res?.ok && res.user) onUpdateUser(res.user);
    });
  };

  const ruletaBest = Math.max(...ruletaOptionsFor(ruletaLevel));
  const ruletaSpins = ruletaSpinsFor(ruletaLevel);
  const ruletaBestNext = Math.max(...ruletaOptionsFor(ruletaLevel + 1));
  const ruletaSpinsNext = ruletaSpinsFor(ruletaLevel + 1);
  const worstTier = (r: { type: 'spin'; value: number } | { type: 'chips'; amount: number }) =>
    r.type === 'spin' ? r.value : r.amount;
  const triviaDesc = (lvl: number) => {
    const worst = worstTier(triviaRewardsFor(lvl)[0]);
    const secs = triviaCooldownMs(lvl) / 1000;
    const spins = triviaSpinCount(lvl);
    return `Peor $${fmtChips(worst)} · ${secs}s · ${spins} ${spins > 1 ? 'giros' : 'giro'}`;
  };

  const tracks: {
    key: LevelTrack;
    name: string;
    emoji: string;
    color: string;
    lvl: number;
    maxed: boolean;
    current: string;
    next: string | null;
  }[] = [
    {
      key: 'paguita', name: 'Paguita', emoji: '💶', color: '#f59e0b', lvl: paguitaLevel, maxed: paguitaLevel >= PAGUITA_MAX_LEVEL,
      current: `$${fmtChips(dailyAmountFor(paguitaLevel))} / día`,
      next: paguitaLevel >= PAGUITA_MAX_LEVEL ? null : `$${fmtChips(dailyAmountFor(paguitaLevel + 1))} / día`,
    },
    {
      key: 'dieta', name: 'Dietas', emoji: '🍽️', color: '#34d399', lvl: dietaLevel, maxed: dietaLevel >= DIETA_MAX_LEVEL,
      current: `$${fmtChips(hourlyAmountFor(dietaLevel))} / 30 min`,
      next: dietaLevel >= DIETA_MAX_LEVEL ? null : `$${fmtChips(hourlyAmountFor(dietaLevel + 1))} / 30 min`,
    },
    {
      key: 'ruleta', name: 'Ruleta', emoji: '🎡', color: '#a855f7', lvl: ruletaLevel, maxed: ruletaLevel >= RULETA_MAX_LEVEL,
      current: `${ruletaSpins} giros (Premio máx: $${fmtChips(ruletaBest)})`,
      next: ruletaLevel >= RULETA_MAX_LEVEL ? null : `${ruletaSpinsNext} giros (Premio máx: $${fmtChips(ruletaBestNext)})`,
    },
    {
      key: 'trivia', name: 'Trivia', emoji: '🧠', color: '#ec4899', lvl: triviaLevel, maxed: triviaLevel >= TRIVIA_MAX_LEVEL,
      current: triviaDesc(triviaLevel),
      next: triviaLevel >= TRIVIA_MAX_LEVEL ? null : triviaDesc(triviaLevel + 1),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85"
      style={{
        padding: 'calc(env(safe-area-inset-top, 0px) + 4rem) 1rem max(1rem, env(safe-area-inset-bottom, 0px))',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="w-full max-w-md bg-surface rounded-3xl border border-surfaceLight overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-5 border-b border-surfaceLight">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 uppercase tracking-wider">Niveles</span>
            <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-lg leading-none">✕</button>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-b from-amber-400/20 to-amber-600/10 border border-amber-500/30 shrink-0">
              <span className="text-[9px] text-amber-300/80 uppercase tracking-wider font-bold leading-none mb-0.5">Nivel</span>
              <span className="text-2xl font-black text-amber-300 leading-none">{level}</span>
            </div>
            <div className="flex-1">
              <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                <span>XP</span>
                <span>{fmtChips(xp - xpThis)} / {fmtChips(xpNext - xpThis)}</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-black/40 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-300 transition-all" style={{ width: `${xpProgress * 100}%` }} />
              </div>
              <p className="text-[10px] text-gray-500 mt-1.5">Juega manos y acierta trivia para ganar XP</p>
            </div>
          </div>
        </div>

        {/* Puntos disponibles */}
        <div className={`px-6 py-3 text-center text-sm font-bold ${points > 0 ? 'bg-amber-500/10 text-amber-300' : 'text-gray-500'}`}>
          {points > 0
            ? `🎉 ${points} ${points === 1 ? 'punto disponible' : 'puntos disponibles'} — elige qué mejorar`
            : 'Sin puntos disponibles. Sube de nivel para mejorar.'}
        </div>

        {/* Tracks */}
        <div className="px-6 py-5 space-y-3 overflow-y-auto scrollbar-hide">
          {tracks.map(t => (
            <div key={t.key} className="rounded-2xl border border-surfaceLight bg-background p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center gap-2 font-bold text-sm" style={{ color: t.color }}>
                  <span className="text-lg">{t.emoji}</span>
                  {t.name}
                </span>
                <span className="text-[10px] text-gray-500 font-mono">Nv. {t.lvl}</span>
              </div>
              <div className="flex items-center gap-2 text-xs mb-3">
                <span className="text-gray-300">{t.current}</span>
                {t.next && <span className="text-gray-600">→</span>}
                {t.next && <span style={{ color: t.color }} className="font-semibold">{t.next}</span>}
              </div>
              <button
                onClick={() => upgrade(t.key)}
                disabled={points <= 0 || t.maxed}
                className="w-full py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-30 disabled:active:scale-100 disabled:cursor-not-allowed"
                style={{
                  background: points > 0 && !t.maxed ? `${t.color}22` : 'transparent',
                  border: `1px solid ${points > 0 && !t.maxed ? t.color : '#374151'}`,
                  color: points > 0 && !t.maxed ? t.color : '#6b7280',
                }}
              >
                {t.maxed ? 'Nivel máximo' : 'Mejorar (1 punto)'}
              </button>
            </div>
          ))}

          {user.name === 'Jorge' && (
            <button
              onClick={resetXp}
              className="w-full py-2.5 rounded-xl text-xs font-bold text-red-400 border border-red-900/40 bg-red-500/8 active:scale-95 transition-all"
            >
              🔄 Reiniciar nivel (Admin)
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default LevelsModal;
