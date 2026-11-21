using System;
using System.Collections;
using System.IO;
using System.Linq;
using System.Threading;
using Liandan.Sound;
using UnityEngine;

namespace Liandan.Shell
{
    public sealed partial class GameShell
    {
        private string? captureDirectory;
        private MixAudit? audit;
        private readonly object captureGate=new object();
        private bool audioTest;
        private float[]? softwareBlock;
        private double softwareDebt, captureStart;
        private long stepStart;

        private void PumpRecording()
        {
            if(audit==null || !soundStarted)return;
            // 无设备的批处理也经过同一个最终混音入口，报告中保留时钟来源。
            // 部分设备能创建 AudioSource，却始终不给 PCM 回调。只在尚无第一帧时换时钟。
            if(softwareBlock==null && audit.Elapsed==0 && Time.realtimeSinceStartupAsDouble-captureStart>1.5)
            {
                lock(captureGate)if(audit.Elapsed==0)
                { softwareBlock=new float[2048]; audit.UseSoftwareClock(); }
                if(softwareBlock!=null && soundSource!=null)soundSource.Stop();
            }
            if(softwareBlock!=null)
            {
                softwareDebt+=Time.unscaledDeltaTime*sound!.Rate;
                while(softwareDebt>=softwareBlock.Length/2)
                { RenderSound(softwareBlock); softwareDebt-=softwareBlock.Length/2; }
            }
            audit.Drain();
        }
        internal void FinishRecording()
        {
            MixAudit recording;
            lock(captureGate)
            {
                soundStarted=false; recording=audit??throw new InvalidOperationException("没有启动录音");
                sound!.Audit=null; audit=null;
            }
            if(soundSource!=null)soundSource.Stop();
            using(recording)
            {
                Debug.Log(recording.Finish());
                if(audioTest && !recording.FullCoverage)throw new InvalidDataException("巡检覆盖不全，见覆盖汇总");
            }
        }
        private void SaveAudioValues(int[] values)
        {
            for(int i=0;i<values.Length;i++)SetPref(AudioTestStep.Keys[i],values[i]);
            ApplyVolume();
        }
        private void StartAudioTest(string[] args)
        {
            audioTest=true; Application.runInBackground=true;
            int pos=Array.IndexOf(args,"-shots"); bool readback=args.Contains("-audiotest-readback");
            if(pos>=0 && pos+1==args.Length || pos<0 && readback)throw new ArgumentException("读回设置需要 -shots 目录");
            captureDirectory=pos>=0?Path.GetFullPath(args[pos+1]):Path.Combine(Application.persistentDataPath,"audiotest-"+DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff"));
            string path=Path.Combine(captureDirectory,"prefs","ldt_settings.json"); LoadAudioSettings(path);
            if(readback)
            {
                for(int i=0;i<AudioTestStep.Keys.Length;i++)
                {
                    string key=AudioTestStep.Keys[i]; int value=Pref(key,-1);
                    if(value!=AudioTestStep.Saved[i])throw new InvalidDataException($"重启读回 {key}={value}，预期 {AudioTestStep.Saved[i]}");
                }
                Debug.Log("Liandan audio prefs OK: "+prefs.ToJsonString()); Application.Quit(0); return;
            }
            if(File.Exists(Path.Combine(captureDirectory,"mix.wav")))throw new IOException("目录中已有录音，请换一个空目录");
            Debug.Log("Liandan audiotest directory: "+captureDirectory);
            InitSound(); StartCoroutine(WatchAudioTest());
        }
        private IEnumerator WatchAudioTest()
        {
            var test=RunAudioTest();
            while(true)
            {
                bool more;
                try { more=test.MoveNext(); }
                catch(Exception error){ Debug.LogException(error); Application.Quit(1); yield break; }
                if(!more)yield break;
                yield return test.Current;
            }
        }
        private IEnumerator RunAudioTest()
        {
            foreach(var step in AudioTestStep.Plan(audio))
            {
                if(step.Volumes!=null)SaveAudioValues(step.Volumes);
                UnlockSound();
                Interlocked.Exchange(ref stepStart,-1);
                SendSound(s=>{ s.Mark("step",step.Name); step.Play(s); Interlocked.Exchange(ref stepStart,s.Frame); });
                long lastFrame=audit!.Elapsed; double progressAt=Time.realtimeSinceStartupAsDouble;
                while(true)
                {
                    long now=audit.Elapsed, start=Interlocked.Read(ref stepStart);
                    if(start>=0 && now-start>=step.Seconds*sound!.Rate)break;
                    if(now!=lastFrame){lastFrame=now; progressAt=Time.realtimeSinceStartupAsDouble;}
                    if(Time.realtimeSinceStartupAsDouble-progressAt>15)throw new IOException("播放器 15 秒没有产生 PCM："+step.Name);
                    yield return null;
                }
            }
            FinishRecording(); SaveAudioValues(AudioTestStep.Saved);
            Debug.Log("Liandan audiotest OK: "+captureDirectory); Application.Quit(0);
        }
    }
}
