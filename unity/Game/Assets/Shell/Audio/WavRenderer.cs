using System;
using System.IO;
using System.Text;
using System.Text.Json.Nodes;

namespace Liandan.Sound
{
    public static class WavRenderer
    {
        public static void RenderAll(string root,string output,Action<string> progress)
        {
            var table=JsonNode.Parse(File.ReadAllText(Path.Combine(root,"src/data/tables/audio.json")))!;
            var scenarios=JsonNode.Parse(File.ReadAllText(Path.Combine(root,"tools/audio/scenarios.json")))!.AsObject();
            Directory.CreateDirectory(output);
            var marker=Path.Combine(output,".incomplete");
            File.WriteAllText(marker,"C# 离线渲染中");
            foreach (var item in table["SFX"]!.AsArray()) Render("sfx", item!["id"]!.ToString());
            foreach (var item in table["MOODS"]!.AsObject()) Render("music",item.Key);
            foreach (var item in scenarios) Render("scenario",item.Key);
            File.Delete(marker);

            void Render(string kind,string id)
            {
                const int rate=48000,channels=2;
                int frames=(kind=="sfx"?3:16)*rate;
                var synth=new Synth(rate,table);
                if (kind!="scenario") synth.SetVolume("amb",0);
                if (kind=="music") synth.SetMusic(id);
                var ops=scenarios[id]?.AsArray();
                int index=0;
                void CommandsAt(int frame)
                {
                    while (ops!=null && index<ops.Count)
                    {
                        var op=ops[index]!;
                        if ((int)Math.Ceiling((int)op["tick"]!*4800/128.0)*128!=frame) break;
                        if (op["scene"] is JsonNode s) synth.SetScene(new SoundScene {
                            Mode=s["mode"]!.ToString(),Region=s["region"]!.ToString(),Staff=(double)s["staff"]!,Heat=(double)s["heat"]!,
                            Racks=(double)s["racks"]!,Month=(int)s["month"]!,Night=(double)s["night"]!,Rain=(double)s["rain"]!,Alert=(bool)s["alert"]! });
                        if (op["flavor"] is JsonNode flavor) synth.SetFlavor(flavor.ToString());
                        if (op["music"] is JsonNode mood) synth.SetMusic(mood.ToString());
                        if (op["volume"] is JsonObject volumes) foreach (var v in volumes) synth.SetVolume(v.Key,(double)v.Value!);
                        if (op["muted"] is JsonNode muted) synth.SetMuted((bool)muted);
                        index++;
                    }
                }
                CommandsAt(0);
                synth.Unlock();
                string name=(kind=="scenario"?id:kind+"-"+id)+".wav";
                using var stream=File.Create(Path.Combine(output,name));
                using var writer=new BinaryWriter(stream);
                void Tag(string s) => writer.Write(Encoding.ASCII.GetBytes(s));
                int bytes=frames*channels*sizeof(float);
                Tag("RIFF"); writer.Write(bytes+36); Tag("WAVE"); Tag("fmt "); writer.Write(16);
                writer.Write((short)3); writer.Write((short)channels); writer.Write(rate); writer.Write(rate*8);
                writer.Write((short)8); writer.Write((short)32); Tag("data"); writer.Write(bytes);
                float[] block=new float[128*channels];
                for (int frame=0;frame<frames;frame+=128)
                {
                    CommandsAt(frame);
                    if (kind=="sfx" && frame==19200) synth.Sfx(id);
                    if (frames-frame<128) block=new float[(frames-frame)*channels];
                    synth.Render(block,channels); foreach (float v in block) writer.Write(v);
                }
                progress(name);
            }
        }
    }
}
