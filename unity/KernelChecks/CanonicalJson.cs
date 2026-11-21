using System;
using System.IO;
using System.Numerics;
using System.Linq;
using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using Liandan.Kernel;

namespace Liandan.Verification
{
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
            if (Math.Abs(d) <= 9007199254740991d && d == (long)d)
                return ((long)d).ToString(CultureInfo.InvariantCulture);

            // Mono 的 "R" 有时会多写一位。用相邻浮点数的中点求可还原原值的最短十进制。
            long bits = BitConverter.DoubleToInt64Bits(Math.Abs(d));
            int field = (int)(bits >> 52);
            long fraction = bits & 0xfffffffffffffL;
            long mantissa = field == 0 ? fraction : fraction | (1L << 52);
            int shift = Math.Max(1, field) - 1077;
            BigInteger unit = BigInteger.One << Math.Max(0, shift);
            BigInteger denominator = BigInteger.One << Math.Max(0, -shift);
            BigInteger remainder = 4 * (BigInteger)mantissa * unit;
            BigInteger upper = 2 * unit;
            BigInteger lower = field > 1 && fraction == 0 ? unit : upper;
            bool inclusive = (mantissa & 1) == 0;

            int exponent = (int)Math.Floor(Math.Log10(Math.Abs(d)));
            BigInteger scale = BigInteger.Pow(10, Math.Abs(exponent));
            if (exponent > 0) denominator *= scale;
            else { remainder *= scale; upper *= scale; lower *= scale; }
            if (remainder < denominator)
            {
                exponent--;
                remainder *= 10;
                upper *= 10;
                lower *= 10;
            }
            else if (remainder >= denominator * 10) { exponent++; denominator *= 10; }

            long digits = 0;
            int length = 0;
            while (true)
            {
                int digit = (int)BigInteger.DivRem(remainder, denominator, out remainder);
                digits = digits * 10 + digit;
                length++;
                bool down = inclusive ? remainder <= lower : remainder < lower;
                bool up = inclusive ? remainder + upper >= denominator : remainder + upper > denominator;
                if (down || up)
                {
                    int midpoint = (remainder * 2).CompareTo(denominator);
                    if (up && (!down || midpoint > 0 || (midpoint == 0 && (digit & 1) != 0))) digits++;
                    break;
                }
                remainder *= 10;
                lower *= 10;
                upper *= 10;
            }

            string raw = digits.ToString(CultureInfo.InvariantCulture);
            exponent += raw.Length - length;
            raw = raw.TrimEnd('0');
            string result;
            if (exponent < -6 || exponent >= 21)
                result = (raw.Length == 1 ? raw : raw.Insert(1, ".")) + "e" +
                    (exponent > 0 ? "+" : "") + exponent.ToString(CultureInfo.InvariantCulture);
            else if (exponent < 0) result = "0." + new string('0', -exponent - 1) + raw;
            else result = raw.Length <= exponent + 1 ? raw.PadRight(exponent + 1, '0') : raw.Insert(exponent + 1, ".");
            return d < 0 ? "-" + result : result;
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
}
