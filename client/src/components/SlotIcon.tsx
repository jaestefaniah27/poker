import { useId } from 'react';

interface Props {
  symbol: string;
  className?: string;
}

export default function SlotIcon({ symbol, className = "w-full h-full" }: Props) {
  const uid = useId().replace(/:/g, '');

  switch (symbol) {
    case 'heart':
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <path d="M32 54C32 54 10 38 10 22C10 14 16 8 24 8C28 8 32 12 32 12C32 12 36 8 40 8C48 8 54 14 54 22C54 38 32 54 32 54Z" fill={`url(#heartGrad-${uid})`} stroke="#ef4444" strokeWidth="2" strokeLinejoin="round"/>
          <path d="M18 20C18 16 22 14 26 14" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
          <defs>
            <linearGradient id={`heartGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f87171"/>
              <stop offset="50%" stopColor="#dc2626"/>
              <stop offset="100%" stopColor="#991b1b"/>
            </linearGradient>
          </defs>
        </svg>
      );
    case 'diamond':
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <path d="M32 6L54 32L32 58L10 32L32 6Z" fill={`url(#diamondGrad-${uid})`} stroke="#ef4444" strokeWidth="2" strokeLinejoin="round"/>
          <path d="M22 20L32 12" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
          <defs>
            <linearGradient id={`diamondGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f87171"/>
              <stop offset="50%" stopColor="#dc2626"/>
              <stop offset="100%" stopColor="#991b1b"/>
            </linearGradient>
          </defs>
        </svg>
      );
    case 'club':
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <path d="M32 30 C38 30 46 32 46 40 C46 48 36 48 32 44 C28 48 18 48 18 40 C18 32 26 30 32 30 Z" fill={`url(#clubGrad-${uid})`}/>
          <circle cx="32" cy="20" r="12" fill={`url(#clubGrad-${uid})`}/>
          <path d="M32 42 L24 56 H40 Z" fill={`url(#clubGrad-${uid})`}/>
          <defs>
            <linearGradient id={`clubGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#67e8f9"/>
              <stop offset="50%" stopColor="#06b6d4"/>
              <stop offset="100%" stopColor="#164e63"/>
            </linearGradient>
          </defs>
        </svg>
      );
    case 'spade':
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <path d="M32 8 C32 8 50 30 50 42 C50 50 40 54 32 46 C24 54 14 50 14 42 C14 30 32 8 32 8 Z" fill={`url(#spadeGrad-${uid})`}/>
          <path d="M32 42 L24 58 H40 Z" fill={`url(#spadeGrad-${uid})`}/>
          <defs>
            <linearGradient id={`spadeGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#c084fc"/>
              <stop offset="50%" stopColor="#9333ea"/>
              <stop offset="100%" stopColor="#4c1d95"/>
            </linearGradient>
          </defs>
        </svg>
      );
    case 'chip':
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <circle cx="32" cy="32" r="26" fill="#111827" stroke="#fbbf24" strokeWidth="4"/>
          <circle cx="32" cy="32" r="18" fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="6 4"/>
          <circle cx="32" cy="32" r="12" fill="#fbbf24"/>
          <path d="M32 6V14 M32 50V58 M6 32H14 M50 32H58" stroke="#fbbf24" strokeWidth="6"/>
          <path d="M14 14L20 20 M44 44L50 50 M14 50L20 44 M44 20L50 14" stroke="#fbbf24" strokeWidth="6"/>
        </svg>
      );
    case 'crown':
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <path d="M10 50L12 24L24 36L32 12L40 36L52 24L54 50H10Z" fill={`url(#crownGrad-${uid})`} stroke="#fcd34d" strokeWidth="2" strokeLinejoin="round"/>
          <circle cx="12" cy="22" r="4" fill="#60a5fa"/>
          <circle cx="32" cy="10" r="4" fill="#f87171"/>
          <circle cx="52" cy="22" r="4" fill="#60a5fa"/>
          <path d="M16 44H48" stroke="#b45309" strokeWidth="3" strokeLinecap="round"/>
          <defs>
            <linearGradient id={`crownGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fde047"/>
              <stop offset="50%" stopColor="#eab308"/>
              <stop offset="100%" stopColor="#a16207"/>
            </linearGradient>
          </defs>
        </svg>
      );
    case 'ace':
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <path d="M32 8L16 56H24L28 44H36L40 56H48L32 8Z" fill={`url(#aceGrad-${uid})`} stroke="#fde047" strokeWidth="2" strokeLinejoin="round"/>
          <path d="M32 20L29 36H35L32 20Z" fill="#1e1b4b"/>
          <path d="M32 4L34 10H40L35 14L37 20L32 16L27 20L29 14L24 10H30L32 4Z" fill="#ffffff"/>
          <defs>
            <linearGradient id={`aceGrad-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fbbf24"/>
              <stop offset="50%" stopColor="#d97706"/>
              <stop offset="100%" stopColor="#92400e"/>
            </linearGradient>
          </defs>
        </svg>
      );
    case 'spin':
    default:
      return (
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
          <circle cx="32" cy="32" r="28" fill="#1c1c1c" stroke="#374151" strokeWidth="4"/>
          <text x="32" y="44" fontFamily="sans-serif" fontSize="36" fill="#6b7280" textAnchor="middle" fontWeight="bold">?</text>
        </svg>
      );
  }
}
