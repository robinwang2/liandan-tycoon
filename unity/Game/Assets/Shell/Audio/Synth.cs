using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using static System.Math;

namespace Liandan.Sound
{
    public struct SoundScene
    {
        public string Mode, Region;
        public double Night, Staff, Heat, Racks, Rain;
        public int Month;
        public bool Alert;
    }

    // 单个实例只由一个渲染线程驱动。播放器在缓冲边界提交主线程指令，离线工具直接调用。
    public sealed partial class Synth
    {
        private enum Bus { Sfx, Music, Amb }
        private sealed class Mood
        {
            internal double Root, Beat, Density, Bright;
            internal int[] Chords, Scale;
            internal Mood(JsonNode config)
            {
                Root = (double)config["root"]!; Beat = 60 / (double)config["bpm"]!;
                Density = (double)config["density"]!; Bright = (double)config["bright"]!;
                Chords = config["chords"]!.AsArray().Select(n => (int)n!).ToArray();
                Scale = config["scale"]!.AsArray().Select(n => (int)n!).ToArray();
            }
        }
        private sealed class Generation
        {
            internal double Born, Next, Until = double.PositiveInfinity, FadeFrom;
            internal int Beat, Chord, Note, Count;
            internal string Mood = "";
            internal double Level(double now) => double.IsInfinity(Until) ? Min(1, (now-Born)/2.6) : Max(0,(Until-now)/2.6) * FadeFrom;
        }
        private struct Note
        {
            internal double At, Dur, Freq, End, Gain, Cutoff, Attack, Detune, F2, F3;
            internal Wave Wave;
            internal Filter Filter;
            internal int Noise;
            internal Bus Bus;
            internal Generation? Owner;
            internal bool RandomKey;
            internal string? Effect, Flavor;
        }
        private sealed class Voice
        {
            internal Note Note;
            internal long First, Stop;
            internal int Count, Offset;
            internal double Fraction;
            internal Biquad Tone;
            internal double Peak, AttackEnd, End, FreqEnd, Amp, AmpStep, Glide;
            internal readonly double[] Phase = new double[3], Step = new double[3];
        }

        private readonly Dictionary<string,Mood> moods = new Dictionary<string,Mood>();
        private readonly Dictionary<string,double> lastSfx = new Dictionary<string,double>();
        private readonly List<(string id,double gain,double pitch)> pending = new List<(string,double,double)>(16);
        private readonly List<Note> events = new List<Note>(96);
        private readonly List<(long frame,string id)> delayed = new List<(long,string)>(16);
        private readonly Voice[] voices = new Voice[20];
        private int count, nodes = 28; // 主增益、压缩器、三路总线、卷积和湿声增益，加七组环境节点
        private Generation? current;
        private readonly int rate;
        internal MixAudit? Audit;
        internal long Frame => frame;
        internal int Rate => rate;
        internal void Mark(string kind,string value) => Audit?.Mark(frame,kind,value);
        private long frame, nextTick;
        private long tickIndex;
        private double Now => (double)frame / rate;
        private uint seed;
        private string mood = "off", flavor = "";
        private bool unlocked, muted, hidden;
        private readonly double[] levels = new double[4];
        private Target master, music, sfx, amb;
        private readonly float[][] noise = new float[2][];
        private readonly Oscillators oscillators;
        private static readonly Lazy<Oscillators> SharedWaves = new Lazy<Oscillators>(() => new Oscillators());
        private readonly Reverb reverb;
        private readonly Limiter limiter;
        private long wetUntil;

        public Synth(int sampleRate, JsonNode table, uint seed = 0x6d2b79f5)
        {
            if (sampleRate < 8000) throw new ArgumentOutOfRangeException(nameof(sampleRate));
            rate = sampleRate; this.seed = seed;
            foreach (var pair in table["MOODS"]!.AsObject()) moods.Add(pair.Key,new Mood(pair.Value!));
            foreach (var row in table["SFX"]!.AsArray()) lastSfx[row!["id"]!.ToString()] = double.NegativeInfinity;
            foreach (var pair in table["VOLUMES"]!.AsObject()) SetVolume(pair.Key,(double)pair.Value!);
            for (int i = 0; i < voices.Length; i++) voices[i] = new Voice();
            oscillators = SharedWaves.Value;
            for (int k = 0; k < 2; k++)
            {
                var data = noise[k] = new float[rate * 2]; double b0 = 0, b1 = 0, b2 = 0;
                for (int i = 0; i < data.Length; i++)
                {
                    double w = Random() * 2 - 1;
                    b0 = .99765*b0 + w*.099046; b1 = .963*b1 + w*.2965164; b2 = .57*b2 + w*1.0526913;
                    data[i] = (float)(k == 0 ? w : (b0 + b1 + b2 + w*.1848)*.18);
                }
                for (int i = 0; i < 512; i++)
                { int j = data.Length-512+i; double a = i / 512.0; data[j] = (float)(data[j]*(1-a) + data[0]*a); }
                data[data.Length-1] = data[0];
            }
            int length = (int)(rate * 1.65); var ir = new float[2][];
            for (int ch = 0; ch < 2; ch++)
            {
                ir[ch] = new float[length];
                for (int i = 0; i < length; i++) ir[ch][i] = (float)((Random()*2-1)*Exp(-6.0*i/length)*.25);
            }
            reverb = new Reverb(ir,rate); limiter = new Limiter(rate);
            InitLayers();
        }
        private double Random()
        { seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5; return seed / 4294967296.0; }
        private double Range(double a, double b) => a + Random()*(b-a);
        private static double Bound(double x,double max) => Max(0,Min(max,x));
        public void Unlock()
        {
            if (unlocked) return;
            unlocked = true; music.Reset(levels[1]); sfx.Reset(levels[2]); amb.Reset(levels[3]);
            UpdateMaster(); Ambience(); nextAmbient = Now + Range(3,8); ChangeMusic();
            foreach (var item in pending) Sfx(item.id,item.gain,item.pitch);
            pending.Clear();
        }
        public void SetVolume(string bus,double value)
        {
            int i = bus switch { "master"=>0,"music"=>1,"sfx"=>2,"amb"=>3,_=>-1 };
            if (i < 0 || double.IsNaN(value) || double.IsInfinity(value)) return;
            levels[i] = Bound(value,1);
            if (!unlocked) return;
            switch (i) { case 0: UpdateMaster(); break; case 1: music.Set(levels[i],.12,rate); break;
                case 2: sfx.Set(levels[i],.12,rate); break; case 3: amb.Set(levels[i],.12,rate); break; }
        }
        private void UpdateMaster() => master.Set(muted || hidden ? 0 : levels[0], .15, rate);
        public void SetMuted(bool flag) { muted = flag; UpdateMaster(); }
        public void SetHidden(bool flag)
        {
            if (hidden == flag) return;
            hidden = flag; UpdateMaster();
            if (flag) { events.Clear(); delayed.Clear(); } else if (unlocked) { nextAmbient = Now + Range(2,6); nextMod = Now; }
            ChangeMusic();
        }
        public void SetMusic(string value)
        {
            if (value == mood || value != "off" && !moods.ContainsKey(value)) return;
            mood = value; ChangeMusic();
        }
        public void SetFlavor(string value)
        {
            flavor = value is "soviet" or "rose" or "cold" ? value : "";
            Mark("flavor", flavor == "" ? "default" : flavor);
        }
        public void Sfx(string id,double gain = 1,double pitch = 0)
        {
            if (!lastSfx.TryGetValue(id,out var last)) return;
            if (!unlocked) { if (pending.Count < 16) pending.Add((id,gain,pitch)); return; }
            if (muted || hidden || Now-last < (id=="hover" ? .08 : .035)) return;
            lastSfx[id] = Now;
            if (!double.IsFinite(gain)) gain=1;
            if (!double.IsFinite(pitch)) pitch=0;
            if (gain>0) Recipe(id,Bound(gain,2),Pow(2,Max(-36,Min(36,pitch))/12));
        }
        private void Queue(Note n) { if (events.Count < 96) events.Add(n); }
        public void SfxAfter(string id,double delay)
        {
            if (id=="ding") delayed.RemoveAll(item=>item.id=="ding");
            if (delayed.Count<96) delayed.Add((frame+(long)Round(delay*rate),id));
        }
        private void StartNote(Note n)
        {
            int sources = n.F3>0 ? 3 : n.F2>0 ? 2 : 1;
            if (nodes + sources + 2 > 60) return;
            nodes += sources+2;
            if (Audit!=null && n.Owner!=null)n.Flavor=flavor==""?"default":flavor;
            var v = voices[count++]; v.Note = n; v.Count = sources; if (n.Owner != null) n.Owner.Count++;
            v.First = (long)Ceiling(n.At*rate-1e-8); v.Stop = (long)Round((n.At+n.Dur+.025)*rate);
            v.AttackEnd = (n.At+Min(n.Attack,n.Dur*.3))*rate; v.End = (n.At+n.Dur)*rate; v.FreqEnd=(n.At+n.Dur*.85)*rate;
            v.Peak = Max(.00001,n.Gain/Sqrt(sources));
            v.AmpStep = Exp(Log(.00001/v.Peak)/(v.End-v.AttackEnd));
            v.Amp = v.Peak*Pow(v.AmpStep,Ceiling(v.AttackEnd)-v.AttackEnd);
            v.Glide = n.End>0 ? Exp(Log(n.End/n.Freq)/(n.Dur*.85*rate)) : 1;
            for (int i=0;i<sources;i++)
            {
                v.Step[i]=(i==0?n.Freq:i==1?n.F2:n.F3)*Pow(2,n.Detune/1200)/rate;
                v.Phase[i]=Max(0,v.First-n.At*rate)*Min(.5,v.Step[i]);
            }
            v.Offset = n.Noise==0 ? 0 : (int)Round(Range(0,1.8)*rate);
            v.Fraction = Max(0,v.First-n.At*rate);
            v.Tone = default; v.Tone.Tune(n.Cutoff,n.Filter,.65,rate);
        }
        private double Sample(Voice v)
        {
            var n = v.Note; double x = 0;
            if (n.Noise != 0)
            {
                var data=noise[n.Noise-1]; double first=data[v.Offset++];
                if (v.Offset==data.Length) v.Offset=0;
                x=first+(data[v.Offset]-first)*v.Fraction;
            }
            else for (int j=0;j<v.Count;j++)
            {
                double step=Min(.5,v.Step[j]), phase=v.Phase[j];
                // Chromium 在音源启动的首个非完整量子里，从参数数组的首项读频率。
                // 数组前段仍是 OscillatorNode 的默认 440 Hz；下一个完整量子恢复正常。
                long firstOffset=v.First & 127;
                if (frame-v.First < Min(firstOffset,128-firstOffset))
                    step=440*Pow(2,n.Detune/1200)/rate;
                x+=oscillators.Read(n.Wave,phase,step);
                phase += step; v.Phase[j] = phase - Floor(phase);
                if (frame < v.FreqEnd) v.Step[j] *= v.Glide;
            }
            double amp;
            if (frame < v.AttackEnd) amp = v.Peak * (frame-n.At*rate)/(v.AttackEnd-n.At*rate);
            else if (frame < v.End) { amp=v.Amp; v.Amp*=v.AmpStep; } else amp=.00001;
            return v.Tone.Next(x)*amp;
        }
        private void Retire(int i)
        {
            var v=voices[i]; nodes-=2+v.Count; var g=v.Note.Owner;
            if (g!=null && --g.Count==0 && g!=current) nodes--;
            voices[i]=voices[--count]; voices[count]=v;
        }
        private void ChangeMusic()
        {
            if (!unlocked) return;
            if (current != null)
            {
                if (!hidden && mood!="off" && current.Mood!=mood) Mark("transition",current.Mood+">"+mood);
                current.FadeFrom=current.Level(Now); current.Until=Now+2.6;
                if (current.Count==0) nodes--;
                current=null;
            }
            if (hidden || mood=="off" || nodes>48) return;
            current=new Generation { Born=Now, Next=Now+.02, Mood=mood }; nodes++;
        }
        private void Tick()
        {
            if (hidden) return;
            if (current==null && mood!="off") ChangeMusic();
            if (current!=null && current.Next<Now+.15)
            {
                if (current.Next<Now) current.Next=Now+.01;
                MusicStep(current,moods[mood]);
            }
            if (Now>=nextMod) Modulate();
            if (Now>=nextAmbient) AmbientEvent();
            for (int i=events.Count-1;i>=0;i--)
            {
                var n=events[i]; if (n.At>=Now+.15) continue;
                events.RemoveAt(i); if (n.At<Now-.2) continue;
                if (n.RandomKey) n.Freq=Range(400,800);
                n.At=Max(Now+.002,n.At); StartNote(n);
            }
        }

        public void Render(float[] buffer,int channels)
        {
            if (!unlocked) { Array.Clear(buffer,0,buffer.Length); return; }
            for (int offset=0;offset<buffer.Length;offset+=channels,frame++)
            {
                for (int j=delayed.Count-1;j>=0;j--)
                {
                    var item=delayed[j]; if (item.frame>frame) continue;
                    delayed.RemoveAt(j); Sfx(item.id);
                }
                if (frame==nextTick)
                {
                    Tick(); nextTick=(long)Ceiling(++tickIndex*(double)rate/1280)*128;
                }
                double m=0, fx=0, a=AmbientSample(), oldMusic=0, retiringGain=0, incomingGain=0;
                for (int i=count-1;i>=0;i--)
                {
                    var v=voices[i]; var g=v.Note.Owner;
                    if (frame>=v.Stop || g!=null && Now>=g.Until) { Retire(i); continue; }
                    if (frame<v.First) continue;
                    if (Audit!=null && frame==v.First)
                    {
                        if (v.Note.Effect!=null) Mark("sfx",v.Note.Effect);
                        if (g!=null) { Mark("mood",g.Mood); Mark("musicFlavor",v.Note.Flavor!); }
                    }
                    double y=Sample(v);
                    if (g!=null)
                    {
                        double level=g.Level(Now),signal=y*level; m+=signal;
                        if (Audit!=null)
                        {
                            if (g==current) incomingGain=level;
                            else { oldMusic+=signal; retiringGain=Max(retiringGain,level); }
                        }
                    }
                    else if (v.Note.Bus==Bus.Amb) a+=y; else fx+=y;
                }
                Audit?.MusicSample(frame,oldMusic,m-oldMusic,retiringGain,incomingGain);
                double wl=0,wr=0;
                if (m!=0) wetUntil=frame+(int)(rate*1.65)+1;
                if (frame<wetUntil) reverb.Process(m,out wl,out wr);
                double mv=music.Next(), gain=master.Next(), dry=m*mv+fx*sfx.Next()+a*amb.Next();
                double l=(dry+.16*mv*wl)*gain,r=(dry+.16*mv*wr)*gain;
                limiter.Process(ref l,ref r);
                if (channels==1) buffer[offset]=(float)((l+r)*.5);
                else { buffer[offset]=(float)l; buffer[offset+1]=(float)r;
                    for (int c=2;c<channels;c++) buffer[offset+c]=0; }
            }
        }
    }
}
