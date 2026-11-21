using System.Linq;

namespace Liandan.Kernel
{
    public sealed partial class GameState
    {
        // 与网页 crisisNow 同条件。只查询当前快照，不抽事件，也不推进随机流。
        public int AudioCrisis(double runway)
        {
            if (Snapshot.On("over")) return 0;
            double crime=!Flag("probe") && Rows("dirt").Any(IsCrime)?Snapshot.N("exposedCrime"):0;
            double pressure=Map("cd").On("crack")?0:reg;
            bool board=stage>=P("coup.stage") && !Map("cd").On("coup") && equity<P("coup.equity")
                && (rep<P("coup.rep") || morale<P("coup.morale") || exposed>=P("coup.exposed"));
            bool dispute=Ideo.On("on");
            if (runway<P("crisis.runwayBad") || pressure>=P("crisis.regBad") || board
                || crime>=P("crisis.crimeBad") && LeakRisk(true)>=P("advice.dirt.risk")
                || dispute && Ideo.N("n")>=P("crisis.ideoLate") && equity<P("ideo.equity")) return 2;
            if (runway<P("crisis.runway") || pressure>=P("crisis.reg") || crime>=P("advice.crime.from")
                || morale<P("crisis.morale") || LeakRisk(false)>=P("advice.dirt.bad") || outage>P("crisis.outage")
                || dispute && equity<P("ideo.equity")+P("crisis.ideoMargin")
                || HasHeat && (dispute || Ideo.Str("result")=="red") && Ideo.N("heat")>=P("crisis.heat")) return 1;
            return 0;
        }
        private double LeakRisk(bool crimeOnly) => 1-Rows("dirt")
            .Where(d=>d.N("t")<=t+1-P("dirt.hideMonths") && (!crimeOnly || IsCrime(d)))
            .Aggregate(1.0,(survival,d)=>survival*(1-Expose(d)));
    }
}
