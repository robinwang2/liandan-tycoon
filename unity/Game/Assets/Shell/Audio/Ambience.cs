using static System.Math;

namespace Liandan.Sound
{
    public sealed partial class Synth
    {
        private sealed class Layer
        {
            internal Target Gain, Frequency;
            internal Filter Type;
            internal Biquad Biquad;
            internal int Noise, Offset;
            internal double LastFrequency;
            internal bool Observed;
        }
        private readonly Layer[] layers = new Layer[7];
        private SoundScene scene = new SoundScene { Mode="title", Region="bay" };
        private double nextMod,nextAmbient;
        private double Activity => scene.Mode=="play"?1:.35;
        private double Insects => Max(scene.Night,scene.Region=="sz" && scene.Month>=4 && scene.Month<=8?.85:0);

        private void InitLayers()
        {
            double[] hz={950,500,350,160,2600,3400,160};
            for (int i=0;i<layers.Length;i++)
            {
                var l=layers[i]=new Layer { Noise=i<4?2:i<6?1:0, Type=i==1 || i==2 || i==5?Filter.Bandpass:Filter.Lowpass };
                l.Frequency.Reset(hz[i]); l.LastFrequency=hz[i]; l.Biquad.Tune(hz[i],l.Type,.6,rate);
                if (l.Noise!=0) l.Offset=(int)Round(Range(0,1.8)*rate);
            }
        }
        public void SetScene(SoundScene state) => SetScene(state.Mode,state.Region,state.Night,state.Staff,
            state.Heat,state.Racks,state.Rain,state.Alert,state.Month);
        public void SetScene(string? mode=null,string? region=null,double? night=null,double? staff=null,
            double? heat=null,double? racks=null,double? rain=null,bool? alert=null,int? month=null)
        {
            double Field(double? value,double max,double previous) =>
                value.HasValue && double.IsFinite(value.Value)?Bound(value.Value,max):previous;
            if (mode is "title" or "play" or "end") scene.Mode=mode;
            if (region is "bay" or "sz") scene.Region=region;
            scene.Night=Field(night,1,scene.Night); scene.Staff=Field(staff,60,scene.Staff);
            scene.Heat=Field(heat,1,scene.Heat); scene.Racks=Field(racks,12,scene.Racks);
            scene.Rain=Field(rain,1,scene.Rain); scene.Month=(int)Field(month,11,scene.Month);
            scene.Alert=alert??scene.Alert;
            Mark("scene",scene.Mode); Mark("region",scene.Region);
            if (unlocked) Ambience();
        }
        private void Ambience()
        {
            layers[0].Gain.Set(.025*(1-scene.Night*.6),1,rate);
            layers[1].Gain.Set(.024*Sqrt(scene.Staff/60)*Activity,1,rate);
            layers[2].Gain.Set(.047*scene.Heat*Activity,1,rate);
            layers[3].Gain.Set(.023*scene.Racks/12*Activity,1,rate);
            layers[4].Gain.Set(.065*scene.Rain,1,rate); layers[5].Gain.Set(.011*Insects,1,rate);
            layers[6].Gain.Set(scene.Alert?.025*Activity:0,1,rate);
            layers[0].Frequency.Set(950-scene.Night*650,1.2,rate);
            layers[2].Frequency.Set(250+scene.Heat*650,1,rate);
        }
        private void Modulate()
        {
            layers[1].Frequency.Set(Range(250,750),.8,rate);
            layers[2].Gain.Set(.047*scene.Heat*Activity*Range(.7,1),.8,rate);
            layers[5].Frequency.Set(Range(2800,3900),1,rate);
            layers[5].Gain.Set(.011*Insects*Range(.45,1),.7,rate);
            layers[6].Gain.Set(scene.Alert?.012*(1+Sin(Now*3)):0,.5,rate);
            nextMod=Now+.65;
        }
        private double AmbientSample()
        {
            double output=0;
            for (int i=0;i<layers.Length;i++)
            {
                var l=layers[i]; double f=l.Frequency.Next(),gain=l.Gain.Next();
                if (f!=l.LastFrequency)
                { l.Biquad.Tune(f,l.Type,.6,rate); l.LastFrequency=f; }
                double x;
                if (l.Noise==0) x=oscillators.Read(Wave.Sine,(frame*48%rate)/(double)rate,48.0/rate);
                else { var data=noise[l.Noise-1]; x=data[l.Offset++]; if (l.Offset==data.Length) {
                    l.Offset=0; if(Audit!=null && gain*amb.Value*master.Value>1e-5)Mark("loop",MixAudit.Layers[i]);
                } }
                double sample=l.Biquad.Next(x)*gain; output+=sample;
                if (Audit!=null && !l.Observed && Abs(sample*amb.Value*master.Value)>1e-5)
                { l.Observed=true; Mark("layer",MixAudit.Layers[i]); }
            }
            return output;
        }
        private void AmbientEvent()
        {
            double at=Now+.02,chance=Random(); bool bay=scene.Region=="bay";
            void Play(Note n) { n.Bus=Bus.Amb; StartNote(n); }
            if (chance<.3 && scene.Staff>0 && scene.Mode=="play")
            {
                for (int i=0;i<2+(int)(scene.Staff/20);i++)
                {
                    var n=Tone(Now+i*Range(.06,.18),1,.018,.018,Wave.Triangle);
                    n.RandomKey=true; n.Bus=Bus.Amb; Queue(n);
                }
            }
            else if (chance<.58 && scene.Night<.6) Play(Tone(at,bay?1100:1700,.3,.016,cutoff:2400,end:bay?650:2000));
            else if (bay && chance>=.8) Play(Tone(at,1200,.8,.018,cutoff:1800));
            else if (bay) { var n=Tone(at,92,2.3,.024,cutoff:450,attack:.6); n.F2=138; Play(n); }
            else if (chance<.8) { var n=Tone(at,420,.23,.02,Wave.Triangle,1000); n.F2=530; Play(n); }
            else if (scene.Night<.5) { var n=Tone(at,1,.55,.027,cutoff:400); n.Noise=2; Play(n); }
            nextAmbient=at+Range(4,15)/(1+scene.Staff/60);
        }
    }
}
