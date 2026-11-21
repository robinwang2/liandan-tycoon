using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using Liandan.Shell;

namespace Liandan.EditorTools
{
    public sealed class PropImport : AssetPostprocessor
    {
        const string Folder = "Assets/Art/Props/Furnace/Resources/Furnaces/";
        bool Furnace => assetPath.StartsWith(Folder, StringComparison.Ordinal);
        bool Batch => assetPath.StartsWith("Assets/Art/Props/",StringComparison.Ordinal) && assetPath.Contains("/Resources/Batch1/");
        bool Reference => assetPath.StartsWith("Assets/Art/Props/",StringComparison.Ordinal) && assetPath.Contains("/Editor/RepairReference/");
        bool InPackage => Furnace || Batch || Reference;
        string Sibling(string file) => assetPath.Substring(0, assetPath.LastIndexOf('/')+1) + file;

        [Serializable] class Finish
        {
            public string name = "", BaseColor = "", Normal = "", LitMask = "";
            public float metallic = 0, smoothness = 0;
            public float[] baseColor = Array.Empty<float>();
            public float[] emission = Array.Empty<float>();
        }
        [Serializable] class Report { public Finish[] materials = Array.Empty<Finish>(); }
        // 独立于模型实测值的验收配置；屏占比比世界距离更适合正交相机。
        const string PolicyPath = "Assets/Shell/Editor/FurnacePolicy.json";
        [Serializable] class Policy
        {
            public int[] budgets = Array.Empty<int>();
            public float[] thresholds = Array.Empty<float>();
            public Vector3 size = Vector3.zero;
            public float widthDepthTolerance = 0, heightTolerance = 0;
        }

        public override uint GetVersion() => 7;
        void OnPreprocessTexture()
        {
            if (!InPackage) return;
            var importer = (TextureImporter)assetImporter;
            importer.sRGBTexture = assetPath.EndsWith("_BaseColor.png", StringComparison.Ordinal);
            if (importer.sRGBTexture) importer.alphaSource = TextureImporterAlphaSource.None;
            if (assetPath.EndsWith("_Normal.png", StringComparison.Ordinal)) importer.textureType = TextureImporterType.NormalMap;
            if (assetPath.Contains("/Original/")) importer.mipmapEnabled = false;
        }
        void OnPreprocessModel()
        {
            if (!InPackage) return;
            var importer = (ModelImporter)assetImporter;
            if (Batch) importer.isReadable = true; // 开发对照需要在内存中重排 UV。
            importer.globalScale = 1; importer.useFileScale = true; importer.bakeAxisConversion = true;
            importer.importNormals = ModelImporterNormals.Import;
            importer.importTangents = ModelImporterTangents.CalculateMikk;
            importer.importAnimation = false; importer.addCollider = false;
            importer.materialLocation = ModelImporterMaterialLocation.InPrefab;
            importer.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
            importer.materialName = ModelImporterMaterialName.BasedOnMaterialName;
        }
        void OnPostprocessMaterial(Material material)
        {
            if (!InPackage) return;
            material.shader = Shader.Find("Universal Render Pipeline/Lit");
            bool tripo = assetPath.Contains("/Tripo/");
            // 不继承 FBX 标准材质的透明、高光工作流或底色 alpha。开口壳片无法可靠判定内外，Tripo 源也明确要求双面。
            material.shaderKeywords = Array.Empty<string>();
            material.SetFloat("_Surface",0); material.SetFloat("_AlphaClip",0);
            material.SetFloat("_SrcBlend",1); material.SetFloat("_DstBlend",0);
            material.SetFloat("_SrcBlendAlpha",1); material.SetFloat("_DstBlendAlpha",0);
            material.SetFloat("_ZWrite",1); material.SetFloat("_WorkflowMode",1);
            material.SetFloat("_SmoothnessTextureChannel",0);
            material.SetFloat("_Cull",tripo || Batch ? 0 : 2);
            material.SetOverrideTag("RenderType","Opaque"); material.renderQueue=2000;
            string report = Sibling("report.json");
            context.DependsOnSourceAsset(report);
            var finish = File.Exists(report) ? JsonUtility.FromJson<Report>(File.ReadAllText(report)).materials.FirstOrDefault(rec=>rec.name==material.name) : null;
            if (finish == null) throw new InvalidDataException($"{assetPath} 缺少 {material.name} 的材质记录，不能回退到 FBX 默认材质");
            Texture2D Load(string file)
            {
                string path = Sibling(file);
                context.DependsOnArtifact(path);
                var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
                if (!tex) Debug.LogWarning($"{assetPath} 缺少贴图 {path}");
                return tex!;
            }
            if (finish.baseColor.Length == 4) material.SetColor("_BaseColor", new Color(finish.baseColor[0],finish.baseColor[1],finish.baseColor[2],1).gamma);
            if (finish.emission.Length==3 && finish.emission.Any(value=>value>0))
            {
                material.SetColor("_EmissionColor",new Color(finish.emission[0],finish.emission[1],finish.emission[2]).gamma);
                material.EnableKeyword("_EMISSION");
            }
            bool bronze = tripo && string.IsNullOrEmpty(finish.LitMask);
            material.SetFloat("_Metallic",bronze ? .25f : finish.metallic);
            material.SetFloat("_Smoothness",bronze ? .32f : finish.smoothness);
            if (!string.IsNullOrEmpty(finish.BaseColor)) material.SetTexture("_BaseMap",Load(finish.BaseColor));
            if (!string.IsNullOrEmpty(finish.Normal)) { material.SetTexture("_BumpMap",Load(finish.Normal)); material.EnableKeyword("_NORMALMAP"); }
            if (!string.IsNullOrEmpty(finish.LitMask))
            {
                var mask = Load(finish.LitMask);
                material.SetTexture("_MetallicGlossMap",mask); material.SetTexture("_OcclusionMap",mask);
                material.SetFloat("_Smoothness",1); material.EnableKeyword("_METALLICSPECGLOSSMAP"); material.EnableKeyword("_OCCLUSIONMAP");
            }
        }
        void OnPostprocessModel(GameObject root)
        {
            if (!InPackage || Reference) return;
            foreach (var child in root.GetComponentsInChildren<LODGroup>(true))
                if (child.gameObject != root) UnityEngine.Object.DestroyImmediate(child);
            var group = root.GetComponent<LODGroup>() ?? root.AddComponent<LODGroup>();
            Policy policy; string origin="bottom"; PropBatch.Config config=null!;
            if (Batch)
            {
                context.DependsOnSourceAsset(PropBatch.PolicyPath);
                config=JsonUtility.FromJson<PropBatch.Config>(File.ReadAllText(PropBatch.PolicyPath));
                var item=config.props.Single(prop=>prop.id==assetPath.Split('/')[3]); origin=item.origin;
                if(item.budget==0)
                {
                    const string art="Assets/StreamingAssets/tables/art.json";
                    context.DependsOnSourceAsset(art);
                    item=JsonUtility.FromJson<PropBatch.Table>(File.ReadAllText(art)).PROPS.Single(prop=>prop.id==item.id);
                }
                policy=new Policy { thresholds=config.thresholds,size=new Vector3(item.w,item.h,item.d),budgets=config.lodRules.Select(rule=>(item.budget*rule.budgetPercent+99)/100).ToArray() };
            }
            else { context.DependsOnSourceAsset(PolicyPath); policy=JsonUtility.FromJson<Policy>(File.ReadAllText(PolicyPath)); }
            var renderers = root.GetComponentsInChildren<MeshRenderer>(true);
            var lods = new LOD[3];
            for (int level=0;level<lods.Length;level++)
            {
                var members = renderers.Where(renderer=>renderer.name.EndsWith("_LOD"+level,StringComparison.Ordinal)).ToArray();
                lods[level] = new LOD(policy.thresholds[level],members);
                if (members.Length==0) { if(Batch)throw new InvalidDataException($"{assetPath} 缺少 LOD{level}"); Debug.LogWarning($"{assetPath} 缺少 LOD{level}"); continue; }
                long count = 0;
                Bounds bounds = default; bool first = true;
                foreach (var renderer in members)
                {
                    var mesh = renderer.GetComponent<MeshFilter>().sharedMesh;
                    for (int sub=0;sub<mesh.subMeshCount;sub++) count += mesh.GetIndexCount(sub)/3;
                    var matrix = root.transform.worldToLocalMatrix * renderer.transform.localToWorldMatrix;
                    if(Batch){
                        var vertices=mesh.vertices;
                        foreach(var index in mesh.triangles.Distinct()){var point=matrix.MultiplyPoint3x4(vertices[index]);if(first){bounds=new Bounds(point,Vector3.zero);first=false;}else bounds.Encapsulate(point);}
                        continue;
                    }
                    foreach (var corner in new[]{-1,1}) foreach (var side in new[]{-1,1}) foreach (var end in new[]{-1,1})
                    {
                        var point = matrix.MultiplyPoint3x4(mesh.bounds.center + Vector3.Scale(mesh.bounds.extents,new Vector3(corner,side,end)));
                        if (first) { bounds = new Bounds(point,Vector3.zero); first = false; } else bounds.Encapsulate(point);
                    }
                }
                var delta = bounds.size-policy.size;
                if(Batch)
                {
                    var rule=config.lodRules[level];var errors=new List<string>();
                    void Check(string label,float actual,float target,float limit){if(!(Mathf.Abs(actual-target)<=limit+config.epsilon))errors.Add($"{label}={actual:F5}，目标 {target:F5} ± {limit:F4} m");}
                    if(count<=0 || count>policy.budgets[level])errors.Add($"三角面 {count}，预算 {policy.budgets[level]}");
                    Check("宽",bounds.size.x,policy.size.x,rule.widthDepth);Check("深",bounds.size.z,policy.size.z,rule.widthDepth);Check("高",bounds.size.y,policy.size.y,rule.height);
                    Check("横向中心",bounds.center.x,0,rule.center);
                    if(origin=="wall")Check("贴墙面 max.z",bounds.max.z,0,rule.contact);else Check("深度中心",bounds.center.z,0,rule.center);
                    Check("高度锚点",origin=="ceiling"?bounds.max.y:bounds.min.y,0,rule.contact);
                    if(errors.Count>0){var reason=$"{assetPath} LOD{level} ({origin})：{string.Join("；",errors)}";context.LogImportError(reason);throw new InvalidDataException(reason);}
                }
                else if (count > policy.budgets[level] || Mathf.Max(Mathf.Abs(delta.x),Mathf.Abs(delta.z)) > policy.widthDepthTolerance ||
                    Mathf.Abs(delta.y)>policy.heightTolerance || Mathf.Abs(bounds.min.y)>policy.heightTolerance)
                {
                    string reason=$"{assetPath} LOD{level}：{count}/{policy.budgets[level]} 三角面，尺寸 {bounds.size}，原点 {origin}，范围 {bounds}";
                    Debug.LogWarning(reason);
                }
                if (level==0) { var box = root.AddComponent<BoxCollider>(); box.center=bounds.center; box.size=bounds.size; }
            }
            group.SetLODs(lods); group.RecalculateBounds();
        }
    }
}
