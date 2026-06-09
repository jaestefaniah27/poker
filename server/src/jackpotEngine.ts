import { dbRun, dbAll, dbGet } from './db';

const SYMBOLS = ['club', 'diamond', 'heart', 'spade', 'chip', 'crown', 'ace'] as const;
type Sym = typeof SYMBOLS[number];

// Pesos base: los 4 palos comunes son frecuentes, chip/crown/ace son raros
//              club  diamond  heart  spade  chip  crown  ace
const BASE_WEIGHTS = [35,   25,     25,    15,    3,    2,     1];

export interface JackpotWin {
  type: 'ace' | 'crown' | 'chip';
  playerName: string;
  spinNumber: number;
  winAmount: number;
}

export interface JackpotState {
  globalSpins: number;
  recentWins: JackpotWin[];
}

let globalSpins = 0;
let spinsSinceAce = 0;
let spinsSinceCrown = 0;
let spinsSinceChip = 0;
let recentWins: JackpotWin[] = [];

// --- Persistencia de premios recientes ---
export const loadJackpotState = async (): Promise<void> => {
  const row = await dbGet<{ data: string }>('SELECT data FROM jackpot_state WHERE id = 1');
  if (row) {
    try {
      const state = JSON.parse(row.data);
      globalSpins = state.globalSpins ?? 0;
      spinsSinceAce = state.spinsSinceAce ?? 0;
      spinsSinceCrown = state.spinsSinceCrown ?? 0;
      spinsSinceChip = state.spinsSinceChip ?? 0;
      recentWins = state.recentWins ?? [];
      console.log(`Jackpot state loaded: ${globalSpins} global spins, ${recentWins.length} recent wins`);
    } catch (e) {
      console.error('Error parsing jackpot state:', e);
    }
  }
};

const saveJackpotState = async (): Promise<void> => {
  const data = JSON.stringify({ globalSpins, spinsSinceAce, spinsSinceCrown, spinsSinceChip, recentWins });
  await dbRun('INSERT OR REPLACE INTO jackpot_state (id, data) VALUES (1, ?)', [data]);
};

export const getJackpotState = (): JackpotState => {
  return { globalSpins, recentWins };
};

function weightedRandom(currentWeights: number[]): Sym {
  let r = Math.random() * currentWeights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < SYMBOLS.length; i++) {
    r -= currentWeights[i];
    if (r <= 0) return SYMBOLS[i];
  }
  return SYMBOLS[0];
}

function getMultiplier(s: [Sym, Sym, Sym], isFreeSpin: boolean): number {
  const [a, b, c] = s;
  if (a === b && b === c) {
    if (a === 'ace') return 50;
    if (a === 'crown') return 20;
    if (a === 'chip') return 10;
    return 3;
  }
  if (a === b || b === c || a === c) {
    const pairSymbol = (a === b || a === c) ? a : b;
    if (['chip', 'crown', 'ace'].includes(pairSymbol)) return 1;
    return 0;
  }
  return 0;
}

export const spinJackpot = (playerName: string, isFreeSpin = false, bet = 0): { symbols: [string, string, string]; multiplier: number; state: JackpotState } => {
  globalSpins++;
  spinsSinceAce++;
  spinsSinceCrown++;
  spinsSinceChip++;

  // Pity timer exponencial con límites aleatorios por tirada para mayor impredecibilidad
  const aceTarget = 100 + Math.random() * 400; // Entre 100 y 500
  const crownTarget = 50 + Math.random() * 200; // Entre 50 y 250
  const chipTarget = 30 + Math.random() * 140; // Entre 30 y 170

  const acePity   = Math.floor(Math.pow(spinsSinceAce / aceTarget, 3) * 1000);
  const crownPity = Math.floor(Math.pow(spinsSinceCrown / crownTarget, 3) * 500);
  const chipPity  = Math.floor(Math.pow(spinsSinceChip / chipTarget, 3) * 300);

  const dynamicWeights = [...BASE_WEIGHTS];
  dynamicWeights[4] += chipPity;  // chip
  dynamicWeights[5] += crownPity; // crown
  dynamicWeights[6] += acePity;   // ace

  const symbols: [Sym, Sym, Sym] = [
    weightedRandom(dynamicWeights),
    weightedRandom(dynamicWeights),
    weightedRandom(dynamicWeights)
  ];

  const multiplier = getMultiplier(symbols, isFreeSpin);

  if (multiplier === 50) {
    spinsSinceAce = 0;
    recentWins.unshift({ type: 'ace', playerName, spinNumber: globalSpins, winAmount: Math.floor(bet * multiplier) });
  } else if (multiplier === 20) {
    spinsSinceCrown = 0;
    recentWins.unshift({ type: 'crown', playerName, spinNumber: globalSpins, winAmount: Math.floor(bet * multiplier) });
  } else if (multiplier === 10) {
    spinsSinceChip = 0;
    recentWins.unshift({ type: 'chip', playerName, spinNumber: globalSpins, winAmount: Math.floor(bet * multiplier) });
  }

  if (recentWins.length > 3) {
    recentWins = recentWins.slice(0, 3);
  }

  // Guardar estado asíncronamente (no bloqueamos)
  saveJackpotState().catch(err => console.error('Error saving jackpot state:', err));

  return { symbols, multiplier, state: getJackpotState() };
};
