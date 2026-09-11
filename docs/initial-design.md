# 历史方案与首次本地验证记录

> 以下内容保留于 2026-09-11 Sites 迁移之前，只用于解释早期 Node.js / WebSocket / SQLite 版本。这里的已通过记录不证明 Worker / D1 版本通过，也不是当前部署指南。当前方案见 architecture.md，当前验证见 testing.md。

# 当前实现设计

2026-09-11；已实现四人初版。早期十人候选方案已被用户要求的四人测试范围替代。项目独立于旧冰火游戏；没有修改旧项目。

## 同步

浏览器 → 带Cookie身份的WebSocket操作 → 服务端校验权限、阶段和版本 → 复制房间执行规则 → SQLite持久化成功 → revision加一的个性化快照推送四位玩家。

服务器为唯一裁决者。客户端没有凶手数据库、其他人的秘密章节或全局投票内容。每次操作使用requestId去重，expectedRevision拒绝过期操作并返回最新状态，避免双扣调查次数。客户端不盲目重放不确定请求。断线以退避重连重新获取完整授权快照；多人并发冲突会提示重试。

倒计时以服务器deadline和serverTime计算，不依赖客户端自行推进。心跳判断断线，房主离线一分钟可接管。重启读取SQLite并暂停进行中的房间，保留Cookie对应身份及私人信息。

单Node进程+原生HTTP/SQLite+ws，原生HTML/CSS/JS界面。小规模朋友局每次推送完整授权快照更简单可靠，不做帧同步或多副本广播。HTTPS/WSS公网部署才能让异地朋友加入，当前尚未部署。

## 内容和权限

固定四角色，每人三章，按阶段1/4/6解锁。12条证据：四人各一份个人初搜、四份公共初搜、四份深入复核。阶段矩阵见CONTENT.md。

强制个人调查避免用光点数后卡死；讨论要求每人亲自公开第一轮材料；深搜必须合作集齐四份复核，最终陈述自动公开。投票前可见信息足以推导凶手，不要求凶手自白。个人支线依据本人主动出示的特定证据结算，不因他人公开自动完成。结案时展示全部证据供核对。

会话用随机高熵Cookie，数据库只存token哈希；同源验证、请求大小及频率限制、白名单静态资源、逐人视图过滤保护数据。房间码是邀请凭据，不做公开大厅；谁知道未满房间的邀请码就可以加入，未实现额外密码或踢人。

## AI主持

配置默认deepseek-flash及DeepSeek Chat Completions。仅将当前玩家已知材料交给模型，不发送全案答案，不允许模型修改规则状态。缺Key和服务异常回退规则主持。设置超时、回复长度和房间次数预算。没有真人Key，模型真实可用性尚待验证；AI推理文本也不能视为系统新增证据。

## 已完成与边界

完整浏览器四人流程、自动化阶段/角色权限检查、实时网络与重启恢复、Mock AI集成均已通过，详见TEST-REPORT.md。未验证公网、实体跨设备联机、真实DeepSeek或真人剧本体验。采用原作重新改编的测试本，不宣称已有商业剧本评分。


---

# Friends Mystery Implementation Plan

> Agent execution: implement inline with independent evidence review. The user approved implementation and comprehensive verification on 2026-09-11; do not pause again for routine implementation choices.

**Goal:** a complete private friends game with four independent clients, server-authoritative WebSocket play, isolated clues and configurable DeepSeek hosting.

**Architecture:** one Node process, SQLite transactions for room snapshots and sessions, individual public/private projections on each event. AI receives only the requesting player's allowed facts and never mutates game state.

**Tech Stack:** Node 24 built-in HTTP/SQLite/test runner, ws, plain accessible HTML/CSS/JS.

**Spec:** DESIGN.md; user revised size to 4–6 on 2026-09-11. The shipped case is a disclosed original four-player adaptation of a public-domain story; no existing highly rated commercial four-player case is claimed.

## Constraints
- No existing game files changed. No credentials in source or browser.
- Every role receives exactly its unlocked chapters and discoverable evidence; never send hidden answers.
- One full playable case, not placeholder content. AI failure must not stop the game.
- Internet play requires a verified public host; do not claim LAN tests prove internet reachability.

## Tasks
- [x] 1. `server/game.mjs`, `server/case.mjs`, `test/game.test.mjs`: write tests for four seats, all phases, invalid actions, exact role projections, voting and tie paths. Run `node --test test/game.test.mjs` red; implement deterministic rules; run green.
- [x] 2. `server/index.mjs`, `test/network.test.mjs`: HTTP cookie sessions, origin checks, WebSocket snapshots/actions, SQLite persistence, dedup and reconnection. Run real four-client test with ws and isolated cookies, including restart and two rooms.
- [x] 3. `server/ai.mjs`, `test/ai.test.mjs`: env config, scoped prompt, timeouts and finite budget; test against a local mock Chat Completions endpoint and failure cases. Real DeepSeek test requires user key.
- [x] 4. `public/index.html`, `public/app.js`, `public/style.css`: lobby, script reader, investigation, evidence, chat/whisper, notes, controls, vote and reveal. Test desktop and mobile in browser if available.
- [x] 5. `tools/check.mjs`, `README.md`, `CONTENT.md`, `TEST-REPORT.md`: syntax/build checks, independent review, full test run, startup and reachable preview, exact limitations and setup.

## Acceptance protocol
Create four independent HTTP identities, join one code, claim all four distinct roles, ready and advance all stages. Compare each personalized view to an independent content manifest. Investigate all available targets, publish and privately retain evidence, send whispers, vote and reveal. Repeat for tie, zero votes, action replay, reconnect, pause/resume, host takeover, restart and unauthorized requests. Verify HTML/static routes cannot fetch case source, database, env or scripts. Mock AI verifies endpoint, model and prompt isolation; no live key means no claim of live model success.


---

# 验证报告

日期：2026-09-11；Windows、Node 24.3.0、Chrome无头浏览器。

## 已执行并通过

`npm test`：11项测试全部通过，0失败。测试源见test目录。

- 四个角色×九阶段章节/调查权限矩阵；仅解锁本人章节，秘密线索不提前出现，复盘显示全部12条证据。
- 私有证据访问、越阶段操作、非法公开被拒绝，失败不会消耗调查次数。
- 每人个人调查、个人出示、四份复核收集门槛；重复深搜拒绝且不扣次数；个人支线不会因系统公开自动达成。
- 私聊及私人笔记隔离；秘密投票、修改投票、平票、无人投票、逾时投票和暂停处理。
- 四套独立HTTP身份和真实WebSocket完成全局；消息去重、过期版本拒绝、断线恢复、重启后保留进度/身份/私有笔记、第二房间隔离。
- 外站HTTP和WebSocket来源拒绝，非成员WebSocket拒绝，源码、.env、数据库不能经静态路由取得。离线房主接管经过受控时钟测试。
- Mock Chat Completions验证配置模型、鉴权头、请求路径及裁剪后提示词；无Key、429、无效响应、超时回退。

`npm run build`：通过所有JS语法与静态入口检查；原生应用没有编译打包产物。

`node tools/browser-check.mjs`：四个隔离Chrome上下文真正点击界面走完九阶段；验证个人章节数1/2/3、私聊隔离、无Key规则主持、四人秘密指控、正确复盘及全部12条证据；0个pageerror。桌面1366×900，手机390×844，无横向页面溢出。截图在test-results目录。初次连接浏览器工具的多上下文模式报错，最终使用本机Chrome直接执行该脚本成功。

独立内容复核发现并修复：共享证据不能代替每个人亲自出示；复盘必须补齐未收集证据；支线目标不能自动完成；分钟级排除证据应来自独立目击者，不能从鞋印推断精确分钟。

## 证据限制

矩阵检查验证程序按设计发送正确材料；正文一致性另经人工式文本复核。它们不能替代真人盲测或证明推理唯一性、趣味达到商业成品水平。

没有真实DeepSeek Key，因此没有声称已连通真实模型。当前仅本机启动，未部署公网HTTPS/WSS，也未完成两台实体设备/异地网络实测。浏览器快速操作不等于45–65分钟真人局。压测、长期运行、浏览器Cookie丢失找回和生产部署不在本次已验证范围。

