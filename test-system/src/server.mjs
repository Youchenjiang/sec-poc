import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createSchema, DEFAULT_DB_PATH, openDatabase } from "./db.mjs";
import { seedDatabase } from "./seed.mjs";
import { createRouter } from "./routes.mjs";

const INDEX_HTML = resolve(import.meta.dirname, "../public/index.html");

export function createTestSystem({ enforceOwnership = false, db, seed = false } = {}) {
  const dbHandle = db ?? openDatabase(DEFAULT_DB_PATH);
  if (seed) seedDatabase(dbHandle);
  const router = createRouter({ db: dbHandle, enforceOwnership });

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");

    if (url.pathname.startsWith("/api/")) {
      await router.handle(request, response, url);
      return;
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      try {
        const html = await readFile(INDEX_HTML, "utf8");
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(html);
        return;
      } catch {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "INDEX_MISSING" }));
        return;
      }
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "NOT_FOUND" }));
  });
}

function seedIfEmpty(db) {
  const row = db.prepare("SELECT COUNT(*) AS n FROM tenants").get();
  if (row.n === 0) seedDatabase(db);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  const enforceOwnership = process.argv.includes("--fixed");
  const db = openDatabase(DEFAULT_DB_PATH);
  createSchema(db);
  seedIfEmpty(db);
  const server = createTestSystem({ enforceOwnership, db });
  server.listen(port, () => {
    console.log(
      `退款審批平台 listening on http://localhost:${port} (${enforceOwnership ? "fixed" : "vulnerable"})`,
    );
  });
}