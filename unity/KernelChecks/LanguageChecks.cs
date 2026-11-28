using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json.Nodes;
using Liandan.Kernel;

namespace Liandan.Verification
{
    public static class LanguageChecks
    {
        private static void Check(bool pass, string message)
        {
            if (!pass) throw new InvalidDataException(message);
        }

        private static void CheckEnglish(string value)
        {
            // This fixture deliberately gives the founder a custom name that is also a rival name.
            if (value.Replace("叉AI", "").Any(c => c >= '㐀' && c <= '鿿')) throw new InvalidDataException("Untranslated display text: " + value);
        }

        private static void CheckFields(JsonNode? node)
        {
            if (node is JsonArray rows) foreach (var row in rows) CheckFields(row);
            if (node is JsonObject obj)
            foreach (var pair in obj)
            {
                if (pair.Value is JsonValue v && pair.Key is "title" or "text" or "name" or "msg" or "hint" or "label" or "desc" or "why" or "chk" or "v")
                    CheckEnglish(v.ToString());
                else if (pair.Key is "options" or "card" or "chips") CheckFields(pair.Value);
            }
        }

        private static GameState Start(ShellLanguage lang, string region, string route, int seed)
        {
            var setup = new JsonObject {
                ["name"]="叉AI", ["coName"]=region=="bay"?"第一性原理":"混沌智能", ["modelName"]="太上", ["autoNames"]=6,
                ["region"]=region, ["route"]=route, ["track"]="chat", ["traits"]=new JsonArray("phd","lab","none"),
                ["attrs"]=JsonNode.Parse("{\"tech\":8,\"cha\":6,\"mgmt\":7,\"biz\":6,\"net\":6,\"luck\":7}")
            };
            return GameState.NewGame(lang.Source, setup, null, () => GameState.NextRandom(ref seed));
        }

        private static void CheckNames(ShellLanguage lang)
        {
            lang.English = true;
            var state = Start(lang,"bay","model",173);
            string saved = state.ToSnapshotJson();
            var view = lang.View(state);
            Check(view.Founder.Name=="叉AI" && view.Company.Name=="First Principles" && view.Snapshot["model"]!["name"]!.ToString()=="High Sage-1", "player name flags");
            Check(view.DateText(27)=="Mar 2025" && view.Currency(123.4)=="$1.23M" && view.UsersText(0.09995)=="1K", "date or units");
            Check(view.Leaderboard().Any(r=>r!["name"]!.ToString()=="ByteHop" && r["model"]!.ToString().StartsWith("Bean Bun-")), "rival board");
            Check(view.Snapshot["log"]![0]!["msg"]!.ToString().Contains("First Principles"), "saved news");
            Check(lang.DisplayTables.Text("ui.top.when",true,("日期","Mar 2025"),("月",27),("总",72),("地区","Bay Area"),("办公室"," · A")).Contains("Month 27/72"), "monthly heading");
            Check(lang.DisplayTables.Definition("ROUTES")["app"]!["desc"]![0]!.ToString().Contains("20K users"), "resolved table units");
            Check(saved == state.ToSnapshotJson(), "display changed source save");
            var flags = state.Snapshot["flags"]!.AsObject();
            flags["autoNames"] = 0;
            Check(lang.View(state).Company.Name=="第一性原理", "custom name matches pool");
            flags.Remove("autoNames");
            Check(lang.View(state).Company.Name=="First Principles" && flags["autoNames"]==null, "legacy pool");
            state.Snapshot["co"]!["name"] = "自定义100万";
            Check(lang.View(state).Company.Name=="自定义100万", "legacy custom name");
            Check(lang.View(Start(lang,"sz","app",173)).Currency(-100000)=="-¥1B", "Shenzhen currency");
        }

        private static IEnumerable<string> Play(ShellLanguage lang, string region, string route, int seed, bool english)
        {
            lang.English = english;
            var state = Start(lang,region,route,seed);
            var meta = new JsonObject { ["ach"]=new JsonObject(), ["ends"]=new JsonObject() };
            var actions = lang.Source.GetActionRows().Select(r=>r!["id"]!.ToString()).ToArray();
            int Select(int count) => (int)(GameState.NextRandom(ref seed)*count);
            void Drain(TurnView turn)
            {
                for (int i=0; i<100; i++)
                {
                    var current = turn.Original.dialog;
                    if (current == null) return;
                    var options = current.View["options"]!.AsArray();
                    var shown = turn.Read(lang).dialog!.View;
                    if (english) CheckFields(shown);
                    Check(shown["id"]?.ToString()==current.View["id"]?.ToString() && shown["options"]!.AsArray().Count==options.Count, "dialog identity/options");
                    if (english && current.View["id"]?.ToString()=="intro")
                    {
                        Check(shown["title"]!.ToString()!=current.View["title"]!.ToString(), "intro translation missing");
                        lang.English=false;
                        Check(turn.Read(lang).dialog==current, "switch back to original callback");
                        lang.English=true;
                    }
                    var allowed = Enumerable.Range(0,options.Count).Where(n=>(bool?)options[n]!["disabled"]!=true).ToArray();
                    if (allowed.Length>0)
                    {
                        turn.Choose(state,allowed[Select(allowed.Length)]);
                        if (english) CheckFields(turn.Read(lang).result);
                        if (current.Next!=null) continue;
                    }
                    turn = new TurnView(state,lang.Source,s=>(s.NextDialog(),null));
                }
                throw new InvalidDataException("dialog loop");
            }
            yield return state.ToSnapshotJson();
            Drain(new TurnView(state,lang.Source,s=>(s.NextDialog(),null)));
            for (int month=1; month<=80 && state.Snapshot["over"]==null; month++)
            {
                var view = lang.View(state);
                view.MonthHeading(); view.Leaderboard(); view.Advise();
                var menu = view.ViewMenu();
                if (english) { CheckFields(menu); CheckFields(view.Advise()); CheckFields(view.Snapshot["log"]); }
                var baseline = state.ViewMenu();
                Check(menu.Select(r=>(r!["id"]!.ToString(),r["name"]!=null,r["why"]!=null)).SequenceEqual(
                    baseline.Select(r=>(r!["id"]!.ToString(),r["name"]!=null,r["why"]!=null))), "action identity/availability");
                for (int n=0; n<5 && state.Snapshot["over"]==null; n++)
                {
                    var allowed=actions.Where(id=>state.Show(id) && state.ActionState(id)["why"]==null).ToArray();
                    if (allowed.Length==0) break;
                    string id=allowed[Select(allowed.Length)];
                    var turn=new TurnView(state,lang.Source,s=>{var r=s.Perform(id,out var d);return(d,r);});
                    if (english) CheckFields(turn.Read(lang).result); Drain(turn);
                }
                state.EndMonth();
                Drain(new TurnView(state,lang.Source,s=>(s.NextDialog(),null)));
                yield return state.ToSnapshotJson();
            }
            Check(state.Snapshot["over"]!=null,"no ending");
            if (english) CheckEnglish(lang.View(state).EndingText());
            state.Settle(meta);
            yield return meta.ToJsonString();
        }

        public static int Run(string tables, string pack, TextWriter output)
        {
            var zh = new ShellLanguage(tables,pack);
            var en = new ShellLanguage(tables,pack);
            CheckNames(en);
            int games=0, months=0;
            foreach (string region in new[]{"sz","bay"})
            foreach (string route in new[]{"model","app"})
            foreach (int seed in new[]{27,173,76361,93821})
            {
                var baseline=Play(zh,region,route,seed,false);
                var localized=Play(en,region,route,seed,true);
                using var a=baseline.GetEnumerator();
                using var b=localized.GetEnumerator();
                int step=0;
                while (a.MoveNext())
                {
                    Check(b.MoveNext() && a.Current==b.Current,$"{region}/{route} seed={seed} snapshot={step}");
                    step++;
                }
                Check(!b.MoveNext(),"extra month");
                months+=step-2; games++;
            }
            output.WriteLine($"C# i18n: {games} complete games, {months} full monthly snapshots, PRNG and settlement identical.");
            return 0;
        }
    }
}
