# 任务：为《炼丹大亨》3A 版画一套界面图标（SVG）

《炼丹大亨》是一款 AI 创业讽刺模拟游戏。3A 版的界面要从「卡通 + emoji」换成「深色玻璃质感 HUD」，所以需要一套**原创、风格统一的线性图标**替换掉界面框架里的 emoji。

只允许创建/修改：`src/ui/icons.js`、`icons-demo.html`。别动其它文件（有别人在同时改）。

## 接口

```js
// src/ui/icons.js —— 纯数据 + 一个函数，不依赖 DOM
export const ICONS = { cash: '<path d="…"/><circle …/>', … };   // 值是 24×24 画布里的 SVG 内部标记
export function icon(name, size = 18, cls = '') { … }
// 返回：<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
//        stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">…</svg>
// 未知的 name 返回一个小圆点图标，不能报错。
```

## 风格
- 24×24 画布，四周留 2px 安全边；描边 1.75，圆头圆角；几何感强、简洁，一眼能认出来，16px 下也不能糊成一团。
- 只用 `currentColor`。允许少量 `fill="currentColor"` 的小实心点缀（比如一个点、一个小三角），但主体是线。
- 整套要像出自同一个设计师之手：统一的圆角半径、统一的留白、统一的视觉重量。
- **必须原创绘制**，不要照搬 Lucide / Feather / Material 等现成图标库的 path 数据。
- 每个图标 1~5 个元素（path/circle/rect/line），别画得太碎。

## 清单（name → 含义）

顶栏与指标：`cash` 现金（钞票或硬币堆）、`valuation` 估值（上升的折线图）、`users` 用户（两个人）、`trophy` 榜单名次、`pie` 股权（饼图缺一块）、`calendar` 日期、`next` 下个月（播放/快进箭头）、`ap` 行动点（六边形里一道闪电）、`flame` 热度、`star` 口碑、`smile` 士气、`bank` 监管（带柱子的古典建筑）、`bubble` 泡沫（几个大小不一的圆）、`bomb` 黑料（炸弹）

右侧页签：`board` 榜单（领奖台）、`pin` 项目（图钉）、`team` 团队、`safe` 保险柜、`cards` 卡牌（两张叠着的牌）、`ledger` 账本（小票）、`news` 日志（报纸）

左侧页签：`flask` 研发（烧瓶）、`people` 团队、`coins` 资本、`megaphone` 公关、`gear` 经营

行动：`code` 写代码、`rocket` 发布、`furnace` 丹炉（三足鼎/炼丹炉，有盖，冒一缕烟——这是游戏的标志物，要画得最用心）、`swap` 换料、`puzzle` 功能冲刺、`paper` 发论文、`search_user` 猎头、`party` 团建、`cake` 画饼、`building` 换办公室、`handshake` 融资、`mic` 路演、`bell` 上市敲钟、`book` 卖课、`gift` 补贴、`capitol` 游说（圆顶建筑）、`megaphone_loud` 炒作、`ad` 投广告、`heart` 正面公关、`ghost` 水军、`mask` 刷量（面具）、`washer` 洗白（洗衣机）、`shovel` 挖黑料、`hand` 求情（摊开的手）、`broom` 大扫除

硬件与系统：`gpu` 显卡（芯片）、`server` 机柜、`lock`、`unlock`、`warning` 警告三角、`check`、`x`、`info`、`menu`、`pause`、`play`、`volume` 音量、`mute` 静音、`settings` 设置（滑杆）、`save` 存档、`home` 回标题、`arrow_left`、`arrow_right`、`chevron_down`、`plus`、`minus`、`skull` 黑箱操作、`grad` 新手教学（学士帽）、`clock`、`globe`、`shield`、`bolt`、`target`、`dice` 随机、`sparkles`、`eye` 画质、`camera` 拍照、`sun` 白天、`moon` 夜晚、`rain` 下雨、`music` 音乐

## 演示页（必须做）
`icons-demo.html`：不依赖构建工具，`<script type="module">` 直接 import `./src/ui/icons.js`。
深色背景（#0d1118）上把所有图标按清单顺序排成网格：每格显示 28px 的图标 + name，下面再放一排 16px 的同一批图标检验小尺寸可读性；再放一组浅色背景的对照。

## 自检
写完后用 Node 跑一段脚本（不用留文件）：import 这个模块，确认清单里每个 name 都存在、每个值都是合法的 SVG 片段（标签闭合、没有 `fill` 写死颜色、坐标都在 0~24 内）、`icon('不存在')` 不报错。

最后用几句话总结：一共多少个图标、哪些你觉得画得不够好。
