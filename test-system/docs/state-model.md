# 退款審批平台：業務狀態模型（Ground Truth Spec）

> 更新日期：2026-09-10
> 狀態：v1 定案。此文件是系統**應有**的行為規格，也是第一年「行為模型推論」的比對真值與第二年 enforcement predicate 的來源。

## 1. 角色與 tenant

| 角色 | 職責 | 可觸發的敏感操作 |
| --- | --- | --- |
| `customer` | 建立退款申請、查閱自己的退款 | create_refund |
| `supervisor` | 審核、核准或拒絕退款 | review / approve / reject |
| `finance` | 執行已核准的退款 | refund（手動入口） |
| 背景 `worker` | 輪詢執行已核准退款（替代入口） | refund（byWorker=true） |

- 所有使用者都屬於一個 tenant（`acme`／`globex`）。
- 跨 tenant 存取一律不允許；拒絕時回 404，避免洩漏資源是否存在。

## 2. 核心資源

- `refund_request`：退款申請。欄位含 owner（customer）、amount_cents、reason、status。
- `approval_record`：每次審批動作的證據（review／approve／reject／refund）。
- `audit_event`：所有敏感操作的稽核軌跡（含被拒絕的嘗試）。

## 3. 狀態機

```text
             review                approve                refund（finance / worker）
REQUESTED ──────────► REVIEWED ──────────► APPROVED ──────────────► REFUNDED
    │                    │
    │ reject             │ reject
    └──────► REJECTED ◄──┘
```

| 轉移 | 前提狀態 | 允許角色 | 額外不變量 |
| --- | --- | --- | --- |
| review | REQUESTED | supervisor（同 tenant） | — |
| approve | REVIEWED | supervisor（同 tenant） | 申請人不可核准自己（SoD） |
| reject | REQUESTED 或 REVIEWED | supervisor（同 tenant） | — |
| refund | APPROVED | finance（同 tenant）或 worker | worker 執行前必須重新驗證狀態仍為 APPROVED（revalidation） |

非法轉移（例如 REQUESTED 直接 REFUNDED、跳過 review 直接 approve）回 `409 STATE_CONFLICT`，狀態不變。

## 4. 安全不變量（v1）

1. **所有權與 tenant 隔離（BOLA）：** customer 只能讀自己的退款；supervisor／finance 只能讀同 tenant 的退款。違反時回 404。
2. **狀態轉移合法性：** 只有上述合法轉移能被執行，其餘一律 409。
3. **職責分離（SoD）：** 申請人與核准人必須分離（本系統以角色分隔 customer／supervisor 達成；service 層另有 owner≠approver 防線）。
4. **替代入口一致：** 手動 refund 與 worker 執行共用同一狀態前提（APPROVED），worker 以條件式更新防止重複執行。
5. **無存在洩漏：** 越權讀取一律 404 `NOT_FOUND`，不洩漏目標資源是否存在。

## 5. 種子資料（決定性）

- 2 tenants：`acme`、`globex`。
- 每 tenant：2 customers（`-alice`、`-bob`）、1 supervisor（`-carol`）、1 finance（`-dave`）。密碼一律 `secret123`。
- 退款：
  - id 1：acme／alice 的退款，`REQUESTED`（可作為合法流程起點）。
  - id 2：acme／bob 的退款，`APPROVED`（可被 worker 或 finance 執行）。
  - id 3：globex／alice 的退款，`REVIEWED`（跨 tenant 探測標的）。

## 6. 與三年研究之對應

- 第一年：黑箱可觀察的正是此狀態機（GUI＋API 流量），PoC 產出合法／違規 trace 與此 spec 比對。
- 第二年：`ground-truth/enforcement-map.md` 把每個不變量對齊到程式位置（service predicate／repository scoping）。
- 第三年：修補目標 = 讓不變量在 vulnerable 模式也成立；本 spec 是功能保存驗證的參照。