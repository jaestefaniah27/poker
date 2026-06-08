import { fmtChips } from '../utils';

interface Props {
  tiers: number[];
  unlockLevel: number;
  renderItem: (value: number, index: number) => React.ReactNode;
}

export default function BettingCarousel({ tiers, unlockLevel, renderItem }: Props) {
  // Solo mostramos las opciones desbloqueadas (al menos la primera si unlockLevel es 0)
  const availableTiers = tiers.slice(0, Math.max(unlockLevel, 1));

  // Fila superior: de menor a mayor
  const topRow = availableTiers.map((t, i) => ({ value: t, originalIndex: i }));
  // Fila inferior: de mayor a menor
  const bottomRow = [...topRow].reverse();

  return (
    <div className="space-y-1.5 w-full">
      {/* Fila de arriba (ascendente) */}
      <div 
        className="flex gap-1.5 overflow-x-auto scrollbar-hide snap-x pb-0.5" 
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {topRow.map((item) => (
          <div key={item.originalIndex} className="shrink-0 snap-center">
            {renderItem(item.value, item.originalIndex)}
          </div>
        ))}
      </div>
      
      {/* Fila de abajo (descendente) */}
      <div 
        className="flex gap-1.5 overflow-x-auto scrollbar-hide snap-x" 
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {bottomRow.map((item) => (
          <div key={item.originalIndex} className="shrink-0 snap-center">
            {renderItem(item.value, item.originalIndex)}
          </div>
        ))}
      </div>
    </div>
  );
}
