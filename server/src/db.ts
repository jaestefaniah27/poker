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
  jackpot_unlock_level: number;
  xp: number;
  paguita_level: number;
  dieta_level: number;
  ruleta_level: number;
  trivia_level: number;
}

import { PublicUser, levelFromXp, availableLevelPoints, dailyAmountFor, hourlyAmountFor, LevelTrack, LEVEL_TRACK_MAX } from '../../shared/types';

export const toPublicUser = (row: UserRow): PublicUser => {
  const xp = row.xp ?? 0;
  const level = levelFromXp(xp);
  const paguitaLevel = row.paguita_level ?? 0;
  const dietaLevel = row.dieta_level ?? 0;
  const ruletaLevel = row.ruleta_level ?? 0;
  const triviaLevel = row.trivia_level ?? 0;
  return {
    id: row.id,
    name: row.name,
    balance: row.balance,
    avatar: row.avatar || row.id,
    hasPassword: !!row.password_hash,
    lastDailyClaim: row.last_daily_claim ?? null,
    lastHourlyClaim: row.last_hourly_claim ?? null,
    freeSpinsLeft: row.free_spins_left ?? 0,
    freeSpinValue: row.free_spin_value ?? 0,
    lastFreeSpinsClaim: row.last_free_spins_claim ?? 0,
    jackpotUnlockLevel: row.jackpot_unlock_level ?? 0,
    xp,
    level,
    levelPoints: availableLevelPoints(level, paguitaLevel, dietaLevel, ruletaLevel, triviaLevel),
    paguitaLevel,
    dietaLevel,
    ruletaLevel,
    triviaLevel,
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

// ¿Existe OTRA cuenta (distinto id) con ese nombre? Para validar cambios de nombre.
export const isNameTaken = async (name: string, exceptId: string): Promise<boolean> => {
  const row = await dbGet<{ id: string }>(
    'SELECT id FROM users WHERE name = ? COLLATE NOCASE AND id != ?',
    [name.trim(), exceptId]
  );
  return !!row;
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

export const updateUserAvatar = async (id: string, avatar: string): Promise<void> => {
  await dbRun('UPDATE users SET avatar = ? WHERE id = ?', [avatar, id]);
};

export const updateUserBalance = async (id: string, amount: number): Promise<void> => {
  await dbRun('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, id]);
};

// Aplica un delta al saldo y devuelve el saldo resultante.
// sqlite3 serializa las sentencias sobre la conexión, así que UPDATE+SELECT es atómico aquí.
export const applyBalanceDelta = async (id: string, delta: number): Promise<number> => {
  await dbRun('UPDATE users SET balance = MAX(0, balance + ?) WHERE id = ?', [delta, id]);
  const row = await dbGet<{ balance: number }>('SELECT balance FROM users WHERE id = ?', [id]);
  return row?.balance ?? 0;
};

const HOURLY_COOLDOWN_MS = 30 * 60 * 1000;

export const claimDailyBonus = async (id: string): Promise<{ ok: boolean; error?: string; newBalance?: number }> => {
  const row = await dbGet<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
  if (!row) return { ok: false, error: 'Usuario no encontrado' };
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  if (row.last_daily_claim === today) return { ok: false, error: 'Ya recogiste el bono hoy' };
  const amount = dailyAmountFor(row.paguita_level ?? 0);
  await dbRun('UPDATE users SET balance = balance + ?, last_daily_claim = ? WHERE id = ?', [amount, today, id]);
  const updated = await dbGet<{ balance: number }>('SELECT balance FROM users WHERE id = ?', [id]);
  return { ok: true, newBalance: updated?.balance ?? 0 };
};

export const claimHourlyBonus = async (id: string): Promise<{ ok: boolean; error?: string; newBalance?: number; nextClaimAt?: number }> => {
  const row = await dbGet<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
  if (!row) return { ok: false, error: 'Usuario no encontrado' };
  const now = Date.now();
  const last = row.last_hourly_claim ?? 0;
  const nextAt = last + HOURLY_COOLDOWN_MS;
  if (now < nextAt) return { ok: false, error: 'Demasiado pronto', nextClaimAt: nextAt };
  const amount = hourlyAmountFor(row.dieta_level ?? 0);
  await dbRun('UPDATE users SET balance = balance + ?, last_hourly_claim = ? WHERE id = ?', [amount, now, id]);
  const updated = await dbGet<{ balance: number }>('SELECT balance FROM users WHERE id = ?', [id]);
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

export const claimFreeSpins = async (id: string, value: number): Promise<void> => {
  await dbRun(
    'UPDATE users SET free_spins_left = 10, free_spin_value = ?, last_free_spins_claim = ? WHERE id = ?',
    [value, Date.now(), id]
  );
};

export const useFreeSpin = async (id: string): Promise<void> => {
  await dbRun('UPDATE users SET free_spins_left = MAX(0, free_spins_left - 1) WHERE id = ?', [id]);
};

export const setJackpotUnlockLevel = async (id: string, level: number): Promise<void> => {
  await dbRun('UPDATE users SET jackpot_unlock_level = ? WHERE id = ?', [level, id]);
};

export const addOneFreeSpin = async (id: string, value: number, count = 1): Promise<void> => {
  await dbRun(
    `UPDATE users SET
      free_spins_left = free_spins_left + ?,
      free_spin_value = CASE WHEN free_spins_left = 0 THEN ? ELSE MAX(COALESCE(free_spin_value, ?), ?) END
    WHERE id = ?`,
    [count, value, value, value, id]
  );
};

