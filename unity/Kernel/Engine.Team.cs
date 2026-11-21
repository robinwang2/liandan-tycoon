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
        private string Tx(string key, params (string key, object value)[] vars) => tables.Text(key, Region == "bay", vars);
        private void News(string message)
        {
            var log = List("log");
            log.Insert(0, Obj(("t", t), ("msg", message)));
            while (log.Count > 60) log.RemoveAt(log.Count - 1);
        }
        private string FormatNews(string template)
        {
            return System.Text.RegularExpressions.Regex.Replace(template, @"\{(\w+)\}", m => m.Groups[1].Value switch
            {
                "co" => Company.Name,
                "me" => Founder.Name,
                "model" => Model.Str("name", Company.ModelName),
                "rival" => Tx("fmt.rival"),
                "boss" => Tx("fmt.boss"),
                "staff" => Tx("fmt.staff"),
                "cur" => D("REGIONS")[Region].Str("cur"),
                _ => m.Value
            });
        }
        private void Award(string id)
        {
            if (D("ACHIEVEMENTS")[id] is JsonNode a && !Rows("ach").Any(n => n.ToString() == id))
            {
                List("ach").Add(id);
                News(Tx("news.award", ("成就", a.Str("name"))));
            }
        }
        private void AddDirt(string type, JsonNode? input = null)
        {
            var definition = D("DIRT")[type];
            double sev = (input.On("sev") ? input.N("sev") : definition.N("sev", 10)) * Mod("dirtGainMult");
            Snapshot["hadDirt"] = true;
            var old = Rows("dirt").FirstOrDefault(d => d.Str("type") == type);
            if (old != null) { old["sev"] = Min(P("dirt.stackMax"), old.N("sev") + sev * P("dirt.stackK")); return; }
            List("dirt").Add(Obj(("uid", "d" + uid++), ("type", type), ("name", input.On("name") ? input.Str("name") : definition.Str("name", type)), ("sev", sev), ("t", t)));
            if (List("dirt").Count >= P("ach.dirty")) Award("dirty");
        }
        private JsonObject GenStaff(string role, double bonus = 0)
        {
            double skill = Js.Clamp(RoundJs(Between(P("staff.skillMin"), P("staff.skillMax")) + stage * P("staff.skillStage") + Mod("hireSkill") + (A.N("net") - 5) * P("staff.skillNet") + rep / P("staff.skillRepDiv") + bonus), 1, 10);
            string? quirk = Random() < P("staff.quirkOdds") ? Pick(D("STAFF_QUIRKS").Entries().Select(p => p.Key).ToArray()) : null;
            var names = D("NAMES")[Region]!;
            string Part(string key) => (string)Pick(((JsonArray)names[key]!).ToArray())!;
            string name = Part("a") + (Region == "sz" ? "" : " ") + Part("b");
            double salary = FixedNumber((P("staff.pay0") + P("staff.paySkill") * skill * skill) * D("ROLES")[role].N("pay") * D("STAFF_QUIRKS")[quirk ?? ""].N("pay", 1), 1);
            return Obj(("uid", "e" + uid++), ("name", name), ("role", role), ("skill", skill), ("quirk", quirk), ("salary", salary), ("since", t));
        }
        private void RefreshCandidates(double bonus = 0)
        {
            string[] roles = Company.Route == "model" ? new[] { "res", "res", "eng", "eng", "ops", "biz", "legal" } : new[] { "eng", "eng", "ops", "ops", "biz", "res", "legal" };
            var cands = new JsonArray();
            for (int i = 0; i < P("staff.cands"); i++) cands.Add(GenStaff(Pick(roles), bonus));
            Snapshot["cands"] = cands;
        }
        private bool HasHeat => tables.Books.TryGetValue(Ideo.Str("v"), out var book) && book["VER"]!["heat"].On("on");
        private void IdeologyMonth()
        {
            if (Ideo == null && !Flag("ideoBlocked") && ideoAt != 0 && t >= ideoAt)
            {
                if (t > P("ideo.entry.last")) ideoAt = 0;
                else if (stage < P("ideo.entry.stage")) ideoAt = t + P("ideo.entry.delay");
                else { ideoAt = 0; QueueEvent("ideo_entry"); }
            }
            var ideology = Ideo;
            if (ideology == null) return;
            bool on = ideology.On("on"), red = ideology.Str("result") == "red";
            string version = ideology.Str("v", Region == "bay" ? "us" : "cn");
            foreach (var e in Rows("staff").Where(e => !e.On("rc")))
            {
                e["rc"] = 1;
                double p = red ? P("ideo.newRed.red") : on ? ideology.N("red") / P("ideo.newRed.div") : 0;
                if (p != 0 && Random() < p) e["red"] = 1;
            }
            if (Flag("yank"))
            {
                int n = 0;
                foreach (var role in D("ROLES").Entries())
                {
                    var team = Rows("staff").Where(e => e.Str("role") == role.Key).ToArray();
                    if (team.Length < P("ideo.yank.minDept")) continue;
                    List("staff").Remove(team.OrderBy(Output).ThenBy(e => e.N("skill")).First());
                    var replacement = GenStaff(role.Key, 1);
                    replacement["rc"] = 1;
                    List("staff").Add(replacement);
                    n++;
                }
                if (n > 0) News(tables.Text("ideo.yank.month", version == "us", ("人数", n)));
            }
            if (!HasHeat) return;
            double heat = ideology.N("heat");
            if (ideology.Str("result") == "fail") { ideology["heat"] = Max(0, heat - P("ideo.heat.failDecay")); return; }
            if (!on && !red) return;
            double rise = on ? P("ideo.heat.rise") + Max(0, ideology.N("red") - P("ideo.heat.redFrom")) * P("ideo.heat.redK") - Max(0, ideology.N("cap") - P("ideo.heat.capFrom")) * P("ideo.heat.capK") :
                heat < P("ideo.heat.afterCap") ? P("ideo.heat.after") : 0;
            ideology["heat"] = heat = Js.Clamp(heat + rise, 0, 100);
            if (on && heat >= P("ideo.heat.half") && ideology.N("red") > ideology.N("cap"))
            {
                ideology["red"] = Max(0, ideology.N("red") - P("ideo.heat.grind"));
                var reds = Rows("staff").Where(e => e.On("red")).ToArray();
                if (reds.Length > 0 && Random() < P("ideo.heat.unrose")) { ((JsonObject)Pick(reds)).Remove("red"); News(tables.Text("ideo.heat.news", version == "us")); }
            }
            if (Random() < (on ? P("ideo.heat.scare") + heat / P("ideo.heat.scareDiv") : heat / P("ideo.heat.scareAfterDiv")))
            {
                var events = (JsonArray?)tables.Books[version]["SCARE_EVENTS"];
                var pool = events?.Where(e => Condition(e!["when"]) && t - Map("seen").N(e.Str("id"), -99) >= P("ideo.heat.scareCd")).ToArray();
                if (pool != null && pool.Length > 0) QueueEvent(Pick(pool).Str("id"));
            }
        }
    }
}
