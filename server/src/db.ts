import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'poker.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    // WAL = mayor durabilidad y permite lecturas concurrentes mientras se escribe.
    // FULL synchronous = no se pierde un commit aunque se caiga el proceso/SO.
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA synchronous = FULL');
    db.run('PRAGMA foreign_keys = ON');
  }
});

const MIGRATIONS = [
  {
    name: '001_initial_users',
    sql: `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      balance INTEGER DEFAULT 0
    )`
  },
  {
    name: '002_add_password_hash',
    sql: 'ALTER TABLE users ADD COLUMN password_hash TEXT',
    ignoreError: 'duplicate column'
  },
  {
    name: '003_add_avatar',
    sql: 'ALTER TABLE users ADD COLUMN avatar TEXT',
    ignoreError: 'duplicate column'
  },
  {
    name: '004_rooms_table',
    sql: `CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL
    )`
  },
  {
    name: '005_sessions_table',
    sql: `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      issued_at INTEGER NOT NULL
    )`
  },
  {
    name: '006_match_history',
    sql: `CREATE TABLE IF NOT EXISTS match_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      room_name TEXT NOT NULL,
      buy_in INTEGER NOT NULL,
      max_chips INTEGER NOT NULL,
      cash_out INTEGER NOT NULL,
      played_at INTEGER NOT NULL
    )`
  },
  {
    name: '007_match_history_user_idx',
    sql: 'CREATE INDEX IF NOT EXISTS idx_match_history_user ON match_history (user_id, played_at DESC)'
  },
  {
    name: '008_bonus_claims',
    sql: 'ALTER TABLE users ADD COLUMN last_daily_claim TEXT',
    ignoreError: 'duplicate column'
  },
  {
    name: '009_hourly_claim',
    sql: 'ALTER TABLE users ADD COLUMN last_hourly_claim INTEGER',
    ignoreError: 'duplicate column'
  },
  {
    name: '010_jackpot_history',
    sql: `CREATE TABLE IF NOT EXISTS jackpot_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      bet INTEGER NOT NULL,
      symbols TEXT NOT NULL,
      multiplier REAL NOT NULL,
      win_amount INTEGER NOT NULL,
      played_at INTEGER NOT NULL
    )`
  },
  {
    name: '011_free_spins',
    sql: 'ALTER TABLE users ADD COLUMN free_spins_left INTEGER DEFAULT 0',
    ignoreError: 'duplicate column'
  },
  {
    name: '012_free_spins_val',
    sql: 'ALTER TABLE users ADD COLUMN free_spin_value INTEGER DEFAULT 0',
    ignoreError: 'duplicate column'
  },
  {
    name: '013_free_spins_claim',
    sql: 'ALTER TABLE users ADD COLUMN last_free_spins_claim INTEGER DEFAULT 0',
    ignoreError: 'duplicate column'
  },
  {
    name: '014_jackpot_state',
    sql: `CREATE TABLE IF NOT EXISTS jackpot_state (
      id INTEGER PRIMARY KEY,
      data TEXT NOT NULL
    )`
  },
  {
    name: '015_jackpot_unlock_level',
    sql: 'ALTER TABLE users ADD COLUMN jackpot_unlock_level INTEGER DEFAULT 0',
    ignoreError: 'duplicate column'
  },
  {
    name: '016_xp',
    sql: 'ALTER TABLE users ADD COLUMN xp INTEGER DEFAULT 0',
    ignoreError: 'duplicate column'
  },
  {
    name: '017_paguita_level',
    sql: 'ALTER TABLE users ADD COLUMN paguita_level INTEGER DEFAULT 0',
    ignoreError: 'duplicate column'
  },
  {
    name: '018_dieta_level',
    sql: 'ALTER TABLE users ADD COLUMN dieta_level INTEGER DEFAULT 0',
    ignoreError: 'duplicate column'
  },
  {
    name: '019_ruleta_level',
    sql: 'ALTER TABLE users ADD COLUMN ruleta_level INTEGER DEFAULT 0',
    ignoreError: 'duplicate column'
  },
  {
    name: '020_trivia_level',
    sql: 'ALTER TABLE users ADD COLUMN trivia_level INTEGER DEFAULT 0',
    ignoreError: 'duplicate column'
  },
  {
    name: '021_free_spins_pools',
    sql: "ALTER TABLE users ADD COLUMN free_spins_pools TEXT DEFAULT '{}'",
    ignoreError: 'duplicate column'
  },
  {
    name: '022_last_seen',
    sql: 'ALTER TABLE users ADD COLUMN last_seen INTEGER',
    ignoreError: 'duplicate column'
  },
  {
    name: '023_shift_jackpot_tiers',
    sql: 'UPDATE users SET jackpot_unlock_level = jackpot_unlock_level + 1 WHERE jackpot_unlock_level > 0'
  },
  {
    name: '024_hacienda_state',
    sql: `CREATE TABLE IF NOT EXISTS hacienda_state (
      id INTEGER PRIMARY KEY,
      total INTEGER NOT NULL DEFAULT 0
    )`
  },
  {
    name: '025_paid_israel',
    sql: 'ALTER TABLE users ADD COLUMN paid_israel INTEGER DEFAULT 0',
    ignoreError: 'duplicate column'
  },
  {
    name: '026_israel_debt',
    sql: 'ALTER TABLE users ADD COLUMN israel_debt INTEGER DEFAULT 0',
    ignoreError: 'duplicate column'
  },
  {
    name: '027_padre_israel_debt',
    sql: "UPDATE users SET israel_debt = 1000000000 WHERE name = 'padre' COLLATE NOCASE AND paid_israel = 0"
  },
  {
    name: '028_poker_stats',
    sql: `CREATE TABLE IF NOT EXISTS poker_stats (
      user_id TEXT PRIMARY KEY,
      hands_played INTEGER NOT NULL DEFAULT 0,
      hands_won INTEGER NOT NULL DEFAULT 0,
      biggest_pot INTEGER NOT NULL DEFAULT 0,
      best_hand_rank INTEGER NOT NULL DEFAULT 0,
      best_hand_name TEXT NOT NULL DEFAULT ''
    )`
  },
  {
    name: '029_user_stats',
    sql: `CREATE TABLE IF NOT EXISTS user_stats (
      user_id TEXT NOT NULL,
      stat TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, stat)
    )`
  },
  { name: '030_shop_avatar_eq', sql: 'ALTER TABLE users ADD COLUMN equipped_avatar_decoration TEXT', ignoreError: 'duplicate column' },
  { name: '031_shop_avatar_un', sql: "ALTER TABLE users ADD COLUMN unlocked_avatar_decorations TEXT DEFAULT '[]'", ignoreError: 'duplicate column' },
  { name: '032_shop_name_eq', sql: 'ALTER TABLE users ADD COLUMN equipped_name_decoration TEXT', ignoreError: 'duplicate column' },
  { name: '033_shop_name_un', sql: "ALTER TABLE users ADD COLUMN unlocked_name_decorations TEXT DEFAULT '[]'", ignoreError: 'duplicate column' },
  { name: '034_shop_felt_eq', sql: 'ALTER TABLE users ADD COLUMN equipped_bj_felt TEXT', ignoreError: 'duplicate column' },
  { name: '035_shop_felt_un', sql: "ALTER TABLE users ADD COLUMN unlocked_bj_felts TEXT DEFAULT '[]'", ignoreError: 'duplicate column' },
  { name: '036_shop_israel_don', sql: 'ALTER TABLE users ADD COLUMN israel_donation INTEGER DEFAULT 0', ignoreError: 'duplicate column' },
  { name: '037_shop_israel_pool', sql: 'ALTER TABLE users ADD COLUMN israel_pool INTEGER DEFAULT 0', ignoreError: 'duplicate column' },
  { name: '038_shop_andorra', sql: 'ALTER TABLE users ADD COLUMN moved_to_andorra INTEGER DEFAULT 0', ignoreError: 'duplicate column' },
  { name: '039_unlocked_boosts', sql: "ALTER TABLE users ADD COLUMN unlocked_boosts TEXT DEFAULT '[]'", ignoreError: 'duplicate column' },
  { name: '040_settings_table', sql: 'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)' },
  { name: '041_user_is_bot', sql: 'ALTER TABLE users ADD COLUMN is_bot INTEGER DEFAULT 0', ignoreError: 'duplicate column' },
  { name: '042_user_is_cursed', sql: 'ALTER TABLE users ADD COLUMN is_cursed INTEGER DEFAULT 0', ignoreError: 'duplicate column' },
  { name: '043_curse_adrian', sql: "UPDATE users SET is_cursed = 1 WHERE name LIKE '%adrian%' COLLATE NOCASE" },
  // Saldo de precisión arbitraria: columna TEXT (los INTEGER pierden exactitud
  // >2^53 al leerse en JS, y >2^63 se corrompen a REAL al escribirse). balance_t
  // es la fuente de verdad; se opera con BigInt. Backfill desde la INTEGER vieja.
  { name: '044_balance_text', sql: 'ALTER TABLE users ADD COLUMN balance_t TEXT', ignoreError: 'duplicate column' },
  { name: '045_balance_text_fill', sql: "UPDATE users SET balance_t = CAST(balance AS TEXT) WHERE balance_t IS NULL OR balance_t = ''" },
  { name: '046_has_artilugio', sql: 'ALTER TABLE users ADD COLUMN has_artilugio INTEGER DEFAULT 0', ignoreError: 'duplicate column' },
  { name: '047_unlocked_cooldown_boosts', sql: "ALTER TABLE users ADD COLUMN unlocked_cooldown_boosts TEXT DEFAULT '{}'", ignoreError: 'duplicate column' },
  { name: '048_last_paguita_claim_ts', sql: 'ALTER TABLE users ADD COLUMN last_paguita_claim_ts INTEGER', ignoreError: 'duplicate column' },
  { name: '049_user_stats_value_t', sql: 'ALTER TABLE user_stats ADD COLUMN value_t TEXT', ignoreError: 'duplicate column' },
  // Israel y Hacienda: precisión arbitraria vía columnas TEXT (mismo patrón que balance_t).
  // Las INTEGER se corrompen a REAL al escribir >2^63; las _t son la fuente de verdad.
  { name: '050_israel_debt_t', sql: 'ALTER TABLE users ADD COLUMN israel_debt_t TEXT', ignoreError: 'duplicate column' },
  { name: '051_israel_debt_t_fill', sql: "UPDATE users SET israel_debt_t = CAST(israel_debt AS TEXT) WHERE israel_debt_t IS NULL OR israel_debt_t = ''" },
  { name: '052_israel_donation_t', sql: 'ALTER TABLE users ADD COLUMN israel_donation_t TEXT', ignoreError: 'duplicate column' },
  { name: '053_israel_donation_t_fill', sql: "UPDATE users SET israel_donation_t = CAST(israel_donation AS TEXT) WHERE israel_donation_t IS NULL OR israel_donation_t = ''" },
  { name: '054_israel_pool_t', sql: 'ALTER TABLE users ADD COLUMN israel_pool_t TEXT', ignoreError: 'duplicate column' },
  { name: '055_israel_pool_t_fill', sql: "UPDATE users SET israel_pool_t = CAST(israel_pool AS TEXT) WHERE israel_pool_t IS NULL OR israel_pool_t = ''" },
  { name: '056_hacienda_total_t', sql: 'ALTER TABLE hacienda_state ADD COLUMN total_t TEXT', ignoreError: 'duplicate column' },
  { name: '057_hacienda_total_t_fill', sql: "UPDATE hacienda_state SET total_t = CAST(total AS TEXT) WHERE total_t IS NULL OR total_t = ''" },
  // --- Sistema de Misiones (Fase 1) ---
  { name: '058_mision_level', sql: 'ALTER TABLE users ADD COLUMN mision_level INTEGER DEFAULT 0', ignoreError: 'duplicate column' },
  { name: '059_mision_upgrades_today', sql: 'ALTER TABLE users ADD COLUMN mision_upgrades_today INTEGER DEFAULT 0', ignoreError: 'duplicate column' },
  { name: '060_mision_upgrades_date', sql: 'ALTER TABLE users ADD COLUMN mision_upgrades_date TEXT', ignoreError: 'duplicate column' },
  {
    name: '061_user_daily_missions',
    sql: `CREATE TABLE IF NOT EXISTS user_daily_missions (
      user_id TEXT NOT NULL,
      mission_date TEXT NOT NULL,
      slot INTEGER NOT NULL,
      template_id TEXT NOT NULL,
      tier_index INTEGER NOT NULL,
      requirement INTEGER NOT NULL,
      snapshot_value TEXT NOT NULL DEFAULT '0',
      completed_at INTEGER,
      claimed_at INTEGER,
      PRIMARY KEY (user_id, mission_date, slot)
    )`
  },
  {
    name: '062_user_broche_claims',
    sql: `CREATE TABLE IF NOT EXISTS user_broche_claims (
      user_id TEXT NOT NULL,
      mission_date TEXT NOT NULL,
      bronze_claimed_at INTEGER,
      silver_claimed_at INTEGER,
      gold_claimed_at INTEGER,
      PRIMARY KEY (user_id, mission_date)
    )`
  },
  {
    name: '063_user_achievement_claims',
    sql: `CREATE TABLE IF NOT EXISTS user_achievement_claims (
      user_id TEXT NOT NULL,
      achievement_id TEXT NOT NULL,
      claimed_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, achievement_id)
    )`
  },
  // Baseline de logros: snapshot ÚNICO tomado en el momento de este deploy para que
  // los jugadores veteranos no reciban de golpe los logros de actividad acumulada
  // (manos jugadas, tiradas, etc.) ni los de "mayor premio en una mano". Solo
  // max_balance queda fuera de este sistema (es un récord histórico legítimo).
  {
    name: '064_achievement_baselines',
    sql: `CREATE TABLE IF NOT EXISTS user_achievement_baselines (
      user_id TEXT NOT NULL,
      stat_key TEXT NOT NULL,
      baseline_value TEXT NOT NULL DEFAULT '0',
      PRIMARY KEY (user_id, stat_key)
    )`
  },
  {
    name: '065_achievement_baselines_backfill',
    // Se ejecuta UNA sola vez (las migraciones no se re-corren). Copia el valor actual
    // de cada stat relevante (de user_stats y poker_stats) como baseline de cada usuario
    // existente en este momento. Usuarios creados después de este deploy no tienen fila
    // -> su baseline es 0 (lógica en código), que es justo lo que queremos.
    sql: `
      INSERT OR IGNORE INTO user_achievement_baselines (user_id, stat_key, baseline_value)
      SELECT user_id, stat, COALESCE(value_t, CAST(value AS TEXT), '0') FROM user_stats
      WHERE stat != 'max_balance'
    `
  },
  {
    name: '066_achievement_baselines_backfill_poker',
    // hands_played/hands_won/biggest_pot de jugadores que jugaron poker ANTES de que se
    // empezara a duplicar en user_stats (ver roomManager.ts) viven solo en poker_stats.
    sql: `
      INSERT OR IGNORE INTO user_achievement_baselines (user_id, stat_key, baseline_value)
      SELECT user_id, 'hands_played', CAST(hands_played AS TEXT) FROM poker_stats
      UNION ALL
      SELECT user_id, 'hands_won', CAST(hands_won AS TEXT) FROM poker_stats
      UNION ALL
      SELECT user_id, 'biggest_pot', CAST(biggest_pot AS TEXT) FROM poker_stats
    `
  }
];

// Helper para usar Promesas en lugar de callbacks
export const dbRun = (sql: string, params: any[] = []): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve();
    });
  });
};

export const dbGet = <T>(sql: string, params: any[] = []): Promise<T | undefined> => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T);
    });
  });
};

export const dbAll = <T>(sql: string, params: any[] = []): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
};

export const initDB = async (): Promise<void> => {
  await dbRun(`CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  )`);

  const appliedRows = await dbAll<{ name: string }>('SELECT name FROM migrations');
  const applied = new Set(appliedRows.map(r => r.name));

  for (const mig of MIGRATIONS) {
    if (!applied.has(mig.name)) {
      try {
        await dbRun(mig.sql);
      } catch (err: any) {
        if (mig.ignoreError && err.message.includes(mig.ignoreError)) {
          console.log(`Migration ${mig.name} recovered from old schema (${mig.ignoreError})`);
        } else {
          console.error(`Error running migration ${mig.name}:`, err);
          throw err;
        }
      }
      await dbRun('INSERT INTO migrations (name) VALUES (?)', [mig.name]);
      console.log(`Migration applied: ${mig.name}`);
    }
  }
  console.log('Database migrations up to date.');
};

// Fila completa en BD (incluye el hash, que NUNCA sale del servidor)
export interface UserRow {
  id: string;
  name: string;
  balance: string; // dinero grande: string decimal exacto (se opera con BigInt)
  password_hash: string | null;
  avatar: string | null;
  last_daily_claim: string | null; // legacy
  last_paguita_claim_ts?: number | null;
  last_hourly_claim: number | null;
  free_spins_left: number;
  free_spin_value: number;
  last_free_spins_claim: number;
  free_spins_pools: string | null;
  jackpot_unlock_level: number;
  is_bot: number;
  is_cursed: number;
  country: string | null;
  xp: number;
  paguita_level: number;
  dieta_level: number;
  ruleta_level: number;
  trivia_level: number;
  mision_level?: number;
  mision_upgrades_today?: number;
  mision_upgrades_date?: string | null;
  last_seen?: number;
  paid_israel?: number;
  israel_debt?: string;
  
  // --- Shop y Cosméticos ---
  equipped_avatar_decoration?: string | null;
  unlocked_avatar_decorations?: string | null;
  
  equipped_name_decoration?: string | null;
  unlocked_name_decorations?: string | null;
  
  equipped_bj_felt?: string | null;
  unlocked_bj_felts?: string | null;
  
  // --- Beneficios Sociales ---
  moved_to_andorra?: number;
  israel_donation?: string;
  israel_pool?: string;

  // --- Mejoras de Tienda ---
  unlocked_boosts?: string | null;
  unlocked_cooldown_boosts?: string | null;

  // --- Gadgets ---
  has_artilugio?: number;
}

import { PublicUser, levelFromXp, availableLevelPoints, dailyAmountFor, hourlyAmountFor, LevelTrack, LEVEL_TRACK_MAX, boostMultiplier, TrackBoosts, CooldownBoosts, paguitaCooldownMs, dietaCooldownMs, Money, m, add, sub, toStr, clampNonNeg, gte, gt, isNeg } from '../../shared/types';

// Columnas de usuario con el dinero leído exacto. balance_t (TEXT) es la fuente
// de verdad del saldo; el alias pisa la columna `balance` INTEGER del `*` (en
// node-sqlite3 gana la última columna con el mismo nombre). Los pools sociales
// se castean a TEXT para no perder precisión al leerlos como number.
const USER_COLS =
  "*, COALESCE(balance_t, CAST(balance AS TEXT), '0') AS balance, " +
  "COALESCE(israel_debt_t, CAST(israel_debt AS TEXT), '0') AS israel_debt, " +
  "COALESCE(israel_donation_t, CAST(israel_donation AS TEXT), '0') AS israel_donation, " +
  "COALESCE(israel_pool_t, CAST(israel_pool AS TEXT), '0') AS israel_pool";

// Mutex por usuario para que el read-modify-write del saldo (BigInt en JS, no
// se puede hacer atómico en SQL con TEXT) no sufra carreras entre operaciones
// concurrentes del mismo usuario.
const balanceChain = new Map<string, Promise<unknown>>();
const withBalanceLock = <T>(id: string, fn: () => Promise<T>): Promise<T> => {
  const prev = balanceChain.get(id) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  balanceChain.set(id, run.catch(() => {}));
  return run;
};

export const parsePools = (raw: string | null): Record<string, number> => {
  try { const p = JSON.parse(raw || '{}'); return (p && typeof p === 'object') ? p : {}; } catch { return {}; }
};

// Mismo merge legacy que toPublicUser: incluye free_spins_left/free_spin_value si no están en pools JSON
export const getEffectivePools = (row: UserRow): Record<string, number> => {
  const pools = parsePools(row.free_spins_pools ?? null);
  const legacyLeft = row.free_spins_left ?? 0;
  const legacyVal = row.free_spin_value ?? 0;
  if (legacyLeft > 0 && legacyVal > 0 && !pools[String(legacyVal)]) {
    pools[String(legacyVal)] = legacyLeft;
  }
  return pools;
};

export const toPublicUser = (row: UserRow): PublicUser => {
  const xp = row.xp ?? 0;
  const level = levelFromXp(xp);
  const paguitaLevel = row.paguita_level ?? 0;
  const dietaLevel = row.dieta_level ?? 0;
  const ruletaLevel = row.ruleta_level ?? 0;
  const triviaLevel = row.trivia_level ?? 0;
  const misionLevel = row.mision_level ?? 0;
  // Merge legacy single-slot into pools for backward compat
  const pools = parsePools(row.free_spins_pools);
  const legacyLeft = row.free_spins_left ?? 0;
  const legacyVal = row.free_spin_value ?? 0;
  if (legacyLeft > 0 && legacyVal > 0 && !pools[String(legacyVal)]) {
    pools[String(legacyVal)] = legacyLeft;
  }
  const cooldownBoosts: CooldownBoosts = (() => { try { const p = JSON.parse(row.unlocked_cooldown_boosts || '{}'); return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {}; } catch { return {}; } })();
  return {
    id: row.id,
    name: row.name,
    balance: row.balance ?? '0',
    avatar: row.avatar || row.id,
    hasPassword: !!row.password_hash,
    lastDailyClaim: row.last_daily_claim ?? null,
    lastPaguitaClaimTs: row.last_paguita_claim_ts ?? null,
    lastHourlyClaim: row.last_hourly_claim ?? null,
    freeSpinPools: pools,
    freeSpinsLeft: Object.values(pools).reduce((a, b) => a + b, 0),
    freeSpinValue: legacyVal,
    lastFreeSpinsClaim: row.last_free_spins_claim ?? 0,
    jackpotUnlockLevel: row.jackpot_unlock_level ?? 0,
    isBot: row.is_bot === 1,
    isCursed: row.is_cursed === 1,
    xp,
    level,
    levelPoints: availableLevelPoints(level, paguitaLevel, dietaLevel, ruletaLevel, triviaLevel, cooldownBoosts, misionLevel),
    paguitaLevel,
    dietaLevel,
    ruletaLevel,
    triviaLevel,
    misionLevel,
    misionUpgradesToday: (row.mision_upgrades_date === missionDateFor()) ? (row.mision_upgrades_today ?? 0) : 0,
    lastSeen: row.last_seen ?? undefined,
    paidIsrael: !!row.paid_israel,
    israelDebt: row.israel_debt ?? '0',
    equippedAvatarDecoration: row.equipped_avatar_decoration ?? undefined,
    unlockedAvatarDecorations: row.unlocked_avatar_decorations ? JSON.parse(row.unlocked_avatar_decorations) : [],
    equippedNameDecoration: row.equipped_name_decoration ?? undefined,
    unlockedNameDecorations: row.unlocked_name_decorations ? JSON.parse(row.unlocked_name_decorations) : [],
    equippedBjFelt: row.equipped_bj_felt ?? undefined,
    unlockedBjFelts: row.unlocked_bj_felts ? JSON.parse(row.unlocked_bj_felts) : [],
    israelDonation: row.israel_donation ?? '0',
    israelPool: row.israel_pool ?? '0',
    movedToAndorra: !!row.moved_to_andorra,
    unlockedBoosts: (() => { try { const p = JSON.parse(row.unlocked_boosts || '{}'); return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {}; } catch { return {}; } })(),
    unlockedCooldownBoosts: cooldownBoosts,
    hasArtilugio: row.has_artilugio === 1,
  };
};

export const getAllUsersRanked = async (): Promise<UserRow[]> => {
  // ORDER BY sobre la expresión directa de balance_t para evitar ambigüedad con
  // la columna INTEGER `balance` del SELECT * (que ya no se actualiza desde BigInt).
  const bal = "COALESCE(balance_t, CAST(balance AS TEXT), '0')";
  return dbAll<UserRow>(`SELECT ${USER_COLS} FROM users WHERE name != 'Jorge' ORDER BY LENGTH(${bal}) DESC, ${bal} DESC`);
};

export const getAllUsersAdmin = async (): Promise<UserRow[]> => {
  return dbAll<UserRow>(`SELECT ${USER_COLS} FROM users ORDER BY name ASC`);
};

export const getUser = async (id: string): Promise<UserRow | undefined> => {
  return dbGet<UserRow>(`SELECT ${USER_COLS} FROM users WHERE id = ?`, [id]);
};

export const deleteUser = async (id: string): Promise<void> => {
  await dbRun('DELETE FROM sessions WHERE user_id = ?', [id]);
  await dbRun('DELETE FROM users WHERE id = ?', [id]);
};

// Búsqueda por nombre (sin distinguir mayúsculas ni espacios sobrantes).
// Es la clave para que el saldo persista al volver a entrar con el mismo nombre.
export const getUserByName = async (name: string): Promise<UserRow | undefined> => {
  return dbGet<UserRow>(`SELECT ${USER_COLS} FROM users WHERE name = ? COLLATE NOCASE`, [name.trim()]);
};

export const resetJorgeCooldowns = async (): Promise<void> => {
  await dbRun(
    `UPDATE users SET last_daily_claim = NULL, last_paguita_claim_ts = NULL, last_hourly_claim = 0, last_free_spins_claim = 0
     WHERE name = 'Jorge' COLLATE NOCASE`
  );
};

// ¿Existe OTRA cuenta (distinto id) con ese nombre? Para validar cambios de nombre.
export const isNameTaken = async (name: string, exceptId: string): Promise<boolean> => {
  const row = await dbGet<{ id: string }>(
    'SELECT id FROM users WHERE name = ? COLLATE NOCASE AND id != ?',
    [name.trim(), exceptId]
  );
  return !!row;
};

export const updateLastSeen = async (id: string): Promise<void> => {
  await dbRun('UPDATE users SET last_seen = ? WHERE id = ?', [Date.now(), id]);
};

export const createUser = async (id: string, name: string): Promise<void> => {
  await dbRun("INSERT OR IGNORE INTO users (id, name, balance, balance_t) VALUES (?, ?, 1000, '1000')", [id, name.trim()]);
};

export const setPasswordHash = async (id: string, hash: string | null): Promise<void> => {
  await dbRun('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
};

export const updateUserName = async (id: string, name: string): Promise<void> => {
  await dbRun('UPDATE users SET name = ? WHERE id = ?', [name.trim(), id]);
};

let onBalanceChanged: () => void = () => {};
export const setOnBalanceChanged = (cb: () => void) => { onBalanceChanged = cb; };

export const updateUserAvatar = async (id: string, avatar: string): Promise<void> => {
  await dbRun('UPDATE users SET avatar = ? WHERE id = ?', [avatar, id]);
};

export const updateUserBalance = async (id: string, amount: number | bigint): Promise<void> => {
  await applyBalanceDelta(id, amount);
};

// Aplica un delta al saldo (BigInt, precisión arbitraria) y devuelve el saldo
// resultante como string decimal. El read-modify-write va bajo mutex por usuario
// para evitar carreras (no se puede hacer atómico en SQL sobre TEXT). Nunca < 0.
export const applyBalanceDelta = async (id: string, delta: number | bigint | string | Money): Promise<string> => {
  return withBalanceLock(id, async () => {
    const row = await dbGet<{ balance: string | null; balance_t: string | null }>(
      'SELECT CAST(balance AS TEXT) AS balance, balance_t FROM users WHERE id = ?', [id]
    );
    const current = m(row?.balance_t ?? row?.balance ?? 0);
    const next = clampNonNeg(current.plus(m(delta as any)));
    const s = toStr(next);
    await dbRun('UPDATE users SET balance_t = ? WHERE id = ?', [s, id]);
    onBalanceChanged();
    // Récord histórico de saldo máximo (Decimal, precisión exacta a cualquier escala).
    void maxStatBig(id, 'max_balance', s);
    return s;
  });
};

const HOURLY_COOLDOWN_MS = 30 * 60 * 1000;

export const claimDailyBonus = async (id: string): Promise<{ ok: boolean; error?: string; newBalance?: string; nextClaimAt?: number }> => {
  const row = await dbGet<UserRow>(`SELECT ${USER_COLS} FROM users WHERE id = ?`, [id]);
  if (!row) return { ok: false, error: 'Usuario no encontrado' };
  
  const now = Date.now();
  const cdBoosts: CooldownBoosts = (() => { try { const p = JSON.parse(row.unlocked_cooldown_boosts || '{}'); return (!Array.isArray(p) && typeof p === 'object') ? p : {}; } catch { return {}; } })();
  const cdMs = paguitaCooldownMs(cdBoosts.paguita ?? 0);
  
  let last = row.last_paguita_claim_ts;
  if (!last && row.last_daily_claim) {
    // Si tiene legacy claim y es del mismo día, consideramos que la recogió hoy a las 00:00 (o lo bloqueamos 24h para simplificar)
    const today = new Date().toISOString().slice(0, 10);
    if (row.last_daily_claim === today) {
      last = new Date(today + "T00:00:00Z").getTime(); // aprox
    }
  }

  const nextAt = (last ?? 0) + cdMs;
  if (now < nextAt) return { ok: false, error: 'Demasiado pronto', nextClaimAt: nextAt };

  const boosts: TrackBoosts = (() => { try { const p = JSON.parse(row.unlocked_boosts || '{}'); return (!Array.isArray(p) && typeof p === 'object') ? p : {}; } catch { return {}; } })();
  const amount = dailyAmountFor(row.paguita_level ?? 0) * boostMultiplier('paguita', boosts);

  await dbRun('UPDATE users SET last_paguita_claim_ts = ?, last_daily_claim = NULL WHERE id = ?', [now, id]);
  const newBalance = await applyBalanceDelta(id, amount);
  return { ok: true, newBalance, nextClaimAt: now + cdMs };
};

export const claimHourlyBonus = async (id: string): Promise<{ ok: boolean; error?: string; newBalance?: string; nextClaimAt?: number }> => {
  const row = await dbGet<UserRow>(`SELECT ${USER_COLS} FROM users WHERE id = ?`, [id]);
  if (!row) return { ok: false, error: 'Usuario no encontrado' };
  const now = Date.now();
  const cdBoosts: CooldownBoosts = (() => { try { const p = JSON.parse(row.unlocked_cooldown_boosts || '{}'); return (!Array.isArray(p) && typeof p === 'object') ? p : {}; } catch { return {}; } })();
  const cdMs = dietaCooldownMs(cdBoosts.dieta ?? 0);
  
  const last = row.last_hourly_claim ?? 0;
  const nextAt = last + cdMs;
  if (now < nextAt) return { ok: false, error: 'Demasiado pronto', nextClaimAt: nextAt };
  
  const boosts: TrackBoosts = (() => { try { const p = JSON.parse(row.unlocked_boosts || '{}'); return (!Array.isArray(p) && typeof p === 'object') ? p : {}; } catch { return {}; } })();
  const amount = hourlyAmountFor(row.dieta_level ?? 0) * boostMultiplier('dieta', boosts);
  await dbRun('UPDATE users SET last_hourly_claim = ? WHERE id = ?', [now, id]);
  const newBalance = await applyBalanceDelta(id, amount);
  return { ok: true, newBalance, nextClaimAt: now + cdMs };
};

// --- Niveles personales: XP y gasto de puntos ---
export const resetUserLevels = async (id: string): Promise<void> => {
  await dbRun(
    'UPDATE users SET xp = 0, paguita_level = 0, dieta_level = 0, ruleta_level = 0, trivia_level = 0 WHERE id = ?',
    [id]
  );
};

export const addXp = async (id: string, amount: number): Promise<void> => {
  if (amount <= 0) return;
  await dbRun('UPDATE users SET xp = COALESCE(xp, 0) + ? WHERE id = ?', [amount, id]);
};

const TRACK_COLUMN: Record<LevelTrack, string> = {
  paguita: 'paguita_level',
  dieta: 'dieta_level',
  ruleta: 'ruleta_level',
  trivia: 'trivia_level',
};

export const spendLevelPoint = async (
  id: string,
  track: LevelTrack
): Promise<{ ok: boolean; error?: string }> => {
  const row = await dbGet<UserRow>(`SELECT ${USER_COLS} FROM users WHERE id = ?`, [id]);
  if (!row) return { ok: false, error: 'Usuario no encontrado' };
  const level = levelFromXp(row.xp ?? 0);
  const paguita = row.paguita_level ?? 0;
  const dieta = row.dieta_level ?? 0;
  const ruleta = row.ruleta_level ?? 0;
  const trivia = row.trivia_level ?? 0;
  const points = availableLevelPoints(level, paguita, dieta, ruleta, trivia);
  if (points <= 0) return { ok: false, error: 'No tienes puntos disponibles' };
  const current = { paguita, dieta, ruleta, trivia }[track];
  if (current >= LEVEL_TRACK_MAX[track]) return { ok: false, error: 'Mejora al máximo' };
  await dbRun(`UPDATE users SET ${TRACK_COLUMN[track]} = ${TRACK_COLUMN[track]} + 1 WHERE id = ?`, [id]);
  return { ok: true };
};

export const recordJackpotSpin = async (userId: string, bet: number, symbols: string[], multiplier: number, winAmount: number): Promise<void> => {
  await dbRun(
    'INSERT INTO jackpot_history (user_id, bet, symbols, multiplier, win_amount, played_at) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, bet, JSON.stringify(symbols), multiplier, winAmount, Date.now()]
  );
};

// --- Persistencia de Salas (Reconexión Robusta) ---
import { Room } from '../../shared/types';

export const loadRoomsFromDB = async (): Promise<Room[]> => {
  const rows = await dbAll<{ id: string; data: string }>('SELECT * FROM rooms');
  return rows.map(r => {
    try {
      return JSON.parse(r.data) as Room;
    } catch (e) {
      console.error(`Error parsing room ${r.id}:`, e);
      return null;
    }
  }).filter((r): r is Room => r !== null);
};

export const saveRoomToDB = async (room: Room): Promise<void> => {
  await dbRun('INSERT OR REPLACE INTO rooms (id, data) VALUES (?, ?)', [room.id, JSON.stringify(room)]);
};

export const deleteRoomFromDB = async (id: string): Promise<void> => {
  await dbRun('DELETE FROM rooms WHERE id = ?', [id]);
};

// --- Persistencia de Sesiones ---
export const saveSessionToDB = async (token: string, userId: string, issuedAt: number): Promise<void> => {
  await dbRun('INSERT INTO sessions (token, user_id, issued_at) VALUES (?, ?, ?)', [token, userId, issuedAt]);
};

export const getSessionFromDB = async (token: string): Promise<{ user_id: string; issued_at: number } | undefined> => {
  return dbGet<{ user_id: string; issued_at: number }>('SELECT * FROM sessions WHERE token = ?', [token]);
};

export const deleteSessionFromDB = async (token: string): Promise<void> => {
  await dbRun('DELETE FROM sessions WHERE token = ?', [token]);
};

// --- Historial de partidas ---
export interface MatchHistoryRow {
  id: number;
  user_id: string;
  room_name: string;
  buy_in: number;
  max_chips: number;
  cash_out: number;
  played_at: number;
}

export const recordMatchHistory = async (
  userId: string,
  roomName: string,
  buyIn: number,
  maxChips: number,
  cashOut: number,
  playedAt: number
): Promise<void> => {
  await dbRun(
    'INSERT INTO match_history (user_id, room_name, buy_in, max_chips, cash_out, played_at) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, roomName, buyIn, maxChips, cashOut, playedAt]
  );
};

export const getMatchHistoryForUser = async (userId: string, limit = 30): Promise<MatchHistoryRow[]> => {
  return dbAll<MatchHistoryRow>(
    'SELECT * FROM match_history WHERE user_id = ? ORDER BY played_at DESC LIMIT ?',
    [userId, limit]
  );
};

// --- Estadísticas de poker ---
export interface PokerStatsRow {
  user_id: string;
  hands_played: number;
  hands_won: number;
  biggest_pot: number;
  best_hand_rank: number;
  best_hand_name: string;
}

// Orden de fuerza de las manos según los nombres que devuelve pokersolver (hand.name).
const HAND_RANK_ORDER: Record<string, number> = {
  'High Card': 1,
  'Pair': 2,
  'Two Pair': 3,
  'Three of a Kind': 4,
  'Straight': 5,
  'Flush': 6,
  'Full House': 7,
  'Four of a Kind': 8,
  'Straight Flush': 9,
  'Royal Flush': 10,
};

export const recordHandStats = async (
  userId: string,
  opts: { won: boolean; potWon: number; handName?: string }
): Promise<void> => {
  await dbRun('INSERT OR IGNORE INTO poker_stats (user_id) VALUES (?)', [userId]);
  await dbRun(
    `UPDATE poker_stats SET
      hands_played = hands_played + 1,
      hands_won = hands_won + ?,
      biggest_pot = MAX(biggest_pot, ?)
    WHERE user_id = ?`,
    [opts.won ? 1 : 0, opts.won ? opts.potWon : 0, userId]
  );
  const rank = opts.handName ? HAND_RANK_ORDER[opts.handName] || 0 : 0;
  if (rank > 0) {
    await dbRun(
      'UPDATE poker_stats SET best_hand_rank = ?, best_hand_name = ? WHERE user_id = ? AND best_hand_rank < ?',
      [rank, opts.handName, userId, rank]
    );
  }
};

export const getPokerStats = async (userId: string): Promise<PokerStatsRow> => {
  const row = await dbGet<PokerStatsRow>('SELECT * FROM poker_stats WHERE user_id = ?', [userId]);
  return row || { user_id: userId, hands_played: 0, hands_won: 0, biggest_pot: 0, best_hand_rank: 0, best_hand_name: '' };
};

// --- Estadísticas genéricas (contadores y récords por usuario) ---
// Tabla clave-valor: añadir un stat nuevo no requiere migración.
// Telemetría no crítica: los errores se tragan con log para no romper el flujo del juego.
export const bumpStat = async (userId: string, stat: string, delta: number = 1): Promise<void> => {
  if (!delta) return;
  try {
    await dbRun(
      `INSERT INTO user_stats (user_id, stat, value) VALUES (?, ?, ?)
       ON CONFLICT(user_id, stat) DO UPDATE SET value = value + excluded.value`,
      [userId, stat, delta]
    );
  } catch (err) { console.error(`[stats] bump ${stat}:`, err); }
};

export const maxStat = async (userId: string, stat: string, value: number): Promise<void> => {
  try {
    await dbRun(
      `INSERT INTO user_stats (user_id, stat, value) VALUES (?, ?, ?)
       ON CONFLICT(user_id, stat) DO UPDATE SET value = MAX(value, excluded.value)`,
      [userId, stat, value]
    );
  } catch (err) { console.error(`[stats] max ${stat}:`, err); }
};

// --- Stats monetarios de precisión arbitraria (value_t TEXT, Decimal) ---
// Para stats que pueden superar 9.2e18 (límite INTEGER de SQLite): max_balance,
// totales de premios/apuestas grandes, etc.
export const maxStatBig = async (userId: string, stat: string, value: string | Money): Promise<void> => {
  try {
    const v = toStr(value as any);
    const row = await dbGet<{ value_t: string | null }>(
      'SELECT value_t FROM user_stats WHERE user_id = ? AND stat = ?', [userId, stat]
    );
    if (!row) {
      await dbRun('INSERT INTO user_stats (user_id, stat, value, value_t) VALUES (?, ?, 0, ?)', [userId, stat, v]);
    } else if (row.value_t == null || gt(v, row.value_t)) {
      await dbRun('UPDATE user_stats SET value_t = ? WHERE user_id = ? AND stat = ?', [v, userId, stat]);
    }
  } catch (err) { console.error(`[stats] maxBig ${stat}:`, err); }
};

export const bumpStatBig = async (userId: string, stat: string, delta: string | Money): Promise<void> => {
  try {
    const row = await dbGet<{ value_t: string | null }>(
      'SELECT value_t FROM user_stats WHERE user_id = ? AND stat = ?', [userId, stat]
    );
    const current = row?.value_t ?? '0';
    const next = toStr(add(current, delta as any));
    if (!row) {
      await dbRun('INSERT INTO user_stats (user_id, stat, value, value_t) VALUES (?, ?, 0, ?)', [userId, stat, next]);
    } else {
      await dbRun('UPDATE user_stats SET value_t = ? WHERE user_id = ? AND stat = ?', [next, userId, stat]);
    }
  } catch (err) { console.error(`[stats] bumpBig ${stat}:`, err); }
};

export const getStatBig = async (userId: string, stat: string): Promise<string> => {
  const row = await dbGet<{ value_t: string | null }>(
    'SELECT value_t FROM user_stats WHERE user_id = ? AND stat = ?', [userId, stat]
  );
  return row?.value_t ?? '0';
};

export const getAllStats = async (userId: string): Promise<Record<string, number>> => {
  const rows = await dbAll<{ stat: string; value: number }>(
    'SELECT stat, value FROM user_stats WHERE user_id = ?',
    [userId]
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.stat] = r.value;
  return out;
};

// ============================================================
// SISTEMA DE MISIONES (Fase 1)
// ============================================================
import {
  DAILY_TEMPLATES, DailyTemplate, generateDailySet, missionDateFor,
  misionTrackValuesFor, dailyMissionReward, brocheRewardsFor, MISION_UPGRADES_PER_DAY,
} from '../../shared/missions';
import { ACHIEVEMENTS_CATALOG } from '../../shared/achievements';

interface DailyMissionRow {
  user_id: string;
  mission_date: string;
  slot: number;
  template_id: string;
  tier_index: number;
  requirement: number;
  snapshot_value: string;
  completed_at: number | null;
  claimed_at: number | null;
}

export interface DailyMissionView {
  slot: number;
  templateId: string;
  game: string;
  emoji: string;
  label: string;
  requirement: number;
  progress: number;       // capado a requirement, derivado de stat_actual - snapshot
  completed: boolean;
  claimed: boolean;
  rewardChips: string;
  rewardXp: number;
}

// Asegura que el usuario tiene sus 5 diarias asignadas para el día de misión actual.
// Si no existen filas para hoy, las crea con snapshot del stat correspondiente.
const ensureDailyMissions = async (userId: string, missionDate: string): Promise<DailyMissionRow[]> => {
  const existing = await dbAll<DailyMissionRow>(
    'SELECT * FROM user_daily_missions WHERE user_id = ? AND mission_date = ? ORDER BY slot',
    [userId, missionDate]
  );
  if (existing.length === 5) return existing;

  // Generar el set determinista del día y crear snapshots de los stats actuales.
  const slots = generateDailySet(missionDate);
  const stats = await getAllStats(userId);
  const rows: DailyMissionRow[] = [];
  for (const slot of slots) {
    const tpl = DAILY_TEMPLATES.find(t => t.id === slot.templateId)!;
    const snapshot = String(stats[tpl.statKey] ?? 0);
    await dbRun(
      `INSERT OR IGNORE INTO user_daily_missions
       (user_id, mission_date, slot, template_id, tier_index, requirement, snapshot_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, missionDate, slot.slot, slot.templateId, slot.tierIndex, slot.requirement, snapshot]
    );
    rows.push({
      user_id: userId, mission_date: missionDate, slot: slot.slot, template_id: slot.templateId,
      tier_index: slot.tierIndex, requirement: slot.requirement, snapshot_value: snapshot,
      completed_at: null, claimed_at: null,
    });
  }
  // Releer por si ya existían parcialmente (carrera improbable, pero correcto).
  return dbAll<DailyMissionRow>(
    'SELECT * FROM user_daily_missions WHERE user_id = ? AND mission_date = ? ORDER BY slot',
    [userId, missionDate]
  );
};

// Marca como completadas (completed_at) las diarias cuyo progreso ya alcanzó el requisito,
// sin tocar las que ya estaban completadas. Devuelve cuántas se completaron ahora mismo.
const refreshCompletionState = async (userId: string, missionDate: string, rows: DailyMissionRow[], stats: Record<string, number>): Promise<DailyMissionRow[]> => {
  const now = Date.now();
  const updated: DailyMissionRow[] = [];
  for (const row of rows) {
    if (row.completed_at != null) { updated.push(row); continue; }
    const tpl = DAILY_TEMPLATES.find(t => t.id === row.template_id)!;
    const current = stats[tpl.statKey] ?? 0;
    const progress = Math.max(0, current - Number(row.snapshot_value));
    if (progress >= row.requirement) {
      await dbRun('UPDATE user_daily_missions SET completed_at = ? WHERE user_id = ? AND mission_date = ? AND slot = ?', [now, userId, missionDate, row.slot]);
      updated.push({ ...row, completed_at: now });
    } else {
      updated.push(row);
    }
  }
  return updated;
};

// Vista completa del estado de misiones diarias de hoy para un usuario (crea/actualiza si hace falta).
export const getDailyMissionsView = async (userId: string): Promise<{ missionDate: string; missions: DailyMissionView[]; misionLevel: number }> => {
  const missionDate = missionDateFor();
  let rows = await ensureDailyMissions(userId, missionDate);
  const stats = await getAllStats(userId);
  rows = await refreshCompletionState(userId, missionDate, rows, stats);

  const user = await getUser(userId);
  const misionLevel = user?.mision_level ?? 0;

  const missions: DailyMissionView[] = rows.map(row => {
    const tpl = DAILY_TEMPLATES.find(t => t.id === row.template_id)!;
    const current = stats[tpl.statKey] ?? 0;
    const progress = Math.min(row.requirement, Math.max(0, current - Number(row.snapshot_value)));
    const reward = dailyMissionReward(misionLevel, tpl);
    return {
      slot: row.slot,
      templateId: row.template_id,
      game: tpl.game,
      emoji: tpl.emoji,
      label: tpl.label.replace('{n}', String(row.requirement)),
      requirement: row.requirement,
      progress,
      completed: row.completed_at != null,
      claimed: row.claimed_at != null,
      rewardChips: reward.chips,
      rewardXp: reward.xp,
    };
  });

  return { missionDate, missions, misionLevel };
};

// Reclama una diaria completada. Server-authoritative: revalida estado antes de pagar.
export const claimDailyMission = async (userId: string, slot: number): Promise<{ ok: boolean; error?: string; rewardChips?: string; rewardXp?: number }> => {
  const missionDate = missionDateFor();
  const rows = await ensureDailyMissions(userId, missionDate);
  const stats = await getAllStats(userId);
  const refreshed = await refreshCompletionState(userId, missionDate, rows, stats);
  const row = refreshed.find(r => r.slot === slot);
  if (!row) return { ok: false, error: 'Misión no encontrada' };
  if (row.completed_at == null) return { ok: false, error: 'Misión no completada todavía' };
  if (row.claimed_at != null) return { ok: false, error: 'Ya reclamada' };

  const tpl = DAILY_TEMPLATES.find(t => t.id === row.template_id)!;
  const user = await getUser(userId);
  const misionLevel = user?.mision_level ?? 0;
  const reward = dailyMissionReward(misionLevel, tpl);

  await dbRun('UPDATE user_daily_missions SET claimed_at = ? WHERE user_id = ? AND mission_date = ? AND slot = ?', [Date.now(), userId, missionDate, slot]);
  await applyBalanceDelta(userId, reward.chips);
  await addXp(userId, reward.xp);

  return { ok: true, rewardChips: reward.chips, rewardXp: reward.xp };
};

// Estado de los 3 broches del día (cuántas diarias completadas, qué se puede reclamar).
export const getBrocheStateView = async (userId: string) => {
  const { missionDate, missions, misionLevel } = await getDailyMissionsView(userId);
  const completedCount = missions.filter(m => m.completed).length;
  const claims = await dbGet<{ bronze_claimed_at: number | null; silver_claimed_at: number | null; gold_claimed_at: number | null }>(
    'SELECT bronze_claimed_at, silver_claimed_at, gold_claimed_at FROM user_broche_claims WHERE user_id = ? AND mission_date = ?',
    [userId, missionDate]
  );
  const rewards = brocheRewardsFor(misionLevel);
  return {
    missionDate,
    completedCount,
    bronze: { eligible: true, claimed: !!claims?.bronze_claimed_at, rewardXp: rewards.bronceXp },
    silver: { eligible: completedCount >= 3, claimed: !!claims?.silver_claimed_at, rewardSpins: rewards.plataSpinsCount, rewardSpinValue: rewards.plataSpinValue },
    gold: { eligible: completedCount >= 5, claimed: !!claims?.gold_claimed_at, rewardChips: rewards.oroChips },
  };
};

// Reclama un broche concreto. Server-authoritative: revalida elegibilidad antes de pagar.
export const claimBroche = async (userId: string, tier: 'bronze' | 'silver' | 'gold'): Promise<{ ok: boolean; error?: string }> => {
  const state = await getBrocheStateView(userId);
  const slice = state[tier];
  if (!slice.eligible) return { ok: false, error: 'Broche no desbloqueado todavía' };
  if (slice.claimed) return { ok: false, error: 'Ya reclamado' };

  await dbRun(
    `INSERT INTO user_broche_claims (user_id, mission_date, ${tier === 'bronze' ? 'bronze_claimed_at' : tier === 'silver' ? 'silver_claimed_at' : 'gold_claimed_at'})
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, mission_date) DO UPDATE SET ${tier === 'bronze' ? 'bronze_claimed_at' : tier === 'silver' ? 'silver_claimed_at' : 'gold_claimed_at'} = excluded.${tier === 'bronze' ? 'bronze_claimed_at' : tier === 'silver' ? 'silver_claimed_at' : 'gold_claimed_at'}`,
    [userId, state.missionDate, Date.now()]
  );

  if (tier === 'bronze') {
    const rewards = brocheRewardsFor((await getUser(userId))?.mision_level ?? 0);
    await addXp(userId, rewards.bronceXp);
  } else if (tier === 'silver') {
    const rewards = brocheRewardsFor((await getUser(userId))?.mision_level ?? 0);
    await addOneFreeSpin(userId, rewards.plataSpinValue, rewards.plataSpinsCount);
  } else if (tier === 'gold') {
    const rewards = brocheRewardsFor((await getUser(userId))?.mision_level ?? 0);
    await applyBalanceDelta(userId, rewards.oroChips);
  }

  return { ok: true };
};

// Gasta 1 punto de nivel en el track de Misiones (infinito, máx 5 mejoras/día).
export const spendMisionLevelPoint = async (userId: string): Promise<{ ok: boolean; error?: string }> => {
  const row = await dbGet<UserRow>(`SELECT ${USER_COLS} FROM users WHERE id = ?`, [userId]);
  if (!row) return { ok: false, error: 'Usuario no encontrado' };

  const level = levelFromXp(row.xp ?? 0);
  const paguita = row.paguita_level ?? 0;
  const dieta = row.dieta_level ?? 0;
  const ruleta = row.ruleta_level ?? 0;
  const trivia = row.trivia_level ?? 0;
  const misionLevel = row.mision_level ?? 0;
  const points = availableLevelPoints(level, paguita, dieta, ruleta, trivia, undefined, misionLevel);
  if (points <= 0) return { ok: false, error: 'No tienes puntos disponibles' };

  const today = missionDateFor();
  const upgradesToday = row.mision_upgrades_date === today ? (row.mision_upgrades_today ?? 0) : 0;
  if (upgradesToday >= MISION_UPGRADES_PER_DAY) return { ok: false, error: 'Límite de mejoras diarias alcanzado' };

  await dbRun(
    'UPDATE users SET mision_level = mision_level + 1, mision_upgrades_today = ?, mision_upgrades_date = ? WHERE id = ?',
    [upgradesToday + 1, today, userId]
  );
  return { ok: true };
};

// --- Logros permanentes ---
export interface AchievementView {
  id: string;
  chainId: string;
  tier: number;
  game: string;
  emoji: string;
  label: string;
  requirement: string;
  progress: string;
  completed: boolean;
  claimed: boolean;
  rewardChips: string;
  rewardXp: number;
}

const ACHIEVEMENT_BIG_STAT_KEYS = new Set(['max_balance', 'biggest_pot', 'bj_biggest_win', 'roulette_biggest_win', 'jackpot_biggest_win', 'mines_biggest_win']);
// max_balance es un récord histórico legítimo: NO se le resta baseline (cuenta desde siempre).
// Todo lo demás (actividad acumulada y récords de premio en una jugada) cuenta desde el
// snapshot tomado en el deploy de este fix, para que los veteranos no reciban logros de golpe.
const ACHIEVEMENT_NO_BASELINE_STATS = new Set(['max_balance']);

const getAchievementBaseline = async (userId: string, statKey: string): Promise<string> => {
  if (ACHIEVEMENT_NO_BASELINE_STATS.has(statKey)) return '0';
  const row = await dbGet<{ baseline_value: string }>(
    'SELECT baseline_value FROM user_achievement_baselines WHERE user_id = ? AND stat_key = ?',
    [userId, statKey]
  );
  return row?.baseline_value ?? '0'; // usuarios nuevos (sin fila) -> baseline 0
};

// Valor "efectivo" de un stat para logros: stat_actual - baseline (clamp a 0), salvo
// max_balance que se devuelve crudo.
const getEffectiveAchievementStat = async (userId: string, statKey: string, statsCache: Record<string, number>): Promise<string> => {
  const raw = ACHIEVEMENT_BIG_STAT_KEYS.has(statKey) ? await getStatBig(userId, statKey) : String(statsCache[statKey] ?? 0);
  const baseline = await getAchievementBaseline(userId, statKey);
  const effective = sub(raw, baseline);
  return isNeg(effective) ? '0' : toStr(effective);
};

// Devuelve, por cada cadena, solo el tier actual (primero no reclamado).
export const getAchievementsView = async (userId: string): Promise<AchievementView[]> => {
  const claimedRows = await dbAll<{ achievement_id: string }>('SELECT achievement_id FROM user_achievement_claims WHERE user_id = ?', [userId]);
  const claimedSet = new Set(claimedRows.map(r => r.achievement_id));
  const stats = await getAllStats(userId);

  const byChain = new Map<string, typeof ACHIEVEMENTS_CATALOG>();
  for (const a of ACHIEVEMENTS_CATALOG) {
    if (!byChain.has(a.chainId)) byChain.set(a.chainId, []);
    byChain.get(a.chainId)!.push(a);
  }

  const out: AchievementView[] = [];
  for (const [, tiers] of byChain) {
    const sorted = [...tiers].sort((a, b) => a.tier - b.tier);
    // Primer tier no reclamado todavía.
    const firstUnclaimedIdx = sorted.findIndex(t => !claimedSet.has(t.id));
    const visible = firstUnclaimedIdx === -1
      ? [sorted[sorted.length - 1]] // todo reclamado: mostramos el último como referencia
      : [sorted[firstUnclaimedIdx]]; // solo el tier actual

    for (const a of visible) {
      const effectiveStat = await getEffectiveAchievementStat(userId, a.statKey, stats);
      const progress = gte(effectiveStat, a.requirement) ? a.requirement : effectiveStat;
      out.push({
        id: a.id, chainId: a.chainId, tier: a.tier, game: a.game, emoji: a.emoji, label: a.label,
        requirement: a.requirement, progress,
        completed: gte(effectiveStat, a.requirement),
        claimed: claimedSet.has(a.id),
        rewardChips: a.rewardChips, rewardXp: a.rewardXp,
      });
    }
  }
  return out;
};

// Reclama un logro. Server-authoritative: revalida el stat efectivo (tras baseline) contra el requisito.
export const claimAchievement = async (userId: string, achievementId: string): Promise<{ ok: boolean; error?: string; rewardChips?: string; rewardXp?: number }> => {
  const def = ACHIEVEMENTS_CATALOG.find(a => a.id === achievementId);
  if (!def) return { ok: false, error: 'Logro no encontrado' };

  const already = await dbGet('SELECT 1 FROM user_achievement_claims WHERE user_id = ? AND achievement_id = ?', [userId, achievementId]);
  if (already) return { ok: false, error: 'Ya reclamado' };

  const stats = await getAllStats(userId);
  const effectiveStat = await getEffectiveAchievementStat(userId, def.statKey, stats);
  if (!gte(effectiveStat, def.requirement)) return { ok: false, error: 'Requisito no alcanzado' };

  await dbRun('INSERT INTO user_achievement_claims (user_id, achievement_id, claimed_at) VALUES (?, ?, ?)', [userId, achievementId, Date.now()]);
  await applyBalanceDelta(userId, def.rewardChips);
  await addXp(userId, def.rewardXp);

  return { ok: true, rewardChips: def.rewardChips, rewardXp: def.rewardXp };
};

export const claimFreeSpins = async (id: string, value: number, amount: number = 10): Promise<void> => {
  const user = await getUser(id);
  const pools = parsePools(user?.free_spins_pools ?? null);
  pools[String(value)] = (pools[String(value)] || 0) + amount;
  await dbRun(
    'UPDATE users SET free_spins_pools = ?, last_free_spins_claim = ? WHERE id = ?',
    [JSON.stringify(pools), Date.now(), id]
  );
};

export const useFreeSpin = async (id: string, value?: number): Promise<void> => {
  const user = await getUser(id);
  const pools = parsePools(user?.free_spins_pools ?? null);
  const key = String(value ?? user?.free_spin_value ?? 0);
  if (pools[key] > 0) {
    pools[key]--;
    if (pools[key] === 0) delete pools[key];
  }
  await dbRun('UPDATE users SET free_spins_pools = ? WHERE id = ?', [JSON.stringify(pools), id]);
};

export const setJackpotUnlockLevel = async (id: string, level: number): Promise<void> => {
  await dbRun('UPDATE users SET jackpot_unlock_level = ? WHERE id = ?', [level, id]);
};

export const setUserIsBot = async (id: string, isBot: boolean): Promise<void> => {
  await dbRun('UPDATE users SET is_bot = ? WHERE id = ?', [isBot ? 1 : 0, id]);
};

export const setUserIsCursed = async (id: string, isCursed: boolean): Promise<void> => {
  await dbRun('UPDATE users SET is_cursed = ? WHERE id = ?', [isCursed ? 1 : 0, id]);
};

export const addOneFreeSpin = async (id: string, value: number | string | Money, count = 1): Promise<void> => {
  const user = await getUser(id);
  const pools = parsePools(user?.free_spins_pools ?? null);
  const key = toStr(value as any);
  pools[key] = (pools[key] || 0) + count;
  await dbRun('UPDATE users SET free_spins_pools = ? WHERE id = ?', [JSON.stringify(pools), id]);
};

export const getHaciendaTotal = async (): Promise<string> => {
  const row = await dbGet<{ total: string }>("SELECT COALESCE(total_t, CAST(total AS TEXT), '0') AS total FROM hacienda_state WHERE id = 1");
  return row?.total ?? '0';
};

// --- Shop Catalog Settings ---
import { SHOP_CATALOG } from '../../shared/types';
import type { ShopItem } from '../../shared/types';

const getCatalogPath = () => {
  const p1 = path.join(__dirname, '..', '..', 'shared', 'custom_shop_catalog.json');
  const p2 = path.join(__dirname, '..', '..', '..', '..', 'shared', 'custom_shop_catalog.json');
  
  // Si estamos en la carpeta dist compilada, __dirname incluirá 'dist' o la profundidad requerirá subir más
  if (__dirname.includes('dist') || __dirname.includes('build')) {
    return p2;
  }
  return p1;
};

const customCatalogPath = getCatalogPath();

export const getShopCatalog = async (): Promise<ShopItem[]> => {
  try {
    if (fs.existsSync(customCatalogPath)) {
      const data = fs.readFileSync(customCatalogPath, 'utf8');
      const customCat = JSON.parse(data) as ShopItem[];
      
      // Mapeamos el catálogo base del código (types.ts)
      // para que siempre aparezcan los nuevos items y se borren los eliminados,
      // aplicando encima las ediciones personalizadas (precio, nivel, etc)
      return SHOP_CATALOG.map(baseItem => {
        const customItem = customCat.find(c => c.id === baseItem.id);
        if (customItem) {
          return { ...baseItem, ...customItem };
        }
        return baseItem;
      });
    }
  } catch (e) {
    console.error('Error parsing custom_shop_catalog.json:', e);
  }
  return SHOP_CATALOG; // fallback al default si no hay fichero
};

export const saveShopCatalog = async (catalog: ShopItem[]): Promise<void> => {
  try {
    fs.writeFileSync(customCatalogPath, JSON.stringify(catalog, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing custom_shop_catalog.json:', e);
  }
};

export const addHaciendaTotal = async (amount: bigint | number | string | Money): Promise<string> => {
  await dbRun('INSERT OR IGNORE INTO hacienda_state (id, total, total_t) VALUES (1, 0, \'0\')');
  const cur = await getHaciendaTotal();
  const next = toStr(add(cur, amount as any));
  // total_t (TEXT) es la fuente de verdad; precisión arbitraria vía Decimal.
  await dbRun('UPDATE hacienda_state SET total_t = ? WHERE id = 1', [next]);
  return await getHaciendaTotal();
};

export const payIsrael = async (id: string): Promise<string> => {
  const user = await getUser(id);
  const debt = m(user?.israel_debt ?? 0);
  if (debt.lte(0)) return '0';

  await dbRun("UPDATE users SET israel_debt = 0, israel_debt_t = '0', paid_israel = 1 WHERE id = ?", [id]);
  const balanceBefore = m(user?.balance ?? 0);
  await applyBalanceDelta(id, debt.negated());
  return toStr(balanceBefore.lt(debt) ? balanceBefore : debt); // lo que realmente se pudo cobrar
}

// --- Shop Helpers ---
export const addUnlockedShopItem = async (id: string, type: 'avatar' | 'name' | 'felt', itemId: string): Promise<void> => {
  const row = await getUser(id);
  if (!row) return;
  const colName = `unlocked_${type === 'avatar' ? 'avatar_decorations' : type === 'name' ? 'name_decorations' : 'bj_felts'}`;
  const currentArr: string[] = row[colName as keyof UserRow] ? JSON.parse(row[colName as keyof UserRow] as string) : [];
  if (!currentArr.includes(itemId)) {
    currentArr.push(itemId);
    await dbRun(`UPDATE users SET ${colName} = ? WHERE id = ?`, [JSON.stringify(currentArr), id]);
  }
};

export const equipShopItem = async (id: string, type: 'avatar' | 'name' | 'felt', itemId: string | null): Promise<void> => {
  const colName = `equipped_${type === 'avatar' ? 'avatar_decoration' : type === 'name' ? 'name_decoration' : 'bj_felt'}`;
  await dbRun(`UPDATE users SET ${colName} = ? WHERE id = ?`, [itemId, id]);
};

export const setMovedToAndorra = async (id: string): Promise<void> => {
  await dbRun('UPDATE users SET moved_to_andorra = 1 WHERE id = ?', [id]);
};

export const setHasArtilugio = async (id: string): Promise<void> => {
  await dbRun('UPDATE users SET has_artilugio = 1 WHERE id = ?', [id]);
};

export const addIsraelDonation = async (donorId: string, amount: number | bigint | string | Money): Promise<void> => {
  const amt = m(amount);
  if (amt.lte(0)) return;
  // Transferir a la cuenta de Israel (saldo exacto vía applyBalanceDelta).
  const israelUser = await getUserByName('Israel');
  if (israelUser) {
    await applyBalanceDelta(israelUser.id, amt);
  } else {
    await createUser('israel-id', 'Israel');
    await applyBalanceDelta('israel-id', amt);
  }
  // Descontar del donante.
  await applyBalanceDelta(donorId, amt.negated());

  // Stats del donante (donación acumulada + pool 1.5×). _t TEXT = fuente de verdad.
  const donor = await getUser(donorId);
  const newDonation = toStr(add(donor?.israel_donation ?? 0, amt));
  const poolAddition = amt.times(3).div(2).floor();
  const newPool = toStr(add(donor?.israel_pool ?? 0, poolAddition));
  await dbRun('UPDATE users SET israel_donation_t = ?, israel_pool_t = ? WHERE id = ?', [newDonation, newPool, donorId]);
};

export const deductIsraelPool = async (id: string, amount: number): Promise<number> => {
  const row = await getUser(id);
  const pool = m(row?.israel_pool ?? 0);
  if (pool.lte(0)) return 0;
  const amt = m(amount);
  const deducted = amt.lt(pool) ? amt : pool;
  const newPool = toStr(pool.minus(deducted));
  await dbRun('UPDATE users SET israel_pool_t = ? WHERE id = ?', [newPool, id]);
  return deducted.toNumber();
};

export const resetShopPurchases = async (id: string): Promise<void> => {
  await dbRun(`
    UPDATE users SET
      equipped_avatar_decoration = NULL,
      unlocked_avatar_decorations = '[]',
      equipped_name_decoration = NULL,
      unlocked_name_decorations = '[]',
      equipped_bj_felt = NULL,
      unlocked_bj_felts = '[]',
      moved_to_andorra = 0
    WHERE id = ?
  `, [id]);
};

