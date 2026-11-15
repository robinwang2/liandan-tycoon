# 任务：《炼丹大亨》3A 版界面换皮（只写 CSS）

《炼丹大亨》是一款 AI 创业讽刺模拟游戏：全屏 three.js 3D 沙盘（微缩景观风格的城市 + 剖开的办公室，带景深、泛光、昼夜），上面盖一层 DOM 界面。
现在的界面是「卡通贴纸风」：亮色底、粗黑描边、硬投影、圆滚滚的字。3A 版要换成**电影感的深色玻璃 HUD**：克制、精致、信息密度高但不挤，像一款高预算的策略经营游戏。

只允许创建：`src/hud.css`。**不要改任何其它文件**（JS、HTML、旧的 CSS 都不要动，有别人在同时改）。
`src/hud.css` 会在 `style.css`、`pdx.css`、`extra.css` 之后加载，所以你写的是**覆盖层**：选择器的优先级要够，必要时用 `!important`，但别滥用。

## 先读这些文件，搞清楚所有的结构和类名
- `src/ui/ui.js`：所有界面都是这里拼出来的 HTML 字符串（标题页 `title()`、建角向导 `wizard()`、局外成长 `metaScreen()`、顶栏 `topbar()`、左栏 `leftPanel()`、右栏 `rightPanel()`、底栏 `bottom()`、提示条 `toastHTML()`、P 社风格事件窗 `modal()`、结局 `endScreen()`、新手教学卡 `tutorHTML()`、员工气泡 `popHTML()`）。
- `src/style.css`、`src/pdx.css`、`src/extra.css`：现在的样式。注意 `--z` 这个变量（整体缩放），以及 `.left` `.right` `.top` `.bottom` 的位置和尺寸——**3D 镜头会读取这四块面板的位置来决定把沙盘放在哪**，所以它们的位置和大小只能微调，不能大改布局。

## 另外还有这些新元素（别人正在往 ui.js 里加，按这个结构给它们写样式）
1. 图标：`<svg class="ic" width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" …>`。线性图标，颜色跟随文字。会出现在：顶栏指标 `.chip .ci` 里（20px）、左右栏页签 `.tab` 里（18px）、右栏指标 `.gauges .g span` 里（14px）、行动卡片 `.act .ic` 里（22px，原来这里是 emoji）、「下个月」按钮里。
2. 顶栏右侧多了一个设置按钮：`<button class="btn icon" data-a="settings">…svg…</button>`（方形、只有图标）。标题页也有一个同样的按钮。
3. 设置面板：
   ```html
   <div class="veil"><section class="settings panel">
     <h2><svg class="ic">…</svg> 设置</h2>
     <h4>画质</h4>
     <div class="seg"><button class="on">流畅</button><button>均衡</button><button>高</button><button>电影</button></div>
     <label class="chk"><input type="checkbox"> 自动调整（卡顿时自动降一档）</label>
     <p class="note">当前约 60 帧 · 显卡每帧 4.2 毫秒</p>
     <h4>声音</h4>
     <div class="set-row"><span>总音量</span><input type="range" min="0" max="100"><b>70</b></div>   （共 4 行：总音量 / 音乐 / 音效 / 环境声）
     <label class="chk"><input type="checkbox"> 静音</label>
     <h4>显示</h4>
     <label class="chk"><input type="checkbox"> 显示帧率</label>
     <div class="row"><button class="btn go">完成</button></div>
   </section></div>
   ```
   宽约 420px，居中。滑杆要自己画（`appearance: none`）：细轨道 + 金色填充感 + 圆形拇指。
4. 帧率角标：`<div class="fps">60 FPS · 4.2 ms</div>`，固定在屏幕左下角很小一块，等宽数字。

## 美术方向
- **面板**：深色半透明玻璃。参考值：`background: linear-gradient(180deg, rgba(22,27,38,.78), rgba(12,15,22,.72))`，`backdrop-filter: blur(18px) saturate(150%)`，`border: 1px solid rgba(255,255,255,.09)`，顶边一道 1px 的内高光（`box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 18px 50px rgba(0,0,0,.35)`），圆角 14px。去掉所有粗黑描边和硬投影。
- **字**：`"PingFang SC","Microsoft YaHei UI","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif`。正文 13px 左右，浅色（#e8ecf3），次要信息 #9aa4b5，再次要 #6b7587。所有数字 `font-variant-numeric: tabular-nums`。小标题（h4）用 11px 大写字距（letter-spacing .14em）+ 暗金色。不要依赖任何网络字体（成品是离线单文件）。
- **强调色**：暖金 `#f2c46d`（主按钮、选中态、重点数字）；好 `#5fd39a`；坏 `#ff7a72`；信息 `#6cb6ff`；黑料/危险 `#c084fc`。把这些定义成 `:root` 变量（比如 `--gold` `--good` `--bad` `--info` `--ink-1` `--ink-2` `--ink-3` `--glass` `--line`），整份 CSS 都用变量。
- **按钮**：普通按钮是玻璃描边（hover 时边框和文字变亮、轻微上浮 1px）；`.btn.go`、`.next` 这种主按钮是金色渐变 + 深色字 + 柔和的金色外发光；`.btn.ghost` 只有文字；`[disabled]` 降低不透明度。所有可点的东西都要有 `:hover`、`:active`、`:focus-visible`（金色外框）。
- **进度条/指标条**：6px 高，深色凹槽 + 渐变填充 + 很淡的同色光晕。
- **页签**：图标在上、字在下，未选中是暗灰，选中是金色 + 底部一条 2px 金线。
- **行动卡片 `.act`**：一行一个，左边 36px 的圆角图标底座（深色 + 1px 边），中间名称 + 说明，右边行动点和花费。hover 时整行微亮、左侧出现一道金色细条。`.off` 置灰；`.shady`（黑箱操作）用紫色调点缀。
- **顶栏**：通栏玻璃条，左边公司 Logo + 名字 + 日期，中间一排指标 chip（图标 + 小标签 + 大数字 + 一行小注释），右边行动点（一排小圆点，亮的是金色）和「下个月」主按钮。
- **事件窗 `.pdx`**（P 社风格，这是全游戏最重要的界面）：保留「厚重的史诗感」，但做得更精致：深色底、细的金色双线边框（外框 + 内缩 4px 的第二道细线）、四角小装饰（用渐变或伪元素画小方块/菱形即可）。顶部插画加一层自下而上的暗角渐变让标题压在图上更清楚；标题用较大的字号 + 字距 + 柔和的投影。选项是一行一行的条目：左边一道细金线、hover 时背景变亮金线变粗；悬停时出现的效果预览 `.tip` 要像 P 社的提示框（深底、金边、绿/红文字）。判定结果的印章 `.stamp` 做成斜着盖的红/绿印章。三选一董事会卡 `.pcard` 做成竖版卡牌：稀有度 `r1/r2/r3` 分别是银、金、彩虹边。
- **标题页**：左侧一列。「炼丹大亨」四个大字用金色渐变填充（`background-clip: text`）+ 很轻的发光，副标题小字大字距；按钮竖排。底部的小字说明放在一块小玻璃上。整体要像主机游戏的开始菜单。
- **建角向导 `.wizard`**：一张大玻璃卡片，步骤条做成细线 + 圆点。选项卡片（地区、特质、Logo）选中时金色描边 + 微光。
- **提示条 `.toast`、新手教学卡 `.tutor`、员工气泡 `.pop`、结局页 `.endc`、局外成长页**：统一成同一套玻璃风格。
- **动效**：面板入场淡入 + 轻微上移（.25s），事件窗缩放淡入（.3s，带一点点回弹），遮罩 `.veil` 是带模糊的暗色渐变。全部包在 `@media (prefers-reduced-motion: no-preference)` 里。
- 滚动条做成细的深色（`::-webkit-scrollbar` + `scrollbar-color`）。

## 自查
- 写完后从头到尾检查一遍 ui.js 里出现的每一个类名，确认都有合适的新样式，没有残留的粗黑描边、硬投影、亮黄底。
- 浅色文字放在玻璃上要有足够的对比度。
- 不要用 `@import`、不要引用外部资源。
- 最后用几句话总结：写了多少行、覆盖了哪些界面、有哪些你没把握需要真人看效果的地方。
