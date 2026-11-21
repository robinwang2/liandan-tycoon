using System;
using System.IO;
using Liandan.Sound;
using UnityEditor;
using UnityEngine;

namespace Liandan.EditorTools
{
    public static class Audio
    {
        [MenuItem("Liandan/Render Audio")]
        public static void RenderAll()
        {
            var root=Environment.GetEnvironmentVariable("LIANDAN_REPO") ?? Path.GetFullPath(Path.Combine(Application.dataPath,"../../.."));
            WavRenderer.RenderAll(root,Path.Combine(Application.dataPath,"../Logs/audio-cs"),Debug.Log);
            Debug.Log("Liandan audio render OK");
        }
    }
}
