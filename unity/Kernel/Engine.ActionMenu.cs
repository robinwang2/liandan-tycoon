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
        private int LastRound => ((JsonArray)D("STAGES")).Count - 2;
        private int MaxOffice => ((JsonArray)D("OFFICES")).Count - 1;
        private int NextOffice => (int)Company.Office + 1;
        private JsonArray? Floors(int level) => D("FLOOR_PLANS")[level.ToString()] as JsonArray;
        private string StageName(double index) => D("STAGES")[(int)index].Str("name");
        private bool OwnModel => Snapshot.On("ownModel");
        public double MyCap => Cap(BaseE + E);
        public bool SprintIdle => Block("sprint")==null;
        public double FurnaceGain => Snapshot["furnace"].On("on") ? Max(0,gpu-InferNeed)*ResearchEff*D("DATA_SOURCES")[Snapshot["furnace"].Str("data")].N("mult") : 0;
        public double FurnaceCapChange => Cap(BaseE+E+FurnaceGain)-MyCap;
        private double QualityCeiling => P("quality.ceil0") + P("quality.ceilK") * UsedCap;
        private double CodeGain(JsonNode? p) => (p.N("基础") + A.N("tech") * p.N("每点技术")) * Max(p.N("最低比例"), 1 - quality / QualityCeiling);
        private double CourseIncome(JsonNode? p) => (p.N("基础") + users * p.N("每万用户") + hype) * (1 + p.N("每点商业") * (A.N("biz") - 5));
        private double AdsGain(JsonNode? p) => Max(p.N("用户最少"), users * p.N("用户比例")) * JsMath.Pow(Mod("growthMult"), P("users.growModExp")) * (p.N("体验基础") + quality / p.N("体验除数"));
        private JsonNode? WorstDirt => Rows("dirt").OrderByDescending(d => d.N("sev")).FirstOrDefault();
        public string DateText(double month) => tables.Text("date", false, ("年", P("START_YEAR") + Floor((month - 1) / 12)), ("月", (month - 1) % 12 + 1));
        private string StoryVersion => Ideo.Str("v", Region == "bay" ? "us" : "cn");
        private JsonNode Book => tables.Books[StoryVersion];
        public string InterfaceTheme => Ideo.Str("result") switch { "red" => StoryVersion == "us" ? "rose" : "soviet", "cap" => "cold", _ => "default" };
        private JsonNode StoryWindow(string id) => ((JsonArray)Book["SYS_EVENTS"]!).First(w => w.Str("id") == id)!;
        public string StoryText(string key, params (string, object)[] vars) => tables.Text(key, Book == tables.Books["us"], vars);
        private string RouteActionText(string id) => Book["ACT_TEXT"]![id] is JsonArray lines && lines.Count > 0 ? Pick(lines.ToArray())!.ToString() : "";

        public bool Show(string id)
        {
            var row = tables.ActionRows[id];
            if (row.On("region") && Region != row.Str("region")) return false;
            bool red = Ideo.Str("result") == "red", capital = Ideo.Str("result") == "cap";
            return id switch
            {
                "selfdev" => !OwnModel,
                "release" or "furnace" or "beg" or "sweep" or "paper" => OwnModel,
                "ipo" => stage >= row["p"].N("显示轮次"),
                "utopia" => red && !Flag("utopia_on"),
                "mobilize" or "plan" or "selfcrit" or "subbotnik" => red,
                "yank" => capital && !Flag("yank"),
                "bci" => capital && !Flag("bci_on"),
                "spinoff" => capital && !Flag("spinoff"),
                "buyback" or "costcut" => capital,
                _ => true
            };
        }
        private double ActionCost(string id)
        {
            var p = tables.ActionRows[id]["p"];
            return id switch
            {
                "selfdev" or "headhunt" or "teambuild" or "bci" => Max(p.N("最少"), p.N("月数") * Unit),
                "ads" => Max(p.N("花费最少"), p.N("月数") * Unit),
                "office" when NextOffice <= MaxOffice => D("OFFICES")[NextOffice].N("up") * Mod("rentMult"),
                "lobby" or "goodpr" or "navy" or "fakeusers" or "digdirt" => p.N("月数") * Unit,
                "sweep" => Quota * ReadBotValue("gpuPrice") * p.N("倍数"),
                "utopia" => p.N("花费"),
                "buyback" => Valuation() * p.N("比例"),
                _ => 0
            };
        }
        private string? Block(string id)
        {
            var p = tables.ActionRows[id]["p"];
            double since = t - Snapshot.N("lastRaiseT");
            return id switch
            {
                "release" when MyCap - Model.N("cap") < p.N("火候门槛") => ButtonText("release.block", ("门槛", p.N("火候门槛"))),
                "selfdev" or "spinoff" when stage < p.N("轮次") => ButtonText(id + ".block", ("轮次", StageName(p.N("轮次")))),
                "sprint" when Snapshot.On("sprint") => ButtonText("sprint.blockBusy"),
                "sprint" when tables.Features.Keys.All(k => Rows("feats").Any(f => f.ToString() == k)) => ButtonText("sprint.allDone"),
                "office" when NextOffice > MaxOffice => ButtonText("office.block"),
                "raise" when stage >= LastRound => ButtonText("raise.ipo"),
                "raise" when since < p.N("间隔") => ButtonText("raise.wait", ("月", p.N("间隔") - since)),
                "roadshow" when stage >= LastRound => ButtonText("roadshow.noRound"),
                "roadshow" when raiseBoost >= p.N("上限") => ButtonText("roadshow.max"),
                "ipo" when stage < LastRound => ButtonText("ipo.needRound", ("轮次", StageName(LastRound))),
                "ipo" when Map("streak").N("profit") < p.N("盈利月数") => ButtonText("ipo.needProfit", ("月", p.N("盈利月数"))),
                "ipo" when Performance() < p.N("业绩线") => ButtonText("ipo.needPerf", ("业绩", Fixed(Performance(),2)), ("门槛", Fixed(p.N("业绩线"),1))),
                "wash" or "selfcrit" when List("dirt").Count == 0 => ButtonText(id + ".empty"),
                "plan" when Ideo.On("plan") => ButtonText("plan.busy", ("日期", DateText(Ideo!["plan"].N("due")))),
                "buyback" when equity >= p.N("上限") => ButtonText("buyback.full"),
                _ => null
            };
        }
        private string? ActionWhy(string id, double cost) => ap < tables.ActionRows[id].N("ap") ? ButtonText("common.noAp") :
            Map("cd").On(id) ? ButtonText("common.cooldown", ("月", Map("cd").N(id) - t)) : cost > cash ? ButtonText("common.noCash") : Block(id);
        public JsonObject ActionState(string id)
        {
            double cost = ActionCost(id);
            return Obj(("cost", cost), ("why", ActionWhy(id, cost)));
        }
        public string ActName(string id)
        {
            var row = tables.ActionRows[id];
            return Region == "bay" ? row.Str("us", row.Str("name")) : row.Str("name");
        }
        public string ActionDescription(string id)
        {
            var row = tables.ActionRows[id]; var p = row["p"]; var sprint = OptionalRecord("sprint");
            var vars = new List<(string, object)>();
            void Set(string key, object value) => vars.Add((key, value));
            if (row["check"] is JsonNode c) Set("成功率", RoundJs(Check(c.Str("attr"), c.N("dc")) * 100));
            switch (id)
            {
                case "code": Set("体验", Fixed(CodeGain(p),1)); Set("天花板", Fixed(QualityCeiling,0)); Set("丹炉", OwnModel ? ButtonText("code.furnace") : ""); break;
                case "release": Set("火候", Fixed(MyCap,1)); Set("现役", Model == null ? ButtonText("release.none") : Fixed(Model.N("cap"),1)); break;
                case "furnace": Set("数据", D("DATA_SOURCES")[Snapshot["furnace"].Str("data","open")].Str("name")); break;
                case "sprint" when sprint != null: return ButtonText("sprint.busy", ("功能", tables.Features[sprint.Str("id")].Str("name")), ("进度", RoundJs(sprint.N("done") / sprint.N("need") * 100)));
                case "teambuild": Set("士气", p.N("士气") + RoundJs(A.N("mgmt") / p.N("每几点管理加一"))); break;
                case "office":
                    if (NextOffice > MaxOffice) return ButtonText("office.top", ("办公室", OfficeName(MaxOffice)));
                    var office = D("OFFICES")[NextOffice];
                    Set("办公室", OfficeName(NextOffice)); Set("人数", office.N("cap")); Set("月租", Money(office.N("rent") * Mod("rentMult")));
                    Set("楼层", Floors(NextOffice) is JsonArray floors ? ButtonText("office.floors", ("层数", floors.Count), ("分法", ButtonText(NextOffice == MaxOffice ? "office.floors.top" : "office.floors.split"))) : ""); break;
                case "raise":
                    if (stage >= LastRound) return ButtonText("raise.top", ("轮次", StageName(LastRound)));
                    Set("轮次", StageName(stage + 1)); Set("估值", Money(Valuation())); break;
                case "roadshow": Set("累计", RoundJs(raiseBoost * 100)); break;
                case "ipo": Set("轮次", StageName(LastRound)); Set("盈利", Map("streak").N("profit")); Set("门槛", Fixed(p.N("业绩线"),1)); Set("业绩", Fixed(Performance(),2)); break;
                case "sellcourse": Set("进账", Money(CourseIncome(p))); break;
                case "subsidy": Set("补贴", Money(Max(p.N("最少"), p.N("月数") * Unit))); break;
                case "lobby": Set("监管", RoundJs(p.N("基础") + A.N("net") * p.N("每点人脉"))); break;
                case "hype": Set("热度", RoundJs((p.N("基础") + A.N("cha") * p.N("每点口才")) * Mod("hypeGainMult"))); break;
                case "ads": Set("用户", UsersText(AdsGain(p))); break;
                case "fakeusers": Set("用户", UsersText(Max(p.N("最少"), users * p.N("比例")))); break;
                case "selfcrit":
                    var dirt = WorstDirt;
                    if (dirt == null) return ButtonText("selfcrit.noDirt");
                    Set("黑料", dirt.Str("name")); Set("士气", RoundJs(p.N("士气基础") + dirt.N("sev") / p.N("每几点严重度"))); break;
                case "subbotnik" when sprint != null: return ButtonText("subbotnik.sprint", ("功能", tables.Features[sprint.Str("id")].Str("name")));
                case "plan":
                    var w = StoryWindow("ideo_plan");
                    var ups = ((JsonArray)w["options"]!).Select(o => FixedNumber(Values(o!["fx"]?["temp"] ?? new JsonArray()).FirstOrDefault().N("mult",1) * 100 - 100,6)).ToArray();
                    Set("月数", w["p"].N("月数")); Set("最少", ups.Min()); Set("最多", ups.Max()); break;
                case "bci": Set("用途", ButtonText(OwnModel ? "bci.use.model" : "bci.use.app")); break;
                case "spinoff": Set("到账", Money(Valuation() * p.N("比例"))); break;
            }
            return tables.FillRuntime(row.Str(Region == "bay" ? "descBay" : "desc", row.Str("desc")), row, vars.ToArray());
        }
        public JsonArray ViewMenu()
        {
            var menu = new JsonArray();
            foreach (var row in (JsonArray)tables.Actions["ACTIONS"]!)
            {
                string id = row.Str("id");
                if (!Show(id)) { menu.Add(Obj(("id", id), ("show", false))); continue; }
                var entry = ActionState(id);
                entry["id"] = id; entry["name"] = ActName(id); entry["desc"] = ActionDescription(id);
                menu.Add(entry);
            }
            return menu;
        }
    }
}
