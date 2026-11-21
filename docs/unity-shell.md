# Unity 可玩界面（阶段 2 / 界面 A、B）

## Windows 验收顺序

在仓库根目录，关闭占用同一工程的 Unity 编辑器。下列前五行不启动 Unity；最后三行才分别构建、运行图形播放器、构建 IL2CPP。

```powershell
dotnet build unity/GameCheck -c Release
dotnet build unity/KernelCli -c Release
node tools/verify/save-roundtrip.mjs
dotnet unity/.build/KernelCli/bin/Release/net8.0/KernelCli.dll parity
npm run parity
node tools/unity/run.mjs build-game
node tools/unity/run.mjs autoplay 42 unity/Game/Build/shots-42
node tools/unity/run.mjs build-game-il2cpp
```

试玩默认一直跑到结局。截图目录须全新或为空；冒烟例：`node tools/unity/run.mjs autoplay 42 unity/Game/Build/smoke-42 3`（完成三次月结，或提前结局）。脚本等待播放器退出，检查日志完成标记、退出码与关键 PNG，并列出文件；构建日志在工程 `Logs`，试玩日志是截图目录的 `player.log`。如果 Unity 安装位置不同，设 `UNITY_EXE`；工程副本可设 `UNITY_PROJECT`。原探针的四个命令不变，见 [内核文档](cs-kernel.md)。

手玩：双击 `unity/Game/Build/Game/Liandan.exe`。IL2CPP 产物在 `unity/Game/Build/GameIl2cpp/Liandan.exe`；两者都接受同一组原生参数，例如：

```powershell
& unity/Game/Build/GameIl2cpp/Liandan.exe -autoplay 42 -shots "$PWD/unity/Game/Build/shots-il2cpp" -screen-width 1600 -screen-height 900 -screen-fullscreen 0
```

不要给试玩播放器加 `-batchmode` 或 `-nographics`。试玩使用独立的临时存档，不读取或覆盖手玩进度。按到达顺序截标题、建角、第一月、事件、结果、经营中期和结局；序号是页面编号，不是时间顺序（开局介绍先于第一月经营）。中期截图先留第二月，到第十二月更新；未到达的页面不伪造，短跑不要求结局图。

## 数据与存档

- 真源是 `src/data/tables/*.json`。菜单 `Liandan/Sync Tables` 或批处理 `Liandan.EditorTools.Build.SyncTables` 按字节同步到 `Assets/StreamingAssets/tables/`，游戏构建前也会同步。该目录是生成物，不手改、不入库。编辑器直接 Play 前先执行同步，打开 `Assets/Shell/Game.unity`。独立工程副本可用 `LIANDAN_REPO` 指定表来源；Node 构建脚本自动传入。Windows 播放器只读包内 `Application.streamingAssetsPath`，可以把整个构建目录搬出仓库使用。
- `GameStore` 在 `Application.persistentDataPath` 下写 `ldt_save_v1.json` 和 `ldt_meta_v1.json`，内容分别对应浏览器同名 localStorage 键（不含 `.json`）。手动互导时只复制键值 JSON，不要包一层键名。单文件先写临时文件再替换；对拍指纹的 `$js` 特殊标记不属于正式存档。
- 标题页建角不动旧档；确认开局后覆盖单局档，保留局外档。正常游玩在事件、结果处理完毕后自动保存，包括每月月结。未处理完事件时退出，下次从上一个可恢复点重放。继续时拒绝损坏 JSON、不兼容版本及已结束局；沿用网页旧档的办公室、项目、剧情时点和配额兼容。结局结算分数、人脉点、图鉴、成就、次数和最高分，保存 meta 后清除单局档；商店购买立即保存。
- `tools/verify/save-roundtrip.mjs` 使用真实 JS 引擎和磁盘 localStorage 适配器，驱动 `KernelCli save-roundtrip`，比较双端读档、推进下一月、旧档迁移以及同一结局的回报和 meta。原有完整轨迹对拍仍单独运行。

## 代码边界

- `unity/Kernel/GameStore.cs`：存档、兼容、结算；`Tables` 提供表视图和文本填充。UI 不推演月结、费用、成功率、结局或事件效果。
- `Assets/Shell/GameShell.cs`：标题、商店、继续、界面状态与队列泵、本地选择窗和悬浮提示。`Wizard.cs`：五步建角、深色名字输入框。
- `Panels.cs`：顶栏、按页签分类的内核行动视图、公司/团队侧栏、事件与结果、结局。`Resources/Shell.uss` 和 `ShellTheme.tss` 提供布局和控件主题；`Whitebox.cs` 与 `Whitebox.mat` 是真实 URP 方块场景，不是 UI 背景截图。中文使用随包的 Noto Sans SC 动态多图集字体，字重使用默认值。
- `Autoplay.cs`：单独的固定种子 UI 冒烟机器人，调用与按钮相同的回调（包括切页签、选项和结果继续），不在后台直接跑完整局；优先现金流、招人、发布、上市，其余随机。它不替代 144 局指纹机器人。截图等到帧尾，读取真实 framebuffer 后同步编码写 PNG，再退出。
- `Editor/Build.cs`：构建前自动生成或复用 Resources/ShellPanel.asset 和 ShellFont.asset，检查 ICU 与 URP/Lit 引用。可用 `node tools/unity/run.mjs setup-ui` 单独生成，生成的资源与 .meta 可纳入版本控制。构建完成后恢复原后端。`GameCheck` 同时编译编辑器和播放器脚本，不能验证 Unity 的资源导入、面板排版、鼠标输入、字体或显卡输出。首轮图形验收请检查长事件可滚动、中文无方框、方块不呈洋红色，以及完整局结束后能回标题重新开局。

## 界面 A 验收

- `Dashboard.cs`：右侧七个页签与六项仪表。项目页同时列出功能冲刺、特殊项目和链记录；招人、解雇确认、政策、算力均可从界面操作。功能三选一和融资报价直接使用内核窗口，不重新抽取选项。左侧意识形态页从公司目标切换为两地各自的路线进度、人物和结局。
- `Engine.Dashboard.cs`：榜单、员工贡献探算、路线状态等只读展示接口。金额、用户数和日期复用内核格式；`save-roundtrip` 另与网页直接比较小数边界、五类岗位、工资、榜单和读后原档。
- 参谋条在中央场景上方，点击执行可用行动或定位目标；可忽略一条或展开其余条目。员工卡悬停显示贡献，事件选项悬停显示效果，结果页按好坏区分变化标签。事件 `art-slot` / `portrait-slot` 的 `userData` 保存表中资源键，现在只画占位。
- 试玩逐帧访问右侧 `side-*`、左侧 `action-*`、`dialog-recruit`、`dialog-policy-work`，记录候选人气泡 `employee-hover`。已雇员工气泡 `staff-hover`、`advice`、`dialog-gpu`、`dialog-sprint`、`dialog-raise` 和 `ideology-active` 在真实状态满足时才截图；不同种子不保证都有融资机会或触发路线之争。错误、断言、异常、缺失必检图仍判失败。
- 手验：清空姓名后检查占位字，再输入中文；检查长选项悬停前后是否遮挡；从建议跳转招人或算力，切换政策后重开存档，确认已保存；分别看深圳和湾区的路线说法。请反馈截图目录和 `player.log`，不要把静态编译当作图形验收。

## 界面 B：操作与验收

- **菜单与设置**：标题和经营页均有菜单。可继续、新游戏、访问商店/图鉴/成就或退出。设置存在 `Application.persistentDataPath/ldt_settings.json`，与当前局、局外成就分开；试玩不读取也不写入这份设置。四个音量通道的初值来自 `audio.json/VOLUMES`。参谋、静音、实时 FPS、帧率上限、自动降档和 50–150% 渲染比例可调。七个网页画质档按顺序映射到本机 Unity QualitySettings，渲染比例作用于 URP 而非 UI。
- **教学与主题**：首局按网页 `meta.runs == 0` 默认启用，建角最后一步可以关闭。`Engine.Tutorial.cs` 按表中月份和提前触发条件逐项开放，提示和未读队列随单局存档。老周说话时参谋让位；按钮、页签、仪表及顶栏按步骤开放。路线主题沿用内核版本选择，红色结果按剧情版本分苏联/合作社，资本结果用冷色，其余默认；结果窗口暂缓换色。
- **资源**：构建前的 `SyncTables` 同时调用 `tools/unity/sync-art.mjs`（需 Node 和已安装的 sharp）。仅转换美术表 `uses > 0` 的 46 张 WebP 为 JPEG；运行时以事件 art 键解码为 Texture2D。另从网页 SVG 生成公司标志、头像、剧情人物及页签图标。输出是忽略入库的 `Assets/StreamingAssets/shell-art`；单独检查转换可运行 `node tools/unity/sync-art.mjs`。编辑器直接 Play 前先用 **Liandan / Sync Tables**。
- **底栏与楼层**：可从丹炉出炉或转经营、从产品开冲刺或转研发、从首个项目转项目链；底栏列最近三条日志。多层办公室按部门显示楼层、人数、老板所在层；按钮或 ↑/↓、PageUp/PageDown、Home 切换，搬楼重置为全楼。
- **试玩**：`menu`、`settings`、`theme-default/soviet/rose/cold`、`tutorial-tip`、`illustrated-event` 均为新增必检 PNG。主题和教学采用首月快照副本，不向生产局写测试结局；带图事件仅当 UI 实际挂有纹理时抓取。看图时请留意老周提示是否挡住按钮、品牌图是否压住文字、插画裁切、调节后重启是否保留设置，以及真实路线结算后换色的时机。

### 已知差异

- 没有程序合成音乐、音效、环境声。保留混音设置和 `AudioLevelChanged` 接口；静音不清除各通道原音量。
- 苏联、合作社、冷色只有静态配色和标识。燃烧、藤蔓、冻结过渡留在 `ThemeChanged` 接口；无网页粒子和电梯/镜头动画，3D 仍是白盒。
- 员工按五种岗位复用网页头像，不按每个 UID 生成脸；创始人按四套衣着复用头像画法，不是 3D 人物渲染。剧情头像、菜单/页签图标和建角标准品牌色使用网页原图形；其他行动等仍用数据表符号。自定义旧档非标准品牌色不是逐色渲染。
- Unity 的质量档位、自动降档判断与网页 GPU 管线不同；没有 WebGL GPU 时间/绘制次数面板。桌面以外尺寸、字体回退、画面和鼠标交互仍须播放器实测。

### 内核改动后的复验

在仓库根目录执行；若已有与当前 JS 对应的轨迹文件，可省略两行生成命令。`save-roundtrip` 另用真实网页教学模块逐步比较开放顺序、提前触发、队列消费和教学关闭。

```powershell
dotnet build unity/GameCheck -c Release
dotnet build unity/KernelCli -c Release
node tools/verify/save-roundtrip.mjs
npm run parity
dotnet run --no-build -c Release --project unity/KernelCli -- parity
node tools/parity.mjs ops
dotnet run --no-build -c Release --project unity/KernelCli -- ops tools/parity/ops
node tools/parity.mjs trace
dotnet run --no-build -c Release --project unity/KernelCli -- trace tools/parity/trace
```

图形验收由本机执行：`node tools/unity/run.mjs build-game`，随后 `node tools/unity/run.mjs autoplay 42 unity/Game/Build/shots-B-42`（新目录）。请回传该目录的 `player.log` 和截图；静态编译、轨迹比对均不能代替此项。

页签排版回归：重新 `build-game` 后，用同一种子跑以下两次。目录须全新或为空；脚本核对每张 PNG 的实际像素尺寸。对照 `action-ideo.png`、`side-log.png` 和 `03-month-1.png`：左右页签的图标、文字和角标应在同一按钮内横排；空间不足时整颗按钮移到下一行。顶栏允许整项换行，不应盖住正文；行动卡的长说明仍应自然折行。

```powershell
node tools/unity/run.mjs autoplay 42 unity/Game/Build/layout-42-720 1280x720
node tools/unity/run.mjs autoplay 42 unity/Game/Build/layout-42-900 1600x900
```

试玩在主界面布局完成后检查顶栏和两侧页签是否越界、互相重叠，并比较页签文字所需宽度与实际宽度。失败时保留 `layout-failure.png`，具体控件和尺寸见 `player.log`。
