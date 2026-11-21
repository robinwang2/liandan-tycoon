using UnityEngine;

namespace Liandan.Shell
{
    public static class Whitebox
    {
        // 对应网页标题页的第 3 档办公室：W=16、D=11.5、机房宽 4.2；以地面中心为坐标原点。
        public static readonly Vector3 FurnacePosition = new Vector3(16f/2-4.2f/2, .06f, -11.5f/2+5.9f);
        public static GameObject PlaceFurnace(bool original)
        {
            var asset = Resources.Load<GameObject>(original ? "Furnaces/Original/SM_FurnaceOriginal" : "Furnaces/Tripo/SM_Furnace");
            if (!asset) return null!;
            var instance = Object.Instantiate(asset, FurnacePosition, Quaternion.identity);
            instance.transform.localScale = Vector3.one * 1.3f;
            return instance;
        }

        public static Camera Create(bool placeFurnace = true)
        {
            var camera = new GameObject("Office Camera").AddComponent<Camera>();
            camera.transform.position = new Vector3(8,8,-10); camera.transform.LookAt(Vector3.zero); camera.orthographic = true; camera.orthographicSize = 5.5f;
            camera.clearFlags = CameraClearFlags.SolidColor; camera.backgroundColor = new Color(.17f,.25f,.33f);
            var light = new GameObject("Sun").AddComponent<Light>(); light.type = LightType.Directional; light.intensity = 1.5f; light.transform.rotation = Quaternion.Euler(48,-30,0);
            var material = GameShell.Required<Material>("Whitebox");
            void Block(string name, Vector3 position, Vector3 size, Color color)
            {
                var cube=GameObject.CreatePrimitive(PrimitiveType.Cube); cube.name=name; cube.transform.position=position; cube.transform.localScale=size;
                var renderer=cube.GetComponent<MeshRenderer>(); renderer.sharedMaterial=material; var props=new MaterialPropertyBlock(); props.SetColor("_BaseColor",color); renderer.SetPropertyBlock(props);
            }
            bool original = System.Array.IndexOf(System.Environment.GetCommandLineArgs(), "-furnace-original") >= 0;
            bool extended = !placeFurnace || PlaceFurnace(original);
            if (extended)
            {
                var focus = new Vector3(2,1,0);
                camera.transform.position += focus; camera.transform.LookAt(focus); camera.orthographicSize = 6.5f;
            }
            Block("Floor",new Vector3(0,-.15f,0),extended ? new Vector3(16,.3f,11.5f) : new Vector3(6,.3f,5),new Color(.54f,.64f,.69f));
            for(int desk=0;desk<4;desk++)
            {
                var position = new Vector3((desk%2-.5f)*2.4f,.45f,(desk/2-.5f)*2);
                Block("Desk",position,new Vector3(1.7f,.9f,.8f),new Color(.73f,.63f,.47f));
                Block("Monitor",position+new Vector3(0,.75f,0),new Vector3(.8f,.55f,.1f),new Color(.16f,.34f,.38f));
            }
            return camera;
        }
    }
}
