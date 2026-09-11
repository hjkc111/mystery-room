# 溪谷里的最后一声 · 四人朋友局

[打开游戏](https://valley-mystery-friends.hjkc20050804.chatgpt.site) · [GitHub自动测试](https://github.com/hjkc111/mystery-room/actions)

给四位朋友一起玩的网页剧本杀初版：各自读本、两轮搜证、公聊与私聊、最终陈述、秘密指控和真相复盘。房主也是玩家；规则主持负责流程，可选接入 AI 辅助回答问题。

**已重构为 Cloudflare Worker + D1，使用 Sites 发布。Worker/D1 自动化11项通过，Sites公网四人完整流程通过，GitHub Actions通过；详细验收见[实现状态](docs/implementation-status.md)。**

这是根据柯南·道尔公有领域原作重新创作的四人改编测试本，不是已获高分的商业剧本。45–65 分钟是设计估计，尚未完成四名真人完整盲测。

> **剧透提醒：** 公开源码中的 `server/case.mjs` 和测试包含秘密与答案。准备参与游戏的人请只打开游戏网址，不要阅读源码、测试或原作。网页按权限分发信息，但公开仓库不能阻止玩家自行查答案。

## 怎么玩

1. 房主打开部署后网址，输入称呼，创建房间。
2. 将邀请链接或房间码发给另外三位朋友，各选不同角色并准备。
3. 私密读本 → 开场陈述 → 初次搜证 → 交换质询 → 深入调查 → 最终陈述 → 秘密指控 → 真相复盘。
4. 证据默认私有，主动出示后全桌可见；第二轮复核在最终陈述统一公开。

每位玩家使用自己的设备或独立浏览器配置。普通标签页共享 Cookie，不能充当四个玩家。网页提供文字交流，语音可用你们已有的通话软件，目前没有内置音视频。

## 联机和 AI

浏览器约每 **800 ms** 请求 `/api/state`，操作发送到 `/api/action`。服务器校验身份和阶段，通过版本比较和请求去重保存 D1 状态。适合文字朋友局；这不是 WebSocket 推送或毫秒级动作游戏同步，实际延迟还包括网络与请求耗时。

AI 默认 `deepseek-flash`，可配置兼容 Chat Completions 的服务；密钥只在服务端设置。AI 只接收提问者当前材料，不改游戏事实。无 Key 或接口失败时回退规则主持，不阻止搜证和结算。真实 DeepSeek 与公网“问主持”已实测通过，见[接口型号与验收记录](docs/deepseek-verification.md)。

## 开发与文档

这是JavaScript项目，不需要Python的requirements.txt。依赖清单在package.json，锁定版本在package-lock.json，使用npm ci安装。

```sh
npm ci
npm test
npm run build
# 首次创建本地配置：复制 .env.example 为 .env
npm start
# 另一终端执行四人浏览器验证
npm run test:browser
```

本地预览为 http://localhost:4318 ，需要Node 24及Chrome。首次依赖安装后若没有Chrome可运行 `npx playwright install chrome`。公网服务是 Worker + D1，不要照历史文档启动常驻 Node/ws，也不能只上传 `public/` 作为完整游戏。

- [架构与同步](docs/architecture.md)
- [API与数据说明](docs/api-and-data.md)
- [规则与信息矩阵](docs/rules-and-information.md)
- [部署与配置](docs/deployment.md)
- [实现状态](docs/implementation-status.md)
- [测试说明](docs/testing.md) · [测试代码](test/)
- [历史设计与旧版验证](docs/initial-design.md)
- [内容来源](CONTENT.md)

面向小规模邀请朋友局；没有账号找回、公开匹配、付费系统或商业剧本库。知道未满房间邀请码的人可以加入，请不要公开分享。清除 Cookie 会丢失当前身份。
