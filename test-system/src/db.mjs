import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const DEFAULT_DB_PATH = resolve(import.meta.dirname, "../db/test.db");

export function nowIso() {
  return new Date().toISOString();
}

export function openDatabase(dbPath = DEFAULT_DB_PATH) {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

export function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id   INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS users (
      id        INTEGER PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id),
      username  TEXT NOT NULL UNIQUE,
      password  TEXT NOT NULL,
      role      TEXT NOT NULL CHECK (role IN ('customer', 'supervisor', 'finance'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refund_requests (
      id           INTEGER PRIMARY KEY,
      tenant_id    INTEGER NOT NULL REFERENCES tenants(id),
      owner_id     INTEGER NOT NULL REFERENCES users(id),
      amount_cents INTEGER NOT NULL,
      reason       TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'REQUESTED'
                   CHECK (status IN ('REQUESTED', 'REVIEWED', 'APPROVED', 'REJECTED', 'REFUNDED')),
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approval_records (
      id          INTEGER PRIMARY KEY,
      refund_id   INTEGER NOT NULL REFERENCES refund_requests(id),
      approver_id INTEGER REFERENCES users(id),
      action      TEXT NOT NULL CHECK (action IN ('review', 'approve', 'reject', 'refund')),
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id          INTEGER PRIMARY KEY,
      actor_id    INTEGER REFERENCES users(id),
      tenant_id   INTEGER REFERENCES tenants(id),
      action      TEXT NOT NULL,
      target_type TEXT,
      target_id   INTEGER,
      detail      TEXT,
      created_at  TEXT NOT NULL
    );
  `);
}