require("dotenv").config();

const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const REPORTS_FILE = path.join(__dirname, "reports.json");
const REPORT_PROVIDER = process.env.REPORT_PROVIDER || "mock";

app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  res.json({ ok: true });
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

    const saved = await appendReportSafely(payload);
    const generatedAt = new Date().toISOString();
    const generationResult = await generateReport(payload);

    res.json({
      success: generationResult.success,
      message: generationResult.message,
      record_id: payload.record_id,
      report_id: payload.report_id,
      age_group: payload.age_group,
      report_status: generationResult.report_status,
      report_url: generationResult.report_url,
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
    report_url: "https://example.com/report/demo",
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
      report_url: "https://example.com/report/demo",
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
      report_url: "",
      generation_method: "coze",
      error_reason: error.message || "Coze Workflow 调用失败",
      report_text: "",
    };
  }
}

async function runCozeWorkflow(payload) {
  const token = process.env.COZE_API_TOKEN;
  const workflowId = getCozeWorkflowId();
  const endpoint = getCozeWorkflowEndpoint();

  if (!token) {
    throw new Error("缺少 COZE_API_TOKEN 环境变量");
  }

  if (!workflowId) {
    throw new Error("缺少 COZE_WORKFLOW_ID 环境变量");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workflow_id: workflowId,
      parameters: {
        record_id: payload.record_id,
        name: payload.name,
        age: normalizeAge(payload.age),
        report_id: payload.report_id,
        report_input_text: payload.report_input_text,
      },
    }),
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
