# Golden Case：未付款出貨

這個零相依 Node.js 範例只驗證計畫的核心論證鏈：合法流程、違規軌跡、安全不變量、後端執行位置與修補後功能保存。

## 情境

- 合法流程：`CREATED → PAID → SHIPPED`
- 違規流程：`CREATED → SHIPPED`
- 安全不變量：`ship(order) ⇒ order.status == PAID`
- 執行位置：所有出貨入口共用的後端 `ship` 邏輯

## 執行驗證

```powershell
node --test .\poc.test.mjs
```

四項測試分別證明：

1. 漏洞版本允許正常付款出貨。
2. 漏洞版本也允許未付款出貨。
3. 修補版本拒絕未付款出貨，訂單保持 `CREATED`。
4. 修補版本仍允許正常付款出貨。

本範例刻意不實作 GUI Agent、CPG 或 LLM 修補。明日報告應將它標示為人工建立的可行性案例，研究目標才是逐年自動化其中的推論與定位工作。
