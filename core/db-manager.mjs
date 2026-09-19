import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

/**
 * 產生標準 ISO 8601 時間戳記。
 * @returns {string}
 */
export function nowIso() {
  return new Date().toISOString();
}

/**
 * 開啟 SQLite 資料庫並配置通用健全 PRAGMA 設定。
 * @param {string} dbPath 資料庫檔案路徑或 ":memory:"
 * @returns {DatabaseSync}
 */
export function openDatabase(dbPath) {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

/**
 * 執行 WAL checkpoint 截斷，將日誌內容安全併入主檔。
 * @param {DatabaseSync} db
 */
export function checkpointDatabase(db) {
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
}

/**
 * 把指定 DB 存成快照。
 * @param {string} dbPath 來源資料庫路徑
 * @param {string} snapshotPath 目標快照路徑
 */
export function snapshotDatabase(dbPath, snapshotPath) {
  const db = openDatabase(dbPath);
  try {
    checkpointDatabase(db);
  } finally {
    db.close();
  }
  mkdirSync(dirname(snapshotPath), { recursive: true });
  copyFileSync(dbPath, snapshotPath);
}

/**
 * 以快照覆蓋指定 DB，達成毫秒級狀態還原。
 * @param {string} dbPath 目標資料庫路徑
 * @param {string} snapshotPath 來源快照路徑
 */
export function restoreSnapshot(dbPath, snapshotPath) {
  if (!existsSync(snapshotPath)) {
    throw new Error(`快照不存在：${snapshotPath}`);
  }
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(dbPath + suffix, { force: true });
  }
  mkdirSync(dirname(dbPath), { recursive: true });
  copyFileSync(snapshotPath, dbPath);
}

/**
 * 刪除既有 DB 檔案並由外部傳入的 schema 與 seed 函數完全乾淨重建。
 * @param {string} dbPath 資料庫檔案路徑
 * @param {Function} initSchemaFn (db) => void
 * @param {Function} [seedDataFn] (db) => void
 */
export function resetDatabase(dbPath, initSchemaFn, seedDataFn) {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(dbPath + suffix, { force: true });
  }
  const db = openDatabase(dbPath);
  try {
    if (typeof initSchemaFn === "function") initSchemaFn(db);
    if (typeof seedDataFn === "function") seedDataFn(db);
  } finally {
    db.close();
  }
}
