using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using static System.Math;
using static Liandan.Kernel.Js;

namespace Liandan.Kernel
{
    public sealed partial class GameState
    {
        // 回调绑定到产生窗口的状态实例。显示视图与回调按相同顺序添加。
        public sealed class Dialog
        {
            public Dialog? Next { get; internal set; }
            public JsonObject View { get; }
            internal readonly List<Func<JsonObject>> Options = new List<Func<JsonObject>>();
            internal Dialog(JsonObject view) { View = view; View["options"] = new JsonArray(); }
            internal void Add(JsonObject option, Func<JsonObject> go)
            {
                ((JsonArray)View["options"]!).Add(option);
                Options.Add(go);
            }
        }
        public Dialog? NextDialog()
        {
            var q = List("q");
            while (q.Count > 0 && !Snapshot.On("over"))
            {
                var it = q[0]!;
                q.RemoveAt(0);
                switch (it.Str("type"))
                {
                    case "event":
                        if (!tables.Events.TryGetValue(it.Str("id"), out var ev)) continue;
                        var ctx = it.On("ctx") ? (JsonObject)it["ctx"]! : new JsonObject();
                        return tables.StoryDialogs.Contains(it.Str("id")) ? StoryDialog(it.Str("id"), ctx) : EventDialog(ev, ctx);
                    case "draft":
                        var draft = Draft();
                        if (draft != null) return draft;
                        break;
                    case "scandal":
                        var d = Rows("dirt").FirstOrDefault(x => x.Str("uid") == it.Str("uid"));
                        if (d != null) return Scandal(d);
                        break;
                }
            }
            if (Snapshot.On("over")) q.Clear();
            return null;
        }
        public JsonObject? Choose(Dialog dlg, int index)
        {
            if (index < 0 || index >= dlg.Options.Count || dlg.View["options"]![index].On("disabled")) return null;
            var before = ChipValues();
            var result = dlg.Options[index]();
            if (dlg.Next == null) result["chips"] = Chips(before);
            return result;
        }
        private double Check(string attr, double dc) => Js.Clamp((P("check.base") + A.N(attr) + Mod("checkAdd") - dc) / P("check.span"), P("check.min"), P("check.max"));
        private double Odds(double p) => Js.Clamp(p + (A.N("luck") - 5) * P("odds.luckK"), P("odds.min"), P("odds.max"));
        private string CheckText(string attr, double prob) => attr.Length > 0 ? Tx("check.attr", ("属性", AttrName(attr)), ("成功率", RoundJs(prob * 100))) : Tx("check.odds", ("成功率", RoundJs(prob * 100)));
        private string Why(JsonNode req)
        {
            if (req["notFlag"] is JsonNode nf)
                foreach (string k in new[] { "red", "rose" }) if (Flag(k) && Values(nf).Any(v => v.ToString() == k)) return Tx("why." + k);
            if (req["cash"] != null && cash < req.N("cash") * Unit) return Tx("why.cash", ("现金", Money(req.N("cash") * Unit)));
            foreach (var a in req["attr"].Entries()) if (A.N(a.Key) < (double)a.Value!) return Tx("why.attr", ("属性", AttrName(a.Key)), ("数值", a.Value!));
            return Tx("why.other");
        }
        private Dialog EventDialog(JsonNode ev, JsonObject ctx, Func<JsonNode, bool, string?>? afterEffect = null)
        {
            string id = ev.Str("id");
            var ep = ev["p"];
            var vars = EventVars(id, ep, ctx);
            var rival = Rows("rivals").FirstOrDefault(r => r.Str("id") == ctx.Str("rival"));
            string Format(string s) => Regex.Replace(s, @"\{([^{}\s]+)\}", m =>
            {
                string key = m.Groups[1].Value;
                if (vars[key] != null) return vars[key]!.ToString();
                return key switch
                {
                    "co" => Company.Name,
                    "me" => Founder.Name,
                    "model" => Model.Str("name", Company.ModelName),
                    "rival" => rival.Str("name", Tx("fmt.rival")),
                    "boss" => rival.Str("boss", Tx("fmt.boss")),
                    "cur" => D("REGIONS")[Region].Str("cur"),
                    "staff" => ctx.Str("staffName", Tx("fmt.staff")),
                    _ => m.Value
                };
            });
            var view = Obj(("kind", "event"), ("id", id), ("cat", ev["cat"]), ("icon", ev["icon"]), ("title", Format(ev.Str("title"))),
                ("text", Format(Region == "bay" ? ev.Str("textBay", ev.Str("text")) : ev.Str("text"))), ("art", ev.Str("art", D("CAT_ART").Str(ev.Str("cat"), "boardroom"))));
            foreach (string k in new[] { "chain", "portrait", "delay" }) if (ev[k] != null) view[k] = ev[k]!.DeepClone();
            var dialog = new Dialog(view);
            foreach (var item in (JsonArray)ev["options"]!)
            {
                var o = item!;
                string fn = afterEffect == null ? o.Str("fn") : "";
                var p = o["p"];
                if (!Condition(o["when"]) || !ShowOption(id, fn, p, ctx)) continue;
                var option = Obj(("label", Format(o.Str("label"))), ("hint", Format(o.Str("hint"))));
                bool script = o.On("noTip") || fn.Length > 0 && fn != "never" && fn != "support" && fn != "safe";
                if (!script && o["side"] != null) option["side"] = o["side"]!.DeepClone();
                if (!script && o["req"] is JsonNode req && !Condition(req)) { option["disabled"] = true; option["why"] = Why(req); }
                var check = o["check"];
                bool roll = check != null || o["odds"] != null;
                double odds = o.N("odds"), dc = check.N("dc");
                if (fn == "coop") dc -= Min(p.N("最多减"), Power("legal") / p.N("每几点法务减一"));
                if (fn == "risky" && Map("policies").Str("safety") == "loose") odds = p.N("放飞时概率");
                double Probability() => check != null ? Check(check.Str("attr"), dc) : Odds(odds);
                if (roll) option["chk"] = CheckText(check.Str("attr"), Probability());
                if (!script) option["tip"] = roll ? Obj(("ok", FxLines(o["ok"]?["fx"])), ("fail", FxLines(o["fail"]?["fx"]))) : Obj(("fx", FxLines(o["fx"])));
                dialog.Add(option, () =>
                {
                    bool win = roll && Random() < Probability();
                    var branch = roll ? o[win ? "ok" : "fail"]! : o;
                    string? extra = null;
                    if (afterEffect == null) RunOption(id, fn, win, branch["fx"], ctx, p, ep, vars);
                    else { ApplyEffects(branch["fx"], ctx); extra = afterEffect(o, win); }
                    var result = Obj(("text", Format(extra ?? branch.Str("text"))));
                    if (roll) result["ok"] = win;
                    return result;
                });
            }
            if (ev.On("scene")) List("fxq").Add(ev["scene"]!.DeepClone());
            return dialog;
        }
        private Dialog? Draft()
        {
            var pool = ((JsonArray)D("PERKS")).Where(p => !Rows("perks").Any(n => n.ToString() == p.Str("id"))).ToList();
            if (pool.Count == 0) return null;
            var d = new Dialog(Obj(("kind", "cards"), ("cat", "sys"), ("icon", Tx("draft.icon")), ("title", Tx("draft.title")), ("text", Tx("draft.text"))));
            double Weight(JsonNode? p) => P("draft.w" + p.N("r"));
            while (d.Options.Count < P("draft.count") && pool.Count > 0)
            {
                double x = Random() * pool.Sum(Weight);
                int i = Max(0, pool.FindIndex(p => (x -= Weight(p)) < 0));
                var card = pool[i]!;
                pool.RemoveAt(i);
                d.Add(Obj(("label", card["name"]), ("card", card)), () =>
                {
                    string id = card.Str("id");
                    if (!Rows("perks").Any(n => n.ToString() == id)) { List("perks").Add(id); ApplyEffects(card["fx"], new JsonObject()); }
                    return Obj(("text", Tx("draft.done", ("卡", card.Str("name")), ("说明", card.Str("desc")))));
                });
            }
            return d;
        }
    }
}
