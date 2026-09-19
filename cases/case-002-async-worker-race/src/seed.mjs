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
    { id: 6, tenantId: 2, username: "globex-carol", role: "supervisor" },
  ],
  refunds: [
    {
      id: 1,
      tenantId: 1,
      ownerId: 1,
      amountCents: 50000,
      reason: "High value return",
      status: "APPROVED",
      version: 1,
      payoutLockedAt: null,
    },
    {
      id: 2,
      tenantId: 1,
      ownerId: 2,
      amountCents: 12000,
      reason: "Defective unit",
      status: "REQUESTED",
      version: 1,
      payoutLockedAt: null,
    },
  ],
};

export const SEED_PASSWORD = "secret123";

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

  const insertRefund = db.prepare(`
    INSERT INTO refund_requests (id, tenant_id, owner_id, amount_cents, reason, status, version, payout_locked_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = nowIso();
  for (const r of SEED.refunds) {
    insertRefund.run(
      r.id,
      r.tenantId,
      r.ownerId,
      r.amountCents,
      r.reason,
      r.status,
      r.version,
      r.payoutLockedAt,
      now,
      now,
    );
  }
}

export function resetDatabase(dbPath = DEFAULT_DB_PATH) {
  coreResetDatabase(dbPath, null, seedDatabase);
}

export function snapshotDatabase(dbPath = DEFAULT_DB_PATH, snapshotPath = DEFAULT_SNAPSHOT_PATH) {
  coreSnapshotDatabase(dbPath, snapshotPath);
}

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
