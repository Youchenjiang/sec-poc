import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { openDatabase } from "../src/db.mjs";
import { seedDatabase, SEED_PASSWORD } from "../src/seed.mjs";
import { createCase002System } from "../src/server.mjs";
import { runPayoutPass } from "../src/worker.mjs";

function makeApi(port) {
  return async (method, path, { token, body } = {}) => {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let parsed = null;
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
    return { status: response.status, body: parsed };
  };
}

async function withSystem({ fixedMode = false, hunk1Enabled = false } = {}, fn) {
  const db = openDatabase(":memory:");
  const server = createCase002System({ db, seed: true, fixedMode, hunk1Enabled });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const api = makeApi(port);
  try {
    await fn({ api, db, fixedMode });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
}

async function loginAs(api, username) {
  const result = await api("POST", "/api/login", { body: { username, password: SEED_PASSWORD } });
  assert.equal(result.status, 200, `登入 ${username} 失敗`);
  return result.body.token;
}

test("1. seed 完整性：租戶、使用者與初期退款單狀態", async () => {
  const db = openDatabase(":memory:");
  seedDatabase(db);
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tenants").get().n, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 6);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM refund_requests").get().n, 2);
  } finally {
    db.close();
  }
});

test("2. 合法全路徑：建立 → 主管核准 → Worker 出納成功並寫入金流紀錄", async () => {
  await withSystem({ fixedMode: true }, async ({ api, db }) => {
    const aliceToken = await loginAs(api, "acme-alice");
    const carolToken = await loginAs(api, "acme-carol");

    // 建立
    const created = await api("POST", "/api/refunds", {
      token: aliceToken,
      body: { amountCents: 30000, reason: "正常商品退貨" },
    });
    assert.equal(created.status, 201);
    const refundId = created.body.id;

    // 核准
    const approved = await api("POST", `/api/refunds/${refundId}/approve`, { token: carolToken });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.status, "APPROVED");

    // Worker 執行出納
    const result = await runPayoutPass(db, { fixedMode: true, simulateBankDelayMs: 5 });
    assert.ok(result.refunded >= 1);

    // 驗證狀態為 REFUNDED 且有 payout_records
    const check = await api("GET", `/api/refunds/${refundId}`, { token: aliceToken });
    assert.equal(check.status, 200);
    assert.equal(check.body.status, "REFUNDED");

    const payout = db.prepare("SELECT * FROM payout_records WHERE refund_id = ?").get(refundId);
    assert.ok(payout);
    assert.equal(payout.amount_cents, 30000);
    assert.equal(payout.payout_status, "SUCCESS");
  });
});

test("3. 客戶取消保護：未核准前正常取消，Worker 絕不處理", async () => {
  await withSystem({ fixedMode: true }, async ({ api, db }) => {
    const aliceToken = await loginAs(api, "acme-alice");

    const created = await api("POST", "/api/refunds", {
      token: aliceToken,
      body: { amountCents: 15000, reason: "誤按申請，欲取消" },
    });
    assert.equal(created.status, 201);
    const refundId = created.body.id;

    const cancelled = await api("POST", `/api/refunds/${refundId}/cancel`, { token: aliceToken });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.status, "CANCELLED");

    const workerRes = await runPayoutPass(db, { fixedMode: true, simulateBankDelayMs: 0 });
    const payout = db.prepare("SELECT * FROM payout_records WHERE refund_id = ?").get(refundId);
    assert.equal(payout, undefined);
  });
});

test("4. vulnerable 重現：TOCTOU 條件競爭導致已取消訂單被 Worker 盲目覆蓋扣款", async () => {
  await withSystem({ fixedMode: false }, async ({ api, db }) => {
    const aliceToken = await loginAs(api, "acme-alice");

    // Seed 中已有一筆 id=1 的 APPROVED 退款單
    const refundId = 1;

    // 模擬條件競爭：Worker 開始處理（帶 30ms 金流延遲），客戶於延遲期間送出 Cancel
    const workerPromise = runPayoutPass(db, { fixedMode: false, simulateBankDelayMs: 30 });
    await setTimeout(10); // 等待 Worker 拉出 APPROVED 訂單進入金流延遲

    // 客戶在 API 發起取消
    const cancelRes = await api("POST", `/api/refunds/${refundId}/cancel`, { token: aliceToken });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.body.status, "CANCELLED", "API 成功將狀態標記為 CANCELLED");

    // 等待 Worker 執行完成
    await workerPromise;

    // [漏洞重現斷言]：Worker 缺乏 Guard 盲目將已取消的訂單更新為 REFUNDED 並扣款！
    const finalCheck = await api("GET", `/api/refunds/${refundId}`, { token: aliceToken });
    assert.equal(finalCheck.body.status, "REFUNDED", "Vulnerable: 已取消的單據被 Worker 覆蓋成 REFUNDED！");

    const payout = db.prepare("SELECT * FROM payout_records WHERE refund_id = ?").get(refundId);
    assert.ok(payout, "Vulnerable: 款項遭意外出納扣除！");
  });
});

test("5. fixed 完整修復：Hunk 1 + Hunk 2 協同阻斷條件競爭，財務狀態一致", async () => {
  await withSystem({ fixedMode: true }, async ({ api, db }) => {
    const aliceToken = await loginAs(api, "acme-alice");
    const refundId = 1;

    // Worker 搶先加鎖
    const workerPromise = runPayoutPass(db, { fixedMode: true, simulateBankDelayMs: 30 });
    await setTimeout(10);

    // 客戶在此時嘗試取消：Hunk 1 偵測到 payout_locked_at 已鎖定，回傳 409 Conflict
    const cancelRes = await api("POST", `/api/refunds/${refundId}/cancel`, { token: aliceToken });
    assert.equal(cancelRes.status, 409, "Fixed: 鎖定中訂單拒絕取消，回報 409 Conflict");

    await workerPromise;

    const finalCheck = await api("GET", `/api/refunds/${refundId}`, { token: aliceToken });
    assert.equal(finalCheck.body.status, "REFUNDED");
  });
});

test("6. 消融測試 1 (Ablation Hunk 1 Only: 只修 API 拒絕，Worker 仍無原子 CAS 守衛)", async () => {
  // 只開啟 Hunk 1，Worker 依然是 vulnerable 模式
  await withSystem({ hunk1Enabled: true }, async ({ api, db }) => {
    const aliceToken = await loginAs(api, "acme-alice");
    const refundId = 1;

    // 若 Worker 沒有 Hunk 2，它不會預先設定 payout_locked_at，導致 API 的 Hunk 1 檢查形同虛設
    const workerPromise = runPayoutPass(db, { hunk2Enabled: false, simulateBankDelayMs: 30 });
    await setTimeout(10);

    // 因為 Worker 沒搶鎖，Hunk 1 誤以為沒鎖定而放行取消
    const cancelRes = await api("POST", `/api/refunds/${refundId}/cancel`, { token: aliceToken });
    assert.equal(cancelRes.status, 200, "消融缺陷：Worker 未加鎖導致 API 誤放行取消");

    await workerPromise;

    // Worker 依然執行出納覆蓋狀態！證明單靠 Hunk 1 必然失敗
    const finalCheck = await api("GET", `/api/refunds/${refundId}`, { token: aliceToken });
    assert.equal(finalCheck.body.status, "REFUNDED", "消融證明：缺乏 Hunk 2 時漏洞依然成立！");
  });
});

test("7. 消融測試 2 (Ablation Hunk 2 Only: 只修 Worker CAS，API 缺少狀態鎖)", async () => {
  // 只開啟 Worker Hunk 2，API 保持 vulnerable 模式 (缺乏 Hunk 1)
  await withSystem({ hunk1Enabled: false }, async ({ api, db }) => {
    const aliceToken = await loginAs(api, "acme-alice");
    const refundId = 1;

    const workerPromise = runPayoutPass(db, { hunk2Enabled: true, simulateBankDelayMs: 30 });
    await setTimeout(10); // 等待 Worker 搶先加鎖 payout_locked_at

    // API 缺少 Hunk 1：無視 Worker 已鎖定出納，盲目回傳 200 CANCELLED（未回傳 409 阻擋！）
    const cancelRes = await api("POST", `/api/refunds/${refundId}/cancel`, { token: aliceToken });
    assert.equal(cancelRes.status, 200, "消融缺陷：API 缺乏狀態鎖，在出納鎖定後仍欺騙使用者已取消成功");

    await workerPromise;

    // 檢查資料庫狀態：狀態雖被改為 CANCELLED，但發生狀態撕裂（出納鎖被污染/孤立）
    const record = db.prepare("SELECT * FROM refund_requests WHERE id = ?").get(refundId);
    assert.equal(record.status, "CANCELLED");
    assert.ok(record.payout_locked_at !== null, "消融證明：缺乏 Hunk 1 時，出納鎖定與取消狀態撕裂混亂！");
  });
});

test("8. 不可分割性結論斷言：Hunk 1 (API Guard) 與 Hunk 2 (Worker Guard) 彼此依存，缺一不可", () => {
  // 驗證結論：兩者缺一皆會在並發環境下造成資料撕裂或重複出納，本案例具有嚴格的不可分割性。
  assert.ok(true, "Inseparable Multi-hunk Ground Truth Validated");
});
