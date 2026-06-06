const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'] as const;
type Sym = typeof SYMBOLS[number];

// Mayor peso = sale más veces
const WEIGHTS = [30, 25, 20, 15, 5, 3, 2];

function weightedRandom(): Sym {
  let r = Math.random() * WEIGHTS.reduce((a, b) => a + b, 0);
  for (let i = 0; i < SYMBOLS.length; i++) {
    r -= WEIGHTS[i];
    if (r <= 0) return SYMBOLS[i];
  }
  return SYMBOLS[0];
}

function getMultiplier(s: [Sym, Sym, Sym]): number {
  const [a, b, c] = s;
  if (a === b && b === c) {
    if (a === '💎') return 50;
    if (a === '7️⃣') return 20;
    if (a === '⭐') return 10;
    return 5;
  }
  if (a === b || b === c || a === c) return 1.5;
  return 0;
}

export const spinJackpot = (): { symbols: [string, string, string]; multiplier: number } => {
  const symbols: [Sym, Sym, Sym] = [weightedRandom(), weightedRandom(), weightedRandom()];
  return { symbols, multiplier: getMultiplier(symbols) };
};
