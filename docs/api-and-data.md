# HTTP API 与数据结构

所有路径与网页同源。POST要求正确Origin及JSON，除建立身份外都使用HttpOnly Cookie；请求里的playerId不会改变身份。

| 请求 | 输入/返回 |
|---|---|
| GET /health | D1连接检查、transport=http-poll、pollMs=800 |
| GET /api/session | 当前身份及曾加入房间列表 |
| POST /api/session | `{}`，创建随机身份和30天Cookie |
| POST /api/create | `{ "name": "玩家" }` → 六位code |
| POST /api/join | `{ "name": "朋友", "code": "ABC123" }` |
| GET /api/state?room=ABC123 | 仅该成员可读取的完整授权快照 |
| POST /api/action | 以下动作协议；成功返回ack/history/ai及必要最新state |

```json
{
  "room": "ABC123",
  "type": "investigate",
  "requestId": "unique-request-id",
  "expectedRevision": 17,
  "payload": { "targetId": "来自授权targets列表的id" }
}
```

| type | payload | 服务端约束 |
|---|---|---|
| role | role：0–3整数 | 准备期、角色未占用 |
| ready | value：布尔值 | 已选角、阶段允许 |
| advance | 空对象 | 房主、必需证据和准备/时间门槛 |
| pause / extend | 空对象 | 房主、进行中的计时幕 |
| investigate | targetId | 当前轮、本人或公共对象、点数、未重复 |
| publish | clueId | 本人拥有的证据、允许公开的阶段 |
| chat | text、to：成员id或null | 1200字符、私聊对象合法 |
| note | text | 私人笔记最多5000字符 |
| vote | suspect、method、evidence数组 | 投票期未截止、理由与已知证据 |
| history | before：非负整数 | 对当前身份已授权消息分页，每页100条 |
| askAI | question | 进行中的阶段、预算、问题最多1000字符 |
| claimHost | 空对象 | 原房主最近活动距今至少60秒 |

冲突409返回最新授权state；客户端仅在同阶段的明确冲突后重试一次。未知结果的断网/超时不会盲目重放。400是规则或参数错误，401身份失效，403权限/来源拒绝，429频率限制，503服务错误。

## D1 表

- rooms：code主键、revision、host、phase、body(JSON)。body包含玩家角色、点数、笔记、选票、阶段、公开证据、近期去重和各自最近AI回答，浏览器不能直接读取。
- sessions：hash主键、id、created。只存身份凭据哈希，Cookie原文不入库。
- seats：room/player复合主键、seen；player索引支持恢复房间。
- messages：id主键、room索引、sender、recipient、body、at。读取始终按房间与当前身份过滤。
- limits：key主键、count、until；用于会话建立及操作限频。

SQL参数全部通过绑定传入。schema和追加迁移分别见db/schema.ts与drizzle目录。本地与生产各有独立数据库，旧Node SQLite不自动导入。
