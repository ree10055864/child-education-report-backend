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

    await appendReport(payload);

    res.json({
      success: true,
      message: "报告请求已接收",
      record_id: payload.record_id,
      report_id: payload.report_id,
      report_url: "https://example.com/report/demo",
    });
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  console.error("[error]", err);
  res.status(500).json({
    success: false,
    message: "服务器内部错误",
  });
});

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

    throw error;
  }
}

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
