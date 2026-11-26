import { getLang } from '../i18n/index.js';
import { choose } from '../game/engine.js';

// Keep live callbacks on the real game. Recreate only the view on a private
// snapshot (including its PRNG) so switching never applies enter/choice effects twice.
export function dialogView(state, create) {
  const snapshot = JSON.stringify(state), language = getLang(), choices = [];
  const original = create(state);
  let dialog = original, result = null, translated, originalLanguage = true;
  return {
    original,
    selected(index, response) {
      choices.push(index); result = response; originalLanguage &&= getLang() === language;
      if (response.dialog) { dialog = response.dialog; result = null; }
      translated = undefined;
    },
    read() {
      if (getLang() === language && originalLanguage) return { dialog, result };
      if (translated?.lang === getLang()) return translated;
      const copy = JSON.parse(snapshot);
      let view = create(copy), outcome = null;
      for (const index of choices) {
        outcome = choose(copy, view, index);
        if (outcome?.dialog) { view = outcome.dialog; outcome = null; }
      }
      return translated = { lang: getLang(), dialog: view, result: outcome };
    },
  };
}
