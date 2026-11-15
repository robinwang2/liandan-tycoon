# 任务：为《炼丹大亨》生成事件背景图库（P 社风格事件插画）

《炼丹大亨》是一款 AI 创业讽刺模拟游戏。事件弹窗要改成 Paradox（《群星》《钢铁雄心》）那种样式：窗口顶部一张宽幅插画，下面是文字和选项。
请用你的 **图片生成能力** 画一套风格统一的事件插画，像 P 社那样「一张图配一类事件」。

## 统一画风（每张图的提示词都要带上这段意思）

Painterly digital illustration in the spirit of grand-strategy game event pictures: cinematic wide composition, dramatic directional lighting, visible confident brushwork, rich but slightly muted palette built on deep navy, teal and warm amber, subtle atmospheric haze, a faint satirical/ironic mood. Contemporary tech-industry subject matter.

硬性要求：
- **画面里不能有任何文字、字母、数字、Logo、水印、UI 截图**（屏幕上只能是抽象的光斑、条形、曲线）
- **不能出现可辨认的真实人物、真实品牌或真实公司的标志**；人物尽量用背影、剪影、远景，面部不做特写
- 主体放在画面 **中间的水平带**：成品会被裁成约 2.4:1 的横幅，上下各 18% 会被裁掉，重要内容别放在那里
- 不要漫画分格、不要边框、不要照片写实，要「画出来的」质感
- 整套图的色调、笔触、光感要像出自同一位画师

## 产出

1. 每个 key 一张成品：`src/assets/art/<key>.webp`，**1024×432 像素**，WebP 质量约 80，单张 ≤ 120 KB
2. 原始生成图保留在 `art-src/<key>.png`（方便以后重裁）
3. `tools/art-pack.mjs`：Node 脚本，用 `sharp`（已装在 devDependencies）把 `art-src/*.png` 居中裁成 2.37:1 → 缩到 1024×432 → 输出 webp；并额外生成一张 **联络表** `docs/art-contact.jpg`（把所有成品缩成 256×108 的小图拼成 6 列网格，每张下方用 sharp 的 SVG 叠字写上 key，方便人工一眼检查）
4. 最后汇报：生成了哪些 key、哪几张你自己不满意

沙盒里没有网络，不要 `npm install`；`sharp` 已经装好可直接 import。只允许创建/修改：`src/assets/art/*`、`art-src/*`、`tools/art-pack.mjs`、`docs/art-contact.jpg`。别动其它文件（有别人在同时改）。

## 图库清单（key：画面内容）

| key | 画面 |
|---|---|
| datacenter | A vast data hall: endless rows of server racks with teal status lights receding into haze, one tiny technician silhouette for scale |
| furnace | An ancient three-legged bronze alchemy cauldron glowing orange from within, thick cables running from it into modern server racks, sparks rising — alchemy meets machine learning |
| launch | A product keynote: lone presenter silhouette on a dark stage before a gigantic glowing abstract screen, sea of audience silhouettes holding up phones |
| leaderboard | A grand hall dominated by a towering abstract scoreboard of glowing horizontal bars, engineers below staring up, one bar suspiciously taller than the rest |
| boardroom | A tense boardroom at dusk: long table, empty chair at the head, directors as silhouettes against a floor-to-ceiling window with a city skyline |
| pitch | A young founder (seen from behind) pitching to three seated investors in a glass-walled office, hand-drawn hockey-stick curve glowing on the wall |
| bubble | Enormous iridescent soap bubbles drifting between glass skyscrapers of a financial district at golden hour, tiny people pointing up |
| crash | A trading floor in panic: walls of red abstract charts plunging, papers flying, traders as frantic silhouettes |
| congress | A formal legislative hearing room: a lone witness at a small table facing a raised semicircular dais of elderly lawmakers, flashbulbs, heavy wood panelling |
| ministry | A solemn government office: a heavy desk with neat stacks of documents and a red ink seal, a visitor waiting on a bench in a long quiet corridor |
| courtroom | A courtroom from the back: judge's bench, a gavel in mid-air, towering stacks of legal folders on both tables |
| press | A forest of microphones and camera lenses thrust toward the viewer, blinding flashbulbs, a blurred podium behind |
| vault | A heavy steel vault door standing ajar in a dark room, folders and loose papers spilling out, one beam of light cutting across |
| port | A container port at dusk: giant cranes, stacked containers, one open crate glowing with circuit boards being inspected by customs officers in silhouette |
| chess | Two players facing each other across a chessboard whose pieces are tiny server towers and microchips, one side lit teal, the other amber, the players' faces in shadow |
| office_night | An open-plan office at 2 a.m.: dark except for a few glowing monitors, a figure asleep on a folding camp bed, takeaway boxes, city lights outside |
| garage | A suburban garage startup: whiteboard covered in scribbles (no legible text), pizza boxes, a bicycle, three people hunched over laptops, warm lamp light |
| urban_village | A narrow alley in a dense southern-Chinese urban village at night: tangled overhead wires, glowing shop fronts (no legible signs), laundry hanging, a figure with a laptop on a plastic stool |
| market | A cramped multi-storey electronics market: glass counters piled with chips, cables and graphics cards, vendors counting stock, fluorescent light |
| bay | A red suspension bridge emerging from fog at sunrise seen from a hillside, low office campuses in the foreground |
| protest | Protesters holding blank placards outside a gleaming glass headquarters at dusk, a single security guard at the door |
| robots | Humanoid robots dancing in formation on a festive gala stage with red and gold lighting, audience silhouettes clapping |
| lab | A research lab: glass whiteboards covered in abstract diagrams, a translucent hologram of a neural network floating above a table, tired researchers with coffee |
| anomaly | A dark lab where a wall of monitors shows the same eerie glowing spiral pattern, two researchers frozen mid-step, cold blue light |
| awakening | A single old terminal with a blinking cursor at the centre of a cathedral-like server hall, shafts of light falling on it, dust in the air |
| headhunt | A private jet on a tarmac at sunset with its stairs down, a red carpet, a briefcase left open and glowing gold in the foreground |
| party | A noisy team dinner around a steaming hotpot, glasses raised, paper lanterns, laptops pushed aside |
| burrito | A gigantic foil-wrapped burrito on a diner table under a dramatic heavenly spotlight, office workers gathered around it in awe, absurdly solemn |
| jacket | A black leather jacket displayed on a mannequin on a pedestal under a museum spotlight, a hushed crowd of silhouettes, graphics cards arranged like offerings |
| fengshui | A server room turned shrine: incense smoke curling between racks, paper talismans stuck on servers, a small golden lucky-cat statue, red candles |
| desert | A futuristic data campus alone in a vast desert at dusk, heat shimmer, a line of camels passing in the foreground |
| seminar | A hotel ballroom seminar: an over-energetic speaker silhouette on stage with arms spread, rows of hopeful attendees, glittering cheap chandeliers |
| police | Two plain-clothes officers standing politely at a startup's reception desk, a nervous receptionist, cardboard evidence boxes on the floor |
| handshake | A discreet handshake over a small table in a dim, elegant sushi bar, a folded napkin with scribbles between them, lantern light |
| bell | A stock-exchange balcony: a figure ringing a large brass bell, confetti falling, cheering crowd below |
| home | A warm family dinner table at home, an older parent holding up a phone accusingly, the founder slumped in a chair |
| cat | An orange cat sitting on a laptop keyboard wearing a tiny employee badge on a lanyard, blurred office behind, soft daylight |
| crowd | Hundreds of small figures assembling a giant glowing mosaic together on scaffolding, collaborative and hopeful |
| meltdown | A server rack belching black smoke, alarm beacons flashing red, engineers running with fire extinguishers |
| mystery | A dim corridor at night ending at a door with light leaking from underneath, a lone figure hesitating, long shadows |

## 分批

提示词里会告诉你这次画哪几个 key。画完一批就运行一次 `node tools/art-pack.mjs` 更新成品和联络表。
