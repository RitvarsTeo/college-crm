// ONE ADDRESS FOR THE APP (Q84, 09.10.2026, picked: "Yes, redirect pages").
//
// Since 08.10 the app lives at https://intake.novikontas.org and Google sign-in returns there
// (GOOGLE_REDIRECT_URI). Somebody who opens an older address started the sign-in on that host and
// came back to the other one without the flow cookie, so Google sign-in was refused. A PAGE asked
// for on any other host is therefore sent to the same path on the app's own address.
//
// WHAT IS NEVER REDIRECTED: anything under /api/ - every provider webhook (website/Tilda, Mailchimp,
// LinkedIn, Meta, phone events), every cron, the sheet and Gmail routes - keeps answering on the
// host it was sent to, exactly as before, because a provider does not follow a redirect with its
// POST body. Nor /healthz. Nor anything but GET and HEAD.
//
// FAIL-SAFE: no APP_ORIGIN, or one that is not a plain https origin, means no redirect at all
// (local copies and previews unchanged). NO OPEN REDIRECT (KB 08 P11): the target host is only ever
// APP_ORIGIN; the request supplies the path and query, never the host.

export const APP_ORIGIN_ENV = 'APP_ORIGIN';

export function appOrigin(env = process.env) {
  const raw = String(env[APP_ORIGIN_ENV] || '').trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))) return null;
    if (u.pathname !== '/' || u.search || u.hash || u.username || u.password) return null;
    return u.origin;
  } catch { return null; }
}

const NEVER = (p) => p === '/api' || p.startsWith('/api/') || p === '/healthz';

// The Location to send this request to, or null to answer it here.
export function redirectTarget({ method, host, url }, env = process.env) {
  const origin = appOrigin(env);
  if (!origin) return null;
  if (method !== 'GET' && method !== 'HEAD') return null;
  const h = String(host || '').split(',')[0].trim().toLowerCase();
  if (!h || h === new URL(origin).host) return null;
  let u;
  try { u = new URL(String(url || '/'), 'http://placeholder.invalid'); } catch { return null; }
  if (NEVER(u.pathname)) return null;
  // the path is re-read through URL, so "//evil.example" stays a path on OUR origin
  return origin + u.pathname + u.search;
}
