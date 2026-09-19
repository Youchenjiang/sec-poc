#!/usr/bin/env node

/**
 * Benchmark Suite Unified CLI Harness
 *
 * 支援指令範例：
 *   node core/harness.mjs --list
 *   node core/harness.mjs --case=case-001 --verify
 *   node core/harness.mjs --case=case-001 --reset
 *   node core/harness.mjs --case=case-001 --snapshot
 *   node core/harness.mjs --case=case-001 --restore
 *   node core/harness.mjs --case=case-001 --poc=legal
 *   node core/harness.mjs --case=case-001 --poc=bola
 *   node core/harness.mjs --verify (跑全部案例的測試)
 *   node core/harness.mjs --baseline (執行全部案例 Ground Truth 基線評測並產出報告)
 *   node core/harness.mjs --eval --case=case-002 --patch=<path-to-diff> (評測外部 Patch)
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { evaluateCase } from "./evaluator.mjs";
import { calculateMetrics, formatConsoleReport, saveReports } from "./reporter.mjs";

const ROOT_DIR = resolve(import.meta.dirname, "..");
const CASES_DIR = resolve(ROOT_DIR, "cases");

/**
 * 掃描 cases/ 目錄，讀取所有合法案例的 meta.json。
 * @returns {Array<{ dir: string, meta: Object, fullPath: string }>}
 */
export function loadAllCases() {
  if (!existsSync(CASES_DIR)) return [];
  const entries = readdirSync(CASES_DIR, { withFileTypes: true });
  const cases = [];
  for (const ent of entries) {
    if (ent.isDirectory()) {
      const metaPath = join(CASES_DIR, ent.name, "meta.json");
      if (existsSync(metaPath)) {
        try {
          const meta = JSON.parse(readFileSync(metaPath, "utf8"));
          cases.push({ dir: ent.name, meta, fullPath: join(CASES_DIR, ent.name) });
        } catch (e) {
          console.warn(`[WARN] 無法解析 ${metaPath}: ${e.message}`);
        }
      }
    }
  }
  return cases;
}

/**
 * 依 ID 或別名搜尋特定案例。
 * @param {string} caseId
 * @returns {Object|null}
 */
export function findCase(caseId) {
  const all = loadAllCases();
  return all.find((c) => c.meta.id === caseId || c.dir === caseId || c.dir.startsWith(caseId)) ?? null;
}

/**
 * 印出所有註冊案例清單。
 */
export function printCaseList() {
  const all = loadAllCases();
  console.log("\n=======================================================");
  console.log("  🎯 Benchmark Suite: Pluggable Case Registry");
  console.log("=======================================================");
  if (all.length === 0) {
    console.log("  (尚未註冊任何案例)");
    return;
  }
  for (const c of all) {
    const { id, title, cwe, severity, complexity } = c.meta;
    console.log(`\n📦 [${id}] ${title}`);
    console.log(`   - 嚴重性等級: ${severity}`);
    console.log(`   - CWE 標記  : ${cwe ? cwe.join(", ") : "N/A"}`);
    if (complexity) {
      console.log(`   - 涉及角色  : ${complexity.roles?.join(", ") ?? "N/A"}`);
      console.log(`   - Multi-hunk: ${complexity.is_inseparable_multihunk ? `是 (${complexity.hunk_count} hunks)` : "否"}`);
    }
  }
  console.log("\n=======================================================\n");
}

/**
 * 執行特定測試套件。
 * @param {string} testFile 相對於專案根目錄之路徑
 * @returns {number} exit code
 */
function runTestFile(testFile) {
  console.log(`\n🧪 執行測試: ${testFile}`);
  const result = spawnSync("node", ["--test", testFile], {
    cwd: ROOT_DIR,
    stdio: "inherit",
    env: process.env,
  });
  return result.status ?? 1;
}

/**
 * CLI 進入點。
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(`
Benchmark CLI Harness 使用說明:
  --list                          列出所有已註冊的案例
  --case=<id>                     指定特定案例 (如 --case=case-001)
  --verify                        執行單元與 Oracle 回歸測試
  --reset                         重置案例資料庫至乾淨 seed 狀態
  --snapshot                      將案例目前資料庫建立快照
  --restore                       從快照快速還原案例資料庫
  --poc=<legal|bola|exploit|demo> 執行案例的黑箱 PoC 腳本
  --baseline                      執行全部案例 Ground Truth 基線評測並產生報告
  --eval --patch=<path>           評測外部 Patch 補丁修復效果
`);
    return;
  }

  if (args.includes("--list")) {
    printCaseList();
    return;
  }

  // 1. 全量 Ground Truth 基線評測 (--baseline)
  if (args.includes("--baseline")) {
    console.log("\n🚀 啟動 Benchmark 全案例 Ground Truth 基線跑分評測...");
    const all = loadAllCases();
    const results = [];
    for (const c of all) {
      console.log(`\n⚡ 評測案例 [${c.meta.id}]...`);
      const res = await evaluateCase(c, { useFixedMode: true });
      results.push(res);
    }
    const metrics = calculateMetrics(results);
    const consoleReport = formatConsoleReport(metrics, results);
    console.log(consoleReport);

    saveReports(metrics, results, {
      mdPath: resolve(ROOT_DIR, "reports/benchmark-report.md"),
      jsonPath: resolve(ROOT_DIR, "reports/benchmark-report.json"),
      metaInfo: { targetLabel: "Ground Truth Fixed Baseline" },
    });
    console.log("📄 評測跑分報告已輸出至: reports/benchmark-report.md & reports/benchmark-report.json");
    return;
  }

  // 解析 --case=<id>
  const caseArg = args.find((a) => a.startsWith("--case="));
  const caseId = caseArg ? caseArg.split("=")[1] : null;

  // 2. 執行全案例回歸測試 (--verify)
  if (!caseId && args.includes("--verify")) {
    const all = loadAllCases();
    let failedCount = 0;
    for (const c of all) {
      const testRel = `cases/${c.dir}/${c.meta.oracle?.test_suite ?? "test/oracle.test.mjs"}`;
      const code = runTestFile(testRel);
      if (code !== 0) failedCount++;
    }
    if (failedCount > 0) {
      console.error(`\n❌ 有 ${failedCount} 個案例測試未通過`);
      process.exit(1);
    }
    console.log("\n✅ 全部案例測試通過！");
    return;
  }

  if (!caseId) {
    console.error("❌ 錯誤：請使用 --case=<id> 指定案例，或使用 --list 查看所有可用案例。");
    process.exit(1);
  }

  const targetCase = findCase(caseId);
  if (!targetCase) {
    console.error(`❌ 錯誤：找不到案例 "${caseId}"`);
    process.exit(1);
  }

  console.log(`\n🎯 選定案例: [${targetCase.meta.id}] ${targetCase.meta.title}`);

  // 3. 外部 Patch 評測 (--eval)
  if (args.includes("--eval")) {
    const patchArg = args.find((a) => a.startsWith("--patch="));
    const patchPath = patchArg ? patchArg.split("=")[1] : null;
    console.log(`\n🔍 評測目標案例: ${targetCase.meta.id}`);
    if (patchPath) console.log(`   外部 Patch 檔案: ${patchPath}`);

    const res = await evaluateCase(targetCase, { patchPath });
    const metrics = calculateMetrics([res]);
    console.log(formatConsoleReport(metrics, [res]));
    return;
  }

  // 4. 執行單一案例測試
  if (args.includes("--verify")) {
    const testRel = `cases/${targetCase.dir}/${targetCase.meta.oracle?.test_suite ?? "test/oracle.test.mjs"}`;
    const code = runTestFile(testRel);
    process.exit(code);
  }

  // 5. 執行 DB 重置 / 快照 / 還原
  const seedModulePath = join(targetCase.fullPath, "src/seed.mjs");
  if (existsSync(seedModulePath)) {
    const seedModule = await import(pathToFileURL(seedModulePath).href);
    if (args.includes("--reset")) {
      seedModule.resetDatabase();
      console.log(`✅ [${targetCase.meta.id}] 資料庫已重置完成。`);
      return;
    }
    if (args.includes("--snapshot")) {
      seedModule.snapshotDatabase();
      console.log(`✅ [${targetCase.meta.id}] 資料庫快照已建立。`);
      return;
    }
    if (args.includes("--restore")) {
      seedModule.restoreSnapshot();
      console.log(`✅ [${targetCase.meta.id}] 資料庫已從快照還原。`);
      return;
    }
  }

  // 6. 執行 PoC 腳本
  const pocArg = args.find((a) => a.startsWith("--poc="));
  if (pocArg) {
    const pocType = pocArg.split("=")[1];
    let scriptRel = null;
    if (pocType === "legal") {
      scriptRel = targetCase.meta.oracle?.legal_script ?? "poc/legal-workflow.mjs";
    } else if (pocType === "bola" || pocType === "exploit") {
      scriptRel = targetCase.meta.oracle?.exploit_script ?? "poc/exploit-bola.mjs";
    } else if (pocType === "demo") {
      scriptRel = targetCase.meta.oracle?.demo_script ?? "poc/demo-three-tier.mjs";
    }

    if (!scriptRel) {
      console.error(`❌ 未知或未定義的 PoC 類型: "${pocType}"`);
      process.exit(1);
    }

    const scriptFull = join(targetCase.fullPath, scriptRel);
    console.log(`🚀 執行 PoC 腳本: ${scriptRel}`);
    const res = spawnSync("node", [scriptFull], {
      cwd: targetCase.fullPath,
      stdio: "inherit",
      env: process.env,
    });
    process.exit(res.status ?? 1);
  }
}

main().catch((err) => {
  console.error("Harness 執行失敗:", err);
  process.exit(1);
});
