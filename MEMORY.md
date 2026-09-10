# Agent Persistent Memory

> **Every agent session MUST read this file first** (defined in .agent/rules.md).
> **Every agent session MUST update this file before ending.**

---

## 🔑 User Preferences
- **Language**: 繁體中文 preferred for casual conversation; code/commits in English.
- **Style**: Direct, no fluff. Get things done with high engineering rigor.

---

## 📋 Current Active Tasks
- 發布 GitHub Release `v0.1.0`（受控測試系統 v1 基線）。
- 針對外部審查/詰問（二階段探詢與直接定位的盲區），將測試系統推進至 v2（複合業務流程 + 異步 Worker 漏校驗之不可分割 Multi-hunk 案例）。

---

## 🏗️ Architectural Context
- **Project**: POC（受控測試系統與資安漏洞 PoC 研究）
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
- 準備發布 `v0.1.0` 作為單點 BOLA 基線版本，隨後實裝 v2 複合流程案例。