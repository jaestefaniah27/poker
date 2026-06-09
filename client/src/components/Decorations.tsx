import React from 'react';

export const getAvatarDecorationClasses = (id?: string) => {
  switch (id) {
    case 'avatar_bronze': return 'border-[3px] border-[#cd7f32] shadow-[0_0_10px_#cd7f32]';
    case 'avatar_silver': return 'border-[3px] border-[#c0c0c0] shadow-[0_0_12px_#c0c0c0]';
    case 'avatar_gold': return 'border-[3px] border-[#ffd700] shadow-[0_0_15px_#ffd700] ring-1 ring-[#ffd700]';
    case 'avatar_diamond': return 'border-[3px] border-[#b9f2ff] shadow-[0_0_20px_#b9f2ff] ring-2 ring-[#00e5ff] animate-pulse';
    case 'avatar_ruby': return 'border-[4px] border-[#e0115f] shadow-[0_0_25px_#e0115f] ring-2 ring-red-500 animate-pulse';
    case 'avatar_emerald': return 'border-[4px] border-[#50c878] shadow-[0_0_30px_#50c878] ring-4 ring-green-400 animate-bounce';
    default: return 'border-2 border-transparent';
  }
};

export const getNameDecorationClasses = (id?: string) => {
  switch (id) {
    case 'name_silver': return 'text-[#c0c0c0] font-black drop-shadow-[0_2px_2px_rgba(192,192,192,0.8)] border-b-2 border-[#c0c0c0]';
    case 'name_gold': return 'text-[#ffd700] font-black drop-shadow-[0_2px_4px_rgba(255,215,0,0.8)] border-b-2 border-[#ffd700] uppercase tracking-wider';
    case 'name_diamond': return 'text-transparent bg-clip-text bg-gradient-to-r from-[#b9f2ff] to-[#00e5ff] font-black drop-shadow-[0_0_8px_#00e5ff] uppercase tracking-widest';
    case 'name_ruby': return 'text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-[#e0115f] font-black drop-shadow-[0_0_10px_#e0115f] uppercase tracking-widest';
    case 'name_emerald': return 'text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-[#50c878] font-black drop-shadow-[0_0_12px_#50c878] uppercase tracking-widest';
    case 'name_rainbow': return 'text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 font-black animate-pulse drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] uppercase tracking-widest';
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
