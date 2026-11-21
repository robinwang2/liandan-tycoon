using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using Liandan.Kernel;

internal static class CanonicalJson
{
    internal static void Write(StringBuilder output, JsonNode? node)
    {
        switch (node)
        {
            case null: output.Append("null"); break;
            case JsonObject obj when obj.ContainsKey("$js"):
                output.Append(obj.Str("$js") == "-0" ? "0" : "null");
                break;
            case JsonObject obj:
                output.Append('{');
                bool first = true;
                // JS 对排序后重建的对象仍会先枚举整数索引。
                foreach (var p in obj.OrderBy(p => Js.Index(p.Key)).ThenBy(p => p.Key, StringComparer.Ordinal))
                {
                    if (p.Value is JsonObject marker && marker.Str("$js") == "undefined") continue;
                    if (!first) output.Append(',');
                    first = false;
                    Quote(output, p.Key);
                    output.Append(':');
                    Write(output, p.Value);
                }
                output.Append('}');
                break;
            case JsonArray array:
                output.Append('[');
                for (int i = 0; i < array.Count; i++)
                {
                    if (i > 0) output.Append(',');
                    Write(output, array[i]);
                }
                output.Append(']');
                break;
            case JsonValue v when v.TryGetValue<string>(out var s): Quote(output, s); break;
            case JsonValue v when v.TryGetValue<bool>(out var b): output.Append(b ? "true" : "false"); break;
            case JsonValue v when v.TryGetValue<int>(out var i): output.Append(i); break;
            case JsonValue v when v.TryGetValue<double>(out var d): output.Append(Number(d)); break;
            default: throw new InvalidDataException("无法写入指纹的值：" + node);
        }
    }

    private static string Number(double d)
    {
        if (d == 0) return "0";
        if (!double.IsFinite(d)) return "null";
        string shortest = d.ToString("R", CultureInfo.InvariantCulture);
        int e = shortest.IndexOf('E');
        if (e < 0) return shortest;
        int exponent = int.Parse(shortest[(e + 1)..], CultureInfo.InvariantCulture);
        if (exponent is < -6 or >= 21)
            return shortest[..e] + "e" + (exponent > 0 ? "+" : "") + exponent;
        string digits = shortest[(d < 0 ? 1 : 0)..e].Replace(".", "");
        int point = exponent + 1;
        string fixedPoint = point <= 0 ? "0." + new string('0', -point) + digits :
            point >= digits.Length ? digits.PadRight(point, '0') : digits.Insert(point, ".");
        return (d < 0 ? "-" : "") + fixedPoint;
    }

    private static void Quote(StringBuilder output, string s)
    {
        output.Append('"');
        for (int i = 0; i < s.Length; i++)
        {
            char c = s[i];
            switch (c)
            {
                case '"': output.Append("\\\""); break;
                case '\\': output.Append("\\\\"); break;
                case '\b': output.Append("\\b"); break;
                case '\f': output.Append("\\f"); break;
                case '\n': output.Append("\\n"); break;
                case '\r': output.Append("\\r"); break;
                case '\t': output.Append("\\t"); break;
                default:
                    if (char.IsHighSurrogate(c) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1]))
                        output.Append(c).Append(s[++i]);
                    else if (c < ' ' || char.IsSurrogate(c)) output.Append("\\u").Append(((int)c).ToString("x4"));
                    else output.Append(c);
                    break;
            }
        }
        output.Append('"');
    }
}
