const SYMBOLS = ['club', 'diamond', 'heart', 'spade', 'chip', 'ace'] as const;
type Sym = typeof SYMBOLS[number];

const BASE_WEIGHTS = [40, 20, 20, 10, 5, 5];

export interface JackpotWin {
  type: 'ace' | 'chip';
  playerName: string;
  spinNumber: number;
}

export interface JackpotState {
  globalSpins: number;
  recentWins: JackpotWin[];
}

let globalSpins = 0;
let spinsSinceAce = 0;
let spinsSinceChip = 0;
let recentWins: JackpotWin[] = [];

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

function getMultiplier(s: [Sym, Sym, Sym]): number {
  const [a, b, c] = s;
  if (a === b && b === c) {
    if (a === 'ace') return 50;
    if (a === 'chip') return 10;
    return 5;
  }
  if (a === b || b === c || a === c) return 1.5;
  return 0;
}

export const spinJackpot = (playerName: string): { symbols: [string, string, string]; multiplier: number; state: JackpotState } => {
  globalSpins++;
  spinsSinceAce++;
  spinsSinceChip++;

  let symbols: [Sym, Sym, Sym];
  
  // En lugar de forzarlo de golpe, la probabilidad crece exponencialmente
  // Cuanto más se acerca a su límite (50 para el as, 30 para la ficha), el peso se vuelve tan masivo que sale de forma natural.
  const acePity = Math.floor(Math.pow(spinsSinceAce / 100, 3) * 1000); 
  const chipPity = Math.floor(Math.pow(spinsSinceChip / 50, 3) * 500);

  const dynamicWeights = [...BASE_WEIGHTS];
  dynamicWeights[4] += chipPity; // chip
  dynamicWeights[5] += acePity;  // ace

  symbols = [weightedRandom(dynamicWeights), weightedRandom(dynamicWeights), weightedRandom(dynamicWeights)];

  const multiplier = getMultiplier(symbols);

  if (multiplier === 50) {
    spinsSinceAce = 0;
    recentWins.unshift({ type: 'ace', playerName, spinNumber: globalSpins });
  } else if (multiplier === 10) {
    spinsSinceChip = 0;
    recentWins.unshift({ type: 'chip', playerName, spinNumber: globalSpins });
  }

  if (recentWins.length > 2) {
    recentWins = recentWins.slice(0, 2);
  }

  return { symbols, multiplier, state: getJackpotState() };
};
