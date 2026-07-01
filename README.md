# 4-6岁儿童教育规划测评报告生成轻后台

这是一个最小可运行的 Node.js Express 项目。第一阶段只做接口联通：接收飞书自动化发来的测评数据，打印日志，保存到本地 `reports.json`，并返回一个模拟报告结果。

## 安装依赖

```bash
npm install
```

## 本地启动

```bash
npm start
```

启动后默认监听：

```text
http://localhost:3000
```

如需修改端口，可以复制 `.env.example` 为 `.env`，然后调整 `PORT`。

## 健康检查

```bash
curl http://localhost:3000/health
```

预期返回：

```json
{
  "ok": true
}
```

## 测试 POST /generate-report

### curl 测试

```bash
curl -X POST http://localhost:3000/generate-report \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "rec_demo_001",
    "name": "小明",
    "age": "5",
    "report_id": "RPT-20260630-001",
    "report_input_text": "孩子喜欢搭积木，语言表达较好，专注力需要继续培养。"
  }'
```

预期返回：

```json
{
  "success": true,
  "message": "模拟报告已生成",
  "record_id": "rec_demo_001",
  "report_id": "RPT-20260630-001",
  "report_status": "已生成",
  "report_url": "https://example.com/report/demo",
  "generated_at": "2026-07-01T05:43:58.000Z",
  "generation_method": "mock",
  "error_reason": "",
  "report_text": "【模拟报告】小明的4-6岁儿童教育规划测评报告\n...",
  "saved": true
}
```

请求成功后，项目根目录会生成或更新 `reports.json`，里面保存收到的请求数据和接收时间。

### Postman 测试

1. 新建请求，选择 `POST`。
2. 请求地址填写 `http://localhost:3000/generate-report`。
3. 在 `Headers` 中设置 `Content-Type: application/json`。
4. 在 `Body` 中选择 `raw` 和 `JSON`，填写：

```json
{
  "record_id": "rec_demo_001",
  "name": "小明",
  "age": "5",
  "report_id": "RPT-20260630-001",
  "report_input_text": "孩子喜欢搭积木，语言表达较好，专注力需要继续培养。"
}
```

5. 点击发送，查看返回的模拟结果。

## 部署到 Render/Railway

飞书自动化需要请求公网 HTTPS 地址。当前不再使用本地穿透，建议把这个 Express 服务部署到 Render 或 Railway。

当前项目已经满足云端部署的基础要求：

- `npm start` 会执行 `node server.js`。
- 服务端口使用 `process.env.PORT || 3000`，云平台会自动注入 `PORT`。
- `package.json` 已声明 Node.js 版本要求：`>=18`。
- 当前接口仍然只做链路测试：接收请求、打印日志、写入 `reports.json`、返回模拟结果。

### 部署到 Render

1. 把项目提交到 GitHub 仓库。
2. 打开 Render Dashboard，选择 `New` -> `Web Service`。
3. 连接你的 GitHub 仓库。
4. 配置服务：

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
```

5. 暂时不需要配置环境变量。
6. 部署完成后，Render 会提供一个公网域名，格式通常类似：

```text
https://your-service-name.onrender.com
```

7. 测试健康检查：

```bash
curl https://your-service-name.onrender.com/health
```

预期返回：

```json
{
  "ok": true
}
```

### 部署到 Railway

1. 把项目提交到 GitHub 仓库。
2. 打开 Railway，新建项目，选择从 GitHub 仓库部署。
3. 选择这个 Express 项目所在仓库。
4. Railway 会自动识别 Node.js 项目。确认启动命令为：

```text
npm start
```

5. 暂时不需要配置环境变量。
6. 部署完成后，在服务的 `Networking` 或 `Settings` 中生成公网域名。
7. Railway 域名格式通常类似：

```text
https://your-service-name.up.railway.app
```

8. 测试健康检查：

```bash
curl https://your-service-name.up.railway.app/health
```

预期返回：

```json
{
  "ok": true
}
```

### 云端测试 POST 接口

部署成功后，把下面命令里的域名替换成 Render 或 Railway 给你的真实域名：

```bash
curl -X POST https://your-cloud-domain.com/generate-report \
  -H "Content-Type: application/json" \
  -d '{
    "record_id": "rec_demo_001",
    "name": "小明",
    "age": "5",
    "report_id": "RPT-20260701-001",
    "report_input_text": "孩子喜欢搭积木，语言表达较好，专注力需要继续培养。"
  }'
```

预期返回：

```json
{
  "success": true,
  "message": "模拟报告已生成",
  "record_id": "rec_demo_001",
  "report_id": "RPT-20260701-001",
  "report_status": "已生成",
  "report_url": "https://example.com/report/demo",
  "generated_at": "2026-07-01T05:43:58.000Z",
  "generation_method": "mock",
  "error_reason": "",
  "report_text": "【模拟报告】小明的4-6岁儿童教育规划测评报告\n...",
  "saved": true
}
```

云端部署时，`reports.json` 会写在云服务器本地文件系统里。Render/Railway 的文件系统通常不适合作为长期数据存储，服务重启或重新部署后文件可能丢失。第一阶段只用它做链路验证：优先看平台日志里是否出现 `[generate-report] received:`，后续再改成数据库、对象存储或回写飞书多维表格。

## 飞书自动化 HTTP 请求配置

在飞书多维表格自动化中，可以配置“发送 HTTP 请求”动作：

- 请求方法：`POST`
- 请求地址：部署成功后的公网地址加接口路径，例如 `https://your-service-name.onrender.com/generate-report` 或 `https://your-service-name.up.railway.app/generate-report`。
- 请求头：

```text
Content-Type: application/json
```

- 请求体类型：`JSON`
- 请求体示例：

```json
{
  "record_id": "{{记录ID}}",
  "name": "{{姓名}}",
  "age": "{{年龄}}",
  "report_id": "{{报告ID}}",
  "report_input_text": "{{报告输入文本}}"
}
```

其中 `{{记录ID}}`、`{{姓名}}` 等字段需要替换为飞书自动化里可选择的实际字段变量。

### 飞书自动化 mock 回写配置

当前阶段还没有接入 AI，接口会返回一份模拟报告结果。可以先在飞书自动化中把“回写记录”流程跑通。

建议自动化步骤：

1. 触发条件：`报告状态` 变为 `待生成`。
2. 动作一：发送 HTTP 请求到 `/generate-report`。
3. 动作二：更新触发的这条记录。

HTTP 请求成功后，响应 body 示例：

```json
{
  "success": true,
  "message": "模拟报告已生成",
  "record_id": "rec_demo_001",
  "report_id": "RPT-20260701-001",
  "report_status": "已生成",
  "report_url": "https://example.com/report/demo",
  "generated_at": "2026-07-01T05:43:58.000Z",
  "generation_method": "mock",
  "error_reason": "",
  "report_text": "【模拟报告】小明的4-6岁儿童教育规划测评报告\n...",
  "saved": true
}
```

更新记录时，字段建议这样映射：

```text
报告状态   -> HTTP 响应 body.report_status
报告链接   -> HTTP 响应 body.report_url
生成时间   -> HTTP 响应 body.generated_at
生成方式   -> HTTP 响应 body.generation_method
错误原因   -> HTTP 响应 body.error_reason
```

如果表格里有“报告文本”字段，也可以临时映射：

```text
报告文本   -> HTTP 响应 body.report_text
```

这一步跑通后，后续接入 Coze Workflow 时，只需要把 `generation_method` 从 `mock` 改成 `coze`，并把 `report_text` 换成 Coze 返回的正式报告内容；飞书触发和回写框架不需要重做。

## 后续扩展方向

当前代码保持简单，后续可以继续加入：

- AI 生成报告：在 `/generate-report` 中调用大模型，根据 `report_input_text` 生成结构化报告内容。
- HTML 报告页面：生成静态或动态 HTML 页面，并把真实报告链接返回给飞书。
- 回写飞书多维表格：调用飞书开放平台接口，把报告状态、报告链接、错误原因等写回原记录。
- 错误日志：把接口异常、AI 调用失败、飞书回写失败等日志保存到单独日志文件或日志服务。
