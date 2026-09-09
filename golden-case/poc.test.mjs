import assert from "node:assert/strict";
import test from "node:test";
import { createOrderServer } from "./server.mjs";

async function runScenario({ enforcePayment, steps }) {
  const server = createOrderServer({ enforcePayment });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const call = async (path) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST" });
    return { httpStatus: response.status, body: await response.json() };
  };

  try {
    const created = await call("/orders");
    const id = created.body.id;
    let result = created;
    for (const step of steps) result = await call(`/orders/${id}/${step}`);
    return result;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("vulnerable backend accepts the legitimate paid workflow", async () => {
  const result = await runScenario({ enforcePayment: false, steps: ["pay", "ship"] });
  assert.deepEqual(result, { httpStatus: 200, body: { id: "1", status: "SHIPPED" } });
});

test("vulnerable backend also accepts shipping without payment", async () => {
  const result = await runScenario({ enforcePayment: false, steps: ["ship"] });
  assert.deepEqual(result, { httpStatus: 200, body: { id: "1", status: "SHIPPED" } });
});

test("fixed backend rejects shipping without payment", async () => {
  const result = await runScenario({ enforcePayment: true, steps: ["ship"] });
  assert.deepEqual(result, {
    httpStatus: 409,
    body: { error: "PAYMENT_REQUIRED", status: "CREATED" },
  });
});

test("fixed backend preserves the legitimate paid workflow", async () => {
  const result = await runScenario({ enforcePayment: true, steps: ["pay", "ship"] });
  assert.deepEqual(result, { httpStatus: 200, body: { id: "1", status: "SHIPPED" } });
});
