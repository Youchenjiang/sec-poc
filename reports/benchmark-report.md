# 📊 Benchmark Suite 評測矩陣跑分報告 (Evaluation Report)

> **產生時間**：2026-09-19T07:00:17.350Z  
> **評測目標**：Ground Truth Fixed Baseline  
> **評測案例數**：2 案例

## 📈 一、 核心評測指標 (Evaluation Metrics)

| 指標名稱 (Metric) | 數值 (Value) | 學術定義 (Academic Definition) |
| :--- | :--- | :--- |
| **Vulnerability Remediation Rate (VRR)** | **100%** (2/2) | 成功封堵目標弱點且阻斷 PoC 攻擊之比例 |
| **Regression-Free Rate (RFR)** | **100%** (2/2) | 修補後原有業務功能 Oracle 測試全數通過之比例 |
| **Average Hunk Count** | **2** | 每案例平均不可分割補丁區塊 (Hunks) 數量 |
| **Total Evaluation Latency** | **1644 ms** | 完整評測與回歸執行總耗時 |

---

## 📋 二、 各案例詳細明細表 (Case Breakdown)

| 案例識別碼 (ID) | 案例標題 (Title) | 評測狀態 | 補丁 Hunk 數 | 測試通過數 | 耗時 |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `case-001-refund-bola` | 多角色退款審批平台之 BOLA 越權漏洞 | 🟢 **PASS** | 1 | 9 / 9 | 881ms |
| `case-002-async-worker-race` | 複合審批異步出納之條件競爭與漏校驗 (TOCTOU & Missing-Guard) | 🟢 **PASS** | 3 | 8 / 8 | 763ms |

---
*Report generated automatically by `sec-poc` benchmark evaluation harness.*
