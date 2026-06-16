const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONFIG_FILE = path.join(ROOT, "data", "dingtalk-stream-config.json");
const DEFAULT_INGEST_URL = "http://127.0.0.1:4173/api/ingest";

function readConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error("缺少 data/dingtalk-stream-config.json，请先根据 example 文件填写钉钉应用凭证。");
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  if (!config.clientId || !config.clientSecret) {
    throw new Error("钉钉 Stream 配置不完整，请填写 clientId 和 clientSecret。");
  }
  return {
    clientId: String(config.clientId).trim(),
    clientSecret: String(config.clientSecret).trim(),
    localIngestUrl: config.localIngestUrl || DEFAULT_INGEST_URL,
    debug: Boolean(config.debug),
  };
}

function parseDingtalkText(message) {
  if (!message) return "";
  if (message.msgtype === "text" && message.text && typeof message.text.content === "string") {
    return message.text.content.trim();
  }
  return "";
}

async function postToLocalIngest(localIngestUrl, text, rawMessage) {
  const response = await fetch(localIngestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      source: "钉钉机器人",
      dingtalk: {
        msgId: rawMessage.msgId,
        senderNick: rawMessage.senderNick,
        conversationId: rawMessage.conversationId,
        robotCode: rawMessage.robotCode,
        createAt: rawMessage.createAt,
      },
    }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`本地写入失败：HTTP ${response.status} ${body}`);
  }
  return JSON.parse(body);
}

async function main() {
  const { DWClient, EventAck, TOPIC_ROBOT } = await import("dingtalk-stream");
  const config = readConfig();
  const client = new DWClient({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    keepAlive: true,
    debug: config.debug,
  });

  client.config.subscriptions = [{ type: "EVENT", topic: TOPIC_ROBOT }];

  client.registerAllEventListener((event) => {
    let message;
    try {
      message = JSON.parse(event.data || "{}");
    } catch (error) {
      console.warn("钉钉消息解析失败：", error.message);
      return { status: EventAck.SUCCESS, message: "ignored invalid message" };
    }

    const text = parseDingtalkText(message);
    if (!text) {
      console.info("收到非文本钉钉消息，已忽略。");
      return { status: EventAck.SUCCESS, message: "ignored non-text message" };
    }

    postToLocalIngest(config.localIngestUrl, text, message)
      .then((result) => {
        console.info(`钉钉消息已入库：${result.created.length} 条`);
      })
      .catch((error) => {
        console.error("钉钉消息写入本地失败：", error.message);
      });

    return { status: EventAck.SUCCESS, message: "received" };
  });

  console.info("正在连接钉钉 Stream，请保持本地日报服务已启动。");
  await client.connect();

  process.on("SIGINT", () => {
    client.disconnect();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
