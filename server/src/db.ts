import sqlite3 from 'sqlite3';
import path from 'path';
import { promisify } from 'util';

const dbPath = path.join(__dirname, '..', 'poker.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      balance INTEGER DEFAULT 0
    )`);
  }
});

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

export interface User {
  id: string;
  name: string;
  balance: number;
}

export const getUser = async (id: string): Promise<User | undefined> => {
  return dbGet<User>('SELECT * FROM users WHERE id = ?', [id]);
};

export const createUser = async (id: string, name: string): Promise<void> => {
  await dbRun('INSERT OR IGNORE INTO users (id, name, balance) VALUES (?, ?, 0)', [id, name]);
};

export const updateUserBalance = async (id: string, amount: number): Promise<void> => {
  await dbRun('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, id]);
};
