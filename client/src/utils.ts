import { io, Socket } from 'socket.io-client';
import { STAKE_TIERS, BLIND_DIVISORS, DEFAULT_BLIND_DIVISOR, blindsFor, toBig, fmt, m, add, sub, mul, div, gte, gt, lte, lt, eq, isZero, isNeg, maxM, minM, clampNonNeg, addClampedM, toStr, toNum } from '../../shared/types';
import type { Money, Decimal } from '../../shared/types';

export { STAKE_TIERS, BLIND_DIVISORS, DEFAULT_BLIND_DIVISOR, blindsFor, toBig, fmt, m, add, sub, mul, div, gte, gt, lte, lt, eq, isZero, isNeg, maxM, minM, clampNonNeg, addClampedM, toStr, toNum };
export type { Money, Decimal };

const socketPath = import.meta.env.VITE_SOCKET_PATH || '/socket.io';

export const socket: Socket = io(
  import.meta.env.PROD 
    ? '/'
    : `http://${window.location.hostname}:3001`,
  { path: socketPath }
);

export const getStorage = (): Storage => {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return sessionStorage;
  }
  return localStorage.getItem('devMode') === 'true' ? sessionStorage : localStorage;
};

export const BLIND_LABELS: Record<number, string> = { 20: 'Profunda', 10: 'Normal', 5: 'Rápida', 4: 'Express' };

// Formato de fichas: delega en fmt() de money.ts (Decimal, precisión uniforme).
export const fmtChips = (input: number | string | bigint | null | undefined): string =>
  fmt(input == null ? '0' : String(input));

// Formatea milisegundos como duración legible: "3d 5h", "2h 14m", "8m".
export const fmtDuration = (ms: number): string => {
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
};

// Traducción de los nombres de mano que devuelve pokersolver (server).
export const HAND_NAMES_ES: Record<string, string> = {
  'High Card': 'Carta alta',
  'Pair': 'Pareja',
  'Two Pair': 'Doble pareja',
  'Three of a Kind': 'Trío',
  'Straight': 'Escalera',
  'Flush': 'Color',
  'Full House': 'Full',
  'Four of a Kind': 'Póker',
  'Straight Flush': 'Escalera de color',
  'Royal Flush': 'Escalera real',
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
  createKnock(0.15);
};

export const vibrate = (pattern: number | number[]) => {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
};
