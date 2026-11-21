using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;

namespace Liandan.Kernel
{
    // 类型化视图和扩展字段共用原始记录。创建视图不会向旧存档补键，也不会改变成员顺序。
    public abstract class StateRecord
    {
        internal JsonNode Record { get; }
        internal StateRecord(JsonNode record) => Record = record;
    }

    public sealed class Company : StateRecord
    {
        internal Company(JsonNode record) : base(record) { }
        public string Name => Record.Str("name");
        public string Region => Record.Str("region");
        public string Route => Record.Str("route");
        public string Track => Record.Str("track");
        public string ModelName => Record.Str("modelName");
        public double Office { get => Record.N("office"); }
    }

    public sealed class Founder : StateRecord
    {
        internal Founder(JsonNode record) : base(record) { }
        public string Name => Record.Str("name");
        public JsonNode Attributes => Record["attrs"]!;
        public JsonArray Traits => (JsonArray)Record["traits"]!;
    }

    public sealed class StaffMember : StateRecord
    {
        internal StaffMember(JsonNode record) : base(record) { }
        public string Name => Record.Str("name");
        public string Role => Record.Str("role");
        public string? Quirk => (string?)Record["quirk"];
        public string Uid => Record.Str("uid");
        public double Skill { get => Record.N("skill"); }
        public double Salary { get => Record.N("salary"); }
    }

    public sealed class Rival : StateRecord
    {
        internal Rival(JsonNode record) : base(record) { }
        public string Id => Record.Str("id");
        public string Name => Record.Str("name");
        public string Model => Record.Str("model");
        public string Boss => Record.Str("boss");
        public double Cap { get => Record.N("cap"); internal set => Record["cap"] = value; }
        public double Drift { get => Record.N("drift"); internal set => Record["drift"] = value; }
        public double Off { get => Record.N("off"); }
        public double Hype { get => Record.N("hype"); internal set => Record["hype"] = value; }
        public double Next { get => Record.N("next"); internal set => Record["next"] = value; }
        public double Ver { get => Record.N("ver"); internal set => Record["ver"] = value; }
        public double Bench { get => Record.N("bench"); internal set => Record["bench"] = value; }
        public double Cheat { get => Record.N("cheat"); }
    }

    public sealed class Project : StateRecord
    {
        internal Project(JsonNode record) : base(record) { }
        public string Kind => Record.Str("kind");
        public string Name => Record.Str("name");
        public double Done { get => Record.N("done"); internal set => Record["done"] = value; }
        public double Need { get => Record.N("need"); }
        public double Due { get => Record.N("due"); }
    }
}
