# 测试目录

执行 `npm test`，使用 Node 自带测试器。`network.test.mjs` 构建真实 Worker 并创建隔离的 Miniflare/D1 数据库，不使用生产站点或真实AI密钥。

| 文件 | 覆盖 |
|---|---|
| game.test.mjs | 四人完整规则流程 |
| content.test.mjs | 角色×阶段信息矩阵、非法权限、AP、线索门槛、公开与支线、投票及私聊 |
| ai.test.mjs | 配置、HTTP兼容协议、授权提示词、无Key和失败回退 |
| network.test.mjs | Worker/D1完整流程、并发CAS、重复请求、身份隔离、数据库原子写入、新实例恢复、历史消息分页、600条大消息 |

`npm run test:browser` 另外执行 `tools/browser-check.mjs`，启动四个独立 Chrome 上下文。`TEST_URL` 可指定已部署站点，默认 http://localhost:4318 。该检查会创建真实测试房间并完成一局，不能对无权测试的地址运行。截图写入被Git忽略的test-results目录。

测试含剧透。详细结果见 [docs/testing.md](../docs/testing.md)。
