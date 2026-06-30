import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { socket, fmtChips } from '../utils';

interface MissionsModalProps {
  user: any;
  token: string | null;
  onClose: () => void;
  onUpdateUser: (u: any) => void;
}

interface DailyMissionView {
  slot: number;
  templateId: string;
  game: string;
  emoji: string;
  label: string;
  requirement: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  rewardChips: string;
  rewardXp: number;
}

interface BrocheSlice {
  eligible: boolean;
  claimed: boolean;
  rewardXp?: number;
  rewardSpins?: number;
  rewardSpinValue?: string;
  rewardChips?: string;
}

interface BrochesView {
  missionDate: string;
  completedCount: number;
  bronze: BrocheSlice;
  silver: BrocheSlice;
  gold: BrocheSlice;
}

interface AchievementView {
  id: string;
  chainId: string;
  tier: number;
  game: string;
  emoji: string;
  label: string;
  requirement: string;
  progress: string;
  completed: boolean;
  claimed: boolean;
  rewardChips: string;
  rewardXp: number;
}

const MissionsModal = ({ user, token, onClose, onUpdateUser }: MissionsModalProps) => {
  const [tab, setTab] = useState<'daily' | 'achievements'>('daily');
  const [loading, setLoading] = useState(true);
  const [missions, setMissions] = useState<DailyMissionView[]>([]);
  const [broches, setBroches] = useState<BrochesView | null>(null);
  const [achievements, setAchievements] = useState<AchievementView[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const fetchMissions = () => {
    socket.emit('getMissions', { token }, (res: any) => {
      setLoading(false);
      if (!res?.ok) return;
      setMissions(res.missions || []);
      setBroches(res.broches || null);
      setAchievements(res.achievements || []);
    });
  };

  useEffect(() => {
    fetchMissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const claimMission = (slot: number) => {
    setClaimingId(`mission-${slot}`);
    socket.emit('claimMission', { token, slot }, (res: any) => {
      setClaimingId(null);
      if (res?.ok) {
        if (res.user) onUpdateUser(res.user);
        fetchMissions();
      }
    });
  };

  const claimBroche = (tier: 'bronze' | 'silver' | 'gold') => {
    setClaimingId(`broche-${tier}`);
    socket.emit('claimBroche', { token, tier }, (res: any) => {
      setClaimingId(null);
      if (res?.ok) {
        if (res.user) onUpdateUser(res.user);
        fetchMissions();
      }
    });
  };

  const claimAchievement = (achievementId: string) => {
    setClaimingId(`ach-${achievementId}`);
    socket.emit('claimAchievement', { token, achievementId }, (res: any) => {
      setClaimingId(null);
      if (res?.ok) {
        if (res.user) onUpdateUser(res.user);
        fetchMissions();
      }
    });
  };

  const dailyClaimable = missions.filter(m => m.completed && !m.claimed).length;
  const brocheClaimable = broches
    ? [broches.bronze, broches.silver, broches.gold].filter(b => b.eligible && !b.claimed).length
    : 0;
  const achievementClaimable = achievements.filter(a => a.completed && !a.claimed).length;

  const dailyTabBadge = dailyClaimable + brocheClaimable;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85"
      style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 4rem) 1rem max(1rem, env(safe-area-inset-bottom, 0px))' }}
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
        <div className="px-6 pt-6 pb-4 border-b border-surfaceLight">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 uppercase tracking-wider">Misiones</span>
            <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-lg leading-none">✕</button>
          </div>
          <p className="text-[11px] text-gray-500 leading-snug">
            Completa misiones diarias y logros permanentes. Sube el track de Misiones en el menú de Nivel para mejores recompensas.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex px-4 pt-4 gap-2">
          {[
            { key: 'daily' as const, label: 'Diarias', badge: dailyTabBadge },
            { key: 'achievements' as const, label: 'Logros', badge: achievementClaimable },
          ].map(t => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all relative"
                style={{
                  background: active ? '#22d3ee18' : 'transparent',
                  border: `1px solid ${active ? '#22d3ee' : '#374151'}`,
                  color: active ? '#67e8f9' : '#6b7280',
                }}
              >
                {t.label}
                {t.badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center bg-red-500 text-white">
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Contenido */}
        <div className="px-4 py-4 space-y-3 overflow-y-auto scrollbar-hide">
          {loading ? (
            <p className="text-center text-gray-500 text-sm py-8">Cargando misiones...</p>
          ) : tab === 'daily' ? (
            <>
              {missions.map(m => (
                <div
                  key={m.slot}
                  className="rounded-2xl border p-4 transition-all"
                  style={{
                    background: m.claimed ? 'rgba(255,255,255,0.02)' : '#0f1419',
                    borderColor: m.completed && !m.claimed ? '#22d3ee' : '#374151',
                    opacity: m.claimed ? 0.55 : 1,
                  }}
                >
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <span className="flex items-center gap-2 font-bold text-sm" style={{ color: m.claimed ? '#6b7280' : '#67e8f9' }}>
                      <span className="text-lg">{m.emoji}</span>
                      <span className="leading-tight">{m.label}</span>
                    </span>
                    {m.claimed && <span className="text-[10px] text-gray-600 font-bold shrink-0">✓ Hecho</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[11px]">
                    <span className="px-2 py-0.5 rounded-md font-bold" style={{ background: '#facc1518', color: '#fbbf24' }}>
                      ${fmtChips(m.rewardChips)}
                    </span>
                    <span className="px-2 py-0.5 rounded-md font-bold" style={{ background: '#60a5fa18', color: '#93c5fd' }}>
                      +{fmtChips(m.rewardXp)} XP
                    </span>
                  </div>
                  {m.completed && !m.claimed ? (
                    <button
                      onClick={() => claimMission(m.slot)}
                      disabled={claimingId === `mission-${m.slot}`}
                      className="w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all active:scale-95 disabled:opacity-50"
                      style={{ background: '#22d3ee', color: '#0a0a0a' }}
                    >
                      {claimingId === `mission-${m.slot}` ? '...' : 'Reclamar'}
                    </button>
                  ) : m.claimed ? (
                    <div className="h-2 w-full rounded-full bg-black/30 overflow-hidden">
                      <div className="h-full rounded-full bg-gray-700" style={{ width: '100%' }} />
                    </div>
                  ) : (
                    <>
                      <div className="h-2 w-full rounded-full bg-black/40 overflow-hidden mb-1">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (m.progress / m.requirement) * 100)}%`, background: '#22d3ee' }} />
                      </div>
                      <div className="text-right text-[10px] text-gray-500 font-mono">{m.progress} / {m.requirement}</div>
                    </>
                  )}
                </div>
              ))}

              {/* Broches */}
              {broches && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 mt-2">
                  <p className="text-xs font-bold text-amber-300 mb-3">🏅 Broches del día ({broches.completedCount}/5 completadas)</p>
                  <div className="space-y-2">
                    {/* Bronce */}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-gray-300">🥉 Bronce — +{broches.bronze.rewardXp} XP</span>
                      {broches.bronze.claimed ? (
                        <span className="text-gray-600 text-[10px] font-bold">✓ Hecho</span>
                      ) : (
                        <button
                          onClick={() => claimBroche('bronze')}
                          disabled={!broches.bronze.eligible || claimingId === 'broche-bronze'}
                          className="px-3 py-1 rounded-lg text-[11px] font-bold disabled:opacity-30"
                          style={{ background: '#cd7f3222', color: '#cd7f32', border: '1px solid #cd7f32' }}
                        >
                          Reclamar
                        </button>
                      )}
                    </div>
                    {/* Plata */}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-gray-300">🥈 Plata — {broches.silver.rewardSpins} tiradas (3/5 misiones)</span>
                      {broches.silver.claimed ? (
                        <span className="text-gray-600 text-[10px] font-bold">✓ Hecho</span>
                      ) : (
                        <button
                          onClick={() => claimBroche('silver')}
                          disabled={!broches.silver.eligible || claimingId === 'broche-silver'}
                          className="px-3 py-1 rounded-lg text-[11px] font-bold disabled:opacity-30"
                          style={{ background: '#c0c0c022', color: '#c0c0c0', border: '1px solid #c0c0c0' }}
                        >
                          Reclamar
                        </button>
                      )}
                    </div>
                    {/* Oro */}
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-gray-300">🥇 Oro — ${fmtChips(broches.gold.rewardChips || '0')} (5/5 misiones)</span>
                      {broches.gold.claimed ? (
                        <span className="text-gray-600 text-[10px] font-bold">✓ Hecho</span>
                      ) : (
                        <button
                          onClick={() => claimBroche('gold')}
                          disabled={!broches.gold.eligible || claimingId === 'broche-gold'}
                          className="px-3 py-1 rounded-lg text-[11px] font-bold disabled:opacity-30"
                          style={{ background: '#ffd70022', color: '#ffd700', border: '1px solid #ffd700' }}
                        >
                          Reclamar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {achievements.map(a => (
                <div
                  key={a.id}
                  className="rounded-2xl border p-4 transition-all"
                  style={{
                    background: a.claimed ? 'rgba(255,255,255,0.02)' : '#0f1419',
                    borderColor: a.completed && !a.claimed ? '#fbbf24' : '#374151',
                    opacity: a.claimed ? 0.55 : 1,
                  }}
                >
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <span className="flex items-center gap-2 font-bold text-sm" style={{ color: a.claimed ? '#6b7280' : '#fbbf24' }}>
                      <span className="text-lg">{a.emoji}</span>
                      <span className="leading-tight">{a.label}</span>
                    </span>
                    <span className="text-[9px] text-gray-600 font-mono shrink-0">T{a.tier}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[11px]">
                    <span className="px-2 py-0.5 rounded-md font-bold" style={{ background: '#facc1518', color: '#fbbf24' }}>
                      ${fmtChips(a.rewardChips)}
                    </span>
                    <span className="px-2 py-0.5 rounded-md font-bold" style={{ background: '#60a5fa18', color: '#93c5fd' }}>
                      +{fmtChips(a.rewardXp)} XP
                    </span>
                  </div>
                  {a.completed && !a.claimed ? (
                    <button
                      onClick={() => claimAchievement(a.id)}
                      disabled={claimingId === `ach-${a.id}`}
                      className="w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all active:scale-95 disabled:opacity-50"
                      style={{ background: '#fbbf24', color: '#0a0a0a' }}
                    >
                      {claimingId === `ach-${a.id}` ? '...' : 'Reclamar'}
                    </button>
                  ) : a.claimed ? (
                    <div className="h-2 w-full rounded-full bg-black/30 overflow-hidden">
                      <div className="h-full rounded-full bg-gray-700" style={{ width: '100%' }} />
                    </div>
                  ) : (
                    <>
                      <div className="h-2 w-full rounded-full bg-black/40 overflow-hidden mb-1">
                        <div className="h-full rounded-full transition-all" style={{ width: `${(() => { try { return Math.min(100, Number(a.progress) / Number(a.requirement) * 100); } catch { return 0; } })()}%`, background: '#fbbf24' }} />
                      </div>
                      <div className="text-right text-[10px] text-gray-500 font-mono">{fmtChips(a.progress)} / {fmtChips(a.requirement)}</div>
                    </>
                  )}
                </div>
              ))}
              {achievements.length === 0 && (
                <p className="text-center text-gray-500 text-sm py-8">No hay logros disponibles.</p>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default MissionsModal;
