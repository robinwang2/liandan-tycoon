using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Liandan.Shell
{
    public sealed partial class Office
    {
        [Serializable] public class Lane
        {
            public float length,halfDepth;
            public float[] points=null!; // equidistant samples: Unity x, z, yaw in degrees
            public Vector3 At(float distance,out float yaw)
            {
                float sample=Mathf.Repeat(distance,length)/length*(points.Length/3-1);
                int index=Math.Min((int)sample,points.Length/3-2), n=index*3;
                float u=sample-index;
                yaw=Mathf.LerpAngle(points[n+2],points[n+5],u);
                return new Vector3(Mathf.Lerp(points[n],points[n+3],u),0,Mathf.Lerp(points[n+1],points[n+4],u));
            }
        }
        [Serializable] public class Street
        {
            public string key="";
            public Lane[] lanes=null!;
            public Item[] cars=null!;
            public string[] walkers=null!;
        }
        [Serializable] public class Clip { public float[] frames=null!; }
        [Serializable] public class Delivery
        {
            public string key="",vanModel="",cargoModel="";
            public Clip[] clips=null!;
        }
        Street street=null!;
        Delivery? delivery;
        sealed class Car
        {
            public Transform root=null!;
            public Rotation[] wheels=null!;
            public float distance,speed,spin,halfLength,offsetZ;
        }
        Car[] cars=Array.Empty<Car>();
        Transform[] pedestrians=Array.Empty<Transform>();
        GameObject? van,parcel;
        Transform rearDoor=null!;
        Rotation[] vanWheels=Array.Empty<Rotation>();
        float tripTime=-1,vanSpin;
        int firstRack,desiredRacks;
        float dockX,blockedZ;

        void BuildStreet()
        {
            street=catalog.traffic.First(s=>s.key==active.traffic);
            delivery=catalog.deliveries.FirstOrDefault(d=>d.key==active.delivery);
            var parent=Child("Street traffic",room.transform).transform;
            cars=new Car[street.cars.Length];
            for(int i=0;i<cars.Length;i++)
            {
                var item=street.cars[i];
                var obj=AddItem(item,parent);
                BindProp(item,obj);
                cars[i]=new Car{root=obj.transform,wheels=Wheels(item,obj),distance=i*37,
                    speed=(i%2==1?1:-1)*(5.2f+i%3*.6f),halfLength=item.halfLength};
            }
            pedestrians=street.walkers.Select(key=>AddModel(key,"Pedestrian",parent).transform).ToArray();
            StepStreet(0);
        }

        void StepStreet(float dt)
        {
            for(int i=0;i<cars.Length;i++)
            {
                var car=cars[i]; var lane=street.lanes[i%2];
                float travel=car.speed*dt;
                if(tripTime>=0 && dt>0)
                {
                    // Keep clearance on the receiving side of the block while unloading.
                    Vector3 p=lane.At(car.distance,out _),next=lane.At(car.distance+travel,out _);
                    float side=Mathf.Sign(blockedZ),gap=-1,clearance=car.halfLength+7.6f;
                    if(side*(next.z-p.z)>.0001f)gap=Mathf.Abs(blockedZ)-side*p.z-clearance;
                    else if(side*p.z>=lane.halfDepth-.01f)
                        gap=Mathf.Sign(next.x-p.x)*(dockX-p.x)-clearance;
                    if(gap>=0)travel=Mathf.Sign(travel)*Mathf.Min(gap,Mathf.Abs(travel)*Mathf.Clamp01(gap/2.5f));
                }
                car.distance=Mathf.Repeat(car.distance+travel,lane.length);
                var pos=lane.At(car.distance,out float yaw);
                float detour=0;
                if(tripTime>=0)
                {
                    float side=Mathf.Sign(blockedZ);
                    detour=side*Mathf.Max(0,Mathf.Abs(blockedZ)+2.05f-lane.halfDepth)*
                        Mathf.Clamp01((side*pos.z-lane.halfDepth+5)/2);
                }
                car.offsetZ=Mathf.Lerp(car.offsetZ,detour,1-Mathf.Exp(-dt*10));
                pos.z+=car.offsetZ;
                car.root.SetLocalPositionAndRotation(pos,Quaternion.Euler(0,yaw+(car.speed<0?180:0),0));
                car.spin=Mathf.Repeat(car.spin+Mathf.Abs(travel)/.3f*Mathf.Rad2Deg,360);
                foreach(var wheel in car.wheels)wheel.Set(car.spin);
            }
            for(int i=0;i<pedestrians.Length;i++)
            {
                float speed=.9f+i%5*.12f;
                var p=street.lanes[2+i%3].At(i*23.7f+motionTime*speed*(i%2==1?1:-1),out _);
                p.y=.18f+Mathf.Abs(Mathf.Sin(motionTime*6*speed+i))*.05f;
                pedestrians[i].localPosition=p;
            }
        }

        void SyncRacks(int count,bool animate)
        {
            count=Mathf.Clamp(count,0,racks.Count);
            if(animate && delivery!=null && count>desiredRacks)
            {
                if(tripTime<0)
                {
                    firstRack=desiredRacks;
                    tripTime=0;
                    if(!van)
                    {
                        van=AddModel(delivery.vanModel,"Delivery van",room.transform);
                        rearDoor=van.transform.Find("rear-door");
                        vanWheels=Wheels(null,van);
                        parcel=AddModel(delivery.cargoModel,"Rack parcel",room.transform);
                    }
                    van!.SetActive(true);
                    var frames=delivery.clips[firstRack].frames;
                    dockX=frames[360];blockedZ=frames[1];
                    vanSpin=0;
                }
            }
            else if(!animate || count<desiredRacks)EndTrip();
            desiredRacks=count;
            if(tripTime>=0)StepDelivery(0);
            else SetRacks(count,1);
        }

        void SetRacks(int visible,float pop)
        {
            foreach(var rack in racks)
            {
                bool show=rack.index<visible;
                if(rack.obj.activeSelf!=show)rack.obj.SetActive(show);
                if(show)rack.obj.transform.localScale=Vector3.one*(tripTime>=0 && rack.index>=firstRack?pop:1);
            }
            if(cables && cables.activeSelf!=(visible>0))cables.SetActive(visible>0);
        }

        void EndTrip()
        {
            tripTime=-1;
            if(van)van!.SetActive(false);
            if(parcel)parcel!.SetActive(false);
        }

        void StepDelivery(float dt)
        {
            if(tripTime<0 || delivery==null)return;
            tripTime+=dt;
            if(tripTime>=3.7f){EndTrip();SetRacks(desiredRacks,1);return;}
            var frames=delivery.clips[firstRack].frames;
            float frame=tripTime*30;
            int n=(int)frame*10;
            float u=frame-(int)frame;
            float Value(int column)=>Mathf.Lerp(frames[n+column],frames[n+10+column],u);
            var p=new Vector3(Value(0),0,Value(1));
            var rot=Quaternion.Euler(0,Value(2)*Mathf.Rad2Deg,0);
            if(dt>0)vanSpin+=Vector3.Dot(p-van!.transform.localPosition,rot*Vector3.back)/.32f*Mathf.Rad2Deg;
            van!.transform.SetLocalPositionAndRotation(p,rot);
            foreach(var wheel in vanWheels)wheel.Set(vanSpin);
            rearDoor.localRotation=Quaternion.Euler(0,Value(3)*Mathf.Rad2Deg,0);
            bool flying=frames[n+7]>0;
            if(parcel!.activeSelf!=flying)parcel.SetActive(flying);
            if(flying)parcel.transform.SetLocalPositionAndRotation(new Vector3(Value(4),Value(5),Value(6)),
                Quaternion.Euler(0,Value(8)*Mathf.Rad2Deg,Value(9)*Mathf.Rad2Deg));
            float age=tripTime-2.44f;
            if(age<0){if(dt==0)SetRacks(firstRack,1);return;}
            if(age<=.36f+dt || dt==0)
            {
                float scale=age<.22f?1.08f*(1-Mathf.Pow(1-age/.22f,3)):Mathf.SmoothStep(1.08f,1,(age-.22f)/.14f);
                SetRacks(desiredRacks,scale);
            }
        }
    }
}
