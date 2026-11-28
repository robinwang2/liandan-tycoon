using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using UnityEngine;
using UnityEngine.Rendering;

namespace Liandan.Shell
{
    public sealed partial class Office : MonoBehaviour
    {
        [Serializable] public class Pose
        {
            public float[] p=null!, q=null!, s=null!;
            public void Apply(Transform dest)
            {
                dest.localPosition = new Vector3(p[0],p[1],p[2]);
                dest.localRotation = new Quaternion(q[0],q[1],q[2],q[3]);
                dest.localScale = new Vector3(s[0],s[1],s[2]);
            }
        }
        [Serializable] public class Bin { public int mat; public string key=""; }
        [Serializable] public class Part : Pose { public string name=""; public int parent; public Bin[] bins=null!; }
        [Serializable] public class Model { public string key=""; public Part[] parts=null!; }
        [Serializable] public class Surface
        {
            public string color="",glow="",texture="";
            public float alpha,metal,smooth,power;
            public bool doubleSide,transparent;
        }
        [Serializable] public class Item : Pose { public string id="",resource="",model=""; public int seed; public float halfLength; }
        [Serializable] public class Seat : Pose { public string role="",pose=""; public int slot; }
        [Serializable] public class ActorModel { public string key="",model=""; }
        [Serializable] public class Pivot { public string resource="",node=""; public float x,z; }
        [Serializable] public class Layout
        {
            public string region="",district="",track="",shell="",street="",cable="",eggCable="";
            public int level,floor,floors;
            public float w,d,h,target;
            public float floorHeight,groundY;
            public string traffic="",delivery="";
            public Item egg=null!;
            public Item[] instances=null!;
            public Seat[] actors=null!;
        }
        [Serializable] public class Catalog
        {
            public int version;
            public Layout[] layouts=null!;
            public Model[] models=null!;
            public Surface[] materials=null!;
            public ActorModel[] actorModels=null!;
            public Pivot[] pivots=null!;
            public Street[] traffic=null!;
            public Delivery[] deliveries=null!;
            public Binding[] bindings=null!;
        }

        string Folder => Path.Combine(Application.streamingAssetsPath,"office");
        Camera view=null!;
        Catalog catalog=null!;
        Dictionary<string,Model> models=null!;
        Dictionary<string,string> actorModels=null!;
        Dictionary<string,Pivot> pivots=null!;
        readonly Dictionary<string,(GameObject asset,bool turn)> stock=new();
        readonly Dictionary<string,Mesh> meshes=new();
        readonly Dictionary<int,Material> materials=new();
        readonly Dictionary<string,Texture2D> textures=new();
        readonly List<(GameObject obj,int index)> racks=new();
        GameObject room=null!,team=null!,cables=null!,core=null!;
        Layout active=null!;
        public int Floors => active.floors;
        object? currentSession;
        bool ownModel,title;
        Rect viewport=new Rect(0,0,1,1);

        public void Initialize(Camera camera)
        {
            view=camera;
            block=new MaterialPropertyBlock();
            string file=Path.Combine(Folder,"layouts.json");
            if(!File.Exists(file))throw new FileNotFoundException("缺少办公室场景包，请运行 node tools/unity/export-office.mjs",file);
            catalog=JsonUtility.FromJson<Catalog>(File.ReadAllText(file));
            if(catalog.version!=4)throw new InvalidDataException("办公室场景包版本不匹配，请重新导出");
            models=catalog.models.ToDictionary(model=>model.key);
            actorModels=catalog.actorModels.ToDictionary(row=>row.key,row=>row.model);
            pivots=catalog.pivots.ToDictionary(row=>row.resource);
            bindings=catalog.bindings.ToDictionary(row=>row.resource,row=>row.actions);
        }

        static void Release(UnityEngine.Object obj)
        {
            if(Application.isPlaying)Destroy(obj);
            else DestroyImmediate(obj);
        }

        static void Remove(GameObject? obj)
        {
            if(!obj)return;
            obj!.SetActive(false);
            Release(obj);
        }

        static GameObject Child(string name,Transform parent)
        {
            var obj=new GameObject(name);
            obj.transform.SetParent(parent,false);
            return obj;
        }

        static Color ColorOf(string hex)
        {
            if(!ColorUtility.TryParseHtmlString("#"+hex,out var color))throw new InvalidDataException(hex);
            return color;
        }

        Material SurfaceAt(int index)
        {
            if(materials.TryGetValue(index,out var cached))return cached;
            var spec=catalog.materials[index];
            var mat=new Material(GameShell.Required<Material>("Whitebox")){enableInstancing=true};
            var color=ColorOf(spec.color);
            color.a=spec.alpha;
            mat.SetColor("_BaseColor",color);
            mat.SetFloat("_Smoothness",spec.smooth);
            mat.SetFloat("_Metallic",spec.metal);
            if(spec.doubleSide)mat.SetFloat("_Cull",(int)CullMode.Off);
            if(spec.transparent)
            {
                mat.SetFloat("_Surface",1);
                mat.SetFloat("_SrcBlend",(int)BlendMode.SrcAlpha);
                mat.SetFloat("_DstBlend",(int)BlendMode.OneMinusSrcAlpha);
                mat.SetFloat("_ZWrite",0);
                mat.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
                mat.SetOverrideTag("RenderType","Transparent");
                mat.renderQueue=(int)RenderQueue.Transparent;
                mat.SetShaderPassEnabled("ShadowCaster",false);
            }
            if(spec.texture!="")
            {
                if(!textures.TryGetValue(spec.texture,out var tex))
                {
                    tex=new Texture2D(2,2,TextureFormat.RGBA32,true);
                    if(!tex.LoadImage(File.ReadAllBytes(Path.Combine(Folder,spec.texture+".png")),true))
                        throw new InvalidDataException(spec.texture);
                    textures.Add(spec.texture,tex);
                }
                mat.SetTexture("_BaseMap",tex);
                mat.SetTexture("_EmissionMap",tex);
            }
            if(spec.glow!="000000" && spec.power>0)
            {
                mat.EnableKeyword("_EMISSION");
                mat.SetColor("_EmissionColor",ColorOf(spec.glow)*spec.power);
            }
            return materials[index]=mat;
        }

        Mesh MeshAt(string key)
        {
            if(meshes.TryGetValue(key,out var cached))return cached;
            using var file=File.OpenRead(Path.Combine(Folder,key+".mesh.gz"));
            using var gzip=new GZipStream(file,CompressionMode.Decompress);
            using var buffer=new MemoryStream();
            gzip.CopyTo(buffer);
            buffer.Position=0;
            using var reader=new BinaryReader(buffer);
            int vertices=reader.ReadInt32(),indices=reader.ReadInt32();
            if(vertices<=0 || indices<=0 || 8L+32L*vertices+4L*indices!=buffer.Length)throw new InvalidDataException(key);
            var pos=new Vector3[vertices];
            var normals=new Vector3[vertices];
            var uv=new Vector2[vertices];
            for(int i=0;i<vertices;i++)
            {
                pos[i]=new Vector3(reader.ReadSingle(),reader.ReadSingle(),reader.ReadSingle());
                normals[i]=new Vector3(reader.ReadSingle(),reader.ReadSingle(),reader.ReadSingle());
                uv[i]=new Vector2(reader.ReadSingle(),reader.ReadSingle());
            }
            var tris=new int[indices];
            Buffer.BlockCopy(buffer.GetBuffer(),(int)buffer.Position,tris,0,indices*4);
            var mesh=new Mesh{name=key,indexFormat=vertices>65535?IndexFormat.UInt32:IndexFormat.UInt16,
                vertices=pos,normals=normals,uv=uv,triangles=tris};
            mesh.UploadMeshData(true);
            return meshes[key]=mesh;
        }

        GameObject AddModel(string key,string name,Transform parent,Look? look=null)
        {
            var parts=models[key].parts;
            var nodes=new Transform[parts.Length];
            for(int i=0;i<parts.Length;i++)
            {
                var part=parts[i];
                var obj=Child(i==0?name:part.name,part.parent<0?parent:nodes[part.parent]);
                part.Apply(obj.transform);
                nodes[i]=obj.transform;
                foreach(var bin in part.bins)
                {
                    var surface=part.bins.Length==1?obj:Child("surface",obj.transform);
                    surface.AddComponent<MeshFilter>().sharedMesh=MeshAt(bin.key);
                    var renderer=surface.AddComponent<MeshRenderer>();
                    renderer.sharedMaterial=SurfaceAt(bin.mat);
                    if(look.HasValue)TintActor(renderer,catalog.materials[bin.mat].color,look.Value);
                }
            }
            return nodes[0].gameObject;
        }

        GameObject AddItem(Item item,Transform parent)
        {
            (GameObject asset,bool turn) prefab=default;
            if(item.resource!="" && !stock.TryGetValue(item.resource,out prefab))
            {
                prefab.asset=Resources.Load<GameObject>(item.resource);
                var lod=prefab.asset?prefab.asset.GetComponent<LODGroup>():null;
                if(!lod || lod!.lodCount!=3)
                {
                    Debug.LogWarning("缺少已完成三级 LOD 导入的 "+item.resource+"，改用网页网格");
                    prefab.asset=null!;
                }
                else if(pivots.TryGetValue(item.resource,out var probe))
                {
                    var node=prefab.asset!.GetComponentsInChildren<Transform>(true).FirstOrDefault(t=>t.name==probe.node);
                    if(node)
                    {
                        var point=prefab.asset.transform.InverseTransformPoint(node!.position);
                        prefab.turn=point.x*probe.x+point.z*probe.z<0;
                    }
                }
                stock[item.resource]=prefab;
            }
            // Keep the web placement separate from the imported FBX axis correction.
            var obj=prefab.asset?Child(item.id,parent):AddModel(item.model,item.id,parent);
            obj.name=item.id;
            item.Apply(obj.transform);
            if(prefab.asset)
            {
                var visual=Instantiate(prefab.asset,obj.transform,false);
                visual.transform.SetLocalPositionAndRotation(Vector3.zero,prefab.turn?Quaternion.Euler(0,180,0):Quaternion.identity);
                visual.transform.localScale=Vector3.one;
            }
            return obj;
        }

        public void Show(string region,int level,string district,string track,int floor,int rackCount,string[] roles,bool own=true,bool titleView=false,
            string[]? ids=null,float[]? moods=null,float heat=.7f,string outfit="turtleneck",object? session=null,bool animateRacks=true)
        {
            if(level>2)district="";
            else if(!catalog.layouts.Any(entry=>entry.region==region && entry.district==district && entry.level==1))
                district=region=="bay"?"d_paloalto":"d_village";
            if(level>=5)track="";
            else floor=-1;
            var layout=catalog.layouts.FirstOrDefault(entry=>entry.region==region && entry.level==level &&
                entry.district==district && entry.track==track && entry.floor==floor)
                ?? throw new InvalidDataException($"未知办公室 {region}/{level}/{district}/{track}/{floor}");
            bool sameSession=ReferenceEquals(session,currentSession) && title==titleView;
            bool changed=active!=layout || !sameSession;
            bool ride=changed && sameSession && active!=null && active.region==region && active.level==level && active.floor!=floor;
            float previousLift=liftFloor,previousTarget=cameraTarget,previousHeight=cameraHeight;
            if(!sameSession)motionTime=0;
            currentSession=session;
            title=titleView;
            targetHeat=own?Mathf.Clamp01(heat):0;
            if(changed)
            {
                ClearRoom();
                room=new GameObject($"Office {region} {level} F{floor+1}");
                active=layout;
                AddModel(layout.shell,"Shell",room.transform);
                AddModel(layout.street,"Street",room.transform);
                foreach(var item in layout.instances)
                {
                    if(item.id=="furnace")continue;
                    var obj=AddItem(item,room.transform);
                    BindProp(item,obj);
                    if(item.id=="server_rack")racks.Add((obj,item.seed));
                    if(item.id=="elevator_car")BindLift(obj,ride,previousLift,previousTarget,previousHeight);
                }
                if(layout.cable!="")cables=AddModel(layout.cable,"Rack cables",room.transform);
                BuildStreet();
                team=Child("Staff",room.transform);
            }
            bool routeChanged=ownModel!=own;
            if(!core || routeChanged)
            {
                Remove(core);
                fire=null;
                releaseLeft=0;pendingRelease=false;
                core=Child("Machine room",room.transform);
                ownModel=own;
                var furnace=layout.instances.FirstOrDefault(item=>item.id=="furnace");
                if(furnace!=null)
                {
                    var machine=AddItem(own?furnace:layout.egg,core.transform);
                    if(own)fire=new Fire(machine);
                    if(!own)AddModel(layout.eggCable,"Upstream API",core.transform);
                }
            }
            SyncRacks(own?rackCount:0,animateRacks && !changed && own && !title && level<5 && !routeChanged);
            SyncStaff(roles,ids,moods,outfit,!changed);
            Frame();
            if(changed || routeChanged)AdvanceMotion(0);
        }

        public void Viewport(Rect rect)
        {
            viewport=rect;
            Frame();
        }

        void Frame()
        {
            if(active==null)return;
            float el=title?.34f:.6f;
            float diag=Mathf.Sqrt(Mathf.Pow(active.w+6,2)+Mathf.Pow(active.d+6,2));
            float h=lift!=null?cameraHeight:active.h;
            view.orthographicSize=.5f*Mathf.Max(diag/(viewport.width*view.aspect),
                (diag*Mathf.Sin(el)+(h+3.4f)*Mathf.Cos(el))/viewport.height)/.9f/(title?.76f:1f);
            var target=Vector3.up*((lift!=null?cameraTarget:active.target)+(title?5:0));
            view.transform.position=target+new Vector3(.707107f*Mathf.Cos(el),Mathf.Sin(el),-.707107f*Mathf.Cos(el))*80;
            view.transform.LookAt(target);
            var offset=new Vector2(.5f,.5f)-viewport.center;
            view.transform.position+=2*view.orthographicSize*(view.transform.right*offset.x*view.aspect+view.transform.up*offset.y);
        }

        void ClearRoom()
        {
            ClearMotion();
            Remove(room);
            room=team=cables=core=null!;
            racks.Clear();
            foreach(var mesh in meshes.Values)Release(mesh);
            meshes.Clear();
            active=null!;
        }

        void OnDestroy()
        {
            ClearRoom();
            foreach(var mat in materials.Values)Release(mat);
            foreach(var tex in textures.Values)Release(tex);
        }
    }
}
