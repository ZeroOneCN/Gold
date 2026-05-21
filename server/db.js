const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'trades.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_date TEXT NOT NULL,
      instrument TEXT NOT NULL,
      order_type TEXT NOT NULL CHECK(order_type IN ('buy', 'sell')),
      open_price REAL NOT NULL,
      lot_size REAL NOT NULL,
      commission REAL DEFAULT 0,
      close_price REAL,
      pnl REAL,
      open_time TEXT,
      close_time TEXT,
      hold_time TEXT,
      remark TEXT
    );

    CREATE TABLE IF NOT EXISTS capital_flows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flow_date TEXT NOT NULL,
      flow_type TEXT NOT NULL CHECK(flow_type IN ('deposit', 'withdrawal')),
      amount REAL NOT NULL,
      remark TEXT
    )
  `);
}

module.exports = { getDb };
