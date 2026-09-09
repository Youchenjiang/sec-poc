import {
  approveRefund,
  createRefund,
  executeRefund,
  listRefunds,
  login,
  rejectRefund,
  resolveSession,
  reviewRefund,
  viewRefund,
} from "./service.mjs";

const STATUS_BY_ERROR = {
  INVALID_CREDENTIALS: 401,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  STATE_CONFLICT: 409,
  VALIDATION: 400,
};

export function createRouter({ db, enforceOwnership }) {
  const send = (response, status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };

  const sendResult = (response, result) => {
    if (result.ok) return send(response, 200, result.data);
    return send(response, STATUS_BY_ERROR[result.error] ?? 500, { error: result.error });
  };

  async function readBody(request) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (chunks.length === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return {};
    }
  }

  async function handle(request, response, url) {
    const { pathname } = url;

    if (request.method === "POST" && pathname === "/api/login") {
      const body = await readBody(request);
      return sendResult(response, login(db, body.username, body.password));
    }

    const authorization = request.headers.authorization ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
    const actor = resolveSession(db, token);
    if (!actor) return send(response, 401, { error: "UNAUTHORIZED" });

    const refundsMatch = pathname === "/api/refunds";
    if (request.method === "GET" && refundsMatch) {
      return sendResult(response, listRefunds(db, actor));
    }
    if (request.method === "POST" && refundsMatch) {
      const body = await readBody(request);
      const result = createRefund(db, actor, { amountCents: body.amountCents, reason: body.reason });
      return result.ok ? send(response, 201, result.data) : sendResult(response, result);
    }

    const idMatch = pathname.match(/^\/api\/refunds\/(\d+)$/);
    if (request.method === "GET" && idMatch) {
      return sendResult(response, viewRefund(db, actor, Number(idMatch[1]), { enforceOwnership }));
    }

    const actionMatch = pathname.match(/^\/api\/refunds\/(\d+)\/(review|approve|reject|refund)$/);
    if (request.method === "POST" && actionMatch) {
      const refundId = Number(actionMatch[1]);
      const action = actionMatch[2];
      if (action === "review") return sendResult(response, reviewRefund(db, actor, refundId));
      if (action === "approve") return sendResult(response, approveRefund(db, actor, refundId));
      if (action === "reject") return sendResult(response, rejectRefund(db, actor, refundId));
      if (action === "refund") {
        return sendResult(response, executeRefund(db, actor, refundId, { byWorker: false }));
      }
    }

    return send(response, 404, { error: "NOT_FOUND" });
  }

  return { handle };
}