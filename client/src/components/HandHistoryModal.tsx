import MiniCard from './MiniCard';
import type { HandHistory, RouletteHistoryEntry } from '../../../shared/types';
import { fmtChips } from '../utils';

interface HandHistoryModalProps {
  history: HandHistory[];
  rouletteHistory?: RouletteHistoryEntry[];
  onClose: () => void;
}

type AnyEntry = ({ kind: 'poker' } & HandHistory) | ({ kind: 'roulette' } & RouletteHistoryEntry);

const HandHistoryModal = ({ history, rouletteHistory = [], onClose }: HandHistoryModalProps) => {
  const combined: AnyEntry[] = [
    ...history.map(h => ({ kind: 'poker' as const, ...h })),
    ...rouletteHistory.map(r => ({ kind: 'roulette' as const, ...r })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
      onClick={onClose}
    >
      <div
        className="bg-[#1F1F23] w-full max-w-md h-full sm:h-auto sm:max-h-[85vh] rounded-t-3xl sm:rounded-[32px] flex flex-col relative overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-4 pb-2 border-b border-white/5">
          <div className="w-8" />
          <h2 className="text-lg font-semibold text-white">Historial</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-gray-300"
          >
            ✕
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto p-4"
          style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
        >
          {combined.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <span className="text-2xl mb-2">📜</span>
              <p>Aún no se ha jugado nada.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {combined.map((entry) => {
                const isRecent = Date.now() - entry.timestamp < 60000;
                const minAgo = Math.floor((Date.now() - entry.timestamp) / 60000);
                const timeText = isRecent ? 'Ahora mismo' : `Hace ${minAgo} min`;

                if (entry.kind === 'roulette') {
                  const won = entry.dif > 0;
                  const broke = entry.dif === 0;
                  return (
                    <div key={entry.id} className="bg-white/5 rounded-2xl p-4 flex flex-col gap-2 relative">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">Ruleta</span>
                          <span className="text-[10px] bg-purple-500/20 text-purple-300 rounded-full px-2 py-0.5 font-mono">
                            #{entry.resultNum}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-400">{timeText}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1 mt-1">
                        {[
                          { label: 'Entrada', value: entry.entrada, color: 'text-gray-300' },
                          { label: 'Máximo', value: entry.maximo, color: 'text-yellow-400' },
                          { label: 'Salida', value: entry.salida, color: 'text-gray-300' },
                          { label: 'Dif', value: entry.dif, color: won ? 'text-emerald-400' : broke ? 'text-gray-400' : 'text-red-400' },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="flex flex-col items-center bg-black/20 rounded-xl py-2 px-1">
                            <span className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">{label}</span>
                            <span className={`text-xs font-bold font-mono ${color}`}>
                              {label === 'Dif' && value > 0 ? '+' : ''}{fmtChips(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                // Poker entry
                const hand = entry;
                return (
                  <div key={hand.id} className="bg-white/5 rounded-2xl p-4 flex flex-col gap-3 relative">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">{timeText}</span>
                      <span className="text-[#34D399] font-bold text-sm">Pot: {fmtChips(hand.pot)}</span>
                    </div>

                    {hand.communityCards?.length > 0 && (
                      <div className="flex justify-center bg-black/20 py-2 rounded-xl">
                        <div className="flex gap-1">
                          {hand.communityCards.map((c, j) => (
                            <MiniCard key={j} rank={c.rank} suit={c.suit} active={true} />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      {hand.players?.map((p) => {
                        const isWinner = hand.winners?.some(w => w.userId === p.userId);
                        return (
                          <div key={p.userId} className={`flex items-center justify-between p-2 rounded-lg ${isWinner ? 'bg-[#34D399]/10' : ''}`}>
                            <div className="flex items-center gap-3">
                              <div className="flex gap-0.5 w-[32px] justify-center">
                                {p.cards?.length > 0 ? (
                                  p.cards.map((c, j) => <MiniCard key={j} rank={c.rank} suit={c.suit} active={isWinner} />)
                                ) : (
                                  <span className="text-[10px] text-gray-500 italic mt-1">Oculto</span>
                                )}
                              </div>
                              <div className="flex flex-col">
                                <span className={`text-sm ${isWinner ? 'text-[#34D399] font-bold' : 'text-gray-300'}`}>
                                  {p.name} {isWinner && '👑'}
                                </span>
                                {p.handName && !p.hasFolded && !hand.wonByFold && (
                                  <span className="text-[10px] text-gray-400">{p.handName}</span>
                                )}
                                {p.hasFolded && (
                                  <span className="text-[10px] text-red-400/80">Fold</span>
                                )}
                              </div>
                            </div>
                            {p.chipsDelta > 0 && (
                              <span className="text-[#34D399] text-xs font-bold">+{fmtChips(p.chipsDelta)}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HandHistoryModal;
