import { setTimeout } from "node:timers/promises";
import { nowIso } from "./db.mjs";

/**
 * 執行一輪異步出納 Worker 批次任務。
 *
 * @param {DatabaseSync} db
 * @param {Object} options
 * @param {boolean} [options.fixedMode=false] 是否啟用完整防護模式
 * @param {boolean} [options.hunk2Enabled=false] 是否單獨啟用 Hunk 2 (Worker 原子 CAS 與守衛條件)
 * @param {number} [options.simulateBankDelayMs=20] 模擬第三方金流出納耗時 (ms)
 * @returns {Promise<{ processed: number, refunded: number, skipped: number }>}
 */
export async function runPayoutPass(db, {
  fixedMode = false,
  hunk2Enabled = false,
  simulateBankDelayMs = 20,
} = {}) {
  const isHunk2Active = fixedMode || hunk2Enabled;

  const stmtGetApproved = db.prepare(`
    SELECT id, amount_cents, status, version, payout_locked_at
    FROM refund_requests
    WHERE status = 'APPROVED'
  `);

  const stmtLockRefund = db.prepare(`
    UPDATE refund_requests
    SET payout_locked_at = ?, version = version + 1
    WHERE id = ? AND status = 'APPROVED' AND payout_locked_at IS NULL
  `);

  const stmtRecordPayout = db.prepare(`
    INSERT INTO payout_records (refund_id, amount_cents, payout_status, executed_at)
    VALUES (?, ?, 'SUCCESS', ?)
  `);

  const stmtFinalizeFixed = db.prepare(`
    UPDATE refund_requests
    SET status = 'REFUNDED', payout_locked_at = NULL, version = version + 1, updated_at = ?
    WHERE id = ? AND status = 'APPROVED'
  `);

  const stmtFinalizeVulnerable = db.prepare(`
    UPDATE refund_requests
    SET status = 'REFUNDED', updated_at = ?
    WHERE id = ?
  `);

  const candidates = stmtGetApproved.all();
  let processed = 0;
  let refunded = 0;
  let skipped = 0;

  for (const item of candidates) {
    processed++;
    const now = nowIso();

    if (isHunk2Active) {
      // [Hunk 2 Guard]: 執行金流前先搶鎖並遞增版本 (Compare-and-Swap)
      const lockRes = stmtLockRefund.run(now, item.id);
      if (lockRes.changes === 0) {
        // 鎖定失敗：狀態已被取消或已被其他 Worker 處理
        skipped++;
        continue;
      }

      // 模擬金流銀行扣款時間差
      if (simulateBankDelayMs > 0) {
        await setTimeout(simulateBankDelayMs);
      }

      // 再次確認狀態仍為 APPROVED 後確認出納
      const finalRes = stmtFinalizeFixed.run(nowIso(), item.id);
      if (finalRes.changes > 0) {
        stmtRecordPayout.run(item.id, item.amount_cents, nowIso());
        refunded++;
      } else {
        skipped++;
      }
    } else {
      // [Vulnerable Mode]: 缺少前置與後置 Guard，直接進入金流延遲
      if (simulateBankDelayMs > 0) {
        await setTimeout(simulateBankDelayMs);
      }

      // 盲目寫入 REFUNDED，覆蓋了併發期間發生的 CANCELLED 狀態！
      stmtFinalizeVulnerable.run(nowIso(), item.id);
      stmtRecordPayout.run(item.id, item.amount_cents, nowIso());
      refunded++;
    }
  }

  return { processed, refunded, skipped };
}
