import { resolve } from "node:path";
import { openDatabase as coreOpenDatabase, nowIso as coreNowIso } from "../../../core/db-manager.mjs";

export const DEFAULT_DB_PATH = resolve(import.meta.dirname, "../db/case-002.db");

export function nowIso() {
  return coreNowIso();
}

export function openDatabase(dbPath = DEFAULT_DB_PATH) {
  return coreOpenDatabase(dbPath);
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
      id               INTEGER PRIMARY KEY,
      tenant_id        INTEGER NOT NULL REFERENCES tenants(id),
      owner_id         INTEGER NOT NULL REFERENCES users(id),
      amount_cents     INTEGER NOT NULL,
      reason           TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'REQUESTED'
                       CHECK (status IN ('REQUESTED', 'REVIEWED', 'APPROVED', 'CANCELLED', 'REJECTED', 'REFUNDED')),
      version          INTEGER NOT NULL DEFAULT 1,
      payout_locked_at TEXT,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payout_records (
      id            INTEGER PRIMARY KEY,
      refund_id     INTEGER NOT NULL REFERENCES refund_requests(id),
      amount_cents  INTEGER NOT NULL,
      payout_status TEXT NOT NULL,
      executed_at   TEXT NOT NULL
    );
  `);
}
