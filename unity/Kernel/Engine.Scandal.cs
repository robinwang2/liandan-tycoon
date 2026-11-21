using System;
using System.Text.Json.Nodes;
using static Liandan.Kernel.Js;

namespace Liandan.Kernel
{
    public sealed partial class GameState
    {
        private Dialog Scandal(JsonNode d)
        {
            string type = d.Str("type");
            var def = D("DIRT")[type];
            double sev = d.N("sev"), sm = Mod("scandalMult"), fee = Unit * sev / P("scandal.feeDiv");
            double Param(string k) => P("scandal." + k);
            string Say(string k, params (string, object)[] v) => Tx("scandal." + k, v);
            void Hit(double k)
            {
                exposed += sev * k;
                if (def.On("crime")) Snapshot["exposedCrime"] = Snapshot.N("exposedCrime") + sev * k;
                if ((type == "bench_fake" || type == "bench_overfit") && Model != null) { Model["bench"] = Model.N("cap"); Model["infl"] = 0; }
                if (type == "fake_users") fake = 0;
                if (type == "cook_books") List("temp").Add(Obj(("key", "raiseMult"), ("mult", Param("cookRaiseMult")), ("until", t + Param("cookMonths"))));
                List("dirt").Remove(d);
                if (Snapshot.N("exposedCrime") >= Param("probeLine") && !Flag("probe"))
                { Map("flags")["probe"] = 1; List("q").Add(Obj(("type", "event"), ("id", "probe"))); }
            }
            void Lose(double k, double? mor = null, double? h = null, double? r = null) => ApplyEffects(Obj(("rep", -sev * k * sm), ("hype", h ?? -sev * Param("hype")), ("reg", sev * (r ?? Param("reg"))), ("morale", mor ?? Param("morale"))), new JsonObject());
            List("fxq").Add(new JsonArray("alarm"));
            var dlg = new Dialog(Obj(("kind", "event"), ("cat", "dirt"), ("icon", Say("icon")), ("art", Say("art")), ("title", Say("title", ("黑料", d.Str("name")))),
                ("text", Say(def.On("crime") ? "text.crime" : "text", ("爆料", def.Str("blurb", Say("blurb"))), ("严重度", RoundJs(sev)), ("公司", Company.Name)))));
            void AddRoll(string key, string attr, double prob, Action<bool> apply)
            {
                var opt = Obj(("label", Say(key)), ("hint", Say(key + ".hint", ("花费", Money(fee)))), ("chk", CheckText(attr, prob)));
                if (key == "pay" && cash < fee) { opt["disabled"] = true; opt["why"] = Say("noCash"); }
                dlg.Add(opt, () =>
                {
                    if (key == "pay") cash -= fee;
                    bool win = Random() < prob;
                    apply(win);
                    return Obj(("ok", win), ("text", Say(key + (win ? ".ok" : ".fail"))));
                });
            }
            void Clear(double reward) { List("dirt").Remove(d); ApplyEffects(Obj(("rep", reward)), new JsonObject()); }
            AddRoll("deny", "cha", Check("cha", Param("denyDc") + sev / Param("denyDiv")), win =>
            {
                if (win) Clear(Param("denyOkRep")); else { Hit(Param("denyFailHit")); Lose(Param("denyFailLose")); }
            });
            dlg.Add(Obj(("label", Say("sorry")), ("hint", Say("sorry.hint"))), () =>
            {
                Hit(Param("sorryHit")); Lose(Param("sorryLose"), Param("sorryMorale"), -sev * Param("sorryHype"), Param("sorryReg"));
                cash -= fee * Param("sorryFee"); return Obj(("text", Say("sorry.done")));
            });
            AddRoll("blame", "", Odds(Param("blameOdds")), win =>
            {
                string prefix = win ? "blameOk" : "blameFail";
                Hit(Param(prefix + "Hit")); Lose(Param(prefix + "Lose"), Param(prefix + "Morale"));
            });
            AddRoll("pay", "net", Check("net", Param("payDc") + sev / Param("payDiv")), win =>
            {
                if (win) Clear(Param("payOkRep")); else { Hit(Param("payFailHit")); Lose(Param("payFailLose")); AddDirt("hush"); }
            });
            return dlg;
        }
    }
}
