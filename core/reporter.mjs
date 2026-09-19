import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * 計算學術基準指標。
 * @param {Array<Object>} results
 * @returns {Object} metrics
 */
export function calculateMetrics(results) {
  const totalCases = results.length;
  if (totalCases === 0) {
    return {
      totalCases: 0,
      remediatedCount: 0,
      regressionFreeCount: 0,
      remediationRate: 0,
      regressionFreeRate: 0,
      avgHunkCount: 0,
      totalDurationMs: 0,
    };
  }

  let remediatedCount = 0;
  let regressionFreeCount = 0;
  let totalHunks = 0;
  let totalDurationMs = 0;

  for (const r of results) {
    if (r.remediated) remediatedCount++;
    if (r.regressionFree) regressionFreeCount++;
    totalHunks += r.diffStats?.hunkCount ?? 1;
    totalDurationMs += r.durationMs ?? 0;
  }

  return {
    totalCases,
    remediatedCount,
    regressionFreeCount,
    remediationRate: Number(((remediatedCount / totalCases) * 100).toFixed(1)),
    regressionFreeRate: Number(((regressionFreeCount / totalCases) * 100).toFixed(1)),
    avgHunkCount: Number((totalHunks / totalCases).toFixed(1)),
    totalDurationMs,
  };
}

/**
 * 產生終端 ASCII 報表字串。
 * @param {Object} metrics
 * @param {Array<Object>} results
 * @returns {string}
 */
export function formatConsoleReport(metrics, results) {
  const lines = [
    "\n=======================================================",
    "  📊 Benchmark Evaluation Results & Metrics Summary",
    "=======================================================",
    `  總評測案例數 (Total Cases)         : ${metrics.totalCases}`,
    `  漏洞防禦成功數 (Remediated)         : ${metrics.remediatedCount} / ${metrics.totalCases} (${metrics.remediationRate}%)`,
    `  功能無回歸率 (Regression-Free Rate) : ${metrics.regressionFreeCount} / ${metrics.totalCases} (${metrics.regressionFreeRate}%)`,
    `  平均 Hunk 數 (Avg Hunks / Case)     : ${metrics.avgHunkCount}`,
    `  總耗時 (Total Time)                : ${metrics.totalDurationMs} ms`,
    "-------------------------------------------------------",
  ];

  for (const r of results) {
    const statusIcon = r.remediated && r.regressionFree ? "✅ PASS" : "❌ FAIL";
    lines.push(`  [${r.caseId}] ${statusIcon} | Hunks: ${r.diffStats?.hunkCount ?? "-"} | Tests: ${r.testsPass}/${r.testsTotal}`);
    if (r.error) {
      lines.push(`     ⚠️ 錯誤: ${r.error}`);
    }
  }

  lines.push("=======================================================\n");
  return lines.join("\n");
}

/**
 * 產生論文／學術等級 Markdown 格式跑分報告。
 * @param {Object} metrics
 * @param {Array<Object>} results
 * @param {Object} [metaInfo]
 * @returns {string}
 */
export function generateMarkdownReport(metrics, results, metaInfo = {}) {
  const generatedAt = new Date().toISOString();
  const md = [
    "# 📊 Benchmark Suite 評測矩陣跑分報告 (Evaluation Report)",
    "",
    `> **產生時間**：${generatedAt}  `,
    `> **評測目標**：${metaInfo.targetLabel || "Baseline Ground Truth Verification"}  `,
    `> **評測案例數**：${metrics.totalCases} 案例`,
    "",
    "## 📈 一、 核心評測指標 (Evaluation Metrics)",
    "",
    "| 指標名稱 (Metric) | 數值 (Value) | 學術定義 (Academic Definition) |",
    "| :--- | :--- | :--- |",
    `| **Vulnerability Remediation Rate (VRR)** | **${metrics.remediationRate}%** (${metrics.remediatedCount}/${metrics.totalCases}) | 成功封堵目標弱點且阻斷 PoC 攻擊之比例 |`,
    `| **Regression-Free Rate (RFR)** | **${metrics.regressionFreeRate}%** (${metrics.regressionFreeCount}/${metrics.totalCases}) | 修補後原有業務功能 Oracle 測試全數通過之比例 |`,
    `| **Average Hunk Count** | **${metrics.avgHunkCount}** | 每案例平均不可分割補丁區塊 (Hunks) 數量 |`,
    `| **Total Evaluation Latency** | **${metrics.totalDurationMs} ms** | 完整評測與回歸執行總耗時 |`,
    "",
    "---",
    "",
    "## 📋 二、 各案例詳細明細表 (Case Breakdown)",
    "",
    "| 案例識別碼 (ID) | 案例標題 (Title) | 評測狀態 | 補丁 Hunk 數 | 測試通過數 | 耗時 |",
    "| :--- | :--- | :---: | :---: | :---: | :---: |",
  ];

  for (const r of results) {
    const statusBadge = r.remediated && r.regressionFree ? "🟢 **PASS**" : "🔴 **FAIL**";
    md.push(
      `| \`${r.caseId}\` | ${r.title || r.caseId} | ${statusBadge} | ${r.diffStats?.hunkCount ?? 1} | ${r.testsPass} / ${r.testsTotal} | ${r.durationMs}ms |`,
    );
  }

  md.push("");
  md.push("---");
  md.push("*Report generated automatically by `sec-poc` benchmark evaluation harness.*");
  md.push("");

  return md.join("\n");
}

/**
 * 將報告寫入檔案（支援 Markdown 與 JSON）。
 * @param {Object} metrics
 * @param {Array<Object>} results
 * @param {Object} options
 * @param {string} [options.mdPath]
 * @param {string} [options.jsonPath]
 */
export function saveReports(metrics, results, { mdPath, jsonPath, metaInfo } = {}) {
  if (mdPath) {
    const absMd = resolve(mdPath);
    mkdirSync(dirname(absMd), { recursive: true });
    const contentMd = generateMarkdownReport(metrics, results, metaInfo);
    writeFileSync(absMd, contentMd, "utf8");
  }
  if (jsonPath) {
    const absJson = resolve(jsonPath);
    mkdirSync(dirname(absJson), { recursive: true });
    const contentJson = JSON.stringify({ metrics, results, generatedAt: new Date().toISOString() }, null, 2);
    writeFileSync(absJson, contentJson, "utf8");
  }
}
