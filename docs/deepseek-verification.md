# DeepSeek 接口与真实调用验收

2026-09-11核对并实测。

## 型号名与版本区别

DeepSeek-V4-Flash-0731 当时使用的API名称是 `deepseek-v4-flash`，不是带日期后缀的模型ID。但[当前官方原文](https://api-docs.deepseek.com/zh-cn/)及[价格/型号页](https://api-docs.deepseek.com/quick_start/pricing/)说明旧名称对应的模型已经下线，其请求会由DeepSeek-V4.1-Flash提供服务，推荐名称为 `deepseek-flash`。

搜索引擎摘要仍可能显示0731时期的内容，应打开原文核对。不能把旧别名仍返回HTTP200当作锁定0731权重的证明。

## 本次实际结果

- GET /models：HTTP200，返回 `deepseek-flash`、`deepseek-v4-pro`。
- POST /chat/completions，指定 `model=deepseek-v4-flash`：HTTP200，返回 `model=deepseek-flash`，回复“连接成功”；该次约432ms。
- Sites服务端已设置 `DEEPSEEK_API_KEY` Secret并重新发布，保留推荐名称 `deepseek-flash`。
- 公网四个独立Chrome身份创建房间、选角色并开局；在网页“问主持”提问成功，返回 `mode=ai`、`model=deepseek-flash`，约2228ms。页面显示“AI 主持回复”，不是规则回退。
- 回复示例：先读自己的角色本，记住时间线与可公开或需隐瞒的秘密；读完点准备。

这些是单次功能验收，不是延迟保证或稳定性压测。真实服务可能更新别名映射，也可能产生不准确的推理文字。

## 重新验收

```powershell
$env:TEST_URL='https://valley-mystery-friends.hjkc20050804.chatgpt.site'
npm run test:live-ai
```

该命令会创建四个真实身份和测试房间，使用站点的真实AI配置调用一次模型，产生相应token用量。它不放进CI；`npm test`仍使用模拟服务，不读取你的真实Key。若未显式设置TEST_URL则拒绝运行。

## 为什么没有 requirements.txt

这个项目使用JavaScript/Node.js及Cloudflare Worker，没有Python代码或Python依赖。依赖清单为 `package.json`，准确解析版本和校验信息由 `package-lock.json`锁定，使用 `npm ci`安装。无需添加空的或不适用的Python requirements.txt。

密钥只保存在本地被忽略的.env和Sites的Secret里，不提交到GitHub。以后修改本地.env并不会自动修改线上Secret，线上变量更新还需要重新发布使其生效。
