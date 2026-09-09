# 可參考或改編的資料集盤點（調查版 v1）

更新日期：2026-09-09  
狀態：初步盤點；實際採用前仍須逐案確認授權、可重現性與研究切分

## 1. 初步結論

目前沒有單一資料集同時包含 GUI workflow、合法／非法 trace、後端完整程式、精確 enforcement location、不可分割 multi-hunk patch，以及合法流程回歸測試。

因此建議採取分層來源策略：

1. 系統與 workflow 參考：OWASP crAPI、OWASP Juice Shop。
2. 真實 business-logic vulnerability 與 code trace：VulnGym、BolaRay。
3. 真實 security patch 候選挖掘：CVEfixes、Vul4J、PatchEval-Verified。
4. multi-hunk 定義與分層：CatenaD4J、HUNK4J。
5. API sequence generation baseline：RESTler。

## 2. 優先來源

### 2.1 OWASP crAPI

來源：[OWASP crAPI](https://github.com/OWASP/crAPI)／[Architecture](https://github.com/OWASP/crAPI/blob/develop/docs/crAPI_architecture.md)／[Happy Path](https://github.com/OWASP/crAPI/blob/develop/docs/happy-path.md)／[Challenges](https://github.com/OWASP/crAPI/blob/develop/docs/challenges.md)

可利用內容：

- 有可操作 Web UI、API、Docker 與完整 happy path。
- 情境包含 vehicle、mechanic report、order、coupon 與 refund。
- 已包含 BOLA、BFLA、mass assignment、shadow API 與 business-flow abuse 等挑戰。
- 可參考其角色、資源、正常操作與攻擊操作的對照方式。

限制：

- 架構文件明確表示它概念上模擬 microservices，但技術上相對簡化。
- 現有 challenge 並未提供不可分割 multi-hunk ground truth。
- 不宜直接把所有 crAPI 挑戰當成三年 benchmark。

建議用途：第一年 GUI／API workflow 與受控系統情境的主要參考。

### 2.2 VulnGym v0.1.4

來源：[VulnGym](https://github.com/Tencent/VulnGym)／[Schema](https://github.com/Tencent/VulnGym/blob/main/SCHEMA.md)

目前公開內容：

- 184 個 advisories、408 個 reachable entry points。
- 393／408 entries 已經人工確認，涵蓋至少一筆人工確認 entry 的 advisories 為 178／184。
- 每筆可包含 repository、vulnerable commit、entry point、critical operation 與跨模組 trace。
- 131／184 advisories 被歸為 business-logic vulnerabilities。
- 細分類包含 broken authorization、missing authorization、workflow violation、multi-tenant isolation、mass assignment 等。
- VulnGym 資料集本身採 CC BY 4.0；其引用的上游程式碼仍服從各原始專案授權。

限制：

- 目標是 white-box vulnerability hunting，不提供 GUI happy path。
- 不直接提供成對合法／非法 workflow trace。
- 不以 patch generation 或 multi-hunk repair 為主要 ground truth。

建議用途：

- 第二年 `entry point → trace → critical operation` 的真實案例來源。
- 篩選適合改編成受控案例的 authorization、workflow 與 tenant-isolation 模式。
- 評估 localization 是否能跨模組，而非只猜 vulnerable file。

### 2.3 BolaRay

來源：[CCS 2024 paper](https://leehaofeng.github.io/papers/2024-BolaRay.pdf)／[Zenodo artifact](https://zenodo.org/records/13744942)

可利用內容：

- 論文分析 101 個真實 BOLA vulnerabilities。
- 聚焦 database-backed applications 中的 object relation 與 authorization checks。
- Artifact 公開工具、benchmark applications 與實驗腳本，可用於重現論文實驗。

限制與風險：

- Zenodo 頁面目前未清楚列出 license。
- 需進一步確認 101 案例的原始標註是否完整公開，以及哪些部分可以再散布或改編。

建議用途：authorization invariant taxonomy 與第二年 predicate ground truth 的設計參考；授權確認前不直接納入重新散布的 benchmark。

## 3. 修補與驗證來源

### 3.1 PatchEval-Verified

來源：[PatchEval](https://github.com/bytedance/PatchEval)

可利用內容：

- 230 個 Go、JavaScript、Python CVE cases。
- 提供 Docker image、reference patch metadata 與 `fix-run.sh` 驗證入口。
- 驗證同時關注 exploitation 是否仍成立與功能是否維持。
- Repository 採 Apache License 2.0；各案例對應的上游專案仍須個別確認。

限制：

- 通常沒有 GUI、使用者角色與完整合法 workflow。
- 強化後的 PoC 甚至可能讓原始 reference fix 失敗，因此不能把 upstream patch 自動視為完整正解。

建議用途：第三年 sandbox packaging、修補執行協定與 security／functionality validation 的參考。

### 3.2 Vul4J

來源：[Vul4J](https://github.com/tuhh-softsec/vul4j)

可利用內容：

- 真實 Java vulnerabilities、human patches 與 PoV tests。
- 適合重現 vulnerable／fixed versions，並研究 security tests。

限制：

- 多數案例不提供 GUI workflow、multiple identities 或合法／非法 trace pairs。
- 必須另行篩選 business-logic、access-control 與 multi-hunk cases。

建議用途：第三年外部效度與 Java repair evaluation 候選池。

### 3.3 CVEfixes

來源：[CVEfixes](https://github.com/secureIT-project/CVEfixes)

可利用內容：

- 以關聯式結構保存 CVE、fixing commit、file 與 method changes。
- 適合挖掘跨檔案、跨方法的真實 security fixes。

限制：

- fixing commit 可能混入非安全相關修改。
- 通常沒有可直接執行的 PoC、GUI trace 或語意 postcondition。
- 每個上游 repository 的授權與可建置性不同。

建議用途：只作為候選 patch mining pool，不直接作為 runnable benchmark。

## 4. Multi-hunk 方法來源

### 4.1 CatenaD4J

來源：[CatenaD4J](https://github.com/universetraveller/CatenaD4J)

可利用內容：

- 收錄 204 個由 Defects4J 隔離出的 indivisible multi-hunk bugs，另有 minimized-test 版本。
- 核心概念是所有必要 hunks 必須共同修復問題；只套用部分 hunks 不構成完整修補。
- Repository 採 MIT License。

限制：

- 主要是一般程式錯誤，不是 business-logic security vulnerabilities。

建議用途：借用其 indivisibility 定義、部分 patch 驗證與 minimized tests 方法，不直接把案例當作核心安全資料集。

### 4.2 HUNK4J

來源：[Characterizing Multi-Hunk Patches](https://arxiv.org/abs/2506.04418)

可利用內容：

- HUNK4J 包含 372 個真實 multi-hunk defects。
- 從 hunk divergence、spatial proximity／dispersion 描述 multi-hunk 難度。

限制：

- 並非專門針對 security 或 business-logic vulnerabilities。

建議用途：建立案例分層，避免把相鄰、同質的多處修改與跨模組、異質的修補混為一談。

## 5. 補充參考

### 5.1 OWASP API Security Top 10

- [Broken Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)
- [Unrestricted Access to Sensitive Business Flows](https://owasp.org/API-Security/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows/)

用途：定義弱點類型與威脅情境；它是 taxonomy，不是資料集。

### 5.2 RESTler

來源：[RESTler: Stateful REST API Fuzzing](https://www.microsoft.com/en-us/research/publication/restler-stateful-rest-api-fuzzing/)

用途：以 OpenAPI 推論 producer-consumer dependencies 並產生 stateful request sequences，可作為第一年的 API sequence baseline；它本身不提供 business-security oracle。

## 6. 初步採用分級

### 優先導入研究流程

- crAPI：workflow 與系統情境參考。
- VulnGym：真實跨模組弱點 trace 與案例挖掘。
- CatenaD4J：不可分割 multi-hunk 判準。
- PatchEval：容器化修補驗證方法。

### 需進一步確認後再採用

- BolaRay：artifact license 與可散布範圍。
- CVEfixes：逐案 reproduction 與 upstream license。
- Vul4J：符合 business logic／multi-hunk 的實際案例數。
- HUNK4J：資料取得方式與適合的 difficulty dimensions。

### 不建議單獨作為核心 benchmark

- crAPI 或 Juice Shop 的全部 challenge。
- 只有 patch diff、沒有 executable tests 的 CVE commit collection。
- 只有 API request、沒有 actor/resource/state ground truth 的 traffic corpus。

## 7. 建議的組合方式

```text
crAPI 類 workflow 與 UI/API 形式
        +
VulnGym / BolaRay 的真實 invariant 與跨模組 trace
        +
CatenaD4J / HUNK4J 的 multi-hunk 判準與難度分層
        +
PatchEval / Vul4J 的可執行驗證方式
        ↓
受控、可重現、可量化的研究案例集合
```

## 8. 下一輪資料調查事項

- 下載前先確認 BolaRay artifact 的 license 與檔案內容。
- 對 VulnGym 的 67 個 authorization／workflow／tenant 類 advisories 做第一輪 metadata filtering，而非立刻複製程式碼。
- 從 CVEfixes、Vul4J、PatchEval 篩出實際跨方法或跨檔案 security fixes。
- 記錄每個候選案例的 upstream license、build status、PoC、合法 workflow 與 patch hunks。
- 在形成正式 benchmark 前建立 train／development／evaluation 的 project-disjoint split。

