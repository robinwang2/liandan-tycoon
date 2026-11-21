using System;
using System.Linq;
using System.Text.Json.Nodes;
using static System.Math;
using static Liandan.Kernel.Js;

namespace Liandan.Kernel
{
    public sealed partial class GameState
    {
        private string SystemText(string key) => tables.SystemTexts.Str(key);
        // 弹窗时求值一次。报价、裁员前的月支出、对赌目标都随闭包保留到选择时。
        private JsonObject EventVars(string id, JsonNode? p, JsonObject ctx)
        {
            var v = new JsonObject();
            switch (id)
            {
                case "intro": v["办公室"] = OfficeName(); v["开场白"] = SystemText(Snapshot["tut"].On("on") ? "intro.tut" : "intro.plain"); break;
                case "chepole_1":
                case "chepole_2":
                case "chepole_3":
                case "chepole_4":
                    v["同事们"] = SystemText(List("staff").Count > 0 ? "chepole.who.staff" : "chepole.who.alone"); break;
                case "year_board": v["与会者"] = SystemText(stage != 0 ? "year_board.board" : "year_board.alone"); break;
                case "broke":
                    v["现金"] = Money(cash); v["旧账"] = Flag("loaned") ? SystemText("broke.loaned") : ""; v["月支出"] = Unit; break;
                case "bubble_burst":
                    if (Runway() < p.N("裸泳线")) Map("flags")["nakedSwim"] = 1;
                    bubble = p.N("泡沫降到"); burstT = t; hype *= p.N("热度保留"); Map("flags")["winter"] = 1;
                    List("temp").Add(Obj(("key", "raiseMult"), ("mult", p.N("融资估值")), ("until", t + p.N("寒冬月数"))));
                    foreach (var r in Rows("rivals")) r["hype"] = r.N("hype") * p.N("对手热度保留");
                    News(SystemText("bubble_burst.news")); break;
                case "coup": v["员工态度"] = SystemText(morale >= p.N("士气线") ? "coup.hint.hi" : "coup.hint.lo"); break;
                case "acq_offer":
                    double offer = Valuation() * Between(p.N("报价下限"), p.N("报价上限"));
                    ctx["offer"] = offer; v["报价"] = Money(offer); v["到手"] = Money(offer * equity / 100); break;
                case "vam_due":
                    double target = Snapshot["vam"].N("target"), now = users + fake;
                    ctx["target"] = target; ctx["now"] = now; ctx["met"] = now >= target;
                    v["目标"] = UsersText(target); v["现在"] = UsersText(now);
                    v["投资人反应"] = SystemText(now >= target ? "vam_due.met" : "vam_due.miss");
                    v["惩罚"] = Max(p.N("最少惩罚"), RoundJs(p.N("惩罚股权") * Mod("vamMult"))); break;
            }
            return v;
        }
        private bool ShowOption(string id, string fn, JsonNode? p, JsonNode ctx)
        {
            if (id == "broke" && fn == "beg") return equity > p.N("股权高于") && !Flag("begged");
            if (id == "vam_due" && fn.Length > 0) return fn == "met" ? ctx.On("met") : !ctx.On("met");
            if (id == "agi" && fn.Length > 0) return (fn == "safe") == (Map("policies").Str("safety") == "strict" || Flag("aligned"));
            return true;
        }
        private void RunOption(string id, string fn, bool win, JsonNode? fx, JsonObject ctx, JsonNode? p, JsonNode? ep, JsonObject vars)
        {
            void Apply() => ApplyEffects(fx, ctx);
            void FillCash() => cash = Max(0, cash) + p.N("到账") * vars.N("月支出");
            void Penalty(double amount)
            {
                var merged = Obj(("equity", -amount));
                foreach (var pair in fx.Entries()) merged[pair.Key] = pair.Value?.DeepClone();
                ApplyEffects(merged, ctx);
            }
            switch (id + "/" + fn)
            {
                case "chepole_4/never": Apply(); List("q").Insert(0, Obj(("type", "event"), ("id", "chepole_never"))); Award("chepole"); break;
                case "leather_rumor/support": Apply(); Award("leather"); break;
                case "broke/loan": FillCash(); Map("flags")["loaned"] = 1; Schedule("debt_due", t + p.N("期限")); break;
                case "broke/beg": FillCash(); equity -= p.N("让出股权"); Map("flags")["begged"] = 1; break;
                case "broke/layoff":
                    int n = (List("staff").Count + 1) / 2;
                    for (int i = 0; i < n; i++) List("staff").Remove(Pick(Rows("staff").ToArray()));
                    FillCash(); Apply(); vars["n"] = n; break;
                case "crackdown/comply": Apply(); reg = p.N("监管设为"); break;
                case "crackdown/bribe":
                    if (win) { reg = p.N("监管设为"); Apply(); } else { Apply(); reg = p.N("失败监管设为"); }
                    break;
                case "crackdown/fight": if (win) reg = p.N("监管设为"); Apply(); break;
                case "coup/showdown" when !win:
                case "coup/rally":
                    if (morale >= ep.N("士气线")) { Award("comeback"); Apply(); vars["员工的反应"] = SystemText("coup.rally.ok"); }
                    else { EndGame("ousted"); vars["员工的反应"] = SystemText("coup.rally.fail"); }
                    break;
                case "acq_offer/sell":
                case "acq_offer/raise" when win:
                    EndGame("acquired"); Snapshot["over"]!["pay"] = ctx.N("offer") * (fn == "sell" ? 1 : p.N("抬价倍数")) * equity / 100; break;
                case "vam_due/met": Snapshot["vam"] = null; Apply(); break;
                case "vam_due/pay": Snapshot["vam"] = null; Penalty(vars.N("惩罚")); break;
                case "vam_due/fake": Snapshot["vam"] = null; fake += ctx.N("target") - ctx.N("now"); Apply(); break;
                case "vam_due/delay":
                    if (win) Snapshot["vam"]!["due"] = t + p.N("延期"); else { Snapshot["vam"] = null; Penalty(vars.N("惩罚") + p.N("加罚")); }
                    break;
                case "probe/coop": if (win) Snapshot["exposedCrime"] = p.N("涉案降到"); Apply(); break;
                case "agi/sandbox": Map("flags")["aligned"] = 1; Map("policies")["safety"] = "strict"; Schedule("agi", t + p.N("对齐月数")); Apply(); break;
                default: Apply(); break;
            }
        }
    }
}
