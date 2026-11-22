using System;
using System.IO;
using System.Linq;
using Liandan.Shell;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace Liandan.EditorTools
{
    public static class FurnaceShots
    {
        // 新场景的第一个离屏请求也会初始化 URP。同机位、同姿势连续两帧稳定才写首图。
        internal static void WriteFirstShot(Camera camera,string folder,string name)
        {
            byte[] previous=Array.Empty<byte>();
            bool Stable(Texture2D frame)
            {
                var current=frame.GetRawTextureData(); // 独立的 RGB24 副本，下一次 ReadPixels 不会覆盖它。
                var last=previous;
                previous=current;
                if(last.Length==0) return false;
                // 容许少量边缘像素抖动；车身整体变色时须重新渲染。
                int changed=0, limit=frame.width*frame.height/1000;
                for(int i=0;i<current.Length;i+=3)
                {
                    if(Math.Abs(current[i]-last[i])<=2 && Math.Abs(current[i+1]-last[i+1])<=2 &&
                        Math.Abs(current[i+2]-last[i+2])<=2) continue;
                    if(++changed>limit) return false;
                }
                return true;
            }

            bool allowAsync=ShaderUtil.allowAsyncCompilation;
            try
            {
                ShaderUtil.allowAsyncCompilation=false;
                WriteShot(camera,folder,name,Stable,"连续两帧静止画面稳定");
            }
            finally { ShaderUtil.allowAsyncCompilation=allowAsync; }
        }

        internal static void WriteShot(Camera camera,string folder,string name,Func<Texture2D,bool>? ready=null,string condition="截图验收")
            {
                var target = RenderTexture.GetTemporary(1280,720,24,RenderTextureFormat.ARGB32);
                var previous = RenderTexture.active;
                var pixels = new Texture2D(target.width,target.height,TextureFormat.RGB24,false);
                try
                {
                    camera.aspect = 16f/9;
                    camera.targetTexture = target;
                    var request = new RenderPipeline.StandardRequest { destination=target };
                    if (!RenderPipeline.SupportsRenderRequest(camera,request)) throw new InvalidOperationException("丹炉截图需要已配置的 URP 和可用的图形设备");
                    for(int attempt=0;attempt<3;attempt++)
                    {
                        RenderPipeline.SubmitRenderRequest(camera,request);
                        RenderTexture.active=target;
                        pixels.ReadPixels(new Rect(0,0,target.width,target.height),0,0); pixels.Apply();
                        if(ready==null || ready(pixels))
                        {
                            File.WriteAllBytes(Path.Combine(folder,name+".png"),pixels.EncodeToPNG());
                            return;
                        }
                        Debug.Log(name+"：本帧未满足「"+condition+"」，丢弃本帧");
                    }
                    throw new InvalidOperationException(name+"：三帧内未满足「"+condition+"」，没有写入 PNG");
                }
                finally
                {
                    camera.targetTexture=null; RenderTexture.active=previous;
                    UnityEngine.Object.DestroyImmediate(pixels); RenderTexture.ReleaseTemporary(target);
                }
            }
        public static void Capture()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var camera = Whitebox.Create(false);
            var folder = Path.GetFullPath(Path.Combine(Application.dataPath,"../Build/art-furnace"));
            Directory.CreateDirectory(folder);
            void Shot(string name)=>WriteShot(camera,folder,name);
            foreach (bool original in new[]{true,false})
            {
                var instance = Whitebox.PlaceFurnace(original);
                if (!instance) throw new FileNotFoundException("缺少本地丹炉模型，请先规范化："+(original?"Original":"Tripo"));
                var group = instance.GetComponent<LODGroup>();
                if (!group || group.lodCount!=3 || Array.Exists(group.GetLODs(),lod=>lod.renderers.Length==0))
                    throw new InvalidOperationException("丹炉导入缺少完整的三级 LOD："+instance.name);
                var finishes = group.GetLODs()[0].renderers.SelectMany(renderer=>renderer.sharedMaterials).Distinct().ToArray();
                if (!instance.GetComponent<BoxCollider>() || finishes.Length==0 ||
                    finishes.Any(material=>!material || material.shader.name!="Universal Render Pipeline/Lit") ||
                    !finishes.Any(material=>material.GetTexture("_BaseMap")))
                    throw new InvalidOperationException("丹炉缺少盒碰撞、URP/Lit 或底色图："+instance.name);
                group.ForceLOD(0);
                if (!original && finishes.Any(mat=>mat.GetFloat("_Surface")!=0 || mat.GetFloat("_AlphaClip")!=0 ||
                    mat.GetFloat("_Cull")!=0 || mat.GetFloat("_ZWrite")!=1 ||
                    (!mat.GetTexture("_MetallicGlossMap") && (!Mathf.Approximately(mat.GetFloat("_Metallic"),.25f) ||
                        !Mathf.Approximately(mat.GetFloat("_Smoothness"),.32f)))))
                    throw new InvalidOperationException("Tripo 炉未应用不透明双面铜材质，请检查 FBX 导入日志");
                Shot(original?"original":"tripo");
                if (!original)
                {
                    var focus=Whitebox.FurnacePosition+Vector3.up*1.6f;
                    camera.transform.position=focus+new Vector3(3,2.2f,5); camera.transform.LookAt(focus);
                    camera.orthographicSize=2.2f; Shot("tripo-close");
                    camera.transform.position=focus+Vector3.forward*6; camera.transform.LookAt(focus); Shot("tripo-front");
                    camera.transform.position=focus+new Vector3(0,4,-6); camera.transform.LookAt(focus); Shot("tripo-back-high");
                }
                UnityEngine.Object.DestroyImmediate(instance);
            }
            Debug.Log("Liandan furnace shots OK: "+folder);
        }
    }
}
