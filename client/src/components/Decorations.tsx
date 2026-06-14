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

export const DecoratedName: React.FC<{ name: string; decorationId?: string; className?: string }> = ({ name, decorationId, className = '' }) => {
  return (
    <span className={`${getNameDecorationClasses(decorationId)} ${className}`}>
      {name}
    </span>
  );
};
