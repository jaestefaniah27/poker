// ============================================================
// money.ts — Capa única de dinero para TODA la app
// ------------------------------------------------------------
// Un solo tipo (Money = Decimal) para saldo, fichas en mesa, pots, bets,
// premios, pools, recompensas de misiones, precios de tienda — TODO.
// Precisión arbitraria: no hay límite 2^53 ni dualidad number/bigint.
//
// Reglas de uso:
//  - Construir SIEMPRE con m(x). Acepta string, number, Decimal o Money.
//  - Operar con los helpers (add, sub, mul, gte...) o métodos de Decimal.
//  - Persistir/wire con toStr(x) → string decimal entero.
//  - Mostrar con fmt(x) → "1.23Q", "450k", etc.
//  - El dinero del juego es SIEMPRE entero (sin decimales): las operaciones
//    que puedan generar fracciones (mul/div) se truncan con floorMoney.
// ============================================================

import Decimal from 'decimal.js';

// Config global: precisión generosa, sin notación exponencial en el rango
// del juego (hasta ~1e40), redondeo hacia abajo (favorece a la casa, nunca
// crea dinero de la nada).
Decimal.set({
  precision: 60,
  toExpNeg: -100,
  toExpPos: 100,
  rounding: Decimal.ROUND_DOWN,
});

export type Money = Decimal;
export { Decimal };

// Constructor universal. null/undefined/NaN → 0.
export const m = (v: string | number | bigint | Decimal | null | undefined): Money => {
  if (v == null) return new Decimal(0);
  if (v instanceof Decimal) return v;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return new Decimal(0);
    return new Decimal(v);
  }
  if (typeof v === 'bigint') return new Decimal(v.toString());
  const s = String(v).trim();
  if (s === '' || s === 'NaN') return new Decimal(0);
  try {
    return new Decimal(s);
  } catch {
    return new Decimal(0);
  }
};

// Trunca a entero (el dinero del juego no tiene decimales).
export const floorMoney = (v: Money): Money => v.floor();

// --- Aritmética (siempre devuelve entero truncado) ---
export const add = (a: Parameters<typeof m>[0], b: Parameters<typeof m>[0]): Money => m(a).plus(m(b)).floor();
export const sub = (a: Parameters<typeof m>[0], b: Parameters<typeof m>[0]): Money => m(a).minus(m(b)).floor();
export const mul = (a: Parameters<typeof m>[0], b: Parameters<typeof m>[0]): Money => m(a).times(m(b)).floor();
export const div = (a: Parameters<typeof m>[0], b: Parameters<typeof m>[0]): Money => m(a).div(m(b)).floor();

// --- Comparaciones ---
export const gte = (a: Parameters<typeof m>[0], b: Parameters<typeof m>[0]): boolean => m(a).gte(m(b));
export const gt  = (a: Parameters<typeof m>[0], b: Parameters<typeof m>[0]): boolean => m(a).gt(m(b));
export const lte = (a: Parameters<typeof m>[0], b: Parameters<typeof m>[0]): boolean => m(a).lte(m(b));
export const lt  = (a: Parameters<typeof m>[0], b: Parameters<typeof m>[0]): boolean => m(a).lt(m(b));
export const eq  = (a: Parameters<typeof m>[0], b: Parameters<typeof m>[0]): boolean => m(a).eq(m(b));
export const isZero = (a: Parameters<typeof m>[0]): boolean => m(a).isZero();
export const isNeg  = (a: Parameters<typeof m>[0]): boolean => m(a).isNegative();

// --- Utilidades ---
export const maxM = (a: Parameters<typeof m>[0], b: Parameters<typeof m>[0]): Money => { const x = m(a), y = m(b); return x.gte(y) ? x : y; };
export const minM = (a: Parameters<typeof m>[0], b: Parameters<typeof m>[0]): Money => { const x = m(a), y = m(b); return x.lte(y) ? x : y; };
// Clampa a no-negativo (regla de oro: saldo nunca < 0).
export const clampNonNeg = (a: Parameters<typeof m>[0]): Money => { const x = m(a); return x.isNegative() ? new Decimal(0) : x; };
// Suma delta a saldo, nunca por debajo de 0.
export const addClampedM = (balance: Parameters<typeof m>[0], delta: Parameters<typeof m>[0]): Money => clampNonNeg(add(balance, delta));

// --- Serialización ---
// Money → string decimal entero (canónico para DB y wire).
export const toStr = (v: Parameters<typeof m>[0]): string => m(v).floor().toFixed(0);
// Money → number (SOLO para usos seguros < 2^53, p.ej. fichas de mesa en libs externas). Evitar para saldos grandes.
export const toNum = (v: Parameters<typeof m>[0]): number => m(v).toNumber();

// --- Display ---
// Escala de unidades, idéntica a la antigua fmtChips (de mayor a menor).
const UNIT_TIERS: [Decimal, string][] = [
  [new Decimal('1e30'), 'No'], [new Decimal('1e27'), 'Oc'], [new Decimal('1e24'), 'Sp'],
  [new Decimal('1e21'), 'Sx'], [new Decimal('1e18'), 'Qi'], [new Decimal('1e15'), 'Q'],
  [new Decimal('1e12'), 'T'], [new Decimal('1e9'), 'B'], [new Decimal('1e6'), 'M'],
  [new Decimal('1e3'), 'k'],
];

// Money → string legible: "1.23Q", "450k", "-2M". 2 decimales truncados sin ceros.
export const fmt = (input: string | number | Decimal | null | undefined): string => {
  if (input == null) return '0';
  const v = m(input).floor();
  const neg = v.isNegative();
  const abs = neg ? v.negated() : v;
  for (const [tier, suf] of UNIT_TIERS) {
    if (abs.gte(tier)) {
      const whole = abs.div(tier).floor();
      const remainder = abs.minus(whole.times(tier));
      const frac = remainder.times(100).div(tier).floor();
      let fracStr = '';
      if (frac.gt(0)) {
        fracStr = '.' + frac.toFixed(0).padStart(2, '0').replace(/0+$/, '');
      }
      return (neg ? '-' : '') + whole.toFixed(0) + fracStr + suf;
    }
  }
  return v.toFixed(0);
};
