# 任务：给《炼丹大亨》事件插画图库再补 3 张图（湾区版路线之争）

先读 `docs/codex-art.md`：统一画风、硬性要求、尺寸和打包方式全部照旧。P 社式事件插画，深海军蓝 / 青色 / 暖琥珀为底；画面里不能有任何文字、字母、数字、Logo、旗帜图案；不能有可辨认的真实人物和真实品牌；主体放在中间水平带。看一眼 `docs/art-contact.jpg`，让新图和老图像出自同一位画师之手。

这 3 张用在湾区（美国）版的「路线之争」：一家 AI 公司在工会、合作社和「反共」舆论压力之间拉扯的讽刺喜剧。画面要有明确的美国、湾区感。

| key | 画面 |
|---|---|
| stream | A cozy-messy live-streamer's room at night seen from behind the streamer's chair: a big boom-arm microphone, a ring light, two monitors glowing with abstract scrolling chat light (no readable text, only colored dashes), RGB strip lighting in teal and rose, a gaming chair, posters as blank colored rectangles, and a sleepy dog curled on a couch in the corner. The streamer is a broad-shouldered silhouette in a tank top, face not visible. |
| unionhall | An American union hall meeting in a community center: rows of metal folding chairs, a modest podium, coffee urns and paper cups on a folding table, people holding up hand-painted protest signs whose faces are blank colored cards, warm tungsten light through tall windows, a few roses lying on the front table. Earnest, crowded, slightly shabby. |
| coophousing | Golden-hour East Bay hillside: a modern mid-rise apartment building under construction with a tower crane, a small community garden in front with raised beds, a line of residents moving in with boxes on one side, and a cluster of grumpy neighbors with blank signs on a lawn on the other side; Bay water and the hazy city skyline in the distance. |

## 产出

1. `art-src/stream.png`、`art-src/unionhall.png`、`art-src/coophousing.png`（原图）
2. 运行 `node tools/art-pack.mjs stream unionhall coophousing`，生成 `src/assets/art/<key>.webp`（1024×432，每张 ≤120 KB），并刷新 `docs/art-contact.jpg`
3. 汇报：三张图各画了什么、你自己满不满意

沙盒里没有网络，不要 `npm install`。只允许创建或修改：`art-src/stream.png`、`art-src/unionhall.png`、`art-src/coophousing.png`、`src/assets/art/stream.webp`、`src/assets/art/unionhall.webp`、`src/assets/art/coophousing.webp`、`docs/art-contact.jpg`。别动其它文件（有别人在同时改）。
