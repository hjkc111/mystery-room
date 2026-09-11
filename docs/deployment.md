# 部署与配置

目标是由 Sites 一起发布网页和 Cloudflare Worker API，D1 保存房间。部署实施中，最终 URL、绑定和执行结果见[实现状态](implementation-status.md)。

## 开发准备

```sh
npm ci
npm test
npm run build
```

以最终 `package.json` 为准，当前版本需要重新执行验证。只发布 `public/` 会丢失会话、规则、数据库和 AI API，不是完整游戏。

## AI 服务端配置

| 变量 | 默认/用途 |
|---|---|
| `DEEPSEEK_API_KEY` | 留空为规则主持；线上配置为服务端 Secret |
| `AI_BASE_URL` | `https://api.deepseek.com`，不加 `/chat/completions` |
| `AI_MODEL` | `deepseek-flash` |
| `AI_TIMEOUT_MS` | `20000` |
| `AI_MAX_TOKENS` | `700` |
| `AI_ROOM_BUDGET` | `80`，按最终实现确认计数语义 |

本地 `.env` 不会自动传给线上 Worker。线上通过部署平台 Secret/环境变量注入；Key 不进入前端、GitHub、日志或邀请链接，模板保留空值。模型名以账户实际权限和[官方文档](https://api-docs.deepseek.com/)为准，默认配置不是实际连通证明。

## 发布核对

1. D1 绑定名称与 Worker 代码一致，应用仓库 schema/迁移。旧版 `data/` 数据库不是 D1 绑定。
2. 构建静态白名单，排除环境文件、服务器源、数据库和秘密材料。
3. API 与页面同源，HTTPS Cookie 和来源校验匹配最终公开入口。
4. 发布后创建独立身份，写入 D1，刷新及新 Worker 实例后仍恢复进度。
5. 四个隔离身份完成读本、搜证、交流、指控和复盘。
6. 并发同版本动作只能一个成功，同 requestId 重放不重复扣点。
7. 有真实 Key 后另测真实模型；没有 Key 则明确仅规则主持及模拟协议已测。

公网页面可被访问，房间通过邀请码加入。知道未满房间邀请码的人可以入席，请仅给朋友。GitHub 源码含答案，发游戏地址而非源码页。

## 限制

约800 ms轮询持续产生请求和数据库访问。平台额度、慢网、长期运行和多房并发须实测，不承诺免费额度支持无限房间。后台标签页可能被节流，回到前台应取最新状态。

不要照旧版常驻 Node、WebSocket Upgrade 或持久卷命令部署。数据库 schema 改动应通过明确迁移，涉及已有房间时确认兼容性与备份。

## 本地与Sites构建

`npm start`加载.env、构建Worker并启动Miniflare，按drizzle文件顺序迁移本地D1；数据在data/worker中。`npm run db:generate`根据db/schema.ts生成追加迁移。线上构建入口为dist/server/index.js，静态内容嵌入Worker白名单，仅/、/app.js、/style.css对外提供。部署包还包含dist/.openai/hosting.json和dist/.openai/drizzle，Sites负责真实DB资源与迁移。

本地默认配置与线上AI变量一致；线上Key作为Secret另行设置，填本地.env不会自动同步。发布入口公开，符合拿链接即可访问的要求；房间码控制入局。
