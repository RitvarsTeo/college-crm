// The plain system pages (the Gmail and feedback-email connect pages, src/server.js gmailPage), and
// the address a Gmail invite link points at. Security review 07.10.2026, L8.

// Text from outside - Google's words, the account somebody signed in with - is TEXT on these pages.
export const htmlEscape = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// WHERE A GMAIL INVITE LINK POINTS. It was the request's own Host header, which the caller chooses, so a
// link to another site could be minted and handed to whoever holds edu@'s password. Now:
//   1. PUBLIC_BASE_URL, when it is set;
//   2. on a host (VERCEL), the origin of GOOGLE_REDIRECT_URI: configured, and the address Google
//      already sends people back to, so it is ours by definition;
//   3. only on a laptop, the address it was opened at.
// null when a host has neither: no link rather than a guessed one.
export function inviteOrigin(req, env = process.env) {
  const fromUrl = (u) => { try { return new URL(String(u)).origin; } catch { return null; } };
  if (env.PUBLIC_BASE_URL) return fromUrl(env.PUBLIC_BASE_URL);
  if (env.VERCEL) return env.GOOGLE_REDIRECT_URI ? fromUrl(env.GOOGLE_REDIRECT_URI) : null;
  return `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
}
