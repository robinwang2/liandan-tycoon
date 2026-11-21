using System;
using System.Buffers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Liandan.Kernel
{
    public sealed partial class GameState
    {
        // 参照 trace-codec：对象中的显式 undefined 会保留，运行中新产生的特殊数在写出时编码。
        public string ToSnapshotJson()
        {
            var bytes = new ArrayBufferWriter<byte>();
            using (var writer = new Utf8JsonWriter(bytes))
                WriteNode(writer, Snapshot);
            return Encoding.UTF8.GetString(bytes.WrittenSpan);
        }

        private static void WriteNode(Utf8JsonWriter writer, JsonNode? node)
        {
            switch (node)
            {
                case null:
                    writer.WriteNullValue();
                    break;
                case JsonArray list:
                    writer.WriteStartArray();
                    foreach (var value in list) WriteNode(writer, value);
                    writer.WriteEndArray();
                    break;
                case JsonObject obj:
                    writer.WriteStartObject();
                    foreach (var pair in obj)
                    {
                        writer.WritePropertyName(pair.Key);
                        WriteNode(writer, pair.Value);
                    }
                    writer.WriteEndObject();
                    break;
                case JsonValue value when value.TryGetValue<double>(out var d) &&
                    (double.IsNaN(d) || double.IsInfinity(d) || BitConverter.DoubleToInt64Bits(d) == long.MinValue):
                    writer.WriteStartObject();
                    writer.WriteString("$js", d == 0 ? "-0" : double.IsNaN(d) ? "NaN" : d > 0 ? "Infinity" : "-Infinity");
                    writer.WriteEndObject();
                    break;
                default:
                    node.WriteTo(writer);
                    break;
            }
        }
    }
}
