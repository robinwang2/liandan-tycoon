using System;
using System.Linq;
using UnityEngine;

namespace Liandan.Shell
{
    public sealed partial class Office
    {
        float motionTime,streetElapsed,lampElapsed,targetHeat,heat,releaseLeft;
        Fire? fire;
        sealed class Fire
        {
            readonly Transform body,lid;
            readonly Vector3 lidRest;
            readonly Transform[] sparks;
            readonly Renderer[] embers;
            readonly Light light;
            public Fire(GameObject furnace)
            {
                var root=furnace.transform;
                body=root.Find("body"); lid=root.Find("lid"); lidRest=lid.localPosition;
                sparks=root.Cast<Transform>().Where(t=>t.name=="spark").ToArray();
                var fireMaterial=sparks[0].GetComponent<Renderer>().sharedMaterial;
                embers=furnace.GetComponentsInChildren<Renderer>(true).Where(r=>r.sharedMaterial==fireMaterial).ToArray();
                light=Child("Firelight",root).AddComponent<Light>();
                light.transform.localPosition=new Vector3(0,2.5f,-.4f);
                light.type=LightType.Point; light.color=new Color(1,.42f,.13f);
                light.range=6; light.shadows=LightShadows.None;
            }
            public void Step(float t,float heat,float release,MaterialPropertyBlock props)
            {
                heat+=release*1.5f;
                light.intensity=heat*7*(.85f+.15f*Mathf.Sin(t*11));
                body.localScale=Vector3.one*(1+Mathf.Sin(t*4)*.01f*heat);
                lid.localPosition=lidRest+Vector3.up*(Mathf.Max(0,Mathf.Sin(t*7))*.03f*heat+Mathf.Sin(release*Mathf.PI)*1.1f);
                lid.localRotation=Quaternion.AngleAxis((Mathf.Sin(t*13)*.02f*heat+release*.6f)*Mathf.Rad2Deg,Vector3.forward);
                props.Clear();
                props.SetColor(Emission,new Color(1,.30f,.045f)*(.12f+heat*(3.4f+.3f*Mathf.Sin(t*9))));
                foreach(var r in embers)r.SetPropertyBlock(props);
                for(int i=0;i<sparks.Length;i++)
                {
                    float seed=(float)i/sparks.Length;
                    bool shown=heat>.08f && seed<.3f+heat*.7f;
                    var spark=sparks[i];
                    if(spark.gameObject.activeSelf!=shown)spark.gameObject.SetActive(shown);
                    if(!shown)continue;
                    float p=Mathf.Repeat(t*(.35f+heat*.5f)+seed,1),angle=seed*40;
                    spark.localPosition=new Vector3(Mathf.Sin(angle+p*3)*.3f*(1+p),2.2f+p*2.6f,-Mathf.Cos(angle*1.3f)*.3f*(1+p));
                    spark.localScale=Vector3.one*(1-p);
                }
            }
        }

        Transform? lift;
        (Transform node,Vector3 rest,Vector3 slide)[] doors=Array.Empty<(Transform,Vector3,Vector3)>();
        float liftFloor,liftStart,liftEnd,rideAge,rideDuration,doorTime,idleTime,cameraStart,cameraTarget;
        float cameraHeight,startHeight;
        int direction;
        bool followRide,pendingRelease;

        void BindLift(GameObject car,bool ride,float from,float oldTarget,float oldHeight)
        {
            lift=car.transform;
            // Direct meshes and all FBX LODs use the same named door pivots.
            doors=car.GetComponentsInChildren<Transform>(true)
                .Where(t=>PartName(t.name,"elevator_car") is "door_left" or "door_right")
                .Select(t=>{
                    bool left=PartName(t.name,"elevator_car")=="door_left";
                    var delta=t.parent.InverseTransformVector(car.transform.TransformVector(Vector3.forward*(left?.42f:-.42f)));
                    return(t,t.localPosition,delta);
                }).ToArray();
            float stop=active.floor<0?active.floors-1:active.floor;
            liftFloor=ride?from:stop;
            cameraTarget=ride?oldTarget:active.target;
            cameraHeight=ride?oldHeight:active.h;direction=-1;idleTime=2.4f;
            if(ride)StartRide(stop,true);
            PositionLift();
        }
        void StartRide(float to,bool follow)
        {
            liftStart=liftFloor;liftEnd=to;rideAge=0;doorTime=0;
            rideDuration=Mathf.Clamp(.55f+.17f*Mathf.Abs(to-liftStart),.6f,1.5f);
            followRide=follow;cameraStart=cameraTarget;startHeight=cameraHeight;
        }
        void PositionLift()
        {
            var p=lift!.localPosition;
            p.y=active.groundY+liftFloor*active.floorHeight;lift.localPosition=p;
            float open=doorTime>1.35f?(1.7f-doorTime)/.35f:Mathf.Clamp01(doorTime/.45f);
            foreach(var door in doors)door.node.localPosition=door.rest+door.slide*open;
        }
        void StepLift(float dt)
        {
            if(lift==null)return;
            if(rideDuration>0)
            {
                rideAge+=dt;
                float u=Mathf.Clamp01(rideAge/rideDuration);
                float e=u<.5f?4*u*u*u:1-Mathf.Pow(2-2*u,3)*.5f;
                liftFloor=Mathf.Lerp(liftStart,liftEnd,e);
                if(followRide)
                {
                    cameraTarget=Mathf.Lerp(cameraStart,active.target,e);
                    cameraHeight=Mathf.Lerp(startHeight,active.h,e);
                    Frame();
                }
                if(u>=1){rideDuration=0;doorTime=1.7f;idleTime=2.4f;}
            }
            else
            {
                doorTime=Mathf.Max(0,doorTime-dt);
                if(active.floor<0 && (idleTime-=dt)<=0)
                {
                    if(liftFloor<=0)direction=1;
                    if(liftFloor>=active.floors-1)direction=-1;
                    StartRide(liftFloor+direction,false);
                }
            }
            PositionLift();
        }

        public void PlayRelease()
        {
            if(fire!=null && ownModel)pendingRelease=true;
        }
        void Update()=>AdvanceMotion(Time.deltaTime);

        // Edit-mode captures and the player advance the same clock and bindings.
        public void AdvanceMotion(float dt)
        {
            if(active==null)return;
            motionTime+=dt;
            StepLift(dt);
            if(pendingRelease && rideDuration<=0){releaseLeft=1.6f;pendingRelease=false;}
            heat=Mathf.Lerp(heat,targetHeat,1-Mathf.Exp(-dt*3));
            releaseLeft=Mathf.Max(0,releaseLeft-dt);
            fire?.Step(motionTime,heat,releaseLeft/1.6f,block);
            foreach(var worker in workers)worker.Step(motionTime,dt);
            StepDelivery(dt);
            streetElapsed+=dt;
            if(streetElapsed>=1f/30 || dt==0)
            {
                foreach(var joint in joints)joint.Step(motionTime);
                StepStreet(streetElapsed);streetElapsed=0;
            }
            lampElapsed+=dt;
            if(lampElapsed>=.08f || dt==0)
            {
                foreach(var lamp in lamps)lamp.Step(motionTime,block);
                lampElapsed=0;
            }
        }

        void ClearMotion()
        {
            workers.Clear();staff.Clear();joints.Clear();lamps.Clear();
            cars=Array.Empty<Car>();pedestrians=Array.Empty<Transform>();doors=Array.Empty<(Transform,Vector3,Vector3)>();
            vanWheels=Array.Empty<Rotation>();van=parcel=null;rearDoor=null!;lift=null;fire=null;
            pendingRelease=false;rideDuration=doorTime=releaseLeft=0;desiredRacks=0;tripTime=-1;
            streetElapsed=lampElapsed=0;heat=targetHeat;
        }
    }
}
