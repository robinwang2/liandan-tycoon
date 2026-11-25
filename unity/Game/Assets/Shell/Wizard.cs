using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using UnityEngine.UIElements;
using static Liandan.Shell.GameShell;

namespace Liandan.Shell
{
    internal sealed class Wizard
    {
        private readonly GameShell game;
        private readonly Dictionary<string, JsonNode> defs;
        private readonly Dictionary<string, string> picks = new Dictionary<string, string> { ["region"]="bay", ["route"]="model", ["track"]="chat", ["outfit"]="turtleneck" };
        private readonly Dictionary<string, int> attrs = new Dictionary<string, int>();
        private readonly Dictionary<string, string> names = new Dictionary<string, string>();
        private readonly string[] groups = "edu bg quirk motto cofounder seed district mission".Split(' ');
        internal string Region => picks["region"];
        internal int Step;
        internal bool Tutorial;
        private string? logo;
        private string brand="#ff6b4a";
        private string Logo => logo??game.BrandData[Region]![0]!["id"]!.ToString();
        private void DrawBrand(VisualElement body) {
            var marks=Box(body,"row"); foreach(var item in game.BrandData[Region]!.AsArray()) {
                var id=item!["id"]!.ToString();var button=game.Button(marks,"logo:"+id,item["name"]!.ToString(),()=>{logo=id;game.Draw();},true,Logo==id);
                game.Picture(button,"logo-"+id+"-"+brand.Substring(1),36,36);
            }
            var colors=Box(body,"row"); foreach(var color in game.BrandData["colors"]!.AsArray()) {var value=color!.ToString(); var button=game.Button(colors,"brand:"+value,brand==value?"✓":"　",()=>{brand=value;game.Draw();}); if(UnityEngine.ColorUtility.TryParseHtmlString(value,out var tint))button.style.backgroundColor=tint;}
        }
        private readonly int baseline, maximum, points;
        private int Left => points - attrs.Values.Sum(value => value - baseline);
        internal Wizard(GameShell game)
        {
            this.game = game; defs = "ATTRS TRAITS REGIONS ROUTES TRACKS OUTFITS".Split(' ').ToDictionary(key => key, game.Tables.Definition);
            int Param(string key) => (int)game.Tables.Parameter(key);
            Tutorial=(int)game.Meta["runs"]! == 0;
            baseline = Param("start.attrBase"); maximum = Param("start.attrMax"); points = Param("start.attrPoints") + new[]{"m_point", "m_point2"}.Count(key => game.Meta["own"]![key] != null) * Param("meta.attrPoint");
            foreach (var attr in defs["ATTRS"].AsArray()) attrs[attr!["id"]!.ToString()] = baseline;
            foreach (string group in groups) picks[group] = Eligible(group).First(Unlocked)!["id"]!.ToString();
            foreach (var pair in new[]{("name","name"),("coName","co"),("modelName","model")}) names[pair.Item1] = RandomName(pair.Item2);
        }
        private string RandomName(string key)
        { var pool=game.Tables.Text("ui.rand."+key,Region=="bay").Split('\n'); return pool[(int)(game.RandomValue()*pool.Length)]; }
        private IEnumerable<JsonNode> Eligible(string group) => defs["TRAITS"][group]!.AsArray().Select(node=>node!).Where(row => row["region"] == null || row["region"]!.ToString() == Region);
        private bool Unlocked(JsonNode row) => row["cost"] == null || (int)row["cost"]! == 0 || game.Meta["own"]!["t_" + row["id"]] != null;
        private void Pick(string group, string id)
        {
            picks[group] = id;
            if(group=="region")logo=null;
            if(group=="region") foreach(var pair in new[]{("name","name"),("coName","co")})
                if(new[]{true,false}.Any(bay=>game.Tables.Text("ui.rand."+pair.Item2,bay).Split('\n').Contains(names[pair.Item1]))) names[pair.Item1]=RandomName(pair.Item2);
            if (group == "region") foreach (string key in groups) if (!Eligible(key).Any(row => row["id"]!.ToString() == picks[key])) picks[key] = Eligible(key).First(Unlocked)["id"]!.ToString();
            game.Draw();
        }
        internal void Draw(VisualElement panel)
        {
            Label(panel, (Step + 1) + " / 5   " + game.Text("ui.wiz.steps").Split('\n')[Step], "heading"); var body = Scroll(panel);
            void Field(string key, string textKey, int limit)
            {
                var field = new TextField(game.Text(textKey)) { value = names[key], maxLength = limit }; body.Add(field);
                field.textEdition.placeholder=game.Text(key=="name"?"ui.wiz.default.name":key=="coName"?"ui.wiz.default.co":"default.model");
                field.RegisterValueChangedCallback(change => names[key] = change.newValue);
            }
            void Choices(string group, IEnumerable<JsonNode?> rows)
            {
                Label(body, game.Text("ui.wiz." + group + ".h")); var line = Box(body,"row");
                foreach (var item in rows)
                {
                    var row = item!; var id = row["id"]!.ToString(); bool available = Unlocked(row);
                    string desc = row["desc"] is JsonArray list ? string.Join(" · ", list.Select(n=>n?.ToString())) : row["desc"]?.ToString() ?? "";
                    game.Button(line, group+":"+id, row["name"] + (available ? "" : " · " + game.Text("ui.wiz.locked", ("点数",row["cost"]!))), () => Pick(group,id), available, picks[group]==id);
                    line[line.childCount-1].tooltip = desc;
                }
            }
            IEnumerable<JsonNode?> Values(string key) => defs[key].AsObject().Select(pair=>pair.Value);
            if(Step==0)game.Avatar(body,Look.Founder(picks["outfit"]),72);
            if (Step == 0) { Field("name","ui.wiz.name.label",12); Choices("region",Values("REGIONS")); Choices("outfit",defs["OUTFITS"].AsArray()); Choices("motto",Eligible("motto")); }
            if (Step == 1)
            {
                Label(body,game.Text("ui.wiz.attr.left", ("点数",Left),("起步",baseline),("最高",maximum)));
                foreach (var attr in defs["ATTRS"].AsArray())
                {
                    string id = attr!["id"]!.ToString(); var line = Box(body,"row"); Label(line, attr["name"] + "   " + attrs[id]);
                    foreach (int delta in new[]{-1,1}) game.Button(line,(delta>0?"plus:":"minus:")+id,delta>0?"+":"−",()=> { attrs[id]+=delta; game.Draw(); },delta>0 ? Left>0 && attrs[id]<maximum : attrs[id]>baseline);
                    Label(line,attr["desc"]!.ToString());
                }
            }
            if (Step == 2) foreach (string key in new[]{"edu","bg","quirk"}) Choices(key,Eligible(key));
            if (Step == 3) { Choices("route",Values("ROUTES")); Choices("track",Values("TRACKS")); foreach (string key in new[]{"cofounder","seed","district"}) Choices(key,Eligible(key)); }
            if (Step == 4) { Field("coName","ui.wiz.co.label",10); Field("modelName","ui.wiz.model.label",8); Choices("mission",Eligible("mission")); }
            if(Step==4) { var toggle=new Toggle(game.Text("ui.wiz.tutorial")){value=Tutorial}; body.Add(toggle); toggle.RegisterValueChangedCallback(change=>Tutorial=change.newValue); DrawBrand(body); }
            var foot = Box(panel,"row"); game.Button(foot,"back",game.Text(Step==0?"ui.back":"ui.wiz.prev"),()=> { if (Step==0) game.Title(); else { Step--; game.Draw(); } });
            game.Button(foot,"forward",game.Text(Step==4?"ui.wiz.start":"ui.wiz.next"),()=> { if (Step<4) { Step++; game.Draw(); } else Start(); });
        }
        private void Start()
        {
            var setup = new JsonObject { ["tutorial"]=Tutorial,["logo"]=Logo,["brand"]=brand }; var values = new JsonObject(); foreach (var attr in attrs) values[attr.Key]=attr.Value;
            foreach (var key in new[]{"region","route","track","outfit"}) setup[key]=picks[key];
            foreach (var pair in names) setup[pair.Key]=string.IsNullOrWhiteSpace(pair.Value) ? game.Text(pair.Key=="name"?"ui.wiz.default.name":pair.Key=="coName"?"ui.wiz.default.co":"default.model") : pair.Value.Trim();
            setup["attrs"]=values; setup["traits"]=new JsonArray(groups.Select(key=>(JsonNode)picks[key]).ToArray()); game.Begin(setup);
        }
    }
}
