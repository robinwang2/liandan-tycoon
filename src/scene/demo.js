import { createOffice } from './office.js';
import { BRAND_COLORS, LOGOS, findLogo, logoDataURL } from '../ui/logos.js';

const container = document.querySelector('#scene');
const controls = document.querySelector('#controls');
export const office = createOffice(container);
const roles = ['res', 'eng', 'ops', 'biz', 'legal'];
let nextId = 11;
const params = new URLSearchParams(location.search);
let selectedLogo = 'whale';
let selectedBrand = BRAND_COLORS[0];

export const state = {
  mode: 'play',
  region: 'sz',
  level: 3,
  sign: '混沌智能',
  logo: logoDataURL(selectedLogo, selectedBrand),
  brand: selectedBrand,
  founder: { outfit: 'turtleneck' },
  staff: Array.from({ length: 10 }, (_, i) => ({
    id: `e${i + 1}`,
    role: roles[i % roles.length],
    mood: 28 + (i * 13) % 70
  })),
  racks: 4,
  furnace: { heat: .68 },
  night: false,
  alert: false
};

// 可复现的验收入口，例如 ?region=bay&level=1&staff=6&night=1。
if (params.has('region')) state.region = params.get('region') === 'bay' ? 'bay' : 'sz';
if (params.has('level')) state.level = Math.max(1, Math.min(5, Number(params.get('level')) || 3));
if (params.has('night')) state.night = params.get('night') === '1';
if (params.has('staff')) state.staff = Array.from({length:Math.max(0,Math.min(36,Number(params.get('staff'))||0))},(_,i)=>({id:'e'+(i+1),role:roles[i%5],mood:35+i*7%65}));
if (params.has('racks')) state.racks = Math.max(0, Math.min(12, Number(params.get('racks')) || 0));
if (params.get('furnace') === 'off') state.furnace = null;
if (findLogo(params.get('logo'))) selectedLogo = params.get('logo');
if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(params.get('brand'))) selectedBrand = params.get('brand');
if (['turtleneck', 'hoodie', 'plaid', 'suit'].includes(params.get('outfit'))) state.founder.outfit = params.get('outfit');
state.logo = params.get('logo') === 'none' ? '' : logoDataURL(selectedLogo, selectedBrand);
state.brand = params.get('brand') === 'none' ? '' : selectedBrand;
nextId = state.staff.length + 1;

const groups = [
  ['地区', [
    ['深圳', () => { state.region = 'sz'; }],
    ['湾区', () => { state.region = 'bay'; }]
  ]],
  ['办公室等级', [1, 2, 3, 4, 5].map(level => [`L${level}`, () => { state.level = level; }])],
  ['品牌标志', [
    ...[...LOGOS.sz, ...LOGOS.bay].map(logo => [logo.name, () => { selectedLogo = logo.id; state.logo = logoDataURL(selectedLogo, selectedBrand); }]),
    ['无标志', () => { state.logo = ''; }],
  ]],
  ['品牌色', [
    ...BRAND_COLORS.map((color, i) => [['珊瑚', '蓝', '青绿', '紫', '玫红', '金', '岩灰', '苔绿'][i], () => {
      selectedBrand = color; state.brand = color;
      if (state.logo) state.logo = logoDataURL(selectedLogo, color);
    }]),
    ['默认装潢', () => { state.brand = ''; }],
    ['原始外观', () => { state.logo = ''; state.brand = ''; state.founder = { outfit: 'turtleneck' }; }],
  ]],
  ['创始人穿搭', [
    ['黑高领', 'turtleneck'], ['灰帽衫', 'hoodie'], ['格子衫', 'plaid'], ['西装', 'suit'],
  ].map(([name, outfit]) => [name, () => { state.founder = { outfit }; }])],
  ['团队', [
    ['6 人验收', () => { state.staff = Array.from({length:6},(_,i)=>({id:'e'+(i+1),role:roles[i%5],mood:65})); nextId=Math.max(nextId,7); }],
    ['＋ 招人', () => {
      if (state.staff.length >= 36) return;
      const id = `e${nextId++}`;
      state.staff.push({ id, role: roles[Math.floor(Math.random() * roles.length)], mood: 25 + Math.floor(Math.random() * 75) });
    }],
    ['－ 裁员', () => { state.staff.pop(); }]
  ]],
  ['算力', [
    ['机柜 ＋', () => { state.racks = Math.min(12, state.racks + 1); }],
    ['机柜 －', () => { state.racks = Math.max(0, state.racks - 1); }],
    ['炼丹开关', () => { state.furnace = state.furnace ? null : { heat: Number(document.querySelector('#heat').value) }; }]
  ]],
  ['氛围', [
    ['996 夜景', () => { state.night = !state.night; }],
    ['现金告急', () => { state.alert = !state.alert; }],
    ['标题镜头', () => { state.mode = state.mode === 'title' ? 'play' : 'title'; }]
  ]]
];

function addButton(label, action, row) {
  const button = document.createElement('button');
  button.textContent = label;
  button.addEventListener('click', () => { action(); sync(); });
  row.append(button);
}

for (const [title, items] of groups) {
  const block = document.createElement('section');
  const label = document.createElement('label'); label.textContent = title;
  const row = document.createElement('div'); row.className = 'row';
  items.forEach(([text, action]) => addButton(text, action, row));
  block.append(label, row); controls.append(block);
}

const heatBlock = document.createElement('section');
heatBlock.innerHTML = '<label for="heat">炉火 <output id="heat-value">68%</output></label><input id="heat" type="range" min="0" max="1" value="0.68" step="0.01">';
controls.append(heatBlock);
const heat = heatBlock.querySelector('input');
heat.addEventListener('input', () => {
  heatBlock.querySelector('output').textContent = `${Math.round(heat.value * 100)}%`;
  if (state.furnace) state.furnace = { heat: Number(heat.value) };
  sync();
});

const fxBlock = document.createElement('section');
const fxLabel = document.createElement('label'); fxLabel.textContent = '一次性特效';
const fxRow = document.createElement('div'); fxRow.className = 'row effects';
[
  ['🎊 彩带', 'confetti'], ['🪙 金币雨', 'money'], ['🚨 丑闻', 'alarm'],
  ['💥 炸炉', 'boom'], ['⭐ 升级', 'levelup'], ['💬 发言', 'say'], ['🕶 乱入', 'cameo']
].forEach(([label, name]) => addButton(label, () => {
  const data = name === 'cameo' ? { text: '你再也吃不到 Chepole 了！！！' } : name === 'say' ? { text: '这个需求很简单，今晚就上线！', who: 'founder' } : undefined;
  office.play(name, data);
}, fxRow));
fxBlock.append(fxLabel, fxRow); controls.append(fxBlock);

const status = document.createElement('div'); status.className = 'status'; controls.append(status);

export function sync() {
  office.sync(state);
  document.body.classList.toggle('night',state.night);
  status.textContent = `${state.region === 'sz' ? '深圳' : '湾区'} · L${state.level} · ${state.staff.length} 人 · ${state.racks} 机柜${state.furnace ? ' · 炼丹中' : ''}`;
  const selectedLabels = new Set([
    state.logo ? findLogo(selectedLogo)?.name : '无标志',
    state.brand ? ['珊瑚', '蓝', '青绿', '紫', '玫红', '金', '岩灰', '苔绿'][BRAND_COLORS.indexOf(state.brand)] : '默认装潢',
    { turtleneck: '黑高领', hoodie: '灰帽衫', plaid: '格子衫', suit: '西装' }[state.founder?.outfit || 'turtleneck'],
  ]);
  controls.querySelectorAll('button').forEach(button => button.classList.remove('active'));
  [...controls.querySelectorAll('button')].forEach(button => {
    button.setAttribute('aria-pressed','false');
    if (selectedLabels.has(button.textContent) || (button.textContent === '深圳' && state.region === 'sz') || (button.textContent === '湾区' && state.region === 'bay') ||
        (button.textContent === `L${state.level}`) || (button.textContent === '996 夜景' && state.night) ||
        (button.textContent === '现金告急' && state.alert) || (button.textContent === '标题镜头' && state.mode === 'title')) { button.classList.add('active'); button.setAttribute('aria-pressed','true'); }
  });
}

function updateInsets() {
  const rect = controls.getBoundingClientRect();
  office.setInsets(params.get('insets') === '0' ? {} : { left: window.innerWidth > 760 ? Math.ceil(rect.right + 12) : 0, right: 12, top: window.innerWidth <= 760 ? Math.ceil(rect.bottom + 8) : 28, bottom: 40 });
}

const panelObserver = new ResizeObserver(updateInsets); panelObserver.observe(controls);
window.addEventListener('resize', updateInsets);
window.addEventListener('beforeunload', () => { panelObserver.disconnect(); window.removeEventListener('resize',updateInsets); office.dispose(); }, { once: true });
sync(); updateInsets();

if (params.has('effect')) setTimeout(() => office.play(params.get('effect'), {text:params.get('effect')==='cameo'?'你再也吃不到 Chepole 了！！！':'这个需求很简单，今晚就上线！',who:'founder'}), 1600);

// 独立实验室的调试入口，不影响 office.js 的游戏 API。
window.sceneDemo = { office, state, sync };
