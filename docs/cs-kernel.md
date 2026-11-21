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
