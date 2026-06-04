"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMatchHistoryForUser = exports.recordMatchHistory = exports.deleteSessionFromDB = exports.getSessionFromDB = exports.saveSessionToDB = exports.deleteRoomFromDB = exports.saveRoomToDB = exports.loadRoomsFromDB = exports.applyBalanceDelta = exports.updateUserBalance = exports.updateUserAvatar = exports.updateUserName = exports.setPasswordHash = exports.createUser = exports.isNameTaken = exports.getUserByName = exports.deleteUser = exports.getUser = exports.getAllUsersAdmin = exports.getAllUsersRanked = exports.toPublicUser = exports.initDB = exports.dbAll = exports.dbGet = exports.dbRun = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const path_1 = __importDefault(require("path"));
const dbPath = path_1.default.join(__dirname, '..', 'poker.sqlite');
const db = new sqlite3_1.default.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    }
    else {
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
    }
];
// Helper para usar Promesas en lugar de callbacks
const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
};
exports.dbRun = dbRun;
const dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err)
                reject(err);
            else
                resolve(row);
        });
    });
};
exports.dbGet = dbGet;
const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err)
                reject(err);
            else
                resolve(rows);
        });
    });
};
exports.dbAll = dbAll;
const initDB = async () => {
    await (0, exports.dbRun)(`CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  )`);
    const appliedRows = await (0, exports.dbAll)('SELECT name FROM migrations');
    const applied = new Set(appliedRows.map(r => r.name));
    for (const m of MIGRATIONS) {
        if (!applied.has(m.name)) {
            try {
                await (0, exports.dbRun)(m.sql);
            }
            catch (err) {
                if (m.ignoreError && err.message.includes(m.ignoreError)) {
                    console.log(`Migration ${m.name} recovered from old schema (${m.ignoreError})`);
                }
                else {
                    console.error(`Error running migration ${m.name}:`, err);
                    throw err;
                }
            }
            await (0, exports.dbRun)('INSERT INTO migrations (name) VALUES (?)', [m.name]);
            console.log(`Migration applied: ${m.name}`);
        }
    }
    console.log('Database migrations up to date.');
};
exports.initDB = initDB;
const toPublicUser = (row) => ({
    id: row.id,
    name: row.name,
    balance: row.balance,
    avatar: row.avatar || row.id, // por defecto el avatar se siembra con el id
    hasPassword: !!row.password_hash,
});
exports.toPublicUser = toPublicUser;
const getAllUsersRanked = async () => {
    return (0, exports.dbAll)("SELECT * FROM users WHERE name != 'Jorge' ORDER BY balance DESC");
};
exports.getAllUsersRanked = getAllUsersRanked;
const getAllUsersAdmin = async () => {
    return (0, exports.dbAll)("SELECT * FROM users ORDER BY name ASC");
};
exports.getAllUsersAdmin = getAllUsersAdmin;
const getUser = async (id) => {
    return (0, exports.dbGet)('SELECT * FROM users WHERE id = ?', [id]);
};
exports.getUser = getUser;
const deleteUser = async (id) => {
    await (0, exports.dbRun)('DELETE FROM sessions WHERE user_id = ?', [id]);
    await (0, exports.dbRun)('DELETE FROM users WHERE id = ?', [id]);
};
exports.deleteUser = deleteUser;
// Búsqueda por nombre (sin distinguir mayúsculas ni espacios sobrantes).
// Es la clave para que el saldo persista al volver a entrar con el mismo nombre.
const getUserByName = async (name) => {
    return (0, exports.dbGet)('SELECT * FROM users WHERE name = ? COLLATE NOCASE', [name.trim()]);
};
exports.getUserByName = getUserByName;
// ¿Existe OTRA cuenta (distinto id) con ese nombre? Para validar cambios de nombre.
const isNameTaken = async (name, exceptId) => {
    const row = await (0, exports.dbGet)('SELECT id FROM users WHERE name = ? COLLATE NOCASE AND id != ?', [name.trim(), exceptId]);
    return !!row;
};
exports.isNameTaken = isNameTaken;
const createUser = async (id, name) => {
    await (0, exports.dbRun)('INSERT OR IGNORE INTO users (id, name, balance) VALUES (?, ?, 1000)', [id, name.trim()]);
};
exports.createUser = createUser;
const setPasswordHash = async (id, hash) => {
    await (0, exports.dbRun)('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
};
exports.setPasswordHash = setPasswordHash;
const updateUserName = async (id, name) => {
    await (0, exports.dbRun)('UPDATE users SET name = ? WHERE id = ?', [name.trim(), id]);
};
exports.updateUserName = updateUserName;
const updateUserAvatar = async (id, avatar) => {
    await (0, exports.dbRun)('UPDATE users SET avatar = ? WHERE id = ?', [avatar, id]);
};
exports.updateUserAvatar = updateUserAvatar;
const updateUserBalance = async (id, amount) => {
    await (0, exports.dbRun)('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, id]);
};
exports.updateUserBalance = updateUserBalance;
// Aplica un delta al saldo y devuelve el saldo resultante.
// sqlite3 serializa las sentencias sobre la conexión, así que UPDATE+SELECT es atómico aquí.
const applyBalanceDelta = async (id, delta) => {
    await (0, exports.dbRun)('UPDATE users SET balance = balance + ? WHERE id = ?', [delta, id]);
    const row = await (0, exports.dbGet)('SELECT balance FROM users WHERE id = ?', [id]);
    return row?.balance ?? 0;
};
exports.applyBalanceDelta = applyBalanceDelta;
const loadRoomsFromDB = async () => {
    const rows = await (0, exports.dbAll)('SELECT * FROM rooms');
    return rows.map(r => {
        try {
            return JSON.parse(r.data);
        }
        catch (e) {
            console.error(`Error parsing room ${r.id}:`, e);
            return null;
        }
    }).filter((r) => r !== null);
};
exports.loadRoomsFromDB = loadRoomsFromDB;
const saveRoomToDB = async (room) => {
    await (0, exports.dbRun)('INSERT OR REPLACE INTO rooms (id, data) VALUES (?, ?)', [room.id, JSON.stringify(room)]);
};
exports.saveRoomToDB = saveRoomToDB;
const deleteRoomFromDB = async (id) => {
    await (0, exports.dbRun)('DELETE FROM rooms WHERE id = ?', [id]);
};
exports.deleteRoomFromDB = deleteRoomFromDB;
// --- Persistencia de Sesiones ---
const saveSessionToDB = async (token, userId, issuedAt) => {
    await (0, exports.dbRun)('INSERT INTO sessions (token, user_id, issued_at) VALUES (?, ?, ?)', [token, userId, issuedAt]);
};
exports.saveSessionToDB = saveSessionToDB;
const getSessionFromDB = async (token) => {
    return (0, exports.dbGet)('SELECT * FROM sessions WHERE token = ?', [token]);
};
exports.getSessionFromDB = getSessionFromDB;
const deleteSessionFromDB = async (token) => {
    await (0, exports.dbRun)('DELETE FROM sessions WHERE token = ?', [token]);
};
exports.deleteSessionFromDB = deleteSessionFromDB;
const recordMatchHistory = async (userId, roomName, buyIn, maxChips, cashOut, playedAt) => {
    await (0, exports.dbRun)('INSERT INTO match_history (user_id, room_name, buy_in, max_chips, cash_out, played_at) VALUES (?, ?, ?, ?, ?, ?)', [userId, roomName, buyIn, maxChips, cashOut, playedAt]);
};
exports.recordMatchHistory = recordMatchHistory;
const getMatchHistoryForUser = async (userId, limit = 30) => {
    return (0, exports.dbAll)('SELECT * FROM match_history WHERE user_id = ? ORDER BY played_at DESC LIMIT ?', [userId, limit]);
};
exports.getMatchHistoryForUser = getMatchHistoryForUser;
