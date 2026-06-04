"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextBlinds = exports.BLIND_LEVEL_DURATIONS = exports.blindsFor = exports.DEFAULT_BLIND_DIVISOR = exports.BLIND_DIVISORS = exports.STAKE_TIERS = void 0;
exports.STAKE_TIERS = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000];
exports.BLIND_DIVISORS = [20, 10, 5, 4];
exports.DEFAULT_BLIND_DIVISOR = 10;
const blindsFor = (buyIn, divisor) => {
    const d = exports.BLIND_DIVISORS.includes(divisor) ? divisor : exports.DEFAULT_BLIND_DIVISOR;
    const bigBlind = Math.round(buyIn / d);
    const smallBlind = Math.round(bigBlind / 2);
    return { smallBlind, bigBlind };
};
exports.blindsFor = blindsFor;
// --- Modo torneo (escalado de ciegas) ---
// Opciones para "tiempo de cambio de nivel". ms=0 → mesa cash (ciegas nunca suben).
exports.BLIND_LEVEL_DURATIONS = [
    { key: 'never', label: 'Nunca', sub: 'Mesa cash', ms: 0 },
    { key: 'turbo', label: 'Turbo', sub: '3 min/nivel', ms: 3 * 60 * 1000 },
    { key: 'normal', label: 'Normal', sub: '5 min/nivel', ms: 5 * 60 * 1000 },
    { key: 'deep', label: 'Lento', sub: '10 min/nivel', ms: 10 * 60 * 1000 },
];
// Sube las ciegas multiplicándolas por 2 (doble).
const nextBlinds = (bigBlind) => {
    const target = bigBlind * 2;
    return { bigBlind: target, smallBlind: Math.max(1, Math.round(target / 2)) };
};
exports.nextBlinds = nextBlinds;
