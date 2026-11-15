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
]);
const REQ_KEYS = new Set([...WHEN_KEYS, 'cash', 'attr']);
const FX_KEYS = new Set([
  'cash', 'cashAbs', 'hype', 'rep', 'morale', 'reg', 'bubble', 'usersPct', 'tech',
  'bench', 'quality', 'quota', 'equity', 'ap', 'attr', 'dirt', 'cleanDirt',
  'expose', 'flag', 'unflag', 'staff', 'rival', 'temp', 'follow', 'perk', 'project',
  'chain', 'end',
]);
const ATTRS = new Set(['tech', 'cha', 'mgmt', 'biz', 'net', 'luck']);
const DIRTS = new Set([
  'bench_fake', 'bench_overfit', 'scrape', 'distill', 'fake_users', 'astroturf',
  'bribe', 'smuggle', 'cook_books', 'human_ai', 'overwork', 'fake_demo', 'hush',
  'privacy', 'tax', 'nda', 'coverup',
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
  'meltdown', 'mystery',
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
  if (isObject(chains) && !own(chains, project.chain)) problem(where, `project.chain 未登记: ${project.chain}`);
}
for (const { value: update, where } of chainUpdates) {
  if (isObject(chains) && !own(chains, update.id)) problem(where, `chain.id 未登记: ${update.id}`);
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

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`OK ${allEvents.length} events, ${Object.keys(chains || {}).length} chains, ${news.length} news`);
