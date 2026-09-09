# 案例選擇與 Multi-hunk 判準（討論版 v1）

更新日期：2026-09-09  
狀態：選案規則草案，尚未選定第一個正式案例

## 1. 選案原則

候選案例不能只因為「看起來像漏洞」或「patch 有兩段 diff」就納入。案例至少要能回答：

1. 外部行為是否足以形成可推論的 actor-resource-action-state 關係？
2. 是否同時存在合法流程與違規流程？
3. 違規是否能表達為缺失或錯誤的業務 invariant？
4. 後端是否存在可定位的 enforcement point？
5. 修補是否自然需要跨語意責任，而不是人為拆分？
6. 是否可重現、重設並自動驗證？

## 2. 三年需求檢核

### 第一年：Behavior Inference

必要條件：

- 有可操作 GUI 或等價使用者介面。
- 能記錄 observable HTTP request／response。
- 至少有兩個身份、角色或 tenant。
- 有一條合法 happy path。
- 有一條與 happy path 僅差少數操作的違規 trace。
- 可控制初始資料與重複執行。
- 測試方法不需要讀取 source code 或 server instrumentation。

### 第二年：Enforcement Localization

必要條件：

- 可取得完整 backend source。
- 可建置 CPG 或其他跨程序程式表示。
- 能把外部 API operation 對齊 entry point。
- 能標註 critical operation 與預期 enforcement predicate。
- 最好包含跨 controller、service、policy、repository 或 worker 的 trace。
- Ground truth 不應只有一個 fixing commit URL，還要有人工作業確認。

### 第三年：Multi-hunk Repair

必要條件：

- 有 vulnerable 與 fixed version。
- 有原始 exploit、變形 exploit 與合法流程測試。
- Ground-truth patch 至少包含兩個語意必要 hunk。
- 可測試所有必要 hunk 的 proper subsets。
- 完整修補能通過安全與功能驗證。
- 修補不能只靠硬編碼已知 ID、URL 或測試輸入。

## 3. 真正 Multi-hunk 的操作型定義

令 ground-truth patch 為：

```text
H = {h1, h2, ..., hn}, n ≥ 2
```

案例只有在以下條件成立時，才標為 indivisible multi-hunk：

1. 套用完整 `H` 後，所有 security 與 functionality tests 通過。
2. 對每個被判定為必要的 hunk，移除該 hunk 後至少有一項安全或功能性 postcondition 失敗。
3. 若計算成本允許，驗證所有 proper subsets `S ⊂ H` 均不能完整通過。
4. 各必要 hunk 應具可說明的語意責任，而非 formatting、rename 或僅修改測試。

### 3.1 可接受的跨 hunk 語意責任

- Authentication／tenant context propagation。
- Authorization／ownership policy enforcement。
- State-transition validation。
- Repository query scoping。
- Atomic conditional update／race prevention。
- Alternate API entry point enforcement。
- Background worker revalidation。
- Consistent error／rollback behavior，前提是它對安全 postcondition 必要。

### 3.2 不應計入核心 hunk

- 純格式修改。
- 無關 refactoring。
- 文件與註解。
- 只為測試而加的 fixture。
- 同一行為檢查的人為複製。
- 只修改錯誤訊息但不改變 enforcement semantics。

## 4. 必備測試集合

每個案例至少要有三層驗證：

### Layer A：阻擋原始 exploit

重播最初發現的違規 trace，確認敏感狀態沒有發生，且回應不洩漏額外資訊。

### Layer B：泛化到 exploit variants

改變下列元素但保持相同違規 invariant：

- actor 或 tenant。
- resource identifier。
- API version／route。
- 操作順序。
- 同步／非同步入口。
- request encoding 或可選欄位。

### Layer C：保留合法 workflow

驗證：

- 合法 owner／role 仍可操作。
- 完整審批流程仍可完成。
- 跨 tenant 的合法隔離維持。
- retry／idempotency 行為未被破壞。
- worker 與前景 API 的一致性維持。

## 5. 案例候選評分表

每項以 0、1、2 分評估：

| 面向 | 0 分 | 1 分 | 2 分 |
|---|---|---|---|
| GUI／API 可觀察性 | 無完整流程 | 只有 API 或不穩定 UI | GUI 與 API 均可重播 |
| 角色與資源關係 | 單一身份 | 有角色但關係簡單 | 多角色／tenant／ownership |
| 狀態性 | 單一 request | 短 sequence | 明確 state machine |
| 合法／非法配對 | 只有 exploit | 可人工建立 happy path | 成對 trace 可自動重播 |
| 定位難度 | 單一明顯函式 | 跨方法 | 跨模組／入口／worker |
| Multi-hunk 真實性 | 人工拆分 | 多 hunk 但可部分修好 | proper subsets 皆不完整 |
| 驗證完整性 | 無自動測試 | 只有 PoC | exploit、variants、legal flows |
| 可重現性 | 無法建置 | 需大量人工設定 | 容器化、可 seed／reset |
| 授權清晰度 | 不可確認 | 僅部分清晰 | 可改編且 attribution 明確 |
| 三年串聯性 | 只支援一年 | 支援兩年 | 同案例可貫穿三年 |

建議：

- 16–20 分：優先 POC。
- 12–15 分：補齊缺口後再評估。
- 0–11 分：只作為單年度 baseline 或排除。

## 6. 第一批候選案例族群

| 案例族群 | 第一年 | 第二年 | 第三年 | 主要風險 |
|---|---:|---:|---:|---|
| 跨 owner／tenant BOLA | 高 | 高 | 中 | 修補可能只需單一 policy hunk |
| 審批與狀態轉移違規 | 高 | 高 | 高 | 需避免把規則設計得過度人工化 |
| 替代 API／worker 繞過 | 高 | 高 | 高 | 環境與 trace orchestration 較複雜 |
| Mass assignment | 中 | 中 | 中 | 容易退化成 DTO allowlist 單點修補 |
| Coupon／rate-limit abuse | 高 | 中 | 低至中 | localization ground truth 可能不唯一 |
| 傳統 injection／XSS | 中 | 高 | 中 | 不符合本計畫 behavior-invariant 主軸 |

## 7. 建議選案順序

1. 先用 ownership／tenant BOLA 建立最小端到端 pipeline，確認三年介面能串接。
2. 再以審批與狀態轉移案例建立第一個主要研究案例。
3. 第三個加入 alternate endpoint 或 worker，使修補自然跨入口與模組。
4. 最後再從 VulnGym、Vul4J、PatchEval 或 CVEfixes 選取真實專案案例檢查外部效度。

第一個工程 POC 不一定要是最終最困難的 multi-hunk 案例；它的任務是驗證資料格式、trace 蒐集、定位與修補驗證介面。正式研究主案例則必須通過完整 multi-hunk 判準。

## 8. 對外論述邊界

目前可以主張：

- 已界定受控系統必備的行為、程式與驗證資產。
- 已盤點可供 workflow、trace、repair 與 multi-hunk 方法參考的公開來源。
- 已提出避免人為 multi-hunk 的可檢驗標準。

目前不應主張：

- 已選定最終業務案例。
- 已證明任何既有弱點是不可分割 multi-hunk。
- 已決定直接改編某個上游專案。
- 已完成資料集授權與可重現性審查。

