# 免费素材清单与视觉取舍

2026-09-12。四份原始ZIP已实际下载并复制到本目录的 assets/archives；各自原始许可文件保留在 assets/licenses，文件大小与SHA256在 [MANIFEST.json](assets/MANIFEST.json)。合计约2.81MB原包。本轮未放进 public，也未发布。

## 已收集并复核

| 素材 | 官方来源 | 许可证据 | 实际规格 | 选用结论 |
|---|---|---|---|---|
| Kenney Roguelike/RPG | [官方页](https://kenney.nl/assets/roguelike-rpg-pack) | [原License](assets/licenses/kenney-roguelike-rpg.txt)，CC0 | 主透明图968×526，16×16图块、间隔1px；地形/家具/门/树等 | 保留作基础；主要提升来自重新布景与分层，不能声称换包即变精致 |
| Kenney Playing Cards | [官方页](https://kenney.nl/assets/playing-cards-pack) | [原License](assets/licenses/kenney-playing-cards.txt)，CC0 | small/medium/large 16/32/64画布，52牌和背面等 | 21点首选；优先large并按整数比例展示，牌面需要逐项映射验证 |
| Kenney UI Pack 2.0 | [官方页](https://kenney.nl/assets/ui-pack) | [原License](assets/licenses/kenney-ui.txt)，CC0 | 868个PNG，含面板/箭头/按钮，不是像素庄园整体皮肤 | **仅备选参考**；亮蓝圆润风与庄园冲突，不原样接入、不为此更换现有UI栈 |
| Foozle / Atari Boy Legend Main Character | [官方页](https://foozlecc.itch.io/legend-main-character) | [原Readme](assets/licenses/foozle-legend-main-character.txt)，CC0，允许修改和商业使用 | 三种换色PNG+aseprite+demo；每表1344×4928，64×64帧格 | 动画原型首选；人物装束与案件角色不符，后续定制服装与轮廓 |

上述四份本地许可证均已由主代理阅读并与原包核对，SHA256重新计算一致。CC0不要求署名，项目仍保留来源与作者记录。[CC0说明](https://creativecommons.org/publicdomain/zero/1.0/)。免费价格本身不构成许可依据，其他来源未核实前不得加入。

## 人物图集的实际视觉检查

主代理实际查看了图集裁图和逐行缩略图：[逐行检查图](assets/npc-row-inspection.png)。能看见正面、侧面和背面，不是仅用一张正面图左右晃动。官方标明支持四方向及idle/interact/walk；左右侧的具体镜像方式、动画标签和有效帧数需要在接入时读取aseprite或逐帧验证，**本轮未制作完整动画映射表**。

特别注意：64×64是帧画布，不等于人物有64像素高。实际首帧非透明范围 `(24,25)-(40,48)`，即16×23像素。不能把透明留白也缩放成人物尺寸；应统一脚底锚点，再与16px地图组合。这一点已修正初筛时“64px人物密度与16px地图不一致”的粗略判断。

三个换色只有同一个冒险者，不是三名不同角色。四角色最终需要年纪、头发、服装和轮廓差异；不能交付四个同款紫帽人。缺失的角色美术制作列入P4，未假称已收齐成品角色。

## 视觉选择与缺口

- 地图优先复用已安装的Kenney基础，不把新找素材数量当作质量；庭院需要道路、岸线、树群与灯光结构，室内需要地毯、桌边座位、墙体与前景遮挡。
- 卡牌实际字体/花色可用，功能布局仍需实现。包里没有完整21点界面、发牌状态或AI策略。
- UI蓝色皮肤不采用；继续用统一深色文字界面和琥珀色强调。
- 没有已完成的庄园角色群像、完整雨夜场景背景、角色四向定制服装、牌桌最终构图。本轮原料足以启动P1/P3，精修制作仍属P4。
- 未收集音乐；首版只拟用轻量本地交互提示音，不承诺已有背景乐。若后续采用音频包，须同样保留许可。

## 文件使用规则

1. 原ZIP只作为文档材料，不能整体拷进生产static白名单。生产只选用必要图块/动画帧，并保留归属许可。
2. 地图和人物必须使用相同整数像素放大，禁止把人物、扑克牌或家具横向拉长填空间。
3. 修改后的角色与场景衍生文件另记来源和修改说明；原包SHA不可被改成衍生物SHA。
4. `asset-contact-sheet.png`是初筛全包预览，人物在全图中太小，不能据此完成动画验收；使用逐行检查图补充。
5. [视觉样板](visual-board.html)和对应PNG只展示本轮方向、素材与牌桌信息布局，不是可玩原型，也不代表线上已经改成这样。


## 实施素材（2026-09-12）

- 扑克牌：public/assets/cards 采用 Kenney Playing Cards 的52张牌面和背面，CC0，许可随 public/assets/LICENSE-cards.txt。构建白名单只打包需要的53张PNG。
- 地图：沿用已有 Kenney 图集，加 Canvas 绘制的地毯、窗框、灯光、步道和牌桌。
- 人物：public/assets/manor-characters.png 是本次使用内置 imagegen 生成的四人四方向透明图，不是从第三方下载的CC0角色包。原图1254×1254，已目视核验16个人物完整；渲染使用逐角色实测矩形而非假设64px等格。四方向姿态配合程序步幅动态；未使用失败的悬浮帽子图集。
- Foozle 原素材仍作为参考原包留在文档素材目录，本版实际人物没有使用它的换色素材。未向运行包加入原始ZIP或未使用UI图集。
