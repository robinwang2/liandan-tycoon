using System;
using System.IO;
using System.Text.Json.Nodes;
using Liandan.Sound;

// 命令行自检复用巡检脚本与总线录音，用于不启动 Unity 时校准分析器。
if(args.Length>=2 && args[0]=="mix-check")
{
    int rate=args.Length>2?int.Parse(args[2]):48000;
    var table=JsonNode.Parse(File.ReadAllText("src/data/tables/audio.json"))!;
    var synth=new Synth(rate,table);
    using var audit=new MixAudit(args[1],"audiotest","cli-fixture",rate,table);
    synth.Audit=audit;
    var buffer=new float[2048];
    foreach(var step in AudioTestStep.Plan(table))
    {
        if(step.Volumes is int[] values)
        {
            for(int i=0;i<4;i++)synth.SetVolume(AudioTestStep.Keys[i],values[i]/100f);
            synth.SetMuted(values[4]!=0);
        }
        synth.Unlock(); synth.Mark("step",step.Name); step.Play(synth);
        long start=synth.Frame;
        while(synth.Frame-start<step.Seconds*rate){synth.Render(buffer,2); audit.Capture(buffer); audit.Drain();}
    }
    Console.WriteLine(audit.Finish()); return;
}
WavRenderer.RenderAll(".",args.Length==0?"unity/Game/Logs/audio-cs":args[0],Console.WriteLine);
