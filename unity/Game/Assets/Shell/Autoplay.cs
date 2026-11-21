using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;
using UnityEngine;
using UnityEngine.UIElements;
using Liandan.Kernel;

namespace Liandan.Shell
{
    internal sealed class Autoplay
    {
        private readonly GameShell game;
        private readonly string shots;
        internal readonly string SaveDirectory;
        private readonly HashSet<string> captured = new HashSet<string>();
        private readonly int limit;
        private int currentMonth, attempts, selectedStep = -1;
        private static bool failed;
        private bool employeeVisible, hiredVisible, hiring, inspectAction;
        private GameState? realState;
        private int fixture;
        private void ThemeShot(string name){if(!game.Root.ClassListContains("theme-"+name))throw new InvalidOperationException("主题未切换："+name);Shot("theme-"+name);}
        private bool ThemeFixtures(){
            if(fixture>4)return false;
            if(fixture==0){ThemeShot("default");realState=game.State;game.State=new GameState(realState.Snapshot.DeepClone().AsObject(),game.Tables);game.State.Snapshot["tut"]=new JsonObject{["on"]=true,["open"]=new JsonObject(),["queue"]=new JsonArray(),["dirt0"]=game.State.Snapshot["dirt"]!.AsArray().Count};}
            else if(fixture==1){if(!game.Controls.ContainsKey("tip"))throw new InvalidOperationException("教学气泡未出现");Shot("tutorial-tip");game.State.Snapshot.Remove("tut");game.State.Snapshot["ideo"]=new JsonObject{["v"]="cn",["result"]="red"};}
            else if(fixture==2){ThemeShot("soviet");game.State.Snapshot["ideo"]!["v"]="us";}
            else if(fixture==3){ThemeShot("rose");game.State.Snapshot["ideo"]!["result"]="cap";}
            else {ThemeShot("cold");game.State=realState!;game.Tab="rd";game.Side="board";}
            fixture++;game.Draw();return true;
        }
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        private static void WatchStartup()
        {
            Application.logMessageReceived -= OnLog;
            failed = false;
            if (Environment.GetCommandLineArgs().Contains("-autoplay"))
                Application.logMessageReceived += OnLog;
        }
        internal Autoplay(GameShell game,string[] args)
        {
            this.game=game;
            string Arg(string key) { int at=Array.IndexOf(args,key); if(at<0 || at+1>=args.Length) throw new ArgumentException("缺少参数："+key); return args[at+1]; }
            game.Seed=int.Parse(Arg("-autoplay")); shots=Path.GetFullPath(Arg("-shots")); limit=args.Contains("-months")?int.Parse(Arg("-months")):int.MaxValue;
            if(limit<=0 || args.Contains("-nographics")) throw new ArgumentException("试玩需要图形输出，月数必须为正数");
            Directory.CreateDirectory(shots); SaveDirectory=Path.Combine(Application.temporaryCachePath,"autoplay",Guid.NewGuid().ToString("N"));
        }
        private static void OnLog(string message, string trace, LogType type)
        {
            if (failed || (type != LogType.Exception && type != LogType.Error && type != LogType.Assert)) return;
            failed = true;
            Debug.Log($"Liandan autoplay FAILED: {type}: {message}\n{trace}");
            Application.Quit(1);
        }
        private void Shot(string name)
        {
            if(!captured.Add(name)) return;
            var texture=ScreenCapture.CaptureScreenshotAsTexture(); try { File.WriteAllBytes(Path.Combine(shots,name+".png"),texture.EncodeToPNG()); } finally { UnityEngine.Object.Destroy(texture); }
        }
        private void Click(string id) => game.Controls[id]();
        private void CheckHudLayout()
        {
            void CheckRow(VisualElement row)
            {
                var bounds=row.worldBound;
                var prior=new List<Rect>();
                foreach(var item in row.Children()){
                    var rect=item.worldBound;
                    bool Outside(Rect inner,Rect outer)=>inner.xMin<outer.xMin-1 || inner.yMin<outer.yMin-1 || inner.xMax>outer.xMax+1 || inner.yMax>outer.yMax+1;
                    if(rect.width<=0 || rect.height<=0 || Outside(rect,bounds) || prior.Any(other=>Math.Min(other.xMax,rect.xMax)-Math.Max(other.xMin,rect.xMin)>1 && Math.Min(other.yMax,rect.yMax)-Math.Max(other.yMin,rect.yMin)>1))
                        throw new InvalidOperationException($"顶栏或页签越界/重叠：{item.name} {rect}，容器 {bounds}");
                    prior.Add(rect);
                    if(item.Q<Label>(className:"button-caption") is Label caption){
                        var size=caption.MeasureTextSize(caption.text,0,VisualElement.MeasureMode.Undefined,0,VisualElement.MeasureMode.Undefined);
                        if(Outside(caption.worldBound,rect) || caption.contentRect.width+1<size.x)
                            throw new InvalidOperationException($"页签文字被挤压：{caption.text}，需要 {size.x}，实际 {caption.contentRect.width}");
                    }
                }
            }
            CheckRow(game.Root.Q(className:"bar"));
            game.Root.Query(className:"tab-strip").ForEach(CheckRow);
        }
        private string Pick(IEnumerable<string> items) { var choices=items.ToArray(); return choices[(int)(game.RandomValue()*choices.Length)]; }
        private bool Tick()
        {
            switch(game.ScreenId)
            {
                case "title": Shot("01-title");Click("menu");break;
                case "menu":Shot("menu");Click(captured.Contains("settings")?"new":"settings");break;
                case "settings":Shot("settings");Click("back");break;
                case "wizard":
                    Shot("02-wizard"); int step=game.Wizard.Step;
                    if(step==1 && game.Controls.Keys.Any(key=>key.StartsWith("plus:"))) Click(Pick(game.Controls.Keys.Where(key=>key.StartsWith("plus:"))));
                    else if(selectedStep!=step && (step==0||step==2||step==3||step==4))
                    { selectedStep=step; string prefix=step==0?"region:":step==2?"bg:":step==3?"track:":"mission:"; Click(Pick(game.Controls.Keys.Where(key=>key.StartsWith(prefix)))); }
                    else {if(step==4)game.Wizard.Tutorial=false;Click("forward");} break;
                case "event":
                    if(game.Root.Q<Image>("art-slot")?.image!=null)Shot("illustrated-event");
                    if(game.Dialog!.View["closable"]!=null && game.ActionId!="")Shot("dialog-"+game.ActionId);
                    if(inspectAction){inspectAction=false;Click("close");break;}
                    Shot("04-event"); var options=game.Controls.Keys.Where(key=>key.StartsWith("option:")).ToArray();
                    Click(options.Length>0?Pick(options):"close"); break;
                case "local":
                    Shot("dialog-"+game.LocalId);
                    if(game.LocalId=="recruit") {
                        if(employeeVisible){Shot("employee-hover");employeeVisible=false;}
                        if(!captured.Contains("employee-hover")){var who=game.Controls.Keys.FirstOrDefault(key=>key.StartsWith("who:"));if(who!=null){Click(who);employeeVisible=true;break;}}
                        if(hiring){hiring=false;var candidate=game.State.Snapshot["cands"]!.AsArray().Where(person=>game.Controls.ContainsKey("hire:"+person!["uid"])).OrderByDescending(person=>GameShell.Number(person!["skill"]!)).FirstOrDefault();if(candidate!=null){Click("hire:"+candidate["uid"]);break;}}
                    }
                    Click("back");break;
                case "result": Shot("05-result"); Click("advance"); break;
                case "end": Shot("07-ending"); return true;
                case "main":
                    try { CheckHudLayout(); } catch { Shot("layout-failure"); throw; }
                    if(ThemeFixtures())break;
                    var state=game.State; int month=int.Parse(state.Snapshot["t"]!.ToString());
                    if(month>limit) return true;
                    if(month==1) Shot("03-month-1");
                    if(hiredVisible){Shot("staff-hover");hiredVisible=false;}
                    if(game.Controls.Keys.Any(key=>key.StartsWith("hint:")))Shot("advice");
                    Shot("side-"+game.Side);Shot("action-"+game.Tab);
                    if(game.Tab=="ideo" && state.Snapshot["ideo"] is JsonObject)Shot("ideology-active");
                    var missing=game.Controls.Keys.FirstOrDefault(key=>key.StartsWith("side:")&&!captured.Contains("side-"+key.Substring(5)) || key.StartsWith("tab:")&&!captured.Contains("action-"+key.Substring(4)));
                    if(missing!=null){Click(missing);break;}
                    if(!captured.Contains("dialog-recruit")){Click("tab:team");Click("recruit");break;}
                    if(!captured.Contains("dialog-policy-work")){Click("tab:ops");Click("policy:work");break;}
                    if(!captured.Contains("dialog-gpu") && (bool)state.Snapshot["ownModel"]!){Click("tab:ops");Click("gpu");break;}
                    if(!captured.Contains("staff-hover") && state.Staff.Any()){
                        if(game.Side!="team"){Click("side:team");break;}
                        Click("who:"+state.Staff.First().Uid);hiredVisible=true;break;
                    }
                    if(!captured.Contains("ideology-active") && state.Snapshot["ideo"] is JsonObject){Click("tab:ideo");break;}
                    // 短局也留下一张较晚的经营截图；到第十二月后固定，不再覆盖。
                    if(month!=currentMonth && (month==2 || month==Math.Min(12,limit))) { captured.Remove("06-midgame"); Shot("06-midgame"); }
                    if(currentMonth!=month) {currentMonth=month; attempts=0;}
                    var allowed=game.Menu.Where(row=>row!["name"]!=null && string.IsNullOrEmpty(row["why"]?.ToString())).Select(row=>row!["id"]!.ToString()).ToArray();
                    var inspect=new[]{"sprint","raise"}.FirstOrDefault(key=>!captured.Contains("dialog-"+key)&&allowed.Contains(key));
                    if(inspect!=null){Click("tab:"+game.Rows[inspect]["tab"]);Click("act:"+inspect);inspectAction=game.ScreenId=="event";if(inspectAction)break;if(game.ScreenId!="main")break;}
                    if(attempts++<9 && allowed.Length>0 && GameShell.Number(state.Snapshot["ap"]!)>0)
                    {
                        // 先保现金流，再尝试发布和上市，其余从界面可用行动抽取。
                        var best=state.Snapshot["cands"]!.AsArray().Where(person=>state.HireReason(person!)==null).OrderByDescending(person=>GameShell.Number(person!["skill"]!)).FirstOrDefault();
                        if(state.ReadBotValue("runway")>7 && best!=null && game.Controls.ContainsKey("tab:team")) { if(game.Tab!="team")Click("tab:team"); hiring=true; Click("recruit"); break; }
                        string act=state.ReadBotValue("runway")<9 && allowed.Contains("raise")?"raise":allowed.Contains("release")?"release":allowed.Contains("ipo")?"ipo":Pick(allowed);
                        var tab=game.Rows[act]["tab"]!.ToString(); if(game.Tab!=tab) Click("tab:"+tab); Click("act:"+act);
                    }
                    else Click("month"); break;
                default: throw new InvalidOperationException("未知试玩页面："+game.ScreenId);
            }
            return false;
        }
        internal IEnumerator Run()
        {
            Application.runInBackground=true;
            int exit=1;
            for(int tick=0;tick<30000;tick++)
            {
                yield return null; yield return new WaitForEndOfFrame();
                try { if(failed) break; if(Tick()) { exit=failed?1:0; break; } }
                catch(Exception error) { Debug.LogException(error); break; }
            }
            if (failed) exit = 1;
            if(exit==0) Debug.Log("Liandan autoplay OK: "+game.ScreenId); Application.Quit(exit);
        }
    }
}
