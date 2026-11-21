using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Liandan.Kernel;

internal record MatchSpec(string Region, string Route, string Track, string Style, int Seed)
{
    internal string Key => $"{Region}/{Route}/{Track}/{Style}#{Seed}";
    internal static IEnumerable<MatchSpec> Setups(int seeds)
    {
        foreach (string style in new[] { "clean", "shady", "advice" })
        foreach (string region in new[] { "bay", "sz" })
        foreach (string route in new[] { "model", "app" })
        foreach (string track in new[] { "chat", "code", "companion", "video" })
        for (int seed = 0; seed < seeds; seed++)
            yield return new MatchSpec(region, route, track, style, seed);
    }
}

internal static class Parity
{
    private record Result(string Hash, string Months, string? End, double T);

    private static Result Play(Tables tables, HashSet<string> actions, MatchSpec spec, TextWriter? log = null)
    {
        using var all = IncrementalHash.CreateHash(HashAlgorithmName.SHA1);
        using var current = IncrementalHash.CreateHash(HashAlgorithmName.SHA1);
        var line = new StringBuilder();
        var months = new StringBuilder();
        void Put(string tag, JsonNode? value)
        {
            line.Clear().Append(tag).Append(' ');
            CanonicalJson.Write(line, value);
            string record = line.Append('\n').ToString();
            byte[] data = Encoding.UTF8.GetBytes(record);
            all.AppendData(data);
            current.AppendData(data);
            log?.Write(record);
        }
        static string Digest(IncrementalHash hash, int digits) =>
            Convert.ToHexString(hash.GetHashAndReset())[..digits].ToLowerInvariant();
        try
        {
            var bot = new Bot(tables, actions, spec, Put);
            var state = bot.State.Snapshot;
            Put("开局", state);
            bot.Drain();
            for (int m = 0; m < 80 && !state.On("over"); m++)
            {
                Put("菜单", bot.State.ViewMenu());
                bot.PlayMonth();
                Put("月末", state);
                months.Append(Digest(current, 6));
            }
            return new Result(Digest(all, 16), months.ToString(), (string?)state["over"]?["id"], state.N("t"));
        }
        catch (Exception ex)
        {
            throw new InvalidDataException($"第 {months.Length / 6 + 1} 个月执行异常：{ex.Message}", ex);
        }
    }

    internal static int Run(string[] args)
    {
        const string usage = "用法：parity [baseline.json] [--seeds N] 或 dump <对局key>";
        Console.OutputEncoding = new UTF8Encoding(false);
        var tables = new Tables("src/data/tables");
        var actions = tables.GetActionRows().Select(r => r.Str("id")).ToHashSet();
        if (args[0] == "dump")
        {
            if (args.Length != 2) throw new ArgumentException(usage);
            var parts = args[1].Split('#');
            if (parts.Length != 2 || !int.TryParse(parts[1], out int seed) || seed < 0)
                throw new ArgumentException(usage);
            var match = MatchSpec.Setups(1).Select(s => s with { Seed = seed }).SingleOrDefault(s => s.Key == args[1])
                ?? throw new ArgumentException("无法识别的对局：" + args[1]);
            var result = Play(tables, actions, match, Console.Out);
            Console.Error.WriteLine($"{match.Key} {result.End ?? "null"} t={result.T} {result.Hash}");
            return 0;
        }
        int i = 1;
        string file = i < args.Length && !args[i].StartsWith("--") ? args[i++] : "tools/parity/baseline.json";
        var baseline = JsonNode.Parse(File.ReadAllText(file))!;
        int seeds = (int)baseline["seeds"]!;
        if (i != args.Length && (args.Length != i + 2 || args[i] != "--seeds" || !int.TryParse(args[i + 1], out int n) || n != seeds))
            throw new ArgumentException("请检查基线种子数。" + usage);
        if (seeds < 1) throw new InvalidDataException("基线种子数必须大于零");
        var games = baseline["games"]!.AsArray().ToDictionary(g => g.Str("key"), g => g!);
        int passed = 0, total = 0;
        foreach (var match in MatchSpec.Setups(seeds))
        {
            total++;
            string? error = null;
            try
            {
                var r = Play(tables, actions, match);
                if (!games.Remove(match.Key, out var want)) error = "缺少基线";
                else
                {
                    string months = want.Str("months");
                    if (months != r.Months)
                    {
                        int m = 0, limit = Math.Min(months.Length, r.Months.Length) / 6;
                        while (m < limit && months.AsSpan(m * 6, 6).SequenceEqual(r.Months.AsSpan(m * 6, 6))) m++;
                        error = $"第 {m + 1} 个月开始不一样";
                    }
                    else if (r.Hash != want.Str("hash") || r.End != (string?)want["end"] || r.T != (double)want["t"]!)
                        error = $"月指纹一致，整局摘要不同（基线 {want["hash"]}/{want["end"]}/{want["t"]}，实际 {r.Hash}/{r.End}/{r.T}）";
                }
            }
            catch (Exception ex) { error = ex.Message; }
            if (error == null) passed++;
            else if (total - passed <= 12) Console.WriteLine($"{match.Key}：{error}");
        }
        Console.WriteLine($"整局一致 {passed}/{total}。");
        if (games.Count > 0) Console.WriteLine($"基线有 {games.Count} 局未完成比对。");
        return passed == total && games.Count == 0 ? 0 : 1;
    }
}
