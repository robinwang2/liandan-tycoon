# Unity 最小可玩界面（阶段 2）

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
- `Assets/Shell/GameShell.cs`：标题、商店、继续、界面状态与队列泵。`Wizard.cs`：五步建角，属性上限、区域和局外锁定，允许留点。品牌图标图稿、完整教学和其余经营页不在本轮范围。
- `Panels.cs`：顶栏、按页签分类的内核行动视图、公司/团队侧栏、事件与结果、结局。`Resources/Shell.uss` 和 `ShellTheme.tss` 提供布局和控件主题；`Whitebox.cs` 与 `Whitebox.mat` 是真实 URP 方块场景，不是 UI 背景截图。中文使用随包的 Noto Sans SC 动态多图集字体，字重使用默认值。
- `Autoplay.cs`：单独的固定种子 UI 冒烟机器人，调用与按钮相同的回调（包括切页签、选项和结果继续），不在后台直接跑完整局；优先现金流、招人、发布、上市，其余随机。它不替代 144 局指纹机器人。截图等到帧尾，读取真实 framebuffer 后同步编码写 PNG，再退出。
- `Editor/Build.cs`：构建前自动生成或复用 Resources/ShellPanel.asset 和 ShellFont.asset，检查 ICU 与 URP/Lit 引用。可用 `node tools/unity/run.mjs setup-ui` 单独生成，生成的资源与 .meta 可纳入版本控制。构建完成后恢复原后端。`GameCheck` 同时编译编辑器和播放器脚本，不能验证 Unity 的资源导入、面板排版、鼠标输入、字体或显卡输出。首轮图形验收请检查长事件可滚动、中文无方框、方块不呈洋红色，以及完整局结束后能回标题重新开局。
