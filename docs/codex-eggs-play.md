# 任务：Unity 里的「彩蛋」玩法：可点击、点了有反馈、跨局收集、集齐给成就「彩蛋大师」

背景：《炼丹大亨》Unity 版（`unity/Game`，Unity 6000.5.2f1 + URP，界面 UI Toolkit；规则内核 `unity/Kernel` 纯 C#）。
场景里会摆一批彩蛋道具（模型由另一个人在 `feat/eggs-art` 分支做，Unity 资源路径 `Resources/B6/<id>/SM_<id>`，根节点带覆盖整件的 BoxCollider）。
**模型可能还没到**，所以你的代码要在资源缺失时用一个带颜色的占位方块代替（名字标出来），保证玩法能单独跑通。

先读：`unity/Game/Assets/Shell/GameShell.cs`、`Whitebox.cs`、`PropBatch.cs`、`Autoplay.cs`、`ShellAudio.cs`、`Resources/Shell.uss`、
`unity/Kernel/GameStore.cs`（Meta 存档：points/own/ach/ends/runs/best）、`unity/Kernel/Engine.Team.cs` 的 `Award`、
`tools/tables/schema.mjs`（设定.xlsx 的「成就」表）和 `docs/unity-port-plan.md`、`docs/unity-shell.md`。

## 只允许改这些文件
- `tables/设定.xlsx`：新加一张表「彩蛋」；「成就」表加一行 `egg_master`。改 `tools/tables/schema.mjs`（及需要的 `tools/tables/lib/*`）让它导出到 `src/data/tables/defs.json` 的 `EASTER_EGGS`，并做校验（id 唯一、必填列、道具 id 以 `egg_` 开头）。`npm run tables`、`npm run check` 必须过。
- 新增 C#：`unity/Game/Assets/Shell/Eggs.cs`（可以拆成 `Eggs*.cs` 几个文件）。
- 可小改：`GameShell.cs`（挂钩子、加计数显示）、`Whitebox.cs`（展示模式）、`Autoplay.cs`（测试）、`ShellAudio.cs`（如需新音效 cue，只追加）、`Shell.uss`（**只在文件末尾追加**新样式类，不改已有规则）、`unity/Kernel/GameStore.cs`（Meta 默认值加 `eggs`）。
- 文档：`docs/unity-shell.md` 追加一节「彩蛋」。
- **不要碰**：`tables/美术.xlsx`、`src/data/tables/art.json`、`tools/art/`、`Shell/Editor/` 下的道具导入、任何 JS 运行代码（`src/game`、`src/scene*`、`src/ui`，JS 版冻结）、主题过场相关代码（另一个线程在改）。

## 「彩蛋」表（列：id、名称、道具、摆放、说明、致谢）

| id | 名称 | 道具 | 摆放 | 说明（点开后显示的一句话） | 致谢 |
|---|---|---|---|---|---|
| teapot | 犹他茶壶 | egg_teapot | 茶水间台面 | 1975 年 Martin Newell 照着自家茶壶描出的曲面，从此成了图形学的 Hello World。 | Martin Newell，犹他大学，1975 |
| bob | 小黄鸭 Bob | egg_bob | 工程师工位 | 卡住的时候对它把代码讲一遍，讲着讲着 bug 就自己找到了。 | Bob by Keenan Crane，CC0 |
| spot | 奶牛 Spot | egg_spot | 老板办公室书架 | 几何处理论文里出镜最多的奶牛，身上那张贴图是一整块展开的 UV。 | Spot by Keenan Crane，CC0 |
| blub | 鱼缸里的 Blub | egg_blub_tank | 大堂前台 | Spot 的同门师弟，一条专门为测试网格算法而生的鱼。 | Blub by Keenan Crane，CC0 |
| hotdog | NeRF 热狗 | egg_hotdog | 会客区茶几 | NeRF 论文的八个测试场景之一。训练了二十万步，最后还是被当成午饭。 | hotdog by erickfree（BlendSwap，CC0）；NeRF 合成数据集，Mildenhall 等 |
| mic | NeRF 麦克风 | egg_mic | 发布会讲台 | 也出自 NeRF 数据集。试音：一、二、三，loss 在降。 | mic by up3d.de（BlendSwap，CC0）；NeRF 合成数据集，Mildenhall 等 |
| cornell | 康奈尔盒子 | egg_cornell | 实验室 | 红墙、绿墙、一盏顶灯。1984 年起，全世界的渲染器都拿它对答案。 | Goral 等，康奈尔大学，1984 |
| paperclips | 一盒回形针 | egg_paperclips | 老板办公桌 | 一个只想造回形针的 AI，最后把整个宇宙都变成了回形针。先从这一盒开始。 | Nick Bostrom 的思想实验，2003 |
| gpu_ad | 「核弹」显卡广告 | egg_gpu_ad | 机房门口 | 华强北老广告。2012 年的 AlexNet，就是用两张这一代的「核弹」炼出来的。 | 原创 |
| whiteboard | 写满梗的白板 | egg_whiteboard | 会议室 | strawberry 里到底有几个 r？9.11 和 9.9 谁大？大模型的考前必背。 | 原创 |
| bbb | 《大雄兔》海报 | egg_bbb_poster | 休息区墙上 | Blender 基金会 2008 年的开源短片，主角是一只好脾气的大兔子。 | Big Buck Bunny © Blender Foundation，CC-BY 3.0 |
| attention | 装裱的论文 | egg_attention | 老板办公室墙上 | 2017 年的一篇论文，标题后来成了整个行业的口头禅。 | Vaswani 等，NeurIPS 2017 |

文字直接照抄进表。真实品牌一律不出现（用户已定：戏仿，不带真实商标）。
「成就」表新行：`egg_master`，名称「彩蛋大师」，图标 🥚，说明「找到全部 {N} 个彩蛋」（N 运行时按表内彩蛋数算，如果描述模板不支持就写「找到全部彩蛋」）。
以后会再加彩蛋（下月的兔子、鲸鱼娘手办等），**总数一律按表里的行数算**，不要写死 12。

## 玩法
1. **点击**：彩蛋物体可以用鼠标点（射线打 Collider，用项目现有的输入方式；UI 面板挡住时不触发）。悬停时有轻微反馈（描边或微微放大 + 指针手势，二选一，克制）。
2. **反馈**：点了弹一张小卡片（UI Toolkit，屏幕下方或物体旁边），显示名称、说明、致谢（小字），约 4 秒后或点别处自动收起；物体做一个小的弹跳/旋转动画；配一声音效（`ShellAudio` 里挑一个现成的轻快 cue，或追加一个合成音效）。
   - 第一次发现：卡片顶上写「发现彩蛋！ x/N」，并记进 Meta。
   - 再点：照样弹卡片，但不加计数，顶上写「已收集」。
3. **跨局保存**：`Meta["eggs"]` 是 `{id: 1}`。点到就立刻存 Meta（`Store.SaveMeta`），不要等结局结算。老存档没有 `eggs` 字段时按空处理。
4. **计数显示**：在不挤的地方放一个小标签「彩蛋 x/N」（比如设置或成就附近）；集齐后变金色。
5. **成就**：集齐时写 `Meta["ach"]["egg_master"]=1` 并立刻存，弹一张更大的成就卡「解锁成就：彩蛋大师」配好结局类的音效。成就列表里要能看到它（现有成就界面如果有就接上）。这个成就走 Meta，不走局内 `ach`，所以不影响内核对拍。
6. **摆放**：「摆放」列是给以后真办公室场景用的锚点说明。现在加一个展示模式：命令行 `-eggs` 时用 `Whitebox` 的地板 + 相机，把所有彩蛋（模型或占位块）按 4×3 网格摆出来，可以直接点。

## 测试（必须有）
- 在 `Autoplay.cs` 或新加的测试入口里：`-eggs-test <截图目录>` 用新的空存档目录启动展示模式，程序化地依次「点」每个彩蛋（走和鼠标同一条代码路径，比如用屏幕坐标做射线），检查：卡片出现、计数从 1 走到 N、Meta 文件里 eggs 和 ach.egg_master 写入、重复点不加计数、重启（重新 LoadMeta）后进度还在。每一步截图，最后打印 `Liandan eggs OK: N/N` 或失败原因。
- Unity 编辑器 Codex 沙箱里开不了，**你只要保证 C# 离线能编译**（能用的话用项目里现有的离线编译办法；没有就仔细自查），实际运行由 Claude 来跑。
- 内核：只要你动了 `GameStore.cs`，就跑一遍现有内核测试 / 对拍能跑的部分（`unity/KernelCli`，看 `docs/cs-kernel.md`）。

## 交付
在分支 `feat/eggs-play` 上提交（中文提交信息），不要推送。最后输出总结：改了哪些文件、怎么运行展示模式和测试、哪些没能验证。
