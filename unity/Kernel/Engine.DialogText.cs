using System;
using System.Linq;
using System.Text.Json.Nodes;
using static System.Math;
using static Liandan.Kernel.Js;

namespace Liandan.Kernel
{
    public sealed partial class GameState
    {
        private string Money(double value, bool sign = false)
        {
            double n = Abs(value);
            string amount = n >= 10000 ? Fixed(n / 10000, n >= 1e6 ? 0 : n >= 1e5 ? 1 : 2) + Tx("unit.yi") :
                (n >= 100 ? RoundJs(n) : FixedNumber(n, 1)) + Tx("unit.wan");
            return (value < 0 ? "-" : sign ? "+" : "") + D("REGIONS")[Region].Str("cur") + amount;
        }
        private string UsersText(double n) => n >= 10000 ? Fixed(n / 10000, 2) + Tx("unit.yi") :
            (n >= 100 ? RoundJs(n) : FixedNumber(n, 1)) + Tx("unit.wan");
        private string AttrName(string id) => ((JsonArray)D("ATTRS")).First(a => a.Str("id") == id).Str("name");
        private string ChipName(string k) => tables.Text("chip." + k, (k == "red" || k == "capb") && Ideo.Str("v") == "us");
        private static readonly string[] ChipKeys = "cash hype rep morale reg bubble users quality equity quota tech bench dirt proj staff ap perks red capb heat".Split(' ');
        private double[] ChipValues() => new[] {cash,hype,rep,morale,reg,bubble,users+fake,quality,equity,Quota,Snapshot.On("ownModel") ? Cap(BaseE+E) : 0,
            Model.N("bench"),List("dirt").Count,List("projects").Count,List("staff").Count,apNext,List("perks").Count,Ideo.N("red"),Ideo.N("cap"),Ideo.N("heat")};
        private JsonArray Chips(double[] before)
        {
            var result = new JsonArray();
            var after = ChipValues();
            for (int i = 0; i < after.Length; i++)
            {
                double d = after[i] - before[i];
                string k = ChipKeys[i], sign = d > 0 ? "+" : "";
                double threshold = k == "cash" || k == "users" ? 0.05 : k == "tech" || k == "bench" ? 0.1 : 0.5;
                if (Abs(d) < threshold) continue;
                string v = k switch
                {
                    "cash" => Money(d, true),
                    "users" => (d > 0 ? "+" : "-") + UsersText(Abs(d)),
                    "equity" => sign + Fixed(d, 1) + "%",
                    "tech" => sign + Fixed(d, 1),
                    "bench" => sign + Fixed(d, 1),
                    _ => sign + (RoundJs(d) + 0.0)
                };
                bool? good = k switch { "bubble" => null, "proj" => null, "red" => null, "capb" => null, "reg" => d < 0, "dirt" => d < 0, "heat" => d < 0, _ => d > 0 };
                result.Add(Obj(("k", k), ("name", ChipName(k)), ("v", v), ("good", good)));
            }
            return result;
        }
        private JsonArray FxLines(JsonNode? fx)
        {
            var result = new JsonArray();
            string Signed(double n) => (n > 0 ? "+" : "") + (RoundJs(n * 10) / 10 + 0.0);
            void Line(string key, bool? good, params (string, object)[] vars) => result.Add(new JsonArray(Tx("fx." + key, vars), good));
            void Gauge(string key, double n, bool? good) => Line("gauge", good, ("名称", ChipName(key)), ("值", Signed(n)));
            foreach (var pair in fx.Entries())
            {
                string k = pair.Key;
                var v = pair.Value!;
                double n = fx.N(k);
                switch (k)
                {
                    case "cash": case "cashAbs": Line("cash", n > 0, ("值", Money(k == "cash" ? n * Unit : n, true))); break;
                    case "rep": case "hype": case "morale": case "quality": case "tech": Gauge(k, n, n > 0); break;
                    case "heat": case "reg": Gauge(k, n, n < 0); break;
                    case "bubble": Gauge(k, n, null); break;
                    case "usersPct":
                    case "equity":
                    case "ap":
                    case "quota":
                    case "bench":
                        Line(k == "usersPct" ? "users" : k, k == "bench" ? (bool?)null : n > 0, ("值", Signed(n))); break;
                    case "attr": foreach (var a in v.Entries()) Line("attr", (double)a.Value! > 0, ("属性", AttrName(a.Key)), ("值", Signed((double)a.Value!))); break;
                    case "dirt":
                        string type = v is JsonObject ? v.Str("type") : v.ToString();
                        Line(k, false, ("黑料", v is JsonObject && v.On("name") ? v.Str("name") : D("DIRT")[type].Str("name", type))); break;
                    case "cleanDirt": case "perk": Line(k, true); break;
                    case "expose": Line(k, false); break;
                    case "project": Line(k, null, ("项目", v.Str("name"))); break;
                    case "end": Line(k, null); break;
                    case "staff": Line(tables.Texts["fx.staff." + v] != null ? "staff." + v : "staff.gain", !v.ToString().StartsWith("lose", StringComparison.Ordinal)); break;
                    case "temp":
                        foreach (var tm in Values(v))
                        {
                            string mod = tm.Str("key");
                            bool mult = tm["mult"] != null, up = mult ? tm.N("mult") > 1 : tm.N("add") > 0;
                            bool inverse = new[] { "costMult", "salaryMult", "gpuPriceMult", "exposeMult", "apiCostMult", "churnAdd" }.Contains(mod);
                            Line(k, inverse ? !up : up, ("修正", D("MOD_NAME").Str(mod, mod)), ("值", mult ? "×" + tm.N("mult") : Signed(tm.N("add"))), ("月", tm.N("months", P("fx.tempMonths"))));
                        }
                        break;
                    case "ideo": foreach (string bar in new[] { "red", "cap" }) if (v.On(bar)) Gauge(bar == "cap" ? "capb" : bar, v.N(bar), null); break;
                }
            }
            return result;
        }
    }
}
