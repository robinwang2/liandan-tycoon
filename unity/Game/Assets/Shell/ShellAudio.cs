using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using Liandan.Sound;
using UnityEngine;
using UnityEngine.UIElements;

namespace Liandan.Shell
{
    public sealed partial class GameShell
    {
        // 合成器和播放头只归 PCM 回调所有，UI 队列不持锁，回调不读 GameState 或 Unity 对象。
        private Synth? sound;
        private AudioClip? soundClip;
        private AudioSource? soundSource;
        private readonly ConcurrentQueue<Action<Synth>> soundCommands=new ConcurrentQueue<Action<Synth>>();
        private volatile bool soundStarted;
        private bool quietTheme, wasRaining;
        private HashSet<string>? heardHints;
        private int crisis;
        private SoundScene soundScene;
        private double sceneAt, skyStart, skyDuration, skyFrom=10, skyTo=10, rainFrom, rainTo, rainStart;
        private string skyMode="";
        private int skyTurn;
        private bool skyNight;
        private static readonly double[] Hours={9.3,11.6,14.4,16.6,17.9,10.4,15.5};
        private void InitSound()
        {
            bool device=!Application.isBatchMode && SystemInfo.supportsAudio && AudioSettings.outputSampleRate>=8000;
            if (!device && captureDirectory==null) return;
            int rate=device?AudioSettings.outputSampleRate:48000;
            sound=new Synth(rate,audio);
            if (captureDirectory!=null)
            {
                audit=new MixAudit(captureDirectory,audioTest?"audiotest":"autoplay",device?"pcm-callback":"software-clock",rate,audio);
                sound.Audit=audit;
            }
            if (!device) { softwareBlock=new float[1024*2]; return; }
            if (FindAnyObjectByType<AudioListener>()==null) gameObject.AddComponent<AudioListener>();
            soundSource=gameObject.AddComponent<AudioSource>();
            soundSource.playOnAwake=false; soundSource.loop=true; soundSource.spatialBlend=0;
            soundClip=captureDirectory==null?AudioClip.Create("炼丹大亨",rate,2,rate,true,ReadSound):
                AudioClip.Create("炼丹大亨",rate,2,rate,true,ReadSound,position=>{
                    lock(captureGate)if(position==0 && soundStarted && softwareBlock==null)sound?.Mark("loop","clip");
                });
            soundSource.clip=soundClip;
            if (Root==null) return;
            Root.RegisterCallback<PointerDownEvent>(_=>UnlockSound(),TrickleDown.TrickleDown);
            Root.RegisterCallback<KeyDownEvent>(_=>UnlockSound(),TrickleDown.TrickleDown);
        }
        private void ReadSound(float[] samples)
        {
            if (captureDirectory==null) { RenderSound(samples); return; }
            lock(captureGate)
            {
                if(softwareBlock==null)RenderSound(samples);
                else Array.Clear(samples,0,samples.Length);
            }
        }
        private void RenderSound(float[] samples)
        {
            var engine=sound;
            if (!soundStarted || engine==null) { Array.Clear(samples,0,samples.Length); return; }
            while (soundCommands.TryDequeue(out var command)) command(engine);
            engine.Render(samples,2);
            audit?.Capture(samples);
        }
        private void SendSound(Action<Synth> command)
        {
            if (sound==null) return;
            // 尚未开始播放，也可能整晚停在标题页。启动之前在主线程更新参数。
            if (!soundStarted) command(sound); else soundCommands.Enqueue(command);
        }
        private void UnlockSound()
        {
            if (soundStarted || sound==null) return;
            soundCommands.Enqueue(s=>s.Unlock()); captureStart=Time.realtimeSinceStartupAsDouble; soundStarted=true; if (soundSource!=null) soundSource.Play();
        }
        private void OnApplicationFocus(bool focused) { if(captureDirectory==null) SendSound(s=>s.SetHidden(!focused)); }
        internal void Cue(string id,double pitch=0) => SendSound(s=>s.Sfx(id,1,pitch));
        private void CueLater(string id,double delay) => SendSound(s=>s.SfxAfter(id,delay));
        private static bool AudioPlayPage(string screen) => screen is "main" or "local" or "event" or "result" or "menu" or "settings";
        private bool GoodEnding => Number(Tables.Definition("ENDINGS")[State.Snapshot["over"]!["id"]!.ToString()]!["good"]!)!=0;
        private void SyncSound()
        {
            if (sound==null) return;
            bool play=State!=null && AudioPlayPage(ScreenId);
            bool end=State!=null && ScreenId=="end";
            string mood="title"; int level=0;
            var scene=new SoundScene { Mode="title",Region=ScreenId=="wizard"?Wizard.Region:"bay", Staff=ScreenId=="wizard"?0:7,Month=9,Heat=.7,Racks=4 };
            int turn=0; bool night=false;
            if (play || end)
            {
                var state=State!; var data=state.Snapshot;
                double runway=state.ReadBotValue("runway"),gpu=Number(data["gpu"]!);
                level=play?state.AudioCrisis(runway):0;
                double free=Math.Max(0,gpu-state.ReadBotValue("inferNeed")); int t=(int)Number(data["t"]!);
                bool own=(bool)data["ownModel"]!, hot=own && (bool?)data["furnace"]?["on"]==true && free>0;
                mood=end?(GoodEnding?"triumph":"defeat"):level==2?"crisis":
                    level==1 || runway<Tables.Parameter("crisis.tenseRunway") || Number(data["reg"]!)>=Tables.Parameter("reg.high")?"tense":
                    (hot || data["sprint"] is JsonObject) && t%4<2?"focus":"calm";
                scene.Mode=end?"end":"play"; scene.Region=state.Company.Region; scene.Month=((t-1)%12+12)%12;
                scene.Staff=data["staff"]!.AsArray().Count; scene.Alert=level>=2;
                scene.Heat=hot?.25+.75*free/Math.Max(1,state.ReadBotValue("quota")):0;
                scene.Racks=own?Math.Ceiling(Math.Log(gpu/8+1,2)):0;
                turn=t; night=data["policies"]!["work"]!.ToString()=="996";
                bool bay=scene.Region=="bay",wet=scene.Month>=4 && scene.Month<=8;
                double weather=WeatherHash(t*7919+(bay?17:3));
                scene.Rain=t<=2?0:bay?(weather>=.86 && weather<.95?1:0):
                    weather>=(wet?.52:.8) && weather<(wet?.86:.9)?1:0;
            }
            if (scene.Rain>0 && !wasRaining) Cue("rain_start");
            wasRaining=scene.Rain>0;
            SetSky(play || end?"office":ScreenId=="wizard"?"wizard":"title",turn,night,scene.Rain);
            if (level>=2 && crisis<2) Cue("alarm");
            crisis=level; soundScene=scene;
            string flavor=play || end?theme:"";
            SendSound(s=>{if(s.Audit!=null)s.Mark("crisis",level.ToString()); s.SetFlavor(flavor);s.SetMusic(mood);});
            if (sceneAt==0) UpdateSoundScene();
        }
        private static double WeatherHash(int n)
        {
            uint h=unchecked(((uint)n^0x9e3779b9u)*2654435761u);
            h^=h>>15; h=unchecked(h*2246822519u); h^=h>>13; return h/4294967296.0;
        }
        // 白盒没有天空组件，音频沿用 scene3a 的换月快进、标题日落和雨量平滑。
        private double SkyHour(double now)
        {
            double elapsed=now-skyStart;
            if (elapsed>=skyDuration) return (skyTo+(skyMode=="title"?(elapsed-skyDuration)*.11:0))%24;
            double u=elapsed/skyDuration; return (skyFrom+(skyTo-skyFrom)*u*u*(3-2*u))%24;
        }
        private double Rain(double now) => rainTo+(rainFrom-rainTo)*Math.Exp(-.9*(now-rainStart));
        private void SetSky(string mode,int turn,bool night,double rain)
        {
            double now=Time.unscaledTimeAsDouble;
            if (rain!=rainTo) { rainFrom=Rain(now); rainTo=rain; rainStart=now; }
            if (mode==skyMode && turn==skyTurn && night==skyNight) return;
            skyFrom=SkyHour(now);
            double hour=mode=="title"?16.4:mode=="wizard"?10.2:night?21.3+WeatherHash(turn)*1.5:
                Hours[(int)(WeatherHash(turn*31+7)*Hours.Length)];
            bool month=mode=="office" && skyMode=="office" && turn!=skyTurn;
            skyDuration=month?2.8:mode=="office" && skyMode!="office" || skyMode==""?0:mode=="wizard"?1.2:1.6;
            double delta=(hour-skyFrom+24)%24;
            skyTo=skyFrom+delta+(month && delta<12?24:0);
            skyStart=now; skyMode=mode; skyTurn=turn; skyNight=night;
        }
        private void UpdateSoundScene()
        {
            if (sound==null) return;
            double now=Time.unscaledTimeAsDouble; sceneAt=now+.5;
            var scene=soundScene;
            double day=(SkyHour(now)-6)/12.5;
            double elev=day>=0 && day<=1?Math.Pow(Math.Sin(Math.PI*day),.8)*64:-Math.Min(30,(day<0?-day:day-1)*112.5);
            double u=Math.Max(0,Math.Min(1,(3-elev)/10)); scene.Night=u*u*(3-2*u); scene.Rain=Rain(now);
            SendSound(s=>s.SetScene(scene));
        }
        private void TrackSoundHints()
        {
            var ids=new HashSet<string>(Advice.Select(h=>h!["id"]!.ToString()));
            if (heardHints!=null && !ids.IsSubsetOf(heardHints)) Cue("notify");
            heardHints=ids;
        }
        private double MoveFloor(int target,int floors)
        {
            if (target==floor) return 0;
            int from=floor<0?floors:floor,to=target<0?floors:target;
            floor=target;
            double duration=Math.Min(1.5,Math.Max(.6,.55+.17*Math.Abs(to-from)));
            Cue("lift",to>from?2:-3); CueLater("ding",duration);
            return duration;
        }
        private void ConsumeFx()
        {
            var queue=State.Snapshot["fxq"]!.AsArray();
            foreach (var item in queue)
            {
                string? fx=item?[0]?.ToString();
                if(fx=="release")officeRelease=true;
                string? cue=fx switch { "money"=>"coin","confetti" or "levelup" or "alarm" or "boom" or "cameo" or "release"=>fx,_=>null };
                if (cue==null) continue;
                double delay=0;
                if ((cue is "boom" or "release" || cue=="cameo" && floor<0)
                    && Tables.Definition("FLOOR_PLANS")[((int)State.Company.Office).ToString()] is JsonArray plan)
                {
                    if(floorOffice!=(int)State.Company.Office){floorOffice=(int)State.Company.Office;floor=-1;}
                    string role=cue=="cameo"?"ceo":"res";
                    int i=Array.FindIndex(plan.ToArray(),row=>row!.AsArray().Any(r=>r!.ToString()==role));
                    delay=MoveFloor(i>=0?i:role=="ceo"?plan.Count-1:0,plan.Count);
                }
                if (delay>0) CueLater(cue,delay); else Cue(cue);
            }
            queue.Clear();
        }
    }
}
