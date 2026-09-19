# Agent Persistent Memory

> **Every agent session MUST read this file first** (defined in .agent/rules.md).
> **Every agent session MUST update this file before ending.**

---

## 🔑 User Preferences
- **Language**: 繁體中文 preferred for casual conversation; code/commits in English.
- **Style**: Direct, no fluff. Get things done with high engineering rigor.
- **Atomic Commits & Context Separation**: 嚴格落實原子化提交！嚴格區分不同脈絡（純檔案搬移、核心模組抽取、業務邏輯實作、測試斷言、文檔知識庫、CI配置），必須切分在獨立 Commit 上。每個 Commit 嚴格遵循「單一目的原則」並通過「The Revert Test」，禁止跨脈絡混雜或一次性大包裹提交（Mega-commits）。


---

## 📋 Current Active Tasks
- 已完成 `v0.1.0` 基線與 `v0.1.1` CI/CD 安全防護升級發布。
- **Phase 1 架構解耦（Pluggable Refactoring）已完成**：抽取通用 Core 模組，標準化 Case-001 與 CLI Harness。
- **Phase 2 Case-002（複合審批 + 異步 Worker 漏校驗之不可分割 Multi-hunk 案例）已完成**：實裝並通過 8 項消融與 Oracle 測試，全量 17 測試全綠。
- **Phase 3 自動化評測矩陣（Evaluation Harness & Metrics Reporter）已完成**：
  1. 實作 `core/evaluator.mjs`，支援外部 Patch 語法分析、套用預檢、DB 重置與工作區安全還原。
  2. 實作 `core/reporter.mjs`，計算 VRR（漏洞修復率）、RFR（無回歸率）與平均 Hunk 數，支援 Markdown / JSON 跑分報告匯出。
  3. 整合至 CLI（`npm run bench:baseline`、`npm run bench:eval`），完成 Ground Truth 基線評測（VRR 100%, RFR 100%）。
- **當前執行階段：Phase 4 Docker 容器化與 CTFd 實戰靶場匯出（串接 `sec-compendium`）**
  1. 為各案例建立獨立 Dockerfile，支援以環境變數切換 vulnerable/fixed 模式。
  2. 提供匯出工具腳本將案例一鍵打包為 CTFd 題目包（含題目說明、Flag 機制、compose 配置）。

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
- 已完成 Phase 1 重構：解耦出 `core/db-manager.mjs`、`core/trace-recorder.mjs` 與 `core/harness.mjs`，建立 `cases/case-001-refund-bola` 標準契約並通過完整回歸驗證。
- 已完成 Phase 2 攻堅：實裝 `case-002-async-worker-race`，透過消融測試 (Ablation Tests) 嚴格證明了 Hunk 1 (API Guard) + Hunk 2 (Worker CAS Guard) + Hunk 3 (DB 狀態約束) 的不可分割性 (Inseparability)，全量 17 項測試 100% 通過。
- 已完成 Phase 3 評測矩陣：實作外部 Patch 語法與套用分析器 (`evaluator.mjs`)、VRR/RFR 指標計算器與報告生成器 (`reporter.mjs`)，完成 Ground Truth 基線評測並輸出標準 Markdown/JSON 跑分報告。