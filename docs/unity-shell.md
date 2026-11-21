# Unity 可玩界面（阶段 2 / 界面 A、B）

## 丹炉 A/B 图形验收

近景复查：除原来的三张外，截图命令现在还生成 `tripo-front.png`（正面平视）和 `tripo-back-high.png`（背面俯视）。位置、实例缩放和灯光不变。Tripo 源文件指定双面、无透明模式，只有底色图；Unity 对开口壳片使用不透明双面、关闭裁剪和底色 alpha，金属度 0.25、光滑度 0.32。原炉则从网页合批属性 `_ARM` 还原金属度和反相后的光滑度，不套铜材质预设。Blender QC 报告的 `normalOrientationEstimate` 用正反向射线估算疑似朝内面占全部面的比例，并单列无法判断数；它不是水密性证明。双面能解决剔除，不能替缺失的几何补面。

仓库根目录依次运行，最后一步由有显卡的本机执行；先关闭占用同一工程的 Unity。模型包已生成时可以跳过第一行。普通白盒缺少所选模型时仍保留原四桌小场景，不抛错；专门的截图任务缺任何一版都会报错，不拿空背景当通过。

```powershell
node tools/art/furnace.mjs
dotnet build unity/GameCheck -c Release
node tools/unity/run.mjs art-furnace
```

- **输入与交付**：私有源 `art-src/tripo/run3/` 需从授权存储另取；可用 `BLENDER` 指定无界面 Blender。两个包位于 `unity/Game/Assets/Art/Props/Furnace/Resources/Furnaces/{Tripo,Original}/`，各含一个 FBX（三级网格）、外置 PNG、`report.json`。选 FBX 是因为本工程直接使用 Unity 的 `ModelImporter`，无需为 glTF 安装额外包。分目录但材质/资源名不冲突。六张对照页在 `art-src/tripo/run3/normalized-qc/{Tripo,Original}/LOD{0,1,2}/sheet.png`，上行为原炉灰模，下行为交付 FBX 的实际回读。
- **美术参数**：`node tools/art/normalize.mjs 输入.glb --out 输出目录 --name Furnace --height 2.511 --budget 40000 --rotate-z 0`。也支持 FBX；用 `--reference 参考模型.glb` 替代 `--height` 可按其包围盒高度等比匹配，不拉伸宽深。`--qc 输出目录 --ref 参考四视图目录` 对每个 LOD 单独回读。米制、底面中心、Blender 正面 −Y；不跨 UV/硬边合点。静态网格保留为独立零件，保留分件枢轴，不输出骨骼或动画。
- **Unity 导入**：`PropImport.cs` 的丹炉分支沿用原规则，用文件单位、比例 1、导入法线和 URP/Lit；底色用 sRGB，法线按 Normal Map，ORM 是线性数据，另外打包 LitMask（R 金属、G 遮蔽、A 光滑度）。这只 Tripo 炉只有 BaseColor，原炉的平涂顶点色转成 UV 调色板。根节点只加一个 LOD0 的盒碰撞，切 LOD 不换碰撞。`FurnacePolicy.json` 配高度 2.511、宽深 2.8 m、分级预算和容差；异常记导入警告。切换以屏幕相对高度为准：≥38% 用 LOD0，16–38% 用 LOD1，3.5–16% 用 LOD2，再小剔除（实际还受质量设置的 LOD Bias 影响）。
- **摆位与切换**：网页 `ui.js` 的标题页使用 3 档。`scene3a/office.js` 取 `x=W/2-rz/2`、`y=0.06`、`z=clamp(-D/2+5.9,-D/2+4.2,D/2-2.2)`。白盒沿用这组房间局部坐标 **(5.9, 0.06, 0.15)** 和实例比例 **1.3**，因此炉高约 **3.264 m**；不是把 1.3 烘进资产。默认 Tripo；已重建的播放器加 `-furnace-original` 启动即显示原炉。白盒地板扩到相应楼层尺寸，未移植网页其他楼层逻辑。
- **截图**：`art-furnace` 是带图形设备的编辑器批处理，不运行经营模拟，也不保存临时场景。`unity/Game/Build/art-furnace/{original,tripo,tripo-close}.png` 应各为 1280×720；前两张机位、灯光、LOD0、场景尺寸固定，近景看炉耳、足和贴图。若出现洋红/白贴图或尺寸警告，检查 `unity/Game/Logs/art-furnace.log`；截图生成并不等于美术通过。
- **版本管理**：本轮新增源码和配置不附 `.meta`；私有原模、Unity 本地模型包及其 `.meta`、QC 和截图均不入 Git，未配置 LFS。正式入库前先核对授权与私有远端权限，再将源 `.blend`/GLB、交付 FBX、PNG 纳入 Git LFS，同时正常跟踪对应 Unity `.meta` 以稳定 GUID；LFS 不是访问控制。

## 第 1 批道具：从底图到验收

在仓库根目录执行。生成新底图前先在另一个终端保持 `npm run dev` 运行（默认 `127.0.0.1:5173`）；已有底图只刷新上传清单用 `node tools/art/batch.mjs prep --manifest-only`，不用开服务器。可用 `GAME_URL`、`CHROME`、`BLENDER` 指定本机程序。Tripo 上传、生成、下载和授权核对均由人操作，命令不会消耗积分。

```powershell
node tools/art/batch.mjs prep                           # 默认全部；也可只传 desk_set office_egg 等 ID
node tools/art/batch.mjs status
# 按 upload.json 的 tripoSlots 填格：网页「左侧」用 ref/right.png，「右侧」用 ref/left.png，正背同名。
node tools/art/batch.mjs ingest desk_set "$HOME/Downloads/desk_set.glb"
# 本批旧下载若提示深度镜像，用留存原件重试，无需重新生成或下载
node tools/art/batch.mjs ingest desk_set art-src/tripo/batch1/desk_set/tripo.glb --mirror-depth
node tools/art/batch.mjs ingest film_set art-src/tripo/batch1/film_set/tripo.glb --mirror-depth
# 将实际累计积分写入台账，例如 $points 已设为平台显示的数字；不是每次重跑都加一次
node tools/art/batch.mjs credit desk_set $points '首版，待美术复核'
node tools/art/batch.mjs credit --from-notes             # 从本批 credits-notes.json 合并累计积分、返工和备注，不累加
node tools/art/atlas.mjs                                 # 材质有变化就重做；部分批次亦可运行
dotnet build unity/GameCheck -c Release                 # 静态编译，不启动 Unity
node tools/unity/run.mjs art-batch1                     # 本机：关闭占用工程的 Unity，再截图
node tools/unity/run.mjs build-game-art                 # 本机：专用开发播放器
node tools/unity/run.mjs art-batch1-ab                  # 本机：同机位测 A/B
node tools/art/batch.mjs ledger                         # 先关闭 Excel；仅更新「素材来源」本批行
npm run tables
node tools/art/batch.mjs status
```

**只诊断，不修改模型**：`node tools/art/qc.mjs 输入.glb --ref 原模四视图目录 --out 诊断目录 --silhouette`。报告的 `silhouetteCandidates` 同时给出原样、深度镜像两组四向 IoU；不能逐视图挑高分。只有原样不过、整组镜像过线才提示修正。`ingest --mirror-depth` 会在 Blender 世界 Y 轴反射、修正绕序，并对实际交付的 LOD0 再做一次不翻图的比对（`verified-lod0/`）；`qc/sheet.png` 留作未经修正的下载件证据。`status` 只认正式目录内匹配下载件、原模及修正方式的 FBX，不把暂存件或单级「合格」当作完成。

- **底图与质检**：每件私有目录 `art-src/tripo/batch1/<id>/` 下有 `game.glb`、`ref/`、移入的 `tripo.glb` 和 `qc/`。`qc/sheet.png` 上原模、下下载件，以正、左、右、后排列。任一方向轮廓交并比低于 0.45、宽高或深高比偏离原模超过 30%、无贴图等会中止；数值通过后仍要人工检查开口、正反、文字、风格。失败时不替换上次交付，重做后再 ingest；新下载替换前旧下载另存。`lod-qc/` 为三档 FBX 回读图。正式交付在 `unity/Game/Assets/Art/Props/<id>/Resources/Batch1/<id>/`，均不入 Git。
- **分件**：先保留完整下载件的副本，按下载件实际 Blender 世界坐标测量切面（Z 向上，不能直接套游戏里的目标米数）。`node tools/art/split-part.mjs 原蛋.glb 分件蛋.glb --height $cutZ --upper-pivot 0 0 $cutZ`；斜切改用 `--point X Y Z --normal X Y Z`，下半也可给 `--lower-pivot X Y Z`。输出文件必须不存在。封盖适合单个封闭网格；多网格用 `--mesh` 会只输出指定网格，不能用这个结果冒充完整道具。确认切口、UV 和枢轴后，再把完整分件版本交给 ingest。
- **白盒和回执**：开发播放器加 `-art-batch1` 可预览批次摆位。`art-batch1` 给已安装的每件生成 `<id>.png` 近景、整屋生成 `office.png`；缺件跳过，不以占位方块充数。`status` 的 Unity 列指本次交付生成了匹配报告摘要的截图回执，不代表人工美术通过。无模型时即使有总览也不算单件通过。
- **几何判据**：批次 FBX 回读与 Unity 导入共用 `Assets/Shell/Resources/PropPolicy.json`（米）。底座取底面、吊装取顶面；贴墙取下缘和背面（Blender `max.y` / Unity 根局部 `max.z`），不是厚度中心。LOD0/1/2 宽深允许偏差分别为 6/8/12 cm，高为 4/6/8 cm；边界另留 0.1 mm 给浮点及 QC 报告取整。远景减面会去掉单侧突出的床腿、支架，允许深/宽中心分别偏 0.2/4/6 cm（远景约为单侧收缩量的一半）；接地、贴墙、贴顶仍限 0.2/1/2 cm，不随轮廓一起放宽。面数预算仍是 100%/42%/14%，向上取整。FBX 与导出报告的回读一致性是另一道检查，不能用远景容差放过导出错误。
- **重新导出**：`node tools/art/batch.mjs reexport [id...]` 沿用已质检的原件、参考图及镜像选择；随后用 `node tools/art/atlas.mjs` 刷新图集指纹。每级减面和尺寸校正后只以三角面引用的顶点定位，整件平移，不移动各零件的相对位置。导出并回读后，报告中的 `lods[].fbxSurfaceAnchorMeters` 三轴必须在 0.1 mm 内；孤立顶点不代表地面。
- **批量失败**：仅未安装的 FBX 跳过；已安装但导入、校验或截图失败的道具不留旧回执，继续处理余项，最后在终端及 `Logs/art-batch1.log` 汇总并以非零退出。编辑器只写近景及 `office.png`，不再代写播放器的对比图。
- **引擎采样**：重新 `build-game-art` 后运行 `art-batch1-ab`，不要最小化播放器。每种模式预热 30 帧，再用 `ProfilerRecorderHandle.GetAvailable` 枚举 Render 和 Render Pipeline 指标；在 `ab.log` 搜 `Liandan Render:` 可见原名、单位、类型和标志。Draw Calls、Batches（含 Total Batches）、SetPass 分别记录，不拿批次冒充绘制次数。计数器启动后等 4 帧，再在帧末读取已完成的新样本；每种最多尝试 120 帧，预热及采样限时 20 秒，播放器总超时 180 秒。
- **结果与回退**：`unity/Game/Build/art-batch1/` 下的 `draws.csv` 包含实际读到的各项原值（完全没有样本时仅表头）；`ab-summary.txt` 和终端列出来源及最近 30 个样本的中位数，孤立零值不丢弃，持续为零或不足 30 个样本标为不可用。两种模式都输出 `structure-A/B.json` 和 `office-A/B.png`；无引擎数据时仍成功生成结构对照。结构统计为整间办公室的启用 Renderer（包含各级 LOD，未按可见性筛选）、材质槽及不同材质/贴图，SRP Batcher 仅做兼容条件初筛，不是实际绘制或合批次数。截图及文件错误仍以非零退出。
- **台账**：`art-src/tripo/batch1/ledger.json` 按 ID 存对象，`credits` 为累计实耗，`reworks` 为返工次数；`note`、`source`、`method`、`prompt`、`date`、`license` 按实际补填。积分未知留空，不当作零；工作簿行键为 `batch1_<id>`。本批导入器为 `Editor/PropImport.cs`，也承接前述丹炉规则；整件静态资产不凭空产生动画，已切出的 Upper/Lower 保留枢轴。

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

## 声音

首次点击或按键解锁声音。设置页可以分别调节总音量、配乐、音效和环境声，取消静音后恢复各通道的原值。普通批处理跳过播放器音源。自动试玩和声音巡检会主动解锁合成器并录制最终混音，支持无声卡的软件采样时钟。

### 合成与触发

- `Assets/Shell/Audio/Synth.cs` 使用独立的 xorshift32，初值为 `0x6d2b79f5`。网页也在音频模块内使用这条随机序列。双方依次生成两秒白噪、粉噪、1.65 秒左右声道混响脉冲，再为环境层、声部和旋律抽样。采样率会改变生成缓冲所需的随机数数量。
- `Dsp.cs` 提供带限振荡器、低通／高通／带通、线性起音、指数衰减和目标渐近曲线。音乐干声与 16% 的卷积湿声汇入配乐总线，音效和环境声各走独立总线。总增益之后是带 6 ms 前视的双声道压缩器。`Reverb.cs` 对脉冲开头直接卷积，尾部用分块 FFT。滤波器的低通和高通按分贝解释 Q，带通使用线性 Q。[Web Audio 滤波器公式](https://www.w3.org/TR/webaudio-1.0/#filters-characteristics)
- `Recipes.cs` 包含 31 个音效，`Score.cs` 从 `audio.json/MOODS` 读取七种配乐，换曲交叉淡化 2.6 秒。苏联、合作社和冷色主题分别改变主奏和打击乐。危机段使用减三和弦、半拍低音、滴答及上行警报。`Ambience.cs` 按地区、昼夜、季节、人员、炉火、机柜、雨和危急状态混合七层连续声源与零星环境音。
- `ShellAudio.cs` 在主线程读取游戏快照、收集输入，流式 `AudioClip` 的 PCM 回调消费指令。合成器按采样位置推进 100 ms 调度和 150 ms 前瞻窗口，音符、包络和电梯到站音依采样时间定位。环境参数每半秒更新。危机分级复用内核的现金跑道、黑料曝光概率、监管冷却、政变和路线条件，危急优先于紧张，研发或有余量的在炼丹炉按月份切入专注。
- 按钮、选项和悬停在控件入口发声。事件窗与抽卡窗分别发出开窗和翻牌声，选项检定盖章并播放好坏结果，直接行动使用好坏结果或提示音。月结、亲自写代码、录用、裁人、参谋新提示、主题切换和危急升级均有独立触发点。进账、发布、撒花、升级、事故和彩蛋消费内核的 `fxq`。

### 离线对比

从仓库根目录运行。第一行使用临时 Chrome 配置和本机回环页面加载原版 `src/audio/audio.js`，无需启动 Vite。第二行启动 Unity 批处理，请先关闭占用同一工程的编辑器。

```powershell
node tools/audio/render-js.mjs
node tools/unity/run.mjs audio-render
node tools/audio/compare.mjs
```

纯命令行复验时，可用下面一行代替编辑器命令。两个入口都调用 `WavRenderer.RenderAll`，与播放器共享全部 DSP 和配方。

```powershell
dotnet run -c Release --project unity/AudioCli
```

JS 默认使用 `C:/Program Files/Google/Chrome/Application/chrome.exe`，也可用 `CHROME_EXE` 指定 Chromium。默认结果在 `unity/Game/Logs/audio-js/` 和 `audio-cs/`。工程副本可用 `node tools/audio/compare.mjs <JS目录> <C#目录>` 指定两边的文件。比较脚本逐项输出，完整指标写入 C# 目录的 `compare.json`，缺文件、静音、格式错误或任一超标都会返回非零退出码。

每个用例重置合成器。WAV 统一为 48 kHz、双声道、32 位浮点。每个音效用三秒窗口，在 0.4 秒触发，保留启动和尾音的实际位置。每种情绪分别渲染 16 秒。单项测试关闭环境声总线，环境调度仍消耗原有随机数。`tools/audio/scenarios.json` 另有四段 16 秒序列，覆盖两地环境、三种主题、换曲、调音量及静音恢复。

Chrome 基准通过 OfflineAudioContext 的 suspend/resume 将时钟停在 128 帧边界，按同一顺序回收已结束音源。离线适配器用单位增益节点固定多输入求和的顺序，避免浏览器内部的散列表遍历顺序影响浮点末位。本机 Chrome 158 上，两次独立进程生成的 42 个 WAV 逐字节一致。受限 Windows 环境中，本次用 `$env:AUDIO_CHROME_LOCAL='1'` 为临时 Chrome 进程传入 `--no-sandbox`；普通桌面运行使用默认启动参数。

| 比较项 | 通过条件与依据 |
| --- | --- |
| 时长与起止 | 采样帧数完全相同。以各自峰值的 −80 dB 标记有效声音，起点差 ≤ 3 ms（约一个浏览器渲染块），有效时长差 ≤ 15 ms，容纳微弱尾音。 |
| 峰值与整体 RMS | 各自相差 ≤ 1 dB，检查增益及总线路由。 |
| 10 ms RMS 包络 | Pearson 相关 ≥ 0.95，误差的二范数除以 JS 包络二范数 ≤ 0.15，同时限制形状和幅度。 |
| 频谱 | 4096 点 Hann 窗、50% 重叠，累加双声道功率。功率加权质心相对差 ≤ 10%，有效 1/3 倍频带能量差各 ≤ 3 dB。两端都低于 JS 最强频带 40 dB 的频带略去，避免近静音分母放大误差。 |
| 立体声 | 有差声道时，其 RMS 差 ≤ 1 dB，左右差分波形相关 ≥ 0.95；原本双声道相同的素材应继续相同。此项可检出丢失湿声或左右接反。 |
| 逐样本误差 | 报告两个声道合计的 RMSE 和最大绝对误差，保留原始时间位置。该项用于定位波形差异。 |

### 和网页版的差异

实时播放采用 Unity 输出设备的采样率，离线验证锁定 48 kHz。振荡器的带限查表、压缩器及分块卷积的浮点运算与 Chromium 有细微差异。Unity 白盒沿用网页的楼层行程时间、天气哈希和昼夜曲线驱动音频；界面继续使用已有的换层和弹窗表现，音效在相应界面出现时播放。网页定义了 `close`、`spend` 和 `rain_start` 配方但没有直接调用，Unity 分别接到关窗、结果中的现金支出和开始下雨。

### Windows 播放器验收

Windows 版沿用网页的现场合成。配表直接控制下一拍，夜色、降雨、炉火和机柜的声音可以连续混合，包内也省去七种情绪和四种风味对应的循环音轨。代价是播放时要算滤波和卷积，还要在两种后端检查调度、混音和瞬态。原预渲染方案的取舍见[移植计划第六节](unity-port-plan.md#六各系统怎么移植)。

在仓库根目录运行。每次给一个新目录，避免把上次的录音或读回日志算进本次结果。`LIANDAN_PLAYER` 可指定已构建的播放器。以下两轮均会运行约三分钟的无界面声音巡检，再完成一局正常截图试玩。

```powershell
node tools/unity/run.mjs build-game
node tools/unity/run.mjs build-game-il2cpp
foreach ($backend in 'Game','GameIl2cpp') {
  $env:LIANDAN_PLAYER = (Resolve-Path "unity/Game/Build/$backend/Liandan.exe").Path
  node tools/unity/run.mjs audiotest "unity/Game/Logs/test-$backend"
  if ($LASTEXITCODE) { break }
  node tools/unity/run.mjs autoplay 42 "unity/Game/Logs/play-$backend"
  if ($LASTEXITCODE) { break }
}
Remove-Item Env:LIANDAN_PLAYER
```

- **整局覆盖**。`player.log` 的 `Liandan audio coverage:` 在一行里列出各类实测值和未触发项。音效和情绪的分母直接取自 `audio.json`。音效在已分配的声部到达起音采样时计数。记录还包括选中的风味、场景模式、地区、内核算出的危机等级和实际发声的环境层。试玩沿用已有主题截图流程，种子与操作路径都影响覆盖，遇不到的事件会列为缺项。前 60 秒录音写满后，覆盖计数继续到本局结束。
- **全项巡检**。`Liandan.exe -audiotest -shots <目录>` 直接启动合成器，依次独奏每个音效、连续播放七种情绪、遍历四种风味，随后通过场景参数逐层激活城市、办公室、炉火、风扇、雨、虫鸣、警报。城市底噪在后续场景仍可听到。七层分别以经过音量增益的实际信号登记。巡检脚本提供场景与危机输入，实际游戏的危机判定由 autoplay 覆盖。缺少必需覆盖时播放器以失败码退出。
- **实录位置**。`mix.wav` 是送给流式 `AudioClip` 的双声道 Float32 PCM，保留限幅器之后的原始幅值。`mix.json` 记录设备采样率、声部起音、小节、循环、换曲、巡检分段和覆盖集合，时间使用同一采样时钟。`source=pcm-callback` 表示 Unity 的 PCM 回调取过这些样本。批处理、无设备或启动后 1.5 秒始终没有收到首个回调时，`software-clock` 表示播放器用软件时钟推进相同合成器。这种录音可检查总混音，扬声器、系统音量与设备链路需在有设备的一轮观察。巡检录全程，试玩录满 60 秒或录至本局较早结束。诊断文件均在调用方的输出目录生成。
- **真实重启读回**。巡检使用设置页的写入、读入与音量应用路径，测试文件放在 `<目录>/prefs/ldt_settings.json`。第一进程保存 master=67、music=43、sfx=81、amb=29、mute=1 后退出。`run.mjs audiotest` 随后用同一可执行文件和目录启动 `-audiotest-readback`，逐项比对；`readback.log` 出现 `Liandan audio prefs OK:` 且退出码为 0 才通过。直接调用可执行文件时，第二步也要显式运行。

两个 Node 入口都会执行 `check-output.mjs`。保留同一目录下的 WAV 和 JSON 即可复查，退出码 0 表示通过，1 表示有缺项或异常。

```powershell
node tools/audio/check-output.mjs unity/Game/Logs/test-Game unity/Game/Logs/play-Game
```

| 检查 | 取样与通过条件 |
|---|---|
| 完整性和削波 | 校验 WAV 头、采样长度、录音时钟和缓冲溢出标记。两个声道的全段 RMS 均须大于 `1e-5`，逐样本检查非有限值及 `abs(x) >= 1`，容许比例为 0。全项巡检还要求每个独奏段有实际声部及可测 RMS。 |
| 爆音与咔哒 | 全程逐声道算相邻采样差。差值达到 0.035 满刻度且超过相邻两个 5 ms 窗的差分 RMS 的 12 倍，或差值达到 0.25，即标记异常。仅豁免各音效声部经过压缩器 6 ms 延迟后的起音前 2 ms 至后 4 ms。列出异常时刻、声道及附近的换曲、小节和循环位置。此判据筛查瞬态尖峰，较小的可听失真仍可能低于门限。 |
| 交叉淡化 | 比较换曲点延迟 6 ms 后两侧各 20 ms 的最终混音 RMS，容许差为 `0.018 + 0.8 × 两侧较大 RMS`。为排除仅靠环境底噪也显得平滑的情况，同时采集新旧配乐干声各自经过实际淡化增益后的 20 ms RMS 及增益。完整换曲须有至少 5 个双声部均超过 `1e-5` 的窗口，活动声部的增益对 2.6 秒线性坡度偏差小于 0.023。巡检六次换曲分别验收，并验证交叠窗口最终 WAV 的 RMS 大于 `1e-6`。试玩频繁操作中被打断或位于录音边缘的换曲另列计数。 |
| 四路音量与静音 | 每项按开启、归零、恢复分三段，其余通道独奏隔离。总音量和静音使用持续的环境声；音乐使用 `focus`；音效每段在同一偏移发 `ding`。每段取 1.8–3.2 秒的最终混音，避开 120–150 ms 增益平滑的尾部。开启和恢复 RMS 均须大于 `1e-4`；归零须低于 `1e-5`，且比两侧较弱的一段至少低 60 dB。 |

没有 Unity 时可用 `dotnet run -c Release --project unity/AudioCli -- mix-check unity/Game/Logs/mix-cli` 复现巡检音序，再用 `node tools/audio/check-output.mjs --fixture unity/Game/Logs/mix-cli` 校准判据。该录音的来源是 `cli-fixture`，默认播放器验收会拒绝这种来源。CLI 不覆盖播放器回调、设置存储或跨进程读回。

### 包体测量

以 `48b2f18` 为移植前基线。用同一份 Win64 Player 的 Bee 参数、Unity 附带的 Roslyn 和相同的 Release 优化分别编译基线源码与当前工作树，只统计 DLL 字节。命令读取现有编译缓存，两个输出都在临时目录生成。表中包含本轮巡检与录音代码。

| 项目 | 基线 | 本次 | 增量 |
|---|---:|---:|---:|
| 既有 `Assembly-CSharp.dll` | 99,328 B | 159,744 B | +60,416 B |
| 既有 `Kernel.dll` | 220,160 B | 221,184 B | +1,024 B |
| 托管代码合计 | 319,488 B | 380,928 B | **+61,440 B（60 KiB）** |
| 新增独立音频程序集、预渲染音频资源 | 0 | 0 | **0 B** |
| 随包的既有 `StreamingAssets/tables/audio.json` | 3,996 B | 3,996 B | **0 B** |

先前实际播放器的 Mono `Assembly-CSharp.dll` 为 143,360 B，`Kernel.dll` 为 221,184 B；相对上述基线，声音移植约占 44 KiB 的托管代码，本轮验收再增加约 16 KiB。IL2CPP 会裁剪并把 IL 编译进 `GameAssembly.dll`，整包增量还受链接对齐和元数据影响。仓库现有两个已打包的游戏目录均含声音功能；历史探针的场景和裁剪配置不同。要测最终分发增量，请对同一后端、同一 Unity 版本和相同构建配置的移植前后 Windows 游戏包做成对测量。工具排除 Unity 标为 `DoNotShip` 的调试和备份目录，列出分发文件合计、相关程序集、原生代码、元数据和音频资源字节数。

```powershell
node tools/audio/measure-il.mjs 48b2f18
node tools/audio/build-size.mjs unity/Game/Build/Game
node tools/audio/build-size.mjs unity/Game/Build/GameIl2cpp
# 如果留有移植前的同后端完整游戏包，先保存其清单，再算新包差额。
node tools/audio/build-size.mjs D:/builds/before-audio/Game --save unity/Game/Logs/mono-before.json
node tools/audio/build-size.mjs unity/Game/Build/Game --against unity/Game/Logs/mono-before.json
```
