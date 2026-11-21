using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using UnityEngine;
using UnityEngine.Rendering;

namespace Liandan.Shell
{
    // 只在验收场景使用：A/B 同为不透明、双面、仅底色，避免把着色功能差别误判为合批收益。
    public sealed class PropAtlas
    {
        [Serializable] class Layout { public Tile[] tiles=Array.Empty<Tile>(); }
        [Serializable] class Tile { public string id="",name="",fingerprint=""; public int page=0; public float x=0,y=0,size=0; }
        readonly List<Action<bool>> changes=new List<Action<bool>>();
        public void Switch(bool atlas){foreach(var change in changes)change(atlas);}

        public PropAtlas(string resource="Batch1")
        {
            var atlasFolder=resource=="Batch1"?"BatchAtlas":resource+"Atlas";
            var layout=Resources.Load<TextAsset>(atlasFolder+"/layout");if(!layout)throw new InvalidOperationException("请先运行 atlas.mjs");
            var tiles=JsonUtility.FromJson<Layout>(layout.text).tiles.ToDictionary(tile=>tile.name);
            var pages=new Dictionary<int,Material>();var singles=new Dictionary<Material,Material>();var meshes=new Dictionary<Mesh,Mesh>();
            var checkedIds=new HashSet<string>();
            Material Finish(Texture texture,Color color)
            {
                var material=new Material(Shader.Find("Universal Render Pipeline/Lit"));material.SetColor("_BaseColor",color);material.SetTexture("_BaseMap",texture);material.SetFloat("_Cull",0);material.SetFloat("_Smoothness",.25f);material.enableInstancing=true;return material;
            }
            foreach(var group in UnityEngine.Object.FindObjectsByType<LODGroup>())
            {
                if(!group.name.StartsWith("SM_",StringComparison.Ordinal))continue;
                foreach(var renderer in group.GetComponentsInChildren<MeshRenderer>())
                {
                    var filter=renderer.GetComponent<MeshFilter>();var original=filter.sharedMesh;var materials=renderer.sharedMaterials;
                    var mapped=materials.Select(material=>tiles.TryGetValue(material.name,out var tile)?tile:throw new InvalidOperationException("图集缺材质："+material.name)).ToArray();
                    foreach(var tile in mapped)
                    {
                        if(checkedIds.Add(tile.id)){
                            var report=Resources.Load<TextAsset>($"{resource}/{tile.id}/report");using var sha=SHA256.Create();
                            if(!report || BitConverter.ToString(sha.ComputeHash(report.bytes)).Replace("-","").ToLowerInvariant()!=tile.fingerprint)throw new InvalidOperationException("图集过期："+tile.id);
                        }
                        if(!pages.ContainsKey(tile.page)){
                            var texture=Resources.Load<Texture2D>(atlasFolder+"/page"+tile.page+"_BaseColor");if(!texture)throw new InvalidOperationException("缺图集页 "+tile.page);pages.Add(tile.page,Finish(texture,Color.white));
                        }
                    }
                    foreach(var material in materials)if(!singles.ContainsKey(material))singles.Add(material,Finish(material.GetTexture("_BaseMap"),material.GetColor("_BaseColor")));
                    if(!meshes.TryGetValue(original,out var remapped)){remapped=Remap(original,mapped);meshes.Add(original,remapped);}
                    var independent=materials.Select(material=>singles[material]).ToArray();var shared=mapped.Select(tile=>pages[tile.page]).ToArray();
                    changes.Add(atlas=>{filter.sharedMesh=atlas?remapped:original;renderer.sharedMaterials=atlas?shared:independent;});
                }
            }
            if(changes.Count==0)throw new InvalidOperationException("没有可对照的道具"); Switch(false);
        }
        static Mesh Remap(Mesh source,Tile[] tiles)
        {
            var positions=source.vertices;var normals=source.normals;var uvs=source.uv;
            var output=new Mesh {name=source.name+"_Atlas",indexFormat=IndexFormat.UInt32};
            var vertices=new List<Vector3>();var directions=new List<Vector3>();var coords=new List<Vector2>();var parts=new List<int[]>();
            for(int sub=0;sub<source.subMeshCount;sub++){
                var tile=tiles[sub];var indices=source.GetTriangles(sub);var seen=new Dictionary<int,int>();
                for(int index=0;index<indices.Length;index++){
                    int old=indices[index];if(!seen.TryGetValue(old,out var mapped)){
                        mapped=vertices.Count;seen.Add(old,mapped);var uv=uvs.Length==0?Vector2.zero:uvs[old];
                        if(uv.x<-.001f||uv.x>1.001f||uv.y<-.001f||uv.y>1.001f)throw new InvalidOperationException("重复铺贴 UV 需先烘焙："+source.name);
                        vertices.Add(positions[old]);directions.Add(normals[old]);coords.Add(new Vector2(tile.x+Mathf.Clamp01(uv.x)*tile.size,tile.y+Mathf.Clamp01(uv.y)*tile.size));
                    }indices[index]=mapped;
                }parts.Add(indices);
            }
            output.SetVertices(vertices);output.SetNormals(directions);output.SetUVs(0,coords);output.subMeshCount=parts.Count;
            for(int sub=0;sub<parts.Count;sub++)output.SetTriangles(parts[sub],sub);output.bounds=source.bounds;return output;
        }
    }
}
