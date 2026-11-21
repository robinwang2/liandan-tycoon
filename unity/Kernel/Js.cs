using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using System.Globalization;
using System.Numerics;

namespace Liandan.Kernel
{
    internal static class Js
    {
        internal static double N(this JsonNode? obj, string key, double fallback = 0) =>
            obj?[key] switch
            {
                JsonValue n when n.TryGetValue<double>(out var d) => d,
                JsonValue n when n.TryGetValue<int>(out var i) => i,
                JsonObject marker when marker.ContainsKey("$js") => marker.Str("$js") switch
                {
                    "-0" => -0.0,
                    "Infinity" => double.PositiveInfinity,
                    "-Infinity" => double.NegativeInfinity,
                    "NaN" => double.NaN,
                    "undefined" => fallback,
                    _ => throw new FormatException("未知快照标记")
                },
                _ => fallback
            };
        internal static string Str(this JsonNode? obj, string key, string fallback = "") =>
            obj?[key] is JsonValue n ? n.ToString() : fallback;
        internal static bool On(this JsonNode? obj, string key)
        {
            var n = obj?[key];
            if (n == null) return false;
            if (n is JsonObject o && o.ContainsKey("$js")) return o.Str("$js") == "Infinity" || o.Str("$js") == "-Infinity";
            if (!(n is JsonValue v)) return true;
            if (v.TryGetValue<bool>(out var b)) return b;
            if (v.TryGetValue<double>(out var d)) return d != 0 && !double.IsNaN(d);
            if (v.TryGetValue<int>(out var i)) return i != 0;
            return v.ToString().Length != 0;
        }
        internal static JsonObject Obj(params (string key, JsonNode? value)[] fields)
        {
            var result = new JsonObject();
            foreach (var field in fields) result[field.key] = field.value?.DeepClone();
            return result;
        }
        internal static JsonNode Undefined => Obj(("$js", "undefined"));
        internal static double Clamp(double x, double lo, double hi) => Math.Max(lo, Math.Min(hi, x));
        internal static double RoundJs(double x)
        {
            double floor = Math.Floor(x);
            if (x == floor) return x;
            if (x < 0 && x >= -0.5) return -0.0;
            return x - floor < 0.5 ? floor : floor + 1;
        }
        // 先拆 binary64，再对精确的十进制缩放结果取整；中点向绝对值更大一侧。
        internal static string Fixed(double x, int digits)
        {
            if (double.IsNaN(x) || double.IsInfinity(x) || Math.Abs(x) >= 1e21)
                return x.ToString("R", CultureInfo.InvariantCulture).Replace("E", "e");
            long bits = BitConverter.DoubleToInt64Bits(Math.Abs(x));
            int exponent = (int)(bits >> 52);
            long mantissa = bits & 0xfffffffffffffL;
            if (exponent != 0) mantissa |= 1L << 52;
            int shift = Math.Max(1, exponent) - 1075;
            BigInteger value = mantissa * BigInteger.Pow(10, digits);
            value = shift >= 0 ? value << shift : (value + (BigInteger.One << (-shift - 1))) >> -shift;
            string raw = value.ToString(CultureInfo.InvariantCulture).PadLeft(digits + 1, '0');
            return (x < 0 ? "-" : "") + (digits == 0 ? raw : raw.Insert(raw.Length - digits, "."));
        }
        internal static double FixedNumber(double x, int digits) =>
            double.Parse(Fixed(x, digits), CultureInfo.InvariantCulture);
        internal static IEnumerable<KeyValuePair<string, JsonNode?>> Entries(this JsonNode? node) =>
            node is JsonObject obj ? obj.OrderBy(p => Index(p.Key)) : Enumerable.Empty<KeyValuePair<string, JsonNode?>>();
        internal static uint Index(string key) =>
            uint.TryParse(key, NumberStyles.None, CultureInfo.InvariantCulture, out var n) && n.ToString(CultureInfo.InvariantCulture) == key ? n : uint.MaxValue;
    }
}
