import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const PASS = "secret123";

function api(base, token, method, path, body) {
  return fetch(`${base}${path}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}`, "content-type": "application/json" } : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => r.json().then((d) => ({ status: r.status, body: d })).catch((e) => ({ status: r.status, body: { error: "PARSE_FAILED", raw: e.message } })));
}

async function login(base, user) {
  return api(base, null, "POST", "/api/login", { username: user, password: PASS });
}

async function runLegal(base) {
  const alice = await login(base, "acme-alice");
  const carol = await login(base, "acme-carol");
  const dave = await login(base, "acme-dave");
  const created = await api(base, alice.body.token, "POST", "/api/refunds", { amountCents: 8800, reason: "demo legal flow" });
  const id = created.body.id ?? created.body.error;
  const reviewed = await api(base, carol.body.token, "POST", `/api/refunds/${id}/review`);
  const approved = await api(base, carol.body.token, "POST", `/api/refunds/${id}/approve`);
  const refunded = await api(base, dave.body.token, "POST", `/api/refunds/${id}/refund`);
  const confirmed = await api(base, alice.body.token, "GET", `/api/refunds/${id}`);
  return { alice, carol, dave, created, reviewed, approved, refunded, confirmed };
}

async function runBola(base) {
  const alice = await login(base, "acme-alice");
  const mine = await api(base, alice.body.token, "GET", "/api/refunds");
  const myIds = new Set(mine.body.map((r) => r.id));
  const probes = [];
  for (let id = 1; id <= 20; id++) {
    if (myIds.has(id)) continue;
    probes.push(await api(base, alice.body.token, "GET", `/api/refunds/${id}`));
  }
  const sameTenant = probes.filter((p) => p.status === 200 && p.body.tenant_id === 1);
  const crossTenant = probes.filter((p) => p.status === 200 && p.body.tenant_id !== 1);
  const denied = probes.filter((p) => p.status === 404 || p.body?.error === "NOT_FOUND");
  return { alice, mine, probes, sameTenant, crossTenant, denied };
}

export { runLegal, runBola, login, api, PASS };

async function main() {
  const tier1 = await runLegal("http://localhost:3199");
  const tier2 = await runBola("http://localhost:3199");
  const tier3 = await runBola("http://localhost:3200");

  const outDir = resolve(import.meta.dirname, "../traces");
  mkdirSync(outDir, { recursive: true });

  const line1 = JSON.stringify({ case: "demo-three-tier", intent: "Legal workflow, BOLA exploit, and fixed-tier comparison in one pass", tiers: ["vulnerable", "fixed"] });
  const lines = [
    line1,
    JSON.stringify({ tier: 1, stage: "legal-workflow", result: tier1 }),
    JSON.stringify({ tier: 1, stage: "bola-exploit", result: tier2 }),
    JSON.stringify({ tier: 2, stage: "fixed-bounce", result: tier3 }),
  ];
  writeFileSync(resolve(outDir, "demo-three-tier.jsonl"), lines.join("\n") + "\n", "utf8");

  console.log("============================");
  console.log(" 第1段 合法流程（漏洞版 3199）");
  console.log("============================");
  console.log(`建立退款 id = ${tier1.created.body.id ?? tier1.created.body.error} (${tier1.created.status})`);
  console.log(`審核 → 核准 → 執行退款 → 確認結果 status = ${tier1.confirmed.body?.status ?? tier1.confirmed.body}`);
  console.log("合法流程最終狀態:", tier1.confirmed.status === 200 ? tier1.confirmed.body?.status : "FAIL");

  console.log("\n============================");
  console.log(" 第2段 違規掃描（漏洞版 3199）");
  console.log("============================");
  console.log("我的 refund id 集合:", [...tier2.mine.body.map((r)=>r.id)].join(", "));
  console.log("掃描 1..20，跳過自己的 id 後：");
  console.log(`  同 tenant 其他人可讀：${tier2.sameTenant.length} 筆`);
  console.log(`  跨 tenant 可讀：${tier2.crossTenant.length} 筆`);
  console.log(`  被擋住（404 或 NOT_FOUND）：${tier2.denied.length} 筆`);
  if (tier2.sameTenant[0]) console.log("舉例（同 tenant 其他人讀到的回應）：", JSON.stringify(tier2.sameTenant[0].body).slice(0, 160));

  console.log("\n============================");
  console.log(" 第3段 修補對照（固定版 3200）");
  console.log("============================");
  console.log("同樣的掃描邏輯，同一個人、上一次掃到的那些 id 集合，換固定版重跑：");
  console.log(`  同 tenant 其他人可讀：${tier3.sameTenant.length} 筆`);
  console.log(`  跨 tenant 可讀：${tier3.crossTenant.length} 筆`);
  console.log(`  被擋住：${tier3.denied.length} 筆`);
  console.log("結論：vulnerable 版能掃到別人的退款，fixed 版回 404 且不洩漏目標是否存在。");
  console.log("\n輸出 trace:", resolve(outDir, "demo-three-tier.jsonl"));
}

main().catch((e) => { console.error(e); process.exit(1); });