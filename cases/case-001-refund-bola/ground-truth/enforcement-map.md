# Enforcement Map（第二年定位用 Ground Truth）

> 更新日期：2026-09-10
> 目的：把每個 API 端點、內部 handler、以及**應存在的安全 predicate** 對齊，作為第二年 Trace-to-CPG 定位的標註依據。

## 1. 對應表

| API（外部） | Handler（內部） | 關鍵層 | 應存在（或缺失）的 predicate | 違規型態 |
| --- | --- | --- | --- | --- |
| `POST /api/login` | `service.login` → `repository.getUserByUsername` | service | `user.password === password` | — |
| `POST /api/refunds` | `service.createRefund` | service | `actor.role === 'customer'`；`amountCents > 0`；`reason 非空` | 角色越權 |
| `GET /api/refunds` | `service.listRefunds` → `repository.listRefundsScoped` | repository | customer：`WHERE owner_id = actor.id`；staff：`WHERE tenant_id = actor.tenant_id` | 列表層 BOLA |
| `GET /api/refunds/:id` | `service.viewRefund` → `refundVisibleTo` | **service + repository** | `owner_id === actor.id`（customer）或 `tenant_id === actor.tenant_id`（staff） | **BOLA（本案例主標的）** |
| `POST /api/refunds/:id/review` | `service.reviewRefund` | service | `role === 'supervisor'`；`tenant 匹配`；`status === 'REQUESTED'` | 狀態跳步／角色越權 |
| `POST /api/refunds/:id/approve` | `service.approveRefund` | service | 同上且 `status === 'REVIEWED'`；`owner_id !== actor.id`（SoD） | SoD／狀態跳步 |
| `POST /api/refunds/:id/reject` | `service.rejectRefund` | service | `status IN (REQUESTED, REVIEWED)` | 狀態跳步 |
| `POST /api/refunds/:id/refund` | `service.executeRefund` | service | `role === 'finance'`；`tenant 匹配`；`status === 'APPROVED'` | 狀態跳步 |
| worker 輪詢 | `worker.runWorkerPass` | worker | `status === 'APPROVED'` 的條件式更新（revalidation） | 替代入口繞過（v2 案例） |

## 2. 本案例（BOLA）的缺失位置

- **vulnerable 模式**（預設）：`service.viewRefund` 在 `enforceOwnership=false` 時直接呼叫 `repository.getRefundById`，跳過 `refundVisibleTo` 的所有權／tenant predicate。
- **fixed 模式**（`--fixed`）：同一條程式路徑補上 `refundVisibleTo`，越權一律回 404。
- 修補對應的 enforcement point：**`repository.getRefundById` 的呼叫端（service.viewRefund）**，屬單一 enforcement point 基線案例。

## 3. 第三年延伸（worker bypass 案例伏筆）

worker 的 revalidation（`worker.runWorkerPass` 中的條件式 `status='APPROVED'` 更新）在 v1 是「已存在且正確」。v2 案例將把它設為缺失（vulnerable 模式直接更新所有 APPROVED），使 ground-truth patch 成為：
1. service 層：`executeRefund` 補狀態檢查（1 hunk）。
2. worker 層：`runWorkerPass` 補 revalidation（另 1 hunk）。

構成不可分割 multi-hunk 的語意責任。