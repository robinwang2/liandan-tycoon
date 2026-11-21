using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using static System.Math;
using static Liandan.Kernel.Js;

namespace Liandan.Kernel
{
    public sealed partial class GameState
    {
        public int StoryLength => StoryStages.Count;
        public double DirtTotal => Rows("dirt").Sum(row=>row.N("sev"));
        public string StoryMeters() => BarsLine();
        public string StoryStrip(int step,bool preview)
        {
            var side=PreferredSide(StoryLean().value);var lean=side==null?StoryText("ideo.page.lean.mixed"):StoryText("ideo.page.lean",("立场",SideName(side)));
            return StoryText(preview && step>=P("ideo.lean.from")?"ideo.page.strip.lean":"ideo.page.strip",("级",step),("总",StoryLength),("股权",Fixed(equity,0)),("底线",P("ideo.equity")),("倾向",lean));
        }
        public double GpuStep => Max(P("ui.gpuStepMin"),RoundJs(Quota*P("ui.gpuStep")));
        public double GpuBill => GpuRent(gpu);
        private double OverMult(double quota,double extra) => extra>0?P("gpu.over0")+extra/(P("gpu.overDiv")*quota):1;
        public string GpuDetail => gpu>Quota ? Tx("ui.gpu.over",("张数",gpu-Quota))+Tx("ui.gpu.over.text",("倍数",Fixed(OverMult(Max(1,Quota),gpu-Max(1,Quota)),1))) : gpu==Quota?Tx("ui.gpu.full",("倍数",P("gpu.over0"))):"";
        public string CooldownText(string id) => Map("cd").On(id)?ButtonText("common.cooldown",("月",Map("cd").N(id)-t)):"";
        public IEnumerable<string> StoryStatus()
        {
            if(HasHeat && Ideo.On("heat"))yield return StoryText("ideo.page.heatLine",("压力",RoundJs(Ideo.N("heat"))),("估值",RoundJs((1-HeatDrag("raiseMult"))*100)),("订单",RoundJs((1-HeatDrag("b2bMult"))*100)));
            int reds=Rows("staff").Count(person=>person.On("red"));
            if(Ideo.On("on")){if(reds>0)yield return StoryText("ideo.page.reds",("人数",reds));yield break;}
            if(Flag("bci_ok"))yield return OwnModel?StoryText("ideo.page.bci.model",("张数",BrainGpu)):StoryText("ideo.page.bci.app",("降幅",RoundJs((1-P("bci.apiMult"))*100)));
            else if(Flag("bci_on")&&!Flag("bci_shut"))yield return StoryText("ideo.page.bci.on");
            if(Flag("utopia_ok"))yield return StoryText("ideo.page.utopia.ok",("增长",RoundJs((D("IDEO_FLAG_MODS")["utopia_ok"].N("growthMult")-1)*100)));
            else if(Flag("utopia_on")&&!Flag("utopia_fail"))yield return StoryText("ideo.page.utopia.on");
            if(Flag("red_cell")||Flag("rose_cell"))yield return StoryText("ideo.page.cell");
            if(reds>0&&Ideo.Str("result")=="red")yield return StoryText("ideo.page.mark",("人数",reds));
        }
        public string WrapperDetail => Tx("ui.ops.wrapper",("上游",Rows("rivals").First(row=>row.Str("id")==Snapshot.Str("upstream")).Str("name")),("能力",Fixed(UpCap,0)),("账单",Money(Costs().N("api"))));
        public JsonArray Leaderboard()
        {
            var rows=Rows("rivals").Select(row=>Obj(("name",row["name"]),("model",row.Str("model")+"-"+row.Str("ver")),("bench",row["bench"]),("me",false))).ToList();
            if(Model!=null)rows.Add(Obj(("name",Company.Name),("model",Model["name"]),("bench",Model["bench"]),("me",true)));
            return new JsonArray(rows.OrderByDescending(row=>row.N("bench")).ToArray());
        }
        public string StaffImpact(JsonNode person)
        {
            // 探算只改副本，悬停不会消耗随机数或改动真实名单。
            var probe=new GameState(Snapshot.DeepClone().AsObject(),tables); var staff=probe.List("staff");
            var prior=staff.FirstOrDefault(row=>row.Str("uid")==person.Str("uid"));if(prior!=null)staff.Remove(prior);
            string role=person.Str("role"); double Value()=>role=="res"?probe.ResearchEff:role=="biz"?probe.Revenue().N("b2b"):probe.Power(role);
            double before=Value();staff.Add(person.DeepClone());double after=Value(),delta=after-before;var lines=new List<string>();
            void Line(string key,params (string,object)[] vars)=>lines.Add(Tx("impact."+key,vars));
            switch(role){
                case "res": Line("res.eff",("百分比",Fixed((after/before-1)*100,0)));Line("res.proj");if(!OwnModel)Line("res.noModel");break;
                case "eng": double dev=delta*Mod("devMult");Line("eng.quality",("体验",Fixed(delta*P("quality.engK")*Mod("devMult")*Max(0,1-quality/QualityCeiling),1)));Line("eng.dev",("进度",Fixed(dev,1)));if(OwnModel)Line("eng.boom",("概率",Fixed(delta/(P("furnace.boomEngDiv")/100),1)));break;
                case "ops": double growth=Track.N("growth")*JsMath.Pow(Mod("growthMult"),P("users.growModExp"));Line("ops.users",("用户",UsersText(delta/P("users.seedOps")*growth*(P("users.seedT0")+t/P("users.seedTMonths")))));Line("ops.growth",("增长",Fixed((Min(P("users.opsMax"),after/P("users.opsDiv"))-Min(P("users.opsMax"),before/P("users.opsDiv")))*growth*100,2)));break;
                case "biz": Line("biz.b2b",("收入",Money(delta,true)));Line("biz.proj");break;
                case "legal": Line("legal.expose",("概率",Fixed((1-(1+before/P("dirt.legalDiv"))/(1+after/P("dirt.legalDiv")))*100,0)));Line("legal.fix");break;
            }
            if(person.On("quirk")){var trait=D("STAFF_QUIRKS")[person.Str("quirk")];lines.Add(Tx("staff.quirk",("名字",trait.Str("name")),("说明",trait.Str("desc"))));}
            return string.Join("\n",lines);
        }
    }
}
