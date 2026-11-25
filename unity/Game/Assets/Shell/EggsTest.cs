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
                Physics.SyncTransforms();
                var stage = eggStage.worldBound;
                var onStage = new System.Collections.Generic.List<(string id, Rect rect)>();
                foreach (var egg in exhibits)
                {
                    var minimum = new Vector2(float.PositiveInfinity, float.PositiveInfinity);
                    var maximum = new Vector2(float.NegativeInfinity, float.NegativeInfinity);
                    foreach (var corner in EggCorners(egg.Hit.bounds))
                    {
                        var point = RuntimePanelUtils.CameraTransformWorldToPanel(Root.panel, corner, eggCamera);
                        minimum = Vector2.Min(minimum, point); maximum = Vector2.Max(maximum, point);
                    }
                    var rect = Rect.MinMaxRect(minimum.x, minimum.y, maximum.x, maximum.y);
                    Check(stage.Contains(minimum) && stage.Contains(maximum), $"{name}：{egg.Id} 超出展示区 {rect} / {stage}");
                    foreach (var previous in onStage) Check(!rect.Overlaps(previous.rect), $"{name}：{egg.Id} 和 {previous.id} 的投影重叠");
                    onStage.Add((egg.Id, rect));
                }
                var texture = ScreenCapture.CaptureScreenshotAsTexture();
                try { File.WriteAllBytes(Path.Combine(shots, name + ".png"), texture.EncodeToPNG()); }
                finally { Destroy(texture); }
            }
            void Click(Exhibit egg)
            {
                Physics.SyncTransforms();
                ClickEgg(eggCamera.WorldToScreenPoint(egg.Hit.bounds.center));
            }
            void CheckInside(VisualElement child, VisualElement parent, string message)
            {
                var inner = child.worldBound; var outer = parent.worldBound;
                const float tolerance = 1;
                Check(inner.width > 0 && inner.height > 0 && inner.xMin >= outer.xMin - tolerance && inner.yMin >= outer.yMin - tolerance &&
                    inner.xMax <= outer.xMax + tolerance && inner.yMax <= outer.yMax + tolerance, $"{message}（{Screen.width}×{Screen.height}）：{inner} / {outer}");
            }
            void CheckCard(Exhibit egg, string status, bool award = false)
            {
                var labels = eggCard?.Query<Label>().ToList().Select(label => label.text).ToList();
                Check(eggCard?.panel != null && labels != null && labels.Contains(status) && labels.Contains(egg.Name) &&
                    labels.Contains(egg.Description) && labels.Contains("致谢：" + egg.Credit), "卡片内容不对：" + egg.Id);
                CheckInside(eggFooter, Root, "底栏超出屏幕");
                var awardCard = eggFooter.Q(className: "egg-award-card");
                Check((awardCard != null) == award, "成就卡时机不对");
                if (awardCard != null)
                {
                    Check(awardCard.parent == eggFooter && awardCard.Q<Label>(className: "egg-award")?.text == "解锁成就：彩蛋大师", "缺少独立成就卡或标题");
                    Check(awardCard.worldBound.yMax <= eggCard!.worldBound.yMin && awardCard.worldBound.width > eggCard.worldBound.width, "成就卡未放大或遮住了彩蛋详情");
                }
                foreach (var card in eggFooter.Children())
                {
                    CheckInside(card, eggFooter, "卡片超出底栏");
                    foreach (var label in card.Query<Label>().ToList()) CheckInside(label, card, "卡片文字被裁切：" + label.text);
                }
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
                CheckCard(egg, $"发现彩蛋！ {count}/{total}", count == total);
                Check(eggCounter.text == $"彩蛋 {count}/{total}" && EggCount == count, "计数不对：" + egg.Id);
                var disk = JsonNode.Parse(File.ReadAllText(Path.Combine(saveDirectory, GameStore.MetaKey + ".json")))!;
                Check(disk["eggs"]!.AsObject().Count == count && (int?)disk["eggs"]![egg.Id] == 1, "未即时保存：" + egg.Id);
                Check(((int?)disk["ach"]!["egg_master"] == 1) == (count == total), "成就写入时机不对");
                Shot(count.ToString("D2") + "-found");
                if (index == 0 && total > 1)
                {
                    Click(egg); yield return null; yield return frame;
                    CheckCard(egg, "已收集"); Check(EggCount == 1 && Meta["ach"]!["egg_master"] == null, "重复发现提前增加进度");
                    Shot("repeat-first");
                }
            }
            Click(exhibits[0]); yield return null; yield return frame;
            CheckCard(exhibits[0], "已收集"); Check(EggCount == total, "重复发现"); Shot("repeat");
            var panelPoint = eggCounter.worldBound.center;
            ClickEgg(new Vector2(panelPoint.x / Root.worldBound.width * Screen.width, (1 - panelPoint.y / Root.worldBound.height) * Screen.height));
            Check(eggFooter.childCount == 0, "点击标签没有收起卡片"); yield return null; yield return frame; Shot("dismiss");
            Store = new GameStore(saveDirectory, Tables); Meta = Store.LoadMeta(); Draw();
            yield return null; yield return frame;
            Check(EggCount == total && (int?)Meta["ach"]!["egg_master"] == 1 && eggCounter.ClassListContains("egg-complete"), "重新载入后进度或成就丢失");
            Shot("reload");
        }
    }
}
