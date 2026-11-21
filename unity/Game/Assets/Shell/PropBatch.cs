using System;
using System.Collections.Generic;
using UnityEngine;

namespace Liandan.Shell
{
    public static class PropBatch
    {
        public const string PolicyPath="Assets/Shell/Resources/PropPolicy.json";
        [Serializable] public class Item { public string id="",name="",origin="bottom"; public float w,d,h,x,y,z,yaw,scale; public int budget; }
        [Serializable] public class LodRule { public int budgetPercent; public float widthDepth,height,center,contact; }
        [Serializable] public class Config { public Item[] props=Array.Empty<Item>(); public float[] thresholds=Array.Empty<float>(); public LodRule[] lodRules=Array.Empty<LodRule>(); public float epsilon; }
        [Serializable] public class Table { public Item[] PROPS=Array.Empty<Item>(); }
        public static Config Policy => JsonUtility.FromJson<Config>(Resources.Load<TextAsset>("PropPolicy").text);

        public static Dictionary<string,GameObject> Place()
        {
            var first=new Dictionary<string,GameObject>();
            foreach(var item in Policy.props)
            {
                var placed=PlaceItem(item);if(placed)first.Add(item.id,placed);
            }
            return first;
        }
        public static GameObject PlaceItem(Item item)
        {
            var asset=Resources.Load<GameObject>($"Batch1/{item.id}/SM_{item.id}"); if(!asset)return null!;
            GameObject first=null!;
            int count=item.id=="desk_set" || item.id=="office_chair" ?20:item.id=="server_rack"?4:1;
            for(int index=0; index<count;index++)
            {
                Vector3 offset=count==20?new Vector3(index%5*1.9f,0,index/5*2f):count==4?new Vector3(index%3*1.05f,0,index/3*1.6f):Vector3.zero;
                var instance=UnityEngine.Object.Instantiate(asset,new Vector3(item.x,item.y,item.z)+offset,Quaternion.Euler(0,item.yaw,0));
                instance.transform.localScale=Vector3.one*(item.scale>0?item.scale:1);
                if(index==0)first=instance;
            }
            return first;
        }
        public static void Overview(Camera camera)
        {
            var center=new Vector3(.65f,1,0); camera.transform.position=center+new Vector3(7,13,18);camera.transform.LookAt(center);camera.orthographicSize=8.6f;
        }
    }
}
