using System;
using System.IO;
using System.Linq;
using Liandan.Shell;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Liandan.EditorTools
{
    public static class OfficeShots
    {
        public static void CaptureMotion()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var camera=Whitebox.Create();
            var office=camera.GetComponent<Office>();
            string folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../Build/office-shots/motion"));
            Directory.CreateDirectory(folder);
            string[] staff={"res","eng","ops"};
            void Advance(int frames)
            {
                for(int tick=0;tick<frames;tick++)office.AdvanceMotion(1f/60);
            }
            Transform Find(string path)=>GameObject.Find(path)?.transform??throw new InvalidOperationException("缺少验收节点 "+path);
            void Series(string name,Vector3 focus,float size,Vector3 eye,params Transform[] moving)
            {
                Matrix4x4 Pose(Transform t)=>Matrix4x4.TRS(t.localPosition,t.localRotation,t.localScale);
                var initial=moving.Select(Pose).ToArray();
                var changed=new bool[moving.Length];
                for(int i=0;i<4;i++)
                {
                    if(i>0)Advance(30);
                    // A floor transition also moves the gameplay camera. Restore the
                    // exact test camera after stepping so it cannot cause a false pass.
                    camera.orthographicSize=size;
                    camera.nearClipPlane=Mathf.Max(.1f,35-size*1.8f-1.5f);
                    camera.transform.position=focus+eye.normalized*35;
                    camera.transform.LookAt(focus);
                    for(int n=0;n<moving.Length;n++)changed[n]|=initial[n]!=Pose(moving[n]);
                    FurnaceShots.WriteFirstShot(camera,folder,$"{name}-{i}");
                }
                for(int n=0;n<moving.Length;n++)if(!changed[n])throw new InvalidOperationException(name+" 未运动 "+moving[n].name);
            }
            var eye=new Vector3(1,1,-1);
            office.Show("sz",3,"","chat",-1,2,staff);
            var arm=Find("Staff/e0/rig/arm_l");
            Series("typing",arm.position,1.65f,eye,arm);
            office.Show("sz",3,"","chat",-1,2,new[]{"res","eng","ops","biz"});
            var hire=Find("Staff/e3");
            Series("arrival",hire.position+Vector3.right*2,3,eye,hire);
            var lid=Find("furnace/lid");office.PlayRelease();
            Series("furnace",lid.position,2.65f,eye,lid);

            office.Show("bay",1,"d_paloalto","chat",-1,1,staff);
            office.Show("bay",1,"d_paloalto","chat",-1,2,staff);
            Advance(66);
            var van=Find("Delivery van");
            var parcel=van.parent.Find("Rack parcel");
            var dock=van.position;
            Series("delivery",dock+new Vector3(-1,1,-2),4.7f,new Vector3(-1,1,1),van,van.Find("rear-door"),parcel);
            if(parcel.gameObject.activeSelf || van.parent.GetComponentsInChildren<Transform>().Count(t=>t.name=="server_rack")!=2)
                throw new InvalidOperationException("卸货结束时货箱或机柜数量错误");
            var traffic=Find("Street traffic");
            var pedestrian=traffic.Find("Pedestrian");
            Series("street",traffic.GetChild(0).position,7,eye,traffic.GetChild(0),pedestrian);

            office.Show("bay",1,"d_paloalto","chat",-1,2,staff,session:new object());
            Advance(351); // 5.85 s, just before green changes to amber at 6 s.
            var signal=Find("traffic_light");
            var lens=signal.Find("signal-1");
            var emitter=lens.GetComponentsInChildren<Renderer>().First(r=>r.sharedMaterial.IsKeywordEnabled("_EMISSION"));
            float Brightness()
            {
                var props=new MaterialPropertyBlock();emitter.GetPropertyBlock(props,0);
                return props.GetColor("_EmissionColor").maxColorComponent;
            }
            float off=Brightness();
            Series("signal",lens.position,1.2f,signal.TransformDirection(new Vector3(.2f,.15f,-1)));
            if(Brightness()<off+.5f)throw new InvalidOperationException("黄灯未亮");
            Advance(18);
            if(Brightness()>off+.1f)throw new InvalidOperationException("红灯阶段黄灯未灭");

            office.Show("sz",8,"","",0,4,staff);
            office.Show("sz",8,"","",3,4,staff);
            var cabin=Find("elevator_car");
            var door=cabin.GetComponentsInChildren<Transform>().First(t=>t.name=="door_left" || t.name.EndsWith("_door_left_LOD0"));
            Series("lift",cabin.position+Vector3.up*7,9,new Vector3(2,.7f,-1),cabin,door);
            office.Show("sz",5,"","",-1,4,staff);
            var roof=Find("Office sz 5 F0/roof_hvac");
            var fan=roof.GetComponentsInChildren<Transform>().First(t=>t.name=="fan" || t.name.EndsWith("_fan_1_LOD0"));
            Series("fan",fan.position,1.7f,new Vector3(.4f,2,-.5f),fan);
            Debug.Log($"Liandan office motion OK: 8 x 4 PNG, 0.5 s, {folder}");
        }

        public static void Capture()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            var camera=Whitebox.Create();
            camera.aspect=16f/9;
            var office=camera.GetComponent<Office>();
            string folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../Build/office-shots"));
            Directory.CreateDirectory(folder);
            string[] staff={"res","eng","eng","ops","biz","legal","res"};
            int shots=0;
            foreach(string region in new[]{"sz","bay"})
            for(int level=1;level<=8;level++)
            {
                void Shot(string district,int floor,string suffix,bool own=true)
                {
                    office.Show(region,level,district,"chat",floor,4,staff,own,session:new object());
                    FurnaceShots.WriteFirstShot(camera,folder,$"{region}-{level}{suffix}");
                    shots++;
                }
                Shot("",-1,"");
                if(level==1)
                {
                    foreach(var district in region=="sz"?new[]{"d_nanshan","d_hqb"}:new[]{"d_soma","d_berkeley"})
                        Shot(district,-1,"-"+district);
                    Shot("",-1,"-egg",false);
                }
                if(level>=5)for(int floor=0;floor<office.Floors;floor++)Shot("",floor,"-F"+(floor+1));
            }
            Debug.Log($"Liandan office shots OK: {shots} PNG, {folder}");
        }
    }
}
