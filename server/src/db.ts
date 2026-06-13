import sqlite3 from 'sqlite3';
import path from 'path';
import { promisify } from 'util';

const dbPath = path.join(__dirname, '..', 'poker.sqlite');
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
  { name: '040_settings_table', sql: 'CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)' }
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

  for (const m of MIGRATIONS) {
    if (!applied.has(m.name)) {
      try {
        await dbRun(m.sql);
      } catch (err: any) {
        if (m.ignoreError && err.message.includes(m.ignoreError)) {
          console.log(`Migration ${m.name} recovered from old schema (${m.ignoreError})`);
        } else {
          console.error(`Error running migration ${m.name}:`, err);
          throw err;
        }
      }
      await dbRun('INSERT INTO migrations (name) VALUES (?)', [m.name]);
      console.log(`Migration applied: ${m.name}`);
    }
  }
  console.log('Database migrations up to date.');
};

// Fila completa en BD (incluye el hash, que NUNCA sale del servidor)
export interface UserRow {
  id: string;
  name: string;
  balance: number;
  password_hash: string | null;
  avatar: string | null;
  last_daily_claim: string | null;
  last_hourly_claim: number | null;
  free_spins_left: number;
  free_spin_value: number;
  last_free_spins_claim: number;
  free_spins_pools: string | null;
  jackpot_unlock_level: number;
  xp: number;
  paguita_level: number;
  dieta_level: number;
  ruleta_level: number;
  trivia_level: number;
  last_seen?: number;
  paid_israel?: number;
  israel_debt?: number;
  
  // --- Shop y Cosméticos ---
  equipped_avatar_decoration?: string | null;
  unlocked_avatar_decorations?: string | null;
  
  equipped_name_decoration?: string | null;
  unlocked_name_decorations?: string | null;
  
  equipped_bj_felt?: string | null;
  unlocked_bj_felts?: string | null;
  
  // --- Beneficios Sociales ---
  moved_to_andorra?: number;
  israel_donation?: number;
  israel_pool?: number;

  // --- Mejoras de Tienda ---
  unlocked_boosts?: string | null;
}

import { PublicUser, levelFromXp, availableLevelPoints, dailyAmountFor, hourlyAmountFor, LevelTrack, LEVEL_TRACK_MAX, boostMultiplier, TrackBoosts } from '../../shared/types';

export const parsePools = (raw: string | null): Record<string, number> => {
  try { const p = JSON.parse(raw || '{}'); return (p && typeof p === 'object') ? p : {}; } catch { return {}; }
};

export const toPublicUser = (row: UserRow): PublicUser => {
  const xp = row.xp ?? 0;
  const level = levelFromXp(xp);
  const paguitaLevel = row.paguita_level ?? 0;
  const dietaLevel = row.dieta_level ?? 0;
  const ruletaLevel = row.ruleta_level ?? 0;
  const triviaLevel = row.trivia_level ?? 0;
  // Merge legacy single-slot into pools for backward compat
  const pools = parsePools(row.free_spins_pools);
  const legacyLeft = row.free_spins_left ?? 0;
  const legacyVal = row.free_spin_value ?? 0;
  if (legacyLeft > 0 && legacyVal > 0 && !pools[String(legacyVal)]) {
    pools[String(legacyVal)] = legacyLeft;
  }
  return {
    id: row.id,
    name: row.name,
    balance: row.balance,
    avatar: row.avatar || row.id,
    hasPassword: !!row.password_hash,
    lastDailyClaim: row.last_daily_claim ?? null,
    lastHourlyClaim: row.last_hourly_claim ?? null,
    freeSpinPools: pools,
    freeSpinsLeft: Object.values(pools).reduce((a, b) => a + b, 0),
    freeSpinValue: legacyVal,
    lastFreeSpinsClaim: row.last_free_spins_claim ?? 0,
    jackpotUnlockLevel: row.jackpot_unlock_level ?? 0,
    xp,
    level,
    levelPoints: availableLevelPoints(level, paguitaLevel, dietaLevel, ruletaLevel, triviaLevel),
    paguitaLevel,
    dietaLevel,
    ruletaLevel,
    triviaLevel,
    lastSeen: row.last_seen ?? undefined,
    paidIsrael: !!row.paid_israel,
    israelDebt: row.israel_debt ?? 0,
    equippedAvatarDecoration: row.equipped_avatar_decoration ?? undefined,
    unlockedAvatarDecorations: row.unlocked_avatar_decorations ? JSON.parse(row.unlocked_avatar_decorations) : [],
    equippedNameDecoration: row.equipped_name_decoration ?? undefined,
    unlockedNameDecorations: row.unlocked_name_decorations ? JSON.parse(row.unlocked_name_decorations) : [],
    equippedBjFelt: row.equipped_bj_felt ?? undefined,
    unlockedBjFelts: row.unlocked_bj_felts ? JSON.parse(row.unlocked_bj_felts) : [],
    israelDonation: row.israel_donation ?? 0,
    israelPool: row.israel_pool ?? 0,
    movedToAndorra: !!row.moved_to_andorra,
    unlockedBoosts: (() => { try { const p = JSON.parse(row.unlocked_boosts || '{}'); return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {}; } catch { return {}; } })(),
  };
};

export const getAllUsersRanked = async (): Promise<UserRow[]> => {
  return dbAll<UserRow>("SELECT * FROM users WHERE name != 'Jorge' ORDER BY balance DESC");
};

export const getAllUsersAdmin = async (): Promise<UserRow[]> => {
  return dbAll<UserRow>("SELECT * FROM users ORDER BY name ASC");
};

export const getUser = async (id: string): Promise<UserRow | undefined> => {
  return dbGet<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
};

export const deleteUser = async (id: string): Promise<void> => {
  await dbRun('DELETE FROM sessions WHERE user_id = ?', [id]);
  await dbRun('DELETE FROM users WHERE id = ?', [id]);
};

// Búsqueda por nombre (sin distinguir mayúsculas ni espacios sobrantes).
// Es la clave para que el saldo persista al volver a entrar con el mismo nombre.
export const getUserByName = async (name: string): Promise<UserRow | undefined> => {
  return dbGet<UserRow>('SELECT * FROM users WHERE name = ? COLLATE NOCASE', [name.trim()]);
};

export const resetJorgeCooldowns = async (): Promise<void> => {
  await dbRun(
    `UPDATE users SET last_daily_claim = NULL, last_hourly_claim = 0, last_free_spins_claim = 0
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
  await dbRun('INSERT OR IGNORE INTO users (id, name, balance) VALUES (?, ?, 1000)', [id, name.trim()]);
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

export const updateUserBalance = async (id: string, amount: number): Promise<void> => {
  await dbRun('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, id]);
  onBalanceChanged();
};

// Aplica un delta al saldo y devuelve el saldo resultante.
// sqlite3 serializa las sentencias sobre la conexión, así que UPDATE+SELECT es atómico aquí.
export const applyBalanceDelta = async (id: string, delta: number): Promise<number> => {
  await dbRun('UPDATE users SET balance = MAX(0, balance + ?) WHERE id = ?', [delta, id]);
  const row = await dbGet<{ balance: number }>('SELECT balance FROM users WHERE id = ?', [id]);
  onBalanceChanged();
  const balance = row?.balance ?? 0;
  // Récord histórico de saldo. Fire-and-forget: no frena el flujo de pagos.
  void maxStat(id, 'max_balance', balance);
  return balance;
};

const HOURLY_COOLDOWN_MS = 30 * 60 * 1000;

export const claimDailyBonus = async (id: string): Promise<{ ok: boolean; error?: string; newBalance?: number }> => {
  const row = await dbGet<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
  if (!row) return { ok: false, error: 'Usuario no encontrado' };
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  if (row.last_daily_claim === today) return { ok: false, error: 'Ya recogiste el bono hoy' };
  const boosts: TrackBoosts = (() => { try { const p = JSON.parse(row.unlocked_boosts || '{}'); return (!Array.isArray(p) && typeof p === 'object') ? p : {}; } catch { return {}; } })();
  const amount = dailyAmountFor(row.paguita_level ?? 0) * boostMultiplier('paguita', boosts);
  await dbRun('UPDATE users SET balance = balance + ?, last_daily_claim = ? WHERE id = ?', [amount, today, id]);
  const updated = await dbGet<{ balance: number }>('SELECT balance FROM users WHERE id = ?', [id]);
  onBalanceChanged();
  return { ok: true, newBalance: updated?.balance ?? 0 };
};

export const claimHourlyBonus = async (id: string): Promise<{ ok: boolean; error?: string; newBalance?: number; nextClaimAt?: number }> => {
  const row = await dbGet<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
  if (!row) return { ok: false, error: 'Usuario no encontrado' };
  const now = Date.now();
  const last = row.last_hourly_claim ?? 0;
  const nextAt = last + HOURLY_COOLDOWN_MS;
  if (now < nextAt) return { ok: false, error: 'Demasiado pronto', nextClaimAt: nextAt };
  const boosts: TrackBoosts = (() => { try { const p = JSON.parse(row.unlocked_boosts || '{}'); return (!Array.isArray(p) && typeof p === 'object') ? p : {}; } catch { return {}; } })();
  const amount = hourlyAmountFor(row.dieta_level ?? 0) * boostMultiplier('dieta', boosts);
  await dbRun('UPDATE users SET balance = balance + ?, last_hourly_claim = ? WHERE id = ?', [amount, now, id]);
  const updated = await dbGet<{ balance: number }>('SELECT balance FROM users WHERE id = ?', [id]);
  onBalanceChanged();
  return { ok: true, newBalance: updated?.balance ?? 0, nextClaimAt: now + HOURLY_COOLDOWN_MS };
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
  const row = await dbGet<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
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

export const getAllStats = async (userId: string): Promise<Record<string, number>> => {
  const rows = await dbAll<{ stat: string; value: number }>(
    'SELECT stat, value FROM user_stats WHERE user_id = ?',
    [userId]
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.stat] = r.value;
  return out;
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

export const addOneFreeSpin = async (id: string, value: number, count = 1): Promise<void> => {
  const user = await getUser(id);
  const pools = parsePools(user?.free_spins_pools ?? null);
  pools[String(value)] = (pools[String(value)] || 0) + count;
  await dbRun('UPDATE users SET free_spins_pools = ? WHERE id = ?', [JSON.stringify(pools), id]);
};

export const getHaciendaTotal = async (): Promise<number> => {
  const row = await dbGet<{ total: number }>('SELECT total FROM hacienda_state WHERE id = 1');
  return row?.total ?? 0;
};

// --- Shop Catalog Settings ---
import { SHOP_CATALOG } from '../../shared/types';
import type { ShopItem } from '../../shared/types';

export const getShopCatalog = async (): Promise<ShopItem[]> => {
  const row = await dbGet<{value: string}>('SELECT value FROM settings WHERE key = "shop_catalog"');
  if (row) {
    try {
      return JSON.parse(row.value);
    } catch (e) {
      console.error('Error parsing shop_catalog setting:', e);
    }
  }
  return SHOP_CATALOG; // fallback al default si no hay en DB
};

export const saveShopCatalog = async (catalog: ShopItem[]): Promise<void> => {
  const value = JSON.stringify(catalog);
  await dbRun('INSERT INTO settings (key, value) VALUES ("shop_catalog", ?) ON CONFLICT(key) DO UPDATE SET value = ?', [value, value]);
};

export const addHaciendaTotal = async (amount: number): Promise<number> => {
  await dbRun('INSERT OR IGNORE INTO hacienda_state (id, total) VALUES (1, 0)');
  await dbRun('UPDATE hacienda_state SET total = total + ? WHERE id = 1', [amount]);
  return await getHaciendaTotal();
};

export const payIsrael = async (id: string): Promise<number> => {
  const user = await getUser(id);
  const debt = user?.israel_debt ?? 0;
  if (debt <= 0) return 0;
  
  await dbRun('UPDATE users SET israel_debt = 0, paid_israel = 1 WHERE id = ?', [id]);
  const balanceBefore = user?.balance ?? 0;
  await applyBalanceDelta(id, -debt);
  return Math.min(balanceBefore, debt); // Return what was actually able to be taken (if we only want to give Israel what Padre actually had), or we just return debt.
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

export const addIsraelDonation = async (donorId: string, amount: number): Promise<void> => {
  // Transfer to Israel player
  const israelUser = await getUserByName('Israel');
  if (israelUser) {
    await applyBalanceDelta(israelUser.id, amount);
  } else {
    // If Israel doesn't exist, just deduct from donor, or we could create him
    await createUser('israel-id', 'Israel');
    await applyBalanceDelta('israel-id', amount);
  }
  // Deduct from donor
  await applyBalanceDelta(donorId, -amount);
  
  // Add to donor's stats
  const poolAddition = Math.floor(amount * 1.5);
  await dbRun('UPDATE users SET israel_donation = israel_donation + ?, israel_pool = israel_pool + ? WHERE id = ?', [amount, poolAddition, donorId]);
};

export const deductIsraelPool = async (id: string, amount: number): Promise<number> => {
  const row = await getUser(id);
  if (!row || !row.israel_pool || row.israel_pool <= 0) return 0;
  const deducted = Math.min(amount, row.israel_pool);
  await dbRun('UPDATE users SET israel_pool = israel_pool - ? WHERE id = ?', [deducted, id]);
  return deducted;
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

