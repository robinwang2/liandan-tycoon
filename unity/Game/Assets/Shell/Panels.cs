using System;
using System.Linq;
using System.Text.Json.Nodes;
using UnityEngine.UIElements;
using static Liandan.Shell.GameShell;

namespace Liandan.Shell
{
    internal static class TopBar
    {
        internal static void Draw(GameShell game)
        {
            var bar = Box(game.Root,"bar"); var state = game.State; var data = state.Snapshot;
            Label(bar,state.Company.Name + "\n" + state.MonthHeading()); Label(bar,game.Text("ui.top.cash") + "\n" + state.Currency((double)data["cash"]!));
            foreach (string key in new[]{"hype","rep","morale"}) Label(bar,game.Text("chip."+key) + "\n" + Math.Round(double.Parse(data[key]!.ToString(),System.Globalization.CultureInfo.InvariantCulture)));
            Label(bar,game.Text("ui.top.ap") + "\n" + data["ap"]); game.Button(bar,"month",game.Text("ui.top.next"),()=> { state.EndMonth(); game.Pump(); });
            game.Button(bar,"title",game.Text("ui.end.title"),game.Title);
        }
    }
    internal static class ActionList
    {
        internal static void Draw(GameShell game, VisualElement parent)
        {
            game.Menu = game.State.ViewMenu(); var tabs = Box(parent,"row");
            foreach (var row in game.Tables.GetActionTabs())
            {
                string tab = row!["id"]!.ToString(); if (!game.Menu.Any(item=>item!["name"]!=null && game.Rows[item["id"]!.ToString()]["tab"]!.ToString()==tab)) continue;
                game.Button(tabs,"tab:"+tab,row["name"]!.ToString(),()=> { game.Tab=tab; game.Draw(); },true,game.Tab==tab);
            }
            var list = Scroll(parent);
            if(game.Tab=="team") foreach(var person in game.State.Snapshot["cands"]!.AsArray())
            {
                string uid=person!["uid"]!.ToString(); var why=game.State.HireReason(person);
                game.Button(list,"hire:"+uid,game.Text("ui.cand.hire")+" · "+person["name"]+"   "+(why??""),()=>game.ShowResult(game.State.Hire(uid)!),why==null);
            }
            if(game.Tab=="ops" && (bool)game.State.Snapshot["ownModel"]!)
            {
                var line=Box(list,"row"); var count=Number(game.State.Snapshot["gpu"]!);
                Label(line,game.Text("ui.gpu.h")+"   "+game.Text("ui.gpu.count",("张数",count)));
                void Set(double value) {game.State.SetGpu(value); game.Pump();}
                game.Button(line,"gpu:-","−",()=>Set(count-1),count>0); game.Button(line,"gpu:+","+",()=>Set(count+1)); game.Button(line,"gpu:max",game.Text("ui.gpu.max"),()=>Set(game.State.ReadBotValue("quota")));
            }
            foreach (var entry in game.Menu)
            {
                var item=entry!; string id=item["id"]!.ToString(); var row=game.Rows[id]; if(item["name"]==null || row["tab"]!.ToString()!=game.Tab) continue;
                var why=item["why"]?.ToString(); var cost=game.State.Currency((double)item["cost"]!);
                game.Button(list,"act:"+id,item["name"] + " · " + game.Text("ui.top.ap") + " " + row["ap"] + " · " + cost + "\n" + item["desc"] + (string.IsNullOrEmpty(why)?"":"\n"+why),()=>game.Act(id),string.IsNullOrEmpty(why));
            }
        }
    }
    internal static class SidePanel
    {
        internal static void Draw(GameShell game, VisualElement parent)
        {
            var tabs=Box(parent,"row"); foreach (string key in new[]{"fin","team","board","chain","safe","perks","log"}) game.Button(tabs,"side:"+key,game.Text("ui.rtab."+key),()=> {game.Side=key;game.Draw();},key=="fin"||key=="team",game.Side==key);
            var list=Scroll(parent); var state=game.State;
            if(game.Side=="team") {var roles=game.Tables.Definition("ROLES"); foreach(var staff in state.Staff) Label(list,staff.Name+" · "+roles[staff.Role]!["name"]+" · "+staff.Skill); if(!state.Staff.Any())Label(list,game.Text("ui.team.none"));}
            else { Label(list,state.Company.Name,"heading"); Label(list,state.Founder.Name); Label(list,state.MonthHeading()); Label(list,game.Text("ui.top.equity")+"   "+state.Snapshot["equity"]+"%"); Label(list,game.Text("ui.top.users")+"   "+state.Snapshot["users"]+game.Text("unit.wan")); }
        }
    }
    internal static class EventPanel
    {
        internal static void Draw(GameShell game, VisualElement panel)
        {
            var view=game.Dialog?.View; var body=Scroll(panel);
            if(view!=null) { Label(body,view["icon"]?.ToString()??"◇","art"); Label(body,view["title"]!.ToString(),"heading"); }
            if(game.ScreenId=="result")
            {
                var result=game.Result; if(result["ok"]!=null) Label(body,game.Text((bool)result["ok"]!?"ui.ok":"ui.fail")); Label(body,(result["text"]??result["err"])?.ToString()??"");
                if(result["chips"] is JsonArray chips) foreach(var chip in chips) Label(body,chip!["name"]+"   "+chip["v"]);
                game.Button(panel,"advance",game.Text("ui.dlg.continue"),()=>game.Pump()); return;
            }
            Label(body,view!["text"]?.ToString()??""); var options=view["options"]!.AsArray();
            for(int index=0;index<options.Count;index++)
            {
                int choice=index; var opt=options[index]!; string text=string.Join("\n",new[]{opt["label"],opt["card"]?["desc"],opt["hint"],opt["chk"],opt["why"]}.Where(node=>node!=null && node.ToString()!=""));
                if(opt["tip"] is JsonObject tip) foreach(var pair in tip) if(pair.Value is JsonArray lines && lines.Count>0) text+="\n"+game.Text(pair.Key=="ok"?"ui.ok":pair.Key=="fail"?"ui.fail":"ui.tip.fx")+"  "+string.Join(" · ",lines.Select(line=>line![0]!.ToString()));
                game.Button(body,"option:"+choice,text,()=>game.Choose(choice),opt["disabled"]==null || !(bool)opt["disabled"]!);
            }
            if(view["closable"]!=null && (bool)view["closable"]!) game.Button(panel,"close",game.Text("ui.back"),()=>game.Pump());
        }
    }
    internal static class EndingPanel
    {
        internal static void Draw(GameShell game,VisualElement panel)
        {
            var summary=game.Summary; Label(panel,summary["ending"]!["name"]!.ToString(),"heading");Label(panel,summary["text"]!.ToString()); Label(panel,game.Text("ui.end.score",("得分",summary["score"]!),("人脉点",summary["points"]!))); game.Button(panel,"title",game.Text("ui.end.title"),game.Title);
        }
    }
}
