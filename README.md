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

现在以 2D 场景进行游戏：WASD / 方向键移动，靠近门或地面线索按空格。每幕进入固定起始场景；两人走进同一会客室后自动私聊，第三人无法进入。手机使用方向按钮和交互键。

真人位置优先通过 WebRTC DataChannel 每秒最多 20 次直连同步，本地预测和远端插值；D1 接口验证实际移动、碰撞、搜证距离及房间容量。直连失败自动回退 HTTP，状态轮询间隔 450 ms，实际还包含网络耗时。公共 STUN 不保证所有 NAT 下直连成功，目前没有 TURN 中继。

AI 默认 `deepseek-flash`，可配置兼容 Chat Completions 的服务；密钥只在服务端设置。AI 只接收提问者当前材料，不改游戏事实。无 Key 或接口失败时回退规则主持，不阻止搜证和结算。真实 DeepSeek 与公网“问主持”已实测通过，见[接口型号与验收记录](docs/deepseek-verification.md)。

## AI 玩家

房主在开局前可将空闲角色「设为 AI 玩家」，或移除 AI 后留给真人。最多三位 AI，保留至少一位真人房主；不支持中途强制替换真人。AI 占用正常角色席位，准备期自动准备。

开局后，在公聊输入 `@角色名 问题`（每次一位），或进入空会客室并邀请该 AI 私聊。也可点击角色卡的 @ 按钮。房主点击「让 AI 完成本幕」后，系统按规则安排该角色的调查、出示证据和准备，大模型负责角色发言及秘密指控。每幕需手动触发，房主仍控制切幕。

AI 只收到它当前已解锁的剧本、个人目标和已知证据。公聊回复不读取私聊，私聊回复只读取公共讨论及与当前提问者的私聊。最近最多 30 条适用消息进入上下文；玩家说法不等于系统证据。模型可能误判或主动隐瞒自身秘密。模型失败或行动不合法时不代为完成本幕，界面提示重试。

AI 玩家与主持共用服务端模型配置、密钥及每局 80 次调用预算（失败调用也计数）。新增权限、私聊隔离、失败重试、重复请求和两人两 AI 完整流程测试；本地全部 13 项通过。真实 DeepSeek 的 @ 对话、私聊和读本行动已通过；完整真人盲测尚未进行。场景改版验收见下方测试报告。

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

## 2D 场景交付

- [完整方案](docs/2d-scene-plan.md)
- [测试报告与限制](docs/2d-scene-test-report.md)
- [场景与碰撞配置](public/world-map.js)
- 像素素材：[Kenney RPG](https://kenney.nl/assets/roguelike-rpg-pack)、[角色包](https://kenney.nl/assets/roguelike-characters)，CC0。许可保存在 public/assets/。
- 故障回退测试：`node tools/browser-resilience.mjs`。
