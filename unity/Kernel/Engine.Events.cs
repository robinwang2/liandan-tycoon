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
        private double Expose(JsonNode d) => P("dirt.expose") * (d.N("sev") / P("dirt.sevDiv")) * (1 + hype / P("dirt.hypeDiv")) * (1 + Min(P("dirt.usersMax"), users / P("dirt.usersDiv"))) * Mod("exposeMult") * (1 + P("dirt.bigMouth") * Rows("staff").Count(e => e.Str("quirk") == "dazui")) / (1 + Power("legal") / P("dirt.legalDiv"));

        private void MonthEvents(List<(string id, JsonNode? ctx)> completed)
        {
            var cd = Map("cd");
            if (cash < 0)
            {
                if (Rows("perks").Any(e => e.ToString() == "phoenix") && !Flag("phoenixUsed"))
                {
                    Map("flags")["phoenixUsed"] = 1;
                    cash = P("perk.phoenixMonths") * Unit;
                    List("fxq").Add(new JsonArray("money"));
                    News(Tx("news.phoenix"));
                }
                else if (Flag("revive"))
                {
                    Map("flags").Remove("revive");
                    cash = P("meta.reviveMonths") * Unit;
                    News(Tx("news.revive"));
                }
                else List("q").Add(Obj(("type", "event"), ("id", "broke")));
            }
            foreach (var d in Rows("dirt"))
            {
                if (t - d.N("t") < P("dirt.hideMonths") || Random() >= Expose(d)) continue;
                List("q").Add(Obj(("type", "scandal"), ("uid", d["uid"])));
                break;
            }
            foreach (var e in Rows("sched").Where(e => e.N("at") <= t).ToArray())
            {
                Map("seen")[e.Str("id")] = t;
                List("q").Add(Obj(("type", "event"), ("id", e["id"]), ("ctx", ((JsonObject)e).ContainsKey("ctx") ? e["ctx"] : Undefined)));
                List("sched").Remove(e);
            }
            if (t % 12 == 1) QueueEvent("year_board");
            if (OptionalRecord("vam") is JsonObject vam && t >= vam.N("due")) QueueEvent("vam_due");
            if (reg >= P("reg.max") && !cd.On("crack")) { cd["crack"] = t + P("reg.crackCd"); QueueEvent("crackdown"); }
            if (burstT == 0 && t > P("bubble.burstFrom") && ((bubble >= P("bubble.burstLine") && Random() < P("bubble.burstOdds")) || (t >= P("bubble.lateFrom") && Random() < P("bubble.lateOdds")))) QueueEvent("bubble_burst");
            if (stage >= P("coup.stage") && !cd.On("coup") && ((equity < P("coup.equity") && (rep < P("coup.rep") || morale < P("coup.morale") || exposed >= P("coup.exposed")) && Random() < P("coup.odds")) || (equity < P("coup.equityLow") && Random() < P("coup.lowOdds"))))
            { cd["coup"] = t + P("coup.cd"); QueueEvent("coup"); }
            if (stage >= P("acq.stage") && !cd.On("acq") && Random() < P("acq.odds") + (hype > P("acq.hypeLine") ? P("acq.hypeOdds") : 0))
            {
                cd["acq"] = t + P("acq.cd");
                var rivals = Rows("rivals");
                if (Flag("red") || Flag("rose"))
                {
                    var ids = (JsonArray)D(Flag("red") ? "EAST_RIVALS" : "ROSE_RIVALS");
                    rivals = rivals.Where(r => ids.Any(id => (string)id! == r.Str("id")));
                }
                else rivals = rivals.Take((int)P("acq.rivals"));
                QueueEvent("acq_offer", Obj(("rival", Pick(rivals.ToArray())["id"])));
            }
            foreach (var e in completed) QueueEvent(e.id, e.ctx);
            int count = Snapshot["tut"].On("on") && t <= P("event.tutQuiet") ? 0 :
                (Random() < P("event.odds1") ? 1 : 0) + (t > P("event.odds2From") && Random() < P("event.odds2") ? 1 : 0);
            for (int i = 0; i < count; i++)
            {
                var pool = tables.Pool.Where(e => Condition(e["when"]) && (e["once"] is JsonValue once && !(bool)once ?
                    t - Map("seen").N(e.Str("id"), -99) >= e.N("cd", P("event.cd")) : !Map("seen").On(e.Str("id")))).ToArray();
                if (pool.Length == 0) continue;
                double Weight(JsonNode e) => e.N("weight", 1) * (e.Str("cat") == Snapshot.Str("lastCat") ? P("event.sameCat") : 1);
                double x = Random() * pool.Sum(Weight);
                var ev = pool.FirstOrDefault(e => (x -= Weight(e)) < 0) ?? pool[0];
                Snapshot["lastCat"] = ev.Str("cat");
                QueueEvent(ev.Str("id"));
            }
        }
        private bool Condition(JsonNode? when)
        {
            foreach (var pair in when.Entries())
            {
                var key = pair.Key;
                var v = pair.Value!;
                if (key.EndsWith("Min", StringComparison.Ordinal) || key.EndsWith("Max", StringComparison.Ordinal))
                {
                    string field = key.Substring(0, key.Length - 3);
                    double x = field switch
                    {
                        "users" => users + fake,
                        "dirt" => DirtTotal,
                        "staff" => List("staff").Count,
                        "rank" => Rank,
                        "runway" => Runway(),
                        "office" => Company.Office,
                        "red" => Ideo.N("red"),
                        "cap" => Ideo.N("cap"),
                        "heat" => Ideo.N("heat"),
                        "t" => t,
                        "stage" => stage,
                        "hype" => hype,
                        "rep" => rep,
                        "morale" => morale,
                        "reg" => reg,
                        "bubble" => bubble,
                        "equity" => equity,
                        "gpu" => gpu,
                        _ => double.NaN
                    };
                    if (key.EndsWith("Min", StringComparison.Ordinal) ? x < (double)v : x > (double)v) return false;
                }
                var values = v is JsonArray arr ? arr.Select(n => n!.ToString()) : new[] { v.ToString() };
                switch (key)
                {
                    case "region": case "route": if (Co.Str(key) != v.ToString()) return false; break;
                    case "track": if (!values.Contains(Co.Str(key))) return false; break;
                    case "ownModel": if (Snapshot.On(key) != (bool)v) return false; break;
                    case "hasDirt": if (!Rows("dirt").Any(d => d.Str("type") == v.ToString())) return false; break;
                    case "hasRole": if (!Rows("staff").Any(e => e.Str("role") == v.ToString())) return false; break;
                    case "flag": if (!values.All(Flag)) return false; break;
                    case "notFlag": if (values.Any(Flag)) return false; break;
                    case "policy": if (v.Entries().Any(p => Map("policies").Str(p.Key) != p.Value!.ToString())) return false; break;
                    case "cash": if (cash < (double)v * Unit) return false; break;
                    case "attr": if (v.Entries().Any(p => A.N(p.Key) < (double)p.Value!)) return false; break;
                }
            }
            return true;
        }
        private void QueueEvent(string id, JsonNode? supplied = null)
        {
            if (!tables.Events.TryGetValue(id, out var e)) return;
            var ctx = new JsonObject();
            if (e.On("rival") || tables.RivalContext.Contains(id))
            {
                ctx["rival"] = e.Str("rival", "random") switch
                {
                    "top" => Rows("rivals").OrderByDescending(r => r.N("bench")).First().Str("id"),
                    "upstream" => Snapshot.Str("upstream"),
                    "random" => Pick(Rows("rivals").ToArray()).Str("id"),
                    _ => e.Str("rival")
                };
            }
            var pool = Rows("staff").Where(s => !e["when"].On("hasRole") || s.Str("role") == e["when"].Str("hasRole")).ToArray();
            if (pool.Length > 0)
            {
                var member = id.Contains("poach") ? pool.OrderByDescending(s => s.N("skill")).First() : Pick(pool);
                ctx["staff"] = member.Str("uid");
                ctx["staffName"] = member.Str("name");
            }
            if (supplied is JsonObject o && !o.ContainsKey("$js"))
                foreach (var p in o) ctx[p.Key] = p.Value?.DeepClone();
            Map("seen")[id] = t;
            Map("stats")["events"] = Map("stats").N("events") + 1;
            List("q").Add(Obj(("type", "event"), ("id", id), ("ctx", ctx)));
        }
    }
}
