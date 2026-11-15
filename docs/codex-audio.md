# 任务：为《炼丹大亨》3A 版写音频引擎（纯 WebAudio 合成，不用任何音频文件）

《炼丹大亨》是一款 AI 创业讽刺模拟游戏（three.js + DOM 界面，最后打包成单个 HTML）。现在在做「3A 版」：画面是微缩景观 + 电影感。
请写一个**克制、有质感、耐听**的音频引擎：环境声 + 界面音效 + 生成式背景音乐。宁可安静，绝不刺耳。

只允许创建/修改：`src/audio/audio.js`、`tools/audio-check.mjs`。别动其它文件（有别人在同时改）。

## 接口（必须一字不差）

```js
import { createAudio } from './audio/audio.js';
const audio = createAudio();          // 永不抛错；浏览器没有 WebAudio 时返回同样接口的空实现
audio.unlock();                       // 在用户手势（点击/按键）里调用：创建或恢复 AudioContext。可以重复调用
audio.sfx(name, opts);                // 一次性音效。opts 可选：{ gain: 0..2, pitch: 半音数 }
audio.setScene(state);                // 环境声参数。界面每次刷新都会调（一秒可能几次），内部要平滑过渡，不能咔哒响
audio.setMusic(mood);                 // 'off' | 'title' | 'calm' | 'focus' | 'tense' | 'crisis' | 'triumph' | 'defeat'
audio.setVolume({ master, music, sfx, amb });   // 各 0..1，只传一部分就只改那一部分
audio.setMuted(flag);
audio.getState();                     // { unlocked, muted, volume: {master, music, sfx, amb}, mood, nodes: 当前活着的节点数 }
audio.dispose();
```

`unlock()` 之前调用任何方法都不能报错（只记下状态，解锁后生效）。默认音量：master 0.7、music 0.35、sfx 0.6、amb 0.45。

## 一、界面音效 `sfx(name)`

全部用振荡器 / 噪声 / 滤波器 / 包络现场合成。每个都要有自己的性格，但整体属于同一个「家族」（温润、偏木质和玻璃质感，少用锯齿波裸音）。
未知的 name 静默忽略。

| name | 场合 | 设计意图 |
|---|---|---|
| click | 普通按钮 | 极短的木质「嗒」，40ms 以内 |
| hover | 鼠标划过选项 | 比 click 更轻更高，几乎听不见 |
| tab | 切页签 | 轻微的纸页/卡片滑动感 |
| open | 事件窗弹出 | 低沉的「咚」加一点上扬的空气感，像厚重的书翻开 |
| close | 关窗 | open 的反向，更短 |
| choose | 选定事件选项 | 果断的两段音，落在稳定的音程上 |
| turn | 进入下个月 | 「嗖」的时间流逝感 + 一声钟摆/时钟的嗒，约 0.6s |
| coin | 收入、融资到账 | 清脆的硬币/收银机，两三个高频泛音，不要 8-bit 味 |
| spend | 花钱 | coin 的暗色版，下行 |
| good | 判定成功 | 上行的三音琶音，明亮但不幼稚 |
| bad | 判定失败 | 下行的两音，闷，带一点失谐 |
| stamp | 成功/失败印章盖下 | 厚实的「砰」 |
| card | 董事会卡翻开 | 卡片翻转的「唰」+ 一点闪光 |
| hire | 招人 | 友好的短上行 |
| fire | 裁员 | 短促下行 + 纸张揉皱感（噪声） |
| levelup | 办公室升级 | 1.2s 左右的小号角/铜管感上行，有成就感 |
| release | 模型出炉发布 | 蓄力上扬的泛音 + 结尾一声钟/磬，约 1.5s，是全游戏最「爽」的音 |
| confetti | 撒彩带 | 「啵」的一声加一串细碎的高频闪烁 |
| alarm | 丑闻/警报 | 两声克制的警报（不是刺耳的蜂鸣），约 1.2s |
| boom | 炸炉 | 低频爆炸 + 碎片噪声衰减 |
| cameo | 无厘头角色乱入 | 滑稽的滑音哨 + 弹簧「boing」 |
| toast | 提示条出现 | 很轻的一声提示 |
| error | 不能点 | 短促的闷音两连 |
| type | 写代码 | 一小串（5~8 下）机械键盘声，随机间隔 |
| rain_start | 开始下雨 | 一声远雷（可选，很轻） |

## 二、环境声 `setScene(state)`

```js
state = {
  mode: 'title' | 'play' | 'end',
  region: 'bay' | 'sz',      // 湾区：海鸥、偶尔的雾笛、远处电车叮当；深圳：电瓶车喇叭、蝉（夏天）、远处工地
  night: 0..1,               // 0 白天，1 深夜。白天鸟叫，夜里虫鸣，城市底噪变低变闷
  staff: 0..60,              // 员工数：办公室人声底噪（听不清的嘟囔，用滤波噪声+随机调制）和零星键盘声的密度
  heat: 0..1,                // 丹炉火候：炉火的呼呼声（带通噪声，缓慢起伏），越大越旺
  racks: 0..12,              // 机柜数：服务器风扇的嗡嗡声
  rain: 0..1,                // 雨
  alert: bool,               // 现金告急：很轻的低频脉动，制造不安
  month: 0..11,              // 月份（0=一月），用来决定蝉鸣之类的季节声
}
```
- 各层音量都很小，叠起来才是一个「活着的城市 + 办公室」。任何一层单独拎出来都不该抢戏。
- 参数变化用 `setTargetAtTime` 之类平滑过渡（0.5~2s）。
- 零星事件声（鸟叫、喇叭、键盘、雾笛）用随机间隔调度，间隔要有足够的随机性，避免听出循环。

## 三、生成式音乐 `setMusic(mood)`

不要旋律洗脑的 loop。要的是**氛围音乐**：缓慢的和弦铺底（pad）+ 稀疏的五声音阶点缀音（像电钢琴/马林巴/古筝的拨弦感）+ 很轻的低音。
- 每种 mood 有自己的调式、速度、密度和音色亮度：
  - `title`：开阔、有期待感，稍亮
  - `calm`：日常经营，lo-fi 感，60~70 BPM，最稀疏
  - `focus`：冲刺/炼丹，稍有律动（可以加很轻的脉冲）
  - `tense`：现金紧张，小调，低音更重，点缀音更少更不稳定
  - `crisis`：丑闻/破产边缘，不协和，心跳般的低频
  - `triumph`：上市/好结局，大调，明亮上行
  - `defeat`：坏结局，慢，下行，空
  - `off`：淡出
- 切换 mood 时交叉淡化 2~3 秒，不能硬切。
- 和弦进行和点缀音用带种子的随机数现场生成，保证长时间不重复。
- 加一个简单的混响（反馈延迟网络，或者用代码生成脉冲响应喂给 ConvolverNode），让声音有空间感。

## 工程要求
- 主输出链：各总线（music / sfx / amb）→ master gain → DynamicsCompressor（当限幅器）→ destination。
- 用 `setInterval`（约 100ms）做前瞻调度，时间一律用 `AudioContext.currentTime`。`document.hidden` 时把 master 淡到 0 并暂停调度，回来再淡入。
- 不能泄漏节点：一次性的振荡器/缓冲源在 `onended` 里 disconnect。同时存活的节点平时不超过 60 个。
- 不用 AudioWorklet、不用外部文件、不用任何第三方库。噪声用预生成的 AudioBuffer（白噪/粉噪各一份，2 秒，循环）。
- 所有对外方法都包在 try/catch 里，出错只 `console.warn` 一次，绝不能让游戏崩。
- 代码里的注释用中文，写清楚每一层声音是怎么搭出来的。

## 自测（必须做）
写 `tools/audio-check.mjs`：在 Node 里用一个假的 AudioContext（最小实现：能创建节点、connect/disconnect、AudioParam 的各种调度方法、currentTime 可以手动推进）跑一遍：
1. `unlock()` 前调用所有方法不报错；
2. 逐个触发上表每一个 sfx；
3. 模拟 120 秒：每 100ms 推进一次时间并触发调度，期间切换各种 `setScene` 参数和所有 mood；
4. 统计创建/释放的节点数，确认结束时存活节点数没有持续增长；
5. `dispose()` 后不再有调度。
跑通后输出 `AUDIO OK` 和各项统计。运行方式：`node tools/audio-check.mjs`。

最后用几句话总结你做了什么、每层声音的设计，以及有哪些地方你拿不准需要真人试听。
