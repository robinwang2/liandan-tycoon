using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;
using Liandan.Kernel;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.UIElements;

namespace Liandan.Shell
{
    public sealed partial class GameShell
    {
        private JsonObject prefs=null!,audio=null!;
        internal JsonObject BrandData=null!;
        private string prefPath="",theme="";
        private readonly Dictionary<string,Texture2D> textures=new Dictionary<string,Texture2D>();
        private int effectiveTier,frames;
        private float elapsed,slowTime;
        private Label? fpsLabel;
        internal event Action<string>? ThemeChanged;
        internal event Action<string,float>? AudioLevelChanged;
        private static string ArtPath(string file)=>Path.Combine(Application.streamingAssetsPath,"shell-art",file);
        internal void Picture(VisualElement parent,string key,int width,int height,string name="") {
            if(!textures.TryGetValue(key,out var texture)) {
                var path=ArtPath(key+(key.StartsWith("art-")?".jpg":".png"));if(!File.Exists(path))return;
                texture=new Texture2D(2,2);if(!texture.LoadImage(File.ReadAllBytes(path),true)){Destroy(texture);throw new IOException("无法解码："+path);}textures[key]=texture;
            }
            var image=new Image {image=texture,name=name,scaleMode=width==0?ScaleMode.ScaleAndCrop:ScaleMode.ScaleToFit,pickingMode=PickingMode.Ignore}; image.style.height=height; if(width>0)image.style.width=width;else image.style.flexGrow=1;parent.Add(image);
            if(parent is Button button){
                var caption=new Label(button.text){enableRichText=false,pickingMode=PickingMode.Ignore};
                button.text=string.Empty;button.AddToClassList("icon-button");image.AddToClassList("button-glyph");
                caption.AddToClassList("button-caption");button.Add(caption);
            }
        }
        private void InitSettings(bool autoplay) {
            BrandData=JsonNode.Parse(File.ReadAllText(ArtPath("brand.json")))!.AsObject();
            audio=JsonNode.Parse(File.ReadAllText(Path.Combine(Application.streamingAssetsPath,"tables/audio.json")))!.AsObject();
            prefPath=autoplay?"":Path.Combine(Application.persistentDataPath,"ldt_settings.json");prefs=new JsonObject();
            if(File.Exists(prefPath)){try{prefs=JsonNode.Parse(File.ReadAllText(prefPath))!.AsObject();}catch(Exception error){Debug.LogWarning("设置读取失败，使用默认值："+error.Message);}}
            ApplyGraphics();ApplyVolume();
        }
        private int Pref(string key,int fallback)=>prefs[key] is JsonValue value && value.TryGetValue<int>(out var count)?count:fallback;
        private void SetPref(string key,int value){prefs[key]=value;if(prefPath!=""){Directory.CreateDirectory(Path.GetDirectoryName(prefPath)!);File.WriteAllText(prefPath,prefs.ToJsonString());}}
        private int Volume(string id)=>Pref(id,(int)Math.Round(Number(audio["VOLUMES"]![id]!)*100));
        private void ApplyVolume(){foreach(var pair in audio["VOLUMES"]!.AsObject())AudioLevelChanged?.Invoke(pair.Key,Pref("mute",0)==0?Volume(pair.Key)/100f:0);}
        private void ApplyGraphics(int? adaptive=null){effectiveTier=Mathf.Clamp(adaptive??Pref("tier",3),0,6);QualitySettings.SetQualityLevel(Mathf.RoundToInt(effectiveTier*(QualitySettings.names.Length-1)/6f),true);
            int cap=Pref("cap",-1);QualitySettings.vSyncCount=0;Application.targetFrameRate=cap<0?(effectiveTier==0?30:-1):cap==0?-1:cap;
            // 使用当前 URP 实例的渲染比例，不改变窗口和 UI 的分辨率。
            var pipeline=GraphicsSettings.currentRenderPipeline; if(pipeline!=null)pipeline.GetType().GetProperty("renderScale")?.SetValue(pipeline,Mathf.Clamp(Pref("scale",100),50,150)/100f);
        }
        private void Update(){if(Root==null)return;HandleKeys();elapsed+=Time.unscaledDeltaTime;frames++;if(elapsed<1)return;float fps=frames/elapsed;
            if(fpsLabel?.panel!=null)fpsLabel.text=Mathf.RoundToInt(fps)+" FPS";
            if(ScreenId=="main" && Pref("auto",1)!=0 && fps<23)slowTime+=elapsed;else slowTime=0;
            if(slowTime>=5 && effectiveTier>0){ApplyGraphics(effectiveTier-1);slowTime=0;}frames=0;elapsed=0;
        }
        internal void DrawFps(VisualElement bar){fpsLabel=Pref("fps",0)!=0?Label(bar,"— FPS"):null;}
        private void Page(string page){ScreenId=page;Draw();}
        internal void OpenMenu()=>Page("menu");
        private void Resume(GameState save){State=save;Tab="rd";Side="board";floorOffice=-1;lastTip=null;AllHints=false;Summary=null!;Pump();}
        private void DrawMenu(VisualElement panel){Label(panel,Text("ui.menu.title"),"heading");var save=State??Store.LoadGame();
            Button(panel,"resume","继续",()=>{if(State!=null)Page("main");else Resume(save!);},save!=null);
            Button(panel,"new","新游戏",NewWizard); Button(panel,"meta","局外商店",()=>Page("meta")); Button(panel,"ach","成就",()=>Page("ach"));Button(panel,"ends","结局图鉴",()=>Page("ends"));
            Button(panel,"settings","设置",()=>Page("settings"));Button(panel,"title","返回标题",Title);Button(panel,"quit","退出游戏",()=>Application.Quit());}
        private void DrawCatalogue(VisualElement panel){var ends=ScreenId=="ends";var catalogue=Tables.Definition(ends?"ENDINGS":"ACHIEVEMENTS").AsObject();var known=Meta[ScreenId]!.AsObject();Label(panel,Text("ui.meta."+ScreenId)+"   "+known.Count+" / "+catalogue.Count,"heading");var body=Scroll(panel);
            foreach(var pair in catalogue){bool unlocked=known.ContainsKey(pair.Key);var row=pair.Value!;
                Label(body,ends&&!unlocked?Text("ui.meta.unknown"):(unlocked?row["icon"]?.ToString():"未解锁")+"  "+row["name"]+"   "+(ends?Text("ui.meta.endCount",("次数",known[pair.Key]!)):row["desc"]?.ToString()));}
            Button(panel,"back","返回菜单",OpenMenu);}
        private void DrawSettings(VisualElement panel){Picture(panel,"icon-settings",28,28);Label(panel,Text("ui.set.h"),"heading");var body=Scroll(panel);
            void TogglePref(string key,string title,int fallback,Action? apply=null){var field=new Toggle(title){value=Pref(key,fallback)!=0};body.Add(field);field.RegisterValueChangedCallback(change=>{SetPref(key,change.newValue?1:0);apply?.Invoke();});}
            void SliderPref(string key,string title,int min,int max,int value,Action apply,int step=1){var field=new SliderInt(title,min,max){value=value,showInputField=true};body.Add(field);field.RegisterValueChangedCallback(change=>{int next=Mathf.Clamp(Mathf.RoundToInt(change.newValue/(float)step)*step,min,max);field.SetValueWithoutNotify(next);SetPref(key,next);apply();});}
            Label(body,Text("ui.set.gfx"),"section");string[] levels={"手机","极简","流畅","均衡","高","电影","极致"};var tiers=Box(body,"row");for(int index=0;index<levels.Length;index++){int tier=index;Button(tiers,"tier:"+tier,levels[tier],()=>{SetPref("tier",tier);SetPref("auto",0);ApplyGraphics();Draw();},true,tier==effectiveTier);}
            SliderPref("scale",Text("ui.set.scale")+" %",50,150,Pref("scale",100),()=>ApplyGraphics(),10);Label(body,Text("ui.set.fps"));var caps=Box(body,"row");foreach(int cap in new[]{-1,30,60,0})Button(caps,"cap:"+cap,cap==-1?"自动":cap==0?"不限":cap.ToString(),()=>{SetPref("cap",cap);ApplyGraphics();Draw();},true,Pref("cap",-1)==cap);
            TogglePref("auto",Text("ui.set.auto"),1,()=>ApplyGraphics());Label(body,SystemInfo.graphicsDeviceName+" · "+Screen.width+" × "+Screen.height);
            Label(body,Text("ui.set.sound"),"section");foreach(var pair in audio["VOLUMES"]!.AsObject())SliderPref(pair.Key,Text("ui.set.vol."+pair.Key)+" %",0,100,Volume(pair.Key),ApplyVolume);
            TogglePref("mute",Text("ui.set.mute"),0,ApplyVolume);TogglePref("hints",Text("ui.set.hints"),1);TogglePref("fps",Text("ui.set.showFps"),0);Button(panel,"back",Text("ui.set.done"),OpenMenu);}
        private void ApplyTheme(){var next=State==null || ScreenId=="wizard" || ScreenId=="title"?"default":ScreenId=="result" && theme!=""?theme:State.InterfaceTheme;
            if(next==theme)return;if(theme!="")Root.RemoveFromClassList("theme-"+theme);theme=next;Root.AddToClassList("theme-"+next);ThemeChanged?.Invoke(next);}
        private void OnDestroy(){foreach(var texture in textures.Values)Destroy(texture);}
        private void HandleKeys(){
            if(Input.GetKeyDown(KeyCode.Escape)){if(ScreenId=="main" || ScreenId=="settings" || ScreenId=="ach" || ScreenId=="ends" || ScreenId=="meta")OpenMenu();else if(ScreenId=="menu")Page(State==null?"title":"main");else if(ScreenId=="local")CloseLocal();return;}
            if(ScreenId!="main")return;bool up=Input.GetKeyDown(KeyCode.UpArrow)||Input.GetKeyDown(KeyCode.PageUp),down=Input.GetKeyDown(KeyCode.DownArrow)||Input.GetKeyDown(KeyCode.PageDown),all=Input.GetKeyDown(KeyCode.Home);
            if(!(up||down||all) || Tables.Definition("FLOOR_PLANS")[floorOffice.ToString()] is not JsonArray plan)return;
            int next=all?plan.Count:Mathf.Clamp((floor<0?plan.Count:floor)+(up?1:-1),0,plan.Count);floor=next==plan.Count?-1:next;Draw();}
    }
}
