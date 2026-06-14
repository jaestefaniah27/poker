import React from 'react';

export const getNameDecorationClasses = (id?: string) => {
  switch (id) {
    case 'name_silver': return 'text-[#c0c0c0] font-black border-b-2 border-[#c0c0c0]';
    case 'name_gold': return 'text-[#ffd700] font-black uppercase tracking-wider';
    case 'name_diamond': return 'text-transparent bg-clip-text bg-gradient-to-r from-[#b9f2ff] to-[#00e5ff] font-black uppercase tracking-widest';
    case 'name_emerald': return 'text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-[#50c878] font-black uppercase tracking-widest';
    case 'name_rainbow': return 'text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 font-black animate-gradient-x uppercase tracking-widest';
    case 'name_fire': return 'text-transparent bg-clip-text bg-gradient-to-t from-red-600 via-orange-500 to-yellow-300 font-black uppercase tracking-widest animate-gradient-x';
    case 'name_royal': return 'text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 via-amber-500 to-yellow-200 animate-gradient-x font-black uppercase tracking-widest';
    default: return 'text-white font-bold';
  }
};

export const DecoratedName: React.FC<{ name: string; decorationId?: string; className?: string; andorra?: boolean }> = ({ name, decorationId, className = '', andorra }) => {
  return (
    <span className={`inline-flex items-center justify-center gap-0.5 ${className}`}>
      <span className={`${getNameDecorationClasses(decorationId)} truncate`}>{name}</span>
      {andorra && <img src="https://flagcdn.com/ad.svg" alt="Andorra" className="h-[0.85em] w-auto inline-block flex-shrink-0" title="Empadronado en Andorra" />}
    </span>
  );
};
