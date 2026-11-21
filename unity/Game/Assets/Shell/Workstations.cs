using System;
using System.Linq;
using System.Text.Json.Nodes;
using Liandan.Kernel;
using UnityEngine.UIElements;

namespace Liandan.Shell
{
    public sealed partial class GameShell
    {
        private string? lastTip;
        private int floorOffice=-1,floor=-1;
        internal bool Open(string key)=>State.TutorialOpen(key);
        internal bool Allows(string group,string id)=>Open((group,id) switch {
            ("left","rd") or ("act","code") or ("chip","cash")=>"start",
            ("left","ideo") or ("left","cap") or ("chip","val" or "equity") or ("gauge","bubble") or ("act","raise" or "roadshow" or "ipo" or "selfdev" or "subsidy")=>"cap",
            ("left","ops") or ("right","board") or ("act","release" or "furnace" or "paper" or "beg" or "sweep")=>"model",
            ("chip","users") or ("right","fin") or ("act","sprint")=>"product",
            ("right","team" or "log") or ("left","team") or ("gauge","morale") or ("act","headhunt" or "teambuild" or "pie" or "office")=>"team",
            ("left","pr") or ("gauge","hype" or "rep") or ("act","hype" or "ads" or "goodpr" or "sellcourse")=>"pr",
            ("right","safe") or ("gauge","dirt") or ("act","navy" or "fakeusers" or "wash" or "digdirt")=>"dirt",
            ("act","lobby") or ("gauge","reg")=>"policy", ("right","chain" or "perks")=>id, _=>"start" });
        private void PrepareTutorial(){State.AdvanceTutorial();var tip=State.TutorialTip;if(lastTip!=tip){lastTip=tip;switch(tip){case "team":Tab="team";Side="team";break;case "product":Tab="rd";Side="fin";break;case "model":Tab="ops";Side="board";break;case "cap":Tab="cap";break;case "dirt":Side="safe";break;case "policy":Tab="ops";break;case "chain":case "perks":Side=tip;break;}}
            if(!Allows("left",Tab))Tab="rd";if(!Allows("right",Side))Side=new[]{"board","chain","team","safe","perks","fin","log"}.FirstOrDefault(key=>Allows("right",key))??"board";}
        private void DrawTutorial(VisualElement parent){if(theme!="default")Label(parent,(theme=="soviet"?"★  ":theme=="rose"?"❀  ":"◇  ")+State.CompanyGoal()["name"],"medal");string? tip=State.TutorialTip;if(tip==null)return;var block=Box(parent,"tutorial");string key="tut."+(tip=="model" && !(bool)State.Snapshot["ownModel"]!?"model.app":tip);
            string Line(string suffix)=>Text(key+suffix,("流血线",Rows["raise"]["p"]!["流血线"]!),("监管线",Tables.Parameter("reg.high")));
            Label(block,Text("ui.tutor.h",("标题",Line(".title"))),"section");Label(block,Line(".text"));Button(block,"tip",Text("ui.tutor.ok"),()=>{State.DismissTutorial();Draw();Store.SaveGame(State);});
            string? highlight=tip switch {"start"=>"act:code","team"=>"tab:team","product"=>"act:sprint","pr"=>"tab:pr","model" or "policy"=>"tab:ops","cap"=>"tab:cap",_=>null};if(highlight!=null)Root.Q<Button>(highlight)?.AddToClassList("highlight");}
        private JsonArray VisibleAdvice(){var result=new JsonArray();if(Pref("hints",1)==0 || State.TutorialTip!=null)return result;
            foreach(var row in State.Advise()){var hint=row!.DeepClone();if(hint["act"] is JsonNode act && !Allows("act",act.ToString())){hint["act"]=null;hint["later"]=false;}var go=hint["go"];if(hint["act"]==null && go==null || go?["ltab"] is JsonNode left && !Allows("left",left.ToString()) || go?["rtab"] is JsonNode right && (!Open("team") || !Allows("right",right.ToString())))continue;result.Add(hint);}return result;}
        private void DrawFooter(){var data=State.Snapshot;var footer=Box(Root,"footer");var line=Box(footer,"row");
            string Fixed(double value,int digits)=>GameState.DisplayFixed(value,digits);
            if((bool)data["ownModel"]! && Open("model")){bool ready=State.ActionState("release")["why"]==null,cold=State.FurnaceGain<=0;var source=data["furnace"]?["data"]?.ToString()??"open";
                string stats=Text("ui.w.stats",("现役",data["model"] is JsonNode model?Fixed(Number(model["cap"]!),1):"—"),("榜首",Fixed(State.Rivals.Max(r=>r.Bench),1)),("数据",Tables.Definition("DATA_SOURCES")[source]!["name"]!));
                Button(line,"station:furnace",Text("ui.w.furnace",("火候",Fixed(State.MyCap,1)))+" · "+(ready?Text("ui.w.ready"):cold?Text("ui.w.cold"):Text("ui.w.gain",("涨",Fixed(State.FurnaceCapChange,2))))+"\n"+stats,()=>{if(ready)Act("release");else{Tab="ops";Draw();}},ready||cold);}
            if(Open("product")){bool idle=State.SprintIdle,now=idle && Number(data["ap"]!)>=Number(Rows["sprint"]["ap"]!);var track=Tables.Definition("TRACKS")[data["co"]!["track"]!.ToString()]!;
                string note=data["sprint"] is JsonNode sprint?Text("ui.w.dev",("功能",Tables.Feature(sprint["id"]!.ToString())["name"]!),("进度",Fixed(100*Number(sprint["done"]!)/Number(sprint["need"]!),0))):Text(!idle?"ui.w.allDone":now?"ui.w.idle":"ui.w.idleLater");
                Button(line,"station:product",Text("ui.w.product",("赛道",track["name"]!),("体验",Fixed(Number(data["quality"]!),0)))+"\n"+note,()=>{if(now)Act("sprint");else{Tab="rd";Draw();}},idle);}
            var projects=data["projects"]!.AsArray();if(projects.Count>0){var project=projects[0]!;Button(line,"station:project",Text("ui.w.proj",("个数",projects.Count))+"\n"+project["name"]+" "+Fixed(100*Number(project["done"]!)/Number(project["need"]!),0)+"%",()=>{Side="chain";Draw();});}
            int office=(int)State.Company.Office;if(floorOffice!=office){floorOffice=office;floor=-1;}if(Tables.Definition("FLOOR_PLANS")[office.ToString()] is JsonArray plan){Picture(line,"icon-building",24,24);void Go(int target){MoveFloor(target,plan.Count);Draw();}Button(line,"floor:all",Text("ui.lift.all"),()=>Go(-1),true,floor<0);
                var depts=Tables.Definition("DEPTS");int[] counts=new int[plan.Count];foreach(var person in State.Staff){int index=Array.FindIndex(plan.ToArray(),row=>row!.AsArray().Any(role=>role!.ToString()==person.Role));counts[Math.Max(0,index)]++;}
                int boss=Array.FindIndex(plan.ToArray(),row=>row!.AsArray().Any(role=>role!.ToString()=="ceo"));for(int index=plan.Count-1;index>=0;index--){int target=index;var roles=plan[index]!.AsArray();Button(line,"floor:"+index,(index+1)+"F "+string.Join("·",roles.Select(role=>depts[role!.ToString()]!["short"]))+(index==(boss<0?plan.Count-1:boss)?" ★":"")+"  "+counts[index],()=>Go(target),true,floor==index);}}
            Label(footer,string.Join("　·　",data["log"]!.AsArray().Take(3).Select(row=>row!["msg"]!.ToString())),"ticker");}
    }
}
