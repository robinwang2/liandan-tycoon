using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Unity.Profiling;
using Unity.Profiling.LowLevel.Unsafe;
using UnityEngine;
using UnityEngine.Rendering;

namespace Liandan.Shell
{
    public sealed class PropBenchmark : MonoBehaviour
    {
        const int WarmupFrames=30, SampleFrames=30, MaxAttempts=120;
        const double ModeTimeoutSeconds=20;
        string stage="启动";

        void Stage(string value){stage=value;Debug.Log("Liandan A/B: "+stage);}
        static void Fail(string phase,Exception error){Debug.LogError($"Liandan A/B FAILED: {phase}：{error}");Application.Quit(1);}
        sealed class Counter : IDisposable
        {
            public readonly string metric,name;
            ProfilerRecorder recorder;
            int previous, samples, lastPositive;
            public bool Active {get;private set;}
            public bool Ready=>samples>=SampleFrames && lastPositive>samples-SampleFrames;
            public Counter(string metric,string name,ProfilerRecorderHandle handle){
                this.metric=metric;this.name=name;
                recorder=new ProfilerRecorder(handle,MaxAttempts+8,ProfilerRecorderOptions.StartImmediately|ProfilerRecorderOptions.SumAllSamplesInFrame);
                Active=recorder.Valid && recorder.IsRunning;
            }
            public void Read(StringBuilder csv,string mode,int frame){
                if(!Active)return;
                try{
                    Active=recorder.Valid && recorder.IsRunning;if(!Active)return;
                    int count=recorder.Count;if(count<=previous)return;previous=count;
                    long value=recorder.GetSample(count-1).Value;if(value<0)return;
                    samples++;if(value>0)lastPositive=samples;
                    csv.AppendLine($"{mode},{frame},{metric},{name},{value}");
                }catch(Exception error){Active=false;Debug.LogWarning($"Liandan A/B: {mode} {name} 读取失败：{error}");}
            }
            public void Dispose(){Debug.Log($"Liandan A/B 计数器 {name}: active={Active}, samples={samples}, lastPositive={lastPositive}");recorder.Dispose();}
        }
        static void Discover(List<Counter> counters,string mode){
            var handles=new List<ProfilerRecorderHandle>();ProfilerRecorderHandle.GetAvailable(handles);
            var names=new List<string>();
            foreach(var handle in handles){
                if(!handle.Valid)continue;
                var desc=ProfilerRecorderHandle.GetDescription(handle);string category=desc.Category.Name,name=desc.Name;
                if(category!=ProfilerCategory.Render.Name && category!="Render Pipeline" && !name.StartsWith("Render Pipeline/",StringComparison.OrdinalIgnoreCase))continue;
                names.Add($"{category}/{name} [{desc.UnitType}, {desc.DataType}, {desc.Flags}]");
                string leaf=name.StartsWith("Render Pipeline/",StringComparison.OrdinalIgnoreCase)?name.Substring("Render Pipeline/".Length):name;
                string metric=leaf switch {"Draw Calls Count" or "Draw Calls"=>"draws","SetPass Calls Count" or "SetPass Calls"=>"setpass","Batches Count" or "Total Batches Count" or "Batches" or "Total Batches"=>"batches",_=>""};
                if(metric=="" || (desc.UnitType!=ProfilerMarkerDataUnit.Count && desc.UnitType!=ProfilerMarkerDataUnit.Undefined))continue;
                if(desc.DataType is not (Unity.Profiling.LowLevel.ProfilerMarkerDataType.Int32 or Unity.Profiling.LowLevel.ProfilerMarkerDataType.UInt32 or Unity.Profiling.LowLevel.ProfilerMarkerDataType.Int64 or Unity.Profiling.LowLevel.ProfilerMarkerDataType.UInt64))continue;
                try{counters.Add(new Counter(metric,category+"/"+name,handle));}
                catch(Exception error){Debug.LogWarning($"Liandan A/B: {mode} {category}/{name} 启动失败：{error}");}
            }
            Debug.Log($"Liandan A/B: {mode} Render 名单（{names.Count} 项）");
            foreach(var name in names.OrderBy(value=>value,StringComparer.Ordinal))Debug.Log("Liandan Render: "+name);
        }

        [Serializable] sealed class Structure {
            public string mode="";
            public bool srpBatcher;
            public int renderers,slots,materials,textures,litEligible,excluded,unknown;
        }
        static Structure InspectScene(string mode){
            var stats=new Structure{mode=mode,srpBatcher=GraphicsSettings.useScriptableRenderPipelineBatching};
            var materials=new HashSet<Material>();var textures=new HashSet<Texture>();
            foreach(var renderer in UnityEngine.Object.FindObjectsByType<Renderer>()){
                if(!renderer.enabled || renderer.forceRenderingOff)continue;
                stats.renderers++;var slots=renderer.sharedMaterials;stats.slots+=slots.Length;
                if(!(renderer is MeshRenderer || renderer is SkinnedMeshRenderer) || renderer.HasPropertyBlock())stats.excluded++;
                else if(slots.Length>0 && slots.All(mat=>mat && mat.shader && mat.shader.name=="Universal Render Pipeline/Lit"))stats.litEligible++;
                else stats.unknown++;
                foreach(var mat in slots)if(mat && materials.Add(mat))foreach(int property in mat.GetTexturePropertyNameIDs()){
                    var texture=mat.GetTexture(property);if(texture)textures.Add(texture);
                }
            }
            stats.materials=materials.Count;stats.textures=textures.Count;return stats;
        }
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void ConfigurePlayer()
        {
            if(!Environment.GetCommandLineArgs().Contains("-art-batch1-ab"))return;
            Application.runInBackground=true;
            Debug.Log("Liandan A/B: 启动，允许后台渲染");
        }
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartProbe()
        {
            if(!Environment.GetCommandLineArgs().Contains("-art-batch1-ab"))return;
            try{new GameObject("Batch1 A-B Probe").AddComponent<PropBenchmark>();}
            catch(Exception error){Fail("创建探针",error);}
        }
        IEnumerator Start()
        {
            var probe=Run();
            while(true){object step;try{if(!probe.MoveNext())break;step=probe.Current;}
                catch(Exception error){Fail(stage,error);yield break;}yield return step;}
            Application.Quit(0);
        }
        IEnumerator Run()
        {
            var args=Environment.GetCommandLineArgs();int flag=Array.IndexOf(args,"-art-batch1-ab");
            if(flag<0 || flag+1>=args.Length)throw new ArgumentException("-art-batch1-ab 需要输出目录");
            string folder=Path.GetFullPath(args[flag+1]);Directory.CreateDirectory(folder);
            Stage($"Development={Debug.isDebugBuild}，图形后端={SystemInfo.graphicsDeviceType}");
            if(!Debug.isDebugBuild)throw new InvalidOperationException("不是 Development Build；请重新运行 build-game-art");
            Stage("布置办公室");var camera=Whitebox.Create(false,true);var placed=PropBatch.Place();
            Stage($"{placed.Count} 种道具，准备对照材质");var experiment=new PropAtlas();
            var log=new StringBuilder("模式,帧,指标,计数器,值\n");
            var endOfFrame=new WaitForEndOfFrame();
            var target=RenderTexture.GetTemporary(1280,720,24,RenderTextureFormat.ARGB32);
            try{
                camera.aspect=16f/9;
                foreach(bool atlas in new[]{false,true}){
                    string mode=atlas?"B":"A";Stage($"{mode} 预热");experiment.Switch(atlas);
                    double deadline=Time.realtimeSinceStartupAsDouble+ModeTimeoutSeconds;
                    for(int frame=0;frame<WarmupFrames;frame++){
                        yield return null;
                        if(Time.realtimeSinceStartupAsDouble>=deadline)throw new TimeoutException($"预热 {frame+1}/{WarmupFrames} 帧超时");
                    }
                    File.WriteAllText(Path.Combine(folder,"structure-"+mode+".json"),JsonUtility.ToJson(InspectScene(mode)));
                    Stage($"{mode} 采样");var counters=new List<Counter>();
                    try{
                        try{Discover(counters,mode);}catch(Exception error){Debug.LogWarning($"Liandan A/B: {mode} 枚举失败：{error}");}
                        for(int settle=0;settle<4 && counters.Any(counter=>counter.Active);settle++)yield return null;
                        for(int attempt=0;attempt<MaxAttempts && counters.Any(counter=>counter.Active) && Time.realtimeSinceStartupAsDouble<deadline;attempt++){
                            yield return null;yield return endOfFrame;
                            foreach(var counter in counters)counter.Read(log,mode,attempt);
                            if(counters.Where(counter=>counter.Active).All(counter=>counter.Ready))break;
                        }
                    }finally{foreach(var counter in counters)counter.Dispose();}
                    Stage($"{mode} 截图");camera.targetTexture=target;yield return null;yield return endOfFrame;
                    WriteFrame(target,Path.Combine(folder,"office-"+mode+".png"));camera.targetTexture=null;
                }
            }
            finally{camera.targetTexture=null;RenderTexture.ReleaseTemporary(target);}
            File.WriteAllText(Path.Combine(folder,"draws.csv"),log.ToString());Debug.Log("Liandan batch1 A/B OK: "+folder);
        }
        static void WriteFrame(RenderTexture target,string file)
        {
            var previous=RenderTexture.active;var image=new Texture2D(target.width,target.height,TextureFormat.RGB24,false);
            try{RenderTexture.active=target;image.ReadPixels(new Rect(0,0,target.width,target.height),0,0);image.Apply();File.WriteAllBytes(file,image.EncodeToPNG());}
            finally{RenderTexture.active=previous;Destroy(image);}
        }
    }
}
