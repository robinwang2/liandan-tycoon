// 界面对照：同一个开发服务器上开两个页面——新版（127.0.0.1:5173/）和旧版（localhost:5173/.vite/oldsite/，两个域名的存档互不干扰），
// 做一模一样的操作、灌一模一样的局面，每一步都把 #ui 的 HTML 拿出来比（去掉帧率、动画相位这些每次都不一样的东西）。
//   node ui-compare.mjs <局面.json> [--only 新] [--dump 目录]
//   --only 新：只开新版，检查界面能不能正常走完、有没有报错、有没有漏填的 {变量}（最后的试玩检查用）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2), statesFile = args[0], onlyNew = args.includes('--only'), dumpDir = args.includes('--dump') ? args[args.indexOf('--dump') + 1] : null;
const STATES = JSON.parse(fs.readFileSync(statesFile, 'utf8'));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URLS = { new: 'http://127.0.0.1:5173/', old: 'http://localhost:5173/.vite/oldsite/index.html' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ldt-uicmp-'));
const port = 9300 + Math.floor(Math.random() * 600);
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1440,900', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
let ver = null;
for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(250); } }
if (!ver) { console.log('Chrome 没启动'); process.exit(1); }
function connect(u) {
  const ws = new WebSocket(u), pending = new Map(), handlers = []; let id = 0;
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else handlers.forEach(h => h(m)); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return new Promise(r => { ws.onopen = () => r({ ws, send, on: h => handlers.push(h) }); });
}
const br = await connect(ver.webSocketDebuggerUrl);
const DRIVER = `window.__drv = (() => {
  // 界面上的计时器：按钮闪烁（2.6 秒）和小提示消失（5.2 秒）不让它走，免得两个页面在不同的时刻消失；延迟弹出的事件窗立刻弹
  const st0 = window.setTimeout; window.setTimeout = (fn, ms, ...a) => (ms === 2600 || ms === 5200 ? 0 : st0(fn, ms >= 1000 ? 0 : ms, ...a));
  const mul = s => () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const q = s => document.querySelector('#ui ' + s), all = s => [...document.querySelectorAll('#ui ' + s)];
  const D = {
    seed(n) { Math.random = mul(n); return 'ok'; },
    click(a) { const el = q('[data-a="' + a + '"]'); if (!el) return 'missing:' + a; if (el.disabled) return 'disabled:' + a; el.click(); return 'ok'; },
    first(prefix) { const el = all('[data-a]').find(e => e.dataset.a.startsWith(prefix) && !e.disabled); if (!el) return 'missing:' + prefix; el.click(); return el.dataset.a; },
    text(sub) { const el = all('[data-a^="dlg:"]').find(e => e.textContent.includes(sub) && !e.disabled); if (!el) return 'missing:' + sub; el.click(); return el.dataset.a; },
    load(json) { const S = window.__game.S; for (const k of Object.keys(S)) delete S[k]; Object.assign(S, JSON.parse(json)); window.__game.render(); return 'ok'; },
    // 把对话框一路点完（选第一个能点的；结果页点继续）
    drain(max) { let n = 0; while (n++ < max) { if (q('[data-a="res"]')) { q('[data-a="res"]').click(); continue; } const o = all('[data-a^="dlg:"]').find(e => !e.disabled && e.dataset.a !== 'dlg:close'); if (!o) break; o.click(); } return n; },
    screen() { return q('.endc') ? 'end' : q('.title') ? 'title' : q('.wizard') ? 'wizard' : q('.top') ? 'play' : '?'; },
    snap() {
      const ui = document.getElementById('ui');
      return ui.innerHTML.replace(/ new" style="animation-delay:-\\d+ms"/g, '"').replace(/(<div class="fps">)[^<]*/g, '$1').replace(/(data-live="perf">)[^<]*/g, '$1')
        .replace(/<i class="arr[^"]*">[^<]*<\\/i><b data-live="lcd">[^<]*<\\/b>/g, '<lift/>') + '|' + (document.querySelector('.rotate-hint')?.outerHTML || '');
    },
  };
  return D;
})(); 'ok'`;
async function open(url) {
  const { targetId } = (await br.send('Target.createTarget', { url: 'about:blank' })).result;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = await connect(targets.find(t => t.id === targetId).webSocketDebuggerUrl);
  const errors = [];
  page.on(m => {
    if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 400));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300));
  });
  await page.send('Runtime.enable'); await page.send('Page.enable');
  await page.send('Page.navigate', { url });
  const ev = async expr => { const r = await page.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result?.result?.value; };
  let ok = false;
  for (let i = 0; i < 80 && !ok; i++) { await sleep(250); ok = await ev('!!(window.__game && document.querySelector("#ui .title"))').catch(() => false); }
  if (!ok) throw new Error(url + ' 没加载出来：' + errors.join(' | '));
  await ev(DRIVER);
  return { ev, errors };
}
const pages = onlyNew ? { new: await open(URLS.new) } : { new: await open(URLS.new), old: await open(URLS.old) };
await sleep(1500);
const names = Object.keys(pages);
let steps = 0, bad = 0;
const fails = [], texts = new Set();
if (dumpDir) fs.mkdirSync(dumpDir, { recursive: true });
// 等画面稳定：隔 120 毫秒拿两次，一样就算稳（有的事件窗是延迟弹出的）
async function settled(p) { let a = await p.ev('__drv.snap()'); for (let i = 0; i < 25; i++) { await sleep(120); const b = await p.ev('__drv.snap()'); if (a === b) return a; a = b; } return a; }
async function step(label, expr) {
  const rs = {};
  for (const n of names) rs[n] = await pages[n].ev(expr);
  const snaps = {};
  for (const n of names) snaps[n] = await settled(pages[n]);
  if (snaps.old) snaps.old = snaps.old.split('/.vite/oldsite/').join('/');
  steps++;
  const nw = snaps.new;
  for (const m of nw.matchAll(/\{([^{}\s<>"]{1,12})\}/g)) texts.add(`${label}：{${m[1]}}`);                  // 漏填的 {变量}
  if (/undefined|NaN|\[object /.test(nw.replace(/<svg[\s\S]*?<\/svg>/g, ''))) texts.add(`${label}：界面里有 undefined/NaN`);
  if (dumpDir) fs.writeFileSync(path.join(dumpDir, `${String(steps).padStart(4, '0')}.html`), nw);
  if (onlyNew) return rs.new;
  if (rs.new !== rs.old || nw !== snaps.old) {
    bad++;
    if (fails.length < 10) {
      const a = snaps.old, b = nw; let p = 0; while (p < a.length && a[p] === b[p]) p++;
      fails.push(`✗ ${label}（操作结果 旧 ${rs.old} / 新 ${rs.new}），第 ${p} 个字符起：\n   旧：…${a.slice(Math.max(0, p - 160), p + 220)}\n   新：…${b.slice(Math.max(0, p - 160), p + 220)}`);
    }
  }
  return rs.new;
}
const S = JSON.stringify;
// ① 标题、设置、局外成长
await step('标题', '__drv.seed(1); __game.render(); "ok"');
await step('设置', '__drv.seed(2); __drv.click("settings")');
await step('设置·关', '__drv.click("settings:close")');
await step('局外成长', '__drv.click("meta")');
await step('回标题', '__drv.click("back")');
// ② 建角向导：湾区走一遍，深圳走一遍
await step('向导·湾区 1', '__drv.seed(3); __drv.click("new")');
for (const [lab, a] of [['属性', 'w:step:1'], ['加点', 'w:attr:tech:1'], ['出身', 'w:step:1'], ['公司', 'w:step:1'], ['套壳', 'w:pick:route:app'], ['品牌', 'w:step:1'], ['换色', 'w:brand:#2ec4a6']]) await step('向导·湾区 ' + lab, `__drv.seed(4); __drv.click(${S(a)})`);
for (let i = 0; i < 4; i++) await step('向导·后退', '__drv.click("w:step:-1")');
await step('向导·深圳', '__drv.seed(5); __drv.click("w:region:sz")');
await step('向导·随机名字', '__drv.seed(6); __drv.click("w:rand")');
for (const [lab, a] of [['属性', 'w:step:1'], ['出身', 'w:step:1'], ['公司', 'w:step:1'], ['做模型', 'w:pick:route:model'], ['品牌', 'w:step:1'], ['随机公司', 'w:randco']]) await step('向导·深圳 ' + lab, `__drv.seed(7); __drv.click(${S(a)})`);
// ③ 开局（新手教学开着）
await step('开张', '__drv.seed(8); __drv.click("w:start")');
await step('开局事件', '__drv.drain(1)');
await step('教学卡', '__drv.drain(10)');
await step('知道了', '__drv.click("tip")');
for (const t of ['rd', 'team', 'cap', 'pr', 'ops', 'ideo']) await step('左页签 ' + t, `__drv.click("ltab:${t}")`);
for (const t of ['board', 'chain', 'team', 'safe', 'perks', 'fin', 'log']) await step('右页签 ' + t, `__drv.click("rtab:${t}")`);
await step('下个月（还有行动点）', '__drv.seed(9); __drv.click("next")');
await step('进入下个月', '__drv.seed(10); __drv.text("进入下个月")');
await step('点完对话框', '__drv.seed(11); __drv.drain(20)');
// ④ 灌局面：每个局面看一遍各个页签、弹窗、员工气泡、裁人、菜单、提示
for (const [i, st] of STATES.entries()) {
  const tag = `#${i} ${st.tag}`;
  const scr = await pages.new.ev('__drv.screen()');
  if (scr !== 'play') {                                                       // 不在经营界面：回标题，开一局新的，再灌局面
    await step(`${tag} 回标题`, '__drv.click("back")');
    await step(`${tag} 新开一局`, `__drv.seed(${20 + i}); __drv.click("new"); __drv.click("w:start"); __drv.drain(30); __drv.click("tip"); "ok"`);
  }
  await step(`${tag} 关掉残留的窗口`, '__drv.drain(30)');
  await step(`${tag} 灌入`, `__drv.seed(${100 + i}); __drv.load(${S(S(st.S))})`);
  for (const [l, r] of [['rd', 'board'], ['team', 'chain'], ['cap', 'team'], ['pr', 'safe'], ['ops', 'perks'], ['ideo', 'fin'], ['rd', 'log']]) await step(`${tag} 页签 ${l}/${r}`, `__drv.click("ltab:${l}") + " " + __drv.click("rtab:${r}")`);
  if (i % 3 === 0) {
    await step(`${tag} 员工气泡`, '__drv.click("rtab:team"); __drv.first("who:")');
    await step(`${tag} 裁人`, '__drv.first("fire:")');
    await step(`${tag} 算了`, '__drv.text("算了")');
    await step(`${tag} 菜单`, '__drv.click("menu")');
    await step(`${tag} 继续经营`, '__drv.text("继续经营")');
    await step(`${tag} 点提示`, '__drv.seed(7); __drv.first("hint:")');
    await step(`${tag} 收起`, '__drv.drain(6)');
  }
  if (i % 4 === 1) await step(`${tag} 设置`, '__drv.click("settings")'), await step(`${tag} 设置·关`, '__drv.click("settings:close")');
  if (st.over || st.S.q?.length) {
    await step(`${tag} 弹窗`, `__drv.seed(${300 + i}); __game.pump(); "ok"`);
    for (let k = 0; k < 6; k++) await step(`${tag} 弹窗 ${k}`, `__drv.seed(${400 + i * 10 + k}); __drv.drain(1)`);
  }
  if (i % 5 === 2) { await step(`${tag} 下个月`, `__drv.seed(${500 + i}); __drv.click("next")`); await step(`${tag} 进入下个月`, '__drv.text("进入下个月")'); await step(`${tag} 点完`, `__drv.seed(${600 + i}); __drv.drain(20)`); }
}
const errs = names.flatMap(n => pages[n].errors.map(e => `[${n}] ${e}`));
console.log(onlyNew ? `走了 ${steps} 步。` : `${bad ? '✗' : '✓'} 界面对照 ${steps} 步${bad ? `，${bad} 步不一样` : '，新旧完全一样'}`);
for (const f of fails) console.log(f);
if (texts.size) { console.log(`⚠ 可疑的地方 ${texts.size} 处：`); for (const t of [...texts].slice(0, 20)) console.log('  ' + t); }
if (errs.length) { console.log(`⚠ 页面报错 ${errs.length} 条：`); for (const e of [...new Set(errs)].slice(0, 10)) console.log('  ' + e); }
br.send('Browser.close'); await sleep(800);
try { proc.kill(); } catch {}
try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
process.exit(bad || (onlyNew && (texts.size || errs.length)) ? 1 : 0);
