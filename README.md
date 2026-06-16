# 日常动作与报告系统

这是一个分阶段建设的个人工作记录与报告系统。当前工作区先实现 **本地 MVP**，用于确认从对话/钉钉输入、自动归集、日历审查、日报生成与钉钉发送的主流程。

## 当前产物

- `prototype/index.html`：可直接打开的低保真交互原型。
- `docs/phase1-prototype.md`：Phase 1 原型设计说明。
- `docs/implementation-roadmap.md`：后续设计稿、前端、后端阶段交接路线。
- `data/daily-records.json`：当前对话中已记录的真实事项，后续可迁移进数据库。
- `data/reports.json`：本地生成的历史报告草稿，后续可迁移进数据库。
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

当前服务不接 PostgreSQL、不接 AI。记录会通过本地 API 保存到 `data/daily-records.json`，报告草稿保存到 `data/reports.json`。网页不再承担输入入口，主要用于按日历审查记录、修改记录、查看历史日报并人工确认发送到钉钉。

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
