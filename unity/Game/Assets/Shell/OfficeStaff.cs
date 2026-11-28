using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Liandan.Shell
{
    public sealed partial class Office
    {
        readonly Dictionary<string,Worker> staff=new();
        readonly List<Worker> workers=new();
        static readonly int BaseColor=Shader.PropertyToID("_BaseColor");
        MaterialPropertyBlock block=null!;

        void TintActor(Renderer renderer,string hex,Look look)
        {
            string sample="#"+hex;
            string? tint=Array.IndexOf(Look.Skins,sample)>=0?look.Skin:
                Array.IndexOf(Look.Hairs,sample)>=0?look.Hair:null;
            if(tint==null)return;
            ColorUtility.TryParseHtmlString(tint,out var color);
            block.Clear(); block.SetColor(BaseColor,color); renderer.SetPropertyBlock(block);
        }

        void SyncStaff(string[] roles,string[]? ids,float[]? moods,string outfit,bool arrivals)
        {
            if(!Look.FounderOutfits.ContainsKey(outfit))outfit="turtleneck";
            var keys=ids??Enumerable.Range(0,roles.Length).Select(i=>"e"+i).ToArray();
            var wanted=new HashSet<string>(keys){"founder-"+outfit};
            for(int i=workers.Count-1;i>=0;i--)
            {
                var w=workers[i];
                if(wanted.Contains(w.Id))continue;
                staff.Remove(w.Id); workers.RemoveAt(i); Remove(w.Root.gameObject);
            }
            foreach(var group in active.actors.GroupBy(s=>s.role=="founder" || active.level>=5?s.role:"staff"))
            {
                var seats=group.OrderBy(s=>s.slot).ToArray();
                bool boss=group.Key=="founder";
                for(int i=0;i<(boss?1:roles.Length);i++)
                {
                    if(!boss && active.level>=5 && group.Key!=roles[i])continue;
                    string id=boss?"founder-"+outfit:keys[i];
                    if(!staff.TryGetValue(id,out var w))
                    {
                        int slot=0;
                        while(workers.Exists(other=>other.Group==group.Key && other.Slot==slot))slot++;
                        var seat=seats[slot<seats.Length?slot:active.level<5?0:slot%seats.Length];
                        var look=boss?Look.Of("founder","eng"):Look.Of(id,roles[i]);
                        string key=boss?id:$"{roles[i]}-{look.Style}-{(look.Glasses?1:0)}-{(look.Headphones?1:0)}";
                        var actor=AddModel(actorModels[key],id,team.transform,look);
                        seat.Apply(actor.transform);
                        w=new Worker(actor.transform,id,group.Key,slot,seat.pose=="sit" && (slot<seats.Length || active.level<5),
                            boss,arrivals && !boss,active);
                        staff.Add(id,w); workers.Add(w);
                    }
                    w.Tired=!boss && moods!=null && moods[i]<30;
                }
            }
        }

        sealed class Worker
        {
            public readonly string Id,Group;
            public readonly int Slot;
            public bool Tired;
            public readonly Transform Root;
            readonly Transform rig,head,leftArm,rightArm,leftLeg,rightLeg;
            readonly Vector3 home,aisle,paceEnd;
            readonly Vector3[] entry;
            readonly bool seated,boss;
            readonly float phase,interval;
            int waypoint,excursion;
            bool returning;
            float wait;
            public Worker(Transform root,string id,string group,int slot,bool seated,bool boss,bool arrive,Layout layout)
            {
                Root=root; Id=id; Group=group; Slot=slot;
                this.seated=seated; this.boss=boss;
                rig=root.Find("rig"); head=rig.Find("head"); leftArm=rig.Find("arm_l"); rightArm=rig.Find("arm_r");
                leftLeg=rig.Find("leg_l"); rightLeg=rig.Find("leg_r");
                home=root.localPosition; aisle=home+Vector3.left*.95f;
                paceEnd=new Vector3(home.x,home.y,-Mathf.Min(layout.d/2-3.4f,1.4f));
                uint hash=Look.Hash(id);
                phase=boss?0:int.TryParse(id.AsSpan(1),out int n)?n*1.7f:hash%1000*.017f;
                interval=32+hash%29;
                wait=boss?1:12+hash%31;
                bool tower=layout.level>=5;
                float doorX=tower?layout.w/2+.4f:-layout.w/2;
                float doorZ=-layout.d/2+(tower?3.2f:1.8f);
                entry=arrive?new[]{new Vector3(tower?doorX:doorX+1,home.y,doorZ),
                    new Vector3(aisle.x,home.y,doorZ),aisle,home}:Array.Empty<Vector3>();
                if(arrive)root.localPosition=new Vector3(tower?doorX:doorX-1.4f,home.y,doorZ);
                Step(0,0);
            }
            bool Move(Vector3 target,float distance)
            {
                var delta=target-Root.localPosition;
                if(delta.sqrMagnitude>.00001f)Root.localRotation=Quaternion.LookRotation(-delta);
                Root.localPosition=Vector3.MoveTowards(Root.localPosition,target,distance);
                return Root.localPosition==target;
            }
            public void Step(float time,float dt)
            {
                float t=time+phase;
                bool walking=false;
                if(waypoint<entry.Length)
                {
                    walking=true;
                    if(Move(entry[waypoint],3.2f*dt) && ++waypoint==entry.Length)Root.localRotation=Quaternion.identity;
                }
                else if(boss)
                {
                    if((wait-=dt)<=0)
                    {
                        walking=true;
                        if(Move(returning?home:paceEnd,1.1f*dt)){returning=!returning;wait=2+Mathf.Repeat(t,3);}
                    }
                }
                else if(seated)
                {
                    // A short walk in the same side aisle the web uses for arrivals.
                    if(excursion==0 && (wait-=dt)<=0)excursion=1;
                    if(excursion!=0)
                    {
                        walking=true;
                        Vector3 target=excursion==2?aisle+Vector3.forward*.55f:excursion==4?home:aisle;
                        if(Move(target,1.1f*dt) && ++excursion==5)
                        {excursion=0;wait=interval;Root.localRotation=Quaternion.identity;}
                    }
                }
                bool sit=seated && !walking;
                float swing=walking?Mathf.Sin(t*11)*.7f:0;
                bool stretch=sit && Mathf.Sin(t*.21f)>.93f;
                float amp=Tired?.03f:.12f;
                float left=sit?(stretch?-2.9f:-1.2f+Mathf.Sin(t*10)*amp):-swing*.8f;
                float right=sit?(stretch?-2.9f:-1.2f+Mathf.Cos(t*10.5f)*amp):swing*.8f;
                RotateX(leftArm,left); RotateX(rightArm,right);
                RotateX(leftLeg,sit?-1.5f:swing); RotateX(rightLeg,sit?-1.5f:-swing);
                float pitch=sit?(stretch?-.35f:(Tired?.32f:.06f)+Mathf.Sin(t*.8f)*.05f):0;
                float yaw=walking?0:sit?Mathf.Sin(t*.55f)*.28f:Mathf.Sin(t*.7f)*.5f;
                head.localRotation=Quaternion.Euler(-pitch*Mathf.Rad2Deg,-yaw*Mathf.Rad2Deg,0);
                float y=sit?.14f+Mathf.Sin(t*2.2f)*.006f:Mathf.Abs(Mathf.Sin(t*(walking?11:1.6f)))*(walking?.05f:.02f);
                rig.localPosition=Vector3.up*y;
            }
            static void RotateX(Transform node,float radians) =>
                node.localRotation=Quaternion.AngleAxis(-radians*Mathf.Rad2Deg,Vector3.right);
        }
    }
}
