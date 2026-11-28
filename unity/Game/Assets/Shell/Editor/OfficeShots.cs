using System.IO;
using Liandan.Shell;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace Liandan.EditorTools
{
    public static class OfficeShots
    {
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
                    office.Show(region,level,district,"chat",floor,4,staff,own);
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
