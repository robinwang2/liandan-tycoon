// 「表格里的事件」+「代码里的脚本」→ 引擎认识的事件。
//
// 表格管文字和数字：正文、选项、提示、结果、效果、检定难度、参数。
// 代码只管表格写不出来的部分：选项什么时候出现、选完以后怎么改状态、正文里的变量怎么算。
// 两边靠名字对上：选项表的「脚本」列填一个名字，代码里 HOOKS[事件id].opts[名字] 就是它的脚本。
//
// 一个事件的脚本：
//   enter(x)          进场时执行一次（x.p = 事件行的「参数」）
//   vars(x)           返回 { 名字: 值 }，正文、选项、提示、结果里的 {名字} 会被换掉；一个对话框只算一次
//   opts: { 名字: {
//     show(x)         返回 false 就不出现（表里的「出现条件」列也能管出现，两个都要满足）
//     after(x)        普通选项（有效果预览）：表里的效果生效以后，再补这一段
//     run(x)          没有检定的选项：选了以后执行。写了它，表里的「效果」就不会自动生效，要在里面调 x.fx()
//     ok(x) fail(x)   有检定的选项：成功 / 失败以后执行。同上，效果要自己调 x.fx() / x.failFx()
//     dc(x, 难度)     返回实际的检定难度（表里填的是基础难度）
//     odds(x, 概率)   返回实际的成功概率
//   } }
// 脚本拿到的 x：{ S 状态, c 事件上下文, G 引擎工具箱, ep 事件行的参数, p 选项行的参数, v 变量, o 选项行, T(键) 取「系统文本」表里的一段话,
//                 fx(额外效果?) 让「效果」列生效, failFx(额外效果?) 让「失败效果」列生效 }
// run / ok / fail 的返回值：不返回 = 用表里的结果文本；返回字符串 = 用它当结果文本；返回 { vars } = 给结果文本补几个变量。
//
// 带 run / ok / fail / dc / odds 的选项，以及「不预览」列填了「是」的选项，不显示效果预览（脚本会做什么，预览算不出来）。
const fill = (s, v) => (s == null ? s : String(s).replace(/\{([^{}\s]+)\}/g, (m, k) => (v && k in v ? v[k] : m)));

export function bindEvents(events, HOOKS, TEXT) {
  const T = (key, v) => { if (!(key in TEXT)) throw new Error(`「系统文本」表里没有「${key}」`); return fill(TEXT[key], v); };
  return events.map(e => {
    const H = HOOKS[e.id], opts = e.options || [];
    if (!H && !e.textBay && !opts.some(o => o.fn || o.noTip || o.when)) return e;         // 纯数据事件，原样交给引擎
    const O = H?.opts || {}, ep = e.p || {}, cache = new WeakMap();
    for (const o of opts) if (o.fn && !O[o.fn]) throw new Error(`事件 ${e.id}：选项「${o.label}」的脚本「${o.fn}」在代码里找不到`);
    const base = (S, c, G) => ({ S, c, G, ep, p: ep, T });
    const varsOf = (S, c, G) => { let v = cache.get(c); if (!v) { v = H?.vars?.(base(S, c, G)) || {}; cache.set(c, v); } return v; };
    const scripted = o => { const k = o.fn && O[o.fn]; return !!o.noTip || !!(k && (k.run || k.ok || k.fail || k.dc || k.odds)); };
    const ev = { ...e };
    if (H?.enter) ev.enter = (S, c, G) => H.enter(base(S, c, G));
    if (H?.vars || e.textBay) ev.text = (S, c, G) => fill(e.textBay && S.co.region === 'bay' ? e.textBay : e.text, varsOf(S, c, G));
    if (!opts.some(o => o.fn || o.noTip || o.when || /\{[^{}\s]+\}/.test(`${o.label}${o.hint}`))) return ev;
    ev.options = (S, c, G) => {
      const v = varsOf(S, c, G), out = [];
      for (const o of opts) {
        const k = (o.fn && O[o.fn]) || {}, p = o.p || {};
        const x = {
          S, c, G, ep, p, v, o, T,
          fx: extra => G.applyFx(S, extra ? { ...extra, ...(o.ok ? o.ok.fx : o.fx) } : (o.ok ? o.ok.fx : o.fx), c),
          failFx: extra => G.applyFx(S, extra ? { ...extra, ...o.fail.fx } : o.fail.fx, c),
        };
        if ((o.when && !G.cond(S, o.when)) || (k.show && !k.show(x))) continue;
        const label = fill(o.label, v), hint = fill(o.hint, v);
        const say = (r, text) => (typeof r === 'string' ? r : fill(text, r?.vars ? { ...v, ...r.vars } : v));
        if (!scripted(o)) {                                             // 普通选项：交给引擎按数据处理（带效果预览）
          const d = { ...o, label, hint };
          delete d.fn; delete d.p; delete d.when; delete d.noTip;
          if (o.ok) { d.ok = { ...o.ok, text: fill(o.ok.text, v) }; d.fail = { ...o.fail, text: fill(o.fail.text, v) }; } else d.text = fill(o.text, v);
          if (k.after) d.fn = () => k.after(x);
          out.push(d);
        } else if (o.check) {
          out.push(G.optCheck(S, label, hint, o.check.attr, k.dc ? k.dc(x, o.check.dc) : o.check.dc,
            () => say(k.ok ? k.ok(x) : x.fx(), o.ok.text), () => say(k.fail ? k.fail(x) : x.failFx(), o.fail.text)));
        } else if (o.odds != null) {
          out.push(G.optOdds(S, label, hint, k.odds ? k.odds(x, o.odds) : o.odds,
            () => say(k.ok ? k.ok(x) : x.fx(), o.ok.text), () => say(k.fail ? k.fail(x) : x.failFx(), o.fail.text)));
        } else out.push({ label, hint, go: () => ({ text: say(k.run ? k.run(x) : x.fx(), o.text) }) });
      }
      return out;
    };
    return ev;
  });
}
