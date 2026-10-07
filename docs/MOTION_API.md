# Intake motion engine - the API for other lanes

The owner picked **A everywhere** (07.10.2026: page moves, board actions, charts, and the small signals: "A, yes,
lock in"). The engine is always A: SKOLA-expressive (the page opens out of the clicked thing, draw-on lines, things
arrive in reading order, curved flights, highlighter, sliding pill, ping), one moment at most 1.2 s, one page at a
time. There is no switch. `prefers-reduced-motion: reduce` or a hidden tab = nothing moves. (The A/B demo lived on
`demo/2026-10-07-motion-ab`; `motion.mode` is still `'a'` for the area files that read it.)

## Your file

Put your moments in `src/assets/motion-<area>.js` (for example `motion-boards.js`, `motion-charts.js`) and add ONE
line to `src/app.html`, right under the engine's line:

```html
<script src="/assets/motion.js" defer></script>
<script src="/assets/motion-boards.js" defer></script>
```

The server already serves any `src/assets/motion*.js|css` (no extra whitelist line). Your file runs after the app's
own scripts, so app functions exist; wrap them the way `motion.js` does (`const orig = viewX; viewX = async function
() { await orig.apply(this, arguments); ... }`), never edit the app's code for a moment. Styles: put them in your
own `motion-<area>.css` and load it from your js with `motion.css('/assets/motion-<area>.css')`.

Every call below is SAFE: with reduced motion or a hidden tab it does nothing at once
(and `count` / `stagger` leave the final state), so you never write `if (motion on)` yourself. Each returns a Promise
that resolves when it is finished (or at once when it does nothing).

| Call | What it does |
| --- | --- |
| `motion.enter(placeId, fromEl?)` | a place arriving. `fromEl` = what was clicked: the place opens OUT of its rectangle (iris = one level deeper). Without `fromEl`: a push, right for forward in the menu, left for Back |
| `motion.flight(el, toEl)` | a copy of `el` travels on a curve onto `toEl`, which then pings |
| `motion.drawBaseline(el or [els])` | the line draws left to right (one element, or segments back to back). Pseudo line: `{ pseudo: '::after' }` |
| `motion.stagger(els, { kind, delay })` | in reading order. `kind: 'rise'` = a DATA mark uncovered from its baseline (clip, never scaled); `'pop'` = a node pops; `'fade'` |
| `motion.ping(el)` | one ring grows from `el` and fades |
| `motion.mark(el)` | highlighter swipe behind the number (changed since the last visit), stays for the visit |
| `motion.pill(groupEl, activeEl)` | a pill slides from the old choice to `activeEl` |
| `motion.count(el)` | the number counts up to its exact text (kit part 9's `Motion.count`) |
| `motion.march(el, on)` | marching dashes along a dashed SVG stroke or border, until `on` is false |

Also: `motion.run(el, frames, opts, pseudo)` = your own Web Animation on the engine's clock (capped, finished by a click,
nothing when motion is not live). Read-only: `motion.mode` (always `'a'`), `motion.live()` (true when something would play
now).

## Rules the engine enforces (do not work around them)

1. Once per arrival by a click. Never on a reload or a redraw inside a place.
2. Short: at most 1.2 s for one moment start to end. A hard stop finishes anything still running.
3. Clicks never wait: any pointer down, key or wheel finishes every running animation at once.
4. A data mark keeps its exact geometry: bars, columns, slices and dots are uncovered (clip, opacity), never scaled,
   tilted, stretched or bounced. Depth belongs to the frame, never the mark (KB 08 P5).
5. `prefers-reduced-motion: reduce` = nothing moves. A hidden tab = nothing moves.
6. Colours: Novikontas blue `#29a8df` for pills, rings and lines; signal amber `#F7C04F` only for "changed" (mark);
   mustard `#E0A526` is data, never decoration.

## Moments the engine already plays (do not repeat them)

Page-to-page transitions (menu forward / Back / deeper), the sliding pill on `.c-seg`, `.jb-cols` and `.p-mini`
groups and on anything with `data-mo-pill`, a ping on a menu badge whose number grew and on an incoming-call card,
the mark on a number that changed since the last visit (it replaces the shake), and the three ported moments:
Home card -> its Reports tab, the Journey opening, Inbox "Add to Admissions" -> Journey.
