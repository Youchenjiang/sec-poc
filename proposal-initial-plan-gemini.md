### 計畫核心主軸與科學問題串聯

本計畫以「行為模型推論（Behavior Inference） $\to$ 防禦缺失定位（Enforcement Localization） $\to$ 約束引導修補（Constraint-Guided Repair）」為貫穿三年的核心架構，將第一年產出的「業務狀態模型（Behavioral Security Model）與違規軌跡（Exploit Trace）」升格為跨年度的核心中介資產（Artifact）。

* **第一年（Year 1 - Red Team）：** 學出外部系統「合法應有與非法不應有的行為邊界」（What behavior should and should not occur）。
* **第二年（Year 2 - Blue Team）：** 將黑箱違規行為對齊後端程式碼結構，精確診斷後端「何處遺漏了安全約束執行機制」（Where the backend failed to enforce it）。
* **第三年（Year 3 - Defense）：** 依據安全不變量與呼叫依賴，自動合成跨檔案補丁並進行三層嚴格驗證（Synthesizes and validates the missing enforcement）。

---

### 第一年：紅隊 —— 純黑箱 GUI 自主探索與業務狀態模型推論

**測試視角與邊界界定**

* **測試型態：** 100% 純黑箱。
* **嚴格限制邊界：**
* 嚴格禁止存取前端、App 或後端原始碼。
* 不進行 App 反編譯（Decompilation）、JavaScript Bundle 靜態分析、Bytecode 分析或任何後端分析。
* 僅允許使用一般使用者可觀察的 GUI 畫面、Runtime UI Automation / Accessibility Tree，以及由 GUI 操作實際觸發產生之網路請求與回應。


* **環境假設：** 網路流量之可觀測性屬於受控實驗環境之基本假設（例如：於受測客戶端配置測試代理憑證以監聽明文流量）；不透過二進位竄改（Binary Patching）、逆向工程或 Client Instrumentation 來刺探未曝光之隱藏介面。

**核心研究問題**

* **能否僅憑 GUI 操作互動與可觀測之 API 流量，自動推論系統的業務 Workflow / State Model，並自動生成違反模型的攻擊序列？**

**核心研究內容**

* **基於語意感知之正常業務狀態模型推論（Behavioral Model Inference）**
* 透過 UI Hierarchy 與視覺文字辨識（OCR/Layout Analysis），推導功能模組與操作意圖。
* 揚棄無目的隨機點擊（Monkey Testing），採「目標導向策略」遍歷業務流程，建立 API 呼叫序列與系統狀態轉換模型（例如：`CREATED` $\to$ `PAID` $\to$ `CONFIRMED` $\to$ `SHIPPED`）。


* **工作流程擾動測試與違規攻擊序列生成（Workflow Perturbation Testing）**
* 側聽並解析正常操作產生的 HTTP/API 請求序列。
* **跳步與狀態繞過（CWE-425 / CWE-841）：** 破壞狀態機依賴關係（例如：跳過付款直接請求出貨 `CREATED` $\to$ `SHIPPED`），檢驗後端是否缺乏流程校驗。
* **授權邊界違規（CWE-840 / IDOR）：** 在合規序列中抽換物件識別碼或憑證上下文，並以 GUI 渲染差異或 API 回傳狀態作為攻擊成功的自動化判定依據。
* **伴隨缺陷探測：** 捕捉異常重導向（CWE-601）與高頻併發操作下的競爭條件（CWE-362）。



**交付產出**

* 外部推論所得之**業務狀態轉換模型**。
* 包含完整 UI 操作軌跡（UI Trace）、異常 API 封包序列與高重現性之**自動化攻擊驗證腳本（PoC）**。

---

### 第二年：藍隊 —— 後端 API 原始碼之 Trace-to-CPG 對齊與缺失防禦定位

**測試視角與邊界界定**

* **測試型態：** 白箱靜態/動態分析。
* **審查標的：** 嚴格限制於**後端 API 伺服器端原始碼**（Controller、Service、Middleware、Domain Model、DAO/ORM 等）。前端與 App 僅視為黑箱攻擊的流量發起源，不納入白箱審查範疇。

**核心研究問題**

* **能否將黑箱 Exploit Trace 與後端 CPG 進行拓撲對齊，精準辨識造成違規行為的 Missing / Incorrect Enforcement Predicate？**

**核心研究內容**

* **後端專案級程式碼屬性圖（CPG）構建**
* 解析後端原始碼，構建融合 AST（語法）、CFG（控制流）與 PDG（程式依賴）之全專案 CPG。
* 建立各 API 端點至內部業務邏輯函式、資料庫存取層之跨函式拓撲調用鏈。


* **黑箱軌跡引導之切片與缺失防禦判定（Trace-to-CPG Alignment & Missing-Guard Analysis）**
* **突破傳統污點分析瓶頸：** 業務邏輯與越權漏洞通常缺乏典型 `Source -> Sink` 的惡意污點傳遞（例如：缺少 `paymentStatus == PAID` 檢查，或查詢個人資料時缺少 `requestedUserId == authenticatedUserId` 校驗，參數本身均為合法型態）。
* 將研究重點由單純的污點追蹤，提升為**控制路徑分歧分析與缺失防禦判定（Missing-Guard Analysis）**：
1. **路徑對齊：** 將第一年採集的「正常 Workflow Trace」與「攻擊 Exploit Trace」投影至後端 CPG 上，找出控制流發生不當分歧的臨界節點。
2. **支配關係分析（Dominator Analysis）：** 判定對敏感資料操作或狀態轉移的底層呼叫，其前置路徑上是否缺少支配該操作（Dominating）的驗證述詞（Predicate）。
3. **責任歸屬劃分：** 判定該驗證機制應位於 Middleware（全域過濾）、Controller（身分綁定）抑或 Service/Domain（業務狀態機校驗）。




* **需修復函式多維度風險矩陣建置**
* 結合**靜態呼叫扇入度（Call Fan-in）**、**動態 Trace 覆蓋頻率**、**敏感資料可達性（Reachability）**與**權限邊界影響範圍**，量化受影響函式的修復優先級與依賴深度。



**交付產出**

* 後端 API 漏洞根因定位報告（包含對齊之切片圖、精確檔案路徑、函式名，以及所缺失的安全斷言/述詞定義）。
* 後端需修復函式多維度風險矩陣。

---

### 第三年：防禦 —— 後端 API 專案級約束引導 Multi-Hunk 自動修補與三層驗證

**測試視角與邊界界定**

* **測試型態：** 白箱自動化程式修復（APR）。
* **修復標的：** 嚴格限制於**後端 API 伺服器端原始碼**。
* **安全性目標：** 修正後端服務邏輯，**使系統安全性不再依賴前端流程限制；即使攻擊者繞過 GUI 正常操作流程，關鍵授權與業務狀態約束仍由後端強制執行（Backend-Enforced Security Invariants）**。

**核心研究問題**

* **能否利用 Exploit Trace、Security Invariant 與 Code Dependency，自動規劃跨函式修補（Multi-Hunk），且同時阻斷攻擊並完整保存合法 Workflow？**

**核心研究內容**

* **後端 Multi-Hunk 複合型修復基準資料集**
* **開源採集：** 擷取真實開源後端專案中涉及跨檔案、跨函式聯合修改的業務邏輯 CVE 補丁。
* **合成生成：** 依據前兩年歸納之狀態遺漏與權限缺失模式，構建具備真實調用依賴的 Multi-Hunk 變異評測集。


* **安全不變量與約束引導的 Agentic 修補規劃**
* 商業邏輯修復通常無法單點完成（例如：Middleware 新增鑑權攔截、Service 補足狀態機條件檢查、Controller 調整錯誤回應）。
* 設計以 LLM 為核心的修復 Agent，結合第二年產出的「CPG 調用依賴」與「缺失安全斷言（Security Invariant）」，規劃修復序列並產生跨檔案修改補丁（Multi-Hunk Patch）。


* **三層閉環反饋驗證機制（Three-Tier Closed-Loop Verification）**
* 徹底摒棄「單純阻斷 PoC 即判定成功」的脆弱評估（防止 Agent 產生直接回傳 `403 Forbidden` 的無效退化補丁），建立三層驗證指標：
1. **安全性驗證（Security Validity）：** 第一年產出的原始 Exploit Trace 必須被有效阻斷。
2. **泛化防禦驗證（Exploit Generalization）：** 對 Exploit 進行等價變異（如抽換受害者 Object ID、排列組合跳步順序、變換不同 API 入口路徑），確認漏洞被根除而非僅過度配適（Overfitting）單一特徵。
3. **功能保全驗證（Functional Preservation）：** 第一年萃取之合法 Workflow 序列必須保持成功執行，且專案既有的 Unit/Integration Tests 必須全數通過，確保系統零功能回歸（No Regression）。





**交付產出**

* 專案級 Multi-Hunk 後端自動修復 Agent 系統。
* 複合型業務邏輯修補評測資料集。
* 串聯三年「行為推論 $\to$ 根因定位 $\to$ 三層驗證修補」之完整閉環實證成果。

---

### 邊界與跨年度職責分工總覽

| 維度 | 第一年（紅隊：探測） | 第二年（藍隊：診斷） | 第三年（防禦：修復） |
| --- | --- | --- | --- |
| **核心定位** | **行為模型推論（Behavior Inference）** | **防禦缺失定位（Enforcement Localization）** | **約束引導修補（Constraint-Guided Repair）** |
| **主打科學問題** | 能否只從 GUI 行為與可觀測 API Trace，自動推論業務 Workflow/State Model，並發現違反模型的攻擊序列？ | 能否將黑箱 Exploit Trace 對齊後端 CPG，辨識造成違規行為的 Missing/Incorrect Enforcement Predicate？ | 能否利用 Exploit Trace、Security Invariant 與 Code Dependency，自動規劃跨函式修補，且同時阻斷攻擊與保存合法 Workflow？ |
| **程式碼接觸邊界** | **100% 純黑箱**<br>

<br>完全不接觸任何前端、App 或後端程式碼；不進行反編譯或二進位修改。 | **白箱（僅限後端 API 原始碼）**<br>

<br>不審查前端與 App 程式碼，僅分析後端服務與資料庫調用層。 | **白箱（僅修補後端 API 原始碼）**<br>

<br>僅修改後端程式，使安全性不依賴前端限制；不修改前端介面。 |
| **輸入來源** | 運行中之 App/Web GUI 與受控代理流量。 | 第一年之**狀態模型 + Exploit Trace** + 後端 API 原始碼。 | 第二年之**缺失斷言 + 風險矩陣** + 第一年之合法/非法 Trace + 後端原始碼。 |
| **核心技術方法** | GUI 語意感知探索、工作流程擾動測試、狀態轉換模型推論。 | 專案級 CPG 建模、Trace-to-CPG 對齊、Missing-Guard 程式切片分析。 | Multi-Hunk Agentic 修補規劃、安全不變量注入、三層閉環驗證機制。 |
| **核心產出** | 業務狀態轉換模型、違規 API 序列、重現 PoC 腳本。 | 後端 CPG 圖、缺失驗證述詞分析、需修復函式風險矩陣。 | Multi-Hunk 修復 Agent、跨檔案補丁、三層驗證評估報告。 |
