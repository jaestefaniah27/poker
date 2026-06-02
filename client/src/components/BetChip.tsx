import { fmtChips } from '../utils';

const BetChip = ({ amount, animateIn = false }: { amount: number; animateIn?: boolean }) => (
  <div
    className="bg-[#2A2A2A] text-[#FDE047] text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 border border-gray-700 shadow-md"
    style={animateIn ? { animation: 'chipPop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both' } : {}}
  >
    {fmtChips(amount)}
  </div>
);

export default BetChip;
