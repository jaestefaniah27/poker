// Motor de sonido sintetizado (WebAudio, sin assets).
// Todos los SFX se generan al vuelo: cero peso, latencia mínima.
import { getStorage } from './utils';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

const ensureCtx = (): AudioContext | null => {
  if (!ctx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
};

let muted = getStorage().getItem('pokerMuted') === '1';
export const isMuted = () => muted;
export const toggleMute = (): boolean => {
  muted = !muted;
  getStorage().setItem('pokerMuted', muted ? '1' : '0');
  return muted;
};

type ToneOpts = {
  freq: number;
  endFreq?: number;
  type?: OscillatorType;
  at?: number;        // offset en segundos
  dur?: number;       // duración
  vol?: number;
  attack?: number;
};

const tone = ({ freq, endFreq, type = 'sine', at = 0, dur = 0.15, vol = 0.5, attack = 0.005 }: ToneOpts) => {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
};

// Ruido corto (percusión: fichas, cartas, explosiones)
const noise = ({ at = 0, dur = 0.08, vol = 0.4, filterFreq = 4000, q = 1 }: { at?: number; dur?: number; vol?: number; filterFreq?: number; q?: number }) => {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + at;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  filter.Q.value = q;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter); filter.connect(gain); gain.connect(master);
  src.start(t0);
};

export const sfx = {
  /** Tap genérico de UI: blip corto y discreto */
  click: () => {
    tone({ freq: 880, endFreq: 660, type: 'triangle', dur: 0.05, vol: 0.18 });
  },

  /** Ficha al apostar: clac cerámico */
  chip: () => {
    noise({ dur: 0.04, vol: 0.5, filterFreq: 5500, q: 3 });
    tone({ freq: 2200, endFreq: 1400, type: 'square', dur: 0.03, vol: 0.08 });
  },

  /** Lluvia de fichas (ganar bote) */
  chips: () => {
    for (let i = 0; i < 6; i++) {
      noise({ at: i * 0.05 + Math.random() * 0.02, dur: 0.04, vol: 0.35, filterFreq: 4500 + Math.random() * 2500, q: 3 });
    }
  },

  /** Carta repartida: swish */
  card: () => {
    noise({ dur: 0.09, vol: 0.3, filterFreq: 2500, q: 0.8 });
  },

  /** Moneda: ganancia pequeña, recompensa */
  coin: () => {
    tone({ freq: 1568, type: 'square', dur: 0.06, vol: 0.15 });
    tone({ freq: 2093, type: 'square', at: 0.06, dur: 0.18, vol: 0.15 });
  },

  /** Compra: cha-ching caja registradora */
  buy: () => {
    noise({ dur: 0.05, vol: 0.3, filterFreq: 6000, q: 2 });
    tone({ freq: 1318, type: 'square', at: 0.05, dur: 0.07, vol: 0.14 });
    tone({ freq: 1760, type: 'square', at: 0.12, dur: 0.2, vol: 0.16 });
  },

  /** Tu turno: chime de atención (dos notas) */
  turn: () => {
    tone({ freq: 660, type: 'sine', dur: 0.12, vol: 0.3 });
    tone({ freq: 990, type: 'sine', at: 0.1, dur: 0.22, vol: 0.3 });
  },

  /** Victoria normal: arpegio ascendente mayor */
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, type: 'triangle', at: i * 0.09, dur: 0.22, vol: 0.3 }));
  },

  /** Victoria GORDA: fanfarria + brillos */
  bigWin: () => {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) =>
      tone({ freq: f, type: 'triangle', at: i * 0.09, dur: 0.3, vol: 0.32 }));
    [2093, 2637, 3136].forEach((f, i) =>
      tone({ freq: f, type: 'sine', at: 0.55 + i * 0.07, dur: 0.4, vol: 0.15 }));
    for (let i = 0; i < 8; i++) {
      noise({ at: 0.5 + i * 0.06, dur: 0.04, vol: 0.2, filterFreq: 5000 + Math.random() * 3000, q: 4 });
    }
  },

  /** Derrota: descenso suave, sin castigar */
  lose: () => {
    tone({ freq: 392, endFreq: 262, type: 'sine', dur: 0.3, vol: 0.22 });
    tone({ freq: 196, endFreq: 131, type: 'sine', at: 0.05, dur: 0.35, vol: 0.15 });
  },

  /** Empate / push: nota neutra */
  push: () => {
    tone({ freq: 523, type: 'sine', dur: 0.15, vol: 0.2 });
    tone({ freq: 523, type: 'sine', at: 0.18, dur: 0.15, vol: 0.2 });
  },

  /** Tick de ruleta/rueda girando */
  tick: () => {
    tone({ freq: 1800, endFreq: 1200, type: 'square', dur: 0.025, vol: 0.1 });
  },

  /** Tick de cuenta atrás (urgencia) */
  countdown: () => {
    tone({ freq: 1047, type: 'sine', dur: 0.08, vol: 0.22 });
  },

  /** Revelar gema en Mines: pitch sube con la racha */
  reveal: (streak = 0) => {
    const f = 660 * Math.pow(1.0905, Math.min(streak, 16)); // sube ~1 semitono por acierto
    tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.28 });
    tone({ freq: f * 1.5, type: 'sine', at: 0.05, dur: 0.15, vol: 0.14 });
  },

  /** Explosión (mina / crash) */
  boom: () => {
    noise({ dur: 0.5, vol: 0.7, filterFreq: 300, q: 0.5 });
    tone({ freq: 120, endFreq: 30, type: 'sawtooth', dur: 0.5, vol: 0.4 });
  },

  /** Cash-out: campana + monedas */
  cashout: () => {
    tone({ freq: 1568, type: 'triangle', dur: 0.3, vol: 0.3 });
    tone({ freq: 2093, type: 'triangle', at: 0.12, dur: 0.35, vol: 0.25 });
    for (let i = 0; i < 4; i++) {
      noise({ at: 0.15 + i * 0.07, dur: 0.04, vol: 0.25, filterFreq: 6000, q: 3 });
    }
  },

  /** Jackpot: fanfarria larga de máquina tragaperras */
  jackpot: () => {
    const melody = [523, 659, 784, 1047, 784, 1047, 1319, 1568];
    melody.forEach((f, i) =>
      tone({ freq: f, type: 'square', at: i * 0.12, dur: 0.18, vol: 0.2 }));
    melody.forEach((f, i) =>
      tone({ freq: f * 2, type: 'sine', at: i * 0.12 + 0.03, dur: 0.15, vol: 0.1 }));
    for (let i = 0; i < 14; i++) {
      noise({ at: 0.9 + i * 0.05, dur: 0.04, vol: 0.22, filterFreq: 4500 + Math.random() * 3500, q: 4 });
    }
  },

  /** Subida de tensión (crash multiplier, ruleta frenando) */
  rise: () => {
    tone({ freq: 220, endFreq: 880, type: 'sawtooth', dur: 0.5, vol: 0.12 });
  },
};
