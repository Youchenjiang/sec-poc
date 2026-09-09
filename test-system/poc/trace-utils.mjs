import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** 建立 trace 記錄器：收集 meta 與每筆 request/response 供寫入 JSONL。 */
export function createRecorder({ caseName, intent, actors }) {
  return {
    meta: {
      case: caseName,
      intent,
      actors,
      startedAt: new Date().toISOString(),
    },
    entries: [],
    record(entry) {
      const full = { seq: this.entries.length + 1, at: new Date().toISOString(), ...entry };
      this.entries.push(full);
      return full;
    },
  };
}

/**
 * 黑箱 HTTP client：只透過 HTTP 與伺服器互動（第一年不讀原始碼、不碰 instrumentation），
 * 每筆呼叫自動記錄到 recorder。
 */
export function createApi(baseUrl, recorder) {
  return async function api(method, path, { token, body, actor } = {}) {
    const headers = { "content-type": "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    recorder.record({
      actor: actor ?? null,
      method,
      path,
      status: response.status,
      requestBody: body ?? null,
      responseBody: parsed,
    });
    return { status: response.status, body: parsed };
  };
}

export function expectStatus(result, expected, label) {
  if (result.status !== expected) {
    throw new Error(`${label}：預期 HTTP ${expected}，實際 ${result.status}（${JSON.stringify(result.body)}）`);
  }
}

/** 把 recorder 寫成 JSONL（第一行是 meta）。回傳寫入路徑。 */
export function writeTrace(recorder, outPath) {
  const abs = resolve(outPath);
  mkdirSync(dirname(abs), { recursive: true });
  const lines = [JSON.stringify(recorder.meta), ...recorder.entries.map((e) => JSON.stringify(e))];
  writeFileSync(abs, lines.join("\n") + "\n", "utf8");
  return abs;
}

export function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}