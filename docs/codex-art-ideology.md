# 任务：给《炼丹大亨》事件插画图库补 3 张图

先读 `docs/codex-art.md`：统一画风、硬性要求、尺寸和打包方式全部照旧（P 社式事件插画，深海军蓝 / 青色 / 暖琥珀为底；画面里不能有任何文字、字母、数字、Logo；没有可辨认的真实人物和真实品牌；主体放在中间水平带）。可以看一眼 `docs/art-contact.jpg`，让新图和老图像同一位画师画的。

这 3 张用在游戏里新加的「路线之争」事件链（一家 AI 公司内部的共产 / 资本路线之争，讽刺喜剧）。允许比老图多用一点红色，但整体光感、笔触要和老图一致。

| key | 画面 |
|---|---|
| redhall | A vast assembly hall inside a modern tech company: towering deep-red curtains, a giant abstract five-pointed-star geometric relief on the back wall lit in warm amber, rows of seated silhouettes facing a long podium, one small figure at a lectern. Constructivist diagonals and strong light shafts. No flags with symbols, no text, no emblems — only the star geometry. |
| commune | A utopian AI-run farming commune at dawn on the edge of a megacity: geodesic greenhouse domes, neat terraced fields, small friendly agricultural robots working beside a few human silhouettes, a communal hall with solar roofs, the city skyline hazy in the distance. Hopeful but slightly too perfect, like a brochure. |
| brainlab | A secret basement laboratory: a row of reclined white chairs, each with a sleek neural-interface helmet whose cables run up into glowing server racks; teal monitor glow, one lab-coated silhouette checking a clipboard, cold fluorescent strips, a heavy vault-like door ajar. Uncanny and darkly comic, not gory. |

## 产出

1. `art-src/redhall.png`、`art-src/commune.png`、`art-src/brainlab.png`（原图）
2. 运行 `node tools/art-pack.mjs redhall commune brainlab` 生成 `src/assets/art/<key>.webp`（1024×432，≤120 KB）并刷新 `docs/art-contact.jpg`
3. 汇报：三张图各画了什么、你自己满不满意

沙盒里没有网络，不要 `npm install`。只允许创建 / 修改：`art-src/redhall.png`、`art-src/commune.png`、`art-src/brainlab.png`、`src/assets/art/redhall.webp`、`src/assets/art/commune.webp`、`src/assets/art/brainlab.webp`、`docs/art-contact.jpg`。别动其它文件（有别人在同时改）。
