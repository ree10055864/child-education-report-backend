require("dotenv").config();

const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const REPORTS_FILE = path.join(__dirname, "reports.json");
const REPORT_PROVIDER = process.env.REPORT_PROVIDER || "mock";

app.set("trust proxy", true);
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/reports/:id", async (req, res, next) => {
  try {
    const reports = await readReports();
    const report = findReportById(reports, req.params.id);

    if (!report) {
      return res.status(404).send(renderNotFoundPage(req.params.id));
    }

    res.send(renderReportPage(report));
  } catch (error) {
    next(error);
  }
});

app.post("/generate-report", async (req, res, next) => {
  try {
    const payload = {
      record_id: req.body.record_id || "",
      name: req.body.name || "",
      age: req.body.age || "",
      age_group: req.body.age_group || "4-6",
      report_id: req.body.report_id || "",
      report_input_text: req.body.report_input_text || "",
    };

    console.log("[generate-report] received:", payload);

    const generatedAt = new Date().toISOString();
    const generationResult = await generateReport(payload);
    const reportUrl = generationResult.success ? buildReportUrl(req, payload) : "";
    const reportEntry = {
      ...payload,
      report_status: generationResult.report_status,
      report_url: reportUrl,
      generated_at: generatedAt,
      generation_method: generationResult.generation_method,
      error_reason: generationResult.error_reason,
      report_text: generationResult.report_text,
    };
    const saved = await appendReportSafely(reportEntry);

    res.json({
      success: generationResult.success,
      message: generationResult.message,
      record_id: payload.record_id,
      report_id: payload.report_id,
      age_group: payload.age_group,
      report_status: generationResult.report_status,
      report_url: reportUrl,
      generated_at: generatedAt,
      generation_method: generationResult.generation_method,
      error_reason: generationResult.error_reason,
      report_text: generationResult.report_text,
      saved,
    });
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    console.error("[request] invalid JSON body:", err.message);
    return res.status(400).json({
      success: false,
      message: "请求体不是合法 JSON，请检查飞书 HTTP 请求 Body，尤其是多行文本字段里的换行。",
    });
  }

  console.error("[error]", err);
  res.status(500).json({
    success: false,
    message: "服务器内部错误",
  });
});

async function generateReport(payload) {
  if (REPORT_PROVIDER === "coze") {
    return generateReportWithCoze(payload);
  }

  return {
      success: true,
      message: "模拟报告已生成",
      report_status: "已完成",
      generation_method: "mock",
      error_reason: "",
      report_text: buildMockReportText(payload),
    };
}

async function generateReportWithCoze(payload) {
  try {
    const reportText = await runCozeWorkflow(payload);

    return {
      success: true,
      message: "报告已生成",
      report_status: "已完成",
      generation_method: "coze",
      error_reason: "",
      report_text: reportText,
    };
  } catch (error) {
    console.error("[coze] failed to generate report:", error);

    return {
      success: false,
      message: "报告生成失败",
      report_status: "失败",
      generation_method: "coze",
      error_reason: error.message || "Coze Workflow 调用失败",
      report_text: "",
    };
  }
}

async function runCozeWorkflow(payload) {
  const token = process.env.COZE_API_TOKEN;
  const endpoint = getCozeWorkflowEndpoint();

  if (!token) {
    throw new Error("缺少 COZE_API_TOKEN 环境变量");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: buildCozeHeaders(token),
    body: JSON.stringify(buildCozeRequestBody(endpoint, payload)),
  });

  const resultText = await response.text();
  const result = parseJson(resultText);

  if (!response.ok) {
    throw new Error(`Coze API 返回 ${response.status}: ${resultText}`);
  }

  const reportText = extractCozeReportText(result);

  if (!reportText) {
    throw new Error(`Coze 响应中没有找到 report_text: ${resultText}`);
  }

  return reportText;
}

function buildCozeHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Api-Token": token,
    "X-API-Token": token,
    "Content-Type": "application/json",
  };
}

function buildCozeRequestBody(endpoint, payload) {
  const input = {
    record_id: payload.record_id,
    name: payload.name,
    age: normalizeAge(payload.age),
    report_id: payload.report_id,
    report_input_text: payload.report_input_text,
  };

  if (endpoint.includes("coze.site/run")) {
    return input;
  }

  const workflowId = getCozeWorkflowId();

  if (!workflowId) {
    throw new Error("缺少 COZE_WORKFLOW_ID 环境变量");
  }

  return {
    workflow_id: workflowId,
    parameters: input,
  };
}

function getCozeWorkflowEndpoint() {
  const endpoint = process.env.COZE_WORKFLOW_ENDPOINT || "";

  if (endpoint.includes("/v1/workflows/")) {
    return "https://api.coze.cn/v1/workflow/run";
  }

  return endpoint || "https://api.coze.cn/v1/workflow/run";
}

function getCozeWorkflowId() {
  if (process.env.COZE_WORKFLOW_ID) {
    return process.env.COZE_WORKFLOW_ID;
  }

  const endpoint = process.env.COZE_WORKFLOW_ENDPOINT || "";
  const match = endpoint.match(/\/workflows\/([^/]+)\/run/);
  return match ? match[1] : "";
}

function normalizeAge(age) {
  const numberAge = Number(age);
  return Number.isFinite(numberAge) ? numberAge : age;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Coze 响应不是合法 JSON: ${text}`);
  }
}

function extractCozeReportText(result) {
  if (typeof result?.report_text === "string") {
    return result.report_text;
  }

  if (typeof result?.data?.report_text === "string") {
    return result.data.report_text;
  }

  if (typeof result?.data?.outputs?.report_text === "string") {
    return result.data.outputs.report_text;
  }

  if (typeof result?.output?.report_text === "string") {
    return result.output.report_text;
  }

  if (typeof result?.data === "string") {
    const parsedData = parseJson(result.data);
    return extractCozeReportText(parsedData);
  }

  return "";
}

function buildMockReportText(payload) {
  const name = payload.name || "孩子";
  const age = payload.age || "未填写";
  const reportId = payload.report_id || "未填写";

  return [
    `【模拟报告】${name}的4-6岁儿童教育规划测评报告`,
    "",
    `报告编号：${reportId}`,
    `年龄：${age}`,
    "",
    "这是当前阶段用于测试飞书回写流程的模拟报告文本。",
    "后续接入 Coze Workflow 后，这里会替换为 AI 根据测评维度生成的正式报告内容。",
    "",
    "当前建议：先确认报告状态、报告链接、生成时间、生成方式、错误原因等字段可以被飞书自动化正确写回。",
  ].join("\n");
}

async function appendReportSafely(payload) {
  try {
    await appendReport(payload);
    return true;
  } catch (error) {
    console.error("[reports] failed to save reports.json:", error);
    return false;
  }
}

async function appendReport(payload) {
  const reports = await readReports();

  reports.push({
    ...payload,
    received_at: new Date().toISOString(),
  });

  await fs.writeFile(REPORTS_FILE, JSON.stringify(reports, null, 2), "utf8");
}

function buildReportUrl(req, payload) {
  const baseUrl = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const reportId = encodeURIComponent(getReportKey(payload));
  return `${baseUrl.replace(/\/$/, "")}/reports/${reportId}`;
}

function getReportKey(payload) {
  return payload.record_id || payload.report_id || "latest";
}

function findReportById(reports, id) {
  const decodedId = decodeURIComponent(id);

  for (let index = reports.length - 1; index >= 0; index -= 1) {
    const report = reports[index];

    if (
      report.record_id === decodedId ||
      report.report_id === decodedId ||
      (!report.record_id && !report.report_id && decodedId === "latest")
    ) {
      return report;
    }
  }

  return null;
}

function renderReportPage(report) {
  const title = `${report.name || "孩子"}儿童教育规划测评报告`;
  const generatedAt = report.generated_at ? formatDate(report.generated_at) : "未记录";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f4ee;
      --paper: #fffdf8;
      --text: #25211b;
      --muted: #6f665b;
      --line: #e6ded2;
      --accent: #2f6f73;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      line-height: 1.72;
    }

    main {
      width: min(880px, calc(100% - 32px));
      margin: 32px auto;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 32px;
      box-shadow: 0 18px 42px rgba(45, 38, 28, 0.08);
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 28px;
      color: var(--muted);
      font-size: 14px;
    }

    .pill {
      border: 1px solid var(--line);
      border-radius: 999px;
      padding: 4px 10px;
      background: #fffaf0;
    }

    article h1 {
      margin: 0 0 18px;
      color: var(--accent);
      font-size: 30px;
      line-height: 1.24;
    }

    article h2 {
      margin: 30px 0 10px;
      padding-top: 18px;
      border-top: 1px solid var(--line);
      font-size: 21px;
      line-height: 1.35;
    }

    article h3 {
      margin: 22px 0 8px;
      font-size: 17px;
    }

    article p {
      margin: 8px 0;
    }

    article ol,
    article ul {
      padding-left: 24px;
      margin: 8px 0;
    }

    article li {
      margin: 6px 0;
    }

    article strong {
      color: #1f595c;
    }

    @media (max-width: 640px) {
      main {
        width: 100%;
        min-height: 100vh;
        margin: 0;
        border: 0;
        border-radius: 0;
        padding: 22px;
      }

      article h1 {
        font-size: 24px;
      }
    }
  </style>
</head>
<body>
  <main>
    <div class="meta">
      <span class="pill">状态：${escapeHtml(report.report_status || "未知")}</span>
      <span class="pill">编号：${escapeHtml(report.report_id || "未填写")}</span>
      <span class="pill">生成方式：${escapeHtml(report.generation_method || "未知")}</span>
      <span class="pill">生成时间：${escapeHtml(generatedAt)}</span>
    </div>
    <article>
      ${renderMarkdown(report.report_text || "报告正文暂未生成。")}
    </article>
  </main>
</body>
</html>`;
}

function renderNotFoundPage(id) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>报告未找到</title>
  <style>
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      background: #f7f4ee;
      color: #25211b;
    }

    main {
      width: min(720px, calc(100% - 32px));
      margin: 56px auto;
      background: #fffdf8;
      border: 1px solid #e6ded2;
      border-radius: 8px;
      padding: 28px;
    }
  </style>
</head>
<body>
  <main>
    <h1>报告未找到</h1>
    <p>没有找到 ID 为 ${escapeHtml(id)} 的报告。请确认飞书自动化已经成功生成报告。</p>
  </main>
</body>
</html>`;
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let listType = "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      continue;
    }

    if (trimmed.startsWith("### ")) {
      closeList();
      html.push(`<h3>${renderInline(trimmed.slice(4))}</h3>`);
      continue;
    }

    if (trimmed.startsWith("## ")) {
      closeList();
      html.push(`<h2>${renderInline(trimmed.slice(3))}</h2>`);
      continue;
    }

    if (trimmed.startsWith("# ")) {
      closeList();
      html.push(`<h1>${renderInline(trimmed.slice(2))}</h1>`);
      continue;
    }

    const orderedItem = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedItem) {
      openList("ol");
      html.push(`<li>${renderInline(orderedItem[1])}</li>`);
      continue;
    }

    const unorderedItem = trimmed.match(/^[-*]\s+(.+)$/);
    if (unorderedItem) {
      openList("ul");
      html.push(`<li>${renderInline(unorderedItem[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${renderInline(trimmed)}</p>`);
  }

  closeList();
  return html.join("\n");

  function openList(type) {
    if (listType === type) {
      return;
    }

    closeList();
    listType = type;
    html.push(`<${type}>`);
  }

  function closeList() {
    if (!listType) {
      return;
    }

    html.push(`</${listType}>`);
    listType = "";
  }
}

function renderInline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}

async function readReports() {
  try {
    const content = await fs.readFile(REPORTS_FILE, "utf8");
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    if (error instanceof SyntaxError) {
      console.error("[reports] reports.json is not valid JSON, resetting file.");
      return [];
    }

    throw error;
  }
}

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
