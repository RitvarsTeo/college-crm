// SHARED LINKS SIGN IN FIRST - Component library part 15, fitted to the CRM.
//
// The owner, 28.09.2026: links must be shareable across anyone and open at ANY
// time; signing in first is fine. Two gaps closed here:
//
// 1. A signed-out browser tab opening an /api/ address (a report download, a
//    feedback screenshot) was handed raw JSON. It now goes to the screen that
//    holds it, which shows the sign-in card. A fetch() still gets its 401.
// 2. A CRM link is a hash route (`/#/person/<id>`). The fragment never reaches
//    the server, and Google sign-in comes back to a fixed `/?auth=google`, so the
//    person the link named was lost and everybody landed on Home. RETURN_SCRIPT
//    writes the route down before sign-in and puts it back after.
//
// Neither grants anything: the page asks the server again with every check.

export function isBrowserNavigation(req) {
  if (!req || req.method !== 'GET') return false;
  const h = req.headers || {};
  const mode = String(h['sec-fetch-mode'] ?? '');
  if (mode) return mode === 'navigate';
  return String(h.accept ?? '').includes('text/html');
}

/** Where a signed-out browser tab asking for this /api/ path should land. */
export function screenFor(p) {
  if (/^\/api\/(report\.|export\/)/.test(p)) return '/#/reports';
  if (/^\/api\/admin\/feedback\//.test(p)) return '/#/feedback';
  return '/';
}

/** The relative place to send this request, or null for the ordinary 401. */
export function signInFirst(req, p) {
  return isBrowserNavigation(req) ? screenFor(p) : null;
}

// Runs in <head>, before the app. Remembers a route (this tab only, 30 minutes)
// and, when Google brings the tab back to `/?auth=google` with no route, puts the
// remembered one into the address bar so the app's own router opens it.
// Only the CRM's own route shape is remembered - never an address from outside.
export const RETURN_SCRIPT = `<script>(function(){
var K='crmReturnAfterSignIn',T=30*60*1000,R=/^#\\/[a-z]+(\\/[A-Za-z0-9_-]{1,64})?$/;
function save(){try{var x=location.hash;if(R.test(x)&&x!=='#/home'){sessionStorage.setItem(K,JSON.stringify({h:x,at:Date.now()}));}}catch(e){}}
try{
var h=location.hash,q=location.search;
save();window.addEventListener('hashchange',save);
if(/[?&]auth=google\\b/.test(q)&&!h){
var g=JSON.parse(sessionStorage.getItem(K)||'null');sessionStorage.removeItem(K);
if(g&&R.test(g.h)&&Date.now()-g.at>=0&&Date.now()-g.at<=T){history.replaceState(null,'',location.pathname+q+g.h);}
}
}catch(e){}
})();</script>`;

/** The page with RETURN_SCRIPT placed first in <head>. */
export function withReturnScript(html) {
  const s = String(html);
  const i = s.search(/<head[^>]*>/i);
  if (i < 0) return RETURN_SCRIPT + s;
  const end = s.indexOf('>', i) + 1;
  return s.slice(0, end) + RETURN_SCRIPT + s.slice(end);
}
