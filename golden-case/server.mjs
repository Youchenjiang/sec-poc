import http from "node:http";
import { pathToFileURL } from "node:url";

export function createOrderServer({ enforcePayment = false } = {}) {
  const orders = new Map();
  let nextId = 1;

  return http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    const send = (status, body) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };

    if (request.method === "POST" && url.pathname === "/orders") {
      const order = { id: String(nextId++), status: "CREATED" };
      orders.set(order.id, order);
      return send(201, order);
    }

    const match = url.pathname.match(/^\/orders\/(\d+)\/(pay|ship)$/);
    if (request.method === "POST" && match) {
      const [, id, action] = match;
      const order = orders.get(id);
      if (!order) return send(404, { error: "ORDER_NOT_FOUND" });

      if (action === "pay") order.status = "PAID";
      if (action === "ship") {
        if (enforcePayment && order.status !== "PAID") {
          return send(409, { error: "PAYMENT_REQUIRED", status: order.status });
        }
        order.status = "SHIPPED";
      }
      return send(200, order);
    }

    return send(404, { error: "NOT_FOUND" });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const enforcePayment = process.argv.includes("--fixed");
  createOrderServer({ enforcePayment }).listen(3000, () => {
    console.log(`Order demo listening on http://localhost:3000 (${enforcePayment ? "fixed" : "vulnerable"})`);
  });
}
