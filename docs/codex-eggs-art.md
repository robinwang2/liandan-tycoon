# 任务：彩蛋道具第 6 批（batch6，12 件，全部不花 Tripo 积分）

背景：游戏《炼丹大亨》要加一批图形学 / AI 圈经典彩蛋道具。玩家可以点它们（点击逻辑另一个人在做，见文末「接口」）。
你只负责**模型资产**：拿到源模型或程序生成 → 规范化 + 三级 LOD → FBX → Unity 导入 → 截图验收 → 台账登记。

先读：`docs/unity-port-plan.md` 里「发财树换成 CC0 的 ficus 盆栽」一节、`tools/art/batch.mjs`（`replace` 命令和 `replacementState`）、
`tools/art/ficus_prep.py`、`tools/art/normalize.py`、`unity/Game/Assets/Shell/Resources/PropPolicyBatch5.json`、`unity/Game/Assets/Shell/Editor/PropImport.cs`。
这批全部照 ficus 的 `replacement` 路子走：选件表 `PropPolicyBatch6.json` 每件带 `replacement`（来源、许可、prep 脚本、源文件哈希），不走 Tripo 下载。

## 只允许改这些文件
- 新增：`tools/art/eggs_prep.py`（或按件拆几个 prep 脚本，放 `tools/art/` 下，名字以 `eggs_` 开头）、`unity/Game/Assets/Shell/Resources/PropPolicyBatch6.json`、贴图生成脚本 `tools/art/eggs_textures.py`
- 可改：`tools/art/batch.mjs`、`normalize.py`、`qc.py`、`lod_integrity.py`（只做通用化，不改前 5 批行为）、`unity/Game/Assets/Shell/Editor/PropImport.cs`、`PropShots.cs`、`tools/unity/run.mjs`（让 `art-batch6` 能跑）
- 台账：`tables/美术.xlsx`（「道具」「素材来源」两张表追加 12 行）→ `npm run tables` 重新导出 `src/data/tables/art.json`
- 文档：`docs/unity-port-plan.md` 追加一节「第 6 批：彩蛋道具」
- **不要碰** `tables/设定.xlsx`、`src/data/tables/defs.json`、`unity/Game/Assets/Shell/*.cs`（Editor 目录除外）、`Shell.uss`、`unity/Kernel/`、`src/` 下任何 JS。另一个人同时在改这些。
- 源模型和下载件放 `art-src/eggs/<id>/src/`，**不进 git**（和 ficus 一样，哈希写进选件表）。

## 12 件清单（id、尺寸是目标包围盒 宽×深×高 米，原点底面中心，正面 +Z）

| id | 名称 | 来源 / 做法 | 许可与致谢（原样写进台账） | 目标尺寸 | 面数上限 |
|---|---|---|---|---|---|
| egg_teapot | 犹他茶壶 | 程序生成：用 Newell 1975 原始 32 片双三次 Bézier 曲面数据（含壶底，即 Newell 原版 32 patch；数据写进脚本常量），细分成网格；陶瓷白釉，微微偏暖 | Martin Newell，犹他大学，1975；曲面数据按公有领域使用 | 0.28×0.18×0.15 | 4000 |
| egg_bob | 小黄鸭 Bob | 下载 Keenan Crane 模型库 Bob（https://www.cs.cmu.edu/~kmcrane/Projects/ModelRepository/ ，带贴图） | Bob by Keenan Crane，CC0 1.0 | 0.12 高 | 6000 |
| egg_spot | 奶牛 Spot 摆件 | 同上 Spot，带贴图；底下加一个小木底座（程序） | Spot by Keenan Crane，CC0 1.0 | 0.16 高 | 6000 |
| egg_blub_tank | 鱼缸里的 Blub | 同上 Blub（带贴图）×1 放进一个程序生成的桌面小鱼缸（玻璃 + 水体 + 石子 + 水草），鱼单独节点 `Fish`，方便以后做游动 | Blub by Keenan Crane，CC0 1.0 | 0.45×0.25×0.35 | 8000 |
| egg_hotdog | NeRF 热狗 | 从 Hugging Face `wengflow/robust-e-nerf` 的 `scenes/hotdog.blend` 取（和 ficus 同一来源），去相机地面，烘 UV | hotdog by erickfree，BlendSwap 23962，CC0；文件取自 NeRF 合成数据集（CC-BY-4.0），致谢 Mildenhall 等 | 0.25 宽（含盘） | 6000 |
| egg_mic | NeRF 麦克风 | 同上 `scenes/mic.blend` | mic by up3d.de，BlendSwap 23295，CC0；同上致谢 NeRF | 0.40 高（台式） | 8000 |
| egg_cornell | 康奈尔盒子 | 程序生成：一个开口朝 +Z 的小盒子，左墙红、右墙绿、其余白，顶部一块发光面板（自发光，单独材质 `M_egg_cornell_Light`），里面一高一矮两个白色长方体（按 1984 论文的经典摆法转角度） | 场景按 Goral 等 1984 年论文描述自建（Cornell University Program of Computer Graphics） | 0.40×0.40×0.40 | 1000 |
| egg_paperclips | 回形针堆 | 程序生成：一个小纸盒 + 溢出来的约 150 枚回形针（细管扫掠，随机但固定种子），银色金属 | 原创；梗出自 Nick Bostrom 2003 年的思想实验 | 0.30×0.22×0.10 | 15000 |
| egg_gpu_ad | 华强北「核弹」显卡广告 | 程序生成立式 KT 板广告牌（金属支架 + 板）+ 贴图。贴图见下文 | 原创 | 0.80×0.40×1.70 | 2000 |
| egg_bbb_poster | 《大雄兔》海报 | 挂墙画框 + 海报图。图用 Blender 基金会官方海报（peach.blender.org，CC-BY 3.0），下载原图记 URL 和哈希 | Big Buck Bunny © Blender Foundation，peach.blender.org，CC-BY 3.0 | 0.60×0.04×0.90 | 500 |
| egg_attention | 装裱的论文首页 | 挂墙画框 + 自己排版的贴图：大标题「Attention Is All You Need」，下面一个自己画的简化 Transformer 框图（编码器/解码器两摞方块 + 箭头），**不要放论文原文和作者名单** | 原创排版；论文：Vaswani 等，NeurIPS 2017 | 0.50×0.04×0.70 | 500 |
| egg_whiteboard | 写满梗的白板 | 程序生成移动白板（带轮支架）+ 贴图：手写风写「strawberry 里有几个 r？」「9.11 > 9.9 ?」、几个画歪的 loss 曲线、一个被圈起来的「AGI 明年就到」 | 原创 | 1.40×0.55×1.80 | 3000 |

贴图规则：
- 文字贴图用 `tools/art/eggs_textures.py`（Pillow）生成 PNG，中文字体用仓库里 `unity/Game/Assets/Shell/Fonts/` 下的思源黑体（OFL）；白板手写风可以用同一字体 + 轻微抖动旋转。生成的 PNG 放 `art-src/eggs/<id>/tex/`（不进 git，脚本可重建）。
- **品牌：不出现真实商标。** 显卡广告文案默认用戏仿版（用户可能会改，所以文案集中写在脚本顶部一个常量里）：
  主标题「GFX 58O 核弹级」，副标题「华强北 · 矿渣翻新 · 包过保」，卖点三行「两张就能炼 AlexNet」「功耗 244W 冬天能取暖」「拆机满血 · 假一赔三」，底部「赛格电子市场 3 楼 · 认准老王」。画面：一张自己画的双风扇显卡剪影 + 爆炸光效 + 大红大黄配色。不要画 NVIDIA / GeForce 的 logo、绿色眼睛标志。
- 外部下载件（Keenan Crane、Hugging Face、Blender 基金会海报）用脚本或手动下载都行，原件存 `art-src/eggs/<id>/src/`，SHA-256 写进选件表 `replacement.blendSha`（或同义字段）。

## 规范化与验收
- 照 ficus：prep 脚本输出三级源 GLB（LOD0 原件或程序精模，LOD1/2 你按件选减面或简化代用），`normalize.py --lod-sources` 缝合、裂缝检查、FBX 回读。面数上限见上表，LOD1/LOD2 约 40%/12%。
- 小件（茶壶、鸭、牛、热狗）轮廓门槛照常 0.90；扁平画框和白板可以放宽，原因写进选件表。
- 每件在选件表里给一个展示位（x,z 排成 4×3 网格，和第 5 批一样的间距），并写 `"egg": true`。
- 碰撞盒：每件都要有一个**覆盖整件**的盒碰撞体（点击要用），Unity 导入时生成。挂墙件也要。
- 截图：`node tools/unity/run.mjs art-batch6` 能跑出 12 件单件近景 + `contact.jpg`。Unity 编辑器 Codex 沙箱里开不了，**你只要保证脚本离线编译通过**，实际 Unity 运行由 Claude 来跑。Blender 能跑（本机 Blender 5.3 Steam 版），Blender 那一侧的产物和 QC 请真跑出来。
- 台账：美术.xlsx「道具」加 12 行（状态「第三方 CC0 替换」或「程序生成」），「素材来源」加 12 行，积分 0，许可写全。`npm run tables` 和 `npm run check` 必须通过。
- 前 5 批：`git diff` 里不应出现它们的选件表、产物或台账行的变化。

## 接口（另一个人依赖）
- Unity 资源路径固定为 `Resources/B6/<id>/SM_<id>`（沿用 batchConfig 规则），12 个 id 照上表一字不差。
- 根节点上要有覆盖整件的 `BoxCollider`。

## 交付
在分支 `feat/eggs-art` 上提交（中文提交信息，说明每件来源、面数、QC 结果），不要推送。最后输出一段总结：每件三级面数、尺寸、轮廓 IoU、未解决的问题。
