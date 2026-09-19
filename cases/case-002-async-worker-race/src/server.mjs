import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { nowIso, openDatabase } from "./db.mjs";
import { seedDatabase } from "./seed.mjs";

export function createCase002System({
  db: externalDb,
  seed = false,
  fixedMode = false,
  hunk1Enabled = false,
} = {}) {
  const db = externalDb ?? openDatabase(":memory:");
  if (seed) seedDatabase(db);

  // 當 fixedMode 為 true 時，預設開啟 Hunk 1 (API 互斥防護)
  const isHunk1Active = fixedMode || hunk1Enabled;

  const stmtGetUser = db.prepare("SELECT * FROM users WHERE username = ? AND password = ?");
  const stmtCreateSession = db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)");
  const stmtGetSession = db.prepare(`
    SELECT u.id, u.tenant_id, u.username, u.role
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ?
  `);

  const stmtGetRefundById = db.prepare(`
    SELECT r.*, u.username as owner_username, t.name as tenant_name
    FROM refund_requests r
    JOIN users u ON r.owner_id = u.id
    JOIN tenants t ON r.tenant_id = t.id
    WHERE r.id = ?
  `);

  const stmtListRefunds = db.prepare(`
    SELECT r.*, u.username as owner_username, t.name as tenant_name
    FROM refund_requests r
    JOIN users u ON r.owner_id = u.id
    JOIN tenants t ON r.tenant_id = t.id
    WHERE r.tenant_id = ?
  `);

  const stmtCreateRefund = db.prepare(`
    INSERT INTO refund_requests (tenant_id, owner_id, amount_cents, reason, status, version, payout_locked_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'REQUESTED', 1, NULL, ?, ?)
  `);

  const stmtUpdateStatus = db.prepare(`
    UPDATE refund_requests
    SET status = ?, updated_at = ?
    WHERE id = ?
  `);

  // Hunk 1 啟動時的版本更新與狀態防護
  const stmtCancelVulnerable = db.prepare(`
    UPDATE refund_requests
    SET status = 'CANCELLED', updated_at = ?
    WHERE id = ?
  `);

  const stmtCancelFixed = db.prepare(`
    UPDATE refund_requests
    SET status = 'CANCELLED', version = version + 1, updated_at = ?
    WHERE id = ? AND payout_locked_at IS NULL AND status IN ('REQUESTED', 'REVIEWED', 'APPROVED')
  `);

  function jsonResponse(res, status, data) {
    const payload = JSON.stringify(data);
    res.writeHead(status, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  function parseAuth(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) return null;
    const token = auth.slice(7).trim();
    return stmtGetSession.get(token) ?? null;
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const method = req.method.toUpperCase();

    let body = null;
    if (["POST", "PUT", "PATCH"].includes(method)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      } catch {
        return jsonResponse(res, 400, { error: "Invalid JSON" });
      }
    }

    // 1. 登入端點
    if (method === "POST" && url.pathname === "/api/login") {
      const { username, password } = body ?? {};
      const user = stmtGetUser.get(username, password);
      if (!user) return jsonResponse(res, 401, { error: "Invalid credentials" });

      const token = randomBytes(16).toString("hex");
      stmtCreateSession.run(token, user.id, nowIso());
      return jsonResponse(res, 200, {
        token,
        user: { id: user.id, tenant_id: user.tenant_id, username: user.username, role: user.role },
      });
    }

    // 身份驗證過濾
    const currentUser = parseAuth(req);
    if (!currentUser) return jsonResponse(res, 401, { error: "Unauthorized" });

    // 2. 列出退款單
    if (method === "GET" && url.pathname === "/api/refunds") {
      const list = stmtListRefunds.all(currentUser.tenant_id);
      return jsonResponse(res, 200, list);
    }

    // 3. 取得單一退款單
    const refundMatch = url.pathname.match(/^\/api\/refunds\/(\d+)$/);
    if (method === "GET" && refundMatch) {
      const refundId = Number(refundMatch[1]);
      const refund = stmtGetRefundById.get(refundId);
      if (!refund || refund.tenant_id !== currentUser.tenant_id) {
        return jsonResponse(res, 404, { error: "Refund not found" });
      }
      return jsonResponse(res, 200, refund);
    }

    // 4. 建立退款單 (Customer)
    if (method === "POST" && url.pathname === "/api/refunds") {
      if (currentUser.role !== "customer") {
        return jsonResponse(res, 403, { error: "Only customers can request refunds" });
      }
      const { amountCents, reason } = body ?? {};
      if (!amountCents || amountCents <= 0) {
        return jsonResponse(res, 400, { error: "Valid amountCents is required" });
      }
      const now = nowIso();
      const result = stmtCreateRefund.run(currentUser.tenant_id, currentUser.id, amountCents, reason || "General return", now, now);
      const created = stmtGetRefundById.get(Number(result.lastInsertRowid));
      return jsonResponse(res, 201, created);
    }

    // 5. Supervisor 審批端點 (Approve)
    const approveMatch = url.pathname.match(/^\/api\/refunds\/(\d+)\/approve$/);
    if (method === "POST" && approveMatch) {
      if (currentUser.role !== "supervisor") {
        return jsonResponse(res, 403, { error: "Only supervisor can approve refunds" });
      }
      const refundId = Number(approveMatch[1]);
      const refund = stmtGetRefundById.get(refundId);
      if (!refund || refund.tenant_id !== currentUser.tenant_id) {
        return jsonResponse(res, 404, { error: "Refund not found" });
      }
      if (refund.status === "REFUNDED" || refund.status === "CANCELLED") {
        return jsonResponse(res, 400, { error: `Cannot approve refund in status ${refund.status}` });
      }
      stmtUpdateStatus.run("APPROVED", nowIso(), refundId);
      const updated = stmtGetRefundById.get(refundId);
      return jsonResponse(res, 200, updated);
    }

    // 6. 客戶端取消端點 (Cancel) - 核心漏洞比對處
    const cancelMatch = url.pathname.match(/^\/api\/refunds\/(\d+)\/cancel$/);
    if (method === "POST" && cancelMatch) {
      const refundId = Number(cancelMatch[1]);
      const refund = stmtGetRefundById.get(refundId);
      if (!refund || refund.tenant_id !== currentUser.tenant_id) {
        return jsonResponse(res, 404, { error: "Refund not found" });
      }
      if (currentUser.role !== "customer" || refund.owner_id !== currentUser.id) {
        return jsonResponse(res, 403, { error: "Only the refund owner can cancel the request" });
      }

      if (["REFUNDED", "REJECTED"].includes(refund.status)) {
        return jsonResponse(res, 400, { error: `Cannot cancel refund with status ${refund.status}` });
      }

      // [Hunk 1 Guard]: 若啟用 Hunk 1 檢查出納鎖定狀態
      if (isHunk1Active) {
        if (refund.payout_locked_at !== null) {
          return jsonResponse(res, 409, {
            error: "Payout is already in progress and locked by finance worker; cannot cancel",
          });
        }
        const resUpdate = stmtCancelFixed.run(nowIso(), refundId);
        if (resUpdate.changes === 0) {
          return jsonResponse(res, 409, { error: "State conflict during cancellation" });
        }
      } else {
        // [Vulnerable Mode]: 盲目取消，無視是否已被 Worker 鎖定出納
        stmtCancelVulnerable.run(nowIso(), refundId);
      }

      const updated = stmtGetRefundById.get(refundId);
      return jsonResponse(res, 200, updated);
    }

    return jsonResponse(res, 404, { error: "Endpoint not found" });
  });

  return server;
}
