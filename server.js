require("dotenv").config();

const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const REPORTS_FILE = path.join(__dirname, "reports.json");

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
      report_id: req.body.report_id || "",
      report_input_text: req.body.report_input_text || "",
    };

    console.log("[generate-report] received:", payload);

    const saved = await appendReportSafely(payload);
    const generatedAt = new Date().toISOString();

    res.json({
      success: true,
      message: "模拟报告已生成",
      record_id: payload.record_id,
      report_id: payload.report_id,
      report_status: "已生成",
      report_url: "https://example.com/report/demo",
      generated_at: generatedAt,
      generation_method: "mock",
      error_reason: "",
      report_text: buildMockReportText(payload),
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
