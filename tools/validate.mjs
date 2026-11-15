import { access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const problems = [];
// 核心事件（EVENTS_CORE）由引擎按规则触发，篇幅和选项数不受「事件包」的写作规范限制
const problem = (where, message) => { if (where.startsWith('EVENTS_CORE') && /超过|必须有 2~4 个/.test(message)) return; problems.push(`${where}: ${message}`); };

const WHEN_KEYS = new Set([
  'tMin', 'tMax', 'region', 'route', 'track', 'ownModel', 'stageMin', 'stageMax',
  'usersMin', 'usersMax', 'hypeMin', 'hypeMax', 'repMin', 'repMax', 'moraleMin',
  'moraleMax', 'regMin', 'regMax', 'bubbleMin', 'bubbleMax', 'dirtMin', 'hasDirt',
  'staffMin', 'hasRole', 'rankMax', 'rankMin', 'runwayMax', 'runwayMin',
  'officeMin', 'officeMax', 'equityMax', 'gpuMin', 'flag', 'notFlag', 'policy',
  'equityMin', 'redMin', 'redMax', 'capMin', 'capMax', 'heatMin', 'heatMax',
]);
const REQ_KEYS = new Set([...WHEN_KEYS, 'cash', 'attr']);
const FX_KEYS = new Set([
  'cash', 'cashAbs', 'hype', 'rep', 'morale', 'reg', 'bubble', 'usersPct', 'tech',
  'bench', 'quality', 'quota', 'equity', 'ap', 'attr', 'dirt', 'cleanDirt',
  'expose', 'flag', 'unflag', 'staff', 'rival', 'temp', 'follow', 'perk', 'project',
  'chain', 'end', 'heat', 'ideo',
]);
const ATTRS = new Set(['tech', 'cha', 'mgmt', 'biz', 'net', 'luck']);
const DIRTS = new Set([
  'bench_fake', 'bench_overfit', 'scrape', 'distill', 'fake_users', 'astroturf',
  'bribe', 'smuggle', 'cook_books', 'human_ai', 'overwork', 'fake_demo', 'hush',
  'privacy', 'tax', 'nda', 'coverup', 'unfair_fire', 'fake_plan', 'bci_lab',
]);
const RIVALS = new Set([
  'random', 'top', 'upstream', 'openbi', 'misan', 'goggle', 'xai', 'deepsleep',
  'bytejump',
]);
const TEMP_KEYS = new Set([
  'researchMult', 'devMult', 'growthMult', 'revMult', 'costMult', 'salaryMult',
  'gpuPriceMult', 'raiseMult', 'hypeGainMult', 'exposeMult', 'apiCostMult',
  'churnAdd', 'moraleAdd', 'hireSkill',
]);
const STAFF = new Set([
  'loseBest', 'loseRandom', 'loseCtx', 'gainRes', 'gainEng', 'gainOps', 'gainBiz',
  'gainLegal', 'gainStar',
]);
const CATS = new Set(['industry', 'reg', 'geo', 'team', 'money', 'pr', 'tech', 'rival', 'wacky', 'sys', 'dirt']);
const POLICY = {
  work: new Set(['965', '996']),
  price: new Set(['free', 'std', 'premium']),
  safety: new Set(['loose', 'std', 'strict']),
};
const RIVAL_FX_KEYS = new Set(['cap', 'hype', 'rel']);
const DIRT_OBJECT_KEYS = new Set(['type', 'sev', 'name']);
const TEMP_OBJECT_KEYS = new Set(['key', 'mult', 'add', 'months']);
const FOLLOW_KEYS = new Set(['id', 'in']);
const PROJECT_KEYS = new Set(['id', 'chain', 'name', 'desc', 'kind', 'need', 'months', 'ok', 'fail']);
const PROJECT_KINDS = new Set(['res', 'eng', 'ops', 'biz', 'legal', 'gpu', 'ap']);
const CHAIN_FX_KEYS = new Set(['id', 'note', 'done']);
const EVENT_KEYS = new Set([
  'id', 'title', 'icon', 'cat', 'when', 'weight', 'once', 'cd', 'rival', 'text',
  'options', 'chain', 'art', 'portrait', 'scene', 'enter', 'delay',
]);
const OPTION_KEYS = new Set(['label', 'hint', 'req', 'text', 'fx', 'check', 'odds', 'ok', 'fail', 'fn']);
const RESULT_KEYS = new Set(['text', 'fx']);
const ART_KEYS = new Set([
  'datacenter', 'furnace', 'launch', 'leaderboard', 'boardroom', 'pitch', 'bubble',
  'crash', 'congress', 'ministry', 'courtroom', 'press', 'vault', 'port', 'chess',
  'office_night', 'garage', 'urban_village', 'market', 'bay', 'protest', 'robots',
  'lab', 'anomaly', 'awakening', 'headhunt', 'party', 'burrito', 'jacket', 'fengshui',
  'desert', 'seminar', 'police', 'handshake', 'bell', 'home', 'cat', 'crowd',
  'meltdown', 'mystery', 'redhall', 'commune', 'brainlab', 'stream', 'unionhall', 'coophousing',
]);

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (object, key) => Object.hasOwn(object, key);
const references = [];
const projects = [];
const chainUpdates = [];

function checkKeys(value, allowed, where) {
  if (!isObject(value)) {
    problem(where, '应为对象');
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) problem(where, `非法键 ${key}`);
  }
  return true;
}

function checkAttrs(value, where) {
  if (!isObject(value)) {
    problem(where, 'attr 应为对象');
    return;
  }
  for (const [key, amount] of Object.entries(value)) {
    if (!ATTRS.has(key)) problem(where, `非法属性 ${key}`);
    if (typeof amount !== 'number') problem(where, `${key} 应为数字`);
  }
}

function checkPolicy(value, where) {
  if (!isObject(value)) {
    problem(where, 'policy 应为对象');
    return;
  }
  for (const [key, setting] of Object.entries(value)) {
    if (!own(POLICY, key)) problem(where, `非法 policy 键 ${key}`);
    else if (!POLICY[key].has(setting)) problem(where, `非法 policy 值 ${key}=${setting}`);
  }
}

function checkConditions(value, allowed, where) {
  if (typeof value === 'function') return;
  if (!checkKeys(value, allowed, where)) return;
  if (own(value, 'attr')) checkAttrs(value.attr, `${where}.attr`);
  if (own(value, 'policy')) checkPolicy(value.policy, `${where}.policy`);
  if (own(value, 'region') && !['bay', 'sz'].includes(value.region)) problem(where, 'region 非法');
  if (own(value, 'route') && !['model', 'app'].includes(value.route)) problem(where, 'route 非法');
  if (own(value, 'track')) {
    const tracks = Array.isArray(value.track) ? value.track : [value.track];
    for (const track of tracks) {
      if (!['chat', 'code', 'companion', 'video'].includes(track)) problem(where, `track 非法: ${track}`);
    }
  }
  if (own(value, 'hasRole') && !['res', 'eng', 'ops', 'biz', 'legal'].includes(value.hasRole)) {
    problem(where, `hasRole 非法: ${value.hasRole}`);
  }
  if (own(value, 'hasDirt') && !DIRTS.has(value.hasDirt)) problem(where, `hasDirt 非法: ${value.hasDirt}`);
}

function checkDirt(value, where) {
  if (typeof value === 'string') {
    if (!DIRTS.has(value)) problem(where, `非法黑料 ${value}`);
    return;
  }
  if (!checkKeys(value, DIRT_OBJECT_KEYS, where)) return;
  if (!DIRTS.has(value.type)) problem(where, `非法黑料 ${value.type}`);
  if (typeof value.sev !== 'number') problem(where, 'sev 应为数字');
  if (own(value, 'name') && typeof value.name !== 'string') problem(where, 'name 应为字符串');
}

function checkTemp(value, where) {
  const list = Array.isArray(value) ? value : [value];
  for (const [index, temp] of list.entries()) {
    const at = `${where}[${index}]`;
    if (!checkKeys(temp, TEMP_OBJECT_KEYS, at)) continue;
    if (!TEMP_KEYS.has(temp.key)) problem(at, `非法 temp.key ${temp.key}`);
    if (typeof temp.months !== 'number') problem(at, 'months 应为数字');
    const additive = temp.key === 'churnAdd' || temp.key === 'moraleAdd' || temp.key === 'hireSkill';
    if (additive) {
      if (typeof temp.add !== 'number' || own(temp, 'mult')) problem(at, '加法 temp 必须仅含数字 add');
    } else if (typeof temp.mult !== 'number' || own(temp, 'add')) {
      problem(at, '乘法 temp 必须仅含数字 mult');
    }
  }
}

function checkProject(value, where) {
  if (!checkKeys(value, PROJECT_KEYS, where)) return;
  if (typeof value.id !== 'string' || !value.id.trim()) problem(where, 'project.id 应为非空字符串');
  if (typeof value.chain !== 'string' || !value.chain.trim()) problem(where, 'project.chain 应为非空字符串');
  if (typeof value.name !== 'string' || !value.name.trim()) problem(where, 'project.name 应为非空字符串');
  else if ([...value.name].length > 8) problem(where, 'project.name 超过 8 字');
  if (typeof value.desc !== 'string' || !value.desc.trim()) problem(where, 'project.desc 应为非空字符串');
  else if ([...value.desc].length > 30) problem(where, 'project.desc 超过 30 字');
  if (!PROJECT_KINDS.has(value.kind)) problem(where, `project.kind 非法: ${value.kind}`);
  if (!Number.isInteger(value.need) || value.need < 1 || value.need > 8) problem(where, 'project.need 应为 1~8 的整数');
  if (typeof value.months !== 'number' || value.months <= value.need) problem(where, 'project.months 必须大于 need');
  if (typeof value.ok !== 'string' || !value.ok.trim()) problem(where, 'project.ok 应为非空事件 id');
  else references.push({ id: value.ok, where: `${where}.ok`, kind: 'project' });
  if (own(value, 'fail')) {
    if (typeof value.fail !== 'string' || !value.fail.trim()) problem(where, 'project.fail 应为非空事件 id');
    else references.push({ id: value.fail, where: `${where}.fail`, kind: 'project' });
  }
  projects.push({ value, where });
}

function checkChainUpdate(value, where) {
  if (!checkKeys(value, CHAIN_FX_KEYS, where)) return;
  if (typeof value.id !== 'string' || !value.id.trim()) problem(where, 'chain.id 应为非空字符串');
  if (own(value, 'note')) {
    if (typeof value.note !== 'string' || !value.note.trim()) problem(where, 'chain.note 应为非空字符串');
    else if ([...value.note].length > 40) problem(where, 'chain.note 超过 40 字');
  }
  if (own(value, 'done') && typeof value.done !== 'boolean') problem(where, 'chain.done 应为布尔值');
  chainUpdates.push({ value, where });
}

function checkFx(value, where) {
  if (typeof value === 'function') return;
  if (!checkKeys(value, FX_KEYS, where)) return;
  if (own(value, 'attr')) checkAttrs(value.attr, `${where}.attr`);
  if (own(value, 'dirt')) checkDirt(value.dirt, `${where}.dirt`);
  if (own(value, 'cleanDirt') && value.cleanDirt !== 'random' && value.cleanDirt !== 'all' && !DIRTS.has(value.cleanDirt)) {
    problem(where, `非法 cleanDirt ${value.cleanDirt}`);
  }
  if (own(value, 'expose') && value.expose !== 'random') problem(where, 'expose 只能是 random');
  if (own(value, 'staff') && !STAFF.has(value.staff)) problem(where, `非法 staff ${value.staff}`);
  if (own(value, 'rival')) {
    if (checkKeys(value.rival, RIVAL_FX_KEYS, `${where}.rival`)) {
      for (const amount of Object.values(value.rival)) {
        if (typeof amount !== 'number') problem(where, 'rival 修正值应为数字');
      }
    }
  }
  if (own(value, 'temp')) checkTemp(value.temp, `${where}.temp`);
  if (own(value, 'follow')) {
    if (checkKeys(value.follow, FOLLOW_KEYS, `${where}.follow`)) {
      if (typeof value.follow.id !== 'string') problem(where, 'follow.id 应为字符串');
      else references.push({ id: value.follow.id, where: `${where}.follow.id`, kind: 'follow' });
      if (typeof value.follow.in !== 'number') problem(where, 'follow.in 应为数字');
    }
  }
  if (own(value, 'perk') && value.perk !== 'draft') problem(where, `非法 perk ${value.perk}`);
  if (own(value, 'project')) checkProject(value.project, `${where}.project`);
  if (own(value, 'chain')) checkChainUpdate(value.chain, `${where}.chain`);
  // 路线之争：反共压力和两条进度条
  if (own(value, 'heat') && (typeof value.heat !== 'number' || Math.abs(value.heat) > 15)) problem(where, 'heat 应为 -15~15 的数字');
  if (own(value, 'ideo') && checkKeys(value.ideo, new Set(['red', 'cap']), `${where}.ideo`)) for (const [k, v] of Object.entries(value.ideo)) if (typeof v !== 'number' || Math.abs(v) > 15) problem(where, `ideo.${k} 应为 -15~15 的数字`);
}

function checkResult(result, where) {
  if (!isObject(result)) {
    problem(where, '结果应为对象');
    return;
  }
  checkKeys(result, RESULT_KEYS, where);
  if (typeof result.text !== 'function' && (typeof result.text !== 'string' || !result.text.trim())) {
    problem(where, '缺少 text');
  }
  if (own(result, 'fx')) checkFx(result.fx, `${where}.fx`);
  else problem(where, '缺少 fx');
}

function checkOption(option, where) {
  if (!isObject(option)) {
    problem(where, '选项应为对象');
    return;
  }
  checkKeys(option, OPTION_KEYS, where);
  if (typeof option.label !== 'string' || !option.label.trim()) problem(where, '缺少 label');
  else if ([...option.label].length > 12) problem(where, 'label 超过 12 字');
  if (own(option, 'hint') && [...option.hint].length > 18) problem(where, 'hint 超过 18 字');
  if (own(option, 'req')) checkConditions(option.req, REQ_KEYS, `${where}.req`);

  const isA = own(option, 'text') || own(option, 'fx');
  const isB = own(option, 'check');
  const isC = own(option, 'odds');
  if ([isA, isB, isC].filter(Boolean).length !== 1) {
    problem(where, '必须恰好是 A/B/C 三种形式之一');
    return;
  }
  if (isA) {
    if (typeof option.text !== 'function' && (typeof option.text !== 'string' || !option.text.trim())) problem(where, 'A 缺少 text');
    if (!own(option, 'fx')) problem(where, 'A 缺少 fx');
    else checkFx(option.fx, `${where}.fx`);
    if (own(option, 'ok') || own(option, 'fail')) problem(where, 'A 不应含 ok/fail');
    return;
  }
  if (!own(option, 'ok') || !own(option, 'fail')) problem(where, 'B/C 必须同时有 ok 和 fail');
  else {
    checkResult(option.ok, `${where}.ok`);
    checkResult(option.fail, `${where}.fail`);
  }
  if (isB) {
    if (!isObject(option.check)) problem(where, 'check 应为对象');
    else {
      const keys = Object.keys(option.check);
      for (const key of keys) if (!['attr', 'dc'].includes(key)) problem(where, `check 非法键 ${key}`);
      if (!ATTRS.has(option.check.attr)) problem(where, `check 属性非法: ${option.check.attr}`);
      if (typeof option.check.dc !== 'number') problem(where, 'dc 应为数字');
    }
  }
  if (isC && (typeof option.odds !== 'number' || option.odds < 0 || option.odds > 1)) problem(where, 'odds 应为 0~1');
}

const packModule = await import(pathToFileURL(path.join(root, 'src/data/events_pack.js')));
const newsModule = await import(pathToFileURL(path.join(root, 'src/data/news.js')));
const chainsModule = await import(pathToFileURL(path.join(root, 'src/data/events_chains.js')));
const artModule = await import(pathToFileURL(path.join(root, 'src/data/event_art.js')));
const sources = [{ name: 'EVENTS_PACK', events: packModule.EVENTS_PACK }];
const corePath = path.join(root, 'src/data/events_core.js');
try {
  await access(corePath);
  const coreModule = await import(pathToFileURL(corePath));
  sources.push({ name: 'EVENTS_CORE', events: coreModule.EVENTS_CORE });
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
sources.push({ name: 'EVENTS_CHAINS', events: chainsModule.EVENTS_CHAINS });
// 路线之争：结局后的随机事件（和事件包一样严格）+ 两条一次性事件链
const ideoModule = await import(pathToFileURL(path.join(root, 'src/data/ideology.js')));
sources.push({ name: 'IDEO_EVENTS', events: ideoModule.IDEO_EVENTS });
sources.push({ name: 'UTOPIA_EVENTS', events: ideoModule.UTOPIA_EVENTS });
sources.push({ name: 'BCI_EVENTS', events: ideoModule.BCI_EVENTS });
const usModule = await import(pathToFileURL(path.join(root, 'src/data/ideology_us.js')));
for (const k of ['IDEO_EVENTS', 'UTOPIA_EVENTS', 'BCI_EVENTS', 'SCARE_EVENTS']) sources.push({ name: 'US_' + k, events: usModule[k] });

const allEvents = [];
for (const source of sources) {
  if (!Array.isArray(source.events)) {
    problem(source.name, '导出值应为数组');
    continue;
  }
  for (const [index, event] of source.events.entries()) allEvents.push({ event, where: `${source.name}[${index}]` });
}

const ids = new Map();
for (const { event, where } of allEvents) {
  if (!isObject(event)) {
    problem(where, '事件应为对象');
    continue;
  }
  checkKeys(event, EVENT_KEYS, where);
  if (typeof event.id !== 'string' || !event.id.trim()) problem(where, '缺少 id');
  else if (ids.has(event.id)) problem(where, `id 与 ${ids.get(event.id)} 重复: ${event.id}`);
  else ids.set(event.id, where);
  if (typeof event.title !== 'string' || !event.title.trim()) problem(where, '缺少 title');
  else if ([...event.title].length > 14) problem(where, 'title 超过 14 字');
  if (typeof event.icon !== 'string' || !event.icon.trim()) problem(where, '缺少 icon');
  if (!CATS.has(event.cat)) problem(where, `cat 非法或缺失: ${event.cat}`);
  if (typeof event.text !== 'function' && (typeof event.text !== 'string' || !event.text.trim())) problem(where, '缺少 text');
  if (own(event, 'when')) checkConditions(event.when, WHEN_KEYS, `${where}.when`);
  if (own(event, 'rival') && !RIVALS.has(event.rival)) problem(where, `非法 rival ${event.rival}`);
  if (own(event, 'art') && !ART_KEYS.has(event.art)) problem(where, `非法 art key: ${event.art}`);
  if (typeof event.text === 'string' && /\{(?:rival|boss)\}/.test(event.text) && !event.rival) {
    problem(where, '正文使用 {rival}/{boss} 但没有 rival 字段');
  }
  if (typeof event.options !== 'function') {
    if (!Array.isArray(event.options)) problem(where, '缺少 options');
    else {
      if (event.options.length < 2 || event.options.length > 4) problem(where, 'options 必须有 2~4 个');
      event.options.forEach((option, index) => checkOption(option, `${where}.options[${index}]`));
    }
  }
}

const chains = chainsModule.CHAINS;
const allChains = { ...(chains || {}), ...(ideoModule.IDEO_CHAINS || {}), ...(usModule.IDEO_CHAINS || {}) };
if (!isObject(chains)) problem('CHAINS', '导出值应为对象');
else {
  for (const [id, chain] of Object.entries(chains)) {
    if (!isObject(chain)) { problem(`CHAINS.${id}`, '应为对象'); continue; }
    checkKeys(chain, new Set(['title', 'icon', 'intro']), `CHAINS.${id}`);
    for (const key of ['title', 'icon', 'intro']) {
      if (typeof chain[key] !== 'string' || !chain[key].trim()) problem(`CHAINS.${id}`, `缺少 ${key}`);
    }
  }
}

for (const ref of references) {
  if (!ids.has(ref.id)) problem(ref.where, `${ref.kind} 指向不存在的事件: ${ref.id}`);
}

const projectIds = new Map();
for (const { value: project, where } of projects) {
  if (typeof project.id === 'string') {
    if (projectIds.has(project.id)) problem(where, `project.id 与 ${projectIds.get(project.id)} 重复: ${project.id}`);
    else projectIds.set(project.id, where);
  }
  if (!own(project, 'fail')) problem(where, '链项目必须提供超期 fail 事件');
  if (isObject(chains) && !own(allChains, project.chain)) problem(where, `project.chain 未登记: ${project.chain}`);
}
for (const { value: update, where } of chainUpdates) {
  if (isObject(chains) && !own(allChains, update.id)) problem(where, `chain.id 未登记: ${update.id}`);
}

const chainEvents = allEvents.filter(({ where }) => where.startsWith('EVENTS_CHAINS'));
if (isObject(chains)) {
  for (const { event, where } of chainEvents) {
    if (typeof event.chain !== 'string' || !own(chains, event.chain)) problem(where, `chain 未登记: ${event.chain}`);
  }
  for (const chainId of Object.keys(chains)) {
    const members = chainEvents.filter(({ event }) => event.chain === chainId);
    const starts = members.filter(({ event }) => (event.weight ?? 1) > 0);
    if (starts.length !== 1) problem(`CHAINS.${chainId}`, `必须恰好有一个 weight > 0 的开头事件，实际 ${starts.length} 个`);
    const referenced = new Set(references.map(ref => ref.id));
    for (const { event, where } of members) {
      if (event.weight === 0 && !referenced.has(event.id)) problem(where, 'weight: 0 的链事件没有被 project/follow 指到');
    }
    if (!chainUpdates.some(({ value }) => value.id === chainId && value.done === true)) {
      problem(`CHAINS.${chainId}`, '至少需要一个带 chain.done: true 的结局');
    }
  }
}

const eventArt = artModule.EVENT_ART;
if (!isObject(eventArt)) problem('EVENT_ART', '导出值应为对象');
else {
  for (const [id, art] of Object.entries(eventArt)) {
    if (!ids.has(id)) problem(`EVENT_ART.${id}`, '对应的事件 id 不存在');
    if (!ART_KEYS.has(art)) problem(`EVENT_ART.${id}`, `非法 art key: ${art}`);
  }
  for (const { event, where } of allEvents) {
    if (!ART_KEYS.has(event?.art) && !ART_KEYS.has(eventArt[event?.id])) problem(where, '缺少合法背景图 art');
  }
}

const news = newsModule.NEWS;
if (!Array.isArray(news)) problem('NEWS', '导出值应为数组');
else {
  if (news.length !== 110) problem('NEWS', `应有 110 条，实际 ${news.length} 条`);
  news.forEach((headline, index) => {
    if (typeof headline !== 'string' || !headline.trim()) problem(`NEWS[${index}]`, '应为非空字符串');
    else if ([...headline].length > 38) problem(`NEWS[${index}]`, `超过 38 字（${[...headline].length}）`);
  });
}

// ───────── 路线之争：深圳版 src/data/ideology.js、湾区版 src/data/ideology_us.js ─────────
const SIDES = new Set(['red', 'cap', 'mid']);
const CHAIN_OPT_KEYS = new Set([...OPTION_KEYS, 'side', 'bars']);
const POOL_KEYS = new Set([...CHAIN_OPT_KEYS, 'id', 'from', 'to', 'when']);
const END_OPT_KEYS = new Set([...OPTION_KEYS, 'act']);
const PURGE_ACTS = ['fire_all', 'reeducate', 'release', 'tolerate'];
const NO_CTX = /\{(?:staff|rival|boss)\}/;
const say = (v, where, max) => {
  if (typeof v !== 'string' || !v.trim() || v.includes('待写')) problem(where, '缺少文案');
  else if (max && [...v].length > max) problem(where, `超过 ${max} 字`);
};
function checkBars(bars, where) {
  if (!checkKeys(bars, new Set(['red', 'cap']), where)) return;
  for (const [key, amount] of Object.entries(bars)) {
    if (typeof amount !== 'number' || Math.abs(amount) > 15) problem(where, `${key} 应为 -15~15 的数字`);
  }
}
// 链上选项 = 普通选项 + side / bars（检定结果 ok / fail 里也可以带 bars）
function checkChainOption(option, where, keys) {
  if (!isObject(option)) { problem(where, '选项应为对象'); return; }
  checkKeys(option, keys, where);
  if (keys.has('side') && !SIDES.has(option.side)) problem(where, `side 非法: ${option.side}`);
  if (own(option, 'bars')) checkBars(option.bars, `${where}.bars`);
  const base = Object.fromEntries(Object.entries(option).filter(([key]) => OPTION_KEYS.has(key)));
  for (const k of ['ok', 'fail']) {
    if (!isObject(base[k]) || !own(base[k], 'bars')) continue;
    checkBars(base[k].bars, `${where}.${k}.bars`);
    const { bars: _bars, ...rest } = base[k];
    base[k] = rest;
  }
  checkOption(base, where);
  if (NO_CTX.test(JSON.stringify(option))) problem(where, '这条链里不能用 {staff}/{rival}/{boss}');
}
// 湾区版里不该出现的深圳版专有名词（读着会出戏）
const CN_ONLY = ['国资', '深创头', '吴建设', '马可', '钱满仓', '搪瓷缸', '大锅饭', '学习会', '红旗', '镰刀', '共产主义乌托邦', '围脖', '小蓝书', '抖因'];
function checkIdeo(mod, name, cfg) {
  const stages = mod.IDEO_STAGES;
  if (!Array.isArray(stages) || stages.length !== 15) problem(`${name}.IDEO_STAGES`, `应有 15 级，实际 ${stages?.length ?? 0} 级`);
  for (const [index, stage] of (Array.isArray(stages) ? stages : []).entries()) {
    const at = `${name}.IDEO_STAGES[${index}]`;
    if (!checkKeys(stage, new Set(['title', 'icon', 'art', 'text', 'opts', 'portrait']), at)) continue;
    say(stage.title, `${at}.title`, 14);
    say(stage.icon, `${at}.icon`);
    if (!ART_KEYS.has(stage.art)) problem(at, `非法 art key: ${stage.art}`);
    if (own(stage, 'portrait') && !PORTRAITS.has(stage.portrait)) problem(at, `非法 portrait: ${stage.portrait}`);
    if (typeof stage.text !== 'string' || [...stage.text].length < 60) problem(at, 'text 缺失或太短');
    if (NO_CTX.test(stage.text || '')) problem(at, '这条链里不能用 {staff}/{rival}/{boss}');
    if (!Array.isArray(stage.opts) || stage.opts.length < 2 || stage.opts.length > 4) { problem(at, 'opts 必须有 2~4 个'); continue; }
    stage.opts.forEach((option, j) => checkChainOption(option, `${at}.opts[${j}]`, CHAIN_OPT_KEYS));
    for (const side of ['red', 'cap']) if (!stage.opts.some(o => o?.side === side)) problem(at, `至少要有一张 ${side}`);
  }

  const pool = Array.isArray(mod.IDEO_POOL) ? mod.IDEO_POOL : [];
  const bySide = { red: 0, cap: 0, mid: 0 };
  let poolWhen = 0;
  for (const [index, card] of pool.entries()) {
    const at = `${name}.IDEO_POOL[${index}]`;
    checkChainOption(card, at, POOL_KEYS);
    if (!isObject(card)) continue;
    if (typeof card.id !== 'string' || !card.id.trim()) problem(at, '缺少 id');
    else if (poolIds.has(card.id)) problem(at, `id 重复: ${card.id}`);
    else poolIds.add(card.id);
    for (const k of ['from', 'to']) if (!Number.isInteger(card[k]) || card[k] < 1 || card[k] > 15) problem(at, `${k} 应为 1~15 的整数`);
    if (card.from > card.to) problem(at, 'from 大于 to');
    if (own(card, 'when')) { poolWhen++; checkConditions(card.when, WHEN_KEYS, `${at}.when`); }
    if (SIDES.has(card.side)) bySide[card.side]++;
  }
  if (bySide.red < 18 || bySide.cap < 18 || bySide.mid < 10) problem(`${name}.IDEO_POOL`, `数量不够：red ${bySide.red}/18、cap ${bySide.cap}/18、mid ${bySide.mid}/10`);
  if (pool.length && poolWhen < pool.length / 2) problem(`${name}.IDEO_POOL`, `带 when 的卡不到一半（${poolWhen}/${pool.length}）`);
  for (const side of SIDES) {
    const free = pool.filter(c => c?.side === side && !c.when && c.from <= 3 && c.to >= 15).length;
    if (free < 4) problem(`${name}.IDEO_POOL`, `${side} 的万能卡（无条件、3~15 级）只有 ${free} 张，至少要 4 张`);
  }

  const endings = isObject(mod.IDEO_ENDINGS) ? mod.IDEO_ENDINGS : {};
  for (const key of ['red', 'cap', 'purge', 'fail']) {
    const ending = endings[key], at = `${name}.IDEO_ENDINGS.${key}`;
    if (!checkKeys(ending, new Set(['title', 'icon', 'art', 'text', 'options', 'portrait']), at)) continue;
    say(ending.title, `${at}.title`, 14);
    say(ending.text, `${at}.text`);
    if (typeof ending.text === 'string' && [...ending.text].length < 60) problem(at, 'text 太短');
    if (!ART_KEYS.has(ending.art)) problem(at, `非法 art key: ${ending.art}`);
    if (!Array.isArray(ending.options) || !ending.options.length || ending.options.length > 4) { problem(at, 'options 应有 1~4 个'); continue; }
    ending.options.forEach((option, j) => {
      const where = `${at}.options[${j}]`;
      checkKeys(option, END_OPT_KEYS, where);
      const { act: _act, ...base } = option || {};
      checkOption(base, where);
      if (JSON.stringify(option).includes('待写')) problem(where, '文案未写完');
      if (NO_CTX.test(JSON.stringify(option))) problem(where, '这里不能用 {staff}/{rival}/{boss}');
    });
    if (key === 'purge' && ending.options.map(o => o?.act).sort().join() !== [...PURGE_ACTS].sort().join()) problem(at, `act 必须恰好是 ${PURGE_ACTS.join(' / ')}`);
  }

  const chainsHere = isObject(mod.IDEO_CHAINS) ? mod.IDEO_CHAINS : {};
  const refs = new Set(references.map(ref => ref.id));
  for (const [cid, start, okFlag, badFlag, list] of [
    [cfg.utopia, `${cfg.utopia}_1`, 'utopia_ok', 'utopia_fail', mod.UTOPIA_EVENTS],
    [cfg.bci, `${cfg.bci}_1`, 'bci_ok', 'bci_shut', mod.BCI_EVENTS],
  ]) {
    const at = `${name}.IDEO_CHAINS.${cid}`;
    if (!isObject(chainsHere[cid])) { problem(at, '未登记'); continue; }
    for (const key of ['title', 'icon', 'intro']) say(chainsHere[cid][key], `${at}.${key}`);
    if (!Array.isArray(list) || list.length < 4) { problem(at, `事件太少（${list?.length ?? 0} 个，至少 4 个）`); continue; }
    if (!list.some(e => e?.id === start)) problem(at, `缺少开头事件 ${start}`);
    for (const e of list) {
      if (e?.chain !== cid) problem(at, `${e?.id} 的 chain 应为 ${cid}`);
      if ((e?.weight ?? 1) !== 0) problem(at, `${e?.id} 应为 weight: 0（由引擎或 project/follow 触发）`);
      if (e?.id !== start && !refs.has(e?.id)) problem(at, `${e?.id} 没有被任何 project / follow 指到`);
    }
    const flat = JSON.stringify(list);
    for (const flag of [okFlag, badFlag]) if (!flat.includes(`"${flag}"`)) problem(at, `没有任何结局带 flag: '${flag}'`);
    if (!chainUpdates.some(({ value }) => value.id === cid && value.done === true)) problem(at, '至少需要一个带 chain.done: true 的结局');
  }
  const events = Array.isArray(mod.IDEO_EVENTS) ? mod.IDEO_EVENTS : [];
  const flagged = flag => events.filter(e => [].concat(e?.when?.flag || []).includes(flag)).length;
  events.forEach((e, i) => { if (![].concat(e?.when?.flag || []).some(f => cfg.flags.includes(f))) problem(`${name}.IDEO_EVENTS[${i}]`, `when.flag 必须含 ${cfg.flags.map(f => `'${f}'`).join(' / ')}`); });
  const [fRed, fCap, fCell] = cfg.flags;
  if (flagged(fRed) < 4 || flagged(fCap) < 4 || flagged(fCell) < 1) problem(`${name}.IDEO_EVENTS`, `数量不够：${fRed} ${flagged(fRed)}/4、${fCap} ${flagged(fCap)}/4、${fCell} ${flagged(fCell)}/1`);

  const plan = isObject(mod.PLAN_TEXT) ? mod.PLAN_TEXT : {};
  say(plan.title, `${name}.PLAN_TEXT.title`, 14); say(plan.text, `${name}.PLAN_TEXT.text`);
  say(plan.okTitle, `${name}.PLAN_TEXT.okTitle`, 14); say(plan.okText, `${name}.PLAN_TEXT.okText`);
  say(plan.failTitle, `${name}.PLAN_TEXT.failTitle`, 14); say(plan.failText, `${name}.PLAN_TEXT.failText`);
  for (const k of ['users', 'model', 'rev']) { say(plan.targets?.[k]?.label, `${name}.PLAN_TEXT.targets.${k}.label`, 12); say(plan.targets?.[k]?.hint, `${name}.PLAN_TEXT.targets.${k}.hint`, 18); }
  for (const k of ['honest', 'fake']) { say(plan.failOpts?.[k]?.label, `${name}.PLAN_TEXT.failOpts.${k}.label`, 12); say(plan.failOpts?.[k]?.hint, `${name}.PLAN_TEXT.failOpts.${k}.hint`, 18); say(plan.failOpts?.[k]?.text, `${name}.PLAN_TEXT.failOpts.${k}.text`); }
  const actText = isObject(mod.ACT_TEXT) ? mod.ACT_TEXT : {};
  for (const k of ['mobilize', 'utopia', 'selfcrit', 'subbotnik', 'plan', 'yank', 'bci', 'buyback', 'costcut', 'spinoff']) {
    const v = actText[k];
    if (!Array.isArray(v) || v.length < 2 || v.length > 3 || v.some(s => typeof s !== 'string' || !s.trim())) problem(`${name}.ACT_TEXT.${k}`, '应为 2~3 句文案的数组');
  }
  const yank = isObject(mod.YANK_TEXT) ? mod.YANK_TEXT : {};
  say(yank.title, `${name}.YANK_TEXT.title`, 14); say(yank.text, `${name}.YANK_TEXT.text`);
  say(yank.go?.label, `${name}.YANK_TEXT.go.label`, 12); say(yank.go?.hint, `${name}.YANK_TEXT.go.hint`, 18); say(yank.go?.text, `${name}.YANK_TEXT.go.text`); say(yank.no?.label, `${name}.YANK_TEXT.no.label`, 12);

  if (cfg.us) {
    // 红色恐慌事件：engine 按反共压力排进来
    const scare = Array.isArray(mod.SCARE_EVENTS) ? mod.SCARE_EVENTS : [];
    const sf = flag => scare.filter(e => [].concat(e?.when?.flag || []).includes(flag)).length;
    if (sf('us_chain') < 8 || sf('rose') < 4) problem(`${name}.SCARE_EVENTS`, `数量不够：us_chain ${sf('us_chain')}/8、rose ${sf('rose')}/4`);
    scare.forEach((e, i) => {
      const at = `${name}.SCARE_EVENTS[${i}]`;
      if ((e?.weight ?? 1) !== 0) problem(at, '应为 weight: 0（由引擎排进来）');
      const f = [].concat(e?.when?.flag || []);
      if (f.length !== 1 || !['us_chain', 'rose'].includes(f[0])) problem(at, "when.flag 必须恰好是 'us_chain' 或 'rose'");
      if (!JSON.stringify(e?.options || []).includes('heat')) problem(at, '至少一个选项要动反共压力 heat');
    });
    // 读着不出戏：湾区版里不该出现深圳版的专有名词
    const flat = JSON.stringify([mod.IDEO_CAST, stages, pool, endings, mod.IDEO_CHAINS, mod.UTOPIA_EVENTS, mod.BCI_EVENTS, plan, actText, yank, events, scare]);
    for (const w of CN_ONLY) if (flat.includes(w)) problem(name, `湾区版里出现了深圳版的词「${w}」`);
  }
  return { stages: stages?.length ?? 0, cards: pool.length };
}
const poolIds = new Set();
const PORTRAITS = new Set(['longhair', 'streamer']);
const cnStat = checkIdeo(ideoModule, 'CN', { utopia: 'utopia', bci: 'bci', flags: ['red', 'capb', 'red_cell'] });
const usStat = checkIdeo(usModule, 'US', { utopia: 'utopia_us', bci: 'bci_us', flags: ['rose', 'missionco', 'rose_cell'], us: true });

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`OK ${allEvents.length} events, ${Object.keys(chains || {}).length} chains, ${news.length} news, ideology 深圳 ${cnStat.stages} 级 / ${cnStat.cards} 张卡、湾区 ${usStat.stages} 级 / ${usStat.cards} 张卡`);
