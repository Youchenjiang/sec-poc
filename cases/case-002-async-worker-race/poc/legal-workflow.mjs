import { resolve } from "node:path";
import { createApi, createRecorder, expectStatus, writeTrace, argValue } from "../../../core/trace-recorder.mjs";

const args = process.argv.slice(2);
const baseUrl = argValue(args, "--base") ?? "http://localhost:3000";
const explicitOut = argValue(args, "--out");
const outPath = explicitOut
  ? resolve(process.cwd(), explicitOut)
  : resolve(import.meta.dirname, "../traces/legal-flow.jsonl");

const password = "secret123";

const recorder = createRecorder({
  caseName: "case-002-async-worker-race",
  intent: "合法流程：customer 提出退款 → supervisor 核准 → worker 出納轉為 REFUNDED",
  actors: ["acme-alice", "acme-carol"],
});

const api = createApi(baseUrl, recorder);

const login = (username) =>
  api("POST", "/api/login", { actor: username, body: { username, password } });

// 1. customer 登入並提出退款
const aliceLogin = await login("acme-alice");
expectStatus(aliceLogin, 200, "acme-alice 登入");
const aliceToken = aliceLogin.body.token;
const alice = { token: aliceToken, actor: "acme-alice" };

const created = await api("POST", "/api/refunds", {
  ...alice,
  body: { amountCents: 20000, reason: "正常合法審批出納測試" },
});
expectStatus(created, 201, "建立退款單");
const refundId = created.body.id;

// 2. supervisor 審核核准
const carolLogin = await login("acme-carol");
expectStatus(carolLogin, 200, "acme-carol 登入");
const carol = { token: carolLogin.body.token, actor: "acme-carol" };

const approved = await api("POST", `/api/refunds/${refundId}/approve`, carol);
expectStatus(approved, 200, "主管核准退款");

// 3. 查詢目前狀態 (APPROVED)
const checked = await api("GET", `/api/refunds/${refundId}`, alice);
expectStatus(checked, 200, "查詢退款狀態");

const writtenPath = writeTrace(recorder, outPath);
console.log(`✅ Case-002 合法流程黑箱軌跡已寫入: ${writtenPath}`);
