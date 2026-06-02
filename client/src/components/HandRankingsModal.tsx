import MiniCard from './MiniCard';
import { HAND_RANKINGS } from '../utils';

interface HandRankingsModalProps {
  myHandName?: string;
  onClose: () => void;
}

const HandRankingsModal = ({ myHandName, onClose }: HandRankingsModalProps) => (
  <div
    className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center"
    style={{
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}
    onClick={onClose}
  >
    <div
      className="bg-[#1F1F23] w-full max-w-md h-full rounded-t-0 sm:rounded-[32px] flex flex-col relative overflow-hidden shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Close button */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 pt-4 pb-2">
        <div className="w-8" />
        <h2 className="text-lg font-semibold text-white">Hand rankings</h2>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-gray-300"
        >
          ✕
        </button>
      </div>

      {/* Scrollable list */}
      <div
        className="flex-1 overflow-y-auto px-4 pb-6"
        style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
      >
        <div className="space-y-1.5">
          {HAND_RANKINGS.map((rank, i) => {
            const isMyHand = myHandName === rank.name;
            return (
              <div
                key={i}
                className={`flex items-center gap-4 p-3 rounded-2xl transition-colors ${isMyHand ? 'bg-white/10 ring-1 ring-white/30' : 'hover:bg-white/5'}`}
              >
                <div className="flex gap-0.5 shrink-0">
                  {rank.cards.map((c, j) => (
                    <MiniCard key={j} rank={c.r} suit={c.s} active={rank.active.includes(j)} />
                  ))}
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-white font-semibold text-[15px] truncate">{rank.name}</span>
                  <span className="text-gray-400 text-[11px] truncate">{rank.desc}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </div>
);

export default HandRankingsModal;
