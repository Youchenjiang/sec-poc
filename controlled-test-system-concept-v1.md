# 受控但架構真實的測試系統構想（討論版 v1）

更新日期：2026-09-09  
狀態：候選構想，尚未定案

## 1. 建置目的

本計畫不直接把單一現成弱點專案視為完整研究資料集，而是建立一套可控制、可重現、可取得完整 ground truth，同時保留真實 Web 系統分層與業務複雜度的測試系統。

此系統必須能貫穿三年研究：

1. 第一年：僅從 GUI 操作與可觀察 API traffic 推論行為模型、合法流程與違規 trace。
2. 第二年：把外部 trace 對齊後端程式表示，定位缺失或錯誤的 enforcement predicate。
3. 第三年：產生並驗證可能跨方法、跨模組或跨入口的 multi-hunk 修補。

## 2. 候選業務領域

目前最適合作為第一套受控系統的候選領域為：

> 多角色服務單、審批與退款平台（multi-role service and refund approval platform）

這只是工作假設，仍需經案例選擇程序確認，不代表已經定案。

### 2.1 角色

- Customer：建立服務單、查看自己的資產、提出取消或退款申請。
- Operator／Mechanic：接收並處理被指派的服務單。
- Supervisor：核准高額報價、敏感操作或例外退款。
- Finance Worker：執行已核准的退款，可由同步 API 或非同步工作觸發。
- Tenant Admin：管理同組織成員與資源，但不可存取其他 tenant。

### 2.2 核心資源

- Tenant
- User／Role Assignment
- Vehicle／Managed Asset
- ServiceRequest
- Quote
- Order
- RefundRequest
- ApprovalRecord
- AuditEvent

### 2.3 主要狀態流程

服務單範例：

```text
CREATED → SUBMITTED → ASSIGNED → COMPLETED
```

退款範例：

```text
REQUESTED → REVIEWED → APPROVED → REFUNDED
```

系統應明確定義哪些角色可以促成每個 transition，以及 transition 所需的資源關係、tenant、金額門檻與前置證據。

## 3. 建議架構

不需要為了看起來複雜而建置大量微服務。第一版可採用具有真實責任邊界的模組化後端：

```text
Web UI
  ↓
REST API / Controller
  ↓
Application / Domain Service ── Authorization Policy
  ↓                                  ↓
Repository / Relational DB      Background Worker
```

必要的真實性來自責任與資料流，而不是服務數量。至少應包含：

- 前端 UI 與可攔截的 HTTP API traffic。
- authentication context 與角色／tenant claims。
- controller、domain service、policy、repository 的明確分層。
- 關聯式資料庫與資源 ownership／membership relations。
- 至少一個替代入口，例如舊版 API、批次匯入或背景 worker。
- 可固定初始狀態的 seed data 與可重設環境。
- 可記錄合法及非法 trace 的 instrumentation，但第一年受測方法不得讀取內部資訊。

## 4. 候選案例族群

### 4.1 跨使用者或跨租戶存取

攻擊者替換 `serviceRequestId`、`assetId` 或 `refundId`，讀取或修改不屬於自己的資源。

可能涉及的 enforcement points：

- Controller 是否正確傳遞 authenticated actor 與 tenant。
- Domain service 是否檢查 actor-resource relation。
- Repository query 是否包含 tenant 或 owner constraint。
- Background worker 是否重新驗證訊息所指資源與 tenant。

### 4.2 違法狀態轉移與職責分離

例如申請人不可核准自己的退款，且 `REQUESTED` 不可直接跳到 `REFUNDED`。

可能涉及的 enforcement points：

- API role gate。
- Domain state-transition policy。
- Approval evidence validation。
- Database conditional update／optimistic locking。
- Worker 執行前的重新驗證。

### 4.3 替代入口繞過

正常 UI 經過完整審批，但舊版 API、批次入口或 worker 直接執行敏感操作。

此案例可檢查方法是否只阻擋已知 URL，還是能識別跨入口共享的業務 invariant。

## 5. 應內建的真實業務 invariant

- Actor 必須具備允許的角色。
- Actor、resource 與 tenant 必須具有正確關係。
- 敏感操作只能發生在合法狀態。
- 申請人與核准人必須分離。
- 同一 invariant 必須涵蓋同步與非同步入口。
- 高額或敏感操作必須具備可驗證的 approval evidence。
- 權限拒絕不得洩漏目標資源是否存在。

## 6. Ground truth 與評估資產

每個案例至少要保存：

- 初始資料庫 snapshot／seed。
- 正常 GUI workflow。
- 合法 API trace。
- 一條原始 exploit trace。
- 多條 invariant-preserving exploit variants。
- enforcement predicate 的程式位置。
- vulnerable 與 fixed version。
- ground-truth patch hunks 及其語意責任。
- 功能回歸測試與安全測試。
- 各部分修補的驗證結果。

## 7. 非目標

- 不追求模擬大型企業系統的所有基礎設施。
- 不以漏洞數量取代案例品質。
- 不為了達成 multi-hunk 數量，人為複製相同檢查。
- 不把 UI 測試、格式變更或單純測試檔修改計入核心修補 hunk。
- 不預設所有案例都必須是 multi-hunk；單一 enforcement point 的案例仍可用於第一、二年基線。

## 8. 尚待共同決定

- 是否採用服務／退款領域，或改為文件協作、醫療預約、採購簽核等領域。
- 第一版使用何種後端語言與 framework。
- 是否第一版就加入 background worker。
- 第一批 POC 應選 ownership、workflow 還是 alternate-entry bypass。
- controlled cases 與 real-world cases 的預定比例。

