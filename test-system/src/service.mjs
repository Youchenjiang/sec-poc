import {
  createRefund as insertRefund,
  createSession,
  getRefundById,
  getSessionUser,
  getUserByUsername,
  insertApprovalRecord,
  insertAuditEvent,
  listRefundsScoped,
  updateRefundStatus,
} from "./repository.mjs";

export const ROLES = { CUSTOMER: "customer", SUPERVISOR: "supervisor", FINANCE: "finance" };
export const STATUS = {
  REQUESTED: "REQUESTED",
  REVIEWED: "REVIEWED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  REFUNDED: "REFUNDED",
};

function fail(error) {
  return { ok: false, error };
}
function ok(data) {
  return { ok: true, data };
}

function publicUser(user) {
  const { password, ...rest } = user;
  return rest;
}

export function authenticateUser(db, username, password) {
  const user = getUserByUsername(db, username);
  return user && user.password === password ? user : null;
}

export function login(db, username, password) {
  const user = authenticateUser(db, username, password);
  if (!user) return fail("INVALID_CREDENTIALS");
  const token = createSession(db, user.id);
  insertAuditEvent(db, { actorId: user.id, tenantId: user.tenant_id, action: "login", detail: username });
  return ok({ token, user: publicUser(user) });
}

export function resolveSession(db, token) {
  if (!token) return null;
  return getSessionUser(db, token);
}

export function createRefund(db, actor, { amountCents, reason }) {
  if (actor.role !== ROLES.CUSTOMER) return fail("FORBIDDEN");
  if (!Number.isInteger(amountCents) || amountCents <= 0) return fail("VALIDATION");
  if (typeof reason !== "string" || reason.trim() === "") return fail("VALIDATION");
  const refund = insertRefund(db, {
    tenantId: actor.tenant_id,
    ownerId: actor.id,
    amountCents,
    reason: reason.trim(),
  });
  insertAuditEvent(db, {
    actorId: actor.id,
    tenantId: actor.tenant_id,
    action: "create_refund",
    targetType: "refund",
    targetId: refund.id,
  });
  return ok(refund);
}

export function listRefunds(db, actor) {
  return ok(listRefundsScoped(db, actor));
}

/**
 * 所有權與 tenant 隔離檢查（BOLA 的 enforcement point 之一）。
 * customer 只能看自己；supervisor／finance 只能看同 tenant。
 * 不通過時回傳 null（由 caller 以 404 回應，避免洩漏資源是否存在）。
 */
function refundVisibleTo(db, actor, refundId) {
  const refund = getRefundById(db, refundId);
  if (!refund) return null;
  if (actor.role === ROLES.CUSTOMER) {
    return refund.owner_id === actor.id ? refund : null;
  }
  return refund.tenant_id === actor.tenant_id ? refund : null;
}

export function viewRefund(db, actor, refundId, { enforceOwnership }) {
  const refund = enforceOwnership
    ? refundVisibleTo(db, actor, refundId)
    : getRefundById(db, refundId);
  if (!refund) {
    insertAuditEvent(db, {
      actorId: actor.id,
      tenantId: actor.tenant_id,
      action: "deny_view_refund",
      targetType: "refund",
      targetId: refundId,
      detail: `enforceOwnership=${enforceOwnership}`,
    });
    return fail("NOT_FOUND");
  }
  insertAuditEvent(db, {
    actorId: actor.id,
    tenantId: actor.tenant_id,
    action: "view_refund",
    targetType: "refund",
    targetId: refund.id,
  });
  return ok(refund);
}

/** supervisor／finance 共通的前置檢查：角色、存在、tenant 匹配。 */
function staffGuard(db, actor, refundId) {
  if (actor.role !== ROLES.SUPERVISOR && actor.role !== ROLES.FINANCE) return { error: "FORBIDDEN" };
  const refund = getRefundById(db, refundId);
  if (!refund || refund.tenant_id !== actor.tenant_id) return { error: "NOT_FOUND" };
  return { refund };
}

export function reviewRefund(db, actor, refundId) {
  const guarded = staffGuard(db, actor, refundId);
  if (guarded.error) return fail(guarded.error);
  if (actor.role !== ROLES.SUPERVISOR) return fail("FORBIDDEN");
  const refund = guarded.refund;
  if (!updateRefundStatus(db, refund.id, [STATUS.REQUESTED], STATUS.REVIEWED)) {
    return fail("STATE_CONFLICT");
  }
  insertApprovalRecord(db, { refundId: refund.id, approverId: actor.id, action: "review" });
  insertAuditEvent(db, {
    actorId: actor.id,
    tenantId: actor.tenant_id,
    action: "review_refund",
    targetType: "refund",
    targetId: refund.id,
  });
  return ok(getRefundById(db, refund.id));
}

export function approveRefund(db, actor, refundId) {
  const guarded = staffGuard(db, actor, refundId);
  if (guarded.error) return fail(guarded.error);
  if (actor.role !== ROLES.SUPERVISOR) return fail("FORBIDDEN");
  const refund = guarded.refund;
  if (refund.owner_id === actor.id) return fail("FORBIDDEN"); // SoD：申請人不可核准自己
  if (!updateRefundStatus(db, refund.id, [STATUS.REVIEWED], STATUS.APPROVED)) {
    return fail("STATE_CONFLICT");
  }
  insertApprovalRecord(db, { refundId: refund.id, approverId: actor.id, action: "approve" });
  insertAuditEvent(db, {
    actorId: actor.id,
    tenantId: actor.tenant_id,
    action: "approve_refund",
    targetType: "refund",
    targetId: refund.id,
  });
  return ok(getRefundById(db, refund.id));
}

export function rejectRefund(db, actor, refundId) {
  const guarded = staffGuard(db, actor, refundId);
  if (guarded.error) return fail(guarded.error);
  if (actor.role !== ROLES.SUPERVISOR) return fail("FORBIDDEN");
  const refund = guarded.refund;
  if (!updateRefundStatus(db, refund.id, [STATUS.REQUESTED, STATUS.REVIEWED], STATUS.REJECTED)) {
    return fail("STATE_CONFLICT");
  }
  insertApprovalRecord(db, { refundId: refund.id, approverId: actor.id, action: "reject" });
  insertAuditEvent(db, {
    actorId: actor.id,
    tenantId: actor.tenant_id,
    action: "reject_refund",
    targetType: "refund",
    targetId: refund.id,
  });
  return ok(getRefundById(db, refund.id));
}

/**
 * 執行退款。byWorker=true 表示由背景 worker 觸發（替代入口），
 * 仍需重新驗證狀態為 APPROVED（revalidation），防止重複執行或越權執行。
 */
export function executeRefund(db, actor, refundId, { byWorker = false } = {}) {
  if (!byWorker && actor.role !== ROLES.FINANCE) return fail("FORBIDDEN");
  const refund = getRefundById(db, refundId);
  if (!refund) return fail("NOT_FOUND");
  if (!byWorker && refund.tenant_id !== actor.tenant_id) return fail("NOT_FOUND");
  if (!updateRefundStatus(db, refund.id, [STATUS.APPROVED], STATUS.REFUNDED)) {
    return fail("STATE_CONFLICT");
  }
  insertApprovalRecord(db, { refundId: refund.id, approverId: byWorker ? null : actor.id, action: "refund" });
  insertAuditEvent(db, {
    actorId: byWorker ? null : actor.id,
    tenantId: refund.tenant_id,
    action: "execute_refund",
    targetType: "refund",
    targetId: refund.id,
    detail: `byWorker=${byWorker}`,
  });
  return ok(getRefundById(db, refund.id));
}