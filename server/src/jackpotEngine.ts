import { dbRun, dbAll, dbGet } from './db';

const SYMBOLS = ['club', 'diamond', 'heart', 'spade', 'chip', 'crown', 'ace'] as const;
type Sym = typeof SYMBOLS[number];

// Pesos base: los 4 palos comunes son frecuentes, chip/crown/ace son raros
//              club  diamond  heart  spade  chip  crown  ace
const BASE_WEIGHTS = [32,   25,     25,    15,    4,    3,     2];

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
      // Descartar entradas cuyo spinNumber parece inflado por batch antiguo
      const rawWins: JackpotWin[] = state.recentWins ?? [];
      const spinsLoaded = state.globalSpins ?? 0;
      recentWins = rawWins.filter(w => (spinsLoaded - w.spinNumber) <= 500);
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
    return 1;
  }
  return 0;
}

// Persiste el estado a DB. Lo usa el batch del artilugio para guardar UNA sola
// vez tras N tiradas (en vez de N escrituras), sin perder precisión del conteo.
export const persistJackpotState = async (): Promise<void> => {
  await saveJackpotState();
};

// deferSave: el caller (batch artilugio) guarda al final con persistJackpotState().
// globalSpins SIEMPRE incrementa por tirada → el historial refleja la distancia
// real de cada premio (como si se tiraran a mano, una a una).
export const spinJackpot = (playerName: string, isFreeSpin = false, bet = 0, isBot = false, deferSave = false): { symbols: [string, string, string]; multiplier: number; state: JackpotState } => {
  globalSpins++;
  spinsSinceAce++;
  spinsSinceCrown++;
  spinsSinceChip++;

  // Pity timer exponencial con límites aleatorios por tirada para mayor impredecibilidad
  const aceTarget = 50 + Math.random() * 50; // Entre 50 y 100
  const crownTarget = 20 + Math.random() * 30; // Entre 20 y 50
  const chipTarget = 10 + Math.random() * 50; // Entre 10 y 25

  const acePity   = Math.floor(Math.pow(spinsSinceAce / aceTarget, 3) * 50);
  const crownPity = Math.floor(Math.pow(spinsSinceCrown / crownTarget, 3) * 25);
  const chipPity  = Math.floor(Math.pow(spinsSinceChip / chipTarget, 3) * 10);

  const dynamicWeights = [...BASE_WEIGHTS];
  dynamicWeights[4] += chipPity;  // chip
  dynamicWeights[5] += crownPity; // crown
  dynamicWeights[6] += acePity;   // ace

  let symbols: [Sym, Sym, Sym] = [
    weightedRandom(dynamicWeights),
    weightedRandom(dynamicWeights),
    weightedRandom(dynamicWeights)
  ];

  let multiplier = getMultiplier(symbols, isFreeSpin);

  if (isBot && multiplier > 0) {
    multiplier = 0;
    const losingCombos: [Sym, Sym, Sym][] = [
      ['club', 'heart', 'diamond'],
      ['spade', 'club', 'heart'],
      ['diamond', 'spade', 'club']
    ];
    symbols = losingCombos[Math.floor(Math.random() * losingCombos.length)];
  }

  // Todos los jugadores aparecen en el historial — sin exclusiones por nombre.
  // spinNumber = globalSpins actual → distancia real de cada premio (también en batch).
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

  // En batch no guardamos por cada spin — el caller llama persistJackpotState() al final
  if (!deferSave) saveJackpotState().catch(err => console.error('Error saving jackpot state:', err));

  return { symbols, multiplier, state: getJackpotState() };
};
