using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using System.IO;
using System.Globalization;
using System.Text.RegularExpressions;

namespace Liandan.Kernel
{
    public sealed partial class Tables
    {
        internal JsonNode Definitions { get; }
        internal JsonNode Parameters { get; }
        internal JsonNode Texts { get; }
        internal JsonArray News { get; }
        internal Dictionary<string, JsonNode> Traits, Perks, Features;
        internal readonly Dictionary<string, JsonNode> Books = new Dictionary<string, JsonNode>();
        internal readonly List<JsonNode> Pool = new List<JsonNode>();
        internal readonly Dictionary<string, JsonNode> Events = new Dictionary<string, JsonNode>();
        internal readonly HashSet<string> RivalContext = new HashSet<string>();

        public Tables(string directory)
        {
            JsonNode Load(string name) => JsonNode.Parse(File.ReadAllText(Path.Combine(directory, name + ".json")))!;
            Definitions = Load("defs");
            Parameters = Load("params")["P"]!;
            Texts = Load("text")["TEXT"]!;
            var events = Load("events");
            News = (JsonArray)events["NEWS"]!;
            Dictionary<string, JsonNode> Index(IEnumerable<JsonNode?> rows) => rows.ToDictionary(r => r!.Str("id"), r => r!);
            Traits = Index(Definitions["TRAITS"].Entries().SelectMany(p => (JsonArray)p.Value!));
            Perks = Index((JsonArray)Definitions["PERKS"]!);
            Features = Index((JsonArray)Definitions["FEATURES"]!);
            Books["cn"] = Load("ideology_cn");
            Books["us"] = Load("ideology_us");
            FillDescriptions(events);
            void Register(JsonNode? rows, bool core = false)
            {
                if (!(rows is JsonArray list)) return;
                foreach (var item in list)
                {
                    var ev = item!;
                    var id = ev.Str("id");
                    Events[id] = ev;
                    if (ev.N("weight", 1) > 0) Pool.Add(ev);
                    // 系统脚本可把正文和选项替换为函数，函数本身不参与占位符搜索。
                    bool dynamicText = core && (ev.On("textBay") || new[] { "intro", "chepole_1", "chepole_2", "chepole_3", "chepole_4", "year_board", "broke", "coup", "acq_offer", "vam_due" }.Contains(id));
                    var opts = ev["options"] as JsonArray;
                    bool dynamicOptions = core && opts != null && opts.Any(o => o.On("fn") || o.On("noTip") || o.On("when") || (o.Str("label") + o.Str("hint")).Contains("{"));
                    string template = dynamicText ? "" : ev.Str("text") + (dynamicOptions ? "" : opts?.ToJsonString());
                    if (template.Contains("{rival}") || template.Contains("{boss}")) RivalContext.Add(id);
                }
            }
            Register(events["EVENTS_CORE"], true);
            Register(Load("chains")["EVENTS_CHAINS"]);
            Register(events["EVENTS_PACK"]);
            foreach (var book in new[] { Books["cn"], Books["us"] })
                foreach (var key in new[] { "IDEO_EVENTS", "UTOPIA_EVENTS", "BCI_EVENTS", "SCARE_EVENTS" }) Register(book[key]);
            var dynamicIds = Enumerable.Range(1, ((JsonArray)Books["cn"]["IDEO_STAGES"]!).Count).Select(i => "ideo_" + i)
                .Concat(new[] { "ideo_end_red", "ideo_end_cap", "ideo_end_fail", "ideo_purge", "ideo_plan_due", "ideo_entry" });
            foreach (var id in dynamicIds) Events[id] = Js.Obj(("id", id));
        }
        internal string Text(string key, bool bay, params (string key, object value)[] vars)
        {
            var row = Texts[key] ?? throw new KeyNotFoundException(key);
            return Regex.Replace(bay ? row.Str("bay", row.Str("text")) : row.Str("text"), @"\{([^{}\s]+)\}", m =>
            {
                foreach (var v in vars) if (v.key == m.Groups[1].Value) return Convert.ToString(v.value, CultureInfo.InvariantCulture)!;
                return FillRef(m.Value, null, false);
            });
        }
    }
}
