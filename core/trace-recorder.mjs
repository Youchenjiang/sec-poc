import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * 建立通用的 trace 記錄器：收集 meta 與每筆 HTTP request/response 供寫入 JSONL。
 * @param {Object} options
 * @param {string} options.caseName 案例識別碼 (e.g. case-001-refund-bola)
 * @param {string} options.intent 測試或攻擊意圖說明
 * @param {string[]} options.actors 參與角色列表
 * @returns {Object}
 */
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
 * 黑箱 HTTP 客戶端：透過 HTTP 與案例伺服器互動，每筆呼叫自動記錄到 recorder。
 * @param {string} baseUrl
 * @param {Object} recorder
 * @returns {Function} api(method, path, options)
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
    if (recorder && typeof recorder.record === "function") {
      recorder.record({
        actor: actor ?? null,
        method,
        path,
        status: response.status,
        requestBody: body ?? null,
        responseBody: parsed,
      });
    }
    return { status: response.status, body: parsed };
  };
}

/**
 * 驗證 HTTP 回應狀態碼，不符時拋出詳細 Error。
 * @param {Object} result
 * @param {number} expected
 * @param {string} label
 */
export function expectStatus(result, expected, label) {
  if (result.status !== expected) {
    throw new Error(`${label}：預期 HTTP ${expected}，實際 ${result.status}（${JSON.stringify(result.body)}）`);
  }
}

/**
 * 把 recorder 內容寫成 JSONL 格式（第 1 行為 meta，後續為請求序列）。
 * @param {Object} recorder
 * @param {string} outPath 輸出檔案路徑
 * @returns {string} 輸出之絕對路徑
 */
export function writeTrace(recorder, outPath) {
  const abs = resolve(outPath);
  mkdirSync(dirname(abs), { recursive: true });
  const lines = [JSON.stringify(recorder.meta), ...recorder.entries.map((e) => JSON.stringify(e))];
  writeFileSync(abs, lines.join("\n") + "\n", "utf8");
  return abs;
}

/**
 * 從命令列參數中解析指定旗標的數值。
 * @param {string[]} args
 * @param {string} flag
 * @returns {string|undefined}
 */
export function argValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}
