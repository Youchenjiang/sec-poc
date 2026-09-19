import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ROOT_DIR = resolve(import.meta.dirname, "..");

/**
 * 解析 unified diff 字串，提取 Hunk 數量、異動檔案清單與行數統計。
 * @param {string} diffText
 * @returns {{ hunkCount: number, files: string[], insertions: number, deletions: number }}
 */
export function analyzeDiff(diffText) {
  if (!diffText || typeof diffText !== "string") {
    return { hunkCount: 0, files: [], insertions: 0, deletions: 0 };
  }

  const lines = diffText.split(/\r?\n/);
  const files = new Set();
  let hunkCount = 0;
  let insertions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith("+++ b/") || line.startsWith("+++ ")) {
      const file = line.replace(/^\+\+\+ (b\/)?/, "").trim();
      if (file && file !== "/dev/null") files.add(file);
    } else if (line.startsWith("@@ ")) {
      hunkCount++;
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      insertions++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions++;
    }
  }

  return {
    hunkCount,
    files: Array.from(files),
    insertions,
    deletions,
  };
}

/**
 * 評測單一案例，支援套用外部 Patch、執行 Oracle 驗證，並在完成後安全還原。
 *
 * @param {Object} caseObj 包含 dir, meta, fullPath 之案例物件
 * @param {Object} [options]
 * @param {string} [options.patchPath] 外部 patch 檔案路徑
 * @param {boolean} [options.useFixedMode=false] 是否使用內建 fixedMode 跑基線
 * @returns {Promise<Object>} 評測結果
 */
export async function evaluateCase(caseObj, { patchPath, useFixedMode = false } = {}) {
  const startTime = Date.now();
  let diffStats = null;
  let appliedFiles = [];

  // 1. 若有傳入外部 Patch，先進行語法與套用性預檢
  if (patchPath) {
    const absPatch = resolve(ROOT_DIR, patchPath);
    if (!existsSync(absPatch)) {
      throw new Error(`找不到 Patch 檔案：${absPatch}`);
    }
    const patchContent = readFileSync(absPatch, "utf8");
    diffStats = analyzeDiff(patchContent);

    // git apply --check
    const checkRes = spawnSync("git", ["apply", "--check", absPatch], {
      cwd: caseObj.fullPath,
      encoding: "utf8",
    });
    if (checkRes.status !== 0) {
      return {
        caseId: caseObj.meta.id,
        applied: false,
        error: `Patch 無法乾淨套用：${checkRes.stderr || checkRes.stdout}`,
        remediated: false,
        regressionFree: false,
        durationMs: Date.now() - startTime,
        diffStats,
      };
    }

    // 正式套用
    const applyRes = spawnSync("git", ["apply", absPatch], {
      cwd: caseObj.fullPath,
      encoding: "utf8",
    });
    if (applyRes.status !== 0) {
      return {
        caseId: caseObj.meta.id,
        applied: false,
        error: `Patch 套用失敗：${applyRes.stderr || applyRes.stdout}`,
        remediated: false,
        regressionFree: false,
        durationMs: Date.now() - startTime,
        diffStats,
      };
    }
    appliedFiles = diffStats.files;
  }

  let testExitCode = 1;
  let testStdout = "";
  let testStderr = "";

  try {
    // 2. 重置案例 DB 至乾淨狀態
    const seedModulePath = join(caseObj.fullPath, "src/seed.mjs");
    if (existsSync(seedModulePath)) {
      const seedModule = await import(pathToFileURL(seedModulePath).href);
      if (typeof seedModule.resetDatabase === "function") {
        seedModule.resetDatabase();
      }
    }

    // 3. 執行案例 Oracle 測試
    const testFileRel = `cases/${caseObj.dir}/${caseObj.meta.oracle?.test_suite ?? "test/oracle.test.mjs"}`;
    const testRes = spawnSync("node", ["--test", testFileRel], {
      cwd: ROOT_DIR,
      encoding: "utf8",
      env: {
        ...process.env,
        BENCH_FIXED_MODE: useFixedMode ? "1" : "0",
      },
    });

    testExitCode = testRes.status ?? 1;
    testStdout = testRes.stdout || "";
    testStderr = testRes.stderr || "";
  } finally {
    // 4. 安全還原修改過的檔案，防止工作區被污染
    if (appliedFiles.length > 0) {
      spawnSync("git", ["checkout", "--", ...appliedFiles], {
        cwd: caseObj.fullPath,
      });
    }
  }

  const durationMs = Date.now() - startTime;
  const isPass = testExitCode === 0;

  // 解析通過測試數量
  const passMatch = testStdout.match(/ℹ pass (\d+)/);
  const failMatch = testStdout.match(/ℹ fail (\d+)/);
  const passCount = passMatch ? Number(passMatch[1]) : 0;
  const failCount = failMatch ? Number(failMatch[1]) : 0;
  const totalTests = passCount + failCount;

  return {
    caseId: caseObj.meta.id,
    title: caseObj.meta.title,
    applied: true,
    remediated: isPass,
    regressionFree: isPass && failCount === 0,
    testsPass: passCount,
    testsTotal: totalTests,
    exitCode: testExitCode,
    diffStats: diffStats ?? {
      hunkCount: caseObj.meta.complexity?.hunk_count ?? 1,
      files: [],
      insertions: 0,
      deletions: 0,
    },
    durationMs,
    outputSnippet: (testStdout + testStderr).slice(-600),
  };
}
