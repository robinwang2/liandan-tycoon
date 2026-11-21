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
        private bool Available(string id) => Show(id) && !Map("cd").On(id) && ActionCost(id) <= cash && Block(id) == null;
        private string HintText(string key, params (string, object)[] vars) => Tx("advice." + key, vars);
        private JsonObject Hint(string id, string lv, string title, string text, string? left = null, string? right = null, string? hl = null, string? group = null)
        {
            var h = Obj(("id",id), ("lv",lv), ("icon",HintText((group ?? id) + ".icon")), ("title",title), ("text",text));
            if (left != null) h["go"] = Obj(("ltab",left));
            if (right != null) h["go"] = Obj(("rtab",right));
            if (hl != null) h["hl"] = hl;
            return h;
        }
        private JsonObject WithAction(JsonObject h, params string[] ids)
        {
            foreach (string id in ids)
            {
                if (!Available(id)) continue;
                h["act"] = id; h["later"] = ap < tables.ActionRows[id].N("ap"); break;
            }
            return h;
        }
        public JsonArray Advise()
        {
            var result = new JsonArray();
            if (Snapshot.On("over")) return result;
            var hints = new List<JsonObject>();
            UrgentHints(hints); OpportunityHints(hints); WarningHints(hints);
            foreach (var h in hints.Where(h => Snapshot["hintMute"].N(h.Str("id")) <= t)
                .OrderBy(h => h.Str("lv") switch { "bad" => 0, "gold" => 1, _ => 2 }).ThenBy(h => h.On("later")))
                result.Add(h);
            return result;
        }
        public double MuteMonths(JsonNode hint) => P(hint.Str("lv") == "bad" ? "advice.mute.bad" : "advice.mute.other");
        public void MuteHint(JsonNode hint)
        {
            var mute = OptionalRecord("hintMute");
            if (mute == null) Snapshot["hintMute"] = mute = new JsonObject();
            foreach (var key in mute.Select(e => e.Key).ToArray()) if (mute.N(key) <= t) mute.Remove(key);
            mute[hint.Str("id")] = t + MuteMonths(hint);
        }
        private JsonNode? WorstCrime => Rows("dirt").Where(IsCrime).OrderByDescending(d => d.N("sev")).FirstOrDefault();
        private void UrgentHints(List<JsonObject> hints)
        {
            string T(string k, params (string,object)[] v) => HintText(k,v);
            double net = Revenue().N("total") - Costs().N("total"), rw = Runway();
            if (net < 0 && rw < P("advice.cash.runway"))
            {
                double pf = Performance(); string score = Fixed(pf,2); var r = tables.ActionRows["raise"]["p"];
                bool raise = Available("raise"); var tips = new List<string>();
                if (raise) tips.Add(pf >= r.N("流血线") ? T("cash.raise3", ("业绩",score)) : pf >= r.N("失败线") ? T("cash.raise1", ("业绩",score), ("流血线",r.N("流血线"))) : T("cash.raise0", ("业绩",score), ("失败线",r.N("失败线"))));
                if (Map("policies").Str("price") == "free") tips.Add(T("cash.free"));
                double free = OwnModel ? Max(0,gpu - InferNeed) : 0;
                if (free >= P("advice.cash.freeGpu")) tips.Add(T("cash.furnace", ("张数",free), ("月租",Money(GpuRent(gpu) - GpuRent(gpu - free)))));
                var quick = new[] {"sellcourse","subsidy"}.Where(Available).Select(id => T("act", ("行动",tables.ActionRows[id].Str("name")))).ToArray();
                if ((!raise || pf < r.N("流血线")) && quick.Length > 0) tips.Add(T("cash.quick", ("行动",string.Join(T("sep"), quick))));
                var h = Hint("cash","bad",rw < 1 ? T("cash.title.broke") : T("cash.title", ("月数",Floor(rw))), T("cash.text", ("净流出",Money(-net)), ("建议",string.Concat(tips))), left:"cap");
                hints.Add(pf >= r.N("流血线") ? WithAction(h,"raise","sellcourse","subsidy") : pf >= r.N("失败线") ? WithAction(h,"sellcourse","subsidy","raise") : WithAction(h,"sellcourse","subsidy"));
            }
            if (gpu < InferNeed)
            {
                string how = InferNeed <= Quota ? T("outage.add") : T("outage.quota", ("配额",Quota), ("倍数",P("gpu.over0")));
                hints.Add(Hint("outage","bad",T("outage.title"),T("outage.text", ("需要",InferNeed), ("租了",gpu), ("缺口",RoundJs((1 - gpu / InferNeed) * 100)), ("办法",how)), left:"ops",hl:"gpu:+"));
            }
            double exposedCrime = Snapshot.N("exposedCrime");
            if (exposedCrime >= P("advice.crime.from") && WorstCrime is JsonNode crime)
                hints.Add(WithAction(Hint("crime","bad",T("crime.title"),T("crime.text", ("曝光",RoundJs(exposedCrime)), ("经侦线",P("scandal.probeLine")), ("黑料",crime.Str("name"))),right:"safe"),"wash"));
            foreach (var p in Projects)
            {
                double left = p.Need - p.Done, n = p.Due - t, rate = ProjectRate(p.Kind);
                if (left <= 0 || rate * n >= left) continue;
                bool stalled = p.Kind != "ap" && rate < 0.01;
                if (!stalled && n > P("advice.proj.months")) continue;
                string how = p.Kind == "ap" ? T("proj.ap") : T(stalled ? "proj.stalled" : "proj.slow", ("人手",D("KIND_NAME").Str(p.Kind)));
                string uid = p.Record.Str("uid");
                var h = Hint("proj-" + uid,n <= P("advice.proj.urgent") ? "bad" : "warn",T(stalled ? "proj.title.stalled" : "proj.title.late"),
                    T("proj.text", ("项目",p.Name), ("月数",n), ("完成",Min(99,RoundJs((p.Done + rate * n) / p.Need * 100))), ("办法",how)), right:"chain",hl:"push:" + uid,group:"proj");
                h["later"] = ap < 1; hints.Add(h);
            }
            var vam = OptionalRecord("vam");
            if (vam != null && vam.N("due") - t <= P("advice.vam.months") && users + fake < vam.N("target"))
                hints.Add(WithAction(Hint("vam","bad",T("vam.title"),T("vam.text", ("日期",DateText(vam.N("due"))), ("目标",UsersText(vam.N("target"))), ("现在",UsersText(users + fake))), left:"pr"),"ads","hype"));
            bool board = stage >= P("coup.stage") && equity < P("coup.equity") && !Map("cd").On("coup");
            if (morale < P("advice.morale.line") && List("staff").Count >= P("advice.morale.staff"))
            {
                bool quit = morale < P("morale.quitLine");
                string body = T("morale.text", ("士气",RoundJs(morale)), ("离职",quit ? T("morale.quitting") : T("morale.quitLine", ("离职线",P("morale.quitLine")))),
                    ("加班",Map("policies").Str("work") == "996" ? T("morale.x996") : ""), ("董事会",board ? T("morale.board", ("股权",RoundJs(equity))) : ""));
                hints.Add(WithAction(Hint("morale",quit || board && morale < P("coup.morale") ? "bad" : "warn", T(quit ? "morale.title.quit" : "morale.title"),body,left:"team"),"teambuild","pie"));
            }
            if (board && rep < P("advice.coup.rep"))
                hints.Add(WithAction(Hint("coup",rep < P("coup.rep") ? "bad" : "warn",T("coup.title"),T("coup.text", ("股权",RoundJs(equity)), ("口碑",RoundJs(rep))),left:"pr"),"goodpr"));
        }
        private void OpportunityHints(List<JsonObject> hints)
        {
            string T(string k, params (string,object)[] v) => HintText(k,v);
            void Gold(string id,string title,string body) => hints.Add(WithAction(Hint(id,"gold",title,body),id));
            if (!Snapshot.On("sprint") && Available("sprint"))
            {
                var done = OptionalRecord("featDone"); JsonNode? just = null;
                if (done != null && done.N("t") == t - 1) tables.Features.TryGetValue(done.Str("id"), out just);
                int left = tables.Features.Keys.Count(k => !Rows("feats").Any(f => f.ToString() == k));
                Gold("sprint",T(just != null ? "sprint.title.done" : "sprint.title"),T("sprint.text", ("开头",just != null ? T("sprint.done", ("功能",just.Str("name"))) : T("sprint.none")), ("剩下",left)));
            }
            if (Available("release"))
            {
                string vs = Model != null ? T("release.vs", ("现役",Fixed(Model.N("cap"),1)), ("高出",Fixed(MyCap - Model.N("cap"),1))) : T("release.first");
                Gold("release",T("release.title"),T("release.text", ("火候",Fixed(MyCap,1)), ("对比",vs), ("榜首",Fixed(Rivals.Max(r => r.Bench),1))));
            }
            if (Available("ipo"))
            {
                if (WorstCrime is JsonNode d) hints.Add(WithAction(Hint("ipo","gold",T("ipo.title.wash"),T("ipo.text.wash", ("黑料",d.Str("name"))),right:"safe"),"wash"));
                else Gold("ipo",T("ipo.title"),T("ipo.text", ("轮次",StageName(LastRound)), ("月数",Map("streak").N("profit")), ("业绩",Fixed(Performance(),2)), ("黑料",List("dirt").Count > 0 ? T("ipo.dirt", ("张数",List("dirt").Count)) : "")));
            }
            double rw = Runway(), pf = Performance();
            if (stage < LastRound && Available("raise") && pf >= P("advice.raise.perf") && rw >= P("advice.cash.runway"))
            {
                bool urgent = rw < P("advice.raise.short"), ripe = pf >= P("advice.raise.ripePerf") && t - Snapshot.N("lastRaiseT") >= P("advice.raise.gap") && equity >= P("advice.raise.equity");
                double after = equity * P("advice.raise.dilute"); bool chain = Ideo.On("on");
                if (urgent || ripe && !(chain && after < P("ideo.equity")))
                {
                    var offers = (JsonArray)tables.Actions["OFFERS"]!;
                    string why = urgent ? T("raise.why.short", ("月数",Floor(rw)), ("业绩",Fixed(pf,2))) : T("raise.why.ripe", ("业绩",Fixed(pf,2)));
                    string name = StageName(stage + 1);
                    Gold("raise", T("raise.title", ("轮次",(name[0] >= 'A' && name[0] <= 'Z' ? " " : "") + name)),
                        T("raise.text", ("理由",why), ("估值",Money(Valuation())), ("最少",RoundJs(offers.Min(o => o.N("share")) * 100)), ("最多",RoundJs(offers.Max(o => o.N("share")) * 100)),
                        ("股权",RoundJs(equity)), ("董事会",RoundJs(equity) < P("advice.raise.boardWarn") ? T("raise.board", ("逼宫线",P("coup.equity"))) : ""),
                        ("路线之争",chain ? T("raise.ideo", ("剩下",RoundJs(after))) : ""), ("预热",raiseBoost < P("advice.raise.boost") && Available("roadshow") ? T("raise.roadshow") : "")));
                }
            }
            int n = List("staff").Count; double cap = ReadBotValue("teamCap");
            if (n >= cap && Available("office") && rw >= P("advice.office.runway") && cash >= P("advice.office.cash") * ActionCost("office"))
            {
                var office = D("OFFICES")[NextOffice]; double extra = cap - D("OFFICES")[(int)Company.Office].N("cap");
                Gold("office",T("office.title"),T("office.text", ("人数",n), ("上限",cap), ("办公室",OfficeName(NextOffice)), ("新上限",office.N("cap") + extra), ("月租",Money(office.N("rent") * Mod("rentMult")))));
            }
            if (n < cap && List("cands").Count > 0 && !(Revenue().N("total") < Costs().N("total") && rw < P("advice.hire.runway")))
            {
                bool Has(string role) => Staff.Any(e => e.Role == role);
                string? need = OwnModel && !Has("res") ? "res" : !Has("eng") ? "eng" : null;
                var pool = Rows("cands").OrderByDescending(c => c.N("skill")).ToList();
                var forNeed = pool.FirstOrDefault(c => c.Str("role") == need);
                var star = pool.FirstOrDefault(c => c.Str("quirk") == "genius" || c.N("skill") >= P("advice.hire.star") && c.Str("quirk") != "guanxi" && c.Str("quirk") != "moyu");
                var c = forNeed ?? star ?? (n < P("advice.hire.small") ? pool[0] : null);
                if (c != null && cash >= P("advice.hire.cash") * c.N("salary") * Mod("salaryMult"))
                {
                    string title = forNeed != null ? T("hire.title.need", ("岗位",D("ROLES")[need!].Str("name"))) : T(star != null ? "hire.title.star" : "hire.title");
                    string body = T("hire.text", ("人数",n), ("上限",cap), ("理由",forNeed != null ? T("hire.why." + need) : ""), ("名字",c.Str("name")), ("岗位",D("ROLES")[c.Str("role")].Str("name")), ("能力",c.N("skill")), ("怪癖",c.On("quirk") ? T("hire.quirk", ("怪癖",D("STAFF_QUIRKS")[c.Str("quirk")].Str("name"))) : ""));
                    var h = Hint("hire","gold",title,body,left:"team",hl:"who:" + c.Str("uid")); h["later"] = ap < 1; hints.Add(h);
                }
            }
            if (OwnModel && Snapshot["furnace"].On("on") && InferNeed <= gpu && gpu < Quota)
            {
                if (gpu == InferNeed && rw >= P("advice.furnace.runway"))
                    hints.Add(Hint("furnace","gold",T("furnace.title.cold"),gpu != 0 ? T("furnace.text.cold", ("空着",Quota - gpu)) : T("furnace.text.none", ("配额",Quota)),left:"ops",hl:"gpu:+"));
                else if (gpu < Quota * P("advice.furnace.half") && rw >= P("advice.furnace.rich") && cash >= (Quota - gpu) * ReadBotValue("gpuPrice") * P("advice.furnace.months"))
                    hints.Add(Hint("furnace","gold",T("furnace.title.more"),T("furnace.text.more", ("配额",Quota), ("租了",gpu)),left:"ops",hl:"gpu:+"));
            }
            if (Available("selfdev") && rw >= P("advice.selfdev.runway") && cash >= P("advice.selfdev.cash") * ActionCost("selfdev"))
                Gold("selfdev",T("selfdev.title"),T("selfdev.text", ("轮次",StageName(stage)), ("上游",Rows("rivals").FirstOrDefault(r => r.Str("id") == Snapshot.Str("upstream")).Str("name"))));
        }
        private void WarningHints(List<JsonObject> hints)
        {
            string T(string k, params (string,object)[] v) => HintText(k,v);
            if (gpu > Quota && Available("beg"))
                hints.Add(WithAction(Hint("premium","warn",T("premium.title"),T("premium.text", ("张数",gpu - Quota), ("多花",Money(GpuRent(gpu) - gpu * ReadBotValue("gpuPrice")))),left:"ops"),"beg"));
            if (reg >= P("reg.high"))
            {
                bool bad = reg >= P("advice.reg.bad");
                hints.Add(WithAction(Hint("reg",bad ? "bad" : "warn",T(bad ? "reg.title.bad" : "reg.title"),T("reg.text", ("压力",RoundJs(reg)), ("审核",Map("policies").Str("safety") == "loose" ? T("reg.loose") : "")),left:"cap"),"lobby","goodpr"));
            }
            double streak = Map("streak").N("x996");
            if (Map("policies").Str("work") == "996" && streak % P("work.dirtMonths") == P("work.dirtMonths") - 1)
                hints.Add(Hint("x996","warn",T("x996.title"),T("x996.text", ("月数",streak), ("黑料",D("DIRT")["overwork"].Str("name"))),left:"ops",hl:"pol:work:965"));
            if (WorstDirt is JsonNode dirt && !(Snapshot.N("exposedCrime") >= P("advice.crime.from") && WorstCrime != null))
            {
                double risk = 1 - Rows("dirt").Where(d => d.N("t") <= t + 1 - P("dirt.hideMonths")).Aggregate(1.0,(k,d) => k * (1 - Expose(d)));
                if (risk >= P("advice.dirt.risk"))
                    hints.Add(WithAction(Hint("dirt",risk >= P("advice.dirt.bad") ? "bad" : "warn",T("dirt.title"),T("dirt.text", ("张数",List("dirt").Count), ("概率",RoundJs(risk * 100)), ("黑料",dirt.Str("name")), ("严重度",RoundJs(dirt.N("sev")))),right:"safe"),"wash"));
            }
            if (hype < P("advice.hype.line") && t > P("advice.hype.from") && Available("hype"))
                hints.Add(WithAction(Hint("hype","warn",T("hype.title"),T("hype.text", ("热度",RoundJs(hype)))),"hype"));
            if (rep < P("advice.rep.line") && Available("goodpr"))
                hints.Add(WithAction(Hint("rep","warn",T("rep.title"),T("rep.text", ("口碑",RoundJs(rep)))),"goodpr"));
            if (Ideo.On("on") && equity < P("advice.ideo.equity"))
            {
                bool low = equity < P("ideo.equity");
                hints.Add(Hint("ideo-equity",low ? "bad" : "warn",T(low ? "ideoEquity.title.low" : "ideoEquity.title"),
                    T("ideoEquity.text", ("级数",((JsonArray)tables.Books["cn"]["IDEO_STAGES"]!).Count - Ideo.N("n")), ("底线",P("ideo.equity")), ("股权",Fixed(equity,0)), ("回购线",P("ideo.equityWarn"))), left:"ideo",group:"ideoEquity"));
            }
            // 旧状态可能缺少结束月份；JS 的超期判断在这种情况下为假。
            bool expired = t - Ideo.N("tEnd", double.NaN) > P("advice.ideo.newMonths");
            if (Ideo.On("result") && Ideo.Str("result") != "fail" && !expired)
            {
                bool red = Ideo.Str("result") == "red";
                var h = WithAction(Hint("ideo-new","gold",T("ideoNew.title"),tables.Text(red ? "advice.ideoNew.red" : "advice.ideoNew.cap",Ideo.Str("v") == "us"),left:"ideo",group:"ideoNew"),red ? "mobilize" : "yank",red ? "plan" : "buyback");
                if (h.On("act")) hints.Add(h);
            }
            double heat = Ideo.N("heat");
            if (HasHeat && (Ideo.On("on") || Ideo.Str("result") == "red") && heat >= P("advice.ideo.heat"))
                hints.Add(Hint("ideo-heat",heat >= P("advice.ideo.heatBad") ? "bad" : "warn",T("ideoHeat.title"),T("ideoHeat.text", ("压力",RoundJs(heat)), ("估值",RoundJs(heat / (P("ideo.heat.raiseDiv") / 100))), ("订单",RoundJs(heat / (P("ideo.heat.b2bDiv") / 100))), ("磨掉",Ideo.On("on") ? T("ideoHeat.grind") : "")),left:"ideo",group:"ideoHeat"));
        }
    }
}
