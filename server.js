const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const PROTOTYPE_DIR = path.join(ROOT, "prototype");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "daily-records.json");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");
const PROJECT_KB_FILE = path.join(DATA_DIR, "project-kb.json");
const LOCAL_CONFIG_FILE = path.join(DATA_DIR, "local-config.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function todayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function nowISO() {
  const date = new Date();
  const offsetMs = 8 * 60 * 60 * 1000;
  return new Date(date.getTime() + offsetMs).toISOString().replace("Z", "+08:00");
}

function readRecords() {
  if (!fs.existsSync(DATA_FILE)) return [];
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  return JSON.parse(raw || "[]");
}

function readReports() {
  return readJsonFile(REPORTS_FILE, []);
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw || JSON.stringify(fallback));
}

function readProjectKb() {
  return readJsonFile(PROJECT_KB_FILE, []);
}

function readLocalConfig() {
  return readJsonFile(LOCAL_CONFIG_FILE, { dingtalk: { webhook: "", secret: "" } });
}

function normalizeDingtalkConfig(config) {
  const dingtalk = config.dingtalk || {};
  let webhook = String(dingtalk.webhook || "").trim();
  let secret = String(dingtalk.secret || "").trim();

  if (webhook.startsWith("SEC") && /^https?:\/\//.test(secret)) {
    const swapped = webhook;
    webhook = secret;
    secret = swapped;
  }

  return { webhook, secret };
}

function writeRecords(records) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(records, null, 2)}\n`);
}

function writeReports(reports) {
  fs.mkdirSync(path.dirname(REPORTS_FILE), { recursive: true });
  fs.writeFileSync(REPORTS_FILE, `${JSON.stringify(reports, null, 2)}\n`);
}

function nextId(records, date) {
  const prefix = `${date}-`;
  const count = records.filter((item) => item.id && item.id.startsWith(prefix)).length + 1;
  return `${prefix}${String(count).padStart(3, "0")}`;
}

function splitInput(raw) {
  return String(raw || "")
    .split(/[；;。.\n，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function guessProject(text) {
  const projects = readProjectKb();
  const normalized = String(text || "").toLowerCase();
  for (const project of projects) {
    const keywords = project.keywords || [];
    if (keywords.some((keyword) => normalized.includes(String(keyword).toLowerCase()))) {
      return project.name;
    }
  }
  return "未归类";
}

function guessStatus(text) {
  if (/明天|明日|待办|计划|需要|跟进/.test(text)) return "待办";
  if (/完成|参加|参会|开会|评审|分享/.test(text)) return "已完成";
  if (/修改|调整|采购|部署|测试/.test(text)) return "待办";
  return "已完成";
}

function guessDate(text, status) {
  const value = String(text || "");
  const explicit = value.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/);
  if (explicit) {
    return `${explicit[1]}-${String(explicit[2]).padStart(2, "0")}-${String(explicit[3]).padStart(2, "0")}`;
  }
  const monthDay = value.match(/(\d{1,2})月(\d{1,2})日?/);
  if (monthDay) {
    const year = todayISO().slice(0, 4);
    return `${year}-${String(monthDay[1]).padStart(2, "0")}-${String(monthDay[2]).padStart(2, "0")}`;
  }
  if (/昨天/.test(value)) return addDays(todayISO(), -1);
  if (/明天|明日/.test(value)) return addDays(todayISO(), 1);
  return status === "待办" ? addDays(todayISO(), 1) : todayISO();
}

function addDays(dateText, days) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function parseInput(raw, source = "当前对话") {
  return splitInput(raw).map((title) => {
    const status = guessStatus(title);
    return {
      title,
      project: guessProject(title),
      status,
      date: guessDate(title, status),
      source: /钉钉/.test(title) ? "钉钉机器人" : source,
      includeInReport: true,
    };
  });
}

function recordFromCandidate(candidate, records) {
  const date = candidate.date || todayISO();
  return {
    id: nextId(records, date),
    date,
    title: candidate.title,
    project: candidate.project || guessProject(candidate.title),
    status: candidate.status || guessStatus(candidate.title),
    source: candidate.source || "当前对话",
    includeInReport: candidate.includeInReport !== false,
    createdAt: nowISO(),
  };
}

function ingestText(text, source = "当前对话") {
  const records = readRecords();
  const candidates = parseInput(text, source);
  const created = candidates.filter((item) => item && item.title).map((item) => {
    const record = recordFromCandidate(item, records);
    records.push(record);
    return record;
  });
  writeRecords(records);
  return { candidates, created, records };
}

function stripTomorrow(title) {
  return String(title).replace(/^明天|^明日/, "").trim();
}

function buildReport(type = "daily", date = todayISO(), risk = {}) {
  const records = readRecords().filter((item) => item.includeInReport !== false);
  const periodLabel = type === "weekly" ? "本周" : type === "monthly" ? "本月" : "今日";
  const nextLabel = type === "weekly" ? "下周" : type === "monthly" ? "下月" : "明日";
  const done = records.filter((item) => item.status === "已完成" && (type !== "daily" || item.date === date));
  const todos = records.filter((item) => item.status === "待办" && (type !== "daily" || item.date === addDays(date, 1)));
  const doneLines = done.length
    ? done.map((item, index) => `${index + 1}. ${item.title}。`).join("\n")
    : "1. 暂无。";
  const todoLines = todos.length
    ? todos.map((item, index) => `${index + 1}. ${stripTomorrow(item.title)}。`).join("\n")
    : "1. 暂无。";

  return `【一、${periodLabel}进展
${doneLines}
二、${nextLabel}计划
${todoLines}
三、风险与阻塞

1. 关键问题：${risk.keyIssue || ""}
2. 需协调：${risk.coordination || "暂无"}】`;
}

function buildRecordSummary(records) {
  return records.reduce((summary, item) => {
    const date = item.date || todayISO();
    if (!summary[date]) summary[date] = { total: 0, done: 0, todo: 0 };
    summary[date].total += 1;
    if (item.status === "已完成") summary[date].done += 1;
    if (item.status === "待办") summary[date].todo += 1;
    return summary;
  }, {});
}

function buildReportSummary(reports) {
  return reports.reduce((summary, item) => {
    const date = item.date || todayISO();
    if (!summary[date]) summary[date] = { total: 0, sent: 0 };
    summary[date].total += 1;
    if (item.sentAt) summary[date].sent += 1;
    return summary;
  }, {});
}

function upsertReport({ type = "daily", date = todayISO(), content, risk = {} }) {
  const reports = readReports();
  const existingIndex = reports.findIndex((item) => item.type === type && item.date === date);
  const report = {
    id: existingIndex >= 0 ? reports[existingIndex].id : `${date}-${type}`,
    type,
    date,
    content: content || buildReport(type, date, risk),
    risk,
    updatedAt: nowISO(),
    createdAt: existingIndex >= 0 ? reports[existingIndex].createdAt : nowISO(),
    sentAt: existingIndex >= 0 ? reports[existingIndex].sentAt : null,
  };
  if (existingIndex >= 0) reports[existingIndex] = report;
  else reports.push(report);
  writeReports(reports);
  return { report, reports };
}

function dingtalkTextFromBody(body) {
  if (typeof body.text === "string") return body.text;
  if (body.text && typeof body.text.content === "string") return body.text.content;
  if (typeof body.content === "string") return body.content;
  return "";
}

function buildDingtalkWebhook(webhook, secret) {
  if (!secret) return webhook;
  const crypto = require("crypto");
  const timestamp = Date.now();
  const signText = `${timestamp}\n${secret}`;
  const sign = encodeURIComponent(crypto.createHmac("sha256", secret).update(signText).digest("base64"));
  const separator = webhook.includes("?") ? "&" : "?";
  return `${webhook}${separator}timestamp=${timestamp}&sign=${sign}`;
}

function postJson(targetUrl, payload) {
  return new Promise((resolve, reject) => {
    const client = targetUrl.startsWith("https:") ? require("https") : require("http");
    const url = new URL(targetUrl);
    const body = JSON.stringify(payload);
    const request = client.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (response) => {
        let data = "";
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          resolve({ statusCode: response.statusCode, body: data });
        });
      },
    );
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("请求内容过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(PROTOTYPE_DIR, relativePath));

  if (!filePath.startsWith(PROTOTYPE_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, date: todayISO() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/records") {
    const date = url.searchParams.get("date");
    const records = readRecords();
    sendJson(res, 200, { records: date ? records.filter((item) => item.date === date) : records });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/records/summary") {
    sendJson(res, 200, { summary: buildRecordSummary(readRecords()) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/project-kb") {
    sendJson(res, 200, { projects: readProjectKb() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/dingtalk/config-status") {
    const config = normalizeDingtalkConfig(readLocalConfig());
    sendJson(res, 200, { configured: /^https?:\/\//.test(config.webhook) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/parse") {
    const body = await readJsonBody(req);
    sendJson(res, 200, { candidates: parseInput(body.text, body.source || "当前对话") });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ingest") {
    const body = await readJsonBody(req);
    const text = dingtalkTextFromBody(body) || body.rawText || "";
    if (!text.trim()) {
      sendJson(res, 400, { error: "请输入要记录的内容。" });
      return;
    }
    const result = ingestText(text, body.source || "当前对话");
    sendJson(res, 201, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/records") {
    const body = await readJsonBody(req);
    const records = readRecords();
    const candidates = Array.isArray(body.records) ? body.records : [body];
    const created = candidates.filter((item) => item && item.title).map((item) => {
      const record = recordFromCandidate(item, records);
      records.push(record);
      return record;
    });
    writeRecords(records);
    sendJson(res, 201, { records, created });
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/records/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/records/", ""));
    const body = await readJsonBody(req);
    const records = readRecords();
    const index = records.findIndex((item) => item.id === id);
    if (index < 0) {
      sendJson(res, 404, { error: "记录不存在" });
      return;
    }
    records[index] = {
      ...records[index],
      title: body.title || records[index].title,
      project: body.project || records[index].project,
      status: body.status || records[index].status,
      date: body.date || records[index].date,
      includeInReport: body.includeInReport !== undefined ? Boolean(body.includeInReport) : records[index].includeInReport,
      updatedAt: nowISO(),
    };
    writeRecords(records);
    sendJson(res, 200, { record: records[index], records });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/report") {
    const type = url.searchParams.get("type") || "daily";
    const date = url.searchParams.get("date") || todayISO();
    sendJson(res, 200, { report: buildReport(type, date) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/report") {
    const body = await readJsonBody(req);
    const type = body.type || "daily";
    const date = body.date || todayISO();
    const built = buildReport(type, date, body.risk || {});
    const saved = body.save === false ? null : upsertReport({ type, date, content: built, risk: body.risk || {} }).report;
    sendJson(res, 200, { report: built, saved });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/reports") {
    const date = url.searchParams.get("date");
    const type = url.searchParams.get("type");
    let reports = readReports();
    if (date) reports = reports.filter((item) => item.date === date);
    if (type) reports = reports.filter((item) => item.type === type);
    sendJson(res, 200, { reports });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/reports/summary") {
    sendJson(res, 200, { summary: buildReportSummary(readReports()) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/dingtalk/incoming") {
    const body = await readJsonBody(req);
    const text = dingtalkTextFromBody(body);
    if (!text.trim()) {
      sendJson(res, 400, { error: "未识别到钉钉消息文本。" });
      return;
    }
    const result = ingestText(text, "钉钉机器人");
    sendJson(res, 201, { ...result, message: "钉钉消息已入库。" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/dingtalk/send-report") {
    const body = await readJsonBody(req);
    const config = normalizeDingtalkConfig(readLocalConfig());
    const webhook = config.webhook;
    if (!webhook) {
      sendJson(res, 400, { error: "尚未配置钉钉 Webhook，请先填写 data/local-config.json。" });
      return;
    }
    if (!/^https?:\/\//.test(webhook)) {
      sendJson(res, 400, { error: "钉钉 Webhook 格式不正确，应以 http:// 或 https:// 开头。请检查 data/local-config.json。" });
      return;
    }
    const report = body.report || buildReport(body.type || "daily", body.date || todayISO(), body.risk || {});
    const targetUrl = buildDingtalkWebhook(webhook, config.secret || "");
    const result = await postJson(targetUrl, {
      msgtype: "markdown",
      markdown: {
        title: body.title || "工作日报",
        text: report,
      },
    });
    if (result.statusCode >= 200 && result.statusCode < 300 && body.type && body.date) {
      const reports = readReports();
      const index = reports.findIndex((item) => item.type === body.type && item.date === body.date);
      if (index >= 0) {
        reports[index].sentAt = nowISO();
        writeReports(reports);
      }
    }
    sendJson(res, result.statusCode >= 200 && result.statusCode < 300 ? 200 : 502, {
      ok: result.statusCode >= 200 && result.statusCode < 300,
      statusCode: result.statusCode,
      response: result.body,
    });
    return;
  }

  sendJson(res, 404, { error: "API not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Dailywork local server running at http://127.0.0.1:${PORT}`);
});
