const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");
const PORT = 51973;

function waitForServer() {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${PORT}/api/health`);
        if (response.ok) return resolve();
      } catch (error) {
        // Server is still starting.
      }
      if (Date.now() - started > 5000) {
        reject(new Error("server did not start"));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

test("POST /api/ingest parses and saves DingTalk text as records", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dailywork-ingest-"));
  const dataDir = path.join(tempDir, "data");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(path.join(ROOT, "data", "project-kb.json"), path.join(dataDir, "project-kb.json"));

  const child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: dataDir,
    },
    stdio: "pipe",
  });

  try {
    await waitForServer();

    const response = await fetch(`http://127.0.0.1:${PORT}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "完成通信系统软著申请；明天完成TR5 PPT修改",
        source: "钉钉机器人",
      }),
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.created.length, 2);
    assert.equal(body.created[0].status, "已完成");
    assert.equal(body.created[0].project, "通信系统");
    assert.equal(body.created[0].source, "钉钉机器人");
    assert.equal(body.created[1].status, "待办");

    const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, "daily-records.json"), "utf8"));
    assert.equal(persisted.length, 2);
  } finally {
    child.kill();
  }
});
