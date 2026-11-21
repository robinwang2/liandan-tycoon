using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using System.Globalization;
using System.Text.RegularExpressions;

namespace Liandan.Kernel
{
    public sealed partial class Tables
    {
        private readonly Dictionary<string, string> mods = new Dictionary<string, string>();
        private readonly Dictionary<string, string> attrs = new Dictionary<string, string>();
        private static readonly Dictionary<string, string> effects = Names("现金 cash 现金额 cashAbs 热度 hype 口碑 rep 士气 morale 泡沫 bubble 监管 reg 监管压力 reg 用户 usersPct 模型能力 tech 跑分 bench 体验 quality 产品体验 quality 配额 quota 显卡配额 quota 股权 equity 行动点 ap 下月行动点 ap");
        private static readonly Dictionary<string, string> starts = Names("现金 cash 现金倍数 cashMult 口碑 rep 热度 hype 用户 users 模型能力 tech 股权 equity 监管 reg 欠债 debt");
        private static Dictionary<string, string> Names(string pairs)
        {
            var words = pairs.Split(' ');
            return Enumerable.Range(0, words.Length / 2).ToDictionary(i => words[2 * i], i => words[2 * i + 1]);
        }
        private static IEnumerable<JsonNode> Children(JsonNode? n) => n is JsonArray a ? a.Select(x => x!) : n.Entries().Select(p => p.Value!);
        private void FillDescriptions(JsonNode events)
        {
            foreach (var m in Children(Definitions["MODS"])) mods[m.Str("zh")] = m.Str("id");
            foreach (var a in Children(Definitions["ATTRS"])) attrs[a.Str("name")] = a.Str("id");
            void Fill(JsonNode r, string field, bool bare, JsonNode? vars = null)
            {
                string Replace(string s) => Regex.Replace(s, @"\{[^{}\s]+\}", m => FillRef(m.Value, r, bare, vars));
                if (r[field] is JsonValue v && v.TryGetValue<string>(out var s) && s.Contains("{")) r[field] = Replace(s);
                if (r[field] is JsonArray a)
                    for (int i = 0; i < a.Count; i++) if (a[i] is JsonValue item && item.ToString().Contains("{")) a[i] = Replace(item.ToString());
            }
            foreach (var key in new[] { "PERKS", "FEATURES", "GOALS", "ROUTES", "REGIONS", "STAFF_QUIRKS", "DATA_SOURCES", "META_SHOP", "ACHIEVEMENTS", "ATTRS", "TRAITS", "POLICIES" })
            {
                var rows = Children(Definitions[key]);
                if (key == "TRAITS") rows = rows.SelectMany(Children);
                if (key == "POLICIES") rows = rows.SelectMany(p => Children(p["opts"]));
                foreach (var r in rows) Fill(r, key == "META_SHOP" ? "name" : "desc", true);
            }
            foreach (var k in new[] { "EVENTS_CORE", "EVENTS_PACK" })
                foreach (var e in Children(events[k]))
                    foreach (var o in Children(e["options"]))
                    {
                        var vars = new JsonObject();
                        foreach (var p in e["p"].Entries().Concat(o["p"].Entries())) vars[p.Key] = p.Value?.DeepClone();
                        Fill(o, "label", false, vars); Fill(o, "hint", false, vars);
                    }
            foreach (var book in Books.Values)
            {
                foreach (var e in Children(book["IDEO_ENDINGS"]))
                    foreach (var o in Children(e["options"])) { Fill(o, "hint", false); Fill(o, "text", false); }
                foreach (var e in Children(book["SYS_EVENTS"]))
                    foreach (var o in Children(e["options"])) Fill(o, "hint", false);
            }
        }
        internal string FillRuntime(string text, JsonNode? row, params (string key, object value)[] vars)
        {
            return Regex.Replace(text, @"\{([^{}\s]+)\}", m =>
            {
                foreach (var v in vars) if (m.Groups[1].Value == v.key) return Convert.ToString(v.value, CultureInfo.InvariantCulture)!;
                return FillRef(m.Value, row, false, row?["p"]);
            });
        }
        private string FillRef(string token, JsonNode? record, bool bare, JsonNode? vars = null)
        {
            var parts = token.Substring(1, token.Length - 2).Split(':', '：');
            string name = parts[0], kind = "raw";
            JsonNode? value = vars?[name] ?? Parameters[name], months = null;
            if (value == null && record != null)
            {
                int dot = name.IndexOf('.');
                string col = dot < 0 ? "" : name.Substring(0, dot), key = name.Substring(dot + 1);
                if (dot < 0 && !bare) return token;
                int hits = 0;
                void Hit(JsonNode? n, string style)
                {
                    if (n is JsonValue number && number.TryGetValue<double>(out _)) { value = n; kind = style; hits++; }
                }
                bool Column(string c) => col == c || col == "";
                string Style(string id) => id.EndsWith("Mult", StringComparison.Ordinal) ? "mult" : id == "churnAdd" ? "pct" : "delta";
                if (mods.TryGetValue(key, out var mod))
                {
                    if (Column("修正")) Hit(record["mods"]?[mod], Style(mod));
                    if (col == "临时")
                    {
                        foreach (var temp in new[] { record["fx"]?["temp"], record["ok"]?["fx"]?["temp"] })
                        {
                            IEnumerable<JsonNode?> rows = temp is JsonArray ? Children(temp).Cast<JsonNode?>() : new[] { temp };
                            var row = rows.FirstOrDefault(r => r.Str("key") == mod);
                            if (row != null) { Hit(row["mult"] ?? row["add"], row["mult"] != null ? "mult" : Style(mod)); months = row["months"]; break; }
                        }
                    }
                }
                if (effects.TryGetValue(key, out var fx))
                {
                    if (Column("效果")) Hit(record["fx"]?[fx], "delta");
                    if (col == "失败效果") Hit((record["failFx"] ?? record["fail"]?["fx"])?[fx], "delta");
                }
                if (starts.TryGetValue(key, out var start) && Column("开局")) Hit(record["start"]?[start], start == "cashMult" ? "mult" : "delta");
                if (attrs.TryGetValue(key, out var attr))
                {
                    if (Column("属性")) Hit(record["attr"]?[attr], "delta");
                    if (Column("效果")) Hit(record["fx"]?["attr"]?[attr], "delta");
                }
                if (col == "")
                {
                    if (key == "产出") Hit(record["out"], "raw");
                    if (key == "工资") Hit(record["pay"], "raw");
                    if (key == "效率") Hit(record["mult"], "mult");
                }
                if (hits != 1) return token;
            }
            if (value == null) return token;
            var formats = parts.Skip(1).ToList();
            if (formats.FirstOrDefault() == "月") { if (months == null) return token; value = months; kind = "raw"; formats.RemoveAt(0); }
            if (!(value is JsonValue numberValue) || !numberValue.TryGetValue<double>(out var n)) return value.ToString();
            if (formats.Count == 0) formats.AddRange(kind == "mult" ? new[] { "增" } : kind == "pct" ? new[] { "%", "±" } : kind == "delta" ? new[] { "±" } : Array.Empty<string>());
            bool sign = false, pct = false;
            string prefix = "";
            string Num(double d) => Js.FixedNumber(d, 6).ToString(CultureInfo.InvariantCulture);
            foreach (var f in formats)
            {
                switch (f)
                {
                    case "增": n = (n - 1) * 100; pct = sign = true; break;
                    case "%": n *= 100; pct = true; break;
                    case "±": sign = true; break;
                    case "去号": n = Math.Abs(n); sign = false; break;
                    case "×": prefix = "×"; break;
                    case "万": return Math.Abs(n) >= 10000 ? Num(n / 10000) + " 亿" : Num(n) + " 万";
                    case "数": break;
                    default: return token;
                }
            }
            return prefix + (sign && n > 0 ? "+" : "") + Num(n) + (pct ? "%" : "");
        }
    }
}
