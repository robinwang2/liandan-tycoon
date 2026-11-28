using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Numerics;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Liandan.Kernel
{
    // The store and the simulation always use Source. Only temporary views get English tables.
    public sealed class ShellLanguage
    {
        public Tables Source { get; }
        private readonly Tables translated;
        public bool English { get; set; }
        public Tables DisplayTables => English ? translated : Source;
        private readonly JsonObject catalog;
        private readonly Dictionary<string,string> staffNames = new Dictionary<string,string>();
        private readonly Dictionary<string,string> investors = new Dictionary<string,string>();
        private readonly HistoryTemplate[] history;
        private static readonly Regex Token = new Regex(@"\{([^{}\s]+)\}");
        private static readonly CultureInfo Invariant = CultureInfo.InvariantCulture;

        public ShellLanguage(string tableDir, string englishFile)
        {
            Source = new Tables(tableDir);
            var pack = JsonNode.Parse(File.ReadAllText(englishFile))!;
            translated = new Tables(tableDir, pack["books"]!, Source);
            catalog = pack["catalog"]!.AsObject();
            foreach (var offer in Source.Actions["OFFERS"]!.AsArray())
            {
                string label = offer.Str("label");
                if (label.Contains("：") && !label.StartsWith("{", StringComparison.Ordinal))
                    investors[label.Split('：')[0]] = Translate(label).Split(':')[0];
            }
            history = pack["history"]!.AsArray().Select(n => new HistoryTemplate(n!.ToString())).ToArray();
            var names = Source.Definitions["NAMES"]!["sz"]!;
            foreach (var a in names["a"]!.AsArray())
                foreach (var b in names["b"]!.AsArray()) staffNames[a!.ToString() + b] = Translate(a.ToString()) + Translate(b!.ToString());
        }

        private string Translate(string value) => catalog.Str(value, value);
        public string Tr(string value) => English ? Translate(value) : value;
        internal static string Date(int year, int month) =>
            (month >= 1 && month <= 12 ? Invariant.DateTimeFormat.GetAbbreviatedMonthName(month) : "undefined") + " " + year;

        internal static string Compact(double value)
        {
            if (value == 0) return "0";
            if (double.IsNaN(value)) return "NaN";
            if (double.IsInfinity(value)) return value.ToString(Invariant) + "B";
            // JS toPrecision(3) rounds a halfway binary64 away from zero, before choosing a suffix.
            double Round3(double x)
            {
                int places = 2 - (int)Math.Floor(Math.Log10(Math.Abs(x)));
                if (places >= 0) return Js.FixedNumber(x, places);
                var step = BigInteger.Pow(10, -places);
                var rounded = ((new BigInteger(Math.Abs(x)) + step / 2) / step) * step;
                return Math.Sign(x) * double.Parse(rounded.ToString(Invariant), Invariant);
            }
            var n = Round3(value);
            double abs = Math.Abs(n);
            var (scale, suffix) = abs >= 1e9 ? (1e9, "B") : abs >= 1e6 ? (1e6, "M") : abs >= 1e3 ? (1e3, "K") : (1d, "");
            n = Round3(n / scale);
            if (Math.Abs(n) < 1e-6 || Math.Abs(n) >= 1e21)
                return n.ToString("0.##e+0", Invariant) + suffix;
            return n.ToString("0.################", Invariant) + suffix;
        }

        internal static string Units(string value) => Regex.Replace(value, @"([0-9]+(?:\.[0-9]+)?)\s*([万亿])", m =>
            Compact(double.Parse(m.Groups[1].Value, Invariant) * (m.Groups[2].Value == "万" ? 1e4 : 1e8)));

        public static int NameBit(string field) => field switch { "name" => 1, "coName" => 2, "modelName" => 4, _ => throw new ArgumentException(field) };
        private static string PoolKey(string field) => "ui.rand." + (field == "coName" ? "co" : field == "modelName" ? "model" : "name");
        public string DefaultName(string field) => Source.Text(field == "coName" ? "ui.wiz.default.co" : field == "name" ? "ui.wiz.default.name" : "default.model", false);
        public string DisplayName(string field, string value, string region, int? flags)
        {
            return English && TryAutoName(field, value, region, flags, out string display) ? display : value;
        }

        private bool TryAutoName(string field, string value, string region, int? flags, out string display)
        {
            string pool = Source.Text(PoolKey(field), region == "bay");
            int index = Array.IndexOf(pool.Split('\n'), value);
            bool auto = flags.HasValue ? (flags.Value & NameBit(field)) != 0 : index >= 0 || value == DefaultName(field);
            display = auto ? (index < 0 ? Translate(value) : Translate(pool).Split('\n')[index]) : value;
            return auto;
        }
        public string CompanyName(GameState state) => DisplayName("coName", state.Company.Name, state.Company.Region, (int?)state.Snapshot["flags"]?["autoNames"]);

        // Old/web saves contain the final Chinese news sentence. Match only known news/note
        // templates, on the whole field; captured player text must never be dictionary-translated.
        private sealed class HistoryTemplate
        {
            public readonly string Source;
            public readonly Regex Pattern;
            public readonly string[] Keys;
            public readonly string Prefix;
            public HistoryTemplate(string source)
            {
                Source = source;
                Keys = Token.Matches(source).Cast<Match>().Select(m => m.Groups[1].Value).ToArray();
                Prefix = source.Substring(0, source.IndexOf('{'));
                var literals = Regex.Split(source, @"\{[^{}\s]+\}").Select(Regex.Escape);
                Pattern = new Regex(@"\A" + string.Join("(.*?)", literals) + @"\z", RegexOptions.Singleline, TimeSpan.FromMilliseconds(50));
            }
        }

        public GameState View(GameState original)
        {
            if (!English) return original;
            var data = original.Snapshot.DeepClone().AsObject();
            var co = data["co"]!;
            string region = co.Str("region");
            int? flags = (int?)data["flags"]?["autoNames"];
            string founder = DisplayName("name", original.Founder.Name, region, flags);
            string company = CompanyName(original);
            bool autoModel = TryAutoName("modelName", original.Company.ModelName, region, flags, out string model);
            string ModelName(string raw) => raw.StartsWith(original.Company.ModelName + "-", StringComparison.Ordinal)
                ? model + raw.Substring(original.Company.ModelName.Length) : raw;
            co["name"] = company;
            co["modelName"] = model;
            data["founder"]!["name"] = founder;
            if (data["model"] is JsonObject current && !current.ContainsKey("$js"))
            {
                if (autoModel) current["name"] = model + "-" + current["ver"];
                else if (!current.On("name")) current["name"] = model;
            }

            string Staff(string raw) => staffNames.TryGetValue(raw, out string en) ? en : raw;
            string Historical(string raw, int depth = 0)
            {
                if (catalog.ContainsKey(raw)) return Translate(raw);
                if (depth < 4)
                foreach (var template in history)
                {
                    if (!raw.StartsWith(template.Prefix, StringComparison.Ordinal)) continue;
                    Match match;
                    try { match = template.Pattern.Match(raw); } catch (RegexMatchTimeoutException) { continue; }
                    if (!match.Success) continue;
                    return Token.Replace(Translate(template.Source), m => {
                        string key = m.Groups[1].Value;
                        int slot = Array.IndexOf(template.Keys, key);
                        if (slot < 0) return m.Value;
                        string v = match.Groups[slot + 1].Value;
                        return key switch {
                            "公司" or "co" => company, "me" => founder, "名字" or "staff" => Staff(v),
                            "model" => ModelName(v),
                            "机构" when investors.TryGetValue(v, out var investor) => investor,
                            "模型" when !template.Keys.Contains("对手") => ModelName(v),
                            _ => Historical(v, depth + 1)
                        };
                    });
                }
                var date = Regex.Match(raw, @"^(\d{4})年(\d{1,2})月$");
                if (date.Success) return Date(int.Parse(date.Groups[1].Value), int.Parse(date.Groups[2].Value));
                return Units(raw);
            }
            void Field(JsonNode? row, string key, Func<string,string> format)
            {
                if (row?[key] is JsonValue value) row[key] = format(value.ToString());
            }
            foreach (var r in data["rivals"]!.AsArray())
                foreach (var key in new[]{"name","model","boss"}) Field(r, key, Translate);
            foreach (var key in new[]{"staff","cands"})
                foreach (var person in data[key]!.AsArray()) Field(person, "name", Staff);
            foreach (var item in data["q"]!.AsArray()) Field(item?["ctx"], "staffName", Staff);
            foreach (var item in data["projects"]!.AsArray()) { Field(item,"name",Translate); Field(item,"desc",Translate); }
            foreach (var item in data["dirt"]!.AsArray()) Field(item,"name",Translate);
            foreach (var row in data["log"]!.AsArray()) Field(row,"msg",s => Historical(s));
            foreach (var pair in data["chains"].Entries())
                if (pair.Value?["notes"] is JsonArray notes)
                    foreach (var note in notes) Field(note,"text",s => Historical(s));
            if (data["ideo"]?["picks"] is JsonArray picks)
                foreach (var pick in picks) Field(pick,"label",Translate);
            return new GameState(data, translated);
        }
    }
}
