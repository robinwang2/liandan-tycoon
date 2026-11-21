using Liandan.Verification;
using System.Globalization;
using System.IO.Compression;
using System.Text.Json;
using System.Text.Json.Nodes;
using Liandan.Kernel;

CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
try
{
    return Run(args);
}
catch (Exception error)
{
    Console.Error.WriteLine(error.Message);
    return 2;
}

static int Run(string[] args)
{
    if ((args.Length == 3 || args.Length == 4) && args[0] == "save-roundtrip")
    {
        var tablesForSave = new Tables("src/data/tables");
        var input = new GameStore(args[1], tablesForSave); var output = new GameStore(args[2], tablesForSave);
        var meta = input.LoadMeta();
        var state = input.LoadGame();
        if (state != null && args.Length == 4)
        {
            if (args[3] == "month") state.EndMonth();
            else if(args[3]=="dashboard")
            {
                var sample=JsonNode.Parse(File.ReadAllText(Path.Combine(args[1],"sample.json")))!;
                var result=new { users=sample["users"]!.AsArray().Select(value=>state.UsersText((double)value!)).ToArray(),
                    board=state.Leaderboard(), impact=sample["people"]!.AsArray().Select(person=>state.StaffImpact(person!)).ToArray(),
                    salaries=sample["people"]!.AsArray().Select(person=>state.Currency(state.MonthlySalary(person!))).ToArray() };
                File.WriteAllText(Path.Combine(args[2],"dashboard.json"),JsonSerializer.Serialize(result));
            }
            else if (args[3] == "settle")
            {
                state.Snapshot["over"] = JsonNode.Parse(File.ReadAllText(Path.Combine(args[1], "ending.json")));
                File.WriteAllText(Path.Combine(args[2], "result.json"), state.Settle(meta).ToJsonString()); state = null;
            }
            else throw new ArgumentException("未知存档操作");
        }
        output.SaveMeta(meta);
        if (state != null) output.SaveGame(state); else output.ClearSave();
        return 0;
    }
    if (args.Length == 2 && args[0] == "math-bits") return MathBits.Run(args[1], Console.Out);
    if (args.FirstOrDefault() is "dump" or "parity")
    {
        Console.OutputEncoding = new System.Text.UTF8Encoding(false);
        return Parity.Run(args, "src/data/tables", Console.Out, Console.Error);
    }
    const string usage = "用法：math-bits <样本文件>、parity [baseline.json] [--seeds N]、dump <对局key> 或 trace|ops <快照目录> [--tables 表目录] [--only 对局key] [--max N]";
    if (args.Length < 2 || (args[0] != "trace" && args[0] != "ops")) throw new ArgumentException(usage);
    string dir = args[1], tablesPath = "src/data/tables";
    string? only = null;
    int max = int.MaxValue;
    for (int i = 2; i < args.Length; i += 2)
    {
        if (i + 1 == args.Length) throw new ArgumentException(usage);
        switch (args[i])
        {
            case "--tables": tablesPath = args[i + 1]; break;
            case "--only": only = args[i + 1]; break;
            case "--max" when int.TryParse(args[i + 1], out max) && max > 0: break;
            default: throw new ArgumentException(usage);
        }
    }
    var tables = new Tables(tablesPath);
    var games = JsonNode.Parse(File.ReadAllText(Path.Combine(dir, "index.json")))!["games"]!.AsArray();
    if (args[0] == "ops") return Operations.Run(tables, games, dir, only, max, Compare);
    int passed = 0, checkedGames = 0, matched = 0, total = 0, reports = 0, partial = 0;
    foreach (var entry in games)
    {
        string key = (string)entry!["key"]!;
        if (only != null && only != key) continue;
        int months = (int)entry["months"]!, count = 0;
        bool failed = false;
        using var stream = File.OpenRead(Path.Combine(dir, (string)entry["file"]!));
        using var reader = new StreamReader(new GZipStream(stream, CompressionMode.Decompress));
        string? line;
        while (total < max && (line = reader.ReadLine()) != null)
        {
            using var record = JsonDocument.Parse(line);
            var row = record.RootElement;
            var before = row.GetProperty("before");
            int t = row.GetProperty("t").GetInt32();
            if (before.GetProperty("t").GetInt32() != t) throw new InvalidDataException($"{key} t={t} 快照月份不符");
            string? diff;
            try
            {
                var state = new GameState(JsonObject.Create(before)!, tables);
                state.EndMonth();
                using var actual = JsonDocument.Parse(state.ToSnapshotJson());
                diff = Compare(row.GetProperty("after"), actual.RootElement, "$");
            }
            catch (Exception ex) { throw new InvalidDataException($"{key} t={t} 月结异常：{ex}", ex); }
            total++; count++;
            if (diff == null) matched++;
            else if (!failed)
            {
                failed = true;
                if (reports++ < 20) Console.WriteLine($"{key} t={t} {diff}");
            }
        }
        if (total == max && count < months) { partial++; break; }
        if (count != months || !reader.EndOfStream) throw new InvalidDataException($"{key} 索引 {months} 月，实际月数不符");
        checkedGames++;
        if (!failed) passed++;
        if (total == max) break;
    }
    if (checkedGames + partial == 0) throw new ArgumentException("没有匹配的对局");
    Console.WriteLine($"整局一致 {passed}/{checkedGames}，月份一致 {matched}/{total}，部分检查 {partial} 局。");
    return matched == total ? 0 : 1;
}

static string? Compare(JsonElement expected, JsonElement actual, string path)
{
    string Show(JsonElement e) => e.ValueKind == JsonValueKind.Undefined ? "<缺键>" : e.ValueKind == JsonValueKind.String ? JsonSerializer.Serialize(e.GetString(), Display.Options) : e.GetRawText();
    string Mismatch() => $"{path}  JS={Show(expected)}  C#={Show(actual)}";
    if (expected.ValueKind != actual.ValueKind) return Mismatch();
    switch (expected.ValueKind)
    {
        case JsonValueKind.Object:
            foreach (var p in expected.EnumerateObject())
            {
                actual.TryGetProperty(p.Name, out var other);
                var diff = Compare(p.Value, other, PropertyPath(path, p.Name));
                if (diff != null) return diff;
            }
            foreach (var p in actual.EnumerateObject())
                if (!expected.TryGetProperty(p.Name, out _)) return Compare(default, p.Value, PropertyPath(path, p.Name));
            break;
        case JsonValueKind.Array:
            int i = 0;
            using (var it = actual.EnumerateArray())
            {
                foreach (var v in expected.EnumerateArray())
                {
                    var diff = Compare(v, it.MoveNext() ? it.Current : default, $"{path}[{i++}]");
                    if (diff != null) return diff;
                }
                if (it.MoveNext()) return Compare(default, it.Current, $"{path}[{i}]");
            }
            break;
        case JsonValueKind.String: if (expected.GetString() != actual.GetString()) return Mismatch(); break;
        case JsonValueKind.Number:
            if (BitConverter.DoubleToInt64Bits(expected.GetDouble()) != BitConverter.DoubleToInt64Bits(actual.GetDouble())) return Mismatch();
            break;
    }
    return null;
}

static string PropertyPath(string path, string name)
{
    if (name.Length > 0 && (char.IsLetter(name[0]) || name[0] == '_') && name.All(c => char.IsLetterOrDigit(c) || c == '_'))
        return path + "." + name;
    return path + "[" + JsonSerializer.Serialize(name, Display.Options) + "]";
}

static class Display
{
    internal static readonly JsonSerializerOptions Options = new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
}
