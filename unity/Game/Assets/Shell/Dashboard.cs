using System;
using System.Linq;
using System.Text.Json.Nodes;
using Liandan.Kernel;
using UnityEngine.UIElements;
using static Liandan.Shell.GameShell;

namespace Liandan.Shell
{
    internal sealed class Dashboard
    {
        readonly GameShell game;
        readonly VisualElement list;
        GameState State => game.View;
        JsonObject Data => State.Snapshot;
        internal Dashboard(GameShell game, VisualElement list) { this.game=game; this.list=list; }
        string Text(string key, params (string,object)[] vars) => game.Text(key,vars);
        static double Num(JsonNode? row,string key) => row?[key] is JsonNode value ? Number(value) : 0;
        static bool Flag(JsonNode? row,string key) => row?[key] is JsonValue value && (value.TryGetValue<bool>(out var flag)?flag:Number(value)!=0);
        static string Fixed(double value,int digits=0) => GameState.DisplayFixed(value,digits);
        string Date(JsonNode row,string key="t") => State.DateText(Num(row,key));
        JsonNode Def(string key) => game.DisplayTables.Definition(key);
        double Param(string key) => game.DisplayTables.Parameter(key);
        void Heading(string text) => Label(list,text,"section");
        static void Meter(VisualElement parent,double percent) => Box(Box(parent,"meter"),"fill").style.width=Length.Percent((float)Math.Max(0,Math.Min(percent,100)));
        internal void Side(string key)
        {
            switch(key) {
                case "fin": Finance(); break;
                case "board": Board(); break;
                case "team": Team(); break;
                case "chain": Projects(); break;
                case "safe": Safe(); break;
                case "perks": Cards(); break;
                case "log": foreach(var entry in Data["log"]!.AsArray()) {var card=Box(list,"card"); Label(card,Date(entry!),"section"); Label(card,entry!["msg"]!.ToString());} break;
            }
        }
        void Finance()
        {
            var revenue=State.Revenue(); var costs=State.Costs();
            void Row(string key,double value) => Label(list,Text("ui.fin."+key)+"   "+State.Currency(value,true),value<0?"bad":"good");
            Heading(Text("ui.fin.rev")); foreach(string key in new[]{"sub","api","b2b"}) if(Num(revenue,key)>0.05) Row(key,Num(revenue,key));
            Heading(Text("ui.fin.cost")); foreach(string key in new[]{"salary","rent","gpu","api","misc"}) if(Num(costs,key)>0.05)Row(key=="api"?"upstream":key,-Num(costs,key));
            Row("net",Num(revenue,"total")-Num(costs,"total"));
            Heading(Text("ui.top.users")+"   "+State.UsersText(Num(Data,"users")));
            Label(list,Text("ui.fin.market",("赛道",Def("TRACKS")[State.Company.Track]!["name"]!), ("盘子",State.UsersText(State.Market)),("份额",Fixed(State.ShareCap*100)),("体验",Fixed(Num(Data,"quality")))));
            var stages=Def("STAGES").AsArray(); int stage=(int)Num(Data,"stage");
            if(stage<stages.Count-2){var next=stages[stage+1]!; Label(list,Text("ui.fin.next",("轮次",next["name"]!), ("用户",State.UsersText(Num(next,"users"))), ("收入",State.Currency(Num(next,"rev")))));}
            if(Data["vam"] is JsonObject vam)Label(list,Text("ui.fin.vam")+Text("ui.fin.vam.text",("日期",Date(vam,"due")),("目标",State.UsersText(Num(vam,"target")))),"bad");
        }
        void Board()
        {
            var rows=State.Leaderboard(); var min=rows.Min(row=>Num(row,"bench"))-6; var max=rows.Max(row=>Num(row,"bench")); int rank=0;
            foreach(var row in rows){var card=Box(list,"card"); Label(card,++rank+"   "+row!["name"]+"   "+Fixed(Num(row,"bench"),1),Flag(row,"me")?"good":"copy"); Label(card,row["model"]!.ToString()); Meter(card,Math.Max(4,(Num(row,"bench")-min)/(max-min)*100));}
            Label(list,Text(Flag(Data,"ownModel")?"ui.board.note.own":"ui.board.note",("前沿",Fixed(State.Frontier(Num(Data,"t")),1)),("火候",Fixed(State.MyCap,1))));
        }
        internal void Recruit() => game.Button(list,"recruit",Text("ui.cand.h"),()=>game.Local("recruit",parent=>new Dashboard(game,parent).Candidates()));
        void Candidates()
        {
            Heading(Text("ui.cand.h")); Label(list,Text("ui.cand.tip",("人数",Data["staff"]!.AsArray().Count),("上限",State.ReadBotValue("teamCap"))));
            foreach(var person in Data["cands"]!.AsArray())Person(person!,false);
            if(Data["cands"]!.AsArray().Count==0)Label(list,Text("ui.cand.none"));
        }
        void Team()
        {
            var staff=Data["staff"]!.AsArray(); Label(list,Text("ui.team.note",("人数",staff.Count),("上限",State.ReadBotValue("teamCap")),("月薪",State.Currency(Num(State.Costs(),"salary")))));
            foreach(var person in staff)Person(person!,true); if(staff.Count==0)Label(list,Text("ui.team.none"));
            game.Button(list,"team:recruit",Text("ui.cand.h"),()=>game.Local("recruit",parent=>new Dashboard(game,parent).Candidates()));
        }
        void Person(JsonNode person,bool hired)
        {
            string uid=person["uid"]!.ToString(); var role=Def("ROLES")[person["role"]!.ToString()]!;
            var card=Box(list,"card"); var salary=State.Currency(State.MonthlySalary(person)); string quirk=person["quirk"]?.ToString()??"";
            var look=Look.Of(uid,person["role"]!.ToString()); game.Avatar(card,look,36);
            var trait=quirk==""?null:Def("STAFF_QUIRKS")[quirk];
            Label(card,person["name"]+"   "+role["name"]+"   "+trait?["name"],"section");
            if(Flag(person,"red") && Data["ideo"]!=null)Label(card,State.StoryText("ideo.page.redTag"));
            Label(card,new string('●',(int)Num(person,"skill"))+"   "+Text("ui.person.pay",("月薪",salary)));
            game.Hover(card,()=>person["name"]+"\n"+Text("ui.pop.role",("图标",role["icon"]!),("岗位",role["name"]!),("能力",person["skill"]!))+"\n"+Text(hired?"ui.pop.now":"ui.pop.would")+"\n"+State.StaffImpact(person)+"\n"+Text(hired?"ui.pop.pay.hired":"ui.pop.pay.cand",("月薪",salary),("日期",Date(person,"since"))),"who:"+uid,bubble=>game.Avatar(bubble,look,76).style.marginBottom=6);
            if(!hired){string? why=State.HireReason(person); game.Button(card,"hire:"+uid,Text("ui.cand.hire")+(why==null?"":" · "+why),()=>{
                var result=game.LocalResult(s=>s.Hire(uid));if(result==null)return;game.Cue(result["err"]==null?"hire":"error");game.ShowResult(result);
            },why==null);
                if(why!=null)card.RegisterCallback<PointerDownEvent>(e=>{if(card.Q<Button>("hire:"+uid).worldBound.Contains(e.position))game.Cue("error");},TrickleDown.TrickleDown);
                return;}
            game.Button(card,"fire:"+uid,"×",()=>game.Local("fire",parent=>{
                Label(parent,Text("ui.fire.title",("名字",person["name"]!)),"heading");Label(parent,Text("ui.fire.text",("月数",Param("fire.payMonths")),("金额",State.Currency(State.Severance(person)))));
                game.Button(parent,"confirm",Text("ui.fire.ok"),()=>{game.Cue("fire");game.ShowResult(game.LocalResult(s=>s.Fire(uid))!);});
            }));
        }
        internal JsonNode? Chain(string id) => id=="ideo"?new JsonObject{["title"]=State.StoryText("ideo.page.chain"),["icon"]=State.StoryText("ideo.page.chainIcon")}:game.DisplayTables.Chain(id)??State.StoryChainInfo(id);
        void Projects()
        {
            if(Data["sprint"] is JsonObject sprint){var percent=Num(sprint,"done")/Num(sprint,"need")*100; Label(list,Text("ui.w.dev",("功能",game.DisplayTables.Feature(sprint["id"]!.ToString())["name"]!),("进度",Math.Floor(percent+.5))));Meter(list,percent);}
            var projects=Data["projects"]!.AsArray(); if(projects.Count==0)Label(list,Text("ui.proj.none"));
            foreach(var entry in projects){var project=entry!; string kind=project["kind"]!.ToString(),uid=project["uid"]!.ToString(); double need=Num(project,"need"),done=Num(project,"done"),left=need-done,rate=State.ProjectRate(kind);
                var card=Box(list,"card");Label(card,project["name"]!.ToString(),"section");Label(card,project["desc"]!.ToString());Meter(card,done/need*100);
                var eta=Text(left<=0?"ui.proj.check":kind=="ap"?"ui.proj.apOnly":rate>.01?"ui.proj.eta":"ui.proj.stalled",("月数",rate>0?Math.Ceiling(left/rate):0));
                Label(card,Text("ui.proj.line",("类型",Def("KIND_NAME")[kind]!), ("进度",eta),("日期",Date(project,"due"))));
                if(left>0 && Num(project,"due")-Num(Data,"t")<=Param("advice.proj.urgent"))Label(card,Text("ui.proj.late"),"bad");
                game.Button(card,"push:"+uid,Text("ui.proj.push"),()=>game.ShowResult(game.LocalResult(s=>s.PushProject(uid))!),left>0 && Num(Data,"ap")>=1);
            }
            var chains=Data["chains"]!.AsObject(); if(chains.Count>0)Heading(Text("ui.chain.log"));
            foreach(var row in chains.Select(pair=>pair.Value!).OrderBy(row=>Flag(row,"done")).ThenByDescending(row=>Num(row,"t"))){var info=Chain(row["id"]!.ToString()); Heading(info?["icon"]+" "+(info?["title"]??row["id"])+(Flag(row,"done")?" · "+Text("ui.chain.done"):""));foreach(var note in row["notes"]!.AsArray().Reverse())Label(list,Date(note!)+"   "+note!["text"]);}
        }
        void Safe()
        {
            var dirt=Data["dirt"]!.AsArray(); if(dirt.Count==0)Label(list,Text("ui.dirt.none"));
            foreach(var row in dirt){var card=Box(list,"card");Label(card,row!["name"]+ (Flag(Def("DIRT")[row["type"]!.ToString()],"crime")?" · "+Text("ui.dirt.crime"):""));Meter(card,Num(row,"sev")*2.5);Label(card,Text("ui.dirt.line",("严重度",Math.Floor(Num(row,"sev")+.5)),("日期",Date(row))));}
            string crime=Num(Data,"exposedCrime")<Param("ui.crimeShow")?"":Text("ui.dirt.exposedCrime",("违法",Math.Floor(Num(Data,"exposedCrime")+.5)),("经侦线",Param("scandal.probeLine")));
            Label(list,Text("ui.dirt.note"));Label(list,Text("ui.dirt.exposed",("累计",Math.Floor(Num(Data,"exposed")+.5)),("违法",crime)));
        }
        internal void Operations()
        {
            if(Flag(Data,"ownModel"))game.Button(list,"gpu",Text("ui.gpu.h"),()=>Gpu());else Label(list,State.WrapperDetail);
            if(!game.Open("policy"))return;
            foreach(var pair in Def("POLICIES").AsObject()){
                var key=pair.Key;var policy=pair.Value!; var active=Data["policies"]![key]!.ToString();
                game.Button(list,"policy:"+key,policy["name"]+" · "+policy["opts"]![active]!["name"],()=>game.Local("policy-"+key,parent=>{
                    Label(parent,policy["name"]!.ToString(),"heading"); foreach(var entry in policy["opts"]!.AsObject()){
                        var value=entry.Key;game.Button(parent,"pol:"+value,entry.Value!["name"]+"\n"+entry.Value["desc"],()=>{game.State.SetPolicy(key,value);game.Pump();},true,value==active);
                    }
                }));
            }
        }
        void Gpu()=>game.Local("gpu",parent=>{
            double count=Num(Data,"gpu"),quota=State.ReadBotValue("quota"),need=State.ReadBotValue("inferNeed");
            Label(parent,Text("ui.gpu.h"),"heading");Label(parent,Text("ui.gpu.price",("单价",State.Currency(State.ReadBotValue("gpuPrice"))),("配额",quota)));
            Label(parent,Text("ui.gpu.count",("张数",count))); Meter(parent,count/Math.Max(1,Math.Max(quota,count))*100);
            Label(parent,Text("ui.gpu.infer",("用了",Math.Min(need,count)),("需要",need))+"   "+Text("ui.gpu.train",("张数",Math.Max(0,count-need))));
            Label(parent,Text("ui.gpu.rent",("月租",State.Currency(State.GpuBill)))+"   "+State.GpuDetail);if(need>count)Label(parent,Text("ui.gpu.short"),"bad");
            if(State.BrainGpu>0)Label(parent,Text("ui.gpu.brain",("卡",Text("ui.gpu.brain.n",("张数",State.BrainGpu)))));
            var line=Box(parent,"row");void Set(double value){game.State.SetGpu(value);game.Store.SaveGame(game.State);game.Draw();}
            game.Button(line,"gpu:min","0",()=>Set(0));game.Button(line,"gpu:-","−",()=>Set(count-State.GpuStep),count>0);game.Button(line,"gpu:+","+",()=>Set(count+State.GpuStep));game.Button(line,"gpu:max",Text("ui.gpu.max"),()=>Set(quota));
        });
        internal void Ideology()
        {
            string Story(string key,params (string,object)[] vars)=>State.StoryText("ideo.page."+key,vars);
            var goal=State.CompanyGoal();Heading(Story("goal"));Label(list,goal["name"]+"\n"+goal["desc"]);
            if(Data["ideo"] is not JsonObject story){Label(list,Story("empty"));return;}
            var result=story["result"]?.ToString(); bool active=Flag(story,"on");
            Heading(active?Story("chain"):Story("result."+result+".icon")+"  "+Story("result."+result+".title"));
            Label(list,active?Story("stage",("级",Math.Min(State.StoryLength,Num(story,"n")+1)),("总",State.StoryLength)):Story("result."+result+".desc"));
            foreach(string key in new[]{"red","cap","heat"}){if(key=="heat"&&story["v"]?.ToString()!="us")continue;Label(list,(key=="heat"?Text("chip.heat"):State.SideName(key))+"   "+Fixed(Num(story,key)));Meter(list,Num(story,key));}
            if(active){Label(list,State.LeanText());Label(list,Story("rule"));Label(list,Story("equity",("股权",Fixed(Num(Data,"equity"))+"%"),("底线",Param("ideo.equity"))));Heading(Story("cast")); foreach(var key in new[]{"rep","red","cap"}){var actor=State.StoryCast()[key]!;Label(list,actor["name"]+" · "+actor["role"]+"\n"+actor["desc"]);}}
            if(story["picks"] is JsonArray picks && picks.Count>0){Heading(Story("picks"));foreach(var pick in picks.Reverse().Take(6))Label(list,Story("pickN",("级",pick!["n"]!))+"   "+pick["label"]);}
            if(story["plan"] is JsonObject plan)Label(list,Story("plan",("日期",Date(plan,"due"))));
            if(Flag(Data["flags"],"yank"))Label(list,Story("yank"));
            foreach(var status in State.StoryStatus())Label(list,status);
        }
        internal static void Hints(GameShell game,VisualElement parent)
        {
            var hints=game.Advice;int limit=(int)game.DisplayTables.Parameter("ui.hintMax");var bar=Box(parent,"alerts");
            foreach(var hint in hints.Take(game.AllHints?hints.Count:limit)){
                var row=hint!;var id=row["id"]!.ToString();var action=row["act"]?.ToString();var line=Box(bar,"row");
                var button=game.Button(line,"hint:"+id,row["title"]!.ToString(),()=>{
                    if(action!=null && !Flag(row,"later") && game.View.ActionState(action)["why"]==null){game.Act(action);return;}
                    game.Tab=action!=null?game.Rows[action]["tab"]!.ToString():row["go"]?["ltab"]?.ToString()??game.Tab;
                    game.Side=row["go"]?["rtab"]?.ToString()??game.Side;game.Draw();
                    string highlight=action!=null?"act:"+action:row["hl"]?.ToString()??"";
                    if(highlight.StartsWith("who:") && game.Controls.TryGetValue("recruit",out var recruit)){recruit(); if(game.Controls.TryGetValue(highlight,out var who))game.Root.schedule.Execute(()=>who());return;}
                    if(highlight.StartsWith("gpu:") && game.Controls.TryGetValue("gpu",out var gpu))gpu();
                    if(highlight.StartsWith("pol:")){var parts=highlight.Split(':');if(game.Controls.TryGetValue("policy:"+parts[1],out var policy)){policy();highlight="pol:"+parts[2];}}
                    if(highlight.Length>0){var target=game.Root.Q<Button>(highlight);if(target!=null){target.Focus();target.schedule.Execute(()=>target.GetFirstAncestorOfType<ScrollView>()?.ScrollTo(target));}}
                });game.Hover(button,()=>row["text"]!.ToString());var mute=game.Button(line,"mute:"+id,"×",()=>{game.State.MuteHint(row);game.Store.SaveGame(game.State);game.Draw();});game.Hover(mute,()=>game.Text("ui.hint.mute",("多久",game.View.MuteMonths(row)==1?game.Text("ui.hint.mute.month"):game.Text("ui.hint.mute.months",("月数",game.View.MuteMonths(row))))));
            }
            if(hints.Count>limit)game.Button(bar,"hintall",game.Text(game.AllHints?"ui.hint.less":"ui.hint.more",("条数",hints.Count-limit)),()=>{game.AllHints=!game.AllHints;game.Draw();});
        }
        void Cards()
        {
            game.Avatar(list,Look.Founder(Data["founder"]?["outfit"]?.ToString()??"turtleneck"),60);
            void Card(JsonNode row,string suffix=""){var card=Box(list,"card");Label(card,row["icon"]+"  "+row["name"]+suffix,"section");Label(card,row["desc"]?.ToString()??"");}
            if(Data["perks"]!.AsArray().Count==0)Label(list,Text("ui.perks.none"));foreach(var id in Data["perks"]!.AsArray())Card(game.DisplayTables.Perk(id!.ToString()));
            if(Data["feats"]!.AsArray().Count>0)Heading(Text("ui.perks.feats"));foreach(var id in Data["feats"]!.AsArray())Card(game.DisplayTables.Feature(id!.ToString()));
            var temps=Data["temp"]!.AsArray().Where(row=>Num(row,"until")-Num(Data,"t")<900).ToArray();if(temps.Length>0)Heading(Text("ui.perks.temps"));
            foreach(var row in temps){var key=row!["key"]!.ToString();Label(list,(Def("MOD_NAME")[key]?.ToString()??key)+"  "+(row["mult"]!=null?"×"+Num(row,"mult").ToString("G15"):(Num(row,"add")>0?"+":"")+Num(row,"add").ToString("G15"))+"  "+Text("ui.perks.left",("月数",Num(row,"until")-Num(Data,"t"))));}
            Heading(Text("ui.perks.founder",("名字",State.Founder.Name)));foreach(var attr in Def("ATTRS").AsArray())Card(attr!,"   "+State.Founder.Attributes[attr!["id"]!.ToString()]);foreach(var id in State.Founder.Traits)Card(game.DisplayTables.Trait(id!.ToString()));
        }
    }
}
