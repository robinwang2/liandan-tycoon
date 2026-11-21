using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;

namespace Liandan.Kernel
{
    // 在同一棵快照树上操作。可选字段只在规则实际赋值时创建，扩展字段自然往返。
    public sealed partial class GameState
    {
        public JsonObject Snapshot { get; }
        private readonly Tables tables;
        public GameState(JsonObject snapshot, Tables tables)
        {
            Snapshot = snapshot;
            this.tables = tables;
        }
        private double P(string key) => tables.Parameters.N(key);
        private JsonNode D(string key) => tables.Definitions[key]!;
        public Founder Founder => new Founder(Snapshot["founder"]!);
        public Company Company => new Company(Snapshot["co"]!);
        public IEnumerable<StaffMember> Staff => Rows("staff").Select(n => new StaffMember(n));
        public IEnumerable<Rival> Rivals => Rows("rivals").Select(n => new Rival(n));
        public IEnumerable<Project> Projects => Rows("projects").Select(n => new Project(n));
        private JsonNode A => Founder.Attributes;
        private JsonNode Co => Snapshot["co"]!;
        private string Region => Company.Region;
        private JsonNode Track => D("TRACKS")[Company.Track]!;
        private JsonArray List(string key) => (JsonArray)Snapshot[key]!;
        private JsonObject Map(string key) => (JsonObject)Snapshot[key]!;
        private IEnumerable<JsonNode> Rows(string key) => List(key).Select(n => n!);
        private bool Flag(string key) => Map("flags").On(key);
        private JsonObject? OptionalRecord(string key) => Snapshot[key] is JsonObject o && !o.ContainsKey("$js") ? o : null;
        private JsonNode? Model => OptionalRecord("model");
        private JsonNode? Ideo => OptionalRecord("ideo");
        private double t { get => Snapshot.N("t"); set => Snapshot["t"] = value; }
        private double rs { get => Snapshot.N("rs"); set => Snapshot["rs"] = value; }
        private double cash { get => Snapshot.N("cash"); set => Snapshot["cash"] = value; }
        private double equity { get => Snapshot.N("equity"); set => Snapshot["equity"] = value; }
        private double stage { get => Snapshot.N("stage"); set => Snapshot["stage"] = value; }
        private double raiseBoost { get => Snapshot.N("raiseBoost"); set => Snapshot["raiseBoost"] = value; }
        private double ap { get => Snapshot.N("ap"); set => Snapshot["ap"] = value; }
        private double apNext { get => Snapshot.N("apNext"); set => Snapshot["apNext"] = value; }
        private double hype { get => Snapshot.N("hype"); set => Snapshot["hype"] = value; }
        private double rep { get => Snapshot.N("rep"); set => Snapshot["rep"] = value; }
        private double morale { get => Snapshot.N("morale"); set => Snapshot["morale"] = value; }
        private double reg { get => Snapshot.N("reg"); set => Snapshot["reg"] = value; }
        private double bubble { get => Snapshot.N("bubble"); set => Snapshot["bubble"] = value; }
        private double burstT { get => Snapshot.N("burstT"); set => Snapshot["burstT"] = value; }
        private double outage { get => Snapshot.N("outage"); set => Snapshot["outage"] = value; }
        private double users { get => Snapshot.N("users"); set => Snapshot["users"] = value; }
        private double fake { get => Snapshot.N("fake"); set => Snapshot["fake"] = value; }
        private double quality { get => Snapshot.N("quality"); set => Snapshot["quality"] = value; }
        private double E { get => Snapshot.N("E"); set => Snapshot["E"] = value; }
        private double apiIdx { get => Snapshot.N("apiIdx"); set => Snapshot["apiIdx"] = value; }
        private double gpu { get => Snapshot.N("gpu"); set => Snapshot["gpu"] = value; }
        private double gpuBase { get => Snapshot.N("gpuBase"); set => Snapshot["gpuBase"] = value; }
        private double quotaBase { get => Snapshot.N("quotaBase"); set => Snapshot["quotaBase"] = value; }
        private double quotaAdd { get => Snapshot.N("quotaAdd"); set => Snapshot["quotaAdd"] = value; }
        private double quotaEarn { get => Snapshot.N("quotaEarn"); set => Snapshot["quotaEarn"] = value; }
        private double exposed { get => Snapshot.N("exposed"); set => Snapshot["exposed"] = value; }
        private double uid { get => Snapshot.N("uid"); set => Snapshot["uid"] = value; }
        private double ideoAt { get => Snapshot.N("ideoAt"); set => Snapshot["ideoAt"] = value; }
    }
}
