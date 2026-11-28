using System;
using System.Collections.Generic;
using UnityEngine;

namespace Liandan.Shell
{
    public sealed partial class Office
    {
        [Serializable] public class Binding { public string resource="";public PropBatch.ActionPose[] actions=null!; }
        Dictionary<string,PropBatch.ActionPose[]> bindings=null!;
        static readonly int Emission=Shader.PropertyToID("_EmissionColor"), MapST=Shader.PropertyToID("_BaseMap_ST");

        // FBX pivots may have transformed parents. Store the web axis in parent space
        // once, then apply an absolute angle to the authored rest rotation at every LOD.
        readonly struct Rotation
        {
            readonly Transform node;
            readonly Vector3 axis;
            readonly Quaternion rest;
            public Rotation(Transform n,Vector3 worldAxis)
            {node=n;axis=n.parent.InverseTransformDirection(worldAxis);rest=n.localRotation;}
            public void Set(float degrees)=>node.localRotation=Quaternion.AngleAxis(degrees,axis)*rest;
        }
        enum JointKind { Spin,Paw,Fish,Chat }
        sealed class Joint
        {
            public Transform node=null!;
            public JointKind kind;
            public Rotation rotation;
            public float rate,phase;
            public Vector3 rest;
            public void Step(float t)
            {
                switch(kind)
                {
                    case JointKind.Spin: rotation.Set(t*rate);break;
                    case JointKind.Paw: rotation.Set(Mathf.Sin(t*3)*.55f*Mathf.Rad2Deg+phase);break;
                    case JointKind.Chat: node.localPosition=rest+Vector3.up*(.055f*Mathf.Max(0,Mathf.Sin(t*3.2f-phase)));break;
                    case JointKind.Fish:
                        node.localPosition=rest+new Vector3(Mathf.Sin(t*.75f)*.2f,Mathf.Sin(t*1.5f)*.025f,0);
                        rotation.Set(Mathf.Atan2(Mathf.Sin(t*.75f)*.2f,Mathf.Cos(t*.75f))*Mathf.Rad2Deg);break;
                }
            }
        }
        enum LampKind { Signal,Rack,Warning,Pixels,Screen }
        sealed class Lamp
        {
            public Renderer renderer=null!;
            public int slot,index;
            public Color color;
            public LampKind kind;
            public void Step(float t,MaterialPropertyBlock props)
            {
                props.Clear();
                if(kind==LampKind.Screen)
                {
                    float v=Mathf.Repeat(Mathf.Floor(t/.28f+index)/14f,1);
                    props.SetVector(MapST,new Vector4(1,1,0,v));
                }
                else
                {
                    float power;
                    if(kind==LampKind.Signal)
                    {
                        float phase=Mathf.Repeat(t,13.5f);
                        power=(phase<6?2:phase<7.5f?1:0)==index?2.2f:.025f;
                        props.SetColor(BaseColor,color*(power>1?1:.18f));
                    }
                    else if(kind==LampKind.Warning)power=Mathf.Sin(t*2*Mathf.PI)>0?1:.06f;
                    else if(kind==LampKind.Pixels)power=(int)(t*2.5f)%3==index?1:.16f;
                    else power=Mathf.Repeat(Mathf.Floor(t/.16f)*(index%7+2)*.37f+index*.21f,1)>.3f?1.65f:.06f;
                    props.SetColor(Emission,color*power);
                }
                renderer.SetPropertyBlock(props,slot);
            }
        }
        readonly List<Joint> joints=new();
        readonly List<Lamp> lamps=new();

        // Parse only the importer contract SM_<id>_<part>_LOD<n>. Procedural
        // meshes retain the web group names directly.
        static string PartName(string name,string id)
        {
            string prefix="SM_"+id+"_";
            int end=name.LastIndexOf("_LOD",StringComparison.Ordinal);
            return end>prefix.Length && name.StartsWith(prefix,StringComparison.Ordinal)?
                name.Substring(prefix.Length,end-prefix.Length):name;
        }
        PropBatch.ActionPose? Action(Item item,string part)
        {
            if(bindings.TryGetValue(item.resource,out var poses))
                foreach(var pose in poses)if(pose.node==part)return pose;
            return null;
        }
        static Vector3 Axis(string axis)=>axis=="y"?Vector3.down:axis=="z"?Vector3.forward:Vector3.left;

        Rotation[] Wheels(Item? item,GameObject obj)
        {
            var wheels=new List<Rotation>();
            foreach(var node in obj.GetComponentsInChildren<Transform>(true))
            {
                string part=PartName(node.name,item?.id??"van_delivery");
                var action=item==null?null:Action(item,part);
                if(part=="wheel" || part.StartsWith("wheel_",StringComparison.Ordinal) && action!=null)
                    wheels.Add(new Rotation(node,obj.transform.TransformDirection(Axis(action?.axis??"x"))));
            }
            return wheels.ToArray();
        }

        void BindProp(Item item,GameObject obj)
        {
            switch(item.id)
            {
                case "road_barrier": case "lucky_cat": case "roof_hvac": case "ac_unit":
                case "robotaxi": case "fish_tank": case "chat_sign": case "traffic_light":
                case "desk_set": case "standing_desk": case "glass_room": case "tv_wall":
                case "server_rack": case "led_ticker":break;
                default:return;
            }
            int fan=0;
            foreach(var node in obj.GetComponentsInChildren<Transform>(true))
            {
                var part=PartName(node.name,item.id);
                var action=Action(item,part);
                bool imported=node.name!=part;
                if(part=="fan" || part.StartsWith("fan_",StringComparison.Ordinal) || part=="lidar")
                {
                    float speed=part=="lidar"?1.5f:item.id=="ac_unit"?-3.4f:2.3f+fan++*.4f;
                    Vector3 axis=imported?obj.transform.TransformDirection(Axis(action?.axis??"z")):
                        node.TransformDirection(part=="lidar"?Vector3.down:Vector3.forward);
                    joints.Add(new Joint{node=node,kind=JointKind.Spin,rotation=new Rotation(node,axis),rate=speed*Mathf.Rad2Deg});
                }
                else if(part=="waving-paw" || part=="fish" || part.StartsWith("chat-dot-",StringComparison.Ordinal))
                {
                    var kind=part=="fish"?JointKind.Fish:part=="waving-paw"?JointKind.Paw:JointKind.Chat;
                    float phase=kind==JointKind.Chat?(part[part.Length-1]-'0')*.8f:
                        imported?-.35f*Mathf.Rad2Deg:0; // procedural paw was sampled at t=0
                    joints.Add(new Joint{node=node,rest=node.localPosition,kind=kind,phase=phase,
                        rotation=new Rotation(node,obj.transform.TransformDirection(kind==JointKind.Fish?Vector3.down:Vector3.left))});
                }
                var renderer=node.GetComponent<Renderer>();
                if(!renderer)continue;
                string parent=PartName(node.parent.name,item.id);
                string surface=part=="surface"?parent:part;
                var slots=renderer!.sharedMaterials;
                for(int i=0;i<slots.Length;i++)
                {
                    var mat=slots[i];
                    LampKind kind;
                    int index=item.seed+i;
                    if(surface.StartsWith("signal-",StringComparison.Ordinal)){kind=LampKind.Signal;index=surface[7]-'0';}
                    else if(surface.StartsWith("pixels-",StringComparison.Ordinal)){kind=LampKind.Pixels;index=surface[7]-'0';}
                    else if(surface=="leds" || mat.name.IndexOf("_LED_",StringComparison.OrdinalIgnoreCase)>=0)kind=LampKind.Rack;
                    else if(surface=="warning-lamp")kind=LampKind.Warning;
                    else if(surface=="screen-surface" || mat.name=="M_tv_wall_Screen")kind=LampKind.Screen;
                    else continue;
                    if(mat.name=="M_tv_wall_Screen")
                    {
                        var panel=Array.Find(models[item.model].parts,p=>p.name=="screen-surface");
                        if(panel!=null && panel.bins.Length>0)
                        {
                            slots[i]=mat=SurfaceAt(panel.bins[0].mat);
                            renderer.sharedMaterials=slots;
                        }
                    }
                    if(kind==LampKind.Screen && !mat.GetTexture("_BaseMap"))continue;
                    if(kind!=LampKind.Screen && !mat.IsKeywordEnabled("_EMISSION"))continue;
                    Color color=mat.GetColor(BaseColor);
                    if(kind==LampKind.Rack && mat.name.Contains("_LED_"))
                        color=mat.name.Contains("Amber")?new Color(1,.65f,.15f):new Color(.25f,1,.66f);
                    lamps.Add(new Lamp{renderer=renderer,slot=i,index=index,color=color,kind=kind});
                }
            }
        }
    }
}
