using System;
using System.IO;
using Liandan.ProbeTools;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace Liandan.EditorTools
{
    public static class Parity
    {
        private const string Settings = "Assets/Settings";
        private const string ScenePath = "Assets/Parity/ParityProbe.unity";

        [MenuItem("炼丹大亨/设置 URP")]
        public static void ConfigureUrp()
        {
            if (!AssetDatabase.IsValidFolder(Settings)) AssetDatabase.CreateFolder("Assets", "Settings");
            const string renderer = Settings + "/UniversalRenderer.asset";
            const string pipeline = Settings + "/UniversalRP.asset";
            var asset = AssetDatabase.LoadAssetAtPath<RenderPipelineAsset>(pipeline);
            if (asset == null)
            {
                const string template = "Packages/com.unity.render-pipelines.universal/Runtime/Data/UniversalRendererData.asset";
                if (!File.Exists(renderer) && !AssetDatabase.CopyAsset(template, renderer))
                    throw new IOException("无法复制 URP 默认渲染器：" + template);
                var data = AssetDatabase.LoadMainAssetAtPath(renderer);
                // 用包内的公开工厂填充默认资源；离线编译检查无需先由 Unity 编译 URP 包。
                var type = data.GetType().Assembly.GetType("UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset", true);
                asset = (RenderPipelineAsset)type.GetMethod("Create", new[] { data.GetType().BaseType })
                    .Invoke(null, new object[] { data });
                AssetDatabase.CreateAsset(asset, pipeline);
            }
            GraphicsSettings.defaultRenderPipeline = asset;
            AssetDatabase.SaveAssets();
            Debug.Log("URP 设置完成");
        }

        public static void RunEditor() => EditorApplication.Exit(Probe.Run());

        public static void BuildIl2cppProbe()
        {
            var target = NamedBuildTarget.Standalone;
            var previous = PlayerSettings.GetScriptingBackend(target);
            try
            {
                ConfigureUrp();
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                new GameObject("内核对拍").AddComponent<Probe>();
                if (!EditorSceneManager.SaveScene(scene, ScenePath)) throw new IOException("无法保存探针场景");
                PlayerSettings.SetScriptingBackend(target, ScriptingImplementation.IL2CPP);
                var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
                {
                    scenes = new[] { ScenePath },
                    target = BuildTarget.StandaloneWindows64,
                    locationPathName = "Build/ParityProbe/ParityProbe.exe",
                    options = BuildOptions.None
                });
                if (report.summary.result != BuildResult.Succeeded)
                    throw new InvalidOperationException("IL2CPP 构建结果：" + report.summary.result);
                Debug.Log("IL2CPP 探针构建完成");
            }
            finally { PlayerSettings.SetScriptingBackend(target, previous); }
        }
    }
}
