# 任务：为《炼丹大亨》画公司 Logo 库，并让 3D 沙盘的招牌显示 Logo

> 后记：这是当初发给 Codex 的任务书，湾区那 8 个 Logo 后来重画了。「菊花」指的不是真的花，而是湾区 AI 公司那种「一个圆稍微变个形」的抽象标，
> 所以现在是 `orb_burst`（星芒）、`orb_knot`（结环）、`orb_star`（四芒星）、`orb_slash`（斜环）、`orb_rings`（同心环）、`orb_aperture`（光圈）、`orb_spiral`（旋涡）、`orb_dots`（点阵环），
> 旧存档里的 `daisy_*` 会自动对应过去（见 `src/ui/logos.js` 的 `ALIAS`）。下面第 5、15、27 行关于「菊花变体」的描述已经过时。

《炼丹大亨》是一款 AI 创业讽刺模拟游戏。建角时玩家要给公司选 Logo，这里有个行业梗：
- **深圳（中国公司）**：互联网公司的 Logo 都是动物 —— 从 8 种动物里选
- **湾区（美国公司）**：AI 公司的 Logo 全是「一个圆往外放射」的图案，被网友戏称「菊花」 —— 从 8 种「菊花变体」里选

只允许创建/修改：`src/ui/logos.js`、`logos-demo.html`、`src/scene/office.js`、`src/scene/demo.js`。别动其它文件（有别人在同时改）。

## 一、`src/ui/logos.js`

```js
export const BRAND_COLORS = ['#ff6b4a', ...];   // 8 个好看、互相区分明显的品牌色
export const LOGOS = {
  sz:  [ { id: 'whale', name: '鲸鱼', desc: '深度思考，偶尔搁浅', draw: color => '<svg ...>…</svg>' }, ... 共 8 个 ],
  bay: [ { id: 'daisy_classic', name: '经典菊', desc: '设计师说这代表连接与无限', draw: color => '<svg ...>…</svg>' }, ... 共 8 个 ],
};
export function logoSVG(id, color, size = 48)   // 返回可直接塞进 innerHTML 的 <svg> 字符串（带 width/height）
export function logoDataURL(id, color)          // 返回 'data:image/svg+xml;utf8,...'，给 3D 招牌当贴图用
export function findLogo(id)                    // 返回 { id, name, desc, draw } 或 undefined
```

设计要求：
- 全部用手写 SVG 路径，`viewBox="0 0 64 64"`，透明背景，**主色用传入的 color**，可搭配白色和一种由主色加深得到的暗色；扁平、极简、圆润，像真正的科技公司 Logo
- **24px 下也要一眼认得出是什么**（动物看轮廓，菊花看结构）
- **必须原创**：不能临摹或影射任何现实品牌的 Logo（不要画出现实中某家 AI 公司的结环/星芒图形，也不要画现实中某家互联网公司的企鹅/猫/狗造型）。只是「通用的动物」和「通用的放射状花形」
- 深圳 8 种动物：鲸鱼、熊猫、柴犬、橘猫、大鹅、牛、龙、水豚。每个配一句自嘲式 desc（≤14 字），例如 鲸鱼「深度思考，偶尔搁浅」、水豚「情绪稳定，融资无望」、牛「牛马精神」
- 湾区 8 种菊花变体，结构上要明显不同：经典菊（十二瓣放射）、螺旋菊（旋涡）、六瓣菊（六片交叠的花瓣）、像素菊（方块像素）、折纸菊（折面）、极简菊（就是个星号）、光圈菊（相机光圈叶片）、水墨菊（笔触晕染）。每个配一句 desc（≤16 字），拿「设计师的宏大解释 vs 网友看到的菊花」开玩笑，例如「代表连接、循环与无限」「三十万美元设计费」「其实就是个星号」
- 模块顶层不许访问 window/document

## 二、`logos-demo.html`（根目录）

一个静态检查页：把 16 个 Logo 各用 3 种品牌色、按 96px / 48px / 24px 三种尺寸排成网格，下面写 name 和 desc。浅色背景。`<script type="module">` 里直接 import `/src/ui/logos.js`。

## 三、让 3D 沙盘显示品牌：改 `src/scene/office.js`

`sync(view)` 的 view 新增三个可选字段（不传时行为与现在完全一致）：
- `logo`: 字符串，一个 SVG data URL。传了就把它画在招牌/Logo 墙上公司名的左边（CanvasTexture：先画底色和公司名，图片加载完成后再补画 Logo 并 `needsUpdate`）。等级 3 以上的 Logo 墙、等级 5 的屋顶大招牌同样处理
- `brand`: 十六进制颜色字符串，如 `'#ff6b4a'`。用作招牌的强调色（描边或底条），并给办公室加一两处同色点缀（比如一面品牌色的墙条、前台、地毯边）
- `founder`: `{ outfit: 'turtleneck' | 'hoodie' | 'plaid' | 'suit' }`，创始人小人的造型：黑高领 / 灰帽衫 / 格子衫 / 西装。缺省为 turtleneck

`logo` / `brand` / `founder.outfit` 变化时只重画相关部分，不要整屋重建。`src/scene/demo.js` 里加几个按钮可以切换这三项（Logo 用 `logoDataURL`）。

## 完成标准
1. `node -e "import('./src/ui/logos.js').then(m=>console.log(m.LOGOS.sz.length, m.LOGOS.bay.length))"` 输出 `8 8`
2. `node -e "import('./src/scene/office.js').then(()=>console.log('ok'))"` 输出 ok；`npx vite build` 不报相关错误
3. 用你能用的方式实际渲染 `logos-demo.html` 看一眼（比如无头 Chrome 截图），确认每个 Logo 在 24px 下都认得出来，不满意的重画
4. 最后用三五句话汇报，并指出哪几个 Logo 你自己最不满意

注意：5173 端口已经有一个开发服务器在跑，不要再起；需要预览就直接用它。
