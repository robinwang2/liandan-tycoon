// 打包好的单文件（双击打开那种 file://）试玩：开新局，一路点 N 个月，看有没有报错、漏填的 {变量}、undefined / NaN。
//   node built-smoke.mjs <炼丹大亨-3A.html> [月数] [截图.png]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [file, monthsArg = '30', shot] = process.argv.slice(2), MONTHS = +monthsArg;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'ldt-smoke-')), port = 9300 + Math.floor(Math.random() * 600);
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--disable-extensions', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
let ver = null;
for (let i = 0; i < 80 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(250); } }
const connect = u => { const ws = new WebSocket(u), pending = new Map(), hs = []; let id = 0; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else hs.forEach(h => h(m)); }; const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }); return new Promise(r => { ws.onopen = () => r({ send, on: h => hs.push(h) }); }); };
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = await connect(targets.find(t => t.type === 'page').webSocketDebuggerUrl), errors = [];
page.on(m => { if (m.method === 'Runtime.exceptionThrown') errors.push((m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 300)); });
await page.send('Runtime.enable'); await page.send('Page.enable');
await page.send('Page.navigate', { url: pathToFileURL(path.resolve(file)).href });
const ev = async e => { const r = await page.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; };
let ok = false;
for (let i = 0; i < 80 && !ok; i++) { await sleep(250); ok = await ev('!!document.querySelector("#ui .title")'); }
if (!ok) { console.log('✗ 标题画面没出来', errors); process.exit(1); }
const click = sel => ev(`(() => { const el = document.querySelector('#ui ${sel}'); if (!el || el.disabled) return false; el.click(); return true; })()`);
const clickText = sub => ev(`(() => { const el = [...document.querySelectorAll('#ui [data-a^="dlg:"]')].find(e => e.textContent.includes(${JSON.stringify(sub)}) && !e.disabled); if (!el) return false; el.click(); return true; })()`);
const drain = async () => { for (let i = 0; i < 40; i++) { await sleep(60); if (await click('[data-a="res"]')) continue; if (await click('[data-a="tip"]')) continue; const o = await ev(`(() => { const el = [...document.querySelectorAll('#ui [data-a^="dlg:"]')].find(e => !e.disabled && e.dataset.a !== 'dlg:close'); if (!el) return false; el.click(); return true; })()`); if (!o) break; } };
const odd = new Set();
const inspect = async label => { const t = await ev('document.getElementById("ui").innerText'); for (const m of t.matchAll(/\{[^{}\s]{1,12}\}/g)) odd.add(`${label}：漏填 ${m[0]}`); const mm = /undefined|NaN|\[object /.exec(t.replace(/loss 一夜之间变成 NaN/g, '')); if (mm) odd.add(`界面里有「…${t.slice(Math.max(0, mm.index - 50), mm.index + 25).replace(/\s+/g, ' ')}…」`); };
await inspect('标题'); await click('[data-a="new"]'); await sleep(100); await inspect('建角');
for (let s = 0; s < 4; s++) { await click('[data-a="w:step:1"]'); await sleep(50); await inspect('建角第 ' + (s + 2) + ' 步'); }
await click('[data-a="w:start"]'); await sleep(300); await drain();
let m = 0;
for (; m < MONTHS; m++) {
  if (await ev('!!document.querySelector("#ui .endc")')) break;
  for (const t of ['rd', 'team', 'cap', 'pr', 'ops', 'ideo']) if (await click(`[data-a="ltab:${t}"]`)) await inspect(`第 ${m + 1} 月 左页签 ${t}`);
  for (const t of ['board', 'chain', 'team', 'safe', 'perks', 'fin', 'log']) if (await click(`[data-a="rtab:${t}"]`)) await inspect(`第 ${m + 1} 月 右页签 ${t}`);
  const acts = await ev(`[...document.querySelectorAll('#ui .act:not(.off)')].map(e => e.dataset.a).slice(0, 2)`);
  for (const a of acts || []) { await click(`[data-a="${a}"]`); await sleep(80); await inspect(`第 ${m + 1} 月 ${a}`); await drain(); }
  await click('[data-a="next"]'); await sleep(80);
  await clickText('进入下个月'); await sleep(120); await inspect(`第 ${m + 1} 月 月底`); await drain();
}
if (shot) { const r = await page.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(shot, Buffer.from(r.result.data, 'base64')); }
const state = await ev('(() => { const t = document.querySelector("#ui .top small")?.innerText || ""; return (document.querySelector("#ui .endc") ? "结局：" + document.querySelector("#ui .endc h1")?.innerText + " · " : "") + t; })()');
console.log(`${errors.length || odd.size ? '✗' : '✓'} 打包版试玩 ${m} 个月（${state}）`);
for (const o of [...odd].slice(0, 15)) console.log('  ⚠ ' + o);
for (const e of [...new Set(errors)].slice(0, 10)) console.log('  ✗ ' + e);
await page.send('Browser.close').catch(() => {}); await sleep(500); try { proc.kill(); } catch {}
try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
process.exit(errors.length || odd.size ? 1 : 0);
