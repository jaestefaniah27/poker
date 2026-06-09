import React from 'react';

interface AvatarFrameProps {
  id: string;
}

export type FrameConfigType = {
  src: string;
  scale: number;
  top: number; // offset Y percent of its own height
  left: number; // offset X percent of its own width
};

export const FRAME_CONFIG: Record<string, FrameConfigType> = {
  "avatar_silver": {
    "src": "/avatars/plata_1.png",
    "scale": 201.5,
    "top": 0,
    "left": 0
  },
  "avatar_silver_2": {
    "src": "/avatars/plata_2.png",
    "scale": 223.5,
    "top": 2.5,
    "left": -0.5
  },
  "avatar_silver_3": {
    "src": "/avatars/plata_3.png",
    "scale": 228,
    "top": 1.5,
    "left": -0.5
  },
  "avatar_gold": {
    "src": "/avatars/gold_1.png",
    "scale": 103.5,
    "top": 1,
    "left": 0
  },
  "avatar_gold_2": {
    "src": "/avatars/gold_3.png",
    "scale": 143,
    "top": -0.5,
    "left": 0
  },
  "avatar_gold_3": {
    "src": "/avatars/gold_5.png",
    "scale": 164,
    "top": -1,
    "left": -0.5
  },
  "avatar_diamond": {
    "src": "/avatars/amatista_1.png",
    "scale": 112.5,
    "top": -0.5,
    "left": 0
  },
  "avatar_diamond_2": {
    "src": "/avatars/amatista_3.png",
    "scale": 143,
    "top": -0.5,
    "left": 0
  },
  "avatar_diamond_3": {
    "src": "/avatars/amatista_5.png",
    "scale": 164,
    "top": -1,
    "left": -0.5
  }
};

// Se permite inyectar configs personalizadas desde AvatarAdjuster en tiempo real
export const overrideFrameConfig = (newConfig: Record<string, FrameConfigType>) => {
  Object.assign(FRAME_CONFIG, newConfig);
};

export const AvatarFrame: React.FC<AvatarFrameProps> = ({ id }) => {
  const config = FRAME_CONFIG[id];

  if (config) {
    const { src, scale, top, left } = config;
    
    return (
      <img
        src={src}
        alt=""
        className="absolute z-20 pointer-events-none drop-shadow-lg max-w-none"
        style={{
          width: `${scale}%`,
          height: 'auto',
          top: '50%',
          left: '50%',
          transform: `translate(calc(-50% + ${left}%), calc(-50% + ${top}%))`
        }}
      />
    );
  }

  // Fallbacks for missing SVGs or Ruby/Emerald/Bronze
  const baseId = id.replace(/_\d+$/, '');
  const level = id.endsWith('_3') ? 3 : id.endsWith('_2') ? 2 : 1;

  switch (baseId) {
    case 'avatar_bronze':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full scale-[1.3] z-20 pointer-events-none drop-shadow-lg">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#d97706" strokeWidth="6" opacity="0.6" />
          {level >= 2 && <circle cx="50" cy="50" r="48" fill="none" stroke="#b45309" strokeWidth="2" strokeDasharray="5,5" className="animate-[spin_4s_linear_infinite]" />}
        </svg>
      );
    case 'avatar_ruby':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full scale-[1.3] z-20 pointer-events-none drop-shadow-lg">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#ef4444" strokeWidth="6" opacity="0.6" />
          {level >= 2 && <circle cx="50" cy="50" r="48" fill="none" stroke="#dc2626" strokeWidth="2" strokeDasharray="5,5" className="animate-[spin_4s_linear_infinite]" />}
        </svg>
      );
    case 'avatar_emerald':
      return (
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full scale-[1.3] z-20 pointer-events-none drop-shadow-lg">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#10b981" strokeWidth="6" opacity="0.6" />
          {level >= 2 && <circle cx="50" cy="50" r="48" fill="none" stroke="#059669" strokeWidth="2" strokeDasharray="5,5" className="animate-[spin_4s_linear_infinite]" />}
        </svg>
      );
    default:
      return null;
  }
};
