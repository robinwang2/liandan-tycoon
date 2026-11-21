using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;

namespace Liandan.Sound
{
    internal sealed class AudioTestStep
    {
        internal readonly string Name;
        internal readonly double Seconds;
        internal readonly int[]? Volumes;
        internal readonly Action<Synth> Play;
        internal static readonly string[] Keys={"master","music","sfx","amb","mute"};
        internal static readonly int[] Saved={67,43,81,29,1};
        private AudioTestStep(string name,double seconds,Action<Synth> play,int[]? volumes=null)
        { Name=name; Seconds=seconds; Play=play; Volumes=volumes; }
        internal static IEnumerable<AudioTestStep> Plan(JsonNode table)
        {
            // 单独播放每项，中间的余量包括调度前瞻与压缩器延迟。
            bool first=true;
            foreach(var row in table["SFX"]!.AsArray())
            {
                string id=row!["id"]!.ToString();
                yield return new AudioTestStep("sfx/"+id,2.35,s=>s.Sfx(id),first?new[]{80,0,80,0,0}:null); first=false;
            }
            int i=0;
            foreach(var mood in table["MOODS"]!.AsObject().Select(p=>p.Key))
            {
                string flavor=MixAudit.Flavors[i%4]; string mode=i==0?"title":i>=5?"end":"play";
                int level=mood=="crisis"?2:mood=="tense"?1:0; string region=i%2==0?"bay":"sz";
                yield return new AudioTestStep("music/"+mood,5.2,s=>{
                    s.SetScene(mode,region); s.SetFlavor(flavor); s.Mark("crisis",level.ToString()); s.SetMusic(mood);
                },i==0?new[]{80,75,0,0,0}:null); i++;
            }
            foreach(var layer in MixAudit.Layers)
            {
                yield return new AudioTestStep("layer/"+layer,3.2,s=>{
                    s.SetMusic("off");
                    s.SetScene("play","bay",layer=="insects"?1:0,layer=="office"?60:0,
                        layer=="fire"?1:0,layer=="fan"?12:0,layer=="rain"?1:0,layer=="alert",0);
                },layer=="city"?new[]{80,0,0,85,0}:null);
            }
            foreach(var key in Keys)
            {
                foreach(var phase in new[]{"before","zero","restore"})
                {
                    bool zero=phase=="zero";
                    int[] values={80,key=="music"?75:0,key=="sfx"?80:0,key is "master" or "amb" or "mute"?85:0,0};
                    values[Array.IndexOf(Keys,key)]=key=="mute"?(zero?1:0):zero?0:80;
                    yield return new AudioTestStep("volume/"+key+"/"+phase,3.3,s=>{
                        s.SetMusic(key=="music"?"focus":"off");
                        if(key=="sfx")s.SfxAfter("ding",2);
                    },values);
                }
            }
        }
    }
}
