using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;
using UnityEngine;

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
        private string Pick(IEnumerable<string> items) { var choices=items.ToArray(); return choices[(int)(game.RandomValue()*choices.Length)]; }
        private bool Tick()
        {
            switch(game.ScreenId)
            {
                case "title": Shot("01-title"); Click("new"); break;
                case "wizard":
                    Shot("02-wizard"); int step=game.Wizard.Step;
                    if(step==1 && game.Controls.Keys.Any(key=>key.StartsWith("plus:"))) Click(Pick(game.Controls.Keys.Where(key=>key.StartsWith("plus:"))));
                    else if(selectedStep!=step && (step==0||step==2||step==3||step==4))
                    { selectedStep=step; string prefix=step==0?"region:":step==2?"bg:":step==3?"track:":"mission:"; Click(Pick(game.Controls.Keys.Where(key=>key.StartsWith(prefix)))); }
                    else Click("forward"); break;
                case "event":
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
