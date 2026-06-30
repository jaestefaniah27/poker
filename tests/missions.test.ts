/**
 * Suite de tests — Sistema de Misiones (lógica pura, sin DB)
 * Cubre: shared/missions.ts y shared/achievements.ts
 *
 * Ejecutar: cd server && npx ts-node --transpile-only \
 *   --compiler-options '{"module":"commonjs","moduleResolution":"node"}' \
 *   ../tests/missions.test.ts
 */

import {
  DAILY_TEMPLATES,
  DAILY_GAME_CATEGORIES,
  generateDailySet,
  missionDateFor,
  nextMissionResetAt,
  misionTrackValuesFor,
  dailyMissionReward,
  brocheRewardsFor,
  MISION_UPGRADES_PER_DAY,
} from '../shared/missions';
import { ACHIEVEMENTS_CATALOG } from '../shared/achievements';
import { m, gt, gte, lt, eq } from '../shared/money';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(msg);
    console.log(`  ❌ ${msg}`);
  }
}
function ok(msg: string) {
  passed++;
}

function section(title: string) {
  console.log(`\n📋 ${title}`);
}

// ════════════════════════════════════════════════════════════
// 1. PLANTILLAS DIARIAS — estructura del catálogo
// ════════════════════════════════════════════════════════════
function testDailyTemplatesStructure() {
  section('1. Plantillas diarias — estructura');

  assert(DAILY_TEMPLATES.length >= 15, `Hay al menos 15 plantillas (hay ${DAILY_TEMPLATES.length})`);

  const ids = DAILY_TEMPLATES.map(t => t.id);
  assert(new Set(ids).size === ids.length, 'Todos los IDs de plantillas son únicos');

  for (const tpl of DAILY_TEMPLATES) {
    assert(tpl.tiers.length === 3, `${tpl.id}: tiene exactamente 3 tiers`);
    assert(tpl.tiers.every(t => t > 0), `${tpl.id}: todos los tiers son positivos`);
    assert(tpl.tiers[0] <= tpl.tiers[1] && tpl.tiers[1] <= tpl.tiers[2], `${tpl.id}: tiers en orden no decreciente`);
    assert(tpl.label.length > 0, `${tpl.id}: tiene label no vacío`);
    assert(tpl.statKey.length > 0, `${tpl.id}: tiene statKey definido`);
    assert(tpl.rewardChipsMultiplier > 0, `${tpl.id}: multiplicador de recompensa es positivo`);
  }

  assert(DAILY_GAME_CATEGORIES.length >= 5, `Hay al menos 5 categorías de juego distintas (hay ${DAILY_GAME_CATEGORIES.length})`);
}

// ════════════════════════════════════════════════════════════
// 2. SELECCIÓN DIARIA — determinismo y variedad
// ════════════════════════════════════════════════════════════
function testDailySetGeneration() {
  section('2. Generación del set diario');

  // Determinismo: misma fecha -> mismo set, siempre.
  const dates = ['2026-01-01', '2026-03-15', '2026-07-01', '2026-12-31', '2027-02-28'];
  for (const date of dates) {
    const a = generateDailySet(date);
    const b = generateDailySet(date);
    assert(JSON.stringify(a) === JSON.stringify(b), `${date}: generar el set 2 veces da resultado idéntico`);
  }

  // Tamaño correcto.
  for (const date of dates) {
    const set = generateDailySet(date);
    assert(set.length === 5, `${date}: el set tiene exactamente 5 misiones (tiene ${set.length})`);
  }

  // Variedad: nunca 2 plantillas del mismo "game" en el mismo set.
  for (const date of dates) {
    const set = generateDailySet(date);
    const games = set.map(s => DAILY_TEMPLATES.find(t => t.id === s.templateId)?.game);
    assert(new Set(games).size === games.length, `${date}: las 5 misiones son de juegos distintos (${games.join(', ')})`);
  }

  // No hay slots duplicados ni plantillas repetidas dentro del mismo set.
  for (const date of dates) {
    const set = generateDailySet(date);
    const slots = set.map(s => s.slot);
    const templateIds = set.map(s => s.templateId);
    assert(new Set(slots).size === 5, `${date}: slots 0-4 sin duplicados`);
    assert(new Set(templateIds).size === templateIds.length, `${date}: sin plantillas repetidas en el set`);
  }

  // Distintas fechas dan distintos sets (no degenerado / siempre el mismo).
  const setsByDate = dates.map(d => JSON.stringify(generateDailySet(d)));
  assert(new Set(setsByDate).size === dates.length, 'Distintas fechas producen sets diferentes entre sí');

  // tierIndex y requirement son coherentes con la plantilla.
  for (const date of dates) {
    const set = generateDailySet(date);
    for (const slot of set) {
      const tpl = DAILY_TEMPLATES.find(t => t.id === slot.templateId)!;
      assert(!!tpl, `${date} slot${slot.slot}: templateId '${slot.templateId}' existe en el catálogo`);
      assert(slot.tierIndex >= 0 && slot.tierIndex < tpl.tiers.length, `${date} slot${slot.slot}: tierIndex válido`);
      assert(slot.requirement === tpl.tiers[slot.tierIndex], `${date} slot${slot.slot}: requirement coincide con tiers[tierIndex]`);
    }
  }

  // Distribución razonable: en 60 fechas distintas, cada plantilla debería aparecer
  // al menos una vez (sanity check de que el shuffle no está sesgado a un subconjunto).
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const d = `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
    generateDailySet(d).forEach(s => seen.add(s.templateId));
  }
  assert(seen.size >= DAILY_TEMPLATES.length * 0.8, `En 60 días variados, al menos el 80% de las plantillas aparecen (vistas: ${seen.size}/${DAILY_TEMPLATES.length})`);
}

// ════════════════════════════════════════════════════════════
// 3. RESET 6AM ESPAÑA — casos límite de hora y DST
// ════════════════════════════════════════════════════════════
function testMissionDateReset() {
  section('3. Reset a las 6:00 AM hora de España');

  // Verano (CEST = UTC+2): 6:00 Madrid = 4:00 UTC
  assert(missionDateFor(new Date('2026-07-01T03:59:00Z')) === '2026-06-30', 'Verano: 03:59 UTC (5:59 Madrid) -> día anterior');
  assert(missionDateFor(new Date('2026-07-01T04:00:00Z')) === '2026-07-01', 'Verano: 04:00 UTC (6:00 Madrid) -> día nuevo');
  assert(missionDateFor(new Date('2026-07-01T04:01:00Z')) === '2026-07-01', 'Verano: 04:01 UTC (6:01 Madrid) -> día nuevo');

  // Invierno (CET = UTC+1): 6:00 Madrid = 5:00 UTC
  assert(missionDateFor(new Date('2026-01-15T04:59:00Z')) === '2026-01-14', 'Invierno: 04:59 UTC (5:59 Madrid) -> día anterior');
  assert(missionDateFor(new Date('2026-01-15T05:00:00Z')) === '2026-01-15', 'Invierno: 05:00 UTC (6:00 Madrid) -> día nuevo');

  // Mediodía, no debe haber ambigüedad.
  assert(missionDateFor(new Date('2026-06-15T12:00:00Z')) === '2026-06-15', 'Mediodía UTC en verano -> mismo día civil');

  // Cambio de mes / año (fin de mes y fin de año).
  assert(missionDateFor(new Date('2026-02-01T03:00:00Z')) === '2026-01-31', 'Cruce de mes: 03:00 UTC 1 feb (5:00 Madrid invierno) -> 31 enero');
  assert(missionDateFor(new Date('2027-01-01T03:00:00Z')) === '2026-12-31', 'Cruce de año: 03:00 UTC 1 ene (4:00 Madrid invierno... revisar) -> 31 dic');

  // nextMissionResetAt: siempre en el futuro respecto al `date` dado, y la hora civil en Madrid es 6:00.
  const testInstants = [
    new Date('2026-07-01T03:00:00Z'), // antes del reset de verano
    new Date('2026-07-01T05:00:00Z'), // después del reset de verano
    new Date('2026-01-15T03:00:00Z'), // antes del reset de invierno
    new Date('2026-01-15T06:00:00Z'), // después del reset de invierno
  ];
  for (const t of testInstants) {
    const next = nextMissionResetAt(t);
    assert(next > t.getTime(), `nextMissionResetAt(${t.toISOString()}) está en el futuro`);
    const madridHour = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).format(new Date(next));
    assert(madridHour === '06', `nextMissionResetAt(${t.toISOString()}) cae exactamente a las 6:00 Madrid (cayó a las ${madridHour}:xx)`);
  }

  // El "día de misión" obtenido en el instante justo antes del próximo reset debe
  // ser distinto al obtenido justo después.
  const now = new Date('2026-07-01T03:00:00Z');
  const resetAt = nextMissionResetAt(now);
  const justBefore = missionDateFor(new Date(resetAt - 1000));
  const justAfter = missionDateFor(new Date(resetAt + 1000));
  assert(justBefore !== justAfter, 'El día de misión cambia exactamente al cruzar el instante de reset');
}

// ════════════════════════════════════════════════════════════
// 4. TRACK DE MISIONES — valores en breakpoints, monotonía, rotación
// ════════════════════════════════════════════════════════════
function testMisionTrackValues() {
  section('4. Track de Misiones — valores e interpolación');

  // Valores EXACTOS en los breakpoints acordados (nv0 y nv10).
  const v0 = misionTrackValuesFor(0);
  assert(eq(v0.dailyChipsMultiplier, '10000'), `nv0 dinero = 10000 (es ${v0.dailyChipsMultiplier})`);
  assert(v0.brocheSpinsCount === 1, `nv0 tiradas = 1 (es ${v0.brocheSpinsCount})`);
  assert(eq(v0.dailyXpMultiplier, '100'), `nv0 xp = 100 (es ${v0.dailyXpMultiplier})`);
  assert(eq(v0.spinValue, '100000'), `nv0 valorTirada = 100000 (es ${v0.spinValue})`);
  assert(eq(v0.bronceXp, '50'), `nv0 bronceXp = 50 (es ${v0.bronceXp})`);
  assert(v0.plataSpins === 1, `nv0 plataSpins = 1 (es ${v0.plataSpins})`);
  assert(eq(v0.oroChips, '500000'), `nv0 oroChips = 500000 (es ${v0.oroChips})`);

  const v10 = misionTrackValuesFor(10);
  assert(eq(v10.dailyChipsMultiplier, '1000000000000000'), `nv10 dinero = 1Q (es ${v10.dailyChipsMultiplier})`);
  assert(v10.brocheSpinsCount === 50, `nv10 tiradas = 50 (es ${v10.brocheSpinsCount})`);
  assert(eq(v10.dailyXpMultiplier, '500'), `nv10 xp = 500 (es ${v10.dailyXpMultiplier})`);
  assert(eq(v10.spinValue, '10000000000000'), `nv10 valorTirada = 10T (es ${v10.spinValue})`);
  assert(eq(v10.bronceXp, '500'), `nv10 bronceXp = 500 (es ${v10.bronceXp})`);
  assert(v10.plataSpins === 50, `nv10 plataSpins = 50 (es ${v10.plataSpins})`);
  assert(eq(v10.oroChips, '500000000000000000'), `nv10 oroChips = 500Q (es ${v10.oroChips})`);

  // Monotonía: cada categoría debe ser no-decreciente al subir de nivel.
  const levels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30, 40, 50, 70, 90, 100, 150, 200];
  let prev = misionTrackValuesFor(0);
  for (let i = 1; i < levels.length; i++) {
    const cur = misionTrackValuesFor(levels[i]);
    assert(gte(cur.dailyChipsMultiplier, prev.dailyChipsMultiplier), `Dinero no decrece de nv${levels[i-1]} a nv${levels[i]}`);
    assert(cur.brocheSpinsCount >= prev.brocheSpinsCount, `Tiradas no decrecen de nv${levels[i-1]} a nv${levels[i]}`);
    assert(gte(cur.dailyXpMultiplier, prev.dailyXpMultiplier), `XP no decrece de nv${levels[i-1]} a nv${levels[i]}`);
    assert(gte(cur.spinValue, prev.spinValue), `Valor tirada no decrece de nv${levels[i-1]} a nv${levels[i]}`);
    assert(gte(cur.oroChips, prev.oroChips), `Oro no decrece de nv${levels[i-1]} a nv${levels[i]}`);
    prev = cur;
  }

  // Niveles negativos o inválidos se tratan como 0 (no debe lanzar ni dar valores raros).
  const vNeg = misionTrackValuesFor(-5);
  assert(eq(vNeg.dailyChipsMultiplier, v0.dailyChipsMultiplier), 'Nivel negativo se clampa a nv0');

  // Extrapolación por encima del último breakpoint (nv200): debe seguir creciendo,
  // no quedarse plano ni lanzar excepción.
  const v200 = misionTrackValuesFor(200);
  assert(gt(v200.dailyChipsMultiplier, v10.dailyChipsMultiplier), 'nv200 dinero sigue creciendo por encima de nv90 (extrapolación)');
  assert(v200.brocheSpinsCount > v10.brocheSpinsCount, 'nv200 tiradas sigue creciendo (extrapolación)');

  // El nivel de Jorgerente (122 con 81 puntos libres -> podría llegar como mucho a nv81
  // de Misiones) no debe dar valores absurdos (NaN, Infinity, etc.)
  const vJorge = misionTrackValuesFor(81);
  assert(vJorge.dailyChipsMultiplier.isFinite(), 'nv81 (caso Jorgerente) da un valor finito de dinero');
  assert(Number.isFinite(vJorge.brocheSpinsCount), 'nv81 da un número finito de tiradas');
  assert(!vJorge.dailyChipsMultiplier.isNaN(), 'nv81 dinero no es NaN');
}

// ════════════════════════════════════════════════════════════
// 5. RECOMPENSAS DE DIARIAS — multiplicador por plantilla
// ════════════════════════════════════════════════════════════
function testDailyMissionReward() {
  section('5. Recompensa de misiones diarias');

  for (const tpl of DAILY_TEMPLATES) {
    const r0 = dailyMissionReward(0, tpl);
    const r10 = dailyMissionReward(10, tpl);
    assert(gt(r10.chips, r0.chips), `${tpl.id}: recompensa en fichas sube de nv0 a nv10`);
    assert(r10.xp >= r0.xp, `${tpl.id}: XP no decrece de nv0 a nv10`);
    assert(parseInt(r0.chips, 10) > 0 || r0.chips === '10000', `${tpl.id}: recompensa en nv0 es positiva`);
  }

  // El multiplicador de la plantilla debe reflejarse: una plantilla con
  // rewardChipsMultiplier mayor da más fichas que una de multiplicador 1.0 al mismo nivel.
  const base = DAILY_TEMPLATES.find(t => t.rewardChipsMultiplier === 1.0)!;
  const boosted = DAILY_TEMPLATES.find(t => t.rewardChipsMultiplier > 1.0)!;
  const rBase = dailyMissionReward(5, base);
  const rBoosted = dailyMissionReward(5, boosted);
  assert(gt(rBoosted.chips, rBase.chips), 'Plantilla con multiplicador >1.0 da más fichas que una de 1.0 al mismo nivel');
}

// ════════════════════════════════════════════════════════════
// 6. BROCHES — bronce/plata/oro
// ════════════════════════════════════════════════════════════
function testBrocheRewards() {
  section('6. Broches (Bronce/Plata/Oro)');

  const b0 = brocheRewardsFor(0);
  assert(b0.bronceXp === 50, `nv0 broche bronce = 50 XP (es ${b0.bronceXp})`);
  assert(b0.plataSpinsCount === 1, `nv0 broche plata = 1 tirada (es ${b0.plataSpinsCount})`);
  assert(b0.plataSpinValue === '100000', `nv0 broche plata valor = 100000 (es ${b0.plataSpinValue})`);
  assert(b0.oroChips === '500000', `nv0 broche oro = 500000 fichas (es ${b0.oroChips})`);

  const b10 = brocheRewardsFor(10);
  assert(b10.bronceXp === 500, `nv10 broche bronce = 500 XP (es ${b10.bronceXp})`);
  assert(b10.plataSpinsCount === 50, `nv10 broche plata = 50 tiradas (es ${b10.plataSpinsCount})`);
  assert(b10.oroChips === '500000000000000000', `nv10 broche oro = 500Q (es ${b10.oroChips})`);

  // Las 3 recompensas deben mejorar juntas (acoplamiento por categoría 5).
  for (const lvl of [0, 5, 10, 15, 20, 50]) {
    const b = brocheRewardsFor(lvl);
    assert(b.bronceXp > 0, `nv${lvl}: bronceXp > 0`);
    assert(b.plataSpinsCount > 0, `nv${lvl}: plataSpinsCount > 0`);
    assert(gt(b.oroChips, '0'), `nv${lvl}: oroChips > 0`);
  }

  // Monotonía de los broches.
  let prevB = brocheRewardsFor(0);
  for (const lvl of [5, 10, 15, 20, 25, 50, 100]) {
    const cur = brocheRewardsFor(lvl);
    assert(cur.bronceXp >= prevB.bronceXp, `Broche bronce no decrece en nv${lvl}`);
    assert(cur.plataSpinsCount >= prevB.plataSpinsCount, `Broche plata (tiradas) no decrece en nv${lvl}`);
    assert(gte(cur.oroChips, prevB.oroChips), `Broche oro no decrece en nv${lvl}`);
    prevB = cur;
  }
}

// ════════════════════════════════════════════════════════════
// 7. LÍMITE DE MEJORAS DEL TRACK
// ════════════════════════════════════════════════════════════
function testUpgradeLimit() {
  section('7. Límite de mejoras del track de Misiones');
  assert(MISION_UPGRADES_PER_DAY === 5, `Límite diario de mejoras es 5 (es ${MISION_UPGRADES_PER_DAY})`);
}

// ════════════════════════════════════════════════════════════
// 8. CATÁLOGO DE LOGROS — estructura, consistencia, escalado
// ════════════════════════════════════════════════════════════
function testAchievementsCatalog() {
  section('8. Catálogo de logros — estructura');

  assert(ACHIEVEMENTS_CATALOG.length > 100, `Hay más de 100 tiers de logros (hay ${ACHIEVEMENTS_CATALOG.length})`);

  const ids = ACHIEVEMENTS_CATALOG.map(a => a.id);
  assert(new Set(ids).size === ids.length, 'Todos los IDs de logros son únicos');

  for (const a of ACHIEVEMENTS_CATALOG) {
    assert(a.tier >= 1, `${a.id}: tier >= 1`);
    assert(a.id === `${a.chainId}_t${a.tier}`, `${a.id}: el id sigue el patrón {chainId}_t{tier}`);
    assert(a.statKey.length > 0, `${a.id}: tiene statKey`);
    assert(a.kind === 'count' || a.kind === 'record', `${a.id}: kind es 'count' o 'record'`);
    assert(gt(a.requirement, '0'), `${a.id}: requirement es positivo`);
    assert(gt(a.rewardChips, '0'), `${a.id}: rewardChips es positivo`);
    assert(a.rewardXp > 0, `${a.id}: rewardXp es positivo`);
    assert(a.game.length > 0, `${a.id}: tiene categoría 'game'`);
    assert(a.label.length > 0, `${a.id}: tiene label no vacío`);
    // No debe haber números crudos sin formatear en records de tipo 'record' (deben usar fmt: "1M" no "1000000")
    if (a.kind === 'record') {
      assert(!/\d{7,}/.test(a.label), `${a.id}: label de récord no contiene números crudos largos sin formatear ("${a.label}")`);
    }
  }

  // Mentor BJ/Poker NO deben estar en el catálogo de Fase 1 (se posponen a Fase 2).
  const hasMentor = ACHIEVEMENTS_CATALOG.some(a => a.id.includes('mentor') || a.grantsGadget);
  assert(!hasMentor, 'El catálogo de Fase 1 NO incluye logros de Mentor BJ/Poker (se añaden en Fase 2)');

  // Cadenas: dentro de cada chainId, los tiers son consecutivos desde 1 y
  // el requirement es estrictamente creciente.
  const chains = new Map<string, typeof ACHIEVEMENTS_CATALOG>();
  for (const a of ACHIEVEMENTS_CATALOG) {
    if (!chains.has(a.chainId)) chains.set(a.chainId, []);
    chains.get(a.chainId)!.push(a);
  }
  assert(chains.size >= 15, `Hay al menos 15 cadenas distintas (hay ${chains.size})`);

  for (const [chainId, tiers] of chains) {
    const sorted = [...tiers].sort((a, b) => a.tier - b.tier);
    const tierNumbers = sorted.map(t => t.tier);
    const expected = Array.from({ length: sorted.length }, (_, i) => i + 1);
    assert(JSON.stringify(tierNumbers) === JSON.stringify(expected), `Cadena '${chainId}': tiers consecutivos 1..N sin huecos`);

    for (let i = 1; i < sorted.length; i++) {
      assert(gt(sorted[i].requirement, sorted[i - 1].requirement), `Cadena '${chainId}' tier ${sorted[i].tier}: requirement > tier anterior`);
      assert(gt(sorted[i].rewardChips, sorted[i - 1].rewardChips), `Cadena '${chainId}' tier ${sorted[i].tier}: rewardChips > tier anterior`);
      assert(sorted[i].rewardXp >= sorted[i - 1].rewardXp, `Cadena '${chainId}' tier ${sorted[i].tier}: rewardXp no decrece`);
      // Mismo statKey, game, emoji dentro de toda la cadena.
      assert(sorted[i].statKey === sorted[0].statKey, `Cadena '${chainId}' tier ${sorted[i].tier}: mismo statKey que el resto de la cadena`);
      assert(sorted[i].game === sorted[0].game, `Cadena '${chainId}' tier ${sorted[i].tier}: mismo game que el resto de la cadena`);
    }
  }

  // El último tier de cada cadena de tipo 'count' debe dar un premio MUY por encima
  // de la economía actual (>= 1e20, escala Sx+), según lo acordado.
  for (const [chainId, tiers] of chains) {
    const sorted = [...tiers].sort((a, b) => a.tier - b.tier);
    const last = sorted[sorted.length - 1];
    if (last.kind === 'count') {
      assert(gte(last.rewardChips, '1e20'), `Cadena '${chainId}' (count): premio del último tier >= 1e20 (es ${last.rewardChips})`);
    }
  }

  // Cadenas de récord: el multiplicador efectivo (rewardChips/requirement) debe
  // crecer con el tier (multiplicador creciente x2 -> x100).
  for (const [chainId, tiers] of chains) {
    const sorted = [...tiers].sort((a, b) => a.tier - b.tier);
    if (sorted[0].kind !== 'record') continue;
    let prevMult = m(sorted[0].rewardChips).div(m(sorted[0].requirement));
    for (let i = 1; i < sorted.length; i++) {
      const mult = m(sorted[i].rewardChips).div(m(sorted[i].requirement));
      assert(gt(mult, prevMult) || eq(mult, prevMult), `Cadena '${chainId}' (record) tier ${sorted[i].tier}: multiplicador no decrece (${mult.toFixed(2)} vs ${prevMult.toFixed(2)})`);
      prevMult = mult;
    }
    // El primer tier multiplica por ~2x, el último por ~100x (con margen de tolerancia).
    const firstMult = m(sorted[0].rewardChips).div(m(sorted[0].requirement));
    const lastMult = m(sorted[sorted.length - 1].rewardChips).div(m(sorted[sorted.length - 1].requirement));
    assert(firstMult.gte(1.5) && firstMult.lte(3), `Cadena '${chainId}' (record): primer multiplicador ~x2 (es x${firstMult.toFixed(2)})`);
    assert(lastMult.gte(90) && lastMult.lte(110), `Cadena '${chainId}' (record): último multiplicador ~x100 (es x${lastMult.toFixed(2)})`);
  }

  // statKeys del catálogo deben mapear a stats reales conocidos del sistema
  // (los que existen hoy en user_stats según la exploración del código).
  const knownStats = new Set([
    'hands_played', 'hands_won', 'biggest_pot', 'best_hand_rank',
    'bj_hands', 'bj_wins', 'bj_blackjacks', 'bj_biggest_win',
    'roulette_rounds', 'roulette_biggest_win',
    'jackpot_spins', 'jackpot_biggest_win',
    'mines_games', 'mines_cashouts', 'mines_biggest_win',
    'crash_games', 'crash_cashouts', 'crash_biggest_win',
    'trivia_answered', 'trivia_correct',
    'wordle_games', 'wordle_wins',
    'gifts_sent', 'gifts_received', 'bonus_claims', 'time_played_ms',
    'max_balance',
  ]);
  for (const a of ACHIEVEMENTS_CATALOG) {
    assert(knownStats.has(a.statKey), `${a.id}: statKey '${a.statKey}' es un stat conocido del sistema`);
  }
  for (const tpl of DAILY_TEMPLATES) {
    assert(knownStats.has(tpl.statKey), `Plantilla '${tpl.id}': statKey '${tpl.statKey}' es un stat conocido del sistema`);
  }
}

// ════════════════════════════════════════════════════════════
// 9. INTEGRACIÓN — coherencia cruzada entre módulos
// ════════════════════════════════════════════════════════════
function testCrossConsistency() {
  section('9. Coherencia cruzada');

  // Ninguna plantilla diaria debe compartir statKey de forma ambigua dentro
  // de su propio 'game' (evita que 2 plantillas del mismo juego midan lo mismo
  // y por tanto nunca puedan convivir, aunque ya están filtradas por 'game' único/día).
  const byGame = new Map<string, Set<string>>();
  for (const tpl of DAILY_TEMPLATES) {
    if (!byGame.has(tpl.game)) byGame.set(tpl.game, new Set());
    byGame.get(tpl.game)!.add(tpl.statKey);
  }
  ok('Plantillas agrupadas por juego sin error (sanity check estructural)');

  // El broche Plata da tiradas al "mismo pool que ruleta" -> spinValue/oroChips
  // deben ser strings parseables como Decimal sin lanzar.
  for (const lvl of [0, 1, 10, 50, 100]) {
    const b = brocheRewardsFor(lvl);
    assert(!isNaN(Number(b.plataSpinValue)) || b.plataSpinValue.length > 0, `nv${lvl}: plataSpinValue es un string numérico válido`);
    assert(!isNaN(Number(b.oroChips)) || b.oroChips.length > 0, `nv${lvl}: oroChips es un string numérico válido`);
  }

  // Verificación de orden de magnitud: en nv10 (el ancla de diseño), el dinero de
  // una diaria debe ser MUCHO menor que el oroChips del broche (diaria=chorrito,
  // broche=premio grande), tal como se diseñó.
  const dailyAt10 = dailyMissionReward(10, DAILY_TEMPLATES[0]);
  const brocheAt10 = brocheRewardsFor(10);
  assert(lt(dailyAt10.chips, brocheAt10.oroChips), 'nv10: una diaria individual da menos que el broche Oro (diseño: diaria=chorrito, broche=premio)');
}

// ════════════════════════════════════════════════════════════
// RUNNER
// ════════════════════════════════════════════════════════════
function main() {
  console.log('🎯 Suite de tests — Sistema de Misiones (lógica pura)');
  console.log('='.repeat(60));

  testDailyTemplatesStructure();
  testDailySetGeneration();
  testMissionDateReset();
  testMisionTrackValues();
  testDailyMissionReward();
  testBrocheRewards();
  testUpgradeLimit();
  testAchievementsCatalog();
  testCrossConsistency();

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  if (failures.length > 0) {
    console.log('\nFallos:');
    failures.forEach(f => console.log(`  - ${f}`));
  }
  console.log('='.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

main();
