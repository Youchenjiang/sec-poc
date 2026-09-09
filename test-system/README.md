# 退款審批平台（測試系統 v1）

三年共用的受控測試系統第一版：多角色退款審批平台，零依賴（Node 24 內建 `node:sqlite`），附黑箱操作 GUI。第一年 PoC 以黑箱方式執行合法／違規軌跡，PoC 弄壞狀態後可一鍵還原。

## 快速開始

```bash
npm run reset        # 重建乾淨 DB（db/test.db）
npm start            # 啟動伺服器（預設 vulnerable 模式，http://localhost:3000）
npm run start:fixed  # 啟動 fixed 模式（BOLA 已修補）
npm run start:worker # 啟動背景 worker（替代入口，另開終端）
```

瀏覽器開啟 http://localhost:3000 即可用 GUI 操作（種子帳號見下方）。伺服器在 DB 為空時會自動 seed；也可用 `PORT=3100 npm start` 換埠。

## 恢復機制（PoC 弄壞後的還原）

| 指令 | 作用 |
| --- | --- |
| `npm run reset` | 刪除 `db/test.db` 並從 seed 重建乾淨狀態 |
| `npm run snapshot` | 把目前 DB 存成快照 `db/snapshot.db` |
| `npm run restore` | 用快照一鍵覆蓋回 `db/test.db` |
| `npm run verify` | 跑完整測試套件，確認系統健康 |

建議流程：`npm run reset`（或 `restore`）→ `npm run verify`。測試套件包含「故意弄壞 → 還原 → 驗證恢復」的 round-trip 測試。

## 種子資料

- tenants：`acme`、`globex`。
- 帳號（密碼一律 `secret123`）：
  - customer：`acme-alice`、`acme-bob`、`globex-alice`、`globex-bob`
  - supervisor：`acme-carol`、`globex-carol`
  - finance：`acme-dave`、`globex-dave`
- 退款：id 1（acme/alice，REQUESTED）、id 2（acme/bob，APPROVED）、id 3（globex/alice，REVIEWED）。

## 第一年 PoC 腳本（黑箱）

```bash
npm run poc:legal   # 合法軌跡：建立 → 審核 → 核准 → 退款 → 確認 REFUNDED
npm run poc:bola    # 違規軌跡：掃描 refund id 讀他人退款（同 tenant 與跨 tenant 變形）
```

- 只透過 HTTP 與伺服器互動（不讀原始碼、不碰 instrumentation）。
- 每筆 request/response 記錄成 JSONL：`traces/legal-refund-flow.jsonl`、`traces/exploit-bola.jsonl`（第一行是案例 meta）。
- 資源 id 一律動態取得／掃描，不硬編碼。
- 可指定目標與輸出：`node poc/legal-workflow.mjs --base http://localhost:3100 --out traces/x.jsonl`。

## API

| Method | Path | 說明 |
| --- | --- | --- |
| POST | `/api/login` | `{username, password}` → `{token, user}` |
| GET | `/api/refunds` | 列表（customer 看自己；staff 看 tenant） |
| POST | `/api/refunds` | 建立退款 `{amountCents, reason}`（限 customer） |
| GET | `/api/refunds/:id` | 檢視退款（**BOLA 標的**） |
| POST | `/api/refunds/:id/review` | 審核（REQUESTED→REVIEWED，限 supervisor） |
| POST | `/api/refunds/:id/approve` | 核准（REVIEWED→APPROVED，限 supervisor，SoD） |
| POST | `/api/refunds/:id/reject` | 拒絕（REQUESTED/REVIEWED→REJECTED） |
| POST | `/api/refunds/:id/refund` | 執行退款（APPROVED→REFUNDED，限 finance） |

認證：`Authorization: Bearer <token>`。錯誤：`401` 未授權、`403` 角色／SoD 拒絕、`404` 不存在（越權一律 404 不洩漏存在與否）、`409` 狀態衝突、`400` 驗證失敗。

## 三年架構對應

| 年度 | 需要 | 本系統對應 |
| --- | --- | --- |
| 第一年 | 黑箱 GUI＋可觀測 API、狀態模型、合法／違規 trace、可控初始資料 | GUI＋API；`docs/state-model.md`；`poc/` 與 `traces/`；seed＋reset |
| 第二年 | 完整 source、entry point 對齊、enforcement predicate 標註、跨層 trace | `src/` 分層（routes→service→repository＋worker）；`ground-truth/enforcement-map.md` |
| 第三年 | vulnerable/fixed 版本、exploit＋變形＋合法流程測試、multi-hunk 判準 | `--fixed` 旗標；測試套件；v2 起加入 worker-bypass multi-hunk 案例 |

## 測試

```bash
npm run verify   # node --test test/system.test.mjs
```

涵蓋：seed 完整性、合法流程、狀態機非法轉移、SoD／角色、vulnerable BOLA 成功、fixed BOLA 被拒（含跨 tenant 變形與無洩漏）、fixed 無功能回歸、worker revalidation、reset round-trip。

## 注意事項

- 開發用測試系統：密碼為明碼、token 無過期，僅供受控環境使用。
- `node:sqlite` 在 Node 24 仍屬 experimental（啟動會印警告），功能已驗證可用。
- API 回應欄位沿用資料庫 snake_case（如 `amount_cents`、`tenant_id`）。
- `db/` 與 `traces/` 為執行期產物（見 `.gitignore`）。