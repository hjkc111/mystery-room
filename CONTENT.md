# 剧本来源与改编边界

当前内容：**《溪谷里的最后一声》四人改编测试本 v1**。不是网上已发布的4人商业剧本，也未取得高分评价或真人盲测认证。

原作：Arthur Conan Doyle, *The Boscombe Valley Mystery* (1891)，收入 *The Adventures of Sherlock Holmes* (1892)。原作者卒于1930年。采用原作人物与案件核心，中文表述为本项目重新创作，不使用现代中文译本、影视设定或商业剧本。

原文来源：https://www.gutenberg.org/files/1661/1661-h/1661-h.htm#chap04
版本信息：https://www.gutenberg.org/ebooks/1661 （标明 Public domain in the USA）。使用时按所在地适用的公有领域规则；不复制电子书包装或商标。

改编新增：四人同桌结构、威廉的债务与支线、分钟级时间轴、独立不在场证明、鞋钉和纤维复核、可操作地点、两轮证据、分幕阅读、公开证据规则及投票。新增事实以当前游戏为准，不宣称逐字忠实原作。

完整现成小人数剧本检索结果：
- STV There's Been a Murder：https://stvappeal.tv/wp-content/uploads/2020/08/Theres-Been-a-Murder-2020-v3.pdf ，排除式游戏，不是固定角色案件；未选用。
- Matt Clifford：https://www.matthewclifford.com/murder-mysteries ，Élysée为5角色+主持、自由博弈，CC BY-NC-SA 4.0；不符合本轮固定案件目标，未选用。
- Worms Against Humanity：https://opheliajubensha.itch.io/jubensha-worms-against-humanity/purchase ，4人、付费、未取得完整材料及网页改编授权；未选用。

## 信息矩阵（不含角色秘密正文）

| 阶段 | 每个角色章节数 | 调查权限 | 公开证据 |
|---|---:|---|---|
| 准备 | 0 | 无 | 无 |
| 阅读/介绍 | 1 | 无 | 无 |
| 初搜 | 1 | 自己的1个个人对象+4公共对象；3次机会 | 仅玩家主动公开 |
| 讨论 | 2 | 无 | 每人至少公开1条第一轮证据 |
| 深搜 | 2 | 4个复核对象；每人2次 | 仅主动公开；必须合作收齐 |
| 陈述/投票 | 3 | 无 | 自动归档4条第二轮复核 |
| 复盘 | 3 | 无 | 全部答案、时间线和证据链 |

完整角色本、凶手身份和答案仅在 `server/case.mjs`，不能放入 public。主线四份复核必须集齐，因此不依赖凶手交出自己的约见信，也不依赖女儿主动承认父亲习惯。已读过原作的玩家会知道真相，应选择凶手或仅作为测试人员。
