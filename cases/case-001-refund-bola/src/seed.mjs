import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_DB_PATH, createSchema, nowIso, openDatabase } from "./db.mjs";
import {
  snapshotDatabase as coreSnapshotDatabase,
  restoreSnapshot as coreRestoreSnapshot,
  resetDatabase as coreResetDatabase,
} from "../../../core/db-manager.mjs";

export const DEFAULT_SNAPSHOT_PATH = resolve(import.meta.dirname, "../db/snapshot.db");

export const SEED = {
  tenants: [
    { id: 1, name: "acme" },
    { id: 2, name: "globex" },
  ],
  users: [
    { id: 1, tenantId: 1, username: "acme-alice", role: "customer" },
    { id: 2, tenantId: 1, username: "acme-bob", role: "customer" },
    { id: 3, tenantId: 1, username: "acme-carol", role: "supervisor" },
    { id: 4, tenantId: 1, username: "acme-dave", role: "finance" },
    { id: 5, tenantId: 2, username: "globex-alice", role: "customer" },
    { id: 6, tenantId: 2, username: "globex-bob", role: "customer" },
    { id: 7, tenantId: 2, username: "globex-carol", role: "supervisor" },
    { id: 8, tenantId: 2, username: "globex-dave", role: "finance" },
  ],
  refunds: [
    {
      id: 1, tenantId: 1, ownerId: 1, amountCents: 10000, reason: "Damaged item", status: "REQUESTED",
      approvalRecords: [],
    },
    {
      id: 2, tenantId: 1, ownerId: 2, amountCents: 25000, reason: "Wrong size", status: "APPROVED",
      approvalRecords: [
        { approverId: 3, action: "review" },
        { approverId: 3, action: "approve" },
      ],
    },
    {
      id: 3, tenantId: 2, ownerId: 5, amountCents: 5000, reason: "Late delivery", status: "REVIEWED",
      approvalRecords: [{ approverId: 7, action: "review" }],
    },
  ],
};

export const SEED_PASSWORD = "secret123";

/** 在已開啟的 db 上建立 schema 並寫入決定性種子資料。 */
export function seedDatabase(db) {
  createSchema(db);
  const insertTenant = db.prepare("INSERT INTO tenants (id, name) VALUES (?, ?)");
  for (const t of SEED.tenants) insertTenant.run(t.id, t.name);

  const insertUser = db.prepare(
    "INSERT INTO users (id, tenant_id, username, password, role) VALUES (?, ?, ?, ?, ?)",
  );
  for (const u of SEED.users) {
    insertUser.run(u.id, u.tenantId, u.username, SEED_PASSWORD, u.role);
  }

  const insertRefund = db.prepare(
    `INSERT INTO refund_requests (id, tenant_id, owner_id, amount_cents, reason, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertApproval = db.prepare(
    "INSERT INTO approval_records (refund_id, approver_id, action, created_at) VALUES (?, ?, ?, ?)",
  );
  for (const r of SEED.refunds) {
    insertRefund.run(r.id, r.tenantId, r.ownerId, r.amountCents, r.reason, r.status, nowIso());
    for (const a of r.approvalRecords ?? []) {
      insertApproval.run(r.id, a.approverId, a.action, nowIso());
    }
  }
}

/** 刪除既有檔案並從 seed 重建一份乾淨 DB。 */
export function resetDatabase(dbPath = DEFAULT_DB_PATH) {
  coreResetDatabase(dbPath, null, seedDatabase);
}

/** 把目前 DB 存成快照（先 checkpoint 確保 WAL 內容併入主檔）。 */
export function snapshotDatabase(dbPath = DEFAULT_DB_PATH, snapshotPath = DEFAULT_SNAPSHOT_PATH) {
  coreSnapshotDatabase(dbPath, snapshotPath);
}

/** 以快照覆蓋目前 DB（一鍵還原）。 */
export function restoreSnapshot(dbPath = DEFAULT_DB_PATH, snapshotPath = DEFAULT_SNAPSHOT_PATH) {
  coreRestoreSnapshot(dbPath, snapshotPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  try {
    if (args.includes("--restore")) {
      restoreSnapshot();
      console.log(`已從快照還原：${DEFAULT_SNAPSHOT_PATH} → ${DEFAULT_DB_PATH}`);
    } else {
      resetDatabase();
      console.log(`DB 已重建：${DEFAULT_DB_PATH}`);
      if (args.includes("--snapshot")) {
        snapshotDatabase();
        console.log(`快照已更新：${DEFAULT_SNAPSHOT_PATH}`);
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}