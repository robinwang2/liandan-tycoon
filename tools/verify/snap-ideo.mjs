// 路线之争逐项对照：旧版（git HEAD 的 src）和新版（文字、数字读表）把同一局路线之争走一遍，看到的、算出来的必须完全一样。
// 每一局：快进到第 29 个月 → 接盘老股（接受 / 拖延 / 优先购买）→ 15 级按某种打法选 → 结局、处置左倾员工 → 意识形态行动、五年计划、末位淘汰 → 再过一年。
// 每个对话框、每次选择的结果、每个行动的结果、意识形态页上的几句话、每个月底的完整状态都记下来，两边逐行比。
//   node snap-ideo.mjs <旧版 src 目录> <项目根目录>
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [oldSrc, root] = process.argv.slice(2);
const load = async base => ({
  G: await import(pathToFileURL(path.join(base, 'game/engine.js'))), A: await import(pathToFileURL(path.join(base, 'game/actions.js'))),
  I: await import(pathToFileURL(path.join(base, 'game/ideology.js'))),
});
const OLD = await load(oldSrc), NEW = await load(path.join(root, 'src'));
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(kk => [kk, x[kk]])) : x));
function seeded(seed) { let s = seed | 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const viewDialog = d => ({ kind: d.kind, id: d.id, cat: d.cat, icon: d.icon, title: d.title, text: d.text, art: d.art, chain: d.chain, portrait: d.portrait,
  options: d.options.map(o => ({ label: o.label, hint: o.hint, chk: o.chk, disabled: o.disabled, why: o.why, side: o.side, tip: o.tip, card: o.card, free: o.free })) });
const viewResult = r => (r ? { text: r.text, ok: r.ok, chips: r.chips, err: r.err, dialog: r.dialog ? viewDialog(r.dialog) : undefined } : null);
const IDEO_ACTS = ['mobilize', 'utopia', 'selfcrit', 'subbotnik', 'plan', 'yank', 'bci', 'buyback', 'costcut', 'spinoff'];

function run(M, sc, log) {
  const { G, A, I } = M, rnd = seeded(sc.seed), real = Math.random;
  Math.random = rnd;
  try {
    const put = (tag, v) => log.push(tag + ' ' + canon(v));
    const S = G.newGame({ name: '测试员', coName: '混沌智能', modelName: '混沌', region: sc.region, route: sc.route, track: 'chat', attrs: { tech: 7, cha: 6, mgmt: 6, biz: 6, net: sc.net, luck: 5 }, traits: ['yao', 'bigtech', 'none'] }, {});
    S.q.length = 0;
    Object.assign(S, { t: 29, stage: 3, cash: 9000, users: 400, equity: sc.equity, ideoAt: 30, hype: 40, rep: 55 });
    if (S.ownModel) { S.E = 600; S.model.cap = 45; S.model.bench = 45; S.gpu = 40; }
    S.policies.price = sc.price; S.policies.work = sc.work;
    for (const r of ['res', 'eng', 'eng', 'ops', 'ops', 'biz', 'legal', 'res', 'eng', 'ops']) G.addStaff(S, G.genStaff(S, r));
    S.staff[0].quirk = 'loyal'; S.staff[3].quirk = 'loyal'; S.staff[5].quirk = 'genius';
    let flip = 0;
    const pickFor = d => {
      const ok = d.options.map((o, i) => i).filter(i => !d.options[i].disabled);
      if (!ok.length) return -1;
      if (d.id === 'ideo_entry') { const want = { accept: 0, rofr: 1, stall: 2 }[sc.entry]; return ok.includes(want) ? want : ok[0]; }
      if (/^ideo_\d+$/.test(d.id || '')) {
        const side = sc.side === 'mixed' ? (flip++ % 3 === 2 ? 'cap' : 'red') : sc.side === 'swing' ? (flip++ % 2 ? 'cap' : 'red') : sc.side;
        if (sc.side === 'rand') return ok[Math.floor(rnd() * ok.length)];
        const hit = ok.find(i => d.options[i].side === side);
        return hit ?? ok[0];
      }
      if (d.id === 'ideo_purge') return ok[sc.purge % ok.length];
      if (d.id === 'ideo_plan_due') return ok[sc.seed % ok.length];
      const clean = ok.filter(i => !/☠|认输|卖了|出国|接受邀请/.test(d.options[i].label + (d.options[i].hint || '')));
      return (clean.length ? clean : ok)[Math.floor(rnd() * (clean.length || ok.length))];
    };
    const drain = first => {
      let d = first || G.nextDialog(S), guard = 0;
      while (d && guard++ < 60) {
        put('对话框', viewDialog(d));
        const i = pickFor(d);
        if (i < 0) { d = G.nextDialog(S); continue; }
        const r = G.choose(S, d, i);
        put('选择', [i, viewResult(r)]);
        d = r?.dialog || G.nextDialog(S);
      }
    };
    const page = () => put('意识形态页', { lean: I.leanText(S), v: I.verOf(S), side: I.sideName(S), tag: I.sideTag(S), goal: I.goalOf(S), cast: I.castOf(S), len: I.IDEO_LEN, eq: I.IDEO_EQUITY,
      drag: [I.heatDrag(S, 'raiseMult'), I.heatDrag(S, 'b2bMult'), I.heatDrag(S, 'x')], lean2: I.ideoLean(S), verdict: I.verdict(S), on: I.ideoOn(S), red: I.isRed(S), cap: I.isCap(S),
      ...(NEW === M ? { plan: S.ideo?.plan ? I.vt(S, 'ideo.page.plan', { 日期: G.dateStr(S.ideo.plan.due) }) : null, yank: S.flags.yank ? I.vt(S, 'ideo.page.yank') : null } : {}) });
    for (let m = 0; m < 34 && !S.over; m++) {
      // 走完路线之争以后：把意识形态行动轮着做一遍（花不了的、点不了的也记下来）
      if (S.ideo?.result && S.ideo.result !== 'fail') {
        S.ap = Math.max(S.ap, 3); S.cash = Math.max(S.cash, m % 5 ? 3000 : 30000);
        for (const id of IDEO_ACTS) {
          const a = A.ACT[id];
          if ((a.show && !a.show(S)) || A.actionState(S, a).why) { put('行动不可用', [id, A.actionState(S, a), a.show ? !!a.show(S) : true, a.desc(S)]); continue; }
          if (id !== 'utopia' && (m + IDEO_ACTS.indexOf(id) + sc.seed) % 3) continue;
          put('行动菜单', [id, A.actName(S, a), a.desc(S), A.actionState(S, a)]);
          const r = A.perform(S, id);
          put('行动', [id, viewResult(r)]);
          drain(r?.dialog);
        }
      }
      if (S.ideo?.on) S.policies.safety = ['strict', 'std', 'loose'][m % 3];
      if (S.ideo?.on && m % 4 === 1 && S.staff.length > 4) { const r = A.fire(S, S.staff[S.staff.length - 1].uid); put('裁人', viewResult(r)); }
      page();
      G.endMonth(S);
      drain();
      put('月底', S);
    }
    page();
  } finally { Math.random = real; }
}

const scens = [];
let seed = 1;
for (const region of ['sz', 'bay']) for (const [entry, net] of [['accept', 6], ['stall', 3], ['stall', 10], ['rofr', 6]]) for (const side of ['red', 'cap', 'mid', 'mixed', 'swing', 'rand']) for (const equity of [72, 44, 36]) {
  if (entry !== 'accept' && (side === 'mid' || side === 'swing')) continue;
  scens.push({ region, route: seed % 2 ? 'model' : 'app', entry, net, side, equity, price: ['free', 'std', 'premium'][seed % 3], work: seed % 4 ? '965' : '996', purge: seed % 4, seed: seed++ });
}
let bad = 0, lines = 0;
const seen = new Set(), cov = new Set();
for (const sc of scens) {
  const a = [], b = [];
  let ea = null, eb = null;
  try { run(OLD, sc, a); } catch (e) { ea = e.stack; }
  try { run(NEW, sc, b); } catch (e) { eb = e.stack; }
  if (ea || eb) { if (ea !== eb) { bad++; console.log(`✗ ${canon(sc)} 出错：\n 旧：${ea}\n 新：${eb}`); } continue; }
  // 新版多记了意识形态页的两句（旧版的同一句话写死在界面里）：拿掉以后再比
  const strip = l => l.startsWith('意识形态页 ') ? l.replace(/,"plan":(null|"[^"]*"),/, ',').replace(/,"yank":(null|"[^"]*")\}$/, '}') : l;
  for (const l of b) if (l.startsWith('对话框 ')) { const id = JSON.parse(l.slice(4)).id; if (/^ideo|scare|utopia|bci/.test(id || '')) cov.add(id.replace(/_d+$/, '_N')); }
  for (const l of b) if (l.startsWith('行动 ')) cov.add('行动:' + JSON.parse(l.slice(3))[0]);
  for (const l of b) { const m = /"(?:plan|yank)":"([^"]+)"/g; let x; while ((x = m.exec(l))) seen.add(x[1].replace(/\d{4}年\d+月/, '某年某月')); }
  const n = Math.max(a.length, b.length);
  lines += n;
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i] && strip(b[i]);
    if (x === y) continue;
    bad++;
    let p = 0; while (x && y && p < x.length && x[p] === y[p]) p++;
    console.log(`✗ ${canon(sc)} 第 ${i} 行，第 ${p} 个字符起：\n 旧：…${x?.slice(Math.max(0, p - 120), p + 200)}\n 新：…${y?.slice(Math.max(0, p - 120), p + 200)}`);
    break;
  }
}
// 覆盖：这些局里出现过哪些路线之争的窗口
console.log(`${bad ? '✗' : '✓'} ${scens.length} 局、${lines} 行记录${bad ? `，${bad} 局不一样` : '，旧版新版完全一样'}`);
console.log('覆盖：', [...cov].sort().join(' '));
console.log('意识形态页上的两句：', [...seen].join(' / '));
process.exit(bad ? 1 : 0);
