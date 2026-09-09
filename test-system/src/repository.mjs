import { randomBytes } from "node:crypto";
import { nowIso } from "./db.mjs";

export function getUserByUsername(db, username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) ?? null;
}

export function getSessionUser(db, token) {
  return (
    db
      .prepare(
        `SELECT u.* FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ?`,
      )
      .get(token) ?? null
  );
}

export function createSession(db, userId) {
  const token = randomBytes(16).toString("hex");
  db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    nowIso(),
  );
  return token;
}

const REFUND_SELECT = `
  SELECT r.*, u.username AS owner_username, t.name AS tenant_name
  FROM refund_requests r
  JOIN users u ON u.id = r.owner_id
  JOIN tenants t ON t.id = r.tenant_id
`;

export function getRefundById(db, id) {
  return db.prepare(`${REFUND_SELECT} WHERE r.id = ?`).get(id) ?? null;
}

/** 依角色過濾：customer 只看自己的，supervisor／finance 看整個 tenant。 */
export function listRefundsScoped(db, actor) {
  if (actor.role === "customer") {
    return db.prepare(`${REFUND_SELECT} WHERE r.owner_id = ? ORDER BY r.id`).all(actor.id);
  }
  return db.prepare(`${REFUND_SELECT} WHERE r.tenant_id = ? ORDER BY r.id`).all(actor.tenant_id);
}

export function createRefund(db, { tenantId, ownerId, amountCents, reason }) {
  const info = db
    .prepare(
      `INSERT INTO refund_requests (tenant_id, owner_id, amount_cents, reason, status, created_at)
       VALUES (?, ?, ?, ?, 'REQUESTED', ?)`,
    )
    .run(tenantId, ownerId, amountCents, reason, nowIso());
  return getRefundById(db, Number(info.lastInsertRowid));
}

/** 條件式狀態轉移：只有目前狀態在 fromStatuses 中才更新，回傳是否成功。 */
export function updateRefundStatus(db, id, fromStatuses, toStatus) {
  const placeholders = fromStatuses.map(() => "?").join(", ");
  const info = db
    .prepare(`UPDATE refund_requests SET status = ? WHERE id = ? AND status IN (${placeholders})`)
    .run(toStatus, id, ...fromStatuses);
  return info.changes === 1;
}

export function insertApprovalRecord(db, { refundId, approverId, action }) {
  db.prepare(
    "INSERT INTO approval_records (refund_id, approver_id, action, created_at) VALUES (?, ?, ?, ?)",
  ).run(refundId, approverId, action, nowIso());
}

export function insertAuditEvent(db, { actorId, tenantId, action, targetType, targetId, detail }) {
  db.prepare(
    `INSERT INTO audit_events (actor_id, tenant_id, action, target_type, target_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(actorId ?? null, tenantId ?? null, action, targetType ?? null, targetId ?? null, detail ?? null, nowIso());
}