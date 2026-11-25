using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using UnityEngine;
using UnityEngine.UIElements;

namespace Liandan.Shell
{
    public sealed partial class GameShell
    {
        private sealed class Exhibit
        {
            internal string Id = "", Name = "", Description = "", Credit = "";
            internal Transform Pivot = null!;
            internal Collider Hit = null!;
            internal Vector3 Origin;
            internal float BounceAt = float.NegativeInfinity;
        }

        private JsonArray? eggRows;
        private JsonArray EggRows => eggRows ??= Tables.Definition("EASTER_EGGS").AsArray();
        private int EggCount => EggRows.Count(row => (int?)Meta["eggs"]?[row!["id"]!.ToString()] == 1);
        private readonly List<Exhibit> exhibits = new List<Exhibit>();
        private Camera eggCamera = null!;
        private VisualElement eggStage = null!, eggFooter = null!;
        private Label eggCounter = null!;
        private VisualElement? eggCard;
        private Exhibit? hoveredEgg;
        private Texture2D eggCursor = null!;
        private float hideEggAt;
        private bool eggTesting;
        private const int EggColumns = 4;

        private void CreateEggGallery()
        {
            ScreenId = "eggs";
            string[] hand = { "   XX", "  XooX", "  XooX", "  XooXXX", "  XooXooXXX", "  XooXooXooXXX", "  XooXooXooXooX", "XXXoooooooooooX", "XooXooooooooooX", " XooooooooooooX", "  XoooooooooooX", "   XoooooooooX", "    XooooooooX", "    XXXXXXXXXX" };
            eggCursor = new Texture2D(16, 16, TextureFormat.RGBA32, false);
            var pixels = new Color32[16 * 16];
            for (int line = 0; line < hand.Length; line++)
                for (int col = 0; col < hand[line].Length; col++)
                    pixels[(15 - line) * 16 + col] = hand[line][col] == 'X' ? Color.black : hand[line][col] == 'o' ? Color.white : Color.clear;
            eggCursor.SetPixels32(pixels); eggCursor.Apply();
            int rows = Mathf.Max(1, Mathf.CeilToInt(EggRows.Count / (float)EggColumns));
            eggCamera = Whitebox.Create(eggRows: rows);
            for (int index = 0; index < EggRows.Count; index++)
            {
                var row = EggRows[index]!;
                string prop = row["prop"]!.ToString();
                var pivot = new GameObject(row["name"]!.ToString()).transform;
                var prefab = Resources.Load<GameObject>($"B6/{prop}/SM_{prop}");
                var model = prefab ? Instantiate(prefab, pivot) : GameObject.CreatePrimitive(PrimitiveType.Cube);
                if (!prefab)
                {
                    model.name = "占位方块 · " + prop;
                    model.transform.SetParent(pivot, false);
                    var renderer = model.GetComponent<Renderer>();
                    renderer.sharedMaterial = Required<Material>("Whitebox");
                    var color = new MaterialPropertyBlock();
                    color.SetColor("_BaseColor", Color.HSVToRGB(index * .618f % 1, .48f, .92f));
                    renderer.SetPropertyBlock(color);
                }
                var hit = model.GetComponent<BoxCollider>();
                if (!hit) throw new System.InvalidOperationException(prop + " 缺少根 BoxCollider");
                model.transform.localPosition = Vector3.zero;
                Physics.SyncTransforms();
                var bounds = hit.bounds;
                float scale = 1.65f / Mathf.Max(.01f, bounds.size.x, bounds.size.y, bounds.size.z);
                model.transform.localScale *= scale;
                model.transform.localPosition -= new Vector3(bounds.center.x, bounds.min.y, bounds.center.z) * scale;
                var origin = new Vector3((index % EggColumns - (EggColumns - 1) / 2f) * 2.7f, 0, ((rows - 1) / 2f - index / EggColumns) * 2.5f);
                pivot.position = origin;
                exhibits.Add(new Exhibit { Id = row["id"]!.ToString(), Name = row["name"]!.ToString(), Description = row["desc"]!.ToString(),
                    Credit = row["credit"]!.ToString(), Pivot = pivot, Hit = hit, Origin = origin });
            }
            Physics.SyncTransforms();
        }

        private Label AddEggCounter(VisualElement parent)
        {
            int count = EggCount;
            var counter = Label(parent, $"彩蛋 {count}/{EggRows.Count}", "egg-count");
            counter.EnableInClassList("egg-complete", count > 0 && count == EggRows.Count);
            return counter;
        }

        private void DrawEggGallery()
        {
            eggCounter = AddEggCounter(Root);
            eggStage = Box(Root, "egg-stage");
            eggFooter = Box(Root, "egg-footer");
            eggStage.RegisterCallback<GeometryChangedEvent>(_ => FrameEggs());
            FrameEggs();
        }

        private void FrameEggs()
        {
            var area = eggStage.worldBound;
            var screen = Root.worldBound;
            if (!(area.height > 0 && screen.height > 0)) return;
            float available = area.height / screen.height;
            float rows = Mathf.Ceil(exhibits.Count / (float)EggColumns);
            eggCamera.orthographicSize = Mathf.Max(5.8f / eggCamera.aspect, (rows * 1.25f + 1) / available);
            var focus = Vector3.up * .65f + eggCamera.transform.up * ((area.center.y - screen.center.y) / screen.height * 2 * eggCamera.orthographicSize);
            eggCamera.transform.position = focus - eggCamera.transform.forward * (20 + rows * 2);
            eggCamera.farClipPlane = 100 + rows * 4;
        }

        private VisualElement? EggPanelTarget(Vector2 screen)
        {
            var point = RuntimePanelUtils.ScreenToPanel(Root.panel, new Vector2(screen.x, Screen.height - screen.y));
            return Root.panel.Pick(point);
        }

        private Exhibit? PickEgg(Vector2 screen, VisualElement? target)
        {
            if (target != eggStage) return null;
            if (!Physics.Raycast(eggCamera.ScreenPointToRay(screen), out var hit)) return null;
            return exhibits.Find(egg => hit.transform.IsChildOf(egg.Pivot));
        }

        private void ClickEgg(Vector2 screen)
        {
            var target = EggPanelTarget(screen);
            if (target != null && target != eggFooter && eggFooter.Contains(target)) return;
            var egg = PickEgg(screen, target);
            if (egg == null) { HideEggCard(); return; }
            var found = Meta["eggs"] ??= new JsonObject();
            bool fresh = (int?)found[egg.Id] != 1;
            bool award = false;
            if (fresh)
            {
                found[egg.Id] = 1;
                award = EggCount == EggRows.Count && (int?)Meta["ach"]!["egg_master"] != 1;
                if (award) Meta["ach"]!["egg_master"] = 1;
                Store.SaveMeta(Meta);
            }
            UnlockSound(); Cue(award ? "good" : "card");
            egg.BounceAt = Time.unscaledTime;
            string progress = $"{EggCount}/{EggRows.Count}";
            eggCounter.text = "彩蛋 " + progress;
            eggCounter.EnableInClassList("egg-complete", EggCount == EggRows.Count);
            HideEggCard();
            if (award)
            {
                var awardCard = Box(eggFooter, "egg-award-card");
                Label(awardCard, "解锁成就：彩蛋大师", "egg-award");
                Label(awardCard, $"已找到全部 {EggRows.Count} 个彩蛋", "egg-award-detail");
            }
            eggCard = Box(eggFooter, "egg-card");
            Label(eggCard, fresh ? "发现彩蛋！ " + progress : "已收集", "egg-status");
            Label(eggCard, egg.Name, "egg-name"); Label(eggCard, egg.Description);
            Label(eggCard, "致谢：" + egg.Credit, "egg-credit");
            hideEggAt = Time.unscaledTime + 4;
        }

        private void HideEggCard() { eggFooter.Clear(); eggCard = null; }

        private void LateUpdate()
        {
            if (ScreenId != "eggs" || eggStage?.panel == null) return;
            if (!eggTesting)
            {
                var next = PickEgg(Input.mousePosition, EggPanelTarget(Input.mousePosition));
                if ((next == null) != (hoveredEgg == null))
                    UnityEngine.Cursor.SetCursor(next == null ? null : eggCursor, next == null ? Vector2.zero : new Vector2(3, 0), CursorMode.Auto);
                hoveredEgg = next;
                if (Input.GetMouseButtonDown(0)) ClickEgg(Input.mousePosition);
            }
            foreach (var egg in exhibits)
            {
                float phase = Mathf.Clamp01((Time.unscaledTime - egg.BounceAt) / .36f);
                egg.Pivot.position = egg.Origin + Vector3.up * (.22f * Mathf.Sin(Mathf.PI * phase));
                egg.Pivot.localScale = Vector3.one * (egg == hoveredEgg ? 1.055f : 1f);
            }
            if (eggCard != null && Time.unscaledTime >= hideEggAt) HideEggCard();
        }
    }
}
