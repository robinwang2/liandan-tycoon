using System;
using System.Linq;
using System.Text.Json.Nodes;
using static System.Math;
using static Liandan.Kernel.Js;

namespace Liandan.Kernel
{
    public sealed partial class GameState
    {
        private Dialog? RaiseDialog(JsonNode action, out JsonObject? failure)
        {
            failure = null;
            var p = action["p"];
            double val = Valuation(), pf = Performance();
            bool winter = burstT != 0 && t - burstT < p.N("寒冬月数");
            if (pf < p.N("失败线") || winter && Random() < p.N("寒冬失败率"))
            {
                Snapshot["lastRaiseT"] = t - (p.N("间隔") - p.N("失败后再等"));
                failure = Obj(("ok", false), ("text", ActionText(winter ? "raise.fail.winter" : "raise.fail.weak")));
                return null;
            }
            int k = (int)stage + 1;
            var stages = (JsonArray)D("STAGES");
            double target = Max((users + fake) * p.N("对赌倍数"), stages[Min(stages.Count - 1, k + 1)].N("users") * p.N("对赌下限"));
            bool red = Flag("red"), rose = Flag("rose");
            var vcs = (JsonArray)D(red ? "INVESTORS_EAST" : rose ? "INVESTORS_PROGRESSIVE" : "INVESTORS");
            var ids = (JsonArray)D(red ? "EAST_RIVALS" : rose ? "ROSE_RIVALS" : "INVEST_RIVALS");
            var rv = Pick(Rows("rivals").Where(r => ids.Any(n => n!.ToString() == r.Str("id"))).ToArray());
            bool weak = pf < p.N("流血线");
            string prefix = weak ? "raise.weak" : "raise.offers";
            var d = ActionWindow(prefix, "money", ActionText(prefix + ".text", ("业绩", Fixed(pf, 2)), ("估值", Money(val))), ActionText(prefix + ".title", ("轮次", stages[k].Str("name"))));
            void Offer(JsonNode o)
            {
                string label = o.Str("label").Replace("{对手}", rv.Str("name"));
                if (label.Contains("{机构}")) label = label.Replace("{机构}", Pick(vcs.ToArray())!.ToString());
                string note = tables.FillRuntime(o.Str("note"), o, ("目标", UsersText(target)));
                double valuation = val * o.N("vk"), share = o.N("share"), sum = valuation * share;
                string hint = ActionText(note.Length > 0 ? "raise.hint.note" : "raise.hint", ("估值", Money(valuation)), ("出让", RoundJs(share * 100)), ("到账", Money(sum)), ("备注", note));
                d.Add(Obj(("label", label), ("hint", hint)), () =>
                {
                    if (o.Str("fn") == "vam") Snapshot["vam"] = Obj(("due", t + o["p"].N("期限")), ("target", target));
                    ApplyEffects(o["fx"], Obj(("rival", rv["id"])));
                    var rounds = (JsonArray)(Map("stats")["rounds"] ??= new JsonArray());
                    rounds.Add(t); cash += sum; equity *= 1 - share; stage++; Snapshot["lastRaiseT"] = t; raiseBoost = 0;
                    Map("stats")["raised"] = Map("stats").N("raised") + sum;
                    ApplyEffects(action["fx"], new JsonObject()); List("q").Add(Obj(("type", "draft"))); List("fxq").Add(new JsonArray("money"));
                    string round = stages[(int)stage].Str("name");
                    News(ActionText("raise.news", ("公司", Company.Name), ("轮次", round), ("机构", label.Split('：')[0]), ("金额", Money(sum)), ("估值", Money(valuation))));
                    return Said(ActionText("raise.done", ("轮次", round), ("金额", Money(sum))));
                });
            }
            var rows = ((JsonArray)tables.Actions["OFFERS"]!).Where(o => Condition(o!["when"])).ToList();
            Offer(rows.First(o => o.Str("kind") == (weak ? "流血" : "固定"))!);
            var pool = rows.Where(o => o.Str("kind") == "随机").ToList();
            while (!weak && d.Options.Count < p.N("报价份数") && pool.Count > 0) { var o = Pick(pool)!; pool.Remove(o); Offer(o); }
            return d;
        }
        private Dialog ReleaseDialog(JsonNode p)
        {
            double cap = Cap(BaseE + E) + Between(p.N("能力波动下限"), p.N("能力波动上限")) + (A.N("luck") - 5) * p.N("每点运气");
            double top = Rows("rivals").Max(r => r.N("bench")), bonus = Mod("benchAdd");
            var first = ActionWindow("release.bench", "tech", ActionText("release.bench.text", ("能力", Fixed(cap, 1)), ("现役", Model != null ? Fixed(Model.N("cap"), 1) : ActionText("release.none")), ("榜首", Fixed(top, 1))));
            foreach (string mode in new[] { "honest", "tune", "leak" })
                first.Add(Obj(("label", ActionText("release." + mode)), ("hint", ActionText("release." + mode + ".hint"))), () =>
                {
                    double infl = mode == "honest" ? 0 : mode == "tune" ? Between(p.N("小注水下限"), p.N("小注水上限")) : Between(p.N("大注水下限"), p.N("大注水上限"));
                    string? dirt = mode == "honest" ? null : mode == "tune" ? "bench_overfit" : "bench_fake";
                    var next = ActionWindow("release.launch", "tech", ActionText("release.launch.text", ("跑分", Fixed(cap + infl + bonus, 1)), ("榜首", Fixed(top, 1))));
                    foreach (string style in new[] { "quiet", "event", "hungry" })
                    {
                        double vol = p.N(style == "quiet" ? "低调声量" : style == "event" ? "发布会声量" : "饥饿声量"), cost = style == "event" ? p.N("发布会花费") : 0, change = style == "hungry" ? p.N("饥饿口碑") : 0;
                        var o = Obj(("label", ActionText("release." + style)), ("hint", ActionText("release." + style + ".hint", ("声量", vol), ("花费", Money(cost * Unit)), ("口碑", change))));
                        if (style == "event") { o["disabled"] = cash < cost * Unit; o["why"] = ActionText("common.noCash"); }
                        next.Add(o, () => Launch(p, cap, infl, dirt, vol, cost, change));
                    }
                    first.Next = next; return Obj(("dialog", next.View));
                });
            return first;
        }
        private JsonObject Launch(JsonNode p, double cap, double infl, string? dirt, double volume, double cost, double repChange)
        {
            cash -= cost * Unit;
            double ver = Model.N("ver") + 1, bench = cap + infl + Mod("benchAdd");
            string name = Company.ModelName + "-" + ver;
            Snapshot["model"] = Obj(("cap", cap), ("bench", bench), ("ver", ver), ("name", name), ("infl", infl));
            if (dirt != null) AddDirt(dirt);
            Snapshot["lastReleaseT"] = t;
            int rank = Rank;
            ApplyEffects(Obj(("hype", (double)p["名次热度"]![rank - 1]! * volume), ("usersPct", (p.N("名次用户基数") - rank) * p.N("每名次用户") * volume),
                ("rep", (infl == 0 && rank <= p.N("前排") ? p.N("老实加口碑") : 0) + repChange)), new JsonObject());
            List("fxq").Add(new JsonArray("release")); if (rank <= p.N("撒花名次")) List("fxq").Add(new JsonArray("confetti"));
            News(ActionText("release.news", ("公司", Company.Name), ("模型", name), ("跑分", Fixed(bench, 1)), ("名次", rank)));
            if (cap >= P("AGI_CAP")) List("q").Add(Obj(("type", "event"), ("id", "agi")));
            string tail = ActionText(infl > p.N("多注水线") ? "release.tail.heavy" : infl > 0 ? "release.tail.light" : "release.tail.honest");
            return Said(ActionText(rank == 1 ? "release.done.top1" : rank <= p.N("前排") ? "release.done.top3" : "release.done.other", ("模型", name), ("名次", rank)) + tail);
        }
    }
}
