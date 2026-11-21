using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using Liandan.Shell;
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Liandan.EditorTools
{
    public static class PropShots
    {
        public static void Capture()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var camera=Whitebox.Create(false,true);
            var folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../Build/art-batch1"));
            Directory.CreateDirectory(folder);
            var failures=new List<string>();var skipped=new List<string>();int passed=0;
            foreach(var item in PropBatch.Policy.props)
            {
                string id=item.id, source=$"Assets/Art/Props/{id}/Resources/Batch1/{id}/SM_{id}.fbx";
                GameObject copy=null!;
                try
                {
                    File.Delete(Path.Combine(folder,id+".json"));File.Delete(Path.Combine(folder,id+".png"));
                    if(!File.Exists(source)){skipped.Add(id);continue;}
                    var log=AssetImporter.GetImportLog(source);
                    if(log!=null){var errors=log.logEntries.Where(entry=>(entry.flags & ImportLogFlags.Error)!=0).Select(entry=>entry.message).ToArray();
                        if(errors.Length>0)throw new InvalidDataException(string.Join("；",errors));}
                    var placed=PropBatch.PlaceItem(item);
                    if(!placed)throw new InvalidDataException("FBX 已安装，但无法加载："+source);
                    copy=UnityEngine.Object.Instantiate(placed,new Vector3(100,0,100),Quaternion.identity);
                    var group=copy.GetComponent<LODGroup>();var box=copy.GetComponent<BoxCollider>();
                    if(!group || group.lodCount!=3)throw new InvalidDataException("缺少完整三级 LODGroup");
                    if(!box)throw new InvalidDataException("缺少 BoxCollider");
                    foreach(var lod in group.GetLODs())
                        if(lod.renderers.Length==0 || lod.renderers.Any(renderer=>!renderer || renderer.sharedMaterials.Length==0 || renderer.sharedMaterials.Any(mat=>!mat || mat.shader.name!="Universal Render Pipeline/Lit")))throw new InvalidDataException("LOD 缺少渲染器或 URP/Lit 材质");
                    if(!group.GetLODs()[0].renderers.SelectMany(renderer=>renderer.sharedMaterials).Any(mat=>mat.GetTexture("_BaseMap")))throw new InvalidDataException("LOD0 缺少底色图");
                    group.ForceLOD(0);var bounds=box.bounds;camera.transform.position=bounds.center+new Vector3(.65f,.5f,1)*bounds.size.magnitude*2;camera.transform.LookAt(bounds.center);camera.orthographicSize=bounds.extents.magnitude*1.08f;
                    using var sha=SHA256.Create();var digest=BitConverter.ToString(sha.ComputeHash(File.ReadAllBytes(Path.Combine(Path.GetDirectoryName(source)!,"report.json")))).Replace("-","").ToLowerInvariant();
                    FurnaceShots.WriteShot(camera,folder,id);
                    File.WriteAllText(Path.Combine(folder,id+".json"),"{\"reportSha\":\""+digest+"\"}");passed++;
                }
                catch(Exception error){failures.Add(id+"："+error.Message);}
                finally {if(copy)UnityEngine.Object.DestroyImmediate(copy);}
            }
            try {PropBatch.Overview(camera);FurnaceShots.WriteShot(camera,folder,"office");}
            catch(Exception error){failures.Add("office："+error.Message);}
            var summary=$"通过 {passed} 件，未安装 {skipped.Count} 件 [{string.Join(", ",skipped)}]，失败 {failures.Count} 项";
            Debug.Log("Liandan batch1 shots: "+summary);
            foreach(var reason in failures)Debug.LogError("Liandan batch1 FAIL: "+reason);
            if(failures.Count>0)throw new InvalidDataException(summary);
            Debug.Log("Liandan batch1 shots OK: "+folder);
        }
    }
}
