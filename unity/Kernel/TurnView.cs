using System;
using System.Collections.Generic;
using System.Text.Json.Nodes;

namespace Liandan.Kernel
{
    // Replay presentation on the pre-command snapshot. Only Original owns live callbacks.
    public sealed class TurnView
    {
        public delegate (GameState.Dialog? dialog, JsonObject? result) Command(GameState state);
        private readonly GameState before;
        private readonly Command command;
        private readonly List<int> choices = new List<int>();
        public (GameState.Dialog? dialog, JsonObject? result) Original { get; private set; }
        private (GameState.Dialog? dialog, JsonObject? result)? translated;
        public TurnView(GameState state, Tables source, Command command)
        {
            before = new GameState(state.Snapshot.DeepClone().AsObject(), source);
            this.command = command;
            Original = command(state);
        }
        public void Choose(GameState state, int index)
        {
            var current = Original.dialog!;
            var result = state.Choose(current, index);
            Original = (current.Next ?? current, result);
            choices.Add(index);
            translated = null;
        }
        public (GameState.Dialog? dialog, JsonObject? result) Read(ShellLanguage language)
        {
            if (!language.English) return Original;
            if (translated.HasValue) return translated.Value;
            var copy = language.View(before);
            var view = command(copy);
            foreach (int index in choices)
            {
                var current = view.dialog!;
                var result = copy.Choose(current, index);
                view = (current.Next ?? current, result);
            }
            translated = view;
            return view;
        }
    }
}
