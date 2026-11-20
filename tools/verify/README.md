# tools/verify：新旧版本逐项对照

表格化（阶段 0）期间用来证明「搬进表格以后，游戏一个数、一个字都没变」的工具。以后改代码结构、做 C# 内核对拍时还能接着用。

## 先准备一份旧版代码

所有对照都是「旧版 src」和「当前项目」比。旧版从 git 里取：

```bash
mkdir -p /tmp/old && git archive <提交号> src | tar -x -C /tmp/old
```

下面的 `<旧版 src>` 就是 `/tmp/old/src`。表格化之前的那一版是 `2991a2f`。

## 逐项对照（Node 里跑，几秒到十几秒）

| 脚本 | 比什么 |
|---|---|
| `snap-core.mjs <旧版 src> .` | 19 个系统事件在大量人造局面下的每个对话框、每次选择的结果 |
| `snap-actions.mjs <旧版 src> .` | 35 个行动的菜单（名字、说明、花费、点不了的原因）和执行结果 |
| `snap-engine.mjs <旧版 src> .` | 金额和日期的写法、效果预览、员工气泡、黑料引爆和董事会卡窗口、开局状态 |
| `snap-ideo.mjs <旧版 src> .` | 路线之争整条链：108 局，15 级、所有结局、处置、五年计划、末位淘汰、红色恐慌、意识形态行动 |
| `snap-advice.mjs <旧版 src> .` | 参谋提示：机器人打的局面 × 18 种变体，3 万多次 |
| `snap-tut.mjs <旧版 src> .` | 新手教学每一步的提示和开放时机 |
| `check-filled.mjs tools/verify/before-refs .` | 说明里写成 {变量} 的字，游戏载入后填出来要和改之前的原文一字不差（`before-refs/` 是改之前的 JSON） |

对拍（整局、逐月）用 `tools/parity.mjs`：默认 144 局和 `tools/parity/baseline.json` 比；768 局用这里的基线：

```bash
node tools/parity.mjs check tools/verify/baseline-768.json --seeds 16
```

## 界面并排对照（要开着开发服务器）

1. 把旧版放到 `.vite/oldsite/`（这个文件夹 git 不管）：`src/` 放旧版代码，`index.html` 从项目根目录复制一份，把里面的 `/src/main.js` 改成 `./src/main.js`。
2. 开发服务器开着（`npm run dev`，127.0.0.1:5173）。
3. 准备局面：`node tools/verify/gen-ui-states.mjs . /tmp/ui-states.json`
4. 对照：`node tools/verify/ui-compare.mjs /tmp/ui-states.json`

新版开在 `127.0.0.1`、旧版开在 `localhost`（两个域名的存档互不干扰），无界面 Chrome 里做一模一样的操作、灌一模一样的局面，每一步比 `#ui` 的 HTML（去掉帧率、动画相位这些每次都不一样的东西）。走一遍大约 850 步、五六分钟。加 `--only 新` 只开新版，用来查报错、漏填的 {变量}、undefined。

用完记得删掉 `.vite/oldsite/`。

## 打包版试玩

```bash
npm run build
node tools/verify/built-smoke.mjs 炼丹大亨-3A.html 40
```

双击打开的那种（file://）单文件，开新局一路点 40 个月，查报错、漏填的 {变量}、undefined / NaN（炸炉新闻里「loss 一夜之间变成 NaN」是梗，不算）。

## migrations/：一次性的迁移脚本（已经跑过）

把代码里的文字和数字搬进表格时用的脚本，留着当记录：每一处文字、每一个数是从旧代码的哪里抄的、按什么规则换成参数或变量的。它们都已经跑过，结果在 `tables/` 和 `src/data/tables/` 里，不要再跑。

| 脚本 | 搬了什么 |
|---|---|
| `seed-ideo.mjs`、`seed-ver-doc.mjs` | 路线之争：两地说法、系数、版本设定、代码弹的窗口 |
| `gen-engine-params.mjs`、`add-params.mjs` | 引擎月度结算的 258 个系数 |
| `seed-advice.mjs` | 参谋提示的字和门槛 |
| `seed-tutorial.mjs` | 新手教学 |
| `gen-ui-text.mjs`、`add-ui-text.mjs` | 界面文字（`gen-ui-text.mjs` 里的每一处替换都核对过：字里固定的部分必须原样出现在被替换的旧代码里） |
| `seed-art-audio.mjs` | 音频.xlsx（美术.xlsx 由 `tools/art/inventory.mjs` 生成） |
| `conv-refs.mjs` | 说明里写死的数改成 {变量}（自动认记录自己的数；参数和平衡参数按清单手工指定；每一处填回去都必须和原文一字不差） |
| `rep.mjs`、`eol.mjs` | 上面几个用的小工具：按原文替换（原文必须恰好出现一次）、统一成 CRLF |
