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
        private JsonArray StoryStages => (JsonArray)Book["IDEO_STAGES"]!;
        private JsonNode VersionSettings => Book["VER"]!;
        private string? FounderMission => Founder.Traits.Select(x => x!.ToString())
            .FirstOrDefault(x => x.StartsWith("v_", StringComparison.Ordinal) && tables.Traits.ContainsKey(x));
        public JsonObject CompanyGoal()
        {
            string id = Ideo.Str("goal");
            if (id.Length == 0)
            {
                var mission = FounderMission;
                if (mission != null)
                {
                    var trait = tables.Traits[mission];
                    return Obj(("id", mission), ("name", trait.Str("name").Replace("「", "").Replace("」", "")), ("desc", trait["desc"]));
                }
                id = Company.Route == "model" ? "model" : "app";
            }
            var goal = D("GOALS")[id]?.DeepClone().AsObject() ?? new JsonObject();
            goal["id"] = id;
            return goal;
        }
        public string SideName(string side) => StoryText("ideo.side." + side);
        public string SideTag(string side) => StoryText("ideo.tag." + side);
        public JsonNode StoryCast() => Book["IDEO_CAST"]!.DeepClone();
        public JsonNode? StoryChainInfo(string id) =>
            (tables.Books["cn"]["IDEO_CHAINS"]![id] ?? tables.Books["us"]["IDEO_CHAINS"]![id])?.DeepClone();
        private JsonNode EnsureStory()
        {
            if (Ideo != null) return Ideo;
            var story = Obj(("v", Region == "bay" ? "us" : "cn"), ("on", 1), ("n", 0), ("heat", 0),
                ("picks", new JsonArray()), ("used", new JsonObject()), ("shown", new JsonObject()),
                ("t0", t), ("result", null), ("goal", null), ("full", null), ("fired", 0));
            foreach (var field in VersionSettings["start"].Entries()) story[field.Key] = field.Value?.DeepClone();
            Snapshot["ideo"] = story;
            return story;
        }
        private void StoryNote(string message)
        {
            var chain = Map("chains")["ideo"] ??= Obj(("id", "ideo"), ("t", t), ("notes", new JsonArray()));
            ((JsonArray)chain["notes"]!).Add(Obj(("t", t), ("text", message)));
        }
        private void StartStory(double heat)
        {
            if (Ideo == null)
            {
                EnsureStory();
                foreach (var e in Rows("staff"))
                {
                    e["rc"] = 1;
                    if (Random() < P("ideo.redStart")) e["red"] = 1;
                }
                var flag = VersionSettings["flag"];
                Map("flags")[flag.Str("on")] = 1;
                if (flag.On("chain")) Map("flags")[flag.Str("chain")] = 1;
                string repName = Book["IDEO_CAST"]!["rep"].Str("name");
                StoryNote(StoryText("ideo.start.note", ("代表", repName)));
                News(StoryText("ideo.start.news", ("代表", repName), ("公司", Company.Name)));
                QueueEvent("ideo_1");
            }
            if (heat != 0) Ideo!["heat"] = Ideo.N("heat") + heat;
        }
        private string BarsLine() => StoryText(HasHeat ? "ideo.bars.heat" : "ideo.bars",
            ("左翼名", SideName("red")), ("左翼", RoundJs(Ideo.N("red"))),
            ("资本名", SideName("cap")), ("资本", RoundJs(Ideo.N("cap"))), ("压力", RoundJs(Ideo.N("heat"))));

        public (double value, double confidence, double choice, double style) StoryLean()
        {
            if (Ideo == null) return (0, 0, 0, 0);
            var picks = (JsonArray)Ideo["picks"]!;
            double weights = 0, sum = 0;
            for (int i = 0; i < picks.Count; i++)
            {
                double k = JsMath.Pow(P("ideo.lean.decay"), picks.Count - 1 - i);
                weights += k;
                sum += k * (picks[i].Str("side") switch { "red" => 1, "cap" => -1, _ => 0 });
            }
            double choice = weights == 0 ? 0 : sum / weights;
            var policy = Map("policies");
            double style = policy.Str("price") switch { "free" => P("ideo.lean.free"), "premium" => P("ideo.lean.premium"), _ => 0 };
            style += P(policy.Str("work") == "996" ? "ideo.lean.x996" : "ideo.lean.x965");
            style += policy.Str("safety") switch { "strict" => P("ideo.lean.strict"), "loose" => P("ideo.lean.loose"), _ => 0 };
            style -= Min(P("ideo.lean.fireMax"), Ideo.N("fired") * P("ideo.lean.fire"));
            style = Js.Clamp(style, -1, 1);
            double v = Js.Clamp(P("ideo.lean.wChoice") * choice + P("ideo.lean.wStyle") * style
                + P("ideo.lean.wBars") * (Ideo.N("red") - Ideo.N("cap")) / 100, -1, 1);
            return (v, Js.Clamp(picks.Count / P("ideo.lean.confPicks"), 0, 1) * Min(1, Abs(v) / P("ideo.lean.confV")), choice, style);
        }
        private string? PreferredSide(double v) => v > P("ideo.lean.pref") ? "red" : v < -P("ideo.lean.pref") ? "cap" : null;
        public string LeanText()
        {
            if (Ideo?["picks"] is not JsonArray picks || picks.Count == 0) return StoryText("ideo.lean.none");
            var (v, confidence, _, _) = StoryLean();
            var side = PreferredSide(v);
            if (side == null) return StoryText("ideo.lean.mixed");
            double from = P("ideo.lean.from");
            return StoryText("ideo.lean.side", ("立场", SideName(side)),
                ("把握", RoundJs(P("ideo.lean.pct0") + confidence * P("ideo.lean.pctK"))),
                ("后话", Ideo.N("n") >= from - 1 ? StoryText("ideo.lean.more") : StoryText("ideo.lean.later", ("起始级", from))));
        }
        private string[] StorySlots(int n)
        {
            double v = StoryLean().value;
            var side = PreferredSide(v);
            if (n < P("ideo.lean.from") || side == null) return new[] { "red", "cap", "mid" };
            string opposite = side == "red" ? "cap" : "red";
            return Abs(v) >= P("ideo.lean.firm") ? new[] { side, side, side, opposite } : new[] { side, side, opposite };
        }
        private JsonObject BuybackCard()
        {
            double share = P("ideo.buyback.share"), price = Valuation() * (share / 100) * P("ideo.buyback.premium");
            var cast = Book["IDEO_CAST"]!;
            return Obj(("side", "mid"), ("label", StoryText("ideo.buyback.label", ("比例", share))),
                ("hint", StoryText("ideo.buyback.hint", ("价格", Money(price)))),
                ("text", StoryText("ideo.buyback.text", ("代表", cast["rep"].Str("name")), ("资本派", cast["cap"].Str("name")))),
                ("fx", Obj(("cashAbs", -price), ("equity", share))), ("req", Obj(("cash", price / Unit))));
        }
        private JsonArray StageOptions(JsonNode stageRow, int n)
        {
            var story = EnsureStory();
            var own = stageRow["opts"] as JsonArray ?? new JsonArray();
            var pool = ((JsonArray)Book["IDEO_POOL"]!).Select(c => c!).Where(c => c.N("from") <= n && n <= c.N("to")
                && !story["used"].On(c.Str("id")) && story["shown"].N(c.Str("id"), -1) != n - 1 && Condition(c["when"])).ToList();
            var cards = new List<JsonNode>();
            JsonNode? Take(string side)
            {
                bool Available(JsonNode? c) => c.Str("side") == side && !cards.Contains(c!);
                var mine = own.FirstOrDefault(Available);
                if (mine != null) return mine;
                var list = pool.Where(Available).ToArray();
                if (list.Length == 0) return null;
                var sharp = list.Where(c => c.On("when")).ToArray();
                return Pick(sharp.Length > 0 && Random() < P("ideo.deck.sharp") ? sharp : list);
            }
            var slots = StorySlots(n);
            foreach (string side in slots)
            {
                var c = Take(side) ?? Take("mid") ?? Take(side == "red" ? "cap" : "red");
                if (c != null) cards.Add(c);
            }
            JsonNode? extra = null;
            if (n >= P("ideo.deck.buybackFrom") && n < StoryStages.Count && equity < P("ideo.equityWarn")) extra = BuybackCard();
            else if (!slots.Contains("mid") && Random() < P("ideo.deck.mid"))
                extra = pool.FirstOrDefault(c => c.Str("side") == "mid" && c.On("when") && !cards.Contains(c));
            if (extra != null)
            {
                if (cards.Count < 4) cards.Add(extra);
                else cards[cards.Count - 2] = extra;
            }
            var options = new JsonArray();
            foreach (var card in cards)
            {
                if (card.On("id")) story["shown"]![card.Str("id")] = n;
                var option = (JsonObject)card.DeepClone();
                option.Remove("when");
                void AddBars(JsonNode branch, JsonNode? bonus)
                {
                    var fx = branch["fx"] ??= new JsonObject();
                    fx["ideo"] = Obj(("red", card["bars"].N("red") + bonus.N("red")), ("cap", card["bars"].N("cap") + bonus.N("cap")));
                }
                if (option["check"] != null || option["odds"] != null)
                    foreach (string key in new[] { "ok", "fail" }) AddBars(option[key]!, option[key]!["bars"]);
                else AddBars(option, null);
                options.Add(option);
            }
            return options;
        }
        private void AfterStoryPick(int n, JsonNode option)
        {
            var story = EnsureStory();
            string side = option.Str("side");
            ((JsonArray)story["picks"]!).Add(Obj(("n", n), ("side", side), ("label", option["label"])));
            if (option.On("id")) story["used"]![option.Str("id")] = 1;
            story["n"] = Max(story.N("n"), n);
            if (side == "red" || side == "cap")
            {
                var pool = Rows("staff").Where(e => e.On("red") == (side == "cap")).ToArray();
                if (pool.Length > 0 && Random() < P("ideo.follow." + side))
                {
                    var member = (JsonObject)Pick(pool);
                    if (side == "red") member["red"] = 1; else member.Remove("red");
                }
            }
            StoryNote(StoryText("ideo.pick.note", ("级", n), ("标题", StoryStages[n - 1].Str("title")), ("选项", option.Str("label")), ("进度", BarsLine())));
            if (n < StoryStages.Count) Schedule("ideo_" + (n + 1), t + 1); else ResolveStory();
        }
        public string? StoryVerdict()
        {
            if (Ideo == null) return null;
            double red = Ideo.N("red"), cap = Ideo.N("cap");
            if (red >= 100 && cap >= 100) return Ideo.On("full") ? Ideo.Str("full") : "red";
            return red > cap || red == cap && StoryLean().value > 0 ? "red" : "cap";
        }
        private void ResolveStory()
        {
            var story = EnsureStory();
            string want = StoryVerdict()!;
            string result = equity < P("ideo.equity") ? "fail" : want;
            story["on"] = 0; story["result"] = result; story["want"] = want; story["tEnd"] = t;
            if (Map("chains")["ideo"] is JsonObject chain) chain["done"] = true;
            var flags = VersionSettings["flag"];
            if (flags.On("chain")) Map("flags").Remove(flags.Str("chain"));
            if (result != "fail")
            {
                string? mission = FounderMission;
                if (mission != null)
                {
                    story["mission0"] = mission;
                    foreach (var item in Founder.Traits.Where(x => x!.ToString() == mission).ToArray()) Founder.Traits.Remove(item);
                }
                story["goal"] = VersionSettings["goal"].Str(result);
                Map("flags")[flags.Str(result)] = 1;
                if (result == "red")
                {
                    story["brand0"] = Map("co").ContainsKey("brand") ? Co["brand"]?.DeepClone() : Undefined;
                    Co["brand"] = VersionSettings["brand"]!.DeepClone();
                }
                else story["heat"] = 0;
                Award("road");
            }
            News(StoryText("ideo.news." + result, ("公司", Company.Name)));
            StoryNote(result == "fail" ? StoryText("ideo.end.note.fail", ("股权", Fixed(equity, 0))) :
                StoryText("ideo.end.note", ("结局", StoryText("ideo.end." + result)), ("进度", BarsLine())));
            // 结局先于清洗，两者都排在已入队事件之前。
            List("q").Insert(0, Obj(("type", "event"), ("id", "ideo_end_" + result)));
            if (result == "cap" && Rows("staff").Any(e => e.On("red")))
                List("q").Insert(1, Obj(("type", "event"), ("id", "ideo_purge")));
        }
        private string Situation(int n)
        {
            var bits = new List<string>();
            if (equity < P("ideo.equityWarn") && n < StoryStages.Count) bits.Add(StoryText("ideo.situation.equity", ("股权", Fixed(equity, 0))));
            double runway = Runway();
            if (runway < P("ideo.warn.runway")) bits.Add(StoryText("ideo.situation.cash", ("月数", Max(0, Floor(runway)))));
            if (HasHeat && Ideo.N("heat") >= P("ideo.heat.half")) bits.Add(StoryText("ideo.situation.heat", ("压力", RoundJs(Ideo.N("heat")))));
            if (n == StoryStages.Count) bits.Add(StoryText("ideo.situation.last"));
            return bits.Count == 0 ? "" : "\n\n" + StoryText("ideo.situation", ("局势", string.Join(StoryText("ideo.situation.sep"), bits)));
        }
        private double PlanValue(string kind) => kind switch { "users" => users, "model" => MyCap, "rev" => Revenue().N("total"), _ => 0 };
        private string PlanText(string kind, double value) => kind switch
        {
            "users" => StoryText("ideo.plan.goal.users", ("用户", UsersText(value))),
            "model" => StoryText("ideo.plan.goal.model", ("火候", Fixed(value, 1))),
            _ => StoryText("ideo.plan.goal.rev", ("收入", Money(value)))
        };
        private string LoyalText(string key, int count, params (string, object)[] vars) => count == 0 ? "" :
            StoryText("ideo.purge." + key + ".loyal", vars.Append(("死忠人数", (object)count)).ToArray());
        private string PurgeHint(string act, int count, int loyal)
        {
            string key = "ideo.purge.hint." + act;
            return StoryText(key, ("人数", count), ("走的人数", count - loyal),
                ("死忠", act == "fire_all" || act == "release" ? LoyalText("hint." + act, loyal) : ""));
        }
        private string Purge(string act)
        {
            var reds = Rows("staff").Where(e => e.On("red")).ToArray();
            int n = reds.Length, loyal = reds.Count(e => e.Str("quirk") == "loyal");
            double Param(string s) => P("ideo.purge." + s);
            double Salary(JsonNode e) => e.N("salary") * Mod("salaryMult");
            void Effects(params (string, JsonNode?)[] fields) => ApplyEffects(Obj(fields), new JsonObject());
            switch (act)
            {
                case "fire_all":
                    foreach (var e in reds) List("staff").Remove(e);
                    if (n > 0) AddDirt("unfair_fire", Obj(("sev", Min(Param("fireSevMax"), Param("fireSev") + n * Param("fireSevPer"))), ("name", StoryText("ideo.purge.dirt"))));
                    Effects(("morale", -(Param("fireMorale") + n * Param("fireMoralePer"))), ("rep", Param("fireRep")));
                    return StoryText("ideo.purge.fireAll", ("人数", n), ("死忠", LoyalText("fireAll", loyal, ("办公室", OfficeName(1)))));
                case "reeducate":
                    foreach (var e in reds) { ((JsonObject)e).Remove("red"); cash -= Param("eduMonths") * Salary(e); }
                    Effects(("morale", Param("eduMorale")));
                    return StoryText("ideo.purge.reeducate", ("人数", n));
                case "release":
                    foreach (var e in reds.Where(e => e.Str("quirk") != "loyal")) { cash -= Param("relMonths") * Salary(e); List("staff").Remove(e); }
                    foreach (var e in reds) ((JsonObject)e).Remove("red");
                    Effects(("rep", Param("relRep")), ("morale", Param("relMorale")));
                    return StoryText("ideo.purge.release", ("人数", n - loyal), ("死忠", LoyalText("release", loyal)));
                default:
                    Map("flags")[VersionSettings["flag"].Str("cell")] = 1;
                    Effects(("morale", Param("tolMorale")));
                    return StoryText("ideo.purge.tolerate", ("人数", n));
            }
        }
        private Dialog StoryDialog(string id, JsonObject ctx)
        {
            // 每次打开只复制本窗口。选项上保留卡池 ID，效果执行完再记账。
            JsonObject Window(JsonNode row, bool chain = true)
            {
                var ev = (JsonObject)row.DeepClone();
                ev["id"] = id; ev["cat"] = id == "ideo_entry" ? "money" : "ideo";
                if (chain) ev["chain"] = "ideo";
                return ev;
            }
            if (id == "ideo_entry")
            {
                var ev = Window(StoryWindow(id), false);
                ev["text"] = ev.Str("text") + "\n\n" + StoryText("ideo.entry.note", ("级数", StoryStages.Count),
                    ("底线", P("ideo.equity")), ("股权", Fixed(equity, 0)), ("提醒", equity < P("ideo.entry.warn") ? StoryText("ideo.entry.note.low") : ""));
                var buy = ((JsonArray)ev["options"]!).First(o => o.Str("fn") == "rofr")!;
                double share = buy["p"].N("份额"), price = Valuation() * share / 100 * buy["p"].N("溢价");
                buy["hint"] = tables.FillRuntime(buy.Str("hint"), null, ("价格", Money(price)), ("份额", share));
                buy["req"] = Obj(("cash", price / Unit));
                var fx = Obj(("cashAbs", -price), ("equity", share));
                foreach (var field in buy["fx"].Entries()) fx[field.Key] = field.Value?.DeepClone();
                buy["fx"] = fx;
                return EventDialog(ev, ctx, (o, win) =>
                {
                    if (o.Str("fn") == "accept") StartStory(0);
                    else if (o.Str("fn") == "stall" && !win) StartStory(o["p"].N("压力"));
                    else Map("flags")["ideoBlocked"] = 1;
                    return null;
                });
            }
            if (id == "ideo_plan_due")
            {
                var plan = Ideo?["plan"];
                string kind = plan.Str("kind");
                double now = PlanValue(kind);
                bool ok = plan != null && now >= plan.N("goal");
                ctx["ok"] = ok;
                var ev = Window(StoryWindow(ok ? "ideo_plan_ok" : "ideo_plan_fail"), false);
                if (kind == "users" || kind == "model" || kind == "rev")
                    ev["text"] = ev.Str("text") + "\n\n" + StoryText("ideo.plan.result", ("目标", PlanText(kind, plan.N("goal"))), ("实际", PlanText(kind, now)));
                return EventDialog(ev, ctx, (o, win) =>
                {
                    if (Ideo != null) { Ideo["plan"] = null; Ideo["plans"] = Ideo.N("plans") + 1; }
                    return null;
                });
            }
            if (id == "ideo_purge")
            {
                var ev = Window(Book["IDEO_ENDINGS"]!["purge"]!);
                ev.Remove("portrait");
                var reds = Rows("staff").Where(e => e.On("red")).ToArray();
                int loyal = reds.Count(e => e.Str("quirk") == "loyal");
                ev["text"] = ev.Str("text") + "\n\n" + StoryText("ideo.purge.list", ("人数", reds.Length), ("死忠", LoyalText("list", loyal)));
                foreach (var o in (JsonArray)ev["options"]!) o!["hint"] = PurgeHint(o.Str("act"), reds.Length, loyal);
                return EventDialog(ev, ctx, (o, win) => o.Str("text") + "\n\n" + Purge(o.Str("act")));
            }
            if (id.StartsWith("ideo_end_", StringComparison.Ordinal))
            {
                string result = id.Substring("ideo_end_".Length);
                var ev = Window(Book["IDEO_ENDINGS"]![result]!);
                EnsureStory();
                ev["text"] = ev.Str("text") + "\n\n" + (result == "fail" ?
                    StoryText("ideo.endLine.fail", ("进度", BarsLine()), ("股权", Fixed(equity, 0)), ("底线", P("ideo.equity"))) :
                    StoryText("ideo.endLine", ("进度", BarsLine()), ("目标", D("GOALS")[VersionSettings["goal"].Str(result)].Str("name"))));
                return EventDialog(ev, ctx);
            }
            int n = int.Parse(id.Substring("ideo_".Length));
            var stageRow = StoryStages[n - 1]!;
            var stageEvent = Window(stageRow);
            stageEvent["text"] = stageRow.Str("text") + Situation(n);
            stageEvent["options"] = StageOptions(stageRow, n);
            return EventDialog(stageEvent, ctx, (o, win) => { AfterStoryPick(n, o); return null; });
        }
    }
}
