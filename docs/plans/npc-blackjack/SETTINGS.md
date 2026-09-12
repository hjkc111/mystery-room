# 配置、同步与兼容约定

2026-09-12。**本轮只登记配置，不修改 .env、Sites Secret、运行代码或数据库。** “拟新增”不代表程序已支持。

## 当前配置基线

来源为 server/ai.mjs、public/world-map.js、public/realtime.js、server/world.mjs、.env.example 与 .openai/hosting.json；以下 AI 数值是代码默认值，未读取或展示用户密钥，也未把默认值冒充线上覆写值。

| 项目 | 当前值/约定 | 本轮操作 |
|---|---|---|
| Sites项目 | appgprj_6aa3bfbf75088191be74000731a3f83e | 复用，只读确认 |
| 访问范围 | public，当前账号 owner | 保持 |
| Github origin | https://github.com/hjkc111/mystery-room.git | 保持关联，文档同步 |
| D1 / R2 | DB / null | 不增加服务、不改绑定 |
| PORT | 默认4318，仅本地 | 不变 |
| DEEPSEEK_API_KEY | 服务端 Secret / 本地.env | 不读取值、不写入文档或图片 |
| AI_BASE_URL | 默认 https://api.deepseek.com | 不变 |
| AI_MODEL | 默认 deepseek-flash | 不变 |
| AI_TIMEOUT_MS | 默认20000 | 不变 |
| AI_MAX_TOKENS | 默认700 | 不变 |
| AI_ROOM_BUDGET | 默认80，失败也计数 | 保留总预算，再加自主子预算 |
| 真人位置 | WebRTC 最多20Hz，HTTP权威，450ms轮询 | 复用；新增NPC权威路径 |
| 地图 | 768×480逻辑坐标、32格、半径10、交互56 | 首版沿用；手机改变摄像机而非缩小世界 |
| 真人速度 | 160 px/s，距离预算最多320 | 保持并纳入回归 |
| 迁移基线 | 0000–0003 | 不修改旧迁移，不在准备阶段生成新迁移 |

## 拟新增设置：在实际实现后启用

默认保存在一个普通服务端配置对象，不为每个视觉常量增加环境变量。安全相关设置以服务器为准，客户端修改无效；需要部署级覆盖时再加入同名 .env.example 与 Sites 运行值。

| 拟设置 | 初值 | 归属/说明 |
|---|---:|---|
| rulesVersion | npc-cards-v1 | 新房间快照；旧房间保持旧模式 |
| autonomousNpc | true | 仅新房间；房主可逐NPC暂停 |
| minigamesEnabled | true | 仅允许阶段0、4、8，阶段4需分享达标 |
| npcSpeed | 120 px/s | 比真人略慢，能追上并叫住；待测 |
| npcTickMs | 2000 | 一个在线前台协调客户端发起；服务端租约防多次执行 |
| npcLeaseMs | 25000 | 长于20秒单次模型超时；令牌检查迟到结果 |
| npcReplanMinMs | 45000 | 自动模型决策间隔，不限制普通行走 |
| npcAutoBudget | 24/房间 | 且不超过总AI预算 |
| npcAutoBudgetPerPlayer | 8 | 阶段驱动，不每步调用 |
| interactiveReserve | 24 | 剩余≤24时停止自动模型请求，真人仍可使用 |
| npcPublicSpeechGapMs | 12000 | 防止三位NPC连续刷屏 |
| npcIdleDwellMs | 5000–12000 | 空闲兴趣点停留 |
| npcHumanOfflineMs | 20000 | 全部真人离线后停止新任务，恢复不补跑 |
| invitationMs | 20000 | 会客室/牌桌邀请默认期限 |
| blackjackSeats | 2 | 真人/AI共同占席，不另生成分身 |
| blackjackRounds | 3 | 每局重新洗52张牌 |
| blackjackTurnMs | 45000 | 每小局总决策时间；要牌不续时 |
| blackjackResultMs | 6000 | 小局揭牌展示后自动下一局 |
| activityReconnectMs | 20000 | 断线可恢复期限 |
| memoryPairs | 8 | 4×4，本地翻牌游戏 |
| reducedMotion | 系统偏好，可手动覆盖 | 仅本设备展示偏好，不影响结果 |
| soundEnabled | 首次用户交互后可开 | 本设备偏好；默认不突然播放音效 |

## 同步的统一真值

- 剧本规则、AI调用次数、NPC任务、路径时间、座位、牌堆、手牌、比分、阶段、deadline：服务器/D1。
- 真人即时位置：本地预测 + WebRTC；移动和交互仍由服务器确认。
- NPC即时画面：依据服务器路径与模拟时钟插值，客户端不能给NPC发行动命令或凭P2P坐标搜证。
- 手牌：只发送本人手牌；对方到揭牌时公开；P2P不传卡牌、私聊或剧本。
- 音量、降低动态、面板位置、单人翻牌局：本设备，不假装跨设备同步。

离线时暂停NPC模拟进度：最多推进到最后真人活动时刻+20秒；回来后平移任务开始时间恢复，不能使用离线一小时的墙钟时间直接算作走完并搜证。这个NPC模拟时钟与原主线deadline分开；牌桌按既定断线规则取消/弃权。

## 配置变更和回滚

1. 先更新本文件与主方案，再实现对应配置。提交时同时更新进度和实际测试结果。
2. 新房间保存规则版本；已有房间不热切换到自主模式。迁移新增字段/表允许旧行使用安全默认值。
3. npc/autonomy 和小游戏可分别关闭。关闭时取消任务租约、释放邀请/座位，回到规则允许的状态，不能删除已获证据。
4. 保留旧的手动模式用于旧房间与故障恢复，但新模式不得调用旧“批量调查后瞬移”的捷径来通过验收。
5. 回滚代码前检查新版本房间的兼容性；不能把新牌局状态直接交给不认识它的旧代码。必要时仅关闭新入口并允许已开始局安全终止。
6. 本轮不申请新密钥、不改变额度、不新增第三方账号、不部署。之后实施仍使用同一仓库与公开站点。
