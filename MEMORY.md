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
- 專案轉型規劃：將 `sec-poc` 從單一退款案例平台升級為「可插拔商業邏輯弱點與 Multi-hunk APR Benchmark 評測套件」（Pluggable Case Benchmark Architecture）。
- 實裝 Case-002（複合審批業務 + 異步 Worker 漏校驗之不可分割 Multi-hunk 案例）。

---

## 🏗️ Architectural Context
- **Project**: POC / sec-poc（商業邏輯漏洞受控評測基準平台）
- **Core Components**:
  - `test-system/`: Node 24 + 內建 `node:sqlite` 零外部依賴測試平台（多角色退款審批、BOLA 弱點與 fixed 模式）
  - `test-system/poc/`: 黑箱 PoC 軌跡腳本（`npm run poc:legal`, `npm run poc:bola`）
  - `test-system/traces/`: JSONL 格式的 request/response 軌跡記錄
  - 核心機制：`npm run reset` / `snapshot` / `restore` / `verify` 一鍵還原受控環境
- **Documents & Deliverables**:
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