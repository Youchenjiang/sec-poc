import assert from "node:assert/strict";
import test from "node:test";
import { analyzeDiff } from "../core/evaluator.mjs";
import { calculateMetrics, generateMarkdownReport } from "../core/reporter.mjs";
import { findCase } from "../core/harness.mjs";

test("1. analyzeDiff：精確解析 unified diff 中的 hunks 與檔案變更", () => {
  const sampleDiff = `
diff --git a/src/server.mjs b/src/server.mjs
--- a/src/server.mjs
+++ b/src/server.mjs
@@ -10,3 +10,6 @@
+function guard() {
+  return true;
+}
diff --git a/src/worker.mjs b/src/worker.mjs
--- a/src/worker.mjs
+++ b/src/worker.mjs
@@ -20,2 +20,4 @@
-const old = 1;
+const fixed = 2;
@@ -40,2 +42,3 @@
+console.log("hunk2");
`;

  const stats = analyzeDiff(sampleDiff);
  assert.equal(stats.hunkCount, 3, "應識別出 3 個 Hunks");
  assert.equal(stats.files.length, 2, "應識別出 2 個異動檔案");
  assert.ok(stats.files.includes("src/server.mjs"));
  assert.ok(stats.files.includes("src/worker.mjs"));
  assert.ok(stats.insertions >= 5);
  assert.ok(stats.deletions >= 1);
});

test("2. calculateMetrics：精準計算 VRR、RFR 與平均 Hunk 數", () => {
  const mockResults = [
    {
      caseId: "case-001",
      remediated: true,
      regressionFree: true,
      diffStats: { hunkCount: 1 },
      durationMs: 100,
    },
    {
      caseId: "case-002",
      remediated: true,
      regressionFree: true,
      diffStats: { hunkCount: 3 },
      durationMs: 200,
    },
    {
      caseId: "case-003",
      remediated: false,
      regressionFree: true,
      diffStats: { hunkCount: 2 },
      durationMs: 150,
    },
  ];

  const metrics = calculateMetrics(mockResults);
  assert.equal(metrics.totalCases, 3);
  assert.equal(metrics.remediatedCount, 2);
  assert.equal(metrics.regressionFreeCount, 3);
  assert.equal(metrics.remediationRate, 66.7);
  assert.equal(metrics.regressionFreeRate, 100.0);
  assert.equal(metrics.avgHunkCount, 2.0);
  assert.equal(metrics.totalDurationMs, 450);
});

test("3. generateMarkdownReport：產生合規 Markdown 論文報表結構", () => {
  const mockMetrics = {
    totalCases: 2,
    remediatedCount: 2,
    regressionFreeCount: 2,
    remediationRate: 100.0,
    regressionFreeRate: 100.0,
    avgHunkCount: 2.0,
    totalDurationMs: 300,
  };

  const mockResults = [
    {
      caseId: "case-001",
      title: "Test Case 1",
      remediated: true,
      regressionFree: true,
      diffStats: { hunkCount: 1 },
      testsPass: 9,
      testsTotal: 9,
      durationMs: 150,
    },
  ];

  const md = generateMarkdownReport(mockMetrics, mockResults);
  assert.ok(md.includes("# 📊 Benchmark Suite 評測矩陣跑分報告"));
  assert.ok(md.includes("Vulnerability Remediation Rate (VRR)"));
  assert.ok(md.includes("Regression-Free Rate (RFR)"));
  assert.ok(md.includes("`case-001`"));
  assert.ok(md.includes("🟢 **PASS**"));
});

test("4. findCase：正確尋找並解析已註冊案例", () => {
  const c1 = findCase("case-001");
  assert.ok(c1);
  assert.equal(c1.meta.id, "case-001-refund-bola");

  const c2 = findCase("case-002");
  assert.ok(c2);
  assert.equal(c2.meta.id, "case-002-async-worker-race");
  assert.equal(c2.meta.complexity.hunk_count, 3);
});
