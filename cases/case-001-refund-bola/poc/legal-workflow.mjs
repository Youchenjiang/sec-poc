import { resolve } from "node:path";
import { createApi, createRecorder, expectStatus, writeTrace, argValue } from "./trace-utils.mjs";

// 第一年合法軌跡（黑箱）：customer 建立退款 → supervisor 審核並核准 → finance 執行退款 → 重新查詢確認。
// 使用方式：node poc/legal-workflow.mjs [--base http://localhost:3000] [--out traces/legal-refund-flow.jsonl]

const args = process.argv.slice(2);
const baseUrl = argValue(args, "--base") ?? "http://localhost:3000";
const explicitOut = argValue(args, "--out");
const outPath = explicitOut
  ? resolve(process.cwd(), explicitOut)
  : resolve(import.meta.dirname, "../traces/legal-refund-flow.jsonl");
const password = "secret123";

const recorder = createRecorder({
  caseName: "legal-refund-workflow",
  intent: "合法軌跡：customer 建立退款 → supervisor 審核並核准 → finance 執行退款 → 確認 REFUNDED",
  actors: ["acme-alice", "acme-carol", "acme-dave"],
});
const api = createApi(baseUrl, recorder);

const login = (username) =>
  api("POST", "/api/login", { actor: username, body: { username, password } });

// 1. customer 建立退款
const aliceLogin = await login("acme-alice");
expectStatus(aliceLogin, 200, "acme-alice 登入");
const aliceToken = aliceLogin.body.token;
const alice = { token: aliceToken, actor: "acme-alice" };

const created = await api("POST", "/api/refunds", {
  ...alice,
  body: { amountCents: 42000, reason: "合法退款流程示範（黑色測試資料）" },
});
expectStatus(created, 201, "建立退款");
const refundId = created.body.id;

const listed = await api("GET", "/api/refunds", alice);
expectStatus(listed, 200, "列出退款");

// 2. supervisor 審核、核准
const carolLogin = await login("acme-carol");
expectStatus(carolLogin, 200, "acme-carol 登入");
const carol = { token: carolLogin.body.token, actor: "acme-carol" };

const reviewed = await api("POST", `/api/refunds/${refundId}/review`, carol);
expectStatus(reviewed, 200, "審核（REQUESTED→REVIEWED）");

const approved = await api("POST", `/api/refunds/${refundId}/approve`, carol);
expectStatus(approved, 200, "核准（REVIEWED→APPROVED）");

// 3. finance 執行退款
const daveLogin = await login("acme-dave");
expectStatus(daveLogin, 200, "acme-dave 登入");
const dave = { token: daveLogin.body.token, actor: "acme-dave" };

const refunded = await api("POST", `/api/refunds/${refundId}/refund`, dave);
expectStatus(refunded, 200, "執行退款（APPROVED→REFUNDED）");

// 4. 重新查詢確認持久化結果（第二種身份也能觀測）
const confirmed = await api("GET", `/api/refunds/${refundId}`, alice);
expectStatus(confirmed, 200, "重新查詢");
if (confirmed.body.status !== "REFUNDED") {
  throw new Error(`合法流程未完成：狀態為 ${confirmed.body.status}`);
}

const written = await writeTrace(recorder, outPath);
console.log(`✅ 合法軌跡完成（退款 #${refundId} → REFUNDED）`);
console.log(`   trace：${written}（${recorder.entries.length} 筆 request/response）`);