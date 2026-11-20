// 一次性迁移：
//   音频.xlsx：默认音量、配乐的七种情绪（游戏读）+ 音效清单（给后面「录成文件」用）
//   美术.xlsx：道具清单（尺寸、三角面、预算、材质数、有没有动画，从代码里烘一遍算出来）+ 插画清单（用在哪）
//   node seed-art-audio.mjs <项目根目录>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const root = process.argv[2];
const { pretty } = await import(pathToFileURL(path.join(root, 'tools/tables/lib/json.mjs')));
const src = readFileSync(path.join(root, 'src/audio/audio.js'), 'utf8').replace(/\r\n/g, '\n');
const grab = name => { const i = src.indexOf(`const ${name} = `); const j = src.indexOf(name === 'MOODS' ? '\n};\n' : ';\n', i); return new Function('return ' + src.slice(i + `const ${name} = `.length, j + (name === 'MOODS' ? 2 : 0)))(); };
const VOLUMES = grab('VOLUMES'), MOODS = grab('MOODS');
const NAMES = /const NAMES = new Set\('([^']+)'\.split/.exec(src)[1].split(' ');
const MOOD_DOC = { title: '标题画面和建角', calm: '平时', focus: '研发冲刺或者丹炉在炼的时候（每两个月换一次）', tense: '紧张：现金不多、监管压力高，或者危机等级 1', crisis: '危机：危机等级 2（具体怎么变化见 audio.js 的 crisisStep）', triumph: '好结局', defeat: '坏结局' };
const SFX = {
  click: ['点按钮', '界面上大部分按钮'], hover: ['悬停', '鼠标移到选项、行动、页签、卡牌上'], tab: ['切页签', '左右两边的页签'], open: ['弹出事件窗', ''], close: ['关窗', ''], choose: ['选一个选项', '事件窗'],
  turn: ['翻到下个月', '「下个月」按钮'], coin: ['进账', '拿到钱的特效'], spend: ['花钱', ''], good: ['好结果', '检定成功、好结局'], bad: ['坏结果', '检定失败、坏结局'], stamp: ['盖章', '事件结果页的成功 / 失败章'],
  card: ['抽卡', '董事会卡三选一'], hire: ['招人', ''], fire: ['裁人', '发毕业证'], levelup: ['升级', '升级特效'], release: ['发布模型', '出炉'], confetti: ['撒花', '好结局'],
  alarm: ['警报', '黑料引爆、进入危急状态'], boom: ['炸炉', ''], cameo: ['彩蛋人物出场', ''], toast: ['小提示', '行动做完冒出来的提示'], notify: ['新提示', '顶部冒出新的行动提示'],
  lift: ['电梯运行', '多层楼换楼层'], ding: ['电梯到站', ''], error: ['点不了', '比如招人时钱不够'], type: ['敲键盘', '「亲自写代码」'], rain_start: ['开始下雨', '天气'],
  burn: ['红色换装', '深圳左翼结局：界面烧开换成苏联风'], freeze: ['冷色换装', '资本结局：界面冻住换成冷色'], bloom: ['玫瑰换装', '湾区左翼结局：界面长出玫瑰'],
};
if (NAMES.join() !== Object.keys(SFX).join()) throw new Error('音效清单和 audio.js 的 NAMES 对不上：' + NAMES.join(' '));
const audio = {
  VOLUMES, VOLUME_DOC: { master: '总音量', music: '音乐', sfx: '音效', amb: '环境声' },
  MOODS, MOOD_DOC,
  SFX: NAMES.map(id => ({ id, name: SFX[id][0], use: SFX[id][1] || undefined, status: '现场合成' })),
};
writeFileSync(path.join(root, 'src/data/tables/audio.json'), pretty(audio) + '\n');
console.log('audio.json：音量', Object.keys(VOLUMES).length, '、配乐', Object.keys(MOODS).length, '、音效', NAMES.length);

