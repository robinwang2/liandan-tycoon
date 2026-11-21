using System;
using System.IO;
using System.Linq;
using Liandan.Shell;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace Liandan.EditorTools
{
    public static class FurnaceShots
    {
        internal static void WriteShot(Camera camera,string folder,string name,Func<Texture2D,bool>? ready=null)
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
                        Debug.LogWarning(name+"：未读到全部 12 行琥珀灯，丢弃本帧");
                    }
                    throw new InvalidOperationException(name+"：连续三帧未通过截图验收，没有写入 PNG");
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
