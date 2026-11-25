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
        [Serializable] class RepairReport { public string source="", refSha=""; }

        static Func<Texture2D,bool> RackLightsVisible(Camera camera, Renderer face, Mesh mesh, int slot)
        {
            // 直接投影灯的世界坐标，不依赖硬编码的截图像素；只验右侧修补件，不借用左侧原模的灯。
            var vertices=mesh.vertices;
            var points=mesh.GetTriangles(slot).Distinct().Select(index=>face.transform.TransformPoint(vertices[index])).ToArray();
            var bottom=points.Min(point=>point.y);
            var centers=points.GroupBy(point=>Mathf.RoundToInt((point.y-bottom)/.15f))
                .Select(row=>row.Aggregate(Vector3.zero,(sum,point)=>sum+point)/row.Count()).ToArray();
            if(centers.Length!=12) throw new InvalidDataException("截图验收找不到 12 行琥珀灯");
            return pixels=>centers.All(center=>
            {
                var pos=camera.WorldToViewportPoint(center);
                int column=Mathf.FloorToInt(pos.x*pixels.width), row=Mathf.FloorToInt(pos.y*pixels.height);
                if(column<3 || row<3 || column>=pixels.width-3 || row>=pixels.height-3 || pos.z<=0) return false;
                for(int dy=-3;dy<=3;dy++) for(int dx=-3;dx<=3;dx++)
                {
                    Color32 color=pixels.GetPixel(column+dx,row+dy);
                    if(color.r>160 && color.g>125 && color.r-color.b>35) return true;
                }
                return false;
            });
        }

        public static void CaptureRepair()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var camera=Whitebox.Create(false,true);
            var folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../Build/art-repair"));
            Directory.CreateDirectory(folder);
            foreach(var id in new[]{"server_rack","tv_wall"})
            {
                var prefix=$"Assets/Art/Props/{id}";
                string game=prefix+"/Editor/RepairReference/GameReference.fbx", dir=$"{prefix}/Resources/Batch1/{id}", repaired=$"{dir}/SM_{id}.fbx";
                foreach(var suffix in new[]{"pair","pair-lod0","pair-lod1","pair-lod2","game-close","close"}) File.Delete(Path.Combine(folder,id+"-"+suffix+".png"));
                var reportPath=dir+"/report.json"; var gameReportPath=prefix+"/Editor/RepairReference/report.json";
                if(!new[]{game,repaired,reportPath,gameReportPath}.All(File.Exists)) { Debug.Log("修补对照缺件，跳过："+id);continue; }
                var report=JsonUtility.FromJson<RepairReport>(File.ReadAllText(reportPath));
                if(report.source!="repaired.glb") { Debug.Log("尚未入库修补版，跳过："+id);continue; }
                if(report.refSha!=JsonUtility.FromJson<RepairReport>(File.ReadAllText(gameReportPath)).refSha) throw new InvalidDataException("参考模型已换版："+id);
                var left=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(game));
                var right=UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(repaired));
                try
                {
                    var group=right.GetComponent<LODGroup>();
                    var levels=group.GetLODs();
                    if(levels.Length!=3 || levels.Any(level=>level.renderers.Length==0)) throw new InvalidDataException("修补件缺少三级 LOD："+id);
                    void SelectLevel(int selected)
                    {
                        group.ForceLOD(selected);
                        // 三个面板位置完全重合；只让选中级的渲染器参与这一帧的离屏请求。
                        for(int index=0;index<levels.Length;index++)
                            foreach(var renderer in levels[index].renderers) renderer.forceRenderingOff=index!=selected;
                    }
                    SelectLevel(0);
                    var box=right.GetComponent<BoxCollider>().bounds;
                    // 用屏幕或 LED 子网格的实际朝向选机位，不猜 FBX 轴转换的符号。
                    string frontSlot=id=="tv_wall"?"M_tv_wall_Screen":"M_server_rack_LED_Amber";
                    var face=group.GetLODs()[0].renderers.First(renderer=>renderer.sharedMaterials.Any(mat=>mat.name==frontSlot));
                    var mesh=face.GetComponent<MeshFilter>().sharedMesh;
                    var slot=Array.FindIndex(face.sharedMaterials,mat=>mat.name==frontSlot);
                    var front=face.transform.TransformPoint(mesh.GetSubMesh(slot).bounds.center);
                    var direction=new Vector3(id=="server_rack"?.22f:.08f,.055f,Mathf.Sign(front.z-box.center.z)).normalized;
                    camera.transform.rotation=Quaternion.LookRotation(-direction);
                    var axis=camera.transform.right;
                    var stage=new Vector3(100,0,100);
                    float separation=box.size.x+.25f;
                    left.transform.position=stage-axis*separation/2; right.transform.position=stage+axis*separation/2;
                    var rackReady=id=="server_rack"?RackLightsVisible(camera,face,mesh,slot):null;
                    void Shot(string suffix, Vector3 focus, float scale, Func<Texture2D,bool>? ready=null)
                    {
                        camera.transform.position=focus+direction*6;camera.orthographicSize=scale;
                        FurnaceShots.WriteShot(camera,folder,id+"-"+suffix,ready,"12 行琥珀灯全部可见");
                    }
                    // 展位距相机 6 米，收紧正交深度范围，避免薄面板在远裁面下争抢深度。
                    camera.nearClipPlane=3;camera.farClipPlane=9;
                    for(int level=0;level<levels.Length;level++)
                    {
                        SelectLevel(level);
                        Shot("pair-lod"+level,stage+box.center,Mathf.Max(box.size.y*.59f,(separation+box.size.x+.2f)*.31f),rackReady);
                    }
                    File.Copy(Path.Combine(folder,id+"-pair-lod0.png"),Path.Combine(folder,id+"-pair.png"));
                    SelectLevel(0);
                    float close=id=="tv_wall"?.55f:.24f;
                    var focus=new Vector3(box.center.x,box.center.y,front.z);
                    left.SetActive(false);Shot("close",right.transform.position+focus,close);
                    right.SetActive(false);left.SetActive(true);Shot("game-close",left.transform.position+focus,close);
                }
                finally { UnityEngine.Object.DestroyImmediate(left);UnityEngine.Object.DestroyImmediate(right); }
            }
            Debug.Log("Liandan repair shots OK: "+folder);
        }

        public static void Capture() => CaptureBatch("Batch1");
        public static void CaptureBatch2() => CaptureBatch("Batch2");
        public static void CaptureBatch3() => CaptureBatch("Batch3");
        public static void CaptureSelectedBatch()
        {
            var args=Environment.GetCommandLineArgs();
            int i=Array.IndexOf(args,"-artSelection");
            if(i<0 || i+1>=args.Length || !System.Text.RegularExpressions.Regex.IsMatch(args[i+1],@"^Batch[1-9]\d*$"))
                throw new ArgumentException("缺少有效的美术批次");
            CaptureBatch(args[i+1]);
        }

        static void SetLamp(Transform node,float intensity)
        {
            var renderer=node.GetComponent<Renderer>();
            var block=new MaterialPropertyBlock();
            for(int slot=0;slot<renderer.sharedMaterials.Length;slot++)
            {
                var mat=renderer.sharedMaterials[slot];
                if(!mat.IsKeywordEnabled("_EMISSION")) throw new InvalidDataException(node.name+" 缺少发光材质");
                renderer.GetPropertyBlock(block,slot);
                block.SetColor("_EmissionColor",mat.GetColor("_EmissionColor")*intensity);
                renderer.SetPropertyBlock(block,slot);
            }
        }

        static void CaptureBatch(string resource)
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var camera=Whitebox.Create(false,true);
            var batch=resource.ToLowerInvariant();
            var folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../Build/art-"+batch));
            Directory.CreateDirectory(folder);
            var failures=new List<string>();var skipped=new List<string>();int passed=0;
            foreach(var item in PropBatch.Selection(resource).props)
            {
                bool hybrid=item.parts?.Length>0;
                string id=item.id, source=$"Assets/Art/Props/{id}/Resources/{resource}/{id}/SM_{id}.fbx";
                GameObject copy=null!;
                try
                {
                    File.Delete(Path.Combine(folder,id+".json"));File.Delete(Path.Combine(folder,id+".png"));
                    if(hybrid) File.Delete(Path.Combine(folder,id+"-action.png"));
                    for (int level = 1; level <= 2; level++)
                        File.Delete(Path.Combine(folder, $"{id}-lod{level}.png"));
                    if(!File.Exists(source)){skipped.Add(id);continue;}
                    var log=AssetImporter.GetImportLog(source);
                    if(log!=null){var errors=log.logEntries.Where(entry=>(entry.flags & ImportLogFlags.Error)!=0).Select(entry=>entry.message).ToArray();
                        if(errors.Length>0)throw new InvalidDataException(string.Join("；",errors));}
                    var placed=PropBatch.PlaceItem(item,resource);
                    if(!placed)throw new InvalidDataException("FBX 已安装，但无法加载："+source);
                    copy=UnityEngine.Object.Instantiate(placed,new Vector3(100,0,100),placed.transform.rotation);
                    var group=copy.GetComponent<LODGroup>();var box=copy.GetComponent<BoxCollider>();
                    if(!group || group.lodCount!=3)throw new InvalidDataException("缺少完整三级 LODGroup");
                    if(!box)throw new InvalidDataException("缺少 BoxCollider");
                    foreach(var lod in group.GetLODs())
                        if(lod.renderers.Length==0 || lod.renderers.Any(renderer=>!renderer || renderer.sharedMaterials.Length==0 || renderer.sharedMaterials.Any(mat=>!mat || mat.shader.name!="Universal Render Pipeline/Lit")))throw new InvalidDataException("LOD 缺少渲染器或 URP/Lit 材质");
                    if(!group.GetLODs()[0].renderers.SelectMany(renderer=>renderer.sharedMaterials).Any(mat=>mat.GetTexture("_BaseMap")))throw new InvalidDataException("LOD0 缺少底色图");
                    group.ForceLOD(0);
                    var levels=group.GetLODs();
                    float xSign=1;
                    if(hybrid)
                    {
                        xSign=PropImport.CheckAssembly(copy,levels,item,Path.Combine(Path.GetDirectoryName(source)!,"report.json"));
                        foreach(var pose in item.actions.Where(action=>action.axis=="emission"))
                            for(int level=0;level<levels.Length;level++)
                                SetLamp(PropBatch.Part(levels[level],id,pose.node,level),pose.rest);
                    }
                    // 与 Blender QC 彩图同侧：Blender 的 (0.75, -1, 0.65) 在标准 FBX 导入后为局部 (0.75, 0.65, -1)。
                    // 混合件按回读枢轴确定轴向。只在静止姿态取景一次，远级和动作图共用同一变换与画幅。
                    var center=box.transform.TransformPoint(box.center);
                    var diagonal=Vector3.Scale(box.size,box.transform.lossyScale).magnitude;
                    var direction=copy.transform.TransformDirection(new Vector3(.75f*xSign,.65f,-xSign)).normalized;
                    camera.transform.position=center+direction*diagonal*2;
                    camera.transform.LookAt(center);
                    camera.orthographicSize=diagonal*.5f*1.08f;
                    using var sha=SHA256.Create();var digest=BitConverter.ToString(sha.ComputeHash(File.ReadAllBytes(Path.Combine(Path.GetDirectoryName(source)!,"report.json")))).Replace("-","").ToLowerInvariant();
                    if(resource!="Batch1" && resource!="Batch2" && passed==0) FurnaceShots.WriteFirstShot(camera,folder,id);
                    else FurnaceShots.WriteShot(camera,folder,id);
                    for (int level = 1; level < group.lodCount; level++)
                    {
                        group.ForceLOD(level);
                        FurnaceShots.WriteShot(camera, folder, $"{id}-lod{level}");
                    }
                    if(hybrid && item.actions.Length>0)
                    {
                        // 旋转轴为轴向量，左右手坐标互转时须再变一次符号。截图只动展位副本。
                        group.ForceLOD(0);
                        foreach(var pose in item.actions)
                        {
                            var node=PropBatch.Part(levels[0],id,pose.node,0);
                            if(pose.axis=="emission"){SetLamp(node,pose.peak);continue;}
                            var axis=pose.axis switch { "x"=>Vector3.left*xSign, "y"=>Vector3.down,
                                "z"=>Vector3.forward*xSign, _=>throw new InvalidDataException("未知动作轴："+pose.axis) };
                            node.Rotate(copy.transform.TransformDirection(axis),pose.degrees,Space.World);
                        }
                        FurnaceShots.WriteShot(camera,folder,id+"-action");
                    }
                    File.WriteAllText(Path.Combine(folder,id+".json"),"{\"reportSha\":\""+digest+"\"}");passed++;
                }
                catch(Exception error){failures.Add(id+"："+error.Message);}
                finally {if(copy)UnityEngine.Object.DestroyImmediate(copy);}
            }
            try {PropBatch.Overview(camera);FurnaceShots.WriteShot(camera,folder,"office");}
            catch(Exception error){failures.Add("office："+error.Message);}
            var summary=$"通过 {passed} 件，未安装 {skipped.Count} 件 [{string.Join(", ",skipped)}]，失败 {failures.Count} 项";
            Debug.Log($"Liandan {batch} shots: "+summary);
            foreach(var reason in failures)Debug.LogError($"Liandan {batch} FAIL: "+reason);
            if(failures.Count>0)throw new InvalidDataException(summary);
            Debug.Log($"Liandan {batch} shots OK: "+folder);
        }
    }
}
