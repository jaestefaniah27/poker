import MiniCard from './MiniCard';
import type { HandHistory } from '../../../shared/types';
import { fmtChips } from '../utils';

interface HandHistoryModalProps {
  history: HandHistory[];
  onClose: () => void;
}

const HandHistoryModal = ({ history, onClose }: HandHistoryModalProps) => {
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
        {/* Close button */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-4 pb-2 border-b border-white/5">
          <div className="w-8" />
          <h2 className="text-lg font-semibold text-white">Historial de Manos</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* Scrollable list */}
        <div
          className="flex-1 overflow-y-auto p-4"
          style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
        >
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
              <span className="text-2xl mb-2">📜</span>
              <p>Aún no se ha jugado ninguna mano.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((hand) => {
                const isRecent = Date.now() - hand.timestamp < 60000;
                const minAgo = Math.floor((Date.now() - hand.timestamp) / 60000);
                const timeText = isRecent ? 'Ahora mismo' : `Hace ${minAgo} min`;

                return (
                  <div key={hand.id} className="bg-white/5 rounded-2xl p-4 flex flex-col gap-3 relative">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">{timeText}</span>
                      <span className="text-[#34D399] font-bold text-sm">Pot: {fmtChips(hand.pot)}</span>
                    </div>

                    {/* Mesa */}
                    {hand.communityCards?.length > 0 && (
                      <div className="flex justify-center bg-black/20 py-2 rounded-xl">
                        <div className="flex gap-1">
                          {hand.communityCards.map((c, j) => (
                            <MiniCard key={j} rank={c.rank} suit={c.suit} active={true} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Jugadores */}
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
