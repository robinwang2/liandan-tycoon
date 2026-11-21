using System;
using System.Linq;
using System.Text.Json.Nodes;
using static Liandan.Kernel.Js;

namespace Liandan.Kernel
{
    public sealed partial class GameState
    {
        // 调用者传入外层随机数发生器；开局只从它抽一次，随后全部推进 rs。
        public static GameState NewGame(Tables tables, JsonNode setup, JsonNode? meta, Func<double> outerRandom)
        {
            var state = new GameState(new JsonObject(), tables);
            state.Start(setup, meta?["own"], unchecked((int)(uint)(outerRandom() * 4294967296.0)));
            return state;
        }

        private string OfficeName()
        {
            var name = D("OFFICES")[(int)Company.Office]!["name"]!;
            if (name is JsonValue) return name.ToString();
            foreach (var id in Founder.Traits.Select(n => n!.ToString()))
                if (Company.Office == 1 && D("START_OFFICE").On(id) && tables.Traits[id].Str("region") == Region)
                    return D("START_OFFICE").Str(id);
            return name.Str(Region);
        }

        private void Start(JsonNode setup, JsonNode? own, int seed)
        {
            var traits = new JsonArray();
            foreach (var id in (JsonArray)setup["traits"]!)
                if (tables.Traits.ContainsKey(id!.ToString())) traits.Add(id.DeepClone());
            string Default(string key, string fallback) => setup.On(key) ? setup.Str(key) : fallback;
            Snapshot["founder"] = Obj(("name", setup["name"]), ("attrs", setup["attrs"]), ("traits", traits), ("outfit", Default("outfit", "turtleneck")));
            Snapshot["co"] = Obj(("name", setup["coName"]), ("region", setup["region"]), ("route", setup["route"]), ("track", setup["track"]),
                ("office", 1), ("modelName", Default("modelName", tables.Text("default.model", false))), ("logo", setup.On("logo") ? setup["logo"] : null), ("brand", Default("brand", "#ff6b4a")));
            foreach (var k in "model furnace upstream sprint vam over".Split(' ')) Snapshot[k] = null;
            foreach (var k in "staff cands dirt perks feats projects temp rivals sched q fxq log hist ach".Split(' ')) Snapshot[k] = new JsonArray();
            foreach (var k in "chains flags seen cd".Split(' ')) Snapshot[k] = new JsonObject();
            foreach (var k in "stage raiseBoost apNext burstT outage fake E gpu quotaAdd quotaEarn exposed exposedCrime".Split(' ')) Snapshot[k] = 0;
            Snapshot["policies"] = Obj(("work", "965"), ("price", "std"), ("safety", "std"));
            Snapshot["last"] = Obj(("rev", 0), ("cost", 0), ("net", 0));
            Snapshot["streak"] = Obj(("profit", 0), ("x996", 0));
            Snapshot["stats"] = Obj(("maxUsers", 0), ("raised", 0), ("events", 0));
            Snapshot["v"] = 1; rs = seed; t = uid = apiIdx = 1;
            equity = 100; ap = 3;
            Snapshot["lastRaiseT"] = -9; Snapshot["lastReleaseT"] = -9;
            Snapshot["hadDirt"] = false;
            var region = D("REGIONS")[Region]!;
            cash = region.N("cash"); quotaBase = region.N("quota");
            foreach (var k in "hype rep morale reg bubble".Split(' ')) Snapshot[k] = P("start." + k);
            bool model = Company.Route == "model";
            Snapshot["ownModel"] = model;
            users = P(model ? "start.usersModel" : "start.usersApp");
            quality = P(model ? "start.qualityModel" : "start.qualityApp");
            gpuBase = P("start.gpuPrice");
            foreach (var id in traits)
                foreach (var a in tables.Traits[id!.ToString()]["attr"].Entries())
                    A[a.Key] = A.N(a.Key) + (double)a.Value!;
            foreach (var r in (JsonArray)D("RIVALS"))
            {
                double off = r.N("off") + Between(-P("start.rivalJitter"), P("start.rivalJitter")), cap = Frontier(1) + off;
                List("rivals").Add(Obj(("id", r!["id"]), ("name", r["name"]), ("boss", r["boss"]), ("model", r["model"]), ("color", r["color"]),
                    ("off", off), ("drift", 0), ("cheat", r["cheat"]), ("ver", Integer(P("start.rivalVerMin"), P("start.rivalVerMax"))),
                    ("cap", cap), ("bench", cap + r.N("cheat")), ("hype", P("start.rivalHype")), ("rel", 0), ("next", Integer(P("start.rivalNextMin"), P("start.rivalNextMax")))));
            }
            Snapshot["upstream"] = Pick(Region == "sz" ? new[] { "deepsleep", "bytejump", "openbi" } : new[] { "openbi", "misan", "goggle" });
            if (model)
            {
                double cap = Cap(BaseE + E);
                Snapshot["model"] = Obj(("cap", cap), ("bench", cap), ("ver", 1), ("name", Company.ModelName + "-1"), ("infl", 0));
                gpu = P("start.gpu");
                Snapshot["furnace"] = Obj(("on", true), ("data", "open"), ("months", 0));
            }
            foreach (var id in traits)
            {
                var st = tables.Traits[id!.ToString()]["start"];
                if (st == null) continue;
                cash += st.N("cash");
                if (st.On("cashMult")) cash *= st.N("cashMult");
                ApplyEffects(Obj(("rep", st.N("rep")), ("hype", st.N("hype")), ("tech", st.N("tech"))), new JsonObject());
                users += st.N("users");
                if (st.On("dirt")) AddDirt(st["dirt"] is JsonObject dirt ? dirt.Str("type") : st.Str("dirt"), st["dirt"] as JsonObject);
                equity += st.N("equity");
                if (st.On("reg")) reg = Clamp(reg + st.N("reg"), 0, P("reg.max"));
                if (st.On("debt")) { Map("flags")["loaned"] = 1; Schedule("debt_due", st.N("debt")); }
                foreach (var role in st["staff"] as JsonArray ?? new JsonArray())
                {
                    var e = role is JsonValue ? GenStaff(role.ToString(), 1) : GenStaff(role.Str("role"), role.N("bonus"));
                    if (role is JsonObject) { e["quirk"] = "loyal"; e["salary"] = FixedNumber(e.N("salary") * P("start.partnerPay"), 1); }
                    List("staff").Add(e);
                }
            }
            if (own.On("m_cash")) cash += P("meta.cash");
            if (own.On("m_gpu")) quotaBase *= P("meta.gpu");
            if (own.On("m_revive")) Map("flags")["revive"] = 1;
            List("q").Add(Obj(("type", "event"), ("id", "intro")));
            if (own.On("m_perk")) List("q").Add(Obj(("type", "draft")));
            if (Region == "bay") Schedule("chepole_1", P("event.chepoleAt"));
            Schedule("leather_rumor", Integer(P("event.leatherFrom"), P("event.leatherTo")));
            ideoAt = Integer(P("ideo.entry.from"), P("ideo.entry.to"));
            RefreshCandidates();
            ap = P("ap.base") + (A.N("mgmt") >= P("ap.mgmtLine") ? P("ap.mgmtBonus") : 0) + Mod("apAdd");
            if (setup.On("tutorial")) Snapshot["tut"] = Obj(("on", true), ("open", new JsonObject()), ("queue", new JsonArray()), ("dirt0", List("dirt").Count));
            News(Tx("news.founded", ("公司", Company.Name), ("地区", region.Str("name")), ("办公室", OfficeName())));
        }
        private void Schedule(string id, double at) => List("sched").Add(Obj(("id", id), ("at", at)));
    }
}
