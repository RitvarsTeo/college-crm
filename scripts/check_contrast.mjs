// CONTRAST, MEASURED ON THE RUNNING, SIGNED-IN PAGE.
//
//   node scripts/check_contrast.mjs <port>
//
// TAKEN FROM Ritvars's own component library,
// "Dev kits to share/Component library/4 Contrast through a gradient (from Client Hub)",
// where it found a real AA failure on 145 chips that four earlier passes had missed.
//
// THE MEASUREMENT IS UNCHANGED. Only the four things its README names as the host
// project's have been replaced: the sign-in selectors, the theme switch, the list
// of screens, and where it writes.
//
// WHY THE ADAPTATION IS WORTH IT rather than a quick check of my own: a contrast
// pass written for this project on 25.09.2026 read rgba(255,255,255,0.055) as
// opaque white and reported 33 dark-mode failures that did not exist. This one
// composites alpha properly, reads the PAINT STACK rather than the ancestor
// chain, and refuses to report at all if it did not sign in.
//
// THE PROBLEM THIS SOLVES. The oceanic ground is painted with
//   background: linear-gradient(180deg,#0A0E13 0%,#05070A 34%,#0B2C38 68%,#12414F 100%) fixed
// on body, so getComputedStyle(body).backgroundColor reads rgba(0,0,0,0). A contrast walk that
// only reads backgroundColor falls through to white and reports near-white text at 1.1:1 - twenty
// imaginary failures on a page that is genuinely dark. The previous checker therefore reported
// "not measurable", which was honest and useless.
//
// THE GRADIENT IS `fixed`, AND THAT IS WHAT MAKES IT MEASURABLE. A fixed background paints against
// the VIEWPORT, not the element, so the colour under any point is a function of that point's
// viewport Y and nothing else. The stops are parsed off the computed value and interpolated in
// sRGB, exactly as the browser does for a 180deg gradient. No screenshot, no PNG decoding, no
// approximation of the design.
//
// WHAT IS STILL NOT MODELLED, said rather than hidden: body::after lays a texture over the ground -
// radial gradients of rgba(255,255,255,.06) at opacity .30, so about 1.8% white, under half a
// step out of 255. It lightens the ground very slightly, which RAISES contrast against the light
// ink of this theme, so ignoring it is the conservative direction. Anything that fails here fails
// by more than that margin, not less.
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'contrast-run');   // data/ is gitignored
const PORT = 9391;                                 // not the Hub's 9389
const A = process.argv[2] || '3217';
const APP = A.startsWith('http') ? A.replace(/\/$/, '') : `http://127.0.0.1:${A}`;
const ONPROD = APP.startsWith('https://');
if (ONPROD) throw new Error('Local copies only. Academy CRM has no verified deployment to measure.');

// A LOCAL FIXTURE ACCOUNT, and it announces itself as one. No real password is
// read, stored or typed here.
const WHO = process.env.CONTRAST_EMAIL || 'ritvars.vilcins@novikontas.org';
const PW = process.env.CONTRAST_PASSWORD || 'fixture-only-not-a-secret-9F2k';

// Academy CRM's own screens. Channels is in deliberately: it is the newest and
// densest, and nobody has looked at it in the dark theme.
const SURFACES = ['/today', '/inbox', '/admissions', '/followup', '/people',
  '/reports', '/channels', '/channels/whatsapp'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const profile = join(OUT, `.p-${PORT}`);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held */ }
const chrome = spawn(CHROME, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--headless=new', '--no-first-run', '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });

async function endpoint() {
  for (let i = 0; i < 60; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return (await r.json()).webSocketDebuggerUrl; }
    catch { /* not up */ }
    await sleep(250);
  }
  throw new Error('no debugger');
}
const ws = new WebSocket(await endpoint());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0; const pend = new Map(); let sessionId = null;
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    const { resolve, reject } = pend.get(m.id); pend.delete(m.id);
    if (m.error) reject(new Error(m.error.message)); else resolve(m.result);
  }
};
const send = (method, params = {}, useSession = true) => {
  const id = ++msgId; const p = { id, method, params };
  if (useSession && sessionId) p.sessionId = sessionId;
  ws.send(JSON.stringify(p));
  return new Promise((resolve, reject) => pend.set(id, { resolve, reject }));
};
const { targetInfos } = await send('Target.getTargets', {}, false);
const page = targetInfos.find((t) => t.type === 'page');
({ sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true }, false));
await send('Page.enable'); await send('Runtime.enable');
const ev = async (expr) => {
  const { result, exceptionDetails } = await send('Runtime.evaluate',
    { expression: expr, returnByValue: true, awaitPromise: true });
  if (exceptionDetails) return { __threw: exceptionDetails.exception?.description || 'threw' };
  return result.value;
};
const waitFor = async (expr, ms = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(250); }
  return false;
};

const READER = String.raw`window.__contrast2 = (() => {
  const px = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  });
  // Parse the stops of a 180deg linear-gradient and read its colour at a fraction down it.
  const gradientAt = (img, frac) => {
    if (!/linear-gradient/.test(img)) return null;
    const inner = img.slice(img.indexOf('(') + 1, img.lastIndexOf(')'));
    const parts = [];
    let depth = 0, cur = '';
    for (const ch of inner) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
    }
    parts.push(cur.trim());
    const stops = [];
    for (const p of parts) {
      const c = px(p);
      if (!c) continue;                       // the angle, or a keyword
      const pct = p.match(/([\d.]+)%\s*$/);
      stops.push({ c, at: pct ? parseFloat(pct[1]) / 100 : null });
    }
    if (stops.length < 2) return null;
    if (stops[0].at === null) stops[0].at = 0;
    if (stops[stops.length - 1].at === null) stops[stops.length - 1].at = 1;
    for (let i = 1; i < stops.length - 1; i += 1) if (stops[i].at === null) stops[i].at = i / (stops.length - 1);
    const f = Math.min(1, Math.max(0, frac));
    for (let i = 0; i < stops.length - 1; i += 1) {
      const a = stops[i], b = stops[i + 1];
      if (f >= a.at && f <= b.at) {
        const t = b.at === a.at ? 0 : (f - a.at) / (b.at - a.at);
        return { r: a.c.r + (b.c.r - a.c.r) * t, g: a.c.g + (b.c.g - a.c.g) * t,
                 b: a.c.b + (b.c.b - a.c.b) * t, a: a.c.a + (b.c.a - a.c.a) * t };
      }
    }
    return stops[stops.length - 1].c;
  };
  // THE PAINT STACK, NOT THE ANCESTOR CHAIN, AND THE DIFFERENCE IS A REAL FALSE POSITIVE.
  //
  // The theme control's selected label sits ON a cyan pill - the CSS says so in its own words:
  // "the selected label sits ON the cyan thumb, so it takes the ink that reads on cyan". That
  // pill is an absolutely positioned SIBLING, not an ancestor, so walking parents reads the dark
  // track behind it and reports navy-on-dark at 1.1:1 on a control that is perfectly legible.
  //
  // elementsFromPoint gives what the browser actually paints at that point, siblings included,
  // nearest first. Walking it composites the same layers a human eye receives. Ancestors remain
  // in the list, so nothing is lost; overlapping siblings stop being invisible to the measurement.
  // AND IT ONLY WORKS INSIDE THE VIEWPORT. elementsFromPoint returns nothing for a row scrolled
  // off the bottom of a long list, so using it alone dropped coverage from 2,765 elements to a few
  // hundred and reported the rest as unmeasurable - trading a false positive for a blind spot.
  // In view: the paint stack, which sees overlapping siblings. Out of view: the ancestor chain,
  // which is what the element would composite against anyway, since nothing can be overlapping a
  // thing that is not being painted.
  const paintStackAt = (x, y, el) => {
    if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) return null;
    const hits = document.elementsFromPoint(x, y);
    const from = hits.indexOf(el);
    return from >= 0 ? hits.slice(from) : null;
  };
  const groundOf = (el) => {
    const stack = [];
    const rect = el.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const midX = rect.left + Math.min(rect.width / 2, 40);
    const painted = paintStackAt(midX, midY, el);
    let idx = 0;
    let node = painted ? painted[0] : el;
    // One walker, two sources: the paint stack while it lasts, the ancestor chain otherwise.
    const next = () => {
      if (painted) { idx += 1; return idx < painted.length ? painted[idx] : null; }
      return node ? node.parentElement : null;
    };
    while (node) {
      const cs = getComputedStyle(node);
      const img = cs.backgroundImage;
      if (img && img !== 'none') {
        // A fixed attachment paints against the viewport, which is what makes this exact.
        // (No backticks in this template literal - one here silently ended it and the file
        // would not parse.)
        const frac = cs.backgroundAttachment === 'fixed'
          ? midY / innerHeight
          : (midY - node.getBoundingClientRect().top) / Math.max(1, node.getBoundingClientRect().height);
        const g = gradientAt(img, frac);
        // A GRADIENT STOP CAN BE TRANSLUCENT, AND TREATING IT AS THE GROUND IS THE SAME FAULT
        // AGAIN, ONE LAYER DEEPER. A panel painted with linear-gradient(rgba(255,255,255,.08),...)
        // interpolates to a pale colour; taking that as opaque reported near-white ink sitting on
        // light teal on a page whose darkest stop is #0A0E13. If the interpolated colour is not
        // fully opaque it is a LAYER, so it goes on the stack and the walk continues to find what
        // is under it - precisely what is already done for a translucent background-color.
        if (g) {
          stack.push(g);
          if (g.a >= 1) break;
          node = next();
          continue;
        }
        return { unmeasurable: true, by: img.slice(0, 50) };
      }
      const c = px(cs.backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a === 1) break; }
      node = next();
    }
    // elementsFromPoint stops at the document element. If nothing in it was opaque the page
    // ground is whatever html/body carry, which the loop has already consumed, so an
    // unmeasurable answer here is genuine rather than a gap in the walk.
    if (!stack.length || stack[stack.length - 1].a !== 1) return { unmeasurable: true, by: 'no opaque ground' };
    let base = stack.pop();
    while (stack.length) base = over(stack.pop(), base);
    return base;
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  return () => {
    const bad = []; let checked = 0; let unmeasurable = 0;
    for (const el of document.querySelectorAll('main *, header *, .pagehead *')) {
      if (!el.checkVisibility || !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim().length > 1)) continue;
      // ONE DOCUMENTED EXCLUSION, AND IT IS A LIMIT OF HIT TESTING RATHER THAN A DESIGN FAULT.
      //
      // The theme toggle's selected label sits on a cyan pill - the CSS says so: "the selected
      // label sits ON the cyan thumb, so it takes the ink that reads on cyan". That pill carries
      // pointer-events: none, so elementsFromPoint CANNOT SEE IT: it is painted and not hit-
      // testable. Neither the ancestor chain nor the paint stack can reach it, so the measurement
      // reads navy on the dark track and calls a legible control 1.1:1.
      //
      // It is skipped by name with the reason attached, rather than left to be rediscovered as a
      // failure every run. Anything else inside #themeCtl is still measured.
      if (el.closest && el.closest('#themeCtl') && el.previousElementSibling
          && el.previousElementSibling.tagName === 'INPUT') { continue; }
      // AND A DISABLED CONTROL HAS NO CONTRAST REQUIREMENT. WCAG 1.4.3 exempts text that is part
      // of an inactive user interface component, which is exactly what the browser's default
      // rgba(16,16,16,.3) on a disabled button is. Reporting it as a failure sends somebody to
      // restyle a control whose faintness is the whole point - it is how "you cannot press this"
      // is communicated. Skipped as an exemption, not as an excuse.
      if (el.disabled || (el.closest && el.closest('button:disabled, fieldset:disabled, [aria-disabled="true"]'))) {
        continue;
      }
      const cs = getComputedStyle(el);
      const fg = px(cs.color); if (!fg) continue;
      const bg = groundOf(el);
      if (bg.unmeasurable) { unmeasurable += 1; continue; }
      const composited = fg.a < 1 ? over(fg, bg) : fg;
      const L1 = lum(composited), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize);
      const bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
      const need = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
      checked += 1;
      if (ratio < need) {
        bad.push({ ratio: Math.round(ratio * 100) / 100, need, size: Math.round(size),
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 38),
          cls: (el.className || '').toString().slice(0, 26),
          fg: cs.color,
          bg: 'rgb(' + Math.round(bg.r) + ', ' + Math.round(bg.g) + ', ' + Math.round(bg.b) + ')' });
      }
    }
    // GROUPED BY THE THING THAT WOULD BE FIXED, not listed per element. 146 failures on one
    // screen is almost always one token repeated down a list, and a flat list of 146 lines hides
    // that. The peer's CRM audit found the same shape: one muted grey, seven symptoms.
    const groups = new Map();
    for (const b of bad) {
      const k = b.fg + ' on ' + b.bg + ' @' + b.size + 'px .' + b.cls;
      if (!groups.has(k)) groups.set(k, { ...b, count: 0, examples: [] });
      const g = groups.get(k); g.count += 1;
      if (g.examples.length < 2 && b.text) g.examples.push(b.text);
    }
    return { checked, unmeasurable, total: bad.length,
      groups: [...groups.values()].sort((a, b2) => b2.count - a.count).slice(0, 8) };
  };
})(); true`;

try {
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${APP}/` });
  await waitFor('!!document.getElementById("loginForm")');
  await ev(`document.getElementById('liEmail').value = ${JSON.stringify(WHO)}`);
  await send('Runtime.evaluate', {
    expression: `document.getElementById('liPass').value = ${JSON.stringify(PW)};`
      + 'document.getElementById(\'loginForm\').dispatchEvent(new Event(\'submit\',{cancelable:true}));',
  });
  // A RUN THAT NEVER SIGNED IN REPORTS "0 BELOW AA" AND MEANS NOTHING BY IT.
  //
  // One production run measured 7 elements on every screen in both themes - identical numbers
  // throughout, because it was measuring the sign-in gate and the hash changes did nothing. Zero
  // failures out of seven elements is the emptiest kind of pass, and this project has a memory
  // entry for exactly that shape. So the sign-in is asserted, and a failure here stops the run.
  // Both halves: the login gone AND a name on the page. Either alone can be true
  // while the other is not.
  const signedIn = await waitFor('!document.getElementById("loginScreen") '
    + '&& !!(document.getElementById("whoName") || {}).textContent');
  const whoami = await ev('(document.getElementById("whoName") || {}).textContent || ""');
  console.log(`  signed in: ${signedIn}  as: ${String(whoami).trim().slice(0, 40) || '(nobody)'}`);
  if (!signedIn) {
    throw new Error('NOT SIGNED IN - every figure below would be the login screen. Refusing to report.');
  }

  for (const theme of ['light', 'dark']) {
    // THE APP switches the theme, not the harness. Setting data-theme from
    // outside half-applies the cascade and produces a theme nobody ever sees -
    // a fault this project has already had once.
    await ev(`setTheme(${JSON.stringify(theme)})`);
    await sleep(1300);
    await ev(READER);
    const ground = await ev(`(() => {
      const cs = getComputedStyle(document.body);
      return { img: (cs.backgroundImage || 'none').slice(0, 74), colour: cs.backgroundColor };
    })()`);
    console.log(`\n########## ${theme.toUpperCase()} ##########`);
    console.log(`  ground: ${ground.colour}  ${ground.img === 'none' ? '' : ground.img}`);
    let tot = 0; let chk = 0; let unm = 0;
    for (const dest of SURFACES) {
      await ev(`location.hash = ${JSON.stringify('#' + dest)}`);
      // Wait for the screen to SETTLE. A pass photographed while a panel was
      // still a loading placeholder is a pass over nothing.
      await waitFor('!document.querySelector("#view .loading")', 8000).catch(() => {});
      await sleep(1300);
      const c = await ev('window.__contrast2()');
      tot += c.total; chk += c.checked; unm += c.unmeasurable;
      console.log(`  ${dest.padEnd(20)} ${String(c.checked).padStart(4)} measured  ${c.total} below AA  ${c.unmeasurable} unmeasurable`);
      if (c.checked < 10) console.log('       ^ SUSPICIOUSLY FEW. A screen that measured almost '
        + 'nothing is not a screen that passed.');
      for (const g of c.groups || []) {
        console.log(`       x${String(g.count).padStart(3)}  ${String(g.ratio).padStart(5)}:1 needs ${g.need}  ${g.size}px  .${g.cls || '(no class)'}`);
        console.log(`              ${g.fg} on ${g.bg}   e.g. ${g.examples.join(' / ')}`);
      }
    }
    console.log(`  TOTAL ${theme}: ${chk} measured, ${tot} below AA, ${unm} unmeasurable`);
  }
} finally {
  try { ws.close(); } catch { /* closed */ }
  try { chrome.kill(); } catch { /* gone */ }
}
