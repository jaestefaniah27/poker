import MiniCard from './MiniCard';
import { HAND_RANKINGS } from '../utils';

interface HandRankingsModalProps {
  myHandName?: string;
  onClose: () => void;
}

const HandRankingsModal = ({ myHandName, onClose }: HandRankingsModalProps) => (
  <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center sm:p-4 animate-in fade-in duration-200">
    <div className="bg-[#1F1F23] w-full max-w-md h-[95vh] rounded-t-[32px] sm:rounded-[32px] flex flex-col relative animate-in slide-in-from-bottom-8 duration-300 overflow-hidden shadow-2xl">

      <div className="w-full flex justify-center pt-4 pb-2 cursor-pointer" onClick={onClose}>
        <div className="w-10 h-1.5 bg-gray-600 rounded-full"></div>
      </div>

      <div className="p-4 flex items-center justify-between pb-6">
        <h2 className="text-xl font-semibold text-white text-center w-full">Hand rankings</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8">
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
