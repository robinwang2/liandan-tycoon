using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace Liandan.Shell
{
    public static class PropBatch
    {
        public const string PolicyPath="Assets/Shell/Resources/PropPolicy.json";
        [Serializable] public class ActionPose { public string node="",axis=""; public float degrees,rest,peak; }
        [Serializable] public class Item { public string id="",name="",origin="bottom"; public float w,d,h,x,y,z,yaw,scale,canopyW,canopyD; public int budget,lod2Budget;
            public string[] parts=Array.Empty<string>(); public ActionPose[] actions=Array.Empty<ActionPose>(); }
        [Serializable] public class LodRule { public int budgetPercent; public float widthDepth,height,center,contact; }
        [Serializable] public class Config { public Item[] props=Array.Empty<Item>(); public float[] thresholds=Array.Empty<float>(); public LodRule[] lodRules=Array.Empty<LodRule>(); public float epsilon; }
        [Serializable] public class Table { public Item[] PROPS=Array.Empty<Item>(); }
        public static Config Policy => JsonUtility.FromJson<Config>(Resources.Load<TextAsset>("PropPolicy").text);

        public static string SelectionPath(string resource) =>
            resource=="Batch1" ? PolicyPath : $"Assets/Shell/Resources/PropPolicy{resource}.json";
        public static Config Selection(string resource) => resource=="Batch1" ? Policy :
            JsonUtility.FromJson<Config>(Resources.Load<TextAsset>("PropPolicy"+resource).text);

        // 导入器、截图和后续运行时动画共用同一节点约定，每一级都必须有且只有一件。
        public static Transform Part(LOD lod, string id, string node, int level) =>
            lod.renderers.Single(r=>r.name==$"SM_{id}_{node}_LOD{level}").transform;

        public static Dictionary<string,GameObject> Place(string resource="Batch1")
        {
            var first=new Dictionary<string,GameObject>();
            foreach(var item in Selection(resource).props)
            {
                var placed=PlaceItem(item,resource);if(placed)first.Add(item.id,placed);
            }
            return first;
        }
        public static GameObject PlaceItem(Item item,string resource="Batch1")
        {
            var asset=Resources.Load<GameObject>($"{resource}/{item.id}/SM_{item.id}"); if(!asset)return null!;
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
