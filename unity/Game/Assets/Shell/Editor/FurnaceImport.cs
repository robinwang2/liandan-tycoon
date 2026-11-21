using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace Liandan.EditorTools
{
    public sealed class FurnaceImport : AssetPostprocessor
    {
        const string Folder = "Assets/Art/Props/Furnace/Resources/Furnaces/";
        bool InPackage => assetPath.StartsWith(Folder, StringComparison.Ordinal);
        string Sibling(string file) => assetPath.Substring(0, assetPath.LastIndexOf('/')+1) + file;

        [Serializable] class Finish
        {
            public string name = "", BaseColor = "", Normal = "", LitMask = "";
            public float metallic = 0, smoothness = 0;
            public float[] baseColor = Array.Empty<float>();
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

        public override uint GetVersion() => 2;
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
            material.SetFloat("_Cull",tripo ? 0 : 2);
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
            if (!InPackage) return;
            foreach (var child in root.GetComponentsInChildren<LODGroup>(true))
                if (child.gameObject != root) UnityEngine.Object.DestroyImmediate(child);
            var group = root.GetComponent<LODGroup>() ?? root.AddComponent<LODGroup>();
            context.DependsOnSourceAsset(PolicyPath);
            var policy = JsonUtility.FromJson<Policy>(File.ReadAllText(PolicyPath));
            var renderers = root.GetComponentsInChildren<MeshRenderer>(true);
            var lods = new LOD[3];
            for (int level=0;level<lods.Length;level++)
            {
                var members = renderers.Where(renderer=>renderer.name.EndsWith("_LOD"+level,StringComparison.Ordinal)).ToArray();
                lods[level] = new LOD(policy.thresholds[level],members);
                if (members.Length==0) { Debug.LogWarning($"{assetPath} 缺少 LOD{level}"); continue; }
                long count = 0;
                Bounds bounds = default; bool first = true;
                foreach (var renderer in members)
                {
                    var mesh = renderer.GetComponent<MeshFilter>().sharedMesh;
                    for (int sub=0;sub<mesh.subMeshCount;sub++) count += mesh.GetIndexCount(sub)/3;
                    var matrix = root.transform.worldToLocalMatrix * renderer.transform.localToWorldMatrix;
                    foreach (var corner in new[]{-1,1}) foreach (var side in new[]{-1,1}) foreach (var end in new[]{-1,1})
                    {
                        var point = matrix.MultiplyPoint3x4(mesh.bounds.center + Vector3.Scale(mesh.bounds.extents,new Vector3(corner,side,end)));
                        if (first) { bounds = new Bounds(point,Vector3.zero); first = false; } else bounds.Encapsulate(point);
                    }
                }
                var delta = bounds.size-policy.size;
                if (count > policy.budgets[level] || Mathf.Max(Mathf.Abs(delta.x),Mathf.Abs(delta.z)) > policy.widthDepthTolerance ||
                    Mathf.Abs(delta.y)>policy.heightTolerance || Mathf.Abs(bounds.min.y)>policy.heightTolerance)
                    Debug.LogWarning($"{assetPath} LOD{level}：{count}/{policy.budgets[level]} 三角面，尺寸 {bounds.size}，底面 {bounds.min.y} 米");
                if (level==0) { var box = root.AddComponent<BoxCollider>(); box.center=bounds.center; box.size=bounds.size; }
            }
            group.SetLODs(lods); group.RecalculateBounds();
        }
    }
}
