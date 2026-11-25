#nullable enable
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using UnityEngine;
using UnityEngine.UIElements;

namespace Liandan.Shell
{
    // 员工长相：逐行翻自网页 src/scene/looks.js，同一个 uid 在两边得到同一张脸。
    internal readonly struct Look
    {
        internal static readonly string[] Skins = { "#f7d6b8", "#efc49c", "#dba878", "#bb8257", "#8e5b3d" };
        internal static readonly string[] Hairs = { "#1f1a17", "#3b2a20", "#5a3b22", "#7a5a35", "#a9a39b", "#c8553d", "#2d3a5a" };
        internal static readonly string[] Styles = { "short", "side", "bun", "long", "spiky", "bob", "buzz" };
        private static readonly Dictionary<string, (string outfit, string trim)> Roles = new Dictionary<string, (string, string)> {
            ["res"] = ("#f4f4f8", "#8e6bff"), ["eng"] = ("#3d8bff", "#2a5fb8"), ["ops"] = ("#ff9736", "#d9701a"),
            ["biz"] = ("#2f3a55", "#c9a24a"), ["legal"] = ("#8a93a6", "#d1495b"),
        };
        internal static readonly Dictionary<string, string> FounderOutfits = new Dictionary<string, string> {
            ["turtleneck"] = "#1d2026", ["hoodie"] = "#8b929c", ["plaid"] = "#c8402f", ["suit"] = "#27324d",
        };
        // 网页开局卡片的创始人头像：以衣着名当 id，按衣着借一个岗位的画法，再把衣服换成创始人配色。
        internal static readonly Dictionary<string, string> FounderRoles = new Dictionary<string, string> {
            ["suit"] = "biz", ["hoodie"] = "eng", ["plaid"] = "ops", ["turtleneck"] = "legal",
        };

        internal readonly string Role, Skin, Hair, Style, Outfit, Trim;
        internal readonly bool Glasses, Headphones;

        private Look(string id, string role, string? outfit)
        {
            uint h = Hash(id); int Pick(int n, int shift) => (int)((h >> shift) % (uint)n);
            var colors = Roles.TryGetValue(role, out var found) ? found : Roles["eng"];
            Role = role; Skin = Skins[Pick(5, 0)]; Hair = Hairs[Pick(7, 3)]; Style = Styles[Pick(7, 7)];
            Glasses = Pick(10, 11) < 3; Headphones = role == "eng" && Pick(10, 15) < 4;
            Outfit = outfit ?? colors.outfit; Trim = colors.trim;
        }
        internal static Look Of(string id, string role) => new Look(id, role, null);
        internal static Look Founder(string outfit)
        {
            if (!FounderRoles.TryGetValue(outfit, out var role)) { outfit = "turtleneck"; role = FounderRoles[outfit]; }
            return new Look(outfit, role, FounderOutfits[outfit]);
        }

        // FNV-1a，按 UTF-16 码元逐个处理，和 JS 的 charCodeAt + Math.imul 一致。
        internal static uint Hash(string text)
        {
            uint h = 2166136261;
            foreach (char c in text) { h ^= c; h = unchecked(h * 16777619); }
            return h;
        }

        // -avatar-test：和网页 looks.js 的结果逐项对照（期望值由 node 现场算出后写死）。
        internal static void SelfTest()
        {
            var cases = new (string id, uint hash, int skin, int hair, int style, bool glasses, bool phones)[] {
                ("e1", 2216349443, 3, 4, 2, true, false), ("e2", 2233127062, 2, 6, 2, false, false), ("e7", 2317015157, 2, 4, 2, false, false),
                ("e13", 640952464, 4, 5, 5, false, true), ("e42", 1027278986, 1, 4, 5, true, true), ("e99", 810008582, 2, 6, 3, true, false),
                ("e123", 3340646192, 2, 2, 5, false, false), ("founder", 2949884596, 1, 4, 6, false, true), ("suit", 774867328, 3, 4, 2, false, false),
                ("hoodie", 2352208337, 2, 2, 3, false, true),
            };
            int bad = 0;
            foreach (var c in cases)
            {
                var k = Of(c.id, "eng");
                bool ok = Hash(c.id) == c.hash && k.Skin == Skins[c.skin] && k.Hair == Hairs[c.hair] && k.Style == Styles[c.style] && k.Glasses == c.glasses && k.Headphones == c.phones;
                if (!ok) { bad++; Debug.LogError("头像长相与网页不一致：" + c.id); }
            }
            Debug.Log($"头像长相对照 {cases.Length - bad}/{cases.Length}");
            if (bad > 0) throw new InvalidOperationException("头像长相对照失败");
        }
    }

    // 员工 2D 头像：逐笔翻自网页 src/ui/avatar.js 的 SVG，用 Painter2D 现场画，不再按岗位共用图片。
    internal sealed class AvatarView : VisualElement
    {
        private const string Line = "#1e2233", Ink = "#22252d";
        private static readonly Dictionary<string, string> HairBack = new Dictionary<string, string> {
            ["long"] = "M14 30Q13 9 32 9Q51 9 50 30L51 50Q45 48 44 36L20 36Q19 48 13 50Z",
            ["bob"] = "M14 30Q13 9 32 9Q51 9 50 30L50 40Q46 42 44 37L44 26L20 26L20 37Q18 42 14 40Z",
        };
        private static readonly Dictionary<string, string> HairTop = new Dictionary<string, string> {
            ["short"] = "M17 27Q16 12 32 12Q48 12 47 27Q44 19 32 19Q20 19 17 27Z",
            ["side"] = "M17 28Q15 11 32 11Q49 11 47 28Q46 21 40 19Q30 25 18 23Z",
            ["bun"] = "M17 27Q16 12 32 12Q48 12 47 27Q44 19 32 19Q20 19 17 27Z",
            ["long"] = "M17 27Q16 12 32 12Q48 12 47 27Q44 19 32 19Q20 19 17 27Z",
            ["spiky"] = "M17 27L19 13L24 18L28 8L33 17L38 8L42 18L46 13L47 27Q40 19 32 19Q24 19 17 27Z",
            ["bob"] = "M18 25Q24 15 32 16Q40 15 46 25Q40 20 32 21Q24 20 18 25Z",
            ["buzz"] = "M18 25Q17 13 32 13Q47 13 46 25Q40 18 32 18Q24 18 18 25Z",
        };
        private static readonly Dictionary<string, List<Step>> Parsed = new Dictionary<string, List<Step>>();

        private readonly Look look;
        private float scale = 1;

        internal AvatarView(Look look, float size)
        {
            this.look = look; pickingMode = PickingMode.Ignore; AddToClassList("avatar");
            style.width = size; style.height = size; style.flexShrink = 0; style.overflow = Overflow.Hidden;
            float r = size * 16 / 64; style.borderTopLeftRadius = r; style.borderTopRightRadius = r; style.borderBottomLeftRadius = r; style.borderBottomRightRadius = r;
            generateVisualContent += Paint;
        }

        private void Paint(MeshGenerationContext context)
        {
            var box = contentRect; if (box.width <= 0) return; scale = box.width / 64f;
            var pen = context.painter2D; var k = look;
            pen.lineJoin = LineJoin.Miter; pen.lineCap = LineCap.Butt;
            RoundRect(pen, 0, 0, 64, 64, 0); Fill(pen, Tint(k.Trim, 0.76f));
            if (HairBack.TryGetValue(k.Style, out var back)) { Path(pen, back); Fill(pen, Hex(k.Hair)); }
            Path(pen, "M9 66Q9 45 32 45Q55 45 55 66Z"); Fill(pen, Hex(k.Outfit)); Stroke(pen, Line, 1.6f);
            switch (k.Role)
            {
                case "res": pen.lineJoin = LineJoin.Round; Path(pen, "M25 46L32 57L39 46"); Stroke(pen, k.Trim, 3.2f); pen.lineJoin = LineJoin.Miter; break;
                case "eng": pen.lineCap = LineCap.Round; Path(pen, "M23 47Q32 56 41 47"); Stroke(pen, k.Trim, 3.2f); pen.lineCap = LineCap.Butt; break;
                case "ops": Circle(pen, 32, 57, 4); Fill(pen, Hex(k.Trim)); break;
                default: Path(pen, "M26 46L32 55L38 46Z"); Fill(pen, Color.white); Path(pen, "M30.6 50h2.8l1.8 14h-6.4z"); Fill(pen, Hex(k.Trim)); break;
            }
            RoundRect(pen, 27, 37, 10, 10, 4); Fill(pen, Hex(k.Skin));
            Circle(pen, 32, 28, 15); Fill(pen, Hex(k.Skin)); Stroke(pen, Line, 1.6f);
            if (k.Style == "bun") { Circle(pen, 32, 9, 5.2f); Fill(pen, Hex(k.Hair)); }
            Path(pen, HairTop[k.Style]); Fill(pen, Hex(k.Hair));
            var blush = Hex("#f0a3a0"); blush.a = 0.75f;
            Circle(pen, 22.5f, 33.5f, 2.7f); Fill(pen, blush); Circle(pen, 41.5f, 33.5f, 2.7f); Fill(pen, blush);
            Circle(pen, 26.5f, 29.5f, 1.9f); Fill(pen, Hex(Ink)); Circle(pen, 37.5f, 29.5f, 1.9f); Fill(pen, Hex(Ink));
            pen.lineCap = LineCap.Round; Path(pen, "M28.5 35.5Q32 38.5 35.5 35.5"); Stroke(pen, "#7a3b2e", 1.7f); pen.lineCap = LineCap.Butt;
            if (k.Glasses)
            {
                Circle(pen, 26.5f, 29.5f, 4.7f); Stroke(pen, Ink, 1.8f); Circle(pen, 37.5f, 29.5f, 4.7f); Stroke(pen, Ink, 1.8f);
                Path(pen, "M31.2 29.5h1.6"); Stroke(pen, Ink, 1.8f);
            }
            if (k.Headphones)
            {
                Path(pen, "M16 30Q16 9 32 9Q48 9 48 30"); Stroke(pen, Ink, 3);
                RoundRect(pen, 13, 25, 6, 11, 3); Fill(pen, Hex("#e5484d")); RoundRect(pen, 45, 25, 6, 11, 3); Fill(pen, Hex("#e5484d"));
            }
        }

        private Vector2 P(float x, float y) => new Vector2(x * scale, y * scale);
        private static void Fill(Painter2D pen, Color color) { pen.fillColor = color; pen.Fill(); }
        private void Stroke(Painter2D pen, string color, float width) { pen.strokeColor = Hex(color); pen.lineWidth = width * scale; pen.Stroke(); }
        private void Circle(Painter2D pen, float x, float y, float r) { pen.BeginPath(); pen.Arc(P(x, y), r * scale, Angle.Degrees(0), Angle.Degrees(360)); pen.ClosePath(); }
        private void RoundRect(Painter2D pen, float x, float y, float w, float h, float r)
        {
            pen.BeginPath();
            if (r <= 0) { pen.MoveTo(P(x, y)); pen.LineTo(P(x + w, y)); pen.LineTo(P(x + w, y + h)); pen.LineTo(P(x, y + h)); pen.ClosePath(); return; }
            pen.MoveTo(P(x + r, y));
            pen.ArcTo(P(x + w, y), P(x + w, y + h), r * scale); pen.ArcTo(P(x + w, y + h), P(x, y + h), r * scale);
            pen.ArcTo(P(x, y + h), P(x, y), r * scale); pen.ArcTo(P(x, y), P(x + w, y), r * scale); pen.ClosePath();
        }

        // 只认网页头像用到的 SVG 路径命令：M L Q H V Z（大小写都认）。
        private readonly struct Step { internal readonly char Op; internal readonly Vector2 A, B; internal Step(char op, Vector2 a, Vector2 b) { Op = op; A = a; B = b; } }
        private static readonly Regex Token = new Regex(@"[MLQHVZmlqhvz]|-?(?:\d+\.?\d*|\.\d+)", RegexOptions.Compiled);
        private static List<Step> Parse(string d)
        {
            if (Parsed.TryGetValue(d, out var cached)) return cached;
            var steps = new List<Step>(); var tokens = new List<string>(); foreach (Match m in Token.Matches(d)) tokens.Add(m.Value);
            int i = 0; char op = 'M'; Vector2 cur = Vector2.zero, start = Vector2.zero;
            float Num() => float.Parse(tokens[i++], CultureInfo.InvariantCulture);
            while (i < tokens.Count)
            {
                if (char.IsLetter(tokens[i][0])) op = tokens[i++][0];
                bool rel = char.IsLower(op); Vector2 o = rel ? cur : Vector2.zero;
                switch (char.ToUpperInvariant(op))
                {
                    case 'M': cur = o + new Vector2(Num(), Num()); start = cur; steps.Add(new Step('M', cur, cur)); op = rel ? 'l' : 'L'; break;
                    case 'L': cur = o + new Vector2(Num(), Num()); steps.Add(new Step('L', cur, cur)); break;
                    case 'H': cur = new Vector2((rel ? cur.x : 0) + Num(), cur.y); steps.Add(new Step('L', cur, cur)); break;
                    case 'V': cur = new Vector2(cur.x, (rel ? cur.y : 0) + Num()); steps.Add(new Step('L', cur, cur)); break;
                    case 'Q': var c = o + new Vector2(Num(), Num()); cur = o + new Vector2(Num(), Num()); steps.Add(new Step('Q', c, cur)); break;
                    case 'Z': cur = start; steps.Add(new Step('Z', cur, cur)); break;
                    default: throw new FormatException("头像路径不支持的命令：" + op);
                }
            }
            Parsed[d] = steps; return steps;
        }
        private void Path(Painter2D pen, string d)
        {
            pen.BeginPath();
            foreach (var s in Parse(d))
                switch (s.Op)
                {
                    case 'M': pen.MoveTo(P(s.A.x, s.A.y)); break;
                    case 'L': pen.LineTo(P(s.A.x, s.A.y)); break;
                    case 'Q': pen.QuadraticCurveTo(P(s.A.x, s.A.y), P(s.B.x, s.B.y)); break;
                    case 'Z': pen.ClosePath(); break;
                }
        }

        private static Color Hex(string hex) { ColorUtility.TryParseHtmlString(hex, out var color); return color; }
        // 往白色方向调亮，和网页 tint() 一样按 0–255 整数取整。
        private static Color Tint(string hex, float t)
        {
            var c = (Color32)Hex(hex); byte Up(byte v) => (byte)Math.Round(v + (255 - v) * t, MidpointRounding.AwayFromZero);
            return new Color32(Up(c.r), Up(c.g), Up(c.b), 255);
        }
    }

    public sealed partial class GameShell
    {
        internal VisualElement Avatar(VisualElement parent, Look look, float size) { var view = new AvatarView(look, size); parent.Add(view); return view; }
    }
}
