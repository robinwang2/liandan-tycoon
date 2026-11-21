using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;
using Liandan.Kernel;
using UnityEngine;
using UnityEngine.UIElements;

namespace Liandan.Shell
{
    public sealed partial class GameShell : MonoBehaviour
    {
        internal Tables Tables = null!;
        internal GameStore Store = null!;
        internal JsonObject Meta = null!;
        internal GameState State = null!;
        internal JsonObject Summary = null!, Result = null!;
        internal GameState.Dialog? Dialog;
        internal string ScreenId = "title", Tab = "rd", Side = "fin";
        internal Wizard Wizard = null!;
        internal VisualElement Root = null!;
        internal readonly Dictionary<string, Action> Controls = new Dictionary<string, Action>();
        internal JsonArray Menu = new JsonArray();
        internal JsonArray Advice = new JsonArray();
        internal bool Recommended(string id)=>Advice.Any(row=>row!["act"]?.ToString()==id && row["later"]?.GetValue<bool>()!=true);
        internal Dictionary<string, JsonNode> Rows = null!;
        internal int Seed;
        internal double RandomValue() => GameState.NextRandom(ref Seed);
        internal static double Number(JsonNode value) => double.Parse(value.ToString(), System.Globalization.CultureInfo.InvariantCulture);
        internal string Text(string key, params (string, object)[] vars) => Tables.Text(key, ScreenId == "wizard" ? Wizard.Region == "bay" : State?.Company.Region == "bay", vars);
        internal static T Required<T>(string name) where T : UnityEngine.Object
        {
            var asset = Resources.Load<T>(name);
            if (!asset) throw new InvalidOperationException($"缺少 Shell 资源 {name} ({typeof(T).Name})，请运行 setup-ui");
            return asset;
        }
        private void Start()
        {
            var args = Environment.GetCommandLineArgs(); bool auto = args.Contains("-autoplay");
            try
            {
                if(args.Contains("-art-batch1-ab")){enabled=false;return;}
                System.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.InvariantCulture;
                if (args.Contains("-audiotest") || args.Contains("-audiotest-readback")) { StartAudioTest(args); return; }
                var driver = auto ? new Autoplay(this, args) : null;
                if (!auto) Seed = Environment.TickCount;
                Tables = new Tables(Path.Combine(Application.streamingAssetsPath, "tables"));
                Rows = Tables.GetActionRows().ToDictionary(row => row!["id"]!.ToString(), row => row!);
                Store = new GameStore(driver?.SaveDirectory ?? Application.persistentDataPath, Tables); Meta = Store.LoadMeta();
                if(args.Contains("-art-batch1")){Whitebox.Create(false,true);PropBatch.Place();} else Whitebox.Create();
                var panel = Required<PanelSettings>("ShellPanel");
                var ui = new GameObject("Shell UI");
                ui.SetActive(false);
                ui.transform.SetParent(transform, false);
                var doc = ui.AddComponent<UIDocument>();
                doc.panelSettings = panel;
                ui.SetActive(true);
                Root = doc.rootVisualElement;
                captureDirectory=driver?.Shots;
                InitSettings(auto);
                Root.styleSheets.Add(Required<StyleSheet>("Shell")); Root.AddToClassList("shell");
                Root.style.unityFontDefinition = FontDefinition.FromSDFFont(Required<UnityEngine.TextCore.Text.FontAsset>("ShellFont"));
                Draw(); if (driver != null) { UnlockSound(); StartCoroutine(driver.Run()); }
            }
            catch (Exception error) { Debug.LogException(error); if (auto || args.Contains("-audiotest") || args.Contains("-audiotest-readback")) Application.Quit(1); }
        }
        internal static VisualElement Box(VisualElement parent, string style)
        { var box = new VisualElement(); box.AddToClassList(style); parent.Add(box); return box; }
        internal static Label Label(VisualElement parent, string text, string style = "copy")
        { var label = new Label(text) { enableRichText = false }; label.AddToClassList(style); parent.Add(label); return label; }
        internal static ScrollView Scroll(VisualElement parent)
        { var scroll = new ScrollView(); scroll.style.flexGrow = 1; parent.Add(scroll); return scroll; }
        internal Button Button(VisualElement parent, string id, string text, Action click, bool enabled = true, bool selected = false)
        {
            string group=id.Split(':')[0];
            void Press()
            {
                UnlockSound();
                if (group=="close") Cue("choose");
                if (group!="floor") Cue(group switch {
                    "tab" or "side"=>"tab","option"=>"choose","month"=>"turn","close"=>"close",
                    "back" when ScreenId=="local"=>"close","confirm" when ScreenId=="local"=>"choose",_=>"click" });
                click();
            }
            var button = new Button(Press) { name = id, text = text, enableRichText = false }; parent.Add(button); button.SetEnabled(enabled);
            if (enabled && (group is "option" or "act" or "tab" or "side" or "advance" || ScreenId=="local" && group=="confirm"))
                button.RegisterCallback<PointerEnterEvent>(_=>Cue("hover"));
            if (selected) button.AddToClassList("selected"); if (enabled) Controls.Add(id, Press);
            return button;
        }
        internal bool AllHints;
        internal string LocalId = "", ActionId = "";
        private Action<VisualElement>? localBody;
        internal void Local(string id, Action<VisualElement> body) { LocalId=id; localBody=body; ScreenId="local"; Draw(); }
        internal void CloseLocal() { ScreenId="main"; Draw(); }
        private VisualElement? bubble;
        internal void Hover(VisualElement anchor, Func<string> message, string? id=null)
        {
            void Hide() { bubble?.RemoveFromHierarchy(); bubble=null; }
            void Show()
            {
                Hide(); var content=message(); if(content.Length==0)return;
                bubble=Box(Root,"bubble"); bubble.pickingMode=PickingMode.Ignore;
                Label(bubble,content).pickingMode=PickingMode.Ignore;
                var bounds=anchor.worldBound; var origin=Root.worldBound;
                bubble.style.left=Math.Max(0,bounds.xMax-origin.x+320<origin.width ? bounds.xMax-origin.x+4 : bounds.xMin-origin.x-324);
                bubble.style.top=Math.Max(0,Math.Min(bounds.yMin-origin.y,origin.height-240));
                var visible=bubble;visible.RegisterCallback<GeometryChangedEvent>(change=>{
                    if(visible==bubble && change.newRect.height>0)visible.style.top=Math.Max(0,Math.Min(bounds.yMin-origin.y,origin.height-change.newRect.height-4));
                });
            }
            anchor.RegisterCallback<PointerEnterEvent>(_=>Show()); anchor.RegisterCallback<PointerLeaveEvent>(_=>Hide());
            if(anchor is Button){anchor.RegisterCallback<FocusInEvent>(_=>Show());anchor.RegisterCallback<FocusOutEvent>(_=>Hide());}
            if(id!=null) Controls.Add(id,Show);
        }
        internal void NewWizard() { Wizard = new Wizard(this); ScreenId = "wizard"; Draw(); }
        internal void Begin(JsonObject setup)
        {
            State = GameState.NewGame(Tables, setup, Meta, RandomValue); Tab = "rd"; Side = "board"; AllHints=false; Summary = null!;
            heardHints=null; crisis=0; quietTheme=true; lastTip=null; floorOffice=-1; Store.SaveGame(State); Pump();
        }
        internal void Pump(GameState.Dialog? next = null)
        {
            if(next==null)ActionId="";
            Result = null!; Dialog = next ?? State.NextDialog();
            ConsumeFx();
            if (Dialog != null) { ScreenId = "event"; Cue(Dialog.View["kind"]?.ToString()=="cards"?"card":"open"); }
            else if (State.Snapshot["over"] != null)
            {
                if (Summary == null) { Summary = State.Settle(Meta); Store.SaveMeta(Meta); Store.ClearSave(); Cue(GoodEnding?"good":"bad"); }
                ScreenId = "end";
            }
            else { ScreenId = "main"; PrepareTutorial(); Store.SaveGame(State); }
            Draw();
        }
        internal void Act(string id)
        {
            ActionId=id; var result = State.Perform(id, out var dialog);
            if (id=="code" && result!=null) Cue("type");
            if (dialog != null || result == null) Pump(dialog); else ShowResult(result);
        }
        internal void Choose(int index)
        {
            var result = State.Choose(Dialog!, index);
            if (Dialog!.Next != null) Pump(Dialog.Next); else if (result != null) ShowResult(result,true);
        }
        internal void ShowResult(JsonObject result,bool choice=false)
        {
            ConsumeFx();
            if (result["ok"]!=null) { if (choice) Cue("stamp"); Cue((bool)result["ok"]!?"good":"bad"); }
            else if (!choice && (result["text"]!=null || result["err"]!=null)) Cue("toast");
            if (result["chips"] is JsonArray chips && chips.Any(c=>c!["k"]?.ToString()=="cash" && (bool?)c["good"]==false)) Cue("spend");
            Result = result; ScreenId = "result"; Draw();
        }
        internal void Title() { ScreenId = "title"; State = null!; Summary = null!; Dialog = null; Draw(); }
        internal void Draw()
        {
            Root.Clear(); bubble=null; Controls.Clear(); ApplyTheme(); SyncSound();
            if(State!=null && State.Snapshot["over"]==null && ScreenId!="wizard") PrepareTutorial();
            if (ScreenId == "main")
            {
                Advice=VisibleAdvice();TrackSoundHints();TopBar.Draw(this); var body = Box(Root, "body"); ActionList.Draw(this, Box(body, "left")); var stage=Box(body,"stage"); Dashboard.Hints(this,stage); DrawTutorial(stage); if(Open("team")) SidePanel.Draw(this, Box(body, "right")); DrawFooter(); return;
            }
            var overlay = Box(Root, "veil"); var panel = Box(overlay, "panel");
            if (ScreenId != "title" && ScreenId != "end") panel.AddToClassList("scroll-panel");
            switch (ScreenId)
            {
                case "menu": DrawMenu(panel); break;
                case "settings": DrawSettings(panel); break;
                case "ach": case "ends": DrawCatalogue(panel); break;
                case "wizard": Wizard.Draw(panel); break;
                case "local": localBody!(Scroll(panel)); Button(panel,"back",Text("ui.back"),CloseLocal); break;
                case "event": case "result": EventPanel.Draw(this, panel); break;
                case "end": EndingPanel.Draw(this, panel); break;
                case "meta":
                    Label(panel, Text("ui.meta.shop") + " · " + Text("ui.points", ("点数", Meta["points"]!)), "heading");
                    var shop = Scroll(panel);
                    foreach (var item in Tables.Definition("META_SHOP").AsArray())
                    {
                        var row = item!; var id = row["id"]!.ToString(); bool owned = Meta["own"]![id] != null;
                        bool locked = row["need"] != null && Meta["own"]![row["need"]!.ToString()] == null;
                        Button(shop, "buy:" + id, row["name"] + " · " + (owned ? Text("ui.meta.owned") : locked ? Text("ui.meta.needPrev") : Text("ui.meta.cost", ("点数", row["cost"]!))), () => { Store.Buy(Meta, row); Draw(); }, !owned && !locked && Number(Meta["points"]!) >= Number(row["cost"]!));
                    }
                    foreach (var group in new[]{("ends","ENDINGS"),("ach","ACHIEVEMENTS")})
                    {
                        var catalogue = Tables.Definition(group.Item2).AsObject(); var known = Meta[group.Item1]!.AsObject();
                        Label(shop, Text("ui.meta."+group.Item1)+"   "+known.Count+" / "+catalogue.Count,"heading");
                        foreach (var entry in catalogue.Where(pair=>known.ContainsKey(pair.Key))) Label(shop,entry.Value!["name"]+"   "+(group.Item1=="ends"?Text("ui.meta.endCount",("次数",known[entry.Key]!)):entry.Value["desc"]?.ToString()));
                    }
                    Button(panel, "back", Text("ui.back"), OpenMenu); break;
                default:
                    Label(panel, Text("ui.title.name"), "heading"); Label(panel, Text("ui.title.fine"));
                    Button(panel, "new", Text("ui.title.new"), NewWizard);
                    var save = Store.LoadGame(); if (save != null) Button(panel, "continue", Text("ui.title.continue") + " · " + save.Company.Name, () => Resume(save));
                    Button(panel, "meta", Text("ui.title.meta"), () => Page("meta")); Button(panel,"menu","菜单",OpenMenu); break;
            }
        }
    }
}
