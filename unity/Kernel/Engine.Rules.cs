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
        public static double NextRandom(ref int state)
        {
            unchecked
            {
                uint bits = (uint)state + 0x6D2B79F5u;
                state = (int)bits;
                bits = (bits ^ (bits >> 15)) * (bits | 1u);
                bits ^= bits + (bits ^ (bits >> 7)) * (bits | 61u);
                return (bits ^ (bits >> 14)) / 4294967296.0;
            }
        }
        private double Random()
        {
            int state = (int)rs;
            double sample = NextRandom(ref state);
            rs = state;
            return sample;
        }
        public double ReadBotValue(string key) => key switch
        {
            "runway" => Runway(), "gpuPrice" => gpuBase * Mod("gpuPriceMult"),
            "teamCap" => D("OFFICES")[(int)Company.Office].N("cap") + Max(0, A.N("mgmt") - 5) + Mod("teamCapAdd"),
            "quota" => Quota, "inferNeed" => InferNeed, _ => throw new ArgumentException(key)
        };
        private double Between(double a, double b) => a + Random() * (b - a);
        private double Integer(double a, double b) => a + Floor(Random() * (b - a + 1));
        private T Pick<T>(IReadOnlyList<T> list) => list[(int)Floor(Random() * list.Count)];
        private double Mod(string key)
        {
            bool mult = key.EndsWith("Mult", StringComparison.Ordinal);
            double value = mult ? 1 : 0;
            void Add(JsonNode? mods)
            {
                if (mods?[key] is JsonValue n) value = mult ? value * (double)n : value + (double)n;
            }
            Add(D("REGIONS")[Region]!["mods"]);
            void Items(JsonArray ids, Dictionary<string, JsonNode> defs)
            {
                foreach (var id in ids) if (defs.TryGetValue((string)id!, out var row)) Add(row["mods"]);
            }
            Items(Founder.Traits, tables.Traits);
            Items(List("perks"), tables.Perks);
            Items(List("feats"), tables.Features);
            foreach (var pol in Map("policies").Entries()) Add(D("POLICIES")[pol.Key]!["opts"]![pol.Value!.ToString()]?["mods"]);
            if (Ideo.On("goal")) Add(D("GOALS")[Ideo.Str("goal")]?["mods"]);
            foreach (var flag in D("IDEO_FLAG_MODS").Entries()) if (Flag(flag.Key)) Add(flag.Value);
            foreach (var tm in Rows("temp").Where(tm => tm.Str("key") == key))
                value = mult ? value * tm.N("mult", 1) : value + tm.N("add");
            if (key == "devMult" && Company.Route == "app") value *= P("dev.appMult");
            if (HasHeat && Ideo.On("heat"))
            {
                if (key == "raiseMult") value *= 1 - Ideo.N("heat") / P("ideo.heat.raiseDiv");
                if (key == "b2bMult") value *= 1 - Ideo.N("heat") / P("ideo.heat.b2bDiv");
            }
            return value;
        }
        private double Cap(double energy) => P("model.capK") * JsMath.Log2(1 + energy / P("model.capE0"));
        private double Energy(double cap) => P("model.capE0") * (JsMath.Pow(2, cap / P("model.capK")) - 1);
        private double FrontierE(double month) => P("rival.frontierE0") * JsMath.Pow(P("rival.frontierGrowth"), (month - 1) / 12);
        private double Frontier(double month) => Cap(FrontierE(month));
        private double BaseE => FrontierE(t) / P("model.baseDiv");
        private double Output(JsonNode e) => e.N("skill") * D("STAFF_QUIRKS")[e.Str("quirk")].N("out", 1);
        private double Power(string role)
        {
            double p = Staff.Where(e => e.Role == role).Sum(e => e.Skill * D("STAFF_QUIRKS")[e.Quirk ?? ""].N("out", 1));
            string attr = role switch { "res" => "tech", "eng" => "tech", "ops" => "cha", "legal" => "net", "biz" => "biz", _ => throw new ArgumentException(role) };
            double founder = A.N(attr) * P("staff.self" + char.ToUpperInvariant(role[0]) + role.Substring(1));
            return (p * (P("staff.morale0") + P("staff.moraleK") * morale / 100) + founder) * Mod("outputMult");
        }
        private double ResearchEff => (1 + Power("res") / P("model.resDiv")) * (1 + P("model.techK") * (A.N("tech") - 5)) * JsMath.Pow(Mod("researchMult"), P("model.resModExp"));
        private double UpCap => Rows("rivals").FirstOrDefault(r => r.Str("id") == Snapshot.Str("upstream")).N("cap", 30) - P("app.upLag");
        private bool UsesOwn => Model != null && (Company.Route == "model" || Model.N("cap") >= UpCap - P("app.ownGap"));
        private double UsedCap => UsesOwn ? Model.N("cap") : UpCap;
        private int Rank => Model == null ? 99 : 1 + Rows("rivals").Count(r => r.N("bench") >= Model.N("bench"));
        private double QuotaFloor => quotaBase * JsMath.Pow(P("gpu.quotaGrowth"), Max(1, t) - 1);
        private double Quota => RoundJs((QuotaFloor + quotaEarn) * (1 + quotaAdd) * Mod("quotaMult"));
        private double BrainGpu => Flag("bci_ok") && Snapshot.On("ownModel") ? RoundJs(Rows("staff").Aggregate(0.0, (a, e) => a + P("bci.gpuBase") + e.N("skill")) * (1 + t / P("bci.growMonths"))) : 0;
        private double InferNeed => UsesOwn ? Ceiling(users * Track.N("infer") * Mod("inferMult")) : 0;
        private double RelativeCap => Js.Clamp((UsedCap - (Frontier(t) - P("model.relGap"))) / P("model.relSpan"), 0, P("model.relMax"));
        private void GrowUsers()
        {
            double ops = Power("ops"), gm = Track.N("growth") * JsMath.Pow(Mod("growthMult"), P("users.growModExp")) * (reg >= P("reg.high") ? P("reg.growthMult") : 1);
            double rel = RelativeCap;
            double attract = P("users.attract0") + P("users.attractQ") * quality / 100 + P("users.attractHype") * hype / 100 + P("users.attractModel") * rel + Min(P("users.opsMax"), ops / P("users.opsDiv"));
            double share = P("share.base") + P("share.quality") * quality / 100 + P("share.model") * rel + P("share.hype") * hype / 100;
            double market = Track.N("cap") * Min(1, P("market.start") * JsMath.Pow(P("market.growth"), t));
            double room = Max(0, 1 - users / (share * market));
            double churn = Max(P("users.churnMin"), P("users.churn0") + P("users.churnRep") * (1 - rep / 100) + Mod("churnAdd") + outage * P("users.churnOutage"));
            double seed = (P("users.seed0") + hype / P("users.seedHype") + ops / P("users.seedOps") + quality / P("users.seedQ")) * gm * (P("users.seedT0") + t / P("users.seedTMonths")) * (1 - outage);
            users = Max(0, users * (1 + attract * gm * room * (1 - outage) - churn) + seed * room);
            fake *= P("users.fakeDecay");
        }
        private double GpuRent(double n)
        {
            double q = Max(1, Quota), price = ReadBotValue("gpuPrice"), x = Max(0, n - q);
            return (n - x) * price + x * price * (P("gpu.over0") + x / (P("gpu.overDiv") * q));
        }
        private JsonObject Costs()
        {
            double salary = Staff.Sum(e => e.Salary) * Mod("salaryMult");
            double rent = D("OFFICES")[(int)Company.Office].N("rent") * Mod("rentMult");
            double g = GpuRent(gpu);
            var furnace = Snapshot["furnace"];
            if (furnace.On("on") && furnace.Str("data") == "buy") g *= P("furnace.buyMult");
            double api = UsesOwn ? 0 : users * Track.N("infer") * P("cost.apiPerUser") * apiIdx * Mod("apiCostMult") * (Flag("bci_ok") ? P("bci.apiMult") : 1);
            double misc = P("cost.misc") + List("staff").Count * P("cost.miscStaff") + users * P("cost.miscUser");
            double k = Mod("costMult") * (reg >= P("reg.high") ? P("reg.costMult") : 1);
            return Obj(("salary", salary * k), ("rent", rent * k), ("gpu", g * k), ("api", api * k), ("misc", misc * k), ("total", (salary + rent + g + api + misc) * k));
        }
        private double RankFactor(string key, string fallback)
        {
            var factors = (JsonArray)tables.Parameters[key]!;
            return Rank <= factors.Count ? (double)factors[Rank - 1]! : P(fallback);
        }
        private JsonObject Revenue()
        {
            double rm = JsMath.Pow(Mod("revMult"), P("rev.modExp")) * (1 + P("rev.bizK") * (A.N("biz") - 5));
            double pay = (P("rev.pay0") + quality / P("rev.payQDiv")) * (P("rev.payRep0") + rep / P("rev.payRepDiv"));
            double sub = users * Track.N("arpu") * pay * JsMath.Pow(Mod("payMult"), P("rev.payModExp")) * rm;
            double api = Model != null && Snapshot.On("ownModel") ? P("rev.api0") * JsMath.Pow(P("rev.apiGrowth"), t) * RankFactor("rev.apiByRank", "rev.apiRankElse") * rm : 0;
            double b2b = Power("biz") * P("rev.b2bK") * (P("rev.b2bCap0") + UsedCap / 100) * (1 + t / P("rev.b2bGrowMonths")) * Mod("b2bMult") * rm;
            return Obj(("sub", sub), ("api", api), ("b2b", b2b), ("total", sub + api + b2b));
        }
        private double Unit => Max(P("money.unitMin"), Costs().N("total"));
        private double Runway()
        {
            double net = Revenue().N("total") - Costs().N("total");
            return net >= 0 ? 99 : Max(0, cash) / -net;
        }
        private double Performance()
        {
            var stages = (JsonArray)D("STAGES");
            var tg = stages[Min(stages.Count - 1, (int)stage + 1)];
            var scores = new[] { Js.Clamp((users+fake)/tg.N("users"),0,P("perf.max")), Js.Clamp(Revenue().N("total")/tg.N("rev"),0,P("perf.max")),
                Model == null ? 0 : RankFactor("perf.techByRank","perf.techElse") * (Company.Route == "model" ? 1 : P("perf.appTech")) }.OrderByDescending(v => v).ToArray();
            var weights = tables.Parameters["perf.w"]!;
            return P("perf.base") + (double)weights[0]! * scores[0] + (double)weights[1]! * scores[1] + (double)weights[2]! * scores[2];
        }
        private double Valuation()
        {
            var stages = (JsonArray)D("STAGES");
            var tg = stages[Min(stages.Count - 1, (int)stage + 1)];
            return tg.N("base") * Performance() * (P("val.bubble0") + bubble / 100) * (1 + hype / P("val.hypeDiv")) * (1 + P("val.chaK") * (A.N("cha") - 5)) * Mod("raiseMult") * (1 + raiseBoost);
        }
    }
}
