using static System.Math;

namespace Liandan.Sound
{
    public sealed partial class Synth
    {
        private static Note Tone(double at,double freq,double dur,double gain,Wave wave=Wave.Sine,
            double cutoff=2200,double end=0,double attack=.008,double detune=0)
            => new Note { At=at, Freq=freq, Dur=dur, Gain=gain, Wave=wave, Cutoff=cutoff, End=end, Attack=attack, Detune=detune };

        // 延迟相对输入时刻。粉噪起点在前瞻调度时抽取，保持与网页相同的取随机数顺序。
        private void Recipe(string id,double strength,double ratio)
        {
            void T(double d,double f,double dur,double gain,Wave wave=Wave.Sine,double cutoff=2200,double end=0,double attack=.008,double detune=0)
                { var n=Tone(Now+d,f*ratio,dur,gain*strength,wave,cutoff,end*ratio,attack,detune); n.Effect=id; Queue(n); }
            void Dust(double d,double dur,double gain,double cutoff,Filter filter=Filter.Bandpass)
            {
                var n=Tone(Now+d,1,dur,gain*strength,cutoff:cutoff*ratio);
                n.Effect=id; n.Noise=2; n.Filter=filter; Queue(n);
            }
            void Notes(double[] notes,double step,double dur=.3,double gain=.09)
            {
                for (int i=0;i<notes.Length;i++) T(i*step,notes[i],dur,gain,Wave.Triangle);
            }
            switch (id)
            {
                case "click": T(0,650,.012,.1,Wave.Triangle,1500,320); break;
                case "hover": T(0,1200,.012,.022,cutoff:1800); break;
                case "tab": Dust(0,.13,.09,1500); break;
                case "open": T(0,145,.32,.14,end:100); Dust(.06,.3,.065,1000); T(.08,300,.3,.025,end:600); break;
                case "close": Dust(0,.14,.06,900); T(.025,260,.16,.1,end:120); break;
                case "choose": Notes(new double[]{330,495},.095,.24); break;
                case "turn": Dust(0,.5,.11,850); T(.1,240,.4,.035,end:650); T(.53,800,.04,.09,Wave.Triangle); break;
                case "coin":
                    int coin=0; foreach (var f in new[]{1320,2083,2870})
                    { T(coin*.028,f,.42-coin*.08,.065/(coin+1),cutoff:3600); coin++; } break;
                case "spend": Notes(new double[]{980,735,490},.065,.22,.06); break;
                case "good": Notes(new double[]{392,494,587},.11); break;
                case "bad": T(0,260,.28,.1,cutoff:600,detune:-9); T(.13,195,.3,.1,cutoff:550,detune:7); break;
                case "stamp": T(0,100,.23,.22,end:48); Dust(0,.13,.16,350); break;
                case "card": Dust(0,.22,.1,2200); T(.14,1500,.3,.04); break;
                case "hire": Notes(new double[]{330,440,550},.09,.25,.07); break;
                case "fire": Notes(new double[]{330,220},.09,.22,.065); Dust(.1,.24,.08,1400); break;
                case "levelup":
                    int level=0; foreach (var f in new[]{220,277,330,440})
                    { T(level*.2,f,level==3?.58:.28,.11,Wave.Triangle,1600,attack:.045); level++; } break;
                case "release":
                    int i=0; foreach (var f in new[]{220,330,440}) T(i++*.18,f,.7,.075,end:f*2,attack:.18);
                    i=0; foreach (var f in new[]{660,1327,1840}) T(.9,f,.58,.13/(++i),cutoff:3000); break;
                case "confetti":
                    T(0,350,.07,.14,end:100);
                    for (int j=0;j<7;j++) T(.06+j*.055,Range(1500,3000),.09,.025); break;
                case "alarm":
                    for (int j=0;j<2;j++) T(j*.65,330,.5,.095,Wave.Triangle,950,280,.08); break;
                case "boom": T(0,75,.9,.24,end:28); Dust(0,1.05,.21,650,Filter.Lowpass); Dust(.14,.65,.07,2100); break;
                case "cameo": T(0,450,.33,.09,end:950); T(.28,180,.42,.12,Wave.Triangle,end:65); break;
                case "toast": T(0,660,.16,.035); break;
                case "notify": Notes(new double[]{784,1175},.075,.22,.045); break;
                case "lift": Dust(0,.75,.08,520,Filter.Lowpass); T(0,150,.8,.03,end:260,attack:.12); T(.05,420,.55,.012,end:700,attack:.2); break;
                case "ding": T(0,1318,1.1,.075,cutoff:4200); T(0,2637,.55,.018,cutoff:5200); T(.002,1975,.8,.02,cutoff:4800); break;
                case "error": T(0,160,.075,.09,cutoff:450); T(.11,160,.075,.09,cutoff:450); break;
                case "type":
                    double delay=0; int keys=5+(int)Floor(Random()*4);
                    for (int j=0;j<keys;j++) { T(delay,Range(430,740),.018,.045,Wave.Triangle,1500); delay+=Range(.035,.105); } break;
                case "rain_start": Dust(0,1.8,.065,180,Filter.Lowpass); break;
                case "burn":
                    T(0,95,.7,.2,end:38); Dust(0,2,.15,520,Filter.Lowpass); Dust(.2,1.6,.06,1400);
                    for (int j=0;j<12;j++) Dust(Range(.05,1.8),.03,.07,Range(2500,5000),Filter.Highpass); break;
                case "freeze":
                    T(0,2600,1.1,.045,Wave.Square,3200,520); Dust(0,1.3,.07,5200,Filter.Highpass);
                    for (int j=0;j<6;j++) T(.12+j*.11,Range(1400,2800),.05,.03,Wave.Square,4000); break;
                case "bloom":
                    int petal=0; foreach (var f in new[]{523,587,659,784,880,1047}) T(petal++*.16,f,.7,.045,Wave.Triangle,2600,attack:.03);
                    Dust(0,1.8,.035,900); break;
            }
        }
    }
}
