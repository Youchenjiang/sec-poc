import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_DB_PATH, openDatabase } from "./db.mjs";
import { insertApprovalRecord, insertAuditEvent, updateRefundStatus } from "./repository.mjs";

/**
 * 執行一輪：把所有仍為 APPROVED 的退款轉為 REFUNDED。
 * 以條件式更新達成 revalidation——狀態若已被其他入口改變則跳過，避免重複執行。
 * 回傳本輪實際執行的筆數。
 */
export function runWorkerPass(db) {
  const approved = db
    .prepare("SELECT id, tenant_id, owner_id FROM refund_requests WHERE status = 'APPROVED' ORDER BY id")
    .all();
  let executed = 0;
  for (const refund of approved) {
    const changed = updateRefundStatus(db, refund.id, ["APPROVED"], "REFUNDED");
    if (!changed) continue;
    insertApprovalRecord(db, { refundId: refund.id, approverId: null, action: "refund" });
    insertAuditEvent(db, {
      actorId: null,
      tenantId: refund.tenant_id,
      action: "execute_refund",
      targetType: "refund",
      targetId: refund.id,
      detail: "byWorker=true",
    });
    executed += 1;
  }
  return executed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dbPath = resolve(import.meta.dirname, "../db/test.db");
  const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 1000);
  const db = openDatabase(dbPath);
  console.log(`worker 啟動：每 ${intervalMs}ms 檢查一次（db=${dbPath}）`);

  const timer = setInterval(() => {
    try {
      const executed = runWorkerPass(db);
      if (executed > 0) console.log(`worker 執行了 ${executed} 筆退款`);
    } catch (error) {
      console.error("worker 錯誤：", error.message);
    }
  }, intervalMs);

  const shutdown = () => {
    clearInterval(timer);
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}