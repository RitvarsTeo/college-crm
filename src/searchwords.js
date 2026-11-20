// FIND A PERSON BY THE WORDS YOU REMEMBER (20.11.2026, the owner's "Yes, plan a patch" after Ieva could not find "Francisco Gustafsson":
// the record is "Francisco Javier Gustafsson"). Every word typed must be somewhere in the person's details, in any order; case and
// accents do not matter ("gustafsson francisco", "Bērziņš" = "berzins"). One rule for the server's people search and the page's own
// search boxes (src/app.html cWordsHit is the same code).

/** Lower case, accents off, one space between words. */
export const fold = (s) => String(s ?? '').toLocaleLowerCase('lv').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** The words of a search box, folded; [] for an empty box. */
export const wordsOf = (q) => fold(q).split(' ').filter(Boolean);

/** True when every word of `q` is somewhere in `values` (any order, any field); an empty search finds everyone. */
export function wordsHit(q, values) {
  const words = wordsOf(q);
  if (!words.length) return true;
  const hay = fold([].concat(values).map((v) => String(v ?? '')).join(' '));
  return words.every((w) => hay.includes(w));
}
