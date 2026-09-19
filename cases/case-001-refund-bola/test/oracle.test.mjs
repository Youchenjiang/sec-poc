import assert from "node:assert/strict";
import test from "node:test";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { openDatabase } from "../src/db.mjs";
import {
  resetDatabase,
  restoreSnapshot,
  seedDatabase,
  snapshotDatabase,
  SEED_PASSWORD,
} from "../src/seed.mjs";
import { createTestSystem } from "../src/server.mjs";
import { runWorkerPass } from "../src/worker.mjs";

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

async function withServer({ enforceOwnership = false, seed = true } = {}, fn) {
  const db = openDatabase(":memory:");
  const server = createTestSystem({ enforceOwnership, db, seed });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const api = makeApi(port);
  try {
    await fn({ api, db });
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

test("seed 完整性：tenant/user/refund 數量與樣本狀態", () => {
  const db = openDatabase(":memory:");
  seedDatabase(db);
  try {
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tenants").get().n, 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users").get().n, 8);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM refund_requests").get().n, 3);
    const bobRefund = db.prepare("SELECT * FROM refund_requests WHERE id = 2").get();
    assert.equal(bobRefund.status, "APPROVED");
    const globexRefund = db.prepare("SELECT * FROM refund_requests WHERE id = 3").get();
    assert.equal(globexRefund.tenant_id, 2);
  } finally {
    db.close();
  }
});

test("合法流程全路徑成功（建立→審核→核准→退款→確認 REFUNDED）", async () => {
  await withServer({}, async ({ api }) => {
    const alice = await loginAs(api, "acme-alice");
    const created = await api("POST", "/api/refunds", {
      token: alice,
      body: { amountCents: 42000, reason: "legal flow" },
    });
    assert.equal(created.status, 201);
    const id = created.body.id;

    const carol = await loginAs(api, "acme-carol");
    assert.equal((await api("POST", `/api/refunds/${id}/review`, { token: carol })).status, 200);
    assert.equal((await api("POST", `/api/refunds/${id}/approve`, { token: carol })).status, 200);

    const dave = await loginAs(api, "acme-dave");
    assert.equal((await api("POST", `/api/refunds/${id}/refund`, { token: dave })).status, 200);

    const view = await api("GET", `/api/refunds/${id}`, { token: alice });
    assert.equal(view.status, 200);
    assert.equal(view.body.status, "REFUNDED");
  });
});

test("狀態機：非法轉移被拒（直接退款、跳過審核即核准）", async () => {
  await withServer({}, async ({ api }) => {
    const alice = await loginAs(api, "acme-alice");
    const created = await api("POST", "/api/refunds", {
      token: alice,
      body: { amountCents: 1000, reason: "state machine" },
    });
    assert.equal(created.status, 201);
    const id = created.body.id;

    const dave = await loginAs(api, "acme-dave");
    const directRefund = await api("POST", `/api/refunds/${id}/refund`, { token: dave });
    assert.equal(directRefund.status, 409); // REQUESTED 不可直接 REFUNDED

    const carol = await loginAs(api, "acme-carol");
    const skipReview = await api("POST", `/api/refunds/${id}/approve`, { token: carol });
    assert.equal(skipReview.status, 409); // 需先 REVIEWED
  });
});

test("SoD／角色：customer 不可核准或執行退款，未授權請求回 401", async () => {
  await withServer({}, async ({ api }) => {
    assert.equal((await api("GET", "/api/refunds")).status, 401);

    const alice = await loginAs(api, "acme-alice");
    const carol = await loginAs(api, "acme-carol");
    const created = await api("POST", "/api/refunds", {
      token: alice,
      body: { amountCents: 1000, reason: "sod" },
    });
    const id = created.body.id;
    await api("POST", `/api/refunds/${id}/review`, { token: carol });

    assert.equal((await api("POST", `/api/refunds/${id}/approve`, { token: alice })).status, 403);
    assert.equal((await api("POST", `/api/refunds/${id}/refund`, { token: alice })).status, 403);
  });
});

test("vulnerable：BOLA 成功（customer 可讀其他 owner 的退款）", async () => {
  await withServer({ enforceOwnership: false }, async ({ api }) => {
    const alice = await loginAs(api, "acme-alice");
    const bobRefund = await api("GET", "/api/refunds/2", { token: alice });
    assert.equal(bobRefund.status, 200);
    assert.equal(bobRefund.body.owner_id, 2); // bob 的退款
  });
});

test("fixed：BOLA 被拒（同 tenant 跨 owner 與跨 tenant 皆 404，不洩漏資料）", async () => {
  await withServer({ enforceOwnership: true }, async ({ api }) => {
    const alice = await loginAs(api, "acme-alice");

    const sameTenant = await api("GET", "/api/refunds/2", { token: alice });
    assert.equal(sameTenant.status, 404);
    assert.equal(sameTenant.body.error, "NOT_FOUND");
    assert.equal(sameTenant.body.id, undefined); // 不洩漏目標資源存在與否

    const crossTenant = await api("GET", "/api/refunds/3", { token: alice });
    assert.equal(crossTenant.status, 404);

    // 自己的退款仍可讀（功能保存）
    const own = await api("GET", "/api/refunds/1", { token: alice });
    assert.equal(own.status, 200);
  });
});

test("fixed 保留合法流程（無功能回歸）", async () => {
  await withServer({ enforceOwnership: true }, async ({ api }) => {
    const alice = await loginAs(api, "acme-alice");
    const created = await api("POST", "/api/refunds", {
      token: alice,
      body: { amountCents: 7700, reason: "fixed preserves legal flow" },
    });
    assert.equal(created.status, 201);
    const id = created.body.id;

    const carol = await loginAs(api, "acme-carol");
    await api("POST", `/api/refunds/${id}/review`, { token: carol });
    assert.equal((await api("POST", `/api/refunds/${id}/approve`, { token: carol })).status, 200);

    const dave = await loginAs(api, "acme-dave");
    assert.equal((await api("POST", `/api/refunds/${id}/refund`, { token: dave })).status, 200);
  });
});

test("worker：執行 APPROVED 退款並以 revalidation 防止重複執行", () => {
  const db = openDatabase(":memory:");
  seedDatabase(db);
  try {
    assert.equal(runWorkerPass(db), 1); // seed 中只有 refund 2 是 APPROVED
    const r2 = db.prepare("SELECT status FROM refund_requests WHERE id = 2").get();
    assert.equal(r2.status, "REFUNDED");
    assert.equal(runWorkerPass(db), 0); // 第二輪不重複執行
    const audit = db
      .prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'execute_refund' AND detail = 'byWorker=true'")
      .get();
    assert.equal(audit.n, 1);
  } finally {
    db.close();
  }
});

test("reset round-trip：弄壞 DB → 快照還原 → 再從 seed 重建，均可驗證恢復", () => {
  const dbPath = resolve(import.meta.dirname, "../db/reset-test.db");
  const snapshotPath = resolve(import.meta.dirname, "../db/reset-test-snapshot.db");
  const cleanup = () => {
    for (const p of [dbPath, snapshotPath]) {
      for (const suffix of ["", "-wal", "-shm"]) rmSync(p + suffix, { force: true });
    }
  };

  // 弄壞：清空退款與稽核資料（關閉 FK 檢查，且確保連線一定關閉）
  const corruptDb = (path) => {
    const db = openDatabase(path);
    try {
      db.exec("PRAGMA foreign_keys = OFF");
      db.exec("DELETE FROM approval_records; DELETE FROM refund_requests; DELETE FROM audit_events;");
    } finally {
      db.close();
    }
  };
  const countRefunds = (path) => {
    const db = openDatabase(path);
    try {
      return db.prepare("SELECT COUNT(*) AS n FROM refund_requests").get().n;
    } finally {
      db.close();
    }
  };

  cleanup();
  try {
    resetDatabase(dbPath);
    snapshotDatabase(dbPath, snapshotPath);

    // 弄壞
    corruptDb(dbPath);
    assert.equal(countRefunds(dbPath), 0);

    // 還原方式一：快照覆蓋
    restoreSnapshot(dbPath, snapshotPath);
    assert.equal(countRefunds(dbPath), 3);

    // 再弄壞一次，還原方式二：從 seed 重建
    corruptDb(dbPath);
    resetDatabase(dbPath);
    assert.equal(countRefunds(dbPath), 3);
    const reseeded = openDatabase(dbPath);
    try {
      assert.equal(reseeded.prepare("SELECT COUNT(*) AS n FROM users").get().n, 8);
      assert.equal(reseeded.prepare("SELECT status FROM refund_requests WHERE id = 1").get().status, "REQUESTED");
    } finally {
      reseeded.close();
    }
  } finally {
    cleanup();
  }
});