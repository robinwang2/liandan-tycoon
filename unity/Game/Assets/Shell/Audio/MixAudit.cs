using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json.Nodes;
using System.Threading;

namespace Liandan.Sound
{
    // 一个 PCM 生产者，一个主线程写盘者。浮点 WAV 保留超出满刻度的数值。
    internal sealed class MixAudit : IDisposable
    {
        internal static readonly string[] Layers={"city","office","fire","fan","rain","insects","alert"};
        internal static readonly string[] Flavors={"default","soviet","rose","cold"};
        private readonly Dictionary<string,string[]> expected;
        private readonly Dictionary<string,HashSet<string>> seen=new Dictionary<string,HashSet<string>>();
        private readonly Dictionary<string,string> last=new Dictionary<string,string>();
        private readonly List<(long at,string kind,string value)> marks=new List<(long,string,string)>(1024);
        private readonly List<(long at,double oldRms,double newRms,double oldGain,double newGain)> blends=new List<(long,double,double,double,double)>(2048);
        private readonly string directory,mode;
        private string source;
        internal void UseSoftwareClock()=>source="software-clock";
        private readonly int rate,window;
        private readonly long limit;
        private readonly float[] ring;
        private readonly byte[] bytes=new byte[65536];
        private readonly BinaryWriter writer;
        private long written,drained,elapsed,blendEnd;
        private double oldEnergy,newEnergy,oldGain,newGain;
        private int n;
        private volatile bool overflow;
        internal bool FullCoverage => expected.All(pair=>pair.Value.All(seen[pair.Key].Contains));
        internal long Elapsed => Volatile.Read(ref elapsed);
        internal MixAudit(string directory,string mode,string source,int rate,JsonNode table)
        {
            this.directory=directory; this.mode=mode; this.source=source; this.rate=rate;
            limit=mode=="autoplay"?60L*rate:int.MaxValue/8; window=Math.Max(1,rate/50);
            expected=new Dictionary<string,string[]> {
                ["sfx"]=table["SFX"]!.AsArray().Select(row=>row!["id"]!.ToString()).ToArray(),
                ["mood"]=table["MOODS"]!.AsObject().Select(pair=>pair.Key).ToArray(), ["flavor"]=Flavors,
                ["scene"]=new[]{"title","play","end"}, ["region"]=new[]{"bay","sz"},
                ["crisis"]=new[]{"0","1","2"}, ["layer"]=Layers };
            foreach (var pair in expected) seen.Add(pair.Key,new HashSet<string>());
            ring=new float[rate*2*8]; Directory.CreateDirectory(directory);
            writer=new BinaryWriter(File.Create(Path.Combine(directory,"mix.wav"))); Header(0);
        }
        private void Header(int size)
        {
            void Tag(string s)=>writer.Write(Encoding.ASCII.GetBytes(s));
            writer.BaseStream.Position=0; Tag("RIFF"); writer.Write(size+36); Tag("WAVE"); Tag("fmt ");
            writer.Write(16); writer.Write((short)3); writer.Write((short)2); writer.Write(rate); writer.Write(rate*8);
            writer.Write((short)8); writer.Write((short)32); Tag("data"); writer.Write(size);
        }
        internal void Mark(long at,string kind,string value)
        {
            if (seen.TryGetValue(kind,out var values))
            {
                values.Add(value);
                if (kind!="sfx" && last.TryGetValue(kind,out var prev) && prev==value) return;
                last[kind]=value;
            }
            if(at>=limit)return;
            marks.Add((at,kind,value));
            if(kind=="transition") { blendEnd=at+(long)(rate*2.6); n=0; oldEnergy=newEnergy=oldGain=newGain=0; }
        }
        internal void MusicSample(long frame,double oldSample,double newSample,double retiringGain,double incomingGain)
        {
            if(frame>=blendEnd)return;
            oldEnergy+=oldSample*oldSample; newEnergy+=newSample*newSample;
            oldGain=Math.Max(oldGain,retiringGain); newGain=Math.Max(newGain,incomingGain);
            if(++n<window)return;
            blends.Add((frame,Math.Sqrt(oldEnergy/n),Math.Sqrt(newEnergy/n),oldGain,newGain));
            n=0; oldEnergy=newEnergy=oldGain=newGain=0;
        }
        internal void Capture(float[] pcm)
        {
            int count=(int)Math.Min(pcm.Length, Math.Max(0,limit*2-written));
            if(written+count-Volatile.Read(ref drained)>ring.Length) overflow=true;
            if(!overflow && count>0)
            {
                int start=(int)(written%ring.Length), first=Math.Min(count,ring.Length-start);
                Array.Copy(pcm,0,ring,start,first); Array.Copy(pcm,first,ring,0,count-first);
                Volatile.Write(ref written,written+count);
            }
            Volatile.Write(ref elapsed,elapsed+pcm.Length/2);
        }
        internal void Drain()
        {
            long end=Volatile.Read(ref written);
            while(drained<end)
            {
                int start=(int)(drained%ring.Length);
                int count=(int)Math.Min(end-drained,Math.Min(ring.Length-start,bytes.Length/4));
                Buffer.BlockCopy(ring,start*4,bytes,0,count*4); writer.Write(bytes,0,count*4);
                Volatile.Write(ref drained,drained+count);
            }
        }
        internal string Finish()
        {
            Drain(); Header(checked((int)drained*4)); writer.Flush();
            var coverage=new JsonObject(); var summary=new List<string>();
            foreach(var pair in expected)
            {
                var got=seen[pair.Key]; var missing=pair.Value.Where(id=>!got.Contains(id)).ToArray();
                var values=new JsonArray(); foreach(var id in pair.Value.Where(got.Contains))values.Add(id);
                coverage.Add(pair.Key,values);
                summary.Add($"{pair.Key} {values.Count}/{pair.Value.Length} [{string.Join(",",values.Select(v=>v!.ToString()))}] 未触发 [{string.Join(",",missing)}]");
            }
            var events=new JsonArray(); foreach(var e in marks)events.Add(new JsonArray(e.at,e.kind,e.value));
            var fade=new JsonArray(); foreach(var b in blends)fade.Add(new JsonArray(b.at,b.oldRms,b.newRms,b.oldGain,b.newGain));
            var report=new JsonObject { ["mode"]=mode,["source"]=source,["rate"]=rate,["frames"]=drained/2,["elapsedFrames"]=Elapsed,
                ["overflow"]=overflow,["coverage"]=coverage,["events"]=events,["blends"]=fade };
            File.WriteAllText(Path.Combine(directory,"mix.json"),report.ToJsonString());
            if(overflow || drained==0)throw new IOException("录音环形缓冲溢出或没有收到 PCM");
            return "Liandan audio coverage: "+string.Join("；",summary);
        }
        public void Dispose()=>writer.Dispose();
    }
}
