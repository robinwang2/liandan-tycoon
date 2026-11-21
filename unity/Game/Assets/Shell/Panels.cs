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
            string Fixed(double value,int digits)=>Liandan.Kernel.GameState.DisplayFixed(value,digits);
            void Chip(string key,string value,Func<string> detail){if(game.Allows("chip",key))game.Hover(Label(bar,game.Text("ui.top."+key)+"\n"+value),detail);}
            game.Picture(bar,"logo-"+(data["co"]?["logo"]??game.BrandData[state.Company.Region]![0]!["id"])+"-"+(data["co"]?["brand"]?.ToString()??"#ff6b4a").TrimStart('#'),40,40);
            Label(bar,state.Company.Name+" · "+game.Tables.Definition("STAGES")[(int)Number(data["stage"]!)]!["name"]+"\n"+state.MonthHeading());
            Chip("cash",state.Currency(Number(data["cash"]!)),()=>{
                double runway=state.ReadBotValue("runway"),net=Number(state.Revenue()["total"]!)-Number(state.Costs()["total"]!);
                string months=runway<1?game.Text("ui.top.runway.lt1"):Fixed(Math.Floor(runway),0);
                string note=runway>=99?game.Text("ui.top.profit"):game.Text("ui.top.runway",("月数",months));
                return game.Text("ui.top.net",("净",state.Currency(net,true)),("续航",note));
            });
            double users=Number(data["users"]!),fake=Number(data["fake"]!),equity=Number(data["equity"]!);
            Chip("users",state.UsersText(users+fake),()=>fake>.5?game.Text("ui.top.fake",("假用户",state.UsersText(fake))):game.Text("ui.top.share",("份额",Fixed(users/state.Market*100,1))));
            Chip("equity",Fixed(equity,0)+"%",()=>game.Text(equity<game.Tables.Parameter("coup.equity")?"ui.top.equity.warn":"ui.top.equity.ok"));
            Chip("val",state.Currency(state.Valuation()),()=>game.Text("ui.top.perf",("业绩",Fixed(state.Performance(),2))));
            if(game.Open("model"))Label(bar,data["model"] is JsonObject model?game.Text("ui.top.rankN",("名次",state.Rank))+"\n"+game.Text("ui.top.bench",("模型",model["name"]!), ("跑分",Liandan.Kernel.GameState.DisplayFixed(Number(model["bench"]!),1))):game.Text("ui.top.model")+"\n"+game.Text("ui.top.wrapper"));
            Label(bar,game.Text("ui.top.ap") + "\n" + data["ap"]); game.Button(bar,"month",game.Text("ui.top.next"),()=> { state.EndMonth(); game.Pump(); });
            game.Button(bar,"menu","菜单",game.OpenMenu); game.DrawFps(bar);
        }
    }
    internal static class ActionList
    {
        internal static void Draw(GameShell game, VisualElement parent)
        {
            game.Menu = game.State.ViewMenu(); var tabs = Box(parent,"tab-strip");
            foreach (var row in game.Tables.GetActionTabs())
            {
                string tab = row!["id"]!.ToString();
                if(!game.Allows("left",tab))continue;
                bool suggested=game.Advice.Any(h=>h!["act"] is JsonNode act && game.Recommended(act.ToString()) && game.Rows[act.ToString()]["tab"]!.ToString()==tab);
                var button=game.Button(tabs,"tab:"+tab,row["name"]+(suggested&&game.Tab!=tab?" •":""),()=> { game.Tab=tab; game.Draw(); },true,game.Tab==tab);
                var icon=tab switch {"rd"=>"flask","team"=>"people","cap"=>"coins","pr"=>"megaphone","ops"=>"gear",_=>"flag"};game.Picture(button,"icon-"+icon,18,18);
            }
            var list = Scroll(parent);
            var dashboard=new Dashboard(game,list);
            if(game.Tab=="team") dashboard.Recruit();
            if(game.Tab=="ops") dashboard.Operations();
            if(game.Tab=="ideo") dashboard.Ideology();
            foreach (var entry in game.Menu)
            {
                var item=entry!; string id=item["id"]!.ToString(); var row=game.Rows[id]; if(item["name"]==null || row["tab"]!.ToString()!=game.Tab) continue;
                if(!game.Allows("act",id))continue;
                var why=item["why"]?.ToString(); var cost=game.State.Currency((double)item["cost"]!);
                var cooldown=game.State.CooldownText(id); if(cooldown.Length>0 && why!=cooldown)why=string.Join(" · ",new[]{why,cooldown}.Where(value=>!string.IsNullOrEmpty(value)));
                var action=game.Button(list,"act:"+id,row["icon"]+"  "+item["name"] + (game.Recommended(id)?" · "+game.Text("ui.act.rec"):"")+" · " + game.Text("ui.top.ap") + " " + row["ap"] + (Number(item["cost"]!)>0?" · " + cost:"") + "\n" + item["desc"] + (string.IsNullOrEmpty(why)?"":"\n"+why),()=>game.Act(id),string.IsNullOrEmpty(why));action.AddToClassList("action-card");
            }
        }
    }
    internal static class SidePanel
    {
        internal static void Draw(GameShell game, VisualElement parent)
        {
            var gauges=Box(parent,"row");foreach(var key in new[]{"hype","rep","morale","reg","bubble","dirt"}){
                if(!game.Allows("gauge",key))continue;
                double value=key=="dirt"?Math.Min(100,game.State.DirtTotal):Number(game.State.Snapshot[key]!);var cell=Box(gauges,"gauge");Label(cell,game.Text("ui.gauge."+key)+"  "+Math.Floor(value+0.5));Box(Box(cell,"meter"),"fill").style.width=Length.Percent((float)value);
                game.Hover(cell,()=>game.Text("ui.gauge."+key+".tip",("过高",game.Tables.Parameter("reg.high"))));
            }
            var tabs=Box(parent,"tab-strip"); foreach (var (key,icon) in new[]{("board","board"),("chain","pin"),("team","team"),("safe","safe"),("perks","cards"),("fin","ledger"),("log","news")}){
                if(!game.Allows("right",key))continue;
                int badge=key=="safe"?game.State.Snapshot["dirt"]!.AsArray().Count:key=="chain"?game.State.Snapshot["projects"]!.AsArray().Count:0;
                var button=game.Button(tabs,"side:"+key,game.Text("ui.rtab."+key)+(badge>0?" "+badge:""),()=> {game.Side=key;game.Draw();},true,game.Side==key);
                game.Picture(button,"icon-"+icon,18,18);
            }
            new Dashboard(game,Scroll(parent)).Side(game.Side);
        }
    }
    internal static class EventPanel
    {
        internal static void Draw(GameShell game, VisualElement panel)
        {
            var view=game.Dialog?.View; var body=Scroll(panel);
            if(view!=null) {
                var categories=game.Tables.Definition("CAT"); Label(body,(categories[view["cat"]?.ToString()??"sys"]??categories["sys"])!["name"]!.ToString(),"section");
                if(view["chain"] is JsonNode chain){var info=new Dashboard(game,body).Chain(chain.ToString());if(info!=null)Label(body,game.Text("ui.dlg.chain",("图标",info["icon"]!),("链",info["title"]!)));
                    if(chain.ToString()=="ideo" && game.State.Snapshot["ideo"] is JsonObject story){Label(body,game.State.StoryMeters());string id=view["id"]?.ToString()??"";if(id.StartsWith("ideo_") && int.TryParse(id.Substring(5),out int step)) Label(body,game.State.StoryStrip(step,game.ScreenId!="result"));}
                }
                var art=Box(body,"art-row");if(view["art"] is JsonNode key)game.Picture(art,"art-"+key,0,155,"art-slot");
                if(view["portrait"] is JsonNode portrait)game.Picture(art,"portrait-"+portrait,100,155,"portrait-slot");
                Label(body,view["title"]!.ToString(),"heading");
            }
            if(game.ScreenId=="result")
            {
                var result=game.Result; if(result["ok"]!=null) Label(body,game.Text((bool)result["ok"]!?"ui.ok":"ui.fail")); Label(body,(result["text"]??result["err"])?.ToString()??"");
                if(result["chips"] is JsonArray chips){var line=Box(body,"row");foreach(var chip in chips){var label=Label(line,chip!["name"]+"   "+chip["v"],"chip");if(chip["good"]!=null)label.AddToClassList((bool)chip["good"]!?"good":"bad");}}
                game.Button(panel,"advance",game.Text("ui.dlg.continue"),()=>game.Pump()); return;
            }
            Label(body,view!["text"]?.ToString()??""); var options=view["options"]!.AsArray();
            var choices=view["kind"]?.ToString()=="cards"?Box(body,"card-choices"):body;
            for(int index=0;index<options.Count;index++)
            {
                int choice=index; var opt=options[index]!;bool enabled=opt["disabled"]==null || !(bool)opt["disabled"]!;
                string text=string.Join("\n",new[]{opt["label"],opt["card"]?["desc"],!enabled && opt["why"]!=null?opt["why"]:opt["hint"],opt["chk"]}.Where(node=>node!=null && node.ToString()!=""));
                if(opt["side"] is JsonNode side)text=game.State.SideTag(side.ToString())+"  "+text;
                if(opt["card"] is JsonNode card)text=card["icon"]+"  "+text;
                var button=game.Button(choices,"option:"+choice,text,()=>game.Choose(choice),enabled);
                if(opt["card"] is JsonNode ranked)button.AddToClassList("rarity-"+ranked["r"]);
                if(enabled && opt["tip"] is JsonObject tip && tip.Any(pair=>pair.Value is JsonArray lines && lines.Count>0)) {
                    var groups=tip.Select(pair=>game.Text(pair.Key=="ok"?"ui.ok":pair.Key=="fail"?"ui.fail":"ui.tip.fx")+"\n"+(pair.Value is JsonArray lines && lines.Count>0?string.Join("\n",lines.Select(line=>line![0]!.ToString())):game.Text("ui.tip.nothing")));
                    game.Hover(button,()=>string.Join("\n",groups));
                }
            }
            if(view["closable"]!=null && (bool)view["closable"]!) game.Button(panel,"close",game.Text("ui.back"),()=>game.Pump());
        }
    }
    internal static class EndingPanel
    {
        internal static void Draw(GameShell game,VisualElement panel)
        {
            string key=game.State.Snapshot["over"]!["id"]!.ToString() switch {"ipo"=>"bell","agi_good" or "agi_bad"=>"awakening","acquired"=>"handshake","sellout"=>"headhunt","giant"=>"launch","unicorn"=>"pitch","small"=>"party","zombie"=>"office_night","bankrupt"=>"crash","jail"=>"police","banned"=>"ministry",_=>"boardroom"};
            game.Picture(panel,"art-"+key,0,125);
            var summary=game.Summary; Label(panel,summary["ending"]!["name"]!.ToString(),"heading");Label(panel,summary["text"]!.ToString()); Label(panel,game.Text("ui.end.score",("得分",summary["score"]!),("人脉点",summary["points"]!))); game.Button(panel,"title",game.Text("ui.end.title"),game.Title);
        }
    }
}
