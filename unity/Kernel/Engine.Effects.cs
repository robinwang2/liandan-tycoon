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
        private static IEnumerable<JsonNode> Values(JsonNode value) => value is JsonArray list ? list.Select(n => n!) : new[] { value };

        private void ApplyEffects(JsonNode? effects, JsonObject ctx)
        {
            foreach (var effect in effects.Entries())
            {
                string key = effect.Key;
                var v = effect.Value!;
                double Number() => (double)v;
                double Soft(double amount) => amount > 0 ? amount * Js.Clamp(P("gauge.soft0") - Snapshot.N(key) / 100, P("gauge.softMin"), 1) : amount;
                void Gauge(double delta) => Snapshot[key] = Js.Clamp(Snapshot.N(key) + delta, 0, key == "reg" ? P("reg.max") : 100);
                switch (key)
                {
                    case "cash": cash += Number() * Unit; break;
                    case "cashAbs": cash += Number(); break;
                    case "rep": case "morale": Gauge(Soft(Number())); break;
                    case "hype": Gauge(Number() > 0 ? Soft(Number()) * Mod("hypeGainMult") : Number()); break;
                    case "reg": Gauge(Number() > 0 ? Number() * Mod("regMult") : Number()); break;
                    case "quality": case "bubble": case "equity": Gauge(Number()); break;
                    case "usersPct": users = Max(0, users * (1 + Number() / 100)); break;
                    case "tech":
                        if (Snapshot.On("ownModel"))
                        {
                            E = Max(0, Energy(Cap(BaseE + E) + Number()) - BaseE);
                            if (Model != null) { Model["cap"] = Model.N("cap") + Number(); Model["bench"] = Model.N("bench") + Number(); }
                        }
                        else quality = Js.Clamp(quality + Number() * P("fx.techQuality"), 0, 100);
                        break;
                    case "bench":
                        if (Model != null) { Model["bench"] = Model.N("bench") + Number(); Model["infl"] = Model.N("infl") + Number(); }
                        break;
                    case "quota": quotaAdd = Max(P("gpu.quotaAddMin"), quotaAdd + Number() / 100); break;
                    case "ap": apNext += Number(); break;
                    case "attr":
                        foreach (var a in v.Entries()) A[a.Key] = Js.Clamp(A.N(a.Key) + (double)a.Value!, 1, 15);
                        break;
                    case "dirt": AddDirt(v is JsonObject ? v.Str("type") : v.ToString(), v as JsonObject); break;
                    case "cleanDirt":
                        if (v.ToString() == "all") List("dirt").Clear();
                        else if (v.ToString() == "random") { if (List("dirt").Count > 0) List("dirt").Remove(Pick(Rows("dirt").ToArray())); }
                        else foreach (var d in Rows("dirt").Where(d => d.Str("type") == v.ToString()).ToArray()) List("dirt").Remove(d);
                        break;
                    case "expose":
                        if (List("dirt").Count > 0) List("q").Add(Obj(("type", "scandal"), ("uid", Pick(Rows("dirt").ToArray())["uid"])));
                        break;
                    case "flag": foreach (var f in Values(v)) Map("flags")[f.ToString()] = 1; break;
                    case "unflag": foreach (var f in Values(v)) Map("flags").Remove(f.ToString()); break;
                    case "staff": StaffEffect(v.ToString(), ctx); break;
                    case "rival":
                        var rival = Rows("rivals").FirstOrDefault(r => r.Str("id") == ctx.Str("rival"));
                        if (rival == null) break;
                        if (v.On("cap")) foreach (var k in new[] { "drift", "cap", "bench" }) rival[k] = rival.N(k) + v.N("cap");
                        if (v.On("hype")) rival["hype"] = Js.Clamp(rival.N("hype") + v.N("hype"), 0, 100);
                        if (v.On("rel")) rival["rel"] = Js.Clamp(rival.N("rel") + v.N("rel"), -100, 100);
                        break;
                    case "temp":
                        foreach (JsonObject tm in Values(v)) List("temp").Add(Obj(("key", tm["key"]), ("mult", tm.ContainsKey("mult") ? tm["mult"] : Undefined),
                            ("add", tm.ContainsKey("add") ? tm["add"] : Undefined), ("until", t + (tm.On("months") ? tm.N("months") : P("fx.tempMonths")))));
                        break;
                    case "follow": List("sched").Add(Obj(("id", v["id"]), ("at", t + (v.On("in") ? v.N("in") : 1)), ("ctx", ctx))); break;
                    case "perk": List("q").Add(Obj(("type", "draft"))); break;
                    case "project":
                        if (Rows("projects").Any(p => p.Str("id") == v.Str("id"))) break;
                        List("projects").Add(Obj(("uid", "p" + uid++), ("id", v["id"]), ("chain", v["chain"]), ("name", v["name"]),
                            ("desc", v.Str("desc")), ("kind", v.Str("kind", "res")), ("need", v.On("need") ? v.N("need") : P("proj.need")),
                            ("done", 0.0), ("t", t), ("due", t + (v.On("months") ? v.N("months") : P("proj.months"))), ("ok", v["ok"]), ("fail", v["fail"]), ("ctx", ctx)));
                        News(Tx("news.project", ("项目", v.Str("name"))));
                        break;
                    case "chain":
                        string id = v.Str("id");
                        var chain = Map("chains")[id] ??= Obj(("id", id), ("t", t), ("notes", new JsonArray()));
                        if (v.On("note")) { chain["note"] = v.Str("note"); ((JsonArray)chain["notes"]!).Add(Obj(("t", t), ("text", v.Str("note")))); }
                        if (v.On("done")) chain["done"] = true;
                        break;
                    case "end": EndGame(v.ToString()); break;
                    case "ideo":
                        if (Ideo == null) break;
                        foreach (var bar in new[] { "red", "cap" }) if (v.On(bar))
                            {
                                Ideo[bar] = Js.Clamp(Ideo.N(bar) + v.N(bar), 0, 100);
                                if (Ideo.N(bar) >= 100 && !Ideo.On("full")) Ideo["full"] = bar;
                            }
                        break;
                    case "heat": if (Ideo != null) Ideo["heat"] = Js.Clamp(Ideo.N("heat") + Number(), 0, 100); break;
                }
            }
        }
        private void StaffEffect(string command, JsonObject ctx)
        {
            if (command == "loseCtx" || command == "loseBest" || command == "loseRandom")
            {
                if (List("staff").Count == 0) return;
                var staff = Rows("staff");
                var e = command == "loseCtx" ? staff.FirstOrDefault(m => m.Str("uid") == ctx.Str("staff")) :
                    command == "loseBest" ? staff.OrderByDescending(m => m.N("skill")).First() : Pick(staff.ToArray());
                if (e == null) return;
                List("staff").Remove(e);
                if (command != "loseCtx") News(Tx("news.staffLeft", ("名字", e.Str("name")), ("岗位", D("ROLES")[e.Str("role")].Str("name"))));
                return;
            }
            string? role = command switch { "gainRes" => "res", "gainStar" => "res", "gainEng" => "eng", "gainOps" => "ops", "gainBiz" => "biz", "gainLegal" => "legal", _ => null };
            if (role == null) return;
            bool star = command == "gainStar";
            var member = GenStaff(role, star ? P("staff.starBonus") : P("staff.gainBonus"));
            if (star)
            {
                double skill = Integer(P("staff.starMin"), P("staff.starMax"));
                member["skill"] = skill;
                member["quirk"] = "genius";
                member["salary"] = FixedNumber((P("staff.pay0") + P("staff.paySkill") * (skill * skill)) * D("ROLES")["res"].N("pay") * D("STAFF_QUIRKS")["genius"].N("pay"), 1);
            }
            List("staff").Add(member);
            News(Tx("news.staffJoined", ("名字", member.Str("name")), ("岗位", D("ROLES")[role].Str("name")), ("能力", member.N("skill"))));
        }
    }
}
