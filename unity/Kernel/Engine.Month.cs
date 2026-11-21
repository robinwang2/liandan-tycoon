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
        public void EndMonth()
        {
            if (Snapshot.On("over")) return;
            SettleCompute();
            DevelopFeatures();
            var completed = AdvanceProjects();
            GrowUsers();
            SettleAccounts();
            UpdateGauges();
            AdvanceRivals();
            UpdateTeam();
            AdvanceCalendar();
            CheckAchievements();
            var streak = Map("streak");
            if (t > P("MONTHS"))
            {
                double val = Valuation();
                EndGame(val >= P("end.giant") ? "giant" : val >= P("end.unicorn") ? "unicorn" : streak.N("profit") >= P("end.smallProfit") ? "small" : "zombie");
                return;
            }
            MonthEvents(completed);
        }

        private void SettleCompute()
        {
            double need = InferNeed, have = gpu + BrainGpu, free = Max(0, have - need);
            outage = need > have ? 1 - have / need : 0;
            if (outage > P("gpu.outageNews")) News(Tx("news.outage", ("缺口", RoundJs(outage * 100))));
            var furnace = Snapshot["furnace"];
            if (Snapshot.On("ownModel") && furnace.On("on"))
            {
                string data = furnace.Str("data");
                double gain = free * ResearchEff * D("DATA_SOURCES")[data].N("mult");
                double odds = Js.Clamp(P("furnace.boom") - Power("eng") / P("furnace.boomEngDiv"), P("furnace.boomMin"), P("furnace.boom")) * Mod("boomMult");
                if (free > 0 && t > P("furnace.safeMonths") && Random() < odds)
                {
                    gain = -E * P("furnace.boomLoss");
                    List("fxq").Add(new JsonArray("boom"));
                    News(Tx("news.boom"));
                }
                E = Max(0, E + gain);
                furnace!["months"] = furnace.N("months") + 1;
                if (data == "distill") E = Min(E, Max(0, Energy(Rows("rivals").Max(r => r.N("cap")) - P("furnace.distillGap")) - BaseE));
            }
        }

        private void DevelopFeatures()
        {
            double eng = Power("eng"), dm = Mod("devMult");
            double ceil = P("quality.ceil0") + P("quality.ceilK") * UsedCap;
            quality = Js.Clamp(quality + eng * P("quality.engK") * dm * Max(0, 1 - quality / ceil) - P("quality.decay"), P("quality.min"), 100);
            if (OptionalRecord("sprint") is JsonObject sprint)
            {
                sprint["done"] = sprint.N("done") + eng * dm;
                if (sprint.N("done") >= sprint.N("need"))
                {
                    var f = tables.Features[sprint.Str("id")];
                    List("feats").Add(f.Str("id"));
                    Snapshot["featDone"] = Obj(("id", f.Str("id")), ("t", t));
                    ApplyEffects(f["fx"], new JsonObject());
                    News(Tx("news.feature", ("功能", f.Str("name"))));
                    List("fxq").Add(new JsonArray("say", Obj(("text", Tx("say.feature", ("功能", f.Str("name")))))));
                    Snapshot["sprint"] = null;
                }
            }
        }

        private List<(string id, JsonNode? ctx)> AdvanceProjects()
        {
            var completed = new List<(string id, JsonNode? ctx)>();
            foreach (var project in Projects.ToArray())
            {
                string kind = project.Kind;
                double rate = kind == "ap" ? 0 : kind == "gpu" ? Js.Clamp(Max(0, gpu - InferNeed) / Max(P("proj.gpuMin"), P("proj.gpuShare") * Quota), 0, P("proj.max"))
                    : Js.Clamp(Power(kind) / (P("proj.need0") + P("proj.needStage") * stage), P("proj.min"), P("proj.max"));
                project.Done += rate / Rows("projects").Count(p => p.Str("kind") == kind);
                bool finished = project.Done >= project.Need;
                if (!finished && t + 1 < project.Due) continue;
                List("projects").Remove(project.Record);
                News(Tx(finished ? "news.projectDone" : "news.projectFail", ("项目", project.Name)));
                if (project.Record.On(finished ? "ok" : "fail")) completed.Add((project.Record.Str(finished ? "ok" : "fail"), project.Record["ctx"]));
            }
            return completed;
        }

        private void SettleAccounts()
        {
            var rv = Revenue();
            var cs = Costs();
            double net = rv.N("total") - cs.N("total");
            cash += net;
            Snapshot["last"] = Obj(("rev", rv.N("total")), ("cost", cs.N("total")), ("net", net), ("rv", rv), ("cs", cs));
            var streak = Map("streak");
            streak["profit"] = net > 0 ? streak.N("profit") + 1 : 0;
            streak["x996"] = Map("policies").Str("work") == "996" ? streak.N("x996") + 1 : 0;
            if (streak.On("x996") && streak.N("x996") % P("work.dirtMonths") == 0) AddDirt("overwork");
            Map("stats")["maxUsers"] = Max(Map("stats").N("maxUsers"), users);
            double q = Max(1, Quota), k = Max(0.05, (1 + quotaAdd) * Mod("quotaMult"));
            if (gpu >= P("gpu.fullLine") * q) quotaEarn += (P("gpu.earnFull") * q + P("gpu.earnOver") * Max(0, gpu - q)) / k;
            else if (gpu < P("gpu.idleLine") * q) quotaEarn *= P("gpu.idleDecay");
        }

        private void UpdateGauges()
        {
            double rw = Runway();
            hype = Js.Clamp(hype * (1 - (P("hype.decay") + Max(0, hype - P("hype.decayFrom")) * P("hype.decayK")) * Mod("hypeDecayMult")), 0, 100);
            morale = Js.Clamp(morale + (P("morale.home") - morale) * P("morale.pull") + Mod("moraleAdd") - (rw < P("morale.brokeLine") ? P("morale.brokeHit") : 0), 0, 100);
            rep = Js.Clamp(rep + Mod("repAdd") + (quality > P("rep.qHigh") ? P("rep.qStep") : quality < P("rep.qLow") ? -P("rep.qStep") : 0) - outage * P("rep.outageHit"), 0, 100);
            double dr = P("reg.drift") + hype / P("reg.hypeDiv") + JsMath.Log10(1 + users) / P("reg.usersDiv") + (Company.Track == "companion" ? P("reg.companion") : 0) + Mod("regAdd");
            reg = Js.Clamp(reg + (dr > 0 ? dr * Mod("regMult") : dr), 0, P("reg.max"));
            bubble = Js.Clamp(bubble + (burstT != 0 ? Between(P("bubble.afterMin"), P("bubble.afterMax")) : Between(P("bubble.riseMin"), P("bubble.riseMax"))), 0, 100);
            gpuBase = Js.Clamp(gpuBase + Between(P("gpu.priceStepMin"), P("gpu.priceStepMax")), P("gpu.priceMin"), P("gpu.priceMax"));
            apiIdx = Js.Clamp(apiIdx * Between(P("api.stepMin"), P("api.stepMax")), P("api.min"), P("api.max"));
        }

        private void AdvanceRivals()
        {
            foreach (var r in Rivals)
            {
                r.Drift = Js.Clamp(r.Drift + Between(-P("rival.driftStep"), P("rival.driftStep")), -P("rival.driftMax"), P("rival.driftMax"));
                r.Cap = Min(P("AGI_CAP") - P("rival.agiGap"), Frontier(t + 1) + r.Off + r.Drift);
                r.Hype *= P("rival.hypeDecay");
                r.Next--;
                if (r.Next > 0) continue;
                r.Ver++;
                r.Bench = r.Cap + r.Cheat + Between(P("rival.benchMin"), P("rival.benchMax"));
                r.Next = Integer(P("rival.releaseMin"), P("rival.releaseMax"));
                r.Hype = Js.Clamp(r.Hype + P("rival.releaseHype"), 0, 100);
                News(Tx("news.rivalRelease", ("对手", r.Name), ("模型", r.Model), ("版本", r.Ver), ("跑分", Fixed(r.Bench, 1)), ("老板", r.Boss)));
            }
        }

        private void UpdateTeam()
        {
            if (morale < P("morale.quitLine") && List("staff").Count > 0 && Random() < P("morale.quitOdds"))
            {
                var pool = Rows("staff").Where(e => e.Str("quirk") != "loyal").ToArray();
                var e = Pick(pool.Length > 0 ? pool : Rows("staff").ToArray());
                List("staff").Remove(e);
                News(Tx("news.quit", ("名字", e.Str("name")), ("岗位", D("ROLES")[e.Str("role")].Str("name"))));
            }
            IdeologyMonth();
        }

        private void AdvanceCalendar()
        {
            t++;
            foreach (var tm in Rows("temp").Where(tm => tm.N("until") <= t).ToArray()) List("temp").Remove(tm);
            foreach (var cd in Map("cd").Where(pair => (double)pair.Value! <= t).ToArray()) Map("cd").Remove(cd.Key);
            List("hist").Add(new JsonArray(RoundJs(cash), FixedNumber(users, 1), RoundJs(Valuation())));
            if (t % P("news.every") == 0 && tables.News.Count > 0) News(Tx("news.paper", ("新闻", FormatNews((string)Pick(tables.News.ToArray())!))));
            RefreshCandidates();
            ap = Js.Clamp(P("ap.base") + (A.N("mgmt") >= P("ap.mgmtLine") ? P("ap.mgmtBonus") : 0) + Mod("apAdd") + apNext, P("ap.min"), P("ap.max"));
            apNext = 0;
        }

        private void CheckAchievements()
        {
            var streak = Map("streak");
            if (users >= P("ach.m100")) Award("m100");
            if (users >= P("ach.y1")) Award("y1");
            if (streak.N("x996") >= P("ach.x996")) Award("x996");
            if (stage == 0 && t > P("ach.boot")) Award("boot");
            if (Rank == 1) { Award("top1"); if (Model.N("infl") >= P("ach.fake1")) Award("fake1"); }
        }

        private void EndGame(string id)
        {
            if (Snapshot.On("over")) return;
            Snapshot["over"] = Obj(("id", id), ("t", t), ("val", Valuation()), ("users", users));
            List("q").Clear();
            if (id == "jail") Award("sewing");
            if (id == "ipo") Award("ipo");
            if (id == "agi_good" || id == "agi_bad") Award("agi");
            if (D("ENDINGS")[id].On("good") && !Snapshot.On("hadDirt")) Award("clean");
            if (Flag("nakedSwim") && id != "bankrupt" && id != "jail") Award("winter");
        }
    }
}
