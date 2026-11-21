# C# 内核：先验一个月，再验一整局

**边界。** `unity/Kernel/Kernel.csproj`（`netstandard2.1`，命名空间 `Liandan.Kernel`）不引用 UnityEngine，不读 UI、磁盘存档或时钟；Unity 2021.2+ 的 .NET Standard 2.1 配置可引用类库及依赖。`unity/KernelCli/KernelCli.csproj`（`net8.0`，`Liandan.KernelCli`）负责打开表和 gzip、重放、报首个不同的局/月/字段。用 `unity/Kernel.sln` 串起两者；本轮不建工程。

| 内核文件（拟） | 职责 |
|---|---|
| `Tables`、`TextRefs` | 用 System.Text.Json 读同一份 `src/data/tables/*.json`，不另导一套。保留数组/记录原序，建 ID 索引；按 `src/data/refs.js` 的列名、参数、格式后缀填设定、事件、路线文本。找不到的占位符保留；行动、融资报价和地区文本的运行时变量，到用时再填。Unity 端须带兼容的 JSON 程序集及依赖。 |
| `GameState`、`StateJson` | `S`、公司、创始人、员工、对手、项目等用强类型；`flags/cd/seen` 等开放键用字典，`q/fxq/hist` 保留异构项与数组顺序。按 JS 原名（含 `E`）读写，不补默认字段；可选字段区分缺键、undefined、null、实值。未移植字段用扩展数据原样往返，不能在比较前删掉。 |
| `Random32`、`Engine.Month`、`Engine.Rules` | 内核只用状态内随机数；月结、派生值、条件和效果分开。 |
| `Events`、`Scripted`、`Actions`、`Advice`、`Ideology` | 事件入队和上下文与生成/选择对话框分开；按事件 ID/选项名绑定脚本，不把委托写入 S。行动和参谋共用内核读数；两地路线共用规则、分表取文案。 |

**快照契约。** `node tools/parity.mjs trace [目录] [--seeds N] [--only 对局key]`；`node tools/parity/trace-selfcheck.mjs [目录]`。默认 3 种打法 × 16 种开局 × 3 个种子；按 `index.json` 读每局 gzip JSONL。每行 `{t,before,after}` 的 t 是结算前月份，after 是 `endMonth` 刚返回、尚未 `drain` 的状态；行动中已结束的月份不伪造快照。C# 每行独立读 before，调用 EndMonth，比 after：对象键集和值一致（忽略键序），数组有序，字符串逐字，double 精确到位、不设容差。

**不是普通存档 JSON。** 全量 8,127 对快照编码后立即解码与原 S 深比：有 51,986 个显式 `undefined`（`q[].ctx`、`temp[].add/mult`），直接 stringify 会丢键。用保留对象 `{"$js":"undefined"}`；同一协议预留 `NaN`、`Infinity`、`-Infinity`、`-0` 字符串（NaN 按标记相等，零区分符号）。本批未发现这些特殊数、函数、Set、Map 或循环引用；遇到保留键冲突、不能往返的值或环就报错。对话框回调和覆盖统计 Set 均不在 S。独立进程仅凭 before 和相同表/规则重放，8,127/8,127 一致。月结读取模块级 `P`、设定/文本索引、顺序固定的 `ALL`、`EV`、`FX/READ/API` 和路线 `BOOK` 等；它们是启动时组装的只读输入，未发现随对局改变的全局缓存，不用恢复 `Math.random`、localStorage 或机器人。

**首里程碑的调用清单**（基准 `786340b`，以下 engine 均指 `src/game/engine.js`；按依赖合并，不按运行次数计）：

| JS 位置 / 约行数 | 要移植的路径 |
|---|---|
| engine:560–669 / 110 | `endMonth`：推理/炼丹 → 功能与特殊项目 → 收支和配额 → 仪表与对手 → 团队 → 推月、候选、历史、成就 → 结局或事件队列。短路和随机调用次序不能变。 |
| engine:24–146、476–485、496–501 / 约 125 | `clamp/rnd/rf/ri/pick/mod`；`capOf/EofCap/frontierE/frontier/baseE/myCap/power/researchEff`；`rivalOf/upCap/usesOwn/usedCap/qCeil/board/rank`；`quotaFloor/quota/brainGpu/gpuPrice/gpuRent/inferNeed/apMax/dirtTotal/exposeP`；`market/relCap/shareCap/growUsers/projectRate`；`costs/revenue/unit/runway/perf/valuation`。 |
| engine:16、37–38、161–272、283–298、487–494、672–681 / 约 145 | `tx/text/fill`、`fmt/news/award/endGame`；`refreshCands/genStaff/addStaff/removeStaff/addDirt/removeDirt`；`applyFx → FX/soft/gauge`（功能完工）、`pickRandomEvent → cond/READ`、`queueEvent → makeCtx`。事件可入队，但本步不翻 `nextDialog/choose`。 |
| `src/game/ideology.js`:20–39、77–83、316–368 / 约 65 | `ideoMonth → entryMonth/isRed/ideoOn/yankMonth/heatMonth`，`heatDrag/hasHeat`、地区选择 `D/verOf/vt`、局部 `clamp`。必须先翻月度子集，不等整条剧情。 |

合计约 450 行 JS 规则（不含表、状态适配、CLI）。估计 4–7 人日：状态/加载和重放器 1–2 日，规则 2–3 日，首差定位 1–2 日；跨运行时数学函数若有末位差另计。之后依次补 `newGame`、事件/对话框、行动、参谋（advice 机器人要用）、完整路线之争，最后翻 `tools/bot.mjs`，从开局重放 144 局并比原指纹。外层用 `parity.mjs` 的对局 key 做 UTF-16 FNV 哈希，mkSetup、开局取 rs 和机器人的选择共用外层 seeded Math.random；不能和从 rs 推进的内层发生器合并。

**随机数逐位约定**（engine:25；仅说明算法）：`rs` 存有符号 `int`。在 `unchecked` 块中依次做 `uint bits = (uint)rs + 0x6D2B79F5u; rs = (int)bits; bits = (bits ^ (bits >> 15)) * (bits | 1u); bits ^= bits + (bits ^ (bits >> 7)) * (bits | 61u);`，返回 `(bits ^ (bits >> 14)) / 4294967296.0`。无符号右移对应 `>>>`，溢出取低 32 位对应 `imul/|0`；不要把混合后的 bits 写回 rs。

**数值核对索引**（每行行号均相对于 `src/game/engine.js`，含后续里程碑）：

| JS 语义 → C# 约束 | engine.js 行号 |
|---|---|
| `Math.round` 中点向 +∞，不用默认银行家舍入。普通值按 `Math.Floor(x+0.5)` 理解；精确实现须保留负零、整数及半点邻近值（先 floor 再比较小数部分，避免加法二次舍入）。 | 32,35,87,89,153,157,163,310,311,348,401,532,565,630,704,709 |
| `toFixed` 按输入的实际 binary64 舍入绝对值、保留位数；一元 `+` 又去掉尾零。统一无区域格式。`money` 先符号、地区货币，再按绝对值：万以下按 100 分档，亿档除 10000，按 1e5/1e6 切 2/1/0 位；`fmtUsers` 的亿档固定两位。 | 30–35,166,223,401,456,510–512,514,621,630 |
| `max/min` 遇 NaN 传播，±0 并列时 max 取 +0、min 取 -0；不要用忽略 NaN 的聚合。 | 24,86,94,97,99,105,110,134,135,137,144,181,198,199,202,368,479–481,483,499,511,512,563,570,571,575,599,602,603,608,619,690,691,704,709,710 |
| `/` 总做 double 除法，先转型再除；`floor` 27,28,36，`ceil` 98；`%` 为向零截商的余数，负数保留被除数符号（36,598,631,659）。 | 25,32,35,36,59–61,63,70,72,89,95,97,105,113,114,128,131,135,138,145,149,163,190,198,202,330,341,350,479–482,499,500,510–512,514,522,532,564,568,575,603,611,704,709 |
| `log2` 59，`log10` 611,704；`**` 对应 Pow（无显式 Math.pow）。不要重排浮点乘加；V8 与 .NET 数学库不保证最后一位相等，若有首差，固定输入做向量验证，必要时移植对应算法，不放宽精度。 | 幂：60,61,72,86,110,127,129,130,223,423,477,509 |
| `Array.sort` 稳定；同分保留原序，用 `OrderBy[Descending]` 或稳定排序，不用 `List.Sort`。 | 81,140,217,296（另见 ideology.js:322 附近的末位淘汰） |
| 对象键：数组索引形式的整数键先按数值升序，其余字符串键按插入序。计算/抽样/效果遍历按此顺序，不能因比较忽略键序就把输入排字母序。 | 21,49,51,164,205,246,247,257,268,270,278,436,534,545,629,708 |

## 里程碑 1 结果

2026-11-21，在 Windows、.NET SDK 8.0.428、Node 24.18.1 下验证。指定首局 `bay/model/chat/clean#0` 的 19/19 个月一致，全量 **144/144 局、8,127/8,127 个月逐字段一致**，CLI 退出码 0，无剩余首差。Debug 和 Release 均为 0 警告、0 错误。JS 快照自检和 `npm run parity` 均通过。

### 复跑

在仓库根目录用 PowerShell 运行。已有完整快照时可跳过生成。

```powershell
$env:PATH = "C:\Program Files\dotnet;" + $env:PATH
node tools/parity.mjs trace
dotnet build unity/Kernel.sln
dotnet run --project unity/KernelCli -c Release -- trace tools/parity/trace --only 'bay/model/chat/clean#0'
dotnet run --project unity/KernelCli -c Release -- trace tools/parity/trace --tables src/data/tables
node tools/parity/trace-selfcheck.mjs
npm run parity
```

`--tables` 默认取仓库根目录下的 `src/data/tables`，内核构造 `Tables` 时由调用方提供目录。`--max N` 限制本次总共检查的月份数，截断的最后一局单列为「部分检查」。每行独立执行 `new GameState(before, tables).EndMonth()`，将同一状态的 `ToSnapshotJson()` 与 after 比较。一处差异不会跳过这局余下的月份。CLI 至多报 20 局各自最早的字段差异，有差异返回 1，参数或数据错误返回 2。

### 实现和排差记录

- 月结按原顺序处理推理与炼丹、功能、特殊项目、用户、收支、配额、仪表、对手、团队、路线之争、推月和事件。排队时已经要抽取上下文。例如收购方由调用者指定，仍须先生成该事件的默认上下文，再覆盖指定字段，否则后续随机数会错位。
- 状态以 `JsonObject` 为底层，公司、创始人、员工、对手、项目有类型化视图。效果、标记、事件队列和未知字段保留原始树。定时事件入队时区分「原记录无 ctx」和「显式 null」：前者在新队列项写出 `{"$js":"undefined"}`。计算遍历按 JS 对象键顺序，首差比较忽略对象键顺序，数组则逐项比较。
- 首局最初是 15/19。第 3 月首先在 `$.rivals[0].cap` 出现一个 double 末位差，JS 为 `60.63580803648209`，初版 C# 为 `60.635808036482096`。前沿能力改用 V8 的 log2 拆项运算，监管公式里的 log10 同样保留原运算顺序。单独对比幂函数时，`1.06 ** 3` 在本机 Node 和 .NET 均为 `1.191016`，V8 源文件中标为 legacy 的幂算法则给出 `1.1910160000000003`，因此幂保留 `Math.Pow`。更换运行时或平台后应复跑对拍。[V8 数值实现](https://github.com/nodejs/node/blob/v24.18.1/deps/v8/src/base/ieee754.cc)
- `mulberry32` 保存有符号状态，用无符号移位和 32 位溢出混合。`Math.round` 保留负零，`toFixed` 按 binary64 尾数和指数做整数缩放再舍入。文本读同一套设定、参数、地区文本与事件表，载入时填记录引用，新闻生成时再填本月变量。
- 用临时表和独立快照另测了 5 次月结，覆盖功能触发组合效果、招人、路线压力、项目入队和未知字段中的特殊值，5/5 一致。故意从其中一条 after 删除扩展字段，CLI 报出对应月份和 `$.extension`，得到 4/5、退出码 1。这些月份单独计数。

### 到整局重放的剩余工作

以下为一人开发和对拍的粗估，单位为人日。验收终点是从种子开局，跑完行动、选择和月结，复现 144 局原指纹。

| 工作 | 主要验收点 | 人日 |
|---|---|---:|
| newGame 与开局组装 | 创始人、公司、对手、候选以及开局随机状态一致 | 1–2 |
| 事件与对话框 | 生成窗口、检定、脚本选项、抽卡、丑闻和结局，与 JS 逐项比较 | 3–5 |
| 行动 | 35 个行动的可见性、花费、执行和文本 | 3–5 |
| 参谋 | 提示的优先级、阈值、文案及机器人可读取的结果 | 1–2 |
| 路线之争剧情 | 两地 15 级、选牌、结局、处置、计划及后续事件 | 3–5 |
| C# 机器人整局重放 | 分离外层选局随机数与内层 rs，逐月定位首次分歧，比较最终指纹 | 2–4 |

合计约 **13–23 人日**，未计 Unity 界面和资源接入。

## 第 2 段结果

在同一套 144 局基线上，机器人共调用引擎 459,215 次。JS 从快照重放所有操作；C# 执行已移植的操作，比较完整状态和玩家可见返回值。后续里程碑仍需用 C# 生成机器人的选择并独立跑完整局。

### 复跑

在仓库根目录执行。完整逐操作快照约占 1.36 GiB，已加入 `.gitignore`。试跑单局可用 `node tools/parity.mjs ops tools/parity/ops/sample --only 'bay/model/chat/clean#0'`，自检和 CLI 都接受这个子目录。

```powershell
$env:PATH = "C:\Program Files\dotnet;" + $env:PATH
node tools/parity.mjs ops
node tools/parity/ops-selfcheck.mjs
dotnet build unity/Kernel.sln -c Release
dotnet run --no-build -c Release --project unity/KernelCli -- ops tools/parity/ops
dotnet run --no-build -c Release --project unity/KernelCli -- trace tools/parity/trace
npm run parity
```

`ops` 和 `trace` 共用 `--tables`、`--only` 与 `--max`，在 ops 模式下上限按操作计。CLI 报出每个有差异的对局的第一处差异，含从 1 开始的步号、操作和字段路径。退出码 0 表示本次参与比较的操作都一致，1 表示有差异，2 表示输入或运行环境出错。跳过量单列。

### 快照与对话框重建

- 每局一个 gzip JSONL，索引记录局名、文件、步数和 JS 整局指纹。生成时核对已有的基线指纹。每行的 `op` 和 `args` 表示引擎调用，`before`、`after` 均在调用边界用里程碑 1 的 codec 立即编码并验证无损往返。开局前为 null。返回视图省去函数和不可见的 undefined 字段；开局状态只在 after 存一份，空返回视图用 null。
- `viewMenu` 合并记录一次全菜单的显示条件、名称、描述与行动状态；机器人单独查询的 `show`、`actionState`、`runway` 等仍逐次记录。外层 `mathRandom` 是参数求值完毕、调用开始前的有符号 mulberry32 状态。开局另记实际抽到的 `initialRs`。两端自检从外层状态抽取并比较初始种子；生成对手和候选后，after.rs 已经推进。
- `choose.args` 是事件 ID（匿名窗口为 null）与从 0 开始的选项下标。`source` 指向本局产生该窗口的操作步号，可以是 `nextDialog`、`perform` 或上一个 `choose`。JS 自检从来源步的 before 重新执行，保存活的对话框与同一个 S，在选择前比较 S 和本步 before；选择后比较完整 after 和 ret。C# 同样保留来源步生成的回调和状态。已经实现的操作连续执行；跳过的操作从该行 JS after 接回。
- `nextDialog` 会出队、抽卡、执行入场脚本并写特效队列。`scripted.js` 的每事件 WeakMap 按 ctx 身份缓存变量。收购报价、裁员前的月支出、对赌到期时的目标和现状，都在生成窗口时冻结。C# 让选项捕获这组值。行动窗口另捕获融资条款、冲刺候选、洗白费用等；发布窗口的第二层沿用第一层的真实能力和注水量，首次选择扣费和行动点一次。
- 核查了 engine、actions、scripted、ideology 与机器人模块。事件索引、行动表、两地路线表与文本索引在初始化完成后只读。随局变化而影响结果的状态在 S、外层发生器和活窗口内。`tap`、`HINT_N`、`hintMonths` 和指纹覆盖集合属于观测端，机器人决策不读取累计统计。局间无需恢复这些计数。

### 验收统计

| 操作 | C# 一致 | 不一致 | 跳过 |
|---|---:|---:|---:|
| newGame | 144 | 0 | 0 |
| nextDialog | 36,831 | 0 | 1,450 |
| choose | 18,612 | 0 | 1,470 |
| endMonth | 8,127 | 0 | 0 |
| perform | 5,417 | 0 | 11,171 |
| gpuPrice | 6,649 | 0 | 0 |
| inferNeed | 6,649 | 0 | 0 |
| quota | 6,649 | 0 | 0 |
| runway | 41,607 | 0 | 0 |
| teamCap | 74,976 | 0 | 0 |
| viewMenu | 0 | 0 | 8,203 |
| actionState | 0 | 0 | 123,401 |
| show | 0 | 0 | 85,203 |
| advise | 0 | 0 | 8,203 |
| hire | 0 | 0 | 7,612 |
| setGpu | 0 | 0 | 6,649 |
| setPolicy | 0 | 0 | 61 |
| pushProject | 0 | 0 | 131 |
| **合计** | **205,661** | **0** | **253,554** |

C# 实现开局、系统事件脚本、随机事件、事件链、丑闻、抽卡，以及为重建选择所需的六个行动入口：融资、发布、冲刺、换料、洗白、挖对手黑料。普通事件的条件、检定、效果预览、状态变化和结果标签均参与比较。路线表中的静态事件也走同一数据路径。第 5 段接动态剧情窗口（入股、阶段、路线结局、清洗、计划到期）及路线专属行动窗口。首个跳过的动态窗口是 `bay/model/chat/clean#1` 第 1,855 步的 `ideo_entry`。当前已比较部分无首差。

跳过的 1,470 次选择可回溯到来源：1,450 次来自上述动态事件，另有 10 次来自 `plan`、10 次来自 `yank`。CLI 按来源名称打印明细。

Node 24.18.1、.NET SDK 8.0.428：Debug 与 Release 均为 0 警告、0 错误；JS 逐操作自检通过 459,215/459,215，`npm run parity` 通过 144/144。里程碑 1 的 JS 月度自检和 C# trace 都通过 8,127/8,127。

额外用临时快照覆盖两地带传承和教程的开局，以及收购成交、对赌、董事会、丑闻等主动指定的选项。2 次开局、192 次弹窗、192 次选择全部一致，未计入上表。故意改动收购选项的结果文案，CLI 定位到该用例第 2 步 `choose $.ret.text` 并返回 1。

## 第 3、4 段结果

144 局 ops 共 459,215 步，C# 与 JS 的完整状态和返回视图一致 456,315 步，不一致 0 步。余下 2,900 步均为第 5 段路线之争的动态剧情窗口和相应选择。跳过后，重放器沿用第 2 段的办法，从该步 JS after 接回。独立从种子运行 C# 机器人并比较整局指纹，留到第 6 段验收。

### 实现与验收

- 菜单按行动表原顺序返回 35 项，隐藏项只含 `id` 和 `show`。名称、说明、冷却、费用和阻止原因读取地区文本、行动参数与效果引用。读取菜单和参谋不消耗随机数。
- `Perform` 对直接行动在执行后扣费，对窗口行动在首层非免费选择时扣费一次。已接入 `plan` 的用户、模型、营收目标及到期排程，也已接入 `yank` 的确认和免费取消。第 2 段因此另有 20 次选择纳入比较。
- 参谋按 JS 规则顺序收集提示，过滤静音，再按紧急程度和 `later` 稳定排序。比较完整的提示数组，包括文案、行动入口、跳转页签和高亮目标。
- 先跑 `bay/model/chat/clean#0`，921/921 步一致，再跑全量。Debug 与 Release 编译均为 0 警告、0 错误。月结 trace 通过 144/144 局、8,127/8,127 个月，`npm run parity` 通过 144/144 局。
- 另用临时快照在两地逐个执行 35 项行动，并覆盖 `plan` 的三个选项和 `yank` 的两个选项。76 次菜单、76 次参谋、76 次行动、22 次选择均一致。该测试发现并修正了缺少路线结束月份时漏报 `ideo-new` 的问题。另有 20 个参谋用例覆盖项目落后、现金紧张、路线压力、静音和已结束的对局等情况，全部一致。两批用例均单独计数。

### 逐操作统计

| 操作 | C# 一致 | 不一致 | 跳过 |
|---|---:|---:|---:|
| newGame | 144 | 0 | 0 |
| nextDialog | 36,831 | 0 | 1,450 |
| choose | 18,632 | 0 | 1,450 |
| endMonth | 8,127 | 0 | 0 |
| perform | 16,588 | 0 | 0 |
| gpuPrice | 6,649 | 0 | 0 |
| inferNeed | 6,649 | 0 | 0 |
| quota | 6,649 | 0 | 0 |
| runway | 41,607 | 0 | 0 |
| teamCap | 74,976 | 0 | 0 |
| viewMenu | 8,203 | 0 | 0 |
| actionState | 123,401 | 0 | 0 |
| show | 85,203 | 0 | 0 |
| advise | 8,203 | 0 | 0 |
| hire | 7,612 | 0 | 0 |
| setGpu | 6,649 | 0 | 0 |
| setPolicy | 61 | 0 | 0 |
| pushProject | 131 | 0 | 0 |
| **合计** | **456,315** | **0** | **2,900** |

已比较的操作没有首差。按索引顺序，第一个跳过的是 `bay/model/chat/clean#1` 第 38 月、第 1,855 步的 `nextDialog`，事件为 `ideo_entry`。1,450 次跳过的选择分别来自入股 132 次、15 个路线阶段 1,231 次、三类路线结局 70 次、清洗 13 次、计划到期 4 次。CLI 继续按每个事件 ID 打印明细。

### 复跑与剩余工作

在仓库根目录使用第 2 段的命令。单局可在 ops 命令后加 `--only 'bay/model/chat/clean#0'`，去掉该参数即可跑全量。

| 后续段落 | 验收点 | 一人粗估 |
|---|---|---:|
| 第 5 段 · 路线之争剧情 | 两地入股、15 级选牌、结局、清洗和计划到期窗口，消除全部 2,900 步跳过 | 3–5 人日 |
| 第 6 段 · C# 机器人与整局指纹 | 从种子生成机器人选择，核对内外随机序列、逐月状态及 144 局整局指纹 | 2–4 人日 |

## 第 5 段结果

144 局逐操作重放共 **459,215/459,215 步一致，0 跳过，0 不一致**，没有剩余首差。先跑 `bay/model/chat/clean#1`，2,903/2,903 步通过，覆盖原先第一个跳过的 `ideo_entry`。全量采用第 2 段的 ops 命令。每局从 `newGame` 连续执行记录中的操作，`choose` 调用来源窗口保留的回调。重放器已移除跳过剧情和读 JS after 接回状态的路径。

| 验收项 | 一致 | 不一致 | 跳过 |
|---|---:|---:|---:|
| nextDialog | 38,281 | 0 | 0 |
| choose | 20,082 | 0 | 0 |
| 其余 16 类操作 | 400,852 | 0 | 0 |
| **全部 ops** | **459,215** | **0** | **0** |

原有的 2,900 步分为 1,450 次弹窗和对应的 1,450 次选择。其中入股 132 次、阶段给牌 1,231 次、结局 70 次、员工处置 13 次、计划到期 4 次。Debug、Release 编译均为 0 警告、0 错误。独立月结 trace 通过 144/144 局、8,127/8,127 个月。`npm run parity` 对原 JS 基线通过 144/144 局。

### 路线实现与补充验证

- 两地共用一套 C# 规则，读取各自的路线表、人物、目标和地区文本。入股时冻结回购价格。阶段按近期选择、经营政策、裁员次数和两条进度推断倾向，先用本级选项，再按卡池条件、已用和上次展示记录抽取。股权告急时可插入回购卡。弹窗时记录展示，选择后才记使用、改变员工倾向并排下一阶段。
- 检定、概率、禁选原因、效果预览和结果标签沿用事件引擎。第 15 级选择效果生效后判定股权和路线，记录目标、使命、品牌及结局。表中的四种收场窗口为红色、资本、失败和员工处置；资本结局有左倾员工时，处置排在结局窗口之后。四种处置分别处理解雇、培训、补偿离职和保留组织。
- 计划立项与到期共用用户、模型、营收三类目标的取值和格式。末位淘汰、反共压力月结与估值、订单影响复用第 1 段实现；结局后随机事件、红色恐慌、乌托邦和脑机接口一次性链复用既有事件表和行动入口。
- 两地另跑 689 组定向弹窗和选择，1,378/1,378 步一致，独立于上表。涵盖各级三种选择历史、四项员工处置、三种计划目标的达标与未达标、临界股权、双条满格、创始人原有使命和两条一次性事件链。另对照 JS 的路线页查询 102 组，核对意图值、把握、文案、目标、判定、阵营、人物和链信息。

### 第 6 段交接

`tools/bot.mjs` 的 `drain` 对路线窗口沿用通用选法，先过滤禁用项，守规矩打法还会过滤文字里的 ☠，然后用外层随机数在候选中等概率抽取。`playMonth` 的通用行动池按固定顺序追加 `mobilize, utopia, selfcrit, subbotnik, plan, yank, bci, buyback, costcut, spinoff`。即使尚未解锁，也先从完整池抽，再由 `show` 和 `actionState` 判断能否执行。提前过滤会改变抽样和循环次数。advice 打法会执行路线提示中的主行动 `h.act`，例如结局提示给出的动员或末位淘汰。机器人没有按红色或资本倾向选阶段卡的专门分支。

| 工作 | 验收方式 | 一人估计 |
|---|---|---:|
| 移植开局和三种打法 | 用对局 key 的 UTF-16 FNV 生成外层种子。对齐属性重抽、特质、初始 rs、选项下标、行动顺序和循环退出条件；游戏内事件继续使用 S.rs | 1–2 人日 |
| 实现整局指纹与首差诊断 | 按 JS 顺序写入开局、菜单、提示、行动、弹窗、选择、月末；对齐对象键排序、JS 数字格式和 UTF-8，再核对月度 SHA-1 前 6 位与整局前 16 位 | 0.5–1 人日 |
| 从种子独立跑全量 | 先核对单局，再核对 144 局的终局、月份、逐月及整局指纹。首差回查月份、操作和内外随机状态 | 0.5–1 人日 |

第 6 段合计预计 **2–4 人日**。本段验收使用 JS 记录的操作和选择，第 6 段将由 C# 机器人自行生成。

## 第 6 段结果

**默认基线 144/144 局通过，退出码 0。** 每局由 C# 独立开局、选行动、点对话框并结算。CLI 只读取公共规则表和最终比对用的基线，逐局核对 `hash`、`months`、`end`、`t`。首局 `bay/model/chat/clean#0` 的两份 dump 共 259,366 字节，逐字节一致，结局为 `ousted`，`t=20`，整局指纹为 `b0c6223f054230b0`。Debug 和 Release 均为 0 警告、0 错误，`npm run parity` 通过 144/144 局。

三种打法按 clean、shady、advice 遍历，每种依次遍历地区、路线、赛道和种子。机器人用对局 key 的 UTF-16 码元做 32 位 FNV 哈希，以此初始化外层 mulberry32。随机分配属性、重抽满值属性和抽特质后，`NewGame` 接收空 meta，从同一外层发生器取一次初始 rs。后续引擎只推进状态里的 rs，机器人继续用外层流抽选项和行动；通用行动先从完整池抽，再检查能否执行。

指纹复用内核的菜单、对话框和选择结果视图。每条记录写成「标签、一个空格、规范 JSON、LF」，以 UTF-8 同时更新整局和当月的 SHA-1。对象按 JS 键序规范化，数字用最短往返表示，字符串遵循 JSON.stringify 的转义规则。对象里的 undefined 省略，数组里写 null，负零写 0。每次机器人写完「月末」截取当月摘要前 6 位；首月包含开局与初始窗口，整局取前 16 位。

### 扩展基线

**16 个种子，C# 独立整局与 JS 基线 768/768 一致。** 原先在 `bay/model/chat/clean#8` 第 36 月和 `sz/model/code/clean#9` 第 22 月出现的 `$.E` 首差均已消失。第一局的回归输入 `2 ** 9.973200356415402` 在 JS 和 C# 都得到 `1005.1536639005418`（binary64 位型 `408f693ab4239b39`）。默认 parity 144/144，ops 459,215/459,215 步一致、0 跳过，trace 8,127/8,127 个月一致，均覆盖完整 144 局。`npm run parity` 通过 144/144。

### 数学函数逐位对拍

本机 Windows x64 的 Node v24.18.1 使用 V8 13.6.233.17-node.50。`node --v8-options` 显示默认启用 `--use-std-math-pow`。用 `--print-opt-code` 查看 TurboFan 生成代码，并用本机 dumpbin 核对 `node.exe`，可见动态指数进入 V8 包装函数（本版本 RVA `0x7badb0`），处理 NaN、无穷指数、平方与半次幂，其余转入随 Node 静态链接的 `std::pow`。关闭该开关才会进入导出符号 `v8::base::ieee754::legacy::pow`；此时上述回归输入得到 `1005.1536639005417`。

`JsMath.Pow` 按本机实际匹配的 FMA 分支重现运算顺序，用 128 段求对数高低项，将指数乘积的尾差带入 256 段指数还原，再处理溢出和次正规数舍入。`JsMath.PowTables.cs` 记录从此版本二进制读取的数值表。内核运行时使用托管实现，提供 `Math.FusedMultiplyAdd` 时直接绑定它，旧运行时以整数尾数运算实现一次舍入。每个数学结果都以完整 64 位比较，包括负零和 NaN 负载。

游戏规则直接使用幂、`log2(1 + E / E0)` 和 `log10(1 + users)`。`log` 也用于 `log10` 的拆项计算；`exp` 在 JS 的音频和场景表现中使用。三个对数和自然指数沿用 V8 的 fdlibm 算法，包含输入归约、高低项求和及特殊值处理。

同一版本的 TurboFan 将字面量 `x ** 2` 降为乘法，将 `x ** 0.5` 降为带特殊值处理的平方根。`x ** 3` 和动态整数指数仍可调用通用幂函数。两端都是常量时可在编译中折叠。例如取 NaN 位型 `fff8000000000042`，动态指数 2 的结果为 `7ff8000000000000`，已优化的字面量平方保留 `fff8000000000042`。对拍工具单列这两个字面量调用点，对照 C# 的乘法和半次幂路径。

固定种子生成 **616,961** 组输入，覆盖规则表里的增长与衰减系数、月份、能力与算力换算、用户量，以及随机位型、相邻浮点数、上下溢、带负载 NaN 和常量表达式。`Math.pow`、`**`、`log`、`log2`、`log10`、`exp` 及上述两条优化路径各有 **0/616,961** 项不一致。另用种子 `0xeb15cc73` 跑 500,000 轮随机输入，八项均为 **0/6,016,961**。在 .NET 8 强制选择纯托管 FMA 回退后，默认样本的八项也全部一致。这些数字是本机版本的抽样结果。以下命令会固定两条字面量调用点的优化层级，并把原始位型写入临时文件。

```powershell
$bits = Join-Path $env:TEMP 'liandan-math-bits.bin'
# 默认样本。扩展样本在命令末尾追加 500000 0xeb15cc73。
node --allow-natives-syntax tools/verify/math-bits.mjs $bits
dotnet run --no-build -c Release --project unity/KernelCli -- math-bits $bits
```

### 复跑与定位

在仓库根目录用 PowerShell 执行。整局对拍无需提前生成 trace 或 ops。

```powershell
$env:PATH = "C:\Program Files\dotnet;" + $env:PATH
dotnet build unity/Kernel.sln -c Release
$cli = 'unity/.build/KernelCli/bin/Release/net8.0/KernelCli.dll'
dotnet $cli parity
npm run parity
dotnet $cli parity tools/verify/baseline-768.json --seeds 16
node tools/parity.mjs check tools/verify/baseline-768.json --seeds 16
```

CLI 最多打印 12 局首差，月份从 1 起算。以下命令在 Windows 下直接重定向两个进程的 stdout，保留原始 UTF-8 和 LF。摘要输出到 stderr。需要继续定位操作和字段时，使用第 2 段的 ops 命令，为 JS 的 ops 生成命令指定相应的 `--seeds N --only 对局key`。

```powershell
cmd /c "node tools/parity.mjs dump bay/model/chat/clean#0 > js.dump"
cmd /c "dotnet unity/.build/KernelCli/bin/Release/net8.0/KernelCli.dll dump bay/model/chat/clean#0 > cs.dump"
fc.exe /b js.dump cs.dump
```

### 六段总结与 Unity 接入边界

C# 类库已覆盖这批对局经过的开局、月结、经营行动、融资发布、团队、建议、两地路线剧情、弹窗选择和结局。第 5 段验证了 459,215 个操作的前后状态与可见返回值，第 6 段进一步验证三种机器人能从种子自行走出默认基线的整局过程。扩展后的 16 个种子也通过了完整的 768 局指纹对拍。

Unity 接入还需让工程加载内核及其 JSON 依赖和规则表，把玩家输入接到行动与选项入口，绑定菜单、弹窗、月末状态和场景表现，并实现存档读写。在目标 Mono 或 IL2CPP 环境复跑相同基线，才能验证该运行时的浮点结果。

## Unity 里的对拍

在 Windows x64 上关闭已打开的 `unity/Game` 工程，然后从仓库根目录依次运行。默认编辑器是 `D:\Unity edititor\6000.5.2f1\Editor\Unity.exe`，其他安装位置可通过 PowerShell 的 `$env:UNITY_EXE` 指定完整可执行文件路径。

```powershell
node tools/unity/run.mjs compile
node tools/unity/run.mjs editor-parity
node tools/unity/run.mjs build-probe
node tools/unity/run.mjs run-probe
```

1. `compile` 让 Unity 解析两个本地 UPM 包和内置 URP 17.5.0，编译工程，并在 `Assets/Settings` 创建默认渲染器和管线资源，设置 Graphics 的默认管线。交互打开工程时也可用菜单「炼丹大亨 → 设置 URP」。首次导入后 Unity 会刷新包锁文件。
2. `editor-parity` 用本机 Node 生成数学输入 `unity/Game/Logs/math-bits.bin`，在编辑器 Mono 里读取仓库的 `src/data/tables` 和 `tools/parity/baseline.json`，对比 144 局逐月指纹、整局摘要和八项数学结果。数学样本生成参照上节的 Node 版本。
3. `build-probe` 生成只有探针组件的场景 `Assets/Parity/ParityProbe.unity`，使用 IL2CPP 构建 `unity/Game/Build/ParityProbe/ParityProbe.exe`。构建结束后恢复原有脚本后端。探针的 `link.xml` 保留 JSON 及内核所需的类型。
4. `run-probe` 以无图形批处理模式运行播放器，传入同一仓库和数学样本。编辑器和播放器都支持在对应子命令末尾追加自定义样本路径，例如 `node tools/unity/run.mjs run-probe "$env:TEMP\liandan-math-bits.bin"`。

每一步的 Unity 日志保存在 `unity/Game/Logs/<子命令>.log`，脚本会摘出编译错误并传回失败退出码。两份对拍报告分别为 `parity-editor.txt` 与 `parity-il2cpp.txt`。成功时应有「整局一致 144/144」、八项「真正的数值不同 0/样本数」和末行「对拍通过」。遇到差异请保留报告中的对局、首差月份或数学输入位型。

数学报告逐项分三类：按位一致（含位型相同的 NaN）；「NaN 位型不同，JS 观察不到」（两边都是 NaN，仅符号或负载不同，每项列前 3 例）；真正的数值不同（含仅一边是 NaN、`+0` 对 `-0` 等）。仅第三类导致数学检查失败。这里的“观察不到”指游戏使用的 JS Number 数值语义，不包括读取原始字节；正负零可用 `Object.is` 或倒数区分，不能合并。

修改前 Windows x64 IL2CPP 的 `Math.pow` 与 `**` 各有 38,612/616,961 项按位不同，已见例子均为 JS `fff8000000000000`、C# `7ff8000000000000`；其余六项按位一致，整局仍为 144/144。相同样本在编辑器 Mono 和 .NET 8 上八项均按位一致。默认 V8 样本中，通用幂的有限负底数、有限非整数指数分支（不含单独处理的 `0.5`）正好有 38,612 项，两种写法均返回 `fff8000000000000`。`JsMath.Pow` 因此只在此分支显式返回该位型，不统一其他路径的 NaN。需重新 `build-probe` 再 `run-probe`，以新播放器报告确认按位结果。

`unity/KernelChecks` 是 CLI、编辑器和探针共用的机器人、指纹及数学检查程序集。Unity 使用 BCLExtensions 自带的 System.Text.Json 8，.NET 工程继续使用原 NuGet 引用。MSBuild 的输出统一放在 `unity/.build/<项目名>/`。独立检查工程 `unity/GameCheck/GameCheck.csproj` 直接用本机 Unity 托管 DLL 编译脚本，可在不开编辑器时运行：

```powershell
& 'C:\Program Files\dotnet\dotnet.exe' build unity/GameCheck/GameCheck.csproj -c Release
```
