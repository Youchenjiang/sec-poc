# Agent Persistent Memory

> **Every agent session MUST read this file first** (defined in .agent/rules.md).
> **Every agent session MUST update this file before ending.**

---

## 🔑 User Preferences
- **Language**: 繁體中文 preferred for casual conversation; code/commits in English.
- **Style**: Direct, no fluff. Get things done with high engineering rigor.

---

## 📋 Current Active Tasks
- 已完成 `v0.1.0` 基線與 `v0.1.1` CI/CD 安全防護升級發布。
- **核心轉型計畫已制定**：已完成 [`benchmark-platform-roadmap-v1.md`](benchmark-platform-roadmap-v1.md)，將專案升級為可插拔 Benchmark 評測平台。
- **當前執行階段：Phase 1 架構解耦（Pluggable Refactoring）**
  1. 建立 `cases/case-001-refund-bola/`，遷移現有退款業務邏輯。
  2. 抽取 Benchmark Core 通用模組（`db-manager.mjs`, `trace-recorder.mjs`）。
  3. 實作統一 CLI Harness（`npm run bench`）。
  4. 驗證現有 9 項測試全數相容。
- **後續排程**：
  - Phase 2：實裝 Case-002（複合審批 + 異步 Worker 漏校驗之不可分割 Multi-hunk 案例）。
  - Phase 3：自動化評測矩陣（Evaluation Harness & Metrics Reporter）。
  - Phase 4：Docker 容器化與 CTFd 實戰靶場匯出（串接 `sec-compendium`）。

---

## 🏗️ Architectural Context
- **Project**: POC / sec-poc（商業邏輯漏洞受控評測基準平台）
- **Core Components**:
  - `benchmark-platform-roadmap-v1.md`: 轉型全景規劃主文件
  - `test-system/`: 現存退款審批測試系統（即將遷移至 `cases/case-001-refund-bola`）
  - `test-system/poc/`: 黑箱 PoC 軌跡腳本（`npm run poc:legal`, `npm run poc:bola`）
  - `test-system/traces/`: JSONL 格式的 request/response 軌跡記錄
  - 核心機制：`npm run reset` / `snapshot` / `restore` / `verify` 一鍵還原受控環境
- **Documents & Deliverables**:
  - `benchmark-platform-roadmap-v1.md`: 基準平台轉型路線圖（Phase 1~4 規格）
  - `proposal-revised-v1.md`: 論文/研究計畫案
  - `controlled-test-system-concept-v1.md`: 受控測試系統概念設計
  - `case-selection-and-multihunk-criteria-v1.md`: 案例挑選與多 hunk 準則

---

## ✅ Completed Decisions & Lessons Learned
- Initialized with `research` scaffolding preset.
- Configured Conventional Commits, TruffleHog secrets scan, and PR-Agent workflow.
- 針對「二階段探詢與靜態分析」詰問，確認防禦論述核心在於：
  1. 黑箱探詢缺乏語意 Oracle 與異步/Worker 盲區；
  2. 傳統定位無法處理 Missing-Guard 與不可分割 Multi-hunk。
- 已正式發布 `v0.1.0`（單點 BOLA 基線版本）與 `v0.1.1`（CodeQL、TruffleHog、PR-Agent 與政策 CI 升級）。
- 確立專案轉型方向：維持獨立 Repo，不硬合併進 `sec-compendium` 或 `sec-code-research`，而是擴充為標準化 Benchmark 平台，兼具學術 Ground Truth 與一鍵匯出 CTFd 題目之雙重價值。
- 已建立全景規劃藍圖 `benchmark-platform-roadmap-v1.md`，明定 Phase 1~4 的執行順序與驗收準則，防止會話切換時遺忘後續目標。