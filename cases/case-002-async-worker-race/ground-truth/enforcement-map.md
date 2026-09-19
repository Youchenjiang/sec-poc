# Case-002: 守衛節點對齊與不可分割 Multi-hunk 真值標記 (Ground Truth Enforcement Map)

## 📌 1. 漏洞概念與弱點鏈 (Vulnerability Chain)

在企業級非同步處理系統中，同步 HTTP 介面與非同步排程 Worker 之間的狀態一致性往往高度依賴資料庫原子鎖定。
本案例模擬了一套真實的多角色退款審批系統：

1. **正常業務期望**：
   - 訂單必須處於 `APPROVED` 狀態方可由背景出納 Worker 執行匯款並轉為 `REFUNDED`。
   - 若客戶在匯款執行前申請取消（`CANCELLED`），系統應停止出納並保留款項。

2. **脆弱狀態（Vulnerable Mechanism）**：
   - **時間檢查到時間使用漏洞（TOCTOU）**：Worker 拉取 `status = 'APPROVED'` 的訂單後，在呼叫第三方金流 API 模擬期間，客戶透過 HTTP 發起 `/api/refunds/:id/cancel`。
   - **缺失守衛條件（Missing-Guard in Worker）**：Worker 完成金流扣款後，未以條件原子寫入驗證訂單狀態是否仍為 `APPROVED`，直接執行 `UPDATE ... SET status = 'REFUNDED'`，覆蓋了客戶的 `CANCELLED` 狀態，導致款項已退、狀態錯亂。

---

## 📌 2. 三層不可分割 Multi-hunk 補丁規範

```text
Hunk 1: API 入口互斥鎖定 (src/server.mjs)
   └── 檢查 version / payout_locked_at，若已被 Worker 鎖定出納中則拒絕取消

Hunk 2: 異步 Worker 原子 Compare-and-Swap (src/worker.mjs)
   └── 扣款前原子搶鎖：UPDATE ... SET payout_locked_at = ? WHERE status = 'APPROVED' AND version = ?

Hunk 3: 資料庫樂觀鎖欄位與約束 (src/db.mjs)
   └── 增加 version 與 payout_locked_at 欄位
```

### 不可分割性證明（Proof of Inseparability）
- **僅修 Hunk 1 (API)**：缺少 Hunk 2，Worker 不會預先標記鎖定，API 檢查無效，Race 依然發生。
- **僅修 Hunk 2 (Worker)**：缺少 Hunk 1，即使 Worker 檢測到取消，API 仍允許客戶重複提交無效取消請求，引發語意狀態混亂。
- **僅修 Hunk 3 (DB)**：缺乏應用層邏輯支援，欄位未更新，毫無防護效果。
