interface PlayingCardProps {
  rank?: string;
  suit?: string;
  hidden?: boolean;
  className?: string;
  style?: React.CSSProperties;
  compact?: boolean; // oculta el rank invertido de abajo (cartas pequeñas en blackjack)
}

const PlayingCard = ({ rank, suit, hidden = false, className = '', style, compact = false }: PlayingCardProps) => {
  const isMini = className.includes('w-10') || className.includes('w-8') || className.includes('w-[38px]') || className.includes('w-[32px]');
  const isSmall = className.includes('w-16') || className.includes('w-14') || className.includes('w-[50px]') || className.includes('w-[48px]');

  const pClass = isMini ? 'p-0.5' : isSmall ? 'p-1.5' : 'p-2';
  const rankClass = isMini ? 'text-[9px]' : isSmall ? 'text-lg' : 'text-xl';
  const suitClass = isMini ? 'text-xl' : isSmall ? 'text-3xl' : 'text-4xl';
  const roundedClass = isMini ? 'rounded-md' : isSmall ? 'rounded-lg' : 'rounded-xl';

  if (hidden) {
    return (
      <div className={`bg-white ${roundedClass} shadow-md relative overflow-hidden ${className}`} style={style}>
        <div className="absolute inset-1 rounded-lg border-2 border-gray-200">
           <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, #000000 5px, #000000 7px)' }}></div>
        </div>
      </div>
    );
  }

  const isRed = suit === 'h' || suit === 'd';
  const colorClass = isRed ? 'text-accent' : 'text-slate-900';
  const suitSymbol = suit === 'h' ? '♥' : suit === 'd' ? '♦' : suit === 'c' ? '♣' : '♠';
  const displayRank = rank === 'T' ? '10' : rank;

  return (
    <div className={`bg-white ${roundedClass} shadow-md flex flex-col justify-between ${pClass} ${colorClass} ${className}`} style={style}>
      <div className={`text-left font-bold leading-none ${rankClass}`}>{displayRank}</div>
      <div className={`text-center flex-1 flex items-center justify-center ${suitClass}`}>{suitSymbol}</div>
      {!compact && <div className={`text-left font-bold leading-none rotate-180 ${rankClass}`}>{displayRank}</div>}
    </div>
  );
};

export default PlayingCard;
