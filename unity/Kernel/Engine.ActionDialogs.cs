using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using static System.Math;
using static Liandan.Kernel.Js;

namespace Liandan.Kernel
{
    public sealed partial class GameState
    {
        private string ActionText(string key, params (string, object)[] vars)
        {
            var rows = (JsonArray)tables.Actions["TEXT"]![key]!;
            var row = rows.Count > 1 ? Pick(rows.ToArray()) : rows[0];
            return tables.FillRuntime(Region == "bay" ? row.Str("bay", row.Str("text")) : row.Str("text"), null, vars);
        }
        private Dialog ActionWindow(string prefix, string cat, string text, string? title = null, bool cards = false)
        {
            var view = Obj(("kind", cards ? "cards" : "event"), ("cat", cat), ("icon", ActionText(prefix + ".icon")), ("title", title ?? ActionText(prefix + ".title")), ("text", text));
            if (!cards) view["art"] = ActionText(prefix + ".art");
            return new Dialog(view);
        }
        private static JsonObject Said(string text) => Obj(("text", text));
        public static bool IsDialogAction(string id) => new[] { "release", "sprint", "raise", "wash", "digdirt", "furnace" }.Contains(id);
        // 仅移植本段 choose 所需的行动入口，费用和冷却随首层选项一起提交。
        public JsonObject? PerformDialogAction(string id, out Dialog? dialog)
        {
            dialog = null;
            var a = ((JsonArray)tables.Actions["ACTIONS"]!).First(r => r.Str("id") == id)!;
            var p = a["p"];
            double cost = id == "digdirt" ? p.N("月数") * Unit : 0;
            if (ap < a.N("ap") || Map("cd").On(id) || cost > cash) return null;
            if (id == "release" && Cap(BaseE + E) - Model.N("cap") < p.N("火候门槛") ||
               id == "sprint" && (Snapshot.On("sprint") || List("feats").Count == tables.Features.Count) ||
               id == "raise" && (stage >= ((JsonArray)D("STAGES")).Count - 2 || t - Snapshot.N("lastRaiseT") < p.N("间隔")) ||
               id == "wash" && List("dirt").Count == 0) return null;
            var before = ChipValues();
            bool paid = false;
            void Commit()
            {
                if (paid) return;
                paid = true; ap -= a.N("ap"); cash -= cost;
                if (a.On("cd")) Map("cd")[id] = t + a.N("cd");
            }
            switch (id)
            {
                case "raise":
                    dialog = RaiseDialog(a, out var failure);
                    if (dialog == null) { Commit(); failure!["chips"] = Chips(before); return failure; }
                    break;
                case "release": dialog = ReleaseDialog(p!); break;
                case "sprint": dialog = SprintDialog(p!); break;
                case "furnace":
                    dialog = ActionWindow(id, "tech", ActionText(id + ".text"));
                    foreach (var entry in D("DATA_SOURCES").Entries())
                    {
                        string key = entry.Key; var d = entry.Value!;
                        dialog.Add(Obj(("label", d.On("dirt") ? ActionText("furnace.dirty", ("名称", d.Str("name"))) : d.Str("name")), ("hint", d["desc"]),
                            ("disabled", Snapshot["furnace"].Str("data") == key), ("why", ActionText("furnace.inUse"))), () =>
                            {
                                Snapshot["furnace"] = Obj(("on", true), ("data", key), ("months", 0));
                                if (d.On("dirt")) AddDirt(d.Str("dirt"));
                                return Said(ActionText("furnace.done." + key));
                            });
                    }
                    break;
                case "wash": case "digdirt": dialog = Investigate(a); break;
                default: throw new ArgumentException(id);
            }
            dialog.View["closable"] = true;
            for (int i = 0; i < dialog.Options.Count; i++)
            {
                var go = dialog.Options[i]; dialog.Options[i] = () => { Commit(); return go(); };
            }
            return Obj(("dialog", dialog.View));
        }
        private Dialog SprintDialog(JsonNode p)
        {
            var pool = ((JsonArray)D("FEATURES")).Where(f => !Rows("feats").Any(n => n.ToString() == f.Str("id"))).ToList();
            var d = ActionWindow("sprint", "tech", ActionText("sprint.text"), cards: true);
            double k = 1 + p.N("每个已有功能加难") * List("feats").Count, eff = Max(1, Power("eng") * Mod("devMult"));
            while (d.Options.Count < p.N("选几个") && pool.Count > 0)
            {
                var f = Pick(pool)!; pool.Remove(f);
                var card = Obj(("icon", f["icon"]), ("name", f["name"]), ("r", 1), ("desc", ActionText("sprint.card", ("说明", f.Str("desc")), ("月", Max(1, Ceiling(f.N("need") * k / eff))))));
                d.Add(Obj(("label", f["name"]), ("card", card)), () =>
                {
                    Snapshot["sprint"] = Obj(("id", f["id"]), ("need", f.N("need") * k), ("done", 0));
                    return Said(ActionText("sprint.done", ("功能", f.Str("name"))));
                });
            }
            return d;
        }
        private Dialog Investigate(JsonNode a)
        {
            string id = a.Str("id"), attr = a["check"].Str("attr");
            var p = a["p"]; bool wash = id == "wash";
            var d = ActionWindow(id, wash ? "dirt" : "rival", ActionText(id + ".text"));
            foreach (var r in Rows(wash ? "dirt" : "rivals").OrderByDescending(n => n.N(wash ? "sev" : "bench")).Take((int)p.N(wash ? "最多几张" : "最多几家")))
            {
                double fee = wash ? Unit * r.N("sev") / p.N("费用除数") : 0;
                double dc = wash ? a["check"].N("dc") + r.N("sev") / p.N("难度除数") : r.N("cheat") >= p.N("注水线") ? p.N("注水难度") : a["check"].N("dc");
                string hint = wash ? ActionText("wash.hint", ("严重度", RoundJs(r.N("sev"))), ("花费", Money(fee))) : ActionText("digdirt.hint", ("老板", r.Str("boss")), ("跑分", Fixed(r.N("bench"), 1)));
                var opt = Obj(("label", r["name"]), ("hint", hint), ("chk", CheckText(attr, Check(attr, dc))));
                if (wash && cash < fee) { opt["disabled"] = true; opt["why"] = ActionText("common.noCash"); }
                d.Add(opt, () =>
                {
                    cash -= fee;
                    bool win = Random() < Check(attr, dc);
                    if (wash) { if (win) List("dirt").Remove(r); else r["sev"] = r.N("sev") + p.N("失败加重"); }
                    else { if (win) r["bench"] = r.N("bench") - p.N("对手跑分"); ApplyEffects(a[win ? "fx" : "failFx"], Obj(("rival", r["id"]))); }
                    string text = ActionText(id + (win ? ".ok" : ".fail"), ("黑料", r.Str("name")), ("对手", r.Str("name")), ("模型", r.Str("model")), ("老板", r.Str("boss")));
                    return Obj(("ok", win), ("text", text));
                });
            }
            return d;
        }
    }
}
