import { io, Socket } from 'socket.io-client';
import { STAKE_TIERS, BLIND_DIVISORS, DEFAULT_BLIND_DIVISOR, blindsFor } from '../../shared/types';

export { STAKE_TIERS, BLIND_DIVISORS, DEFAULT_BLIND_DIVISOR, blindsFor };

export const socket: Socket = io(
  import.meta.env.PROD 
    ? '/' // En producción asume que está servido a través del mismo Nginx Proxy
    : `http://${window.location.hostname}:3001`
);

export const getStorage = (): Storage => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return sessionStorage;
  }
  return localStorage.getItem('devMode') === 'true' ? sessionStorage : localStorage;
};

export const BLIND_LABELS: Record<number, string> = { 20: 'Profunda', 10: 'Normal', 5: 'Rápida', 4: 'Express' };

export const fmtChips = (n: number | null | undefined): string => {
  if (n == null) return '0';
  const abs = Math.abs(n);
  
  const trunc2 = (v: number) => {
    const match = v.toString().match(/^-?\d+(?:\.\d{0,2})?/);
    return match ? match[0] : '0';
  };

  if (abs >= 1_000_000_000_000_000) return trunc2(n / 1_000_000_000_000_000) + 'Q';
  if (abs >= 1_000_000_000_000) return trunc2(n / 1_000_000_000_000) + 'T';
  if (abs >= 1_000_000_000) return trunc2(n / 1_000_000_000) + 'B';
  if (abs >= 1_000_000) return trunc2(n / 1_000_000) + 'M';
  if (abs >= 1000) return trunc2(n / 1000) + 'k';
  
  return String(n);
};

export const HAND_RANKINGS = [
  { name: "Royal Flush", desc: "Highest-ranking straight flush", cards: [{r:'A',s:'h'}, {r:'K',s:'h'}, {r:'Q',s:'h'}, {r:'J',s:'h'}, {r:'10',s:'h'}], active: [0,1,2,3,4] },
  { name: "Straight Flush", desc: "5 same-suit cards in sequence", cards: [{r:'J',s:'c'}, {r:'10',s:'c'}, {r:'9',s:'c'}, {r:'8',s:'c'}, {r:'7',s:'c'}], active: [0,1,2,3,4] },
  { name: "Four of a Kind", desc: "4 cards of the same rank", cards: [{r:'8',s:'s'}, {r:'8',s:'h'}, {r:'8',s:'c'}, {r:'8',s:'d'}, {r:'6',s:'s'}], active: [0,1,2,3] },
  { name: "Full House", desc: "Three of a kind with a pair", cards: [{r:'A',s:'h'}, {r:'A',s:'c'}, {r:'A',s:'d'}, {r:'10',s:'s'}, {r:'10',s:'d'}], active: [0,1,2,3,4] },
  { name: "Flush", desc: "5 cards of the same suit", cards: [{r:'K',s:'s'}, {r:'J',s:'s'}, {r:'9',s:'s'}, {r:'8',s:'s'}, {r:'2',s:'s'}], active: [0,1,2,3,4] },
  { name: "Straight", desc: "5 cards in sequence", cards: [{r:'10',s:'c'}, {r:'9',s:'d'}, {r:'8',s:'s'}, {r:'7',s:'h'}, {r:'6',s:'s'}], active: [0,1,2,3,4] },
  { name: "Three of a Kind", desc: "3 cards of the same rank", cards: [{r:'7',s:'s'}, {r:'7',s:'h'}, {r:'7',s:'c'}, {r:'K',s:'h'}, {r:'J',s:'c'}], active: [0,1,2] },
  { name: "Two Pair", desc: "2 cards of the same rank twice", cards: [{r:'J',s:'s'}, {r:'J',s:'h'}, {r:'4',s:'s'}, {r:'4',s:'d'}, {r:'Q',s:'c'}], active: [0,1,2,3] },
  { name: "Pair", desc: "2 cards of the same rank", cards: [{r:'K',s:'s'}, {r:'K',s:'d'}, {r:'9',s:'s'}, {r:'2',s:'c'}, {r:'10',s:'s'}], active: [0,1] },
  { name: "High Card", desc: "Highest-ranking card", cards: [{r:'A',s:'c'}, {r:'7',s:'s'}, {r:'3',s:'h'}, {r:'9',s:'s'}, {r:'2',s:'c'}], active: [0] },
];

let audioCtx: AudioContext | null = null;

const initAudio = () => {
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
};

export const playCheckSound = () => {
  initAudio();
  if (!audioCtx) return;
  
  const createKnock = (timeOffset: number) => {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // Wood knock characteristics: short, low frequency punch
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime + timeOffset);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + timeOffset + 0.05);
    
    gain.gain.setValueAtTime(0, audioCtx.currentTime + timeOffset);
    gain.gain.linearRampToValueAtTime(1, audioCtx.currentTime + timeOffset + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + timeOffset + 0.05);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(audioCtx.currentTime + timeOffset);
    osc.stop(audioCtx.currentTime + timeOffset + 0.06);
  };

  createKnock(0);
  createKnock(0.15); // Second knock
};

export const vibrate = (pattern: number | number[]) => {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
};
