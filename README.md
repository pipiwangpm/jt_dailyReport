# 日常动作与报告系统

这是一个分阶段建设的个人工作记录与报告系统。当前工作区先实现 **Phase 1 原型设计**，用于确认移动优先的记录入口、日报样式和归集规则。

## 当前产物

- `prototype/index.html`：可直接打开的低保真交互原型。
- `docs/phase1-prototype.md`：Phase 1 原型设计说明。
- `docs/implementation-roadmap.md`：后续设计稿、前端、后端阶段交接路线。
- `data/daily-records.json`：当前对话中已记录的真实事项，后续可迁移进数据库。
- `data/project-kb.json`：项目知识库，维护项目名和关键词。
- `data/local-config.json`：本地配置，填写钉钉 Webhook 和可选签名密钥。

## 使用方式

启动本地服务：

```bash
npm start
```

然后访问：

```text
http://127.0.0.1:4173
```

当前服务不接 PostgreSQL、不接钉钉、不接 AI。记录会通过本地 API 保存到 `data/daily-records.json`，用来验证如何在手机上快速记录、如何通过当前对话或钉钉机器人输入内容并归集到日期/项目，以及如何按指定样式生成日报。

## 钉钉发送配置

在 `data/local-config.json` 中填写：

```json
{
  "dingtalk": {
    "webhook": "你的钉钉自定义机器人 Webhook",
    "secret": "可选，加签密钥"
  }
}
```

未配置时，页面仍可生成和复制日报，但“发送到钉钉”会提示先配置 Webhook。
