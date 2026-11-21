using System;
using System.Linq;
using System.Collections.Generic;
using System.Text.Json.Nodes;
using static System.Math;
using static Liandan.Kernel.Js;

namespace Liandan.Kernel
{
    public sealed partial class GameState
    {
        private JsonObject RunAction(JsonNode row)
        {
            string id = row.Str("id"); var p = row["p"];
            void Fx(string? key = null, double value = 0)
            {
                if (key == null) { ApplyEffects(row["fx"], new JsonObject()); return; }
                var fx = Obj((key, value));
                foreach (var field in row["fx"].Entries()) fx[field.Key] = field.Value?.DeepClone();
                ApplyEffects(fx, new JsonObject());
            }
            switch (id)
            {
                case "code":
                    quality = Js.Clamp(quality + CodeGain(p), 0, 100);
                    if (OwnModel && Snapshot["furnace"].On("on"))
                        E += Max(p.N("丹炉最少"), Max(0, gpu - InferNeed) * ResearchEff * D("DATA_SOURCES")[Snapshot["furnace"].Str("data")].N("mult") * p.N("丹炉月份"));
                    break;
                case "selfdev":
                    Snapshot["ownModel"] = true; E = 0; Snapshot["furnace"] = Obj(("on", true), ("data", "open"), ("months", 0));
                    News(ActionText("selfdev.news")); break;
                case "paper": Fx(); foreach (var r in Rivals) r.Drift += p.N("对手进步"); break;
                case "headhunt": RefreshCandidates(p.N("候选人加成")); break;
                case "teambuild": Fx("morale", p.N("士气") + RoundJs(A.N("mgmt") / p.N("每几点管理加一"))); break;
                case "office":
                    Co["office"] = NextOffice; Fx(); List("fxq").Add(new JsonArray("levelup"));
                    News(ActionText("office.news", ("公司", Company.Name), ("办公室", OfficeName())));
                    return Said(Floors((int)Company.Office) != null ? ActionText("office.done.tower", ("分法", ActionText(Company.Office == MaxOffice ? "office.done.top" : "office.done.split"))) : ActionText("office.done", ("办公室", OfficeName())));
                case "ipo":
                    double legal = Power("legal");
                    var found = Rows("dirt").Where(d => Random() < Min(p.N("最高查出率"), d.N("sev") * p.N("每点严重度") / (1 + legal / p.N("法务除数")))).ToList();
                    var crimes = found.Where(IsCrime).ToList();
                    if (crimes.Count > 0)
                    {
                        foreach (var d in crimes.Take((int)p.N("最多引爆"))) List("q").Add(Obj(("type","scandal"),("uid",d["uid"])));
                        ApplyEffects(row["failFx"], new JsonObject());
                        return Obj(("ok", false), ("text", ActionText("ipo.fail", ("黑料", string.Join("」「", crimes.Select(d => d.Str("name")))))));
                    }
                    EndGame("ipo");
                    return Obj(("ok", true), ("text", found.Count == 0 ? ActionText("ipo.clean") : ActionText("ipo.found", ("黑料", found[0].Str("name")))));
                case "sellcourse": cash += CourseIncome(p); Fx(); break;
                case "lobby": Fx("reg", -(p.N("基础") + A.N("net") * p.N("每点人脉"))); break;
                case "hype": Fx("hype", p.N("基础") + A.N("cha") * p.N("每点口才")); break;
                case "ads": users += AdsGain(p); break;
                case "fakeusers": fake += Max(p.N("最少"), users * p.N("比例")); Fx(); break;
                case "mobilize":
                    hype = Js.Clamp(hype + p.N("热度"),0,100); bubble = Js.Clamp(bubble + p.N("泡沫"),0,100); morale = Js.Clamp(morale + p.N("士气"),0,100);
                    return Said(RouteActionText(id));
                case "utopia": case "bci":
                    Map("flags")[id + "_on"] = 1;
                    if (id == "bci") Fx();
                    QueueEvent(Book["VER"]!["chain"].Str(id)); News(StoryText("ideo." + id + ".news", ("公司", Company.Name)));
                    return Said(RouteActionText(id));
                case "selfcrit":
                    var dirt = WorstDirt!; List("dirt").Remove(dirt);
                    Fx("morale", -(p.N("士气基础") + dirt.N("sev") / p.N("每几点严重度")));
                    return Said(ActionText("selfcrit.done", ("黑料", dirt.Str("name")), ("文案", RouteActionText(id))));
                case "subbotnik":
                    var sprint = OptionalRecord("sprint");
                    if (sprint != null) sprint["done"] = Min(sprint.N("need"), sprint.N("done") + sprint.N("need") * p.N("进度"));
                    else quality = Js.Clamp(quality + p.N("体验"),0,100);
                    Fx(); return Said(RouteActionText(id));
                case "costcut": case "buyback": Fx(); return Said(RouteActionText(id));
                case "spinoff":
                    Map("flags")[id] = 1; cash += Valuation() * p.N("比例"); Fx(); List("fxq").Add(new JsonArray("money")); return Said(RouteActionText(id));
                default:
                    if (row["check"] is JsonNode check)
                    {
                        bool ok = Random() < Check(check.Str("attr"), check.N("dc"));
                        if (id == "roadshow") raiseBoost += p.N(ok ? "成功加成" : "失败加成");
                        else if (id == "subsidy" && ok) cash += Max(p.N("最少"), p.N("月数") * Unit);
                        else ApplyEffects(row[ok ? "fx" : "failFx"], new JsonObject());
                        return Obj(("ok",ok), ("text",ActionText(id + (ok ? ".ok" : ".fail"))));
                    }
                    Fx(); break;
            }
            return Said(ActionText(id + ".done"));
        }
        private bool IsCrime(JsonNode dirt) => D("DIRT")[dirt.Str("type")].On("crime");
        private Dialog RouteDialog(string id)
        {
            var w = StoryWindow("ideo_" + id);
            var dialog = new Dialog(Obj(("kind","event"),("cat","ideo"),("title",w["title"]),("art",w["art"]),("text",w["text"]),("icon",w["icon"])));
            foreach (var opt in (JsonArray)w["options"]!)
            {
                string kind = opt.Str("fn");
                if (kind == "model" && !OwnModel) continue;
                var o = Obj(("label", opt!["label"]));
                if (id == "yank")
                {
                    if (kind == "no") { o["free"] = true; dialog.Add(o, () => Said("")); }
                    else { o["hint"] = opt["hint"]?.DeepClone(); dialog.Add(o, () => { Map("flags")["yank"] = 1; News(StoryText("ideo.yank.start")); return Said(opt.Str("text")); }); }
                    continue;
                }
                double start = PlanValue(kind);
                double goal = kind == "model" ? start + opt["p"].N("提升") : Max(start * opt["p"].N("倍数"), start + opt["p"].N("至少"));
                o["hint"] = tables.FillRuntime(opt.Str("hint"), null, ("目标", PlanText(kind, goal)));
                dialog.Add(o, () =>
                {
                    double due = t + w["p"].N("月数");
                    EnsureStory()["plan"] = Obj(("kind",kind),("goal",goal),("due",due),("t",t));
                    ApplyEffects(opt["fx"], new JsonObject()); Schedule("ideo_plan_due", due);
                    News(StoryText("ideo.plan.news", ("公司",Company.Name), ("日期",DateText(due)), ("目标",PlanText(kind, goal))));
                    return Said(RouteActionText(id));
                });
            }
            return dialog;
        }
        public JsonObject? Hire(string uid)
        {
            var c = Rows("cands").FirstOrDefault(x => x.Str("uid") == uid);
            if (c == null) return null;
            double fee = c.N("salary") * Mod("salaryMult");
            string? err = ap < 1 ? "common.noAp" : List("staff").Count >= ReadBotValue("teamCap") ? "hire.full" : cash < fee ? "hire.noFee" : null;
            if (err != null) return Obj(("err", ButtonText(err)));
            var before = ChipValues();
            ap--; cash -= fee; List("cands").Remove(c); c["since"] = t; List("staff").Add(c);
            return Obj(("text", ActionText("hire.done", ("名字",c.Str("name")), ("岗位",D("ROLES")[c.Str("role")].Str("name")), ("能力",c.N("skill")))), ("chips", Chips(before)));
        }
        public JsonObject? Fire(string uid)
        {
            var e = Rows("staff").FirstOrDefault(x => x.Str("uid") == uid);
            if (e == null) return null;
            if (Ideo.On("on")) Ideo!["fired"] = Ideo.N("fired") + 1;
            var before = ChipValues();
            cash -= P("fire.payMonths") * e.N("salary") * Mod("salaryMult"); List("staff").Remove(e);
            ApplyEffects(Obj(("morale", P(e.N("skill") >= P("fire.starSkill") ? "fire.starMorale" : "fire.morale"))), new JsonObject());
            return Obj(("text", ActionText("fire.done", ("名字", e.Str("name")))), ("chips", Chips(before)));
        }
        public void SetGpu(double n) => gpu = double.IsNaN(n) ? 0 : Max(0, RoundJs(n));
        public void SetPolicy(string key, JsonNode value)
        {
            if (Map("policies").Str(key) == value.ToString()) return;
            Map("policies")[key] = value.DeepClone();
            if (key == "work") ApplyEffects(Obj(("morale", P(value.ToString() == "996" ? "policy.work996Morale" : "policy.work965Morale"))), new JsonObject());
        }
        public JsonObject? PushProject(string uid)
        {
            var p = Rows("projects").FirstOrDefault(x => x.Str("uid") == uid);
            if (p == null || ap < 1) return null;
            var before = ChipValues();
            double k = p.Str("kind") switch { "res" or "eng" or "gpu" => A.N("tech"), "ops" => A.N("cha"), "biz" => A.N("biz"), "legal" => A.N("net"), "ap" => (A.N("cha") + A.N("net")) / 2, _ => 5 };
            ap--; p["done"] = p.N("done") + (1 + (k - 5) * P("proj.pushK"));
            return Obj(("text", Tx(p.N("done") >= p.N("need") ? "project.push.ready" : "project.push", ("项目",p.Str("name")))), ("chips", Chips(before)));
        }
    }
}
