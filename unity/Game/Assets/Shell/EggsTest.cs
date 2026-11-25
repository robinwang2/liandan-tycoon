using System;
using System.Collections;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;
using Liandan.Kernel;
using UnityEngine;
using UnityEngine.UIElements;

namespace Liandan.Shell
{
    public sealed partial class GameShell
    {
        private static string? EggTestDirectory(string[] args)
        {
            int index = Array.IndexOf(args, "-eggs-test");
            if (index < 0) return null;
            if (++index >= args.Length || args[index].StartsWith("-")) throw new ArgumentException("-eggs-test 需要截图目录");
            return Directory.CreateDirectory(args[index]).FullName;
        }

        private IEnumerator RunEggTest(string shots, string saveDirectory)
        {
            eggTesting = true;
            Application.runInBackground = true;
            var steps = EggTestSteps(shots, saveDirectory);
            while (true)
            {
                try { if (!steps.MoveNext()) break; }
                catch (Exception error) { Debug.LogError("Liandan eggs FAILED: " + error); Application.Quit(1); yield break; }
                yield return steps.Current;
            }
            Debug.Log($"Liandan eggs OK: {EggCount}/{exhibits.Count}"); Application.Quit(0);
        }

        private IEnumerator EggTestSteps(string shots, string saveDirectory)
        {
            void Check(bool ok, string message) { if (!ok) throw new InvalidOperationException(message); }
            void Shot(string name)
            {
                var texture = ScreenCapture.CaptureScreenshotAsTexture();
                try { File.WriteAllBytes(Path.Combine(shots, name + ".png"), texture.EncodeToPNG()); }
                finally { Destroy(texture); }
            }
            void Click(Exhibit egg)
            {
                Physics.SyncTransforms();
                ClickEgg(eggCamera.WorldToScreenPoint(egg.Hit.bounds.center));
            }
            void CheckCard(Exhibit egg, string status)
            {
                var labels = eggCard?.Query<Label>().ToList().Select(label => label.text).ToList();
                Check(eggCard?.panel != null && labels != null && labels.Contains(status) && labels.Contains(egg.Name) &&
                    labels.Contains(egg.Description) && labels.Contains("致谢：" + egg.Credit), "卡片内容不对：" + egg.Id);
            }
            var frame = new WaitForEndOfFrame();
            yield return null; yield return frame;
            int total = exhibits.Count;
            Check(total > 0 && EggCount == 0 && !Directory.Exists(saveDirectory), "没有从空存档开始");
            Shot("00-empty");
            for (int index = 0; index < total; index++)
            {
                var egg = exhibits[index]; int count = index + 1;
                Click(egg); yield return null; yield return frame;
                CheckCard(egg, $"发现彩蛋！ {count}/{total}");
                Check(eggCounter.text == $"彩蛋 {count}/{total}" && EggCount == count, "计数不对：" + egg.Id);
                var disk = JsonNode.Parse(File.ReadAllText(Path.Combine(saveDirectory, GameStore.MetaKey + ".json")))!;
                Check(disk["eggs"]!.AsObject().Count == count && (int?)disk["eggs"]![egg.Id] == 1, "未即时保存：" + egg.Id);
                Check(((int?)disk["ach"]!["egg_master"] == 1) == (count == total), "成就写入时机不对");
                Check((eggCard!.Q<Label>(className: "egg-award")?.text == "解锁成就：彩蛋大师") == (count == total), "成就卡时机不对");
                Shot(count.ToString("D2") + "-found");
                if (index == 0 && total > 1)
                {
                    Click(egg); yield return null; yield return frame;
                    CheckCard(egg, "已收集"); Check(EggCount == 1 && Meta["ach"]!["egg_master"] == null, "重复发现提前增加进度");
                    Shot("repeat-first");
                }
            }
            Click(exhibits[0]); yield return null; yield return frame;
            CheckCard(exhibits[0], "已收集"); Check(EggCount == total && eggCard!.Q<Label>(className: "egg-award") == null, "重复发现或发奖"); Shot("repeat");
            var panelPoint = eggCounter.worldBound.center;
            ClickEgg(new Vector2(panelPoint.x / Root.worldBound.width * Screen.width, (1 - panelPoint.y / Root.worldBound.height) * Screen.height));
            Check(eggCard == null, "点击标签没有收起卡片"); yield return null; yield return frame; Shot("dismiss");
            Store = new GameStore(saveDirectory, Tables); Meta = Store.LoadMeta(); Draw();
            yield return null; yield return frame;
            Check(EggCount == total && (int?)Meta["ach"]!["egg_master"] == 1 && eggCounter.ClassListContains("egg-complete"), "重新载入后进度或成就丢失");
            Shot("reload");
        }
    }
}
