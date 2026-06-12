import React from 'react';

export type FeltTheme = {
  base: string;              // capas de gradientes del fondo
  pattern?: string;          // textura/patrón repetido
  patternOpacity?: number;
  watermark?: string;        // símbolo grande centrado
  watermarkColor?: string;
  watermarkFont?: string;
  rim: string;               // color del aro interior de la mesa
  extras?: 'stars' | 'neon';
};

const suitLattice = (color: string) =>
  `repeating-linear-gradient(45deg, ${color} 0 1px, transparent 1px 18px), repeating-linear-gradient(-45deg, ${color} 0 1px, transparent 1px 18px)`;

export const FELT_THEMES: Record<string, FeltTheme> = {
  default: {
    base: 'radial-gradient(ellipse 80% 45% at 50% 0%, rgba(134,239,172,0.10), transparent 70%), radial-gradient(ellipse 130% 80% at 50% 35%, #15803d 0%, #14532d 45%, #052e16 80%, #000000 100%)',
    pattern: suitLattice('rgba(255,255,255,0.04)'),
    patternOpacity: 1,
    watermark: '♠',
    watermarkColor: 'rgba(255,255,255,0.05)',
    rim: 'rgba(217,164,65,0.18)',
  },
  felt_red: {
    base: 'radial-gradient(ellipse 80% 45% at 50% 0%, rgba(254,202,202,0.12), transparent 70%), radial-gradient(ellipse 130% 80% at 50% 32%, #b91c1c 0%, #7f1d1d 42%, #450a0a 75%, #1c0202 100%)',
    pattern: suitLattice('rgba(0,0,0,0.22)'),
    patternOpacity: 0.8,
    watermark: '♦',
    watermarkColor: 'rgba(255,255,255,0.06)',
    rim: 'rgba(248,113,113,0.25)',
  },
  felt_blue: {
    base: 'radial-gradient(ellipse 90% 45% at 50% 0%, rgba(147,197,253,0.16), transparent 70%), radial-gradient(ellipse 130% 80% at 50% 32%, #1d4ed8 0%, #1e3a8a 42%, #172554 72%, #020617 100%)',
    pattern: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 22px)',
    patternOpacity: 1,
    watermark: '♠',
    watermarkColor: 'rgba(191,219,254,0.07)',
    rim: 'rgba(147,197,253,0.22)',
  },
  felt_purple: {
    base: 'radial-gradient(ellipse 130% 80% at 50% 32%, #6b21a8 0%, #3b0764 45%, #1e0231 75%, #06000d 100%)',
    pattern: 'repeating-linear-gradient(0deg, rgba(217,70,239,0.10) 0 1px, transparent 1px 36px), repeating-linear-gradient(90deg, rgba(34,211,238,0.08) 0 1px, transparent 1px 36px)',
    patternOpacity: 1,
    watermark: '♣',
    watermarkColor: 'rgba(232,121,249,0.08)',
    rim: 'rgba(217,70,239,0.35)',
    extras: 'neon',
  },
  felt_vip: {
    base: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(250,204,21,0.10), transparent 65%), radial-gradient(ellipse 130% 80% at 50% 32%, #2b2008 0%, #1a1206 45%, #0c0803 75%, #000000 100%)',
    pattern: suitLattice('rgba(212,175,55,0.08)'),
    patternOpacity: 1,
    watermark: 'VIP',
    watermarkColor: 'rgba(212,175,55,0.07)',
    watermarkFont: 'Georgia, "Times New Roman", serif',
    rim: 'rgba(212,175,55,0.45)',
  },
  felt_galaxy: {
    base: 'radial-gradient(circle at 22% 28%, rgba(168,85,247,0.35), transparent 42%), radial-gradient(circle at 76% 18%, rgba(59,130,246,0.30), transparent 45%), radial-gradient(circle at 62% 72%, rgba(236,72,153,0.22), transparent 42%), radial-gradient(ellipse 130% 80% at 50% 35%, #312e81 0%, #1e1b4b 45%, #0c0a2e 75%, #000000 100%)',
    watermark: '✦',
    watermarkColor: 'rgba(199,210,254,0.08)',
    rim: 'rgba(165,180,252,0.28)',
    extras: 'stars',
  },
  felt_royal: {
    base: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(250,204,21,0.08), transparent 65%), radial-gradient(ellipse 130% 80% at 50% 32%, #047857 0%, #065f46 42%, #022c22 75%, #000000 100%)',
    pattern: suitLattice('rgba(250,204,21,0.07)'),
    patternOpacity: 1,
    watermark: '♛',
    watermarkColor: 'rgba(250,204,21,0.08)',
    rim: 'rgba(250,204,21,0.40)',
  },
};

export const getFeltTheme = (feltId?: string): FeltTheme =>
  (feltId && FELT_THEMES[feltId]) || FELT_THEMES.default;

/**
 * Superficie de tapete en capas. Rellena el contenedor padre (position absolute inset-0).
 * compact = versión para previews pequeñas (marca de agua más pequeña).
 */
export const FeltSurface: React.FC<{ feltId?: string; compact?: boolean }> = ({ feltId, compact }) => {
  const theme = getFeltTheme(feltId);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0" style={{ background: theme.base }} />
      {theme.pattern && (
        <div className="absolute inset-0" style={{ backgroundImage: theme.pattern, opacity: theme.patternOpacity ?? 1 }} />
      )}
      {theme.extras === 'stars' && (
        <>
          <div className="absolute inset-0 felt-stars" />
          <div className="absolute inset-0 felt-stars-2" />
        </>
      )}
      {theme.extras === 'neon' && (
        <div className={`absolute felt-neon-ring rounded-[50%] ${compact ? 'inset-2' : 'inset-x-6 top-[12%] bottom-[18%]'}`} />
      )}
      {theme.watermark && (
        <span
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-black select-none leading-none"
          style={{
            color: theme.watermarkColor,
            fontSize: compact ? '4.5rem' : 'min(45vw, 22rem)',
            fontFamily: theme.watermarkFont,
            letterSpacing: theme.watermark.length > 1 ? '0.05em' : undefined,
          }}
        >
          {theme.watermark}
        </span>
      )}
    </div>
  );
};
