using System.Linq;
using System.Text.Json.Nodes;

namespace Liandan.Kernel
{
    public sealed partial class GameState
    {
        private static readonly string[] TutorialSteps = "start team product pr model cap dirt policy chain perks done".Split(' ');
        public bool TutorialOpen(string key) => !Snapshot["tut"].On("on") || Snapshot["tut"]!["open"].On(key);
        public void AdvanceTutorial()
        {
            var tutorial = Snapshot["tut"];
            if (!tutorial.On("on")) return;
            var open = tutorial!["open"]!.AsObject(); var queue = tutorial["queue"]!.AsArray();
            foreach (var key in TutorialSteps) {
                if (open.On(key)) continue;
                bool ready = key switch {
                    "start" => true, "chain" => List("projects").Count > 0 || Map("chains").Count > 0,
                    "perks" => List("perks").Count > 0,
                    "cap" => Snapshot.N("t") >= P("tut.cap") || Runway() < P("tut.capRunway"),
                    "dirt" => Snapshot.N("t") >= P("tut.dirt") || Snapshot.N("exposed") > 0 || List("dirt").Count > tutorial.N("dirt0"),
                    "done" => Snapshot.N("t") >= P("tut.done") && open.On("policy"), _ => Snapshot.N("t") >= P("tut." + key) };
                if (ready) { open[key] = 1; queue.Add(key); }
            }
            if (open.On("done") && queue.Count == 0) tutorial["on"] = false;
        }
        public string? TutorialTip => (Snapshot["tut"]?["queue"] as JsonArray)?.FirstOrDefault()?.ToString();
        public void DismissTutorial() {
            var tutorial = Snapshot["tut"]; if (tutorial?["queue"] is not JsonArray queue || queue.Count == 0) return;
            queue.RemoveAt(0); if (tutorial["open"].On("done") && queue.Count == 0) tutorial["on"] = false;
        }
    }
}
