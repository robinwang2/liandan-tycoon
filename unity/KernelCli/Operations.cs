using System.IO.Compression;
using System.Text.Json;
using System.Text.Json.Nodes;
using Liandan.Kernel;

internal static class Operations
{
    internal static int Run(Tables tables, JsonArray games, string dir, string? only, int max,
        Func<JsonElement, JsonElement, string, string?> compare)
    {
        var counts = new Dictionary<string, int[]>();
        var skippedChoices = new Dictionary<string, int>();
        int total = 0, checkedGames = 0;
        foreach (var entry in games)
        {
            string key = (string)entry!["key"]!;
            if (only != null && key != only) continue;
            int step = 0, source = 0;
            bool failed = false;
            GameState? state = null;
            JsonElement checkpoint = default;
            GameState.Dialog? dialog = null;
            string? skipSource = null;
            using var file = File.OpenRead(Path.Combine(dir, (string)entry["file"]!));
            using var reader = new StreamReader(new GZipStream(file, CompressionMode.Decompress));
            string? line;
            while (total < max && (line = reader.ReadLine()) != null)
            {
                using var doc = JsonDocument.Parse(line);
                var row = doc.RootElement;
                string op = row.GetProperty("op").GetString()!;
                var args = row.GetProperty("args");
                JsonNode? ret = null;
                string? diff = null, skip = null;
                total++; step++;
                try
                {
                    // 已实现的操作共用同一个 S；跳过的操作用 JS 的 after 接回。
                    GameState Resume() => state ?? new GameState(JsonObject.Create(checkpoint.ValueKind == JsonValueKind.Undefined
                        ? row.GetProperty("before").Clone() : checkpoint)!, tables);
                    switch (op)
                    {
                        case "newGame":
                            int seed = row.GetProperty("mathRandom").GetInt32();
                            double Sample()
                            {
                                double v = GameState.NextRandom(ref seed);
                                int bits = unchecked((int)(uint)(v * 4294967296.0));
                                int expected = row.GetProperty("initialRs").GetInt32();
                                if (bits != expected) diff = $"$.initialRs  JS={expected}  C#={bits}";
                                return v;
                            }
                            state = GameState.NewGame(tables, JsonNode.Parse(args[0].GetRawText())!, JsonNode.Parse(args[1].GetRawText()), Sample);
                            break;
                        case "nextDialog":
                            state = Resume(); source = step; dialog = null; skipSource = null;
                            dialog = state.NextDialog(); ret = dialog?.View;
                            break;
                        case "choose":
                            if (row.GetProperty("source").GetInt32() != source) throw new InvalidDataException("对话框来源步号不符");
                            if (skipSource != null) { skip = skipSource; source = step; break; }
                            if (dialog == null || args[0].GetString() != (string?)dialog.View["id"]) throw new InvalidDataException("对话框标识不符");
                            using (var actualBefore = JsonDocument.Parse(state!.ToSnapshotJson()))
                                diff = compare(row.GetProperty("before"), actualBefore.RootElement, "$.before");
                            ret = state.Choose(dialog, args[1].GetInt32());
                            dialog = dialog.Next; source = step;
                            break;
                        case "endMonth": state = Resume(); state.EndMonth(); break;
                        case "perform":
                            source = step; dialog = null; skipSource = null;
                            string id = args[0].GetString()!;
                            if (!GameState.IsDialogAction(id)) { skip = skipSource = "行动 " + id; break; }
                            state = Resume(); ret = state.PerformDialogAction(id, out dialog); break;
                        case "hire":
                        case "setGpu":
                        case "setPolicy":
                        case "pushProject":
                        case "actionState":
                        case "viewMenu":
                        case "show":
                        case "advise":
                            skip = "行动与参谋"; break;
                        case "runway":
                        case "teamCap":
                        case "quota":
                        case "gpuPrice":
                        case "inferNeed":
                            state = Resume(); ret = state.ReadBotValue(op); break;
                        default: throw new InvalidDataException("未知操作 " + op);
                    }
                    if (skip == null)
                    {
                        using var actual = JsonDocument.Parse(state!.ToSnapshotJson());
                        diff ??= compare(row.GetProperty("after"), actual.RootElement, "$.after");
                        using var result = JsonDocument.Parse(ret?.ToJsonString() ?? "null");
                        diff ??= compare(row.GetProperty("ret"), result.RootElement, "$.ret");
                    }
                }
                catch (GameState.PendingStory story) { skip = skipSource = story.Message; }
                catch (Exception e) { diff = "执行异常 " + e.Message; }
                if (skip != null || diff != null && dialog == null)
                {
                    checkpoint = row.GetProperty("after").Clone();
                    state = null;
                }
                if (!counts.TryGetValue(op, out int[]? bins)) counts[op] = bins = new int[3];
                bins[skip != null ? 2 : diff != null ? 1 : 0]++;
                if (op == "choose" && skip != null) skippedChoices[skip] = skippedChoices.GetValueOrDefault(skip) + 1;
                if (diff != null && !failed)
                {
                    Console.WriteLine($"{key} 第 {step} 步 {op} {diff}");
                    failed = true;
                }
            }
            checkedGames++;
            if (total == max) break;
            if (step != (int)entry["steps"]!) throw new InvalidDataException($"{key} 索引步数不符");
        }
        if (checkedGames == 0) throw new ArgumentException("没有匹配的对局");
        Console.WriteLine("操作 一致 不一致 跳过");
        foreach (var pair in counts) Console.WriteLine($"{pair.Key} {string.Join(" ", pair.Value)}");
        foreach (var pair in skippedChoices) Console.WriteLine($"选择跳过 {pair.Key} {pair.Value}");
        Console.WriteLine($"共 {checkedGames} 局，{total} 步。");
        return counts.Values.Any(b => b[1] > 0) ? 1 : 0;
    }
}
