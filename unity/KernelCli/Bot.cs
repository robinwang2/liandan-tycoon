using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Liandan.Kernel;
using static Liandan.Kernel.Js;

internal sealed class Bot
{
    private readonly Action<string, JsonNode?> put;
    private readonly bool shady;
    private readonly string style;
    private readonly HashSet<string> actions;
    private readonly string[] pool;
    private int randomState;
    internal GameState State { get; }
    private JsonObject S => State.Snapshot;
    private double Random() => GameState.NextRandom(ref randomState);
    private int Index(int count) => (int)(Random() * count);

    internal Bot(Tables tables, HashSet<string> actions, MatchSpec spec, Action<string, JsonNode?> put)
    {
        this.actions = actions;
        this.put = put;
        style = spec.Style;
        shady = style == "shady";
        var middle = shady ? "navy fakeusers digdirt furnace" : "wash";
        pool = ("hype ads code teambuild roadshow goodpr lobby pie sellcourse subsidy beg paper " + middle +
            " mobilize utopia selfcrit subbotnik plan yank bci buyback costcut spinoff").Split(' ');
        uint hash = 2166136261;
        foreach (char unit in spec.Key) hash = unchecked((hash ^ unit) * 16777619);
        randomState = unchecked((int)hash);
        State = GameState.NewGame(tables, MakeSetup(spec), new JsonObject(), Random);
    }

    private JsonObject MakeSetup(MatchSpec spec)
    {
        var keys = "tech cha mgmt biz net luck".Split(' ');
        var attrs = new JsonObject();
        foreach (var key in keys) attrs[key] = 5;
        for (int i = 0; i < 10; i++)
        {
            string key;
            do { key = keys[Index(keys.Length)]; } while (attrs.N(key) >= 10);
            attrs[key] = attrs.N(key) + 1;
        }
        string Pick(params string[] choices) => choices[Index(choices.Length)];
        return new JsonObject
        {
            ["name"] = "测试员", ["coName"] = "混沌智能", ["modelName"] = "混沌",
            ["region"] = spec.Region, ["route"] = spec.Route, ["track"] = spec.Track,
            ["attrs"] = attrs, ["style"] = style, ["traits"] = new JsonArray(
                Pick("yao", "dropout", "phd", "shuangfei"), Pick("bigtech", "lab", "serial", "hqb", "influencer"),
                Pick("none", "juan", "huyou", "geek", "foxi"))
        };
    }

    internal void Drain(GameState.Dialog? first = null)
    {
        var dialog = first ?? State.NextDialog();
        for (int i = 0; dialog != null && i < 60; i++)
        {
            var view = dialog.View;
            put("对话框", view);
            var options = view["options"]!.AsArray();
            var allowed = Enumerable.Range(0, options.Count).Where(n => !options[n].On("disabled")).ToArray();
            if (allowed.Length == 0)
            {
                if (!view.On("closable")) throw new InvalidDataException("对话框没有可选项：" + view.Str("title"));
                dialog = State.NextDialog();
                continue;
            }
            void Prefer(Func<JsonNode?, bool> predicate)
            {
                var subset = allowed.Where(n => predicate(options[n])).ToArray();
                if (subset.Length > 0) allowed = subset;
            }
            if (!shady) Prefer(o => !(o.Str("label") + o.Str("hint")).Contains('☠'));
            Prefer(o => !o.Str("label").Contains("接受邀请"));
            if (view.Str("id") is "broke" or "acq_offer" or "probe")
                Prefer(o => !Regex.IsMatch(o.Str("label"), "认输|卖了|出国|抬价"));
            int pick = allowed[Index(allowed.Length)];
            var result = State.Choose(dialog, pick);
            put("选择", new JsonArray(pick, result));
            dialog = dialog.Next ?? State.NextDialog();
        }
    }

    private bool Act(string id)
    {
        if (!State.Show(id) || State.ActionState(id).On("why")) return false;
        var result = State.Perform(id, out var dialog);
        put("行动", new JsonArray(id, result));
        Drain(dialog);
        return true;
    }

    private JsonArray CheckHints()
    {
        var hints = State.Advise();
        put("提示", hints);
        var seen = new HashSet<string>();
        foreach (var h in hints)
        {
            if (!h.On("id") || !h.On("title") || !h.On("text") || h.Str("lv") is not ("bad" or "gold" or "warn"))
                throw new InvalidDataException("提示格式不对：" + h);
            if (!seen.Add(h.Str("id"))) throw new InvalidDataException("提示 id 重复：" + h.Str("id"));
            if (Regex.IsMatch(h.Str("title") + h.Str("text"), @"undefined|NaN|null|\[object"))
                throw new InvalidDataException("提示文本可疑：" + h);
            if (h.On("act") && !actions.Contains(h.Str("act"))) throw new InvalidDataException("提示指向不存在的行动：" + h.Str("act"));
        }
        return hints;
    }

    internal void PlayMonth()
    {
        var hints = CheckHints();
        if (style == "advice")
            foreach (var h in hints)
            {
                if (S.N("ap") <= 0 || S.On("over")) break;
                if (h.On("act") && !h.On("later")) Act(h.Str("act"));
                else if (h.Str("id") == "hire") State.Hire(h.Str("hl")[4..]);
                else if (h.Str("id").StartsWith("proj-", StringComparison.Ordinal)) State.PushProject(h.Str("hl")[5..]);
            }
        if (S.On("ownModel"))
        {
            double budget = Math.Max(0, S.N("cash")) / (14 * State.ReadBotValue("gpuPrice"));
            State.SetGpu(Math.Max(State.ReadBotValue("inferNeed") * 1.1, Math.Min(State.ReadBotValue("quota"), budget)));
        }
        var projects = S["projects"]!.AsArray();
        for (int i = 0; i < projects.Count; i++)
            if (projects[i].Str("kind") == "ap" && S.N("ap") > 0 && Random() < 0.7)
                State.PushProject(projects[i].Str("uid"));
        for (int guard = 1; guard <= 12 && S.N("ap") > 0 && !S.On("over"); guard++)
        {
            double runway = State.ReadBotValue("runway");
            if ((runway < 9 || S.N("t") - S.N("lastRaiseT") > 10) && Act("raise")) continue;
            int staff = S["staff"]!.AsArray().Count;
            if (staff >= State.ReadBotValue("teamCap") && S.N("cash") > 8 * State.ActionState("office").N("cost") && Act("office")) continue;
            var candidates = S["cands"]!.AsArray();
            if (runway > 7 && staff < State.ReadBotValue("teamCap") && candidates.Count > 0 && S.N("ap") >= 1)
            {
                var result = State.Hire(candidates.MaxBy(c => c.N("skill")).Str("uid"));
                if (result != null && !result.On("err")) continue;
            }
            if (Act("release") || Act("ipo") || (!S.On("sprint") && Act("sprint"))) continue;
            if (!S.On("ownModel") && S.N("stage") >= 3 && Random() < 0.3 && Act("selfdev")) continue;
            // 先从完整池抽，再查可见性与可用性，失败同样消耗随机数和循环次数。
            if (!Act(pool[Index(pool.Length)]) && guard > 8) break;
        }
        if (S.On("over")) return;
        if (S["streak"].N("profit") < 3 && S.N("stage") >= 5 && S["policies"].Str("price") != "premium")
            State.SetPolicy("price", "premium");
        State.EndMonth();
        Drain();
    }
}
