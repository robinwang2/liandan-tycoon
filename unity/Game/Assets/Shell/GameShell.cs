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
        internal ShellLanguage Language = null!;
        internal Tables DisplayTables => Language.DisplayTables;
        internal GameState View = null!;
        private TurnView? turn;
        internal JsonObject? DialogView => turn?.Read(Language).dialog?.View;
        internal JsonObject? ResultView => turn?.Read(Language).result;
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
        private Office? office;
        private bool officeRelease;
        private static readonly string[] TitleRoles={"res","eng","eng","ops","biz","legal","res"};
        internal double RandomValue() => GameState.NextRandom(ref Seed);
        internal static double Number(JsonNode value) => double.Parse(value.ToString(), System.Globalization.CultureInfo.InvariantCulture);
        internal string Text(string key, params (string, object)[] vars) => DisplayTables.Text(key, ScreenId == "wizard" ? Wizard.Region == "bay" : State?.Company.Region == "bay", vars);
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
                if (args.Contains("-avatar-test")) { Look.SelfTest(); Application.Quit(0); return; }
                string? eggShots = EggTestDirectory(args);
                bool gallery = eggShots != null || args.Contains("-eggs");
                var driver = auto && !gallery ? new Autoplay(this, args) : null;
                if (!auto) Seed = Environment.TickCount;
                Language = new ShellLanguage(Path.Combine(Application.streamingAssetsPath, "tables"), Path.Combine(Application.streamingAssetsPath, "i18n/en.json"));
                Tables = Language.Source;
                Rows = Tables.GetActionRows().ToDictionary(row => row!["id"]!.ToString(), row => row!);
                var saveDirectory = eggShots == null ? driver?.SaveDirectory ?? Application.persistentDataPath : Path.Combine(eggShots, "save-" + Guid.NewGuid().ToString("N"));
                Store = new GameStore(saveDirectory, Tables); Meta = Store.LoadMeta();
                if (gallery) CreateEggGallery();
                else if(args.Contains("-art-batch1") || args.Contains("-art-batch2"))
                {
                    Whitebox.Create(false,true);
                    PropBatch.Place(args.Contains("-art-batch2") ? "Batch2" : "Batch1");
                }
                else office=Whitebox.Create().GetComponent<Office>();
                var panel = Required<PanelSettings>("ShellPanel");
                var ui = new GameObject("Shell UI");
                ui.SetActive(false);
                ui.transform.SetParent(transform, false);
                var doc = ui.AddComponent<UIDocument>();
                doc.panelSettings = panel;
                ui.SetActive(true);
                Root = doc.rootVisualElement;
                Transition = new ThemeFx(doc);
                SuppressThemeFx = auto;
                captureDirectory=driver?.LanguageShots==true ? null : driver?.Shots;
                InitSettings(auto || eggShots != null, driver?.LanguageShots == true ? driver.SaveDirectory : null);
                Root.styleSheets.Add(Required<StyleSheet>("Shell")); Root.AddToClassList("shell");
                Root.style.unityFontDefinition = FontDefinition.FromSDFFont(Required<UnityEngine.TextCore.Text.FontAsset>("ShellFont"));
                Draw(); if (eggShots != null) StartCoroutine(RunEggTest(eggShots, saveDirectory));
                if (driver != null) { UnlockSound(); StartCoroutine(driver.Run()); }
            }
            catch (Exception error) { Debug.LogException(error); if (auto || args.Contains("-eggs-test") || args.Contains("-audiotest") || args.Contains("-audiotest-readback") || args.Contains("-avatar-test")) Application.Quit(1); }
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
        internal void Hover(VisualElement anchor, Func<string> message, string? id=null, Action<VisualElement>? header=null)
        {
            void Hide() { bubble?.RemoveFromHierarchy(); bubble=null; }
            void Show()
            {
                Hide(); var content=message(); if(content.Length==0)return;
                bubble=Box(Root,"bubble"); bubble.pickingMode=PickingMode.Ignore; header?.Invoke(bubble);
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
            Result = null!;
            if (next == null) turn = new TurnView(State, Tables, s => (s.NextDialog(), null));
            Dialog = next ?? turn!.Original.dialog;
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
            ActionId=id;
            turn = new TurnView(State, Tables, s => { var r = s.Perform(id, out var d); return (d, r); });
            var (dialog, result) = turn.Original;
            if (id=="code" && result!=null) Cue("type");
            if (dialog != null || result == null) Pump(dialog); else ShowResult(result);
        }
        internal void Choose(int index)
        {
            turn!.Choose(State, index);
            var result = turn.Original.result;
            if (Dialog!.Next != null) Pump(Dialog.Next); else if (result != null) ShowResult(result,true);
        }
        internal JsonObject? LocalResult(Func<GameState, JsonObject?> action)
        {
            turn = new TurnView(State, Tables, s => (null, action(s)));
            return turn.Original.result;
        }
        internal void ShowResult(JsonObject result,bool choice=false)
        {
            ConsumeFx();
            if (result["ok"]!=null) { if (choice) Cue("stamp"); Cue((bool)result["ok"]!?"good":"bad"); }
            else if (!choice && (result["text"]!=null || result["err"]!=null)) Cue("toast");
            if (result["chips"] is JsonArray chips && chips.Any(c=>c!["k"]?.ToString()=="cash" && (bool?)c["good"]==false)) Cue("spend");
            Result = result; ScreenId = "result"; Draw();
        }
        internal void Title() { ScreenId = "title"; State = null!; Summary = null!; Dialog = null; turn = null; Draw(); }
        private void SyncOffice()
        {
            if(!office)return;
            if(ScreenId=="wizard")
                office!.Show(Wizard.Region,1,Wizard.District,Wizard.Track,-1,Wizard.OwnModel?1:0,Array.Empty<string>(),Wizard.OwnModel,
                    outfit:Wizard.Outfit,session:Wizard,animateRacks:false);
            else if(State==null)
                office!.Show("bay",3,"","",-1,4,TitleRoles,titleView:true);
            else
            {
                var snapshot=State.Snapshot;
                int level=(int)State.Company.Office;
                string district=State.Founder.Traits.Select(value=>value!.ToString()).FirstOrDefault(value=>value.StartsWith("d_"))??"";
                bool own=(bool)snapshot["ownModel"]!;
                int racks=own?(int)Math.Ceiling(Math.Log(Number(snapshot["gpu"]!)/8+1,2)):0;
                var members=snapshot["staff"]!.AsArray();
                var roles=members.Select(row=>row!["role"]!.ToString()).ToArray();
                var ids=members.Select(row=>row!["uid"]!.ToString()).ToArray();
                float morale=(float)Number(snapshot["morale"]!);
                var moods=ids.Select(id=>int.TryParse(id.AsSpan(1),out int n)?Mathf.Clamp(morale+n*7%21-10,0,100):morale).ToArray();
                double free=Math.Max(0,Number(snapshot["gpu"]!)-State.ReadBotValue("inferNeed"));
                float heat=own && (bool?)snapshot["furnace"]?["on"]==true && free>0?
                    (float)(.25+.75*free/Math.Max(1,State.ReadBotValue("quota"))):0;
                office!.Show(State.Company.Region,level,district,State.Company.Track,level==floorOffice?floor:-1,racks,roles,own,
                    ids:ids,moods:moods,heat:heat,outfit:snapshot["founder"]?["outfit"]?.ToString()??"turtleneck",session:State,
                    animateRacks:ScreenId!="end" && !SuppressThemeFx && Pref("themefx",1)!=0);
                if(officeRelease && own)office.PlayRelease();
            }
            officeRelease=false;
            if(ScreenId!="main")office!.Viewport(new Rect(0,0,1,1));
        }

        private void FrameStage(VisualElement stage)
        {
            var bounds=stage.worldBound;
            var root=Root.worldBound;
            if(stage.panel==null || bounds.width<=0 || bounds.height<=0 || root.width<=0 || root.height<=0)return;
            office!.Viewport(new Rect((bounds.x-root.x)/root.width,(root.yMax-bounds.yMax)/root.height,
                bounds.width/root.width,bounds.height/root.height));
        }

        internal void Draw()
        {
            Root.Clear(); Root.EnableInClassList("english", Language.English); bubble=null; Controls.Clear(); ApplyTheme(); SyncSound();
            SyncOffice();
            if (ScreenId == "eggs") { DrawEggGallery(); return; }
            if (State != null && State.Snapshot["over"] == null && ScreenId is "main" or "event" or "result" or "local") PrepareTutorial();
            View = State == null ? null! : Language.View(State);
            if (ScreenId == "main")
            {
                Advice=VisibleAdvice();TrackSoundHints();TopBar.Draw(this); var body = Box(Root, "body"); ActionList.Draw(this, Box(body, "left")); var stage=Box(body,"stage"); Dashboard.Hints(this,stage); DrawTutorial(stage); if(Open("team")) SidePanel.Draw(this, Box(body, "right")); DrawFooter();
                if(office)stage.RegisterCallback<GeometryChangedEvent>(_=>FrameStage(stage));
                return;
            }
            var overlay = Box(Root, "veil"); var panel = Box(overlay, "panel");
            if(office && ScreenId=="title")
            {
                overlay.style.flexDirection=FlexDirection.Row;
                overlay.style.backgroundColor=Color.clear;
                panel.style.width=Length.Percent(35);
                var stage=Box(overlay,"stage");
                stage.style.alignSelf=Align.Stretch;
                stage.RegisterCallback<GeometryChangedEvent>(_=>FrameStage(stage));
            }
            if (ScreenId != "title" && ScreenId != "end") panel.AddToClassList("scroll-panel");
            if (ScreenId is "event" or "result" or "end" or "wizard") Button(panel,"settings",Text("ui.set.h"),OpenSettings);
            switch (ScreenId)
            {
                case "menu": DrawMenu(panel); break;
                case "settings": DrawSettings(panel); break;
                case "ach": AddEggCounter(panel); DrawCatalogue(panel); break;
                case "ends": DrawCatalogue(panel); break;
                case "wizard": Wizard.Draw(panel); break;
                case "local": localBody!(Scroll(panel)); Button(panel,"back",Text("ui.back"),CloseLocal); break;
                case "event": case "result": EventPanel.Draw(this, panel); break;
                case "end": EndingPanel.Draw(this, panel); break;
                case "meta":
                    Label(panel, Text("ui.meta.shop") + " · " + Text("ui.points", ("点数", Meta["points"]!)), "heading");
                    var shop = Scroll(panel);
                    foreach (var item in DisplayTables.Definition("META_SHOP").AsArray())
                    {
                        var row = item!; var id = row["id"]!.ToString(); bool owned = Meta["own"]![id] != null;
                        bool locked = row["need"] != null && Meta["own"]![row["need"]!.ToString()] == null;
                        Button(shop, "buy:" + id, row["name"] + " · " + (owned ? Text("ui.meta.owned") : locked ? Text("ui.meta.needPrev") : Text("ui.meta.cost", ("点数", row["cost"]!))), () => { Store.Buy(Meta, row); Draw(); }, !owned && !locked && Number(Meta["points"]!) >= Number(row["cost"]!));
                    }
                    foreach (var group in new[]{("ends","ENDINGS"),("ach","ACHIEVEMENTS")})
                    {
                        var catalogue = DisplayTables.Definition(group.Item2).AsObject(); var known = Meta[group.Item1]!.AsObject();
                        Label(shop, Text("ui.meta."+group.Item1)+"   "+known.Count+" / "+catalogue.Count,"heading");
                        foreach (var entry in catalogue.Where(pair=>known.ContainsKey(pair.Key))) Label(shop,entry.Value!["name"]+"   "+(group.Item1=="ends"?Text("ui.meta.endCount",("次数",known[entry.Key]!)):entry.Value["desc"]?.ToString()));
                    }
                    Button(panel, "back", Text("ui.back"), OpenMenu); break;
                default:
                    Label(panel, Text("ui.title.name"), "heading"); Label(panel, Text("ui.title.fine"));
                    Button(panel, "new", Text("ui.title.new"), NewWizard);
                    var save = Store.LoadGame(); if (save != null) Button(panel, "continue", Text("ui.title.continue") + " · " + Language.CompanyName(save), () => Resume(save));
                    Button(panel, "meta", Text("ui.title.meta"), () => Page("meta")); Button(panel,"menu",Language.Tr("菜单"),OpenMenu); break;
            }
        }
    }
}
