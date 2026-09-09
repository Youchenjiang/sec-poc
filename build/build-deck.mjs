import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "C:/Users/g1014308/Documents/GitHub/Youchen/POC";
const SKILL_DIR = "C:/Users/g1014308/.codex/plugins/cache/openai-primary-runtime/presentations/26.905.11957/skills/presentations";
const RUNTIME_PYTHON = "C:/Users/g1014308/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
const FINAL_PPTX = path.join(workspaceDir, "deliverables", "cross-lab-proposal-briefing-v2.pptx");
const stagingDir = path.join(workspaceDir, ".codex-finalizer");
const FONT = "Microsoft JhengHei";
const CODE_FONT = "Consolas";

const C = {
  navy: "#07182B",
  navy2: "#0D2944",
  ink: "#112233",
  slate: "#4D6174",
  pale: "#EDF4F8",
  white: "#FFFFFF",
  cyan: "#15B8D1",
  cyanPale: "#DDF7FA",
  amber: "#F2B84B",
  amberPale: "#FFF3D8",
  red: "#D95C59",
  redPale: "#FCE9E7",
  green: "#2A9D72",
  greenPale: "#E1F5ED",
  line: "#CAD7E0",
};

const deck = Presentation.create({ slideSize: { width: 1280, height: 720 } });

function rect(slide, x, y, w, h, fill, radius = 0, line = "none") {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: line === "none" ? { fill: "none", width: 0 } : { style: "solid", fill: line, width: 1 },
    ...(radius ? { borderRadius: radius } : {}),
  });
}

function textBox(slide, text, x, y, w, h, size = 24, color = C.ink, bold = false, align = "left", font = FONT) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    typeface: font,
    fontSize: size,
    color,
    bold,
    alignment: align,
    verticalAlignment: "middle",
    autoFit: "none",
  };
  return shape;
}

function title(slide, value, number, dark = false) {
  textBox(slide, value, 64, 36, 1090, 55, 34, dark ? C.white : C.navy, true);
  textBox(slide, String(number).padStart(2, "0"), 1160, 42, 56, 34, 15, dark ? "#A8C5D8" : C.slate, true, "right");
}

function footer(slide, value = "跨實驗室提案討論　2026-09-10", dark = false) {
  rect(slide, 64, 682, 1152, 1, dark ? "#31506A" : C.line);
  textBox(slide, value, 64, 687, 900, 18, 11, dark ? "#8EABC0" : C.slate);
}

function addNode(slide, label, x, y, w = 150, fill = C.white, border = C.line, color = C.ink) {
  const box = rect(slide, x, y, w, 58, fill, 14, border);
  textBox(slide, label, x + 8, y + 8, w - 16, 42, 18, color, true, "center");
  return box;
}

function connect(slide, from, to, color = C.cyan, dashed = false) {
  return slide.shapes.connect(from, to, {
    kind: "straight",
    fromSide: "right",
    toSide: "left",
    line: { style: dashed ? "dashed" : "solid", fill: color, width: 3 },
    tail: { type: "arrow", width: "med", length: "med" },
  });
}

function note(slide, lines) {
  slide.speakerNotes.textFrame.setText(lines.join("\n"));
}

// 1. Cover
{
  const slide = deck.slides.add();
  slide.background.fill = C.navy;
  const image = await fs.readFile(path.join(workspaceDir, "assets", "behavior-to-patch-cover.png"));
  slide.images.add({
    blob: image,
    contentType: "image/png",
    alt: "外部操作軌跡對齊程式圖並形成安全補丁的抽象示意",
    fit: "cover",
    position: { left: 0, top: 0, width: 1280, height: 720 },
  });
  rect(slide, 0, 0, 610, 720, "#061426");
  rect(slide, 66, 122, 72, 6, C.amber);
  textBox(slide, "從黑箱行為推論到\n後端安全約束修補", 66, 154, 560, 175, 47, C.white, true);
  textBox(slide, "Behavior Inference\nEnforcement Localization\nConstraint-Guided Repair", 68, 344, 510, 86, 18, "#B7D4E6");
  textBox(slide, "跨實驗室三年期研究構想討論", 68, 512, 460, 38, 22, C.white, true);
  textBox(slide, "2026-09-10", 68, 562, 230, 28, 16, "#9CB9CD");
  note(slide, [
    "開場：今天希望討論的不是完整系統規格，而是一個可被三年逐步驗證的科學問題。",
    "核心問題是，能否把外部觀察到的業務違規，轉換成後端可定位、可修補、可驗證的安全不變量。",
  ]);
}

// 2. Golden case
{
  const slide = deck.slides.add();
  slide.background.fill = C.white;
  title(slide, "Golden Case：未付款也能出貨", 2);
  textBox(slide, "相同的合法 API，因為缺少前置狀態檢查而形成業務邏輯漏洞", 66, 94, 900, 36, 21, C.slate);

  textBox(slide, "合法流程", 72, 165, 120, 32, 19, C.green, true);
  const n1 = addNode(slide, "CREATED", 210, 150, 155, C.pale, C.line);
  const n2 = addNode(slide, "PAID", 455, 150, 155, C.greenPale, C.green);
  const n3 = addNode(slide, "SHIPPED", 700, 150, 155, C.greenPale, C.green);
  connect(slide, n1, n2, C.green);
  connect(slide, n2, n3, C.green);
  textBox(slide, "成功", 930, 160, 110, 36, 21, C.green, true, "center");

  textBox(slide, "違規流程", 72, 310, 120, 32, 19, C.red, true);
  const a1 = addNode(slide, "CREATED", 210, 295, 155, C.pale, C.line);
  const a2 = addNode(slide, "SHIPPED", 700, 295, 155, C.redPale, C.red);
  connect(slide, a1, a2, C.red, true);
  textBox(slide, "仍然成功", 930, 305, 140, 36, 21, C.red, true, "center");

  rect(slide, 210, 430, 845, 125, C.navy, 18);
  textBox(slide, "缺失的不變量", 240, 448, 210, 30, 18, "#9FC3D8", true);
  textBox(slide, "ship(order)  ⇒  order.status == PAID", 240, 484, 760, 46, 30, C.white, true, "center", CODE_FONT);
  textBox(slide, "研究難點：系統如何從外部證據推導這個條件？", 210, 580, 845, 38, 23, C.navy, true, "center");
  footer(slide);
  note(slide, [
    "先用一個案例固定全場語境。正常流程先付款再出貨，攻擊流程跳過付款卻仍完成出貨。",
    "輸入格式都合法，問題出在後端沒有執行狀態前置條件。這類漏洞未必具有典型惡意資料流。",
  ]);
}

// 3. Scientific gap
{
  const slide = deck.slides.add();
  slide.background.fill = C.pale;
  title(slide, "觀察到的行為不能直接當成安全規範", 3);
  textBox(slide, "第一年的關鍵在於建立規範成立的對照證據，狀態圖只是中間產物", 66, 94, 1030, 36, 21, C.slate);

  rect(slide, 72, 165, 465, 250, C.white, 18, C.line);
  textBox(slide, "只有單一路徑觀察", 102, 188, 380, 36, 24, C.navy, true);
  textBox(slide, "系統看到 CREATED 直接進入 SHIPPED", 102, 250, 380, 34, 20, C.ink);
  textBox(slide, "可能是漏洞，也可能是管理員流程或貨到付款", 102, 302, 380, 64, 20, C.red, true);

  rect(slide, 620, 165, 588, 250, C.white, 18, C.cyan);
  textBox(slide, "成對的對照軌跡", 650, 188, 510, 36, 24, C.navy, true);
  textBox(slide, "只改變前置狀態、角色或資源所有者", 650, 250, 500, 34, 20, C.ink);
  textBox(slide, "比較 API 結果、GUI 呈現與持久化狀態", 650, 302, 500, 34, 20, C.ink);
  textBox(slide, "產生有證據與信心的候選不變量", 650, 352, 500, 34, 20, C.cyan, true);

  rect(slide, 170, 480, 940, 105, C.amberPale, 16, C.amber);
  textBox(slide, "研究假說", 198, 500, 140, 28, 17, "#8A5B05", true);
  textBox(slide, "合法／違規對照能提供缺失安全條件的外部證據", 345, 492, 730, 50, 27, C.navy, true, "center");
  textBox(slide, "評估真值另由規格、已知修補或人工確認建立", 345, 544, 730, 25, 16, C.slate, false, "center");
  footer(slide);
  note(slide, [
    "這一頁主動承認最容易被質疑的地方。黑箱只能觀察行為，不能從一次成功直接推導應然規範。",
    "我們以最小差異對照建立候選不變量，並用獨立真值評估，避免系統自己定義答案再評估自己。",
  ]);
}

// 4. Central hypothesis
{
  const slide = deck.slides.add();
  slide.background.fill = C.navy;
  title(slide, "跨年度核心假說", 4, true);
  textBox(slide, "給定成對的合法／違規軌跡及後端程式碼", 110, 135, 1060, 46, 28, "#BBD6E6", true, "center");
  textBox(slide, "能否推導遭違反的安全不變量，定位其執行位置，\n並生成阻斷同類違規且保存合法流程的跨函式補丁？", 110, 204, 1060, 118, 35, C.white, true, "center");

  const labels = [
    ["行為證據", "合法與違規軌跡"],
    ["安全條件", "狀態與所有權不變量"],
    ["程式位置", "缺失或錯置的檢查"],
    ["可驗證補丁", "攻擊阻斷與功能保存"],
  ];
  const boxes = [];
  labels.forEach(([head, body], i) => {
    const x = 82 + i * 295;
    const b = rect(slide, x, 410, 230, 118, i === 3 ? "#163B49" : C.navy2, 14, i === 3 ? C.amber : "#31516B");
    boxes.push(b);
    textBox(slide, head, x + 18, 428, 194, 30, 20, i === 3 ? C.amber : C.cyan, true, "center");
    textBox(slide, body, x + 18, 467, 194, 42, 17, C.white, false, "center");
  });
  for (let i = 0; i < boxes.length - 1; i++) connect(slide, boxes[i], boxes[i + 1], "#6E98B1");
  textBox(slide, "同一份證據逐年升級，不把三年拆成互不相干的工具", 200, 585, 880, 38, 21, "#BBD6E6", true, "center");
  footer(slide, "跨實驗室提案討論　核心假說", true);
  note(slide, [
    "這是整份提案最重要的一句。三年共同回答同一個問題，差別只在研究階段與可驗證產物。",
    "跨年度核心資產包含軌跡、候選不變量、證據信心與程式對齊結果。",
  ]);
}

// 5. Three-year path
{
  const slide = deck.slides.add();
  slide.background.fill = C.white;
  title(slide, "三年研究路徑與年度閘門", 5);
  textBox(slide, "每一年都留下可獨立評估的產物，後續年度不假設前一年完全正確", 66, 94, 1000, 36, 21, C.slate);

  const years = [
    { x: 70, color: C.cyan, pale: C.cyanPale, year: "YEAR 1", head: "探測與建模", rq: "GUI／API 對照軌跡能否發現可重現違規？", out: "安全狀態模型\n合法與違規 Trace\n候選 Invariant" },
    { x: 438, color: C.amber, pale: C.amberPale, year: "YEAR 2", head: "診斷與定位", rq: "能否把不變量映射到後端缺失檢查位置？", out: "Trace-to-CPG 對齊\nTop-k Enforcement Point\n缺失 Predicate" },
    { x: 806, color: C.green, pale: C.greenPale, year: "YEAR 3", head: "修補與驗證", rq: "能否阻斷同類攻擊並保存合法工作流程？", out: "Multi-Hunk Patch\n三層驗證證據\n修補資料集" },
  ];
  const cards = [];
  for (const y of years) {
    const card = rect(slide, y.x, 158, 330, 395, C.white, 18, C.line);
    cards.push(card);
    rect(slide, y.x, 158, 330, 12, y.color, 8);
    textBox(slide, y.year, y.x + 24, 188, 110, 28, 16, y.color, true);
    textBox(slide, y.head, y.x + 24, 225, 280, 40, 27, C.navy, true);
    textBox(slide, "研究問題", y.x + 24, 290, 100, 25, 15, C.slate, true);
    textBox(slide, y.rq, y.x + 24, 320, 282, 76, 18, C.ink, true);
    rect(slide, y.x + 24, 422, 282, 1, C.line);
    textBox(slide, "年度輸出", y.x + 24, 440, 100, 25, 15, C.slate, true);
    textBox(slide, y.out, y.x + 24, 472, 282, 64, 17, C.ink);
  }
  connect(slide, cards[0], cards[1], C.cyan);
  connect(slide, cards[1], cards[2], C.amber);
  rect(slide, 245, 590, 790, 52, C.pale, 12);
  textBox(slide, "年度閘門：以人工真值輸入與自動產生輸入分開評估，量化誤差傳播", 265, 598, 750, 35, 18, C.navy, true, "center");
  footer(slide);
  note(slide, [
    "每年都有獨立研究問題與評估指標。即使第一年自動化模型尚未完美，第二年仍可先使用人工真值軌跡評估定位能力。",
    "同理，第三年可分別使用正確定位與自動定位結果，量化前段誤差如何影響修補。",
  ]);
}

// 6. Actual PoC evidence
{
  const slide = deck.slides.add();
  slide.background.fill = C.pale;
  title(slide, "微型 PoC 已驗證核心閉環", 6);
  textBox(slide, "本機 Node.js 標準函式庫案例，零外部相依，四項測試皆通過", 66, 94, 1000, 36, 21, C.slate);

  const table = slide.tables.add({
    rows: 5,
    columns: 5,
    left: 70,
    top: 160,
    width: 1140,
    height: 330,
    columnWidths: [165, 285, 170, 220, 300],
    values: [
      ["後端", "操作序列", "HTTP", "持久化狀態", "證明"],
      ["漏洞版", "建立、付款、出貨", "200", "SHIPPED", "正常流程原本可用"],
      ["漏洞版", "建立後直接出貨", "200", "SHIPPED", "違規流程確實成立"],
      ["修補版", "建立後直接出貨", "409", "CREATED", "攻擊遭阻斷"],
      ["修補版", "建立、付款、出貨", "200", "SHIPPED", "合法流程仍成功"],
    ],
  });
  table.borders.assign({ style: "solid", fill: C.line, width: 1 });
  table.cells.block({ row: 0, column: 0, rowCount: 1, columnCount: 5 }).assign({
    fill: C.navy,
    textStyle: { typeface: FONT, fontSize: 17, bold: true, color: C.white },
    margins: { left: 10, right: 10, top: 8, bottom: 8 },
    anchor: "middle",
  });
  table.cells.block({ row: 1, column: 0, rowCount: 4, columnCount: 5 }).assign({
    fill: C.white,
    textStyle: { typeface: FONT, fontSize: 16, color: C.ink },
    margins: { left: 10, right: 10, top: 8, bottom: 8 },
    anchor: "middle",
  });
  table.cells.block({ row: 2, column: 0, rowCount: 1, columnCount: 5 }).fill = C.redPale;
  table.cells.block({ row: 3, column: 0, rowCount: 1, columnCount: 5 }).fill = C.greenPale;

  rect(slide, 120, 535, 1040, 82, C.white, 14, C.line);
  textBox(slide, "目前人工提供", 148, 551, 180, 24, 16, C.slate, true);
  textBox(slide, "目標流程、真值、不變量與程式位置", 148, 579, 395, 24, 18, C.ink, true);
  textBox(slide, "研究逐年自動化", 635, 551, 190, 24, 16, C.slate, true);
  textBox(slide, "推論、定位、修補與驗證", 635, 579, 390, 24, 18, C.cyan, true);
  footer(slide, "實際測試：4 passed，0 failed　2026-09-09");
  note(slide, [
    "這不是宣稱研究已完成，而是證明核心閉環在可控案例中可重現。",
    "四項本機測試分別覆蓋漏洞版正常流程、漏洞觸發、修補阻斷及修補後正常流程。",
    "Demo 指令：進入 POC/golden-case 後執行 node --test .\\poc.test.mjs。",
  ]);
}

// 7. Year 1
{
  const slide = deck.slides.add();
  slide.background.fill = C.white;
  title(slide, "第一年：由對照行為建立安全模型", 7);
  textBox(slide, "RQ1　GUI 與可觀測 API 流量能否支撐可重現的狀態／授權違規判定？", 66, 94, 1110, 40, 21, C.navy, true);

  const s1 = addNode(slide, "語意 GUI 探索", 80, 190, 220, C.cyanPale, C.cyan);
  const s2 = addNode(slide, "安全相關狀態抽象", 390, 190, 230, C.white, C.line);
  const s3 = addNode(slide, "最小差異擾動", 710, 190, 220, C.amberPale, C.amber);
  const s4 = addNode(slide, "可重現 Exploit Trace", 1020, 190, 190, C.greenPale, C.green);
  connect(slide, s1, s2, C.cyan);
  connect(slide, s2, s3, C.cyan);
  connect(slide, s3, s4, C.amber);

  rect(slide, 80, 320, 530, 245, C.pale, 16);
  textBox(slide, "攻擊成功 Oracle", 110, 342, 470, 36, 24, C.navy, true);
  textBox(slide, "敏感操作確實發生\n必要前置條件未成立\n結果可重新查詢或跨帳號確認\n相同軌跡能穩定重現", 110, 400, 450, 135, 20, C.ink);

  rect(slide, 670, 320, 540, 245, C.navy, 16);
  textBox(slide, "黑箱邊界", 700, 342, 480, 36, 24, C.white, true);
  textBox(slide, "只使用 GUI、Accessibility Tree 與 GUI 觸發的可觀測流量\n\n不反編譯、不分析 Bundle、不修改客戶端", 700, 402, 460, 115, 20, "#C7DDEA");
  textBox(slide, "評估：漏洞發現率、誤報率、重現率與探索成本", 200, 610, 880, 35, 19, C.slate, true, "center");
  footer(slide);
  note(slide, [
    "第一年聚焦兩類缺失約束：業務狀態轉移，以及角色或資源所有權違規。",
    "不把 HTTP 200 當成漏洞。系統還要確認敏感結果真的發生，並能重現。",
    "憑證綁定或應用層加密若無法在不修改客戶端的情況下觀察，列為資料集限制。",
  ]);
}

// 8. Year 2
{
  const slide = deck.slides.add();
  slide.background.fill = C.pale;
  title(slide, "第二年：由外部軌跡縮小缺失檢查位置", 8);
  textBox(slide, "RQ2　對照軌跡與後端 CPG 能否提高安全不變量及執行位置的 Top-k 準確率？", 66, 94, 1120, 40, 21, C.navy, true);

  rect(slide, 70, 165, 485, 410, C.white, 18, C.line);
  textBox(slide, "Trace-to-Code 分層對齊", 100, 188, 420, 35, 25, C.navy, true);
  const labels = ["HTTP Route 對應 Handler", "Request／Identity 對應 Variable", "Object ID 對應 ORM Entity", "Handler 到 Sensitive Operation"];
  const nodes = [];
  labels.forEach((label, i) => nodes.push(addNode(slide, label, 112, 250 + i * 72, 390, i === 3 ? C.amberPale : C.pale, i === 3 ? C.amber : C.line)));
  for (let i = 0; i < nodes.length - 1; i++) {
    slide.shapes.connect(nodes[i], nodes[i + 1], {
      kind: "straight", fromSide: "bottom", toSide: "top",
      line: { style: "solid", fill: C.cyan, width: 2 },
      tail: { type: "arrow", width: "sm", length: "sm" },
    });
  }

  rect(slide, 620, 165, 590, 245, C.navy, 18);
  textBox(slide, "缺失檢查", 650, 188, 510, 30, 22, "#A9C8DA", true);
  textBox(slide, "function ship(order) {\n  // Missing: order.status == PAID\n  order.status = \"SHIPPED\";\n}", 655, 238, 505, 135, 22, C.white, false, "left", CODE_FONT);

  rect(slide, 620, 438, 590, 137, C.white, 16, C.cyan);
  textBox(slide, "輸出排序後的候選，不預設唯一精確對齊", 650, 458, 530, 34, 22, C.navy, true);
  textBox(slide, "File／Function／Predicate Top-k、證據與信心", 650, 512, 530, 30, 18, C.cyan, true);
  textBox(slide, "分析：Dominator、控制依賴、資料依賴及跨入口覆蓋", 150, 610, 980, 35, 19, C.slate, true, "center");
  footer(slide);
  note(slide, [
    "Dominator Analysis 只能判斷現有條件是否支配敏感操作，不能單獨告訴我們缺少什麼條件。",
    "因此先從對照軌跡推導不變量，再映射到後端變數與 Entity，最後分析檢查是否缺失、錯置或只覆蓋部分入口。",
  ]);
}

// 9. Year 3
{
  const slide = deck.slides.add();
  slide.background.fill = C.white;
  title(slide, "第三年：補丁必須同時通過安全與功能驗證", 9);
  textBox(slide, "RQ3　約束引導的 Multi-Hunk Patch 能否阻斷同類違規並保存合法 Workflow？", 66, 94, 1120, 40, 21, C.navy, true);

  rect(slide, 70, 165, 560, 225, C.navy, 18);
  textBox(slide, "候選修補", 100, 188, 480, 30, 22, "#A9C8DA", true);
  textBox(slide, "if (order.status !== \"PAID\") {\n  return conflict(\"PAYMENT_REQUIRED\");\n}\norder.status = \"SHIPPED\";", 105, 235, 475, 120, 21, C.white, false, "left", CODE_FONT);

  const checks = [
    ["01", "安全有效性", "原始 Exploit Trace 無法完成敏感操作", C.red, C.redPale],
    ["02", "同類攻擊泛化", "替換資源、角色、順序與等價入口", C.amber, C.amberPale],
    ["03", "功能保存", "合法 Workflow、鄰近正常路徑與既有測試成功", C.green, C.greenPale],
  ];
  checks.forEach(([no, head, body, color, pale], i) => {
    const y = 165 + i * 132;
    rect(slide, 690, y, 520, 106, pale, 16, color);
    textBox(slide, no, 714, y + 23, 52, 45, 25, color, true, "center");
    textBox(slide, head, 785, y + 15, 380, 32, 22, C.navy, true);
    textBox(slide, body, 785, y + 52, 380, 39, 17, C.ink);
  });

  rect(slide, 70, 430, 560, 131, C.pale, 16);
  textBox(slide, "退化補丁排除", 100, 450, 500, 30, 21, C.navy, true);
  textBox(slide, "全面回傳 403、封鎖整個端點，或只配適單一 PoC 均不得視為成功", 100, 490, 490, 52, 18, C.red, true);
  textBox(slide, "真實漏洞集與受控變異集分開報告，並依專案切分測試", 170, 610, 940, 35, 19, C.slate, true, "center");
  footer(slide);
  note(slide, [
    "修補的目標不是讓 PoC 收到錯誤碼，而是讓敏感操作不再發生。",
    "第三層功能保存避免全面拒絕式補丁。通過既有測試不代表零回歸，因此再加入第一年的合法軌跡與鄰近正常路徑。",
  ]);
}

// 10. Discussion decisions
{
  const slide = deck.slides.add();
  slide.background.fill = C.navy;
  title(slide, "明日希望確認的研究邊界", 10, true);
  textBox(slide, "先確認可執行範圍，再進入完整提案與文獻定位", 66, 94, 900, 36, 21, "#A9C8DA");

  const questions = [
    ["01", "目標系統", "Web、Android，或先以 Web 驗證再擴展？"],
    ["02", "後端生態", "先限定哪一至兩種語言／Framework 建立 CPG？"],
    ["03", "規範來源", "全自動推導、少量種子規則，或 Human-in-the-loop？"],
    ["04", "評估材料", "真實漏洞、教學平台、自建案例與受控變異如何配置？"],
  ];
  questions.forEach(([no, head, body], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 72 + col * 582;
    const y = 165 + row * 185;
    rect(slide, x, y, 548, 148, i === 3 ? "#12384B" : C.navy2, 16, i === 3 ? C.amber : "#31516B");
    textBox(slide, no, x + 24, y + 25, 58, 42, 24, i === 3 ? C.amber : C.cyan, true, "center");
    textBox(slide, head, x + 100, y + 22, 410, 36, 24, C.white, true);
    textBox(slide, body, x + 100, y + 70, 410, 54, 18, "#C7DDEA");
  });
  rect(slide, 170, 562, 940, 70, "#102F43", 14, C.cyan);
  textBox(slide, "今天需要的結論：核心假說是否值得做，以及第一年應縮到哪裡", 205, 578, 870, 38, 23, C.white, true, "center");
  footer(slide, "討論焦點　核心假說、研究邊界、可取得資料", true);
  note(slide, [
    "結尾不要向教授詢問所有細節。希望取得兩個明確結論：核心假說是否具有研究價值，以及第一年應限制在哪一種系統與漏洞範圍。",
    "若時間有限，優先討論目標系統與規範來源，因為兩者直接決定資料集與自動化程度。",
  ]);
}

await fs.mkdir(stagingDir, { recursive: true });
await fs.mkdir(path.dirname(FINAL_PPTX), { recursive: true });

const { finalizePresentation } = await import(pathToFileURL(
  path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs"),
).href);

const candidatePath = path.join(stagingDir, "cross-lab-proposal-candidate.pptx");
await (await PresentationFile.exportPptx(deck)).save(candidatePath);

const result = await finalizePresentation({
  explicitTotalSlideCount: 10,
  requiredNativeTableOwnerSlides: [6],
  requiredNativeChartOwnerSlides: [],
  workspaceDir,
  candidatePath,
  finalPath: FINAL_PPTX,
  pythonExecutable: RUNTIME_PYTHON,
  integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: [
    "--expected-slide-size-emu", "12192000,6858000",
    "--validate-bullet-geometry",
    "--validate-heading-fit",
    "--require-native-table-slide", "6",
  ],
  fontPolicy: {
    basis: "design",
    families: [FONT, CODE_FONT],
    scriptFonts: { ea: FONT },
  },
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, "cross-lab-proposal-briefing-v2.validation.json"),
});

console.log(JSON.stringify({ finalPath: FINAL_PPTX, result }, null, 2));
