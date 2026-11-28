using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.TextCore.Text;
using UnityEngine.UIElements;

namespace Liandan.EditorTools
{
    public sealed class Build : IPreprocessBuildWithReport
    {
        public const string Scene = "Assets/Shell/Game.unity";
        public int callbackOrder => 0;
        public void OnPreprocessBuild(BuildReport report)
        {
            // 对拍探针自带另一套取表入口，不让它依赖正式场景的导入步骤。
            if (!Path.GetFileName(report.summary.outputPath).Equals("ParityProbe.exe", StringComparison.OrdinalIgnoreCase)) SyncTables();
        }

        [MenuItem("Liandan/Sync Tables")]
        public static void SyncTables()
        {
            var root = Environment.GetEnvironmentVariable("LIANDAN_REPO") ?? Path.GetFullPath(Path.Combine(Application.dataPath, "../../.."));
            var source = Path.Combine(root, "src/data/tables");
            var dest = Path.Combine(Application.streamingAssetsPath, "tables");
            Directory.CreateDirectory(dest);
            var files = Directory.GetFiles(source, "*.json");
            if (files.Length == 0) throw new IOException("没有找到数据表：" + source);
            foreach (var file in files)
            {
                var copy = Path.Combine(dest, Path.GetFileName(file));
                if (!File.Exists(copy) || !File.ReadAllBytes(file).SequenceEqual(File.ReadAllBytes(copy))) File.Copy(file, copy, true);
            }
            foreach (var copy in Directory.GetFiles(dest, "*.json"))
                if (!File.Exists(Path.Combine(source, Path.GetFileName(copy)))) AssetDatabase.DeleteAsset("Assets/StreamingAssets/tables/" + Path.GetFileName(copy));
            void Export(string scriptName, string folder)
            {
                var script = Path.Combine(root, "tools/unity", scriptName);
                var output = Path.Combine(Application.streamingAssetsPath, folder);
                var info = new System.Diagnostics.ProcessStartInfo("node", $"\"{script}\" \"{output}\"") { WorkingDirectory=root, UseShellExecute=false, CreateNoWindow=true };
                using var process = System.Diagnostics.Process.Start(info);
                process.WaitForExit();
                if (process.ExitCode != 0) throw new IOException(scriptName + " 导出失败");
            }
            Export("export-i18n.mjs", "i18n");
            Export("sync-art.mjs", "shell-art");
            AssetDatabase.Refresh();
        }

        private const string ResourcesPath = "Assets/Shell/Resources/";
        private static T RequiredAsset<T>(string path) where T : UnityEngine.Object
        {
            var asset = AssetDatabase.LoadAssetAtPath<T>(path);
            if (!asset) throw new IOException("缺少或无法导入资源：" + path);
            return asset;
        }

        private static T Settings<T>(string name) where T : ScriptableObject
        {
            var path = ResourcesPath + name + ".asset";
            if (File.Exists(path)) return RequiredAsset<T>(path);
            var asset = ScriptableObject.CreateInstance<T>();
            AssetDatabase.CreateAsset(asset, path);
            return asset;
        }

        [MenuItem("Liandan/Setup UI")]
        public static void SetupUi()
        {
            const string fontPath = ResourcesPath + "ShellFont.asset";
            const string sourcePath = "Assets/Shell/Fonts/NotoSansSC-VF.ttf";
            var importer = AssetImporter.GetAtPath(sourcePath) as TrueTypeFontImporter;
            if (!importer) throw new IOException("缺少字体导入器：" + sourcePath);
            if (!importer.includeFontData)
            {
                importer.includeFontData = true;
                importer.SaveAndReimport();
            }
            var source = RequiredAsset<Font>(sourcePath);
            foreach (char glyph in "中文与 English 混排，炼丹大亨 ¥1.23M · $999K / Jan 2023 — “AI”")
                if (!source.HasCharacter(glyph)) throw new IOException($"Shell 字体缺少 U+{(int)glyph:X4} {glyph}");
            if (!File.Exists(fontPath))
            {
                var created = FontAsset.CreateFontAsset(source);
                if (!created || !created.material || !created.atlasTexture) throw new IOException("无法生成 Noto Sans SC 字体图集");
                created.name = "ShellFont";
                AssetDatabase.CreateAsset(created, fontPath);
                AssetDatabase.AddObjectToAsset(created.material, created);
                AssetDatabase.AddObjectToAsset(created.atlasTexture, created);
            }
            var font = RequiredAsset<FontAsset>(fontPath);
            if (font.sourceFontFile != source || !AssetDatabase.Contains(font.material) || !AssetDatabase.Contains(font.atlasTexture))
                throw new IOException("字体源或图集引用无效：" + fontPath);
            font.atlasPopulationMode = AtlasPopulationMode.Dynamic;
            font.isMultiAtlasTexturesEnabled = true;
            var panel = Settings<PanelSettings>("ShellPanel");
            panel.themeStyleSheet = RequiredAsset<ThemeStyleSheet>(ResourcesPath + "ShellTheme.tss");
            panel.scaleMode = PanelScaleMode.ScaleWithScreenSize;
            panel.referenceResolution = new Vector2Int(1280, 720);
            panel.match = .5f;
            if (new SerializedObject(panel).FindProperty("m_ICUDataAsset")?.objectReferenceValue == null)
                throw new IOException("ShellPanel 未关联编辑器 ICU 数据");
            RequiredAsset<StyleSheet>(ResourcesPath + "Shell.uss");
            var material = RequiredAsset<Material>(ResourcesPath + "Whitebox.mat");
            if (!material.shader || material.shader.name != "Universal Render Pipeline/Lit")
                throw new IOException("Whitebox.mat 缺少 URP/Lit 着色器引用");
            EditorUtility.SetDirty(font);
            EditorUtility.SetDirty(panel);
            AssetDatabase.SaveAssets();
            Debug.Log("Liandan UI setup OK");
        }

        [MenuItem("Liandan/Build Game")]
        public static void BuildGame() => Player(ScriptingImplementation.Mono2x, "Game");
        public static void BuildArtProbe() => Player(ScriptingImplementation.Mono2x,"ArtProbe",BuildOptions.Development);
        [MenuItem("Liandan/Build Game IL2CPP")]
        public static void BuildGameIl2cpp() => Player(ScriptingImplementation.IL2CPP, "GameIl2cpp");
        private static void Player(ScriptingImplementation backend, string folder, BuildOptions options=BuildOptions.None)
        {
            Parity.ConfigureUrp();
            SetupUi();
            var target = NamedBuildTarget.Standalone;
            var previous = PlayerSettings.GetScriptingBackend(target);
            try
            {
                PlayerSettings.SetScriptingBackend(target, backend);
                var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] { Scene }, target = BuildTarget.StandaloneWindows64, options=options, locationPathName = "Build/" + folder + "/Liandan.exe" });
                if (report.summary.result != BuildResult.Succeeded) throw new IOException("游戏构建失败：" + report.summary.result);
                Debug.Log("Liandan build OK: " + folder);
            }
            finally { PlayerSettings.SetScriptingBackend(target, previous); }
        }
    }
}
