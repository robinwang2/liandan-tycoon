using System;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using static Liandan.Kernel.Js;

namespace Liandan.Kernel
{
    public sealed class GameStore
    {
        public const string SaveKey = "ldt_save_v1", MetaKey = "ldt_meta_v1";
        private readonly string directory;
        private readonly Tables tables;
        public GameStore(string directory, Tables tables) { this.directory = directory; this.tables = tables; }
        private string PathOf(string key) => Path.Combine(directory, key + ".json");
        private JsonObject? Read(string key)
        {
            var path = PathOf(key);
            try { return File.Exists(path) ? JsonNode.Parse(File.ReadAllText(path)) as JsonObject : null; }
            catch (JsonException) { return null; }
        }
        private void Write(string key, string json)
        {
            Directory.CreateDirectory(directory);
            string path = PathOf(key), temp = path + ".tmp";
            File.WriteAllText(temp, json);
            if (File.Exists(path)) File.Replace(temp, path, null); else File.Move(temp, path);
        }
        public JsonObject LoadMeta()
        {
            var meta = Obj(("points", 0), ("own", new JsonObject()), ("ach", new JsonObject()), ("ends", new JsonObject()), ("runs", 0), ("best", 0));
            foreach (var pair in Read(MetaKey).Entries()) meta[pair.Key] = pair.Value?.DeepClone();
            return meta;
        }
        public void SaveMeta(JsonObject meta) => Write(MetaKey, meta.ToJsonString());
        public GameState? LoadGame() => GameState.Restore(Read(SaveKey), tables);
        public void SaveGame(GameState state) => Write(SaveKey, state.SaveJson());
        public void ClearSave() => File.Delete(PathOf(SaveKey));
        public bool Buy(JsonObject meta, JsonNode item)
        {
            var own = meta["own"]!; string id = item.Str("id");
            if (own.On(id) || meta.N("points") < item.N("cost") || item.On("need") && !own.On(item.Str("need"))) return false;
            own[id] = 1; meta["points"] = meta.N("points") - item.N("cost"); SaveMeta(meta); return true;
        }
    }

    public sealed partial class GameState
    {
        internal static GameState? Restore(JsonObject? data, Tables tables)
        {
            if (data == null || data.N("v") != 1 || data.On("over") || !(data["co"] is JsonObject company)) return null;
            var state = new GameState(data, tables);
            data["projects"] ??= new JsonArray(); data["chains"] ??= new JsonObject(); data["quotaAdd"] ??= 0;
            company["office"] = Clamp((int)company.N("office"), 1, state.MaxOffice);
            if (data["ideoAt"] == null && !data.On("ideo")) data["ideoAt"] = Math.Max(state.t + 2, 30);
            var mult = (JsonArray)state.D("OLD_QUOTA_MULT");
            int stage = (int)state.stage;
            data["quotaEarn"] ??= Math.Max(0, state.quotaBase * (stage >= 0 && stage < mult.Count ? (double)mult[stage]! : 1) - state.QuotaFloor);
            return state;
        }
        // 对拍快照保留特殊数，磁盘存档则遵循浏览器 JSON.stringify 的省略与 null 规则。
        internal string SaveJson()
        {
            var root = JsonNode.Parse(ToSnapshotJson())!;
            JsonNode? Clean(JsonNode? node)
            {
                if (node is JsonObject obj)
                {
                    if (obj.On("$js")) return obj.Str("$js") == "-0" ? (JsonNode)0 : null;
                    var copy = new JsonObject();
                    foreach (var pair in obj) if (!(pair.Value is JsonObject marker && marker.Str("$js") == "undefined")) copy[pair.Key] = Clean(pair.Value);
                    return copy;
                }
                if (node is JsonArray list) return new JsonArray(list.Select(Clean).ToArray());
                return node?.DeepClone();
            }
            return Clean(root)!.ToJsonString();
        }
        public string Currency(double value, bool sign = false) => Money(value, sign);
        public static string DisplayFixed(double value, int digits) => Fixed(value, digits);
        public double MonthlySalary(JsonNode person) => person.N("salary") * Mod("salaryMult");
        public double Severance(JsonNode person) => P("fire.payMonths") * person.N("salary") * Mod("salaryMult");
        public string MonthHeading() => Tx("ui.top.when", ("日期", DateText(t)), ("月", t), ("总", P("MONTHS")), ("地区", D("REGIONS")[Region].Str("name")), ("办公室", OfficeName()));
        public JsonObject Settle(JsonObject meta)
        {
            var over = Snapshot["over"]!; string id = over.Str("id"); var ending = D("ENDINGS")[id]!;
            double score = RoundJs(ending.N("base") + JsMath.Log10(Math.Max(10, over.N("val") * equity / 100)) * P("score.valK") + Math.Min(t, P("MONTHS")) / P("score.monthDiv") + List("perks").Count - exposed / P("score.exposedDiv") + (id == "acquired" ? P("score.acquired") : 0));
            var ach = meta["ach"]!; var ends = meta["ends"]!; bool fresh = !ends.On(id);
            var unlocked = new JsonArray();
            foreach (var item in List("ach")) { var key = item!.ToString(); if (!ach.On(key)) unlocked.Add(key); ach[key] = 1; }
            ends[id] = ends.N(id) + 1;
            if (ends.AsObject().Count >= P("ach.allend") && !ach.On("allend")) { ach["allend"] = 1; unlocked.Add("allend"); }
            double points = Math.Max(1, RoundJs(score / P("meta.pointDiv"))) + unlocked.Count * P("meta.achPoints") + (fresh ? P("meta.endPoints") : 0);
            meta["points"] = meta.N("points") + points; meta["runs"] = meta.N("runs") + 1; meta["best"] = Math.Max(meta.N("best"), score);
            return Obj(("ending", ending), ("score", score), ("points", points), ("newAch", unlocked), ("newEnd", fresh), ("text", FormatNews(ending.Str("text")).Replace("{pay}", Money(over.N("pay")))));
        }
    }
}
