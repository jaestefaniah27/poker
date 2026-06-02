const MiniCard = ({ rank, suit, active = true }: { rank: string; suit: string; active?: boolean }) => {
  const isRed = suit === 'h' || suit === 'd';
  const colorClass = isRed ? 'text-accent' : 'text-slate-900';
  const suitSymbol = suit === 'h' ? '♥' : suit === 'd' ? '♦' : suit === 'c' ? '♣' : '♠';
  const displayRank = rank === 'T' ? '10' : rank;

  return (
    <div className={`bg-white rounded shadow-sm flex flex-col justify-between p-1 w-[26px] h-9 ${colorClass} ${!active ? 'opacity-40 brightness-75 bg-gray-300' : ''}`}>
      <div className="text-left font-bold text-[9px] leading-none">{displayRank}</div>
      <div className="text-center text-[10px] -mt-0.5">{suitSymbol}</div>
    </div>
  );
};

export default MiniCard;
