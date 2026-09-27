// The management report as a Google Sheet, in the signed-in person's own Drive.
//
// How: the person asks for it, Google asks them once to let the CRM create files in
// their Drive (the drive.file scope: the CRM can see ONLY the files it creates,
// nothing else in anybody's Drive), and the report is uploaded as an .xlsx that
// Drive converts into a native Google Sheet. The access token is used for that one
// upload and is never stored or logged.
//
// src/google.js is the sign-in kit, byte-identical to the Talent Acquisition hub's,
// so nothing here is added to it.

export const SHEETS_SCOPE = 'openid email https://www.googleapis.com/auth/drive.file';
export const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink';
export const GOOGLE_SHEET_TYPE = 'application/vnd.google-apps.spreadsheet';

// Test seam, like CRM_GOOGLE_TOKEN_URL: it may only point at this machine, so an
// environment variable can never send a real access token to somebody else.
export function driveUploadUrl(env = process.env) {
  const raw = env.CRM_GOOGLE_DRIVE_UPLOAD_URL;
  if (!raw) return DRIVE_UPLOAD_URL;
  let u;
  try { u = new URL(raw); } catch { throw new Error('CRM_GOOGLE_DRIVE_UPLOAD_URL is not a URL'); }
  if (!/^(localhost|127.0.0.1|[::1])$/i.test(u.hostname)) {
    throw new Error('CRM_GOOGLE_DRIVE_UPLOAD_URL may only point at this machine. It is a test seam, not a setting.');
  }
  return raw;
}

// Bounded reasons, so the screen can say what happened without ever showing what
// Google sent back.
export const SHEET_REASON = {
  DECLINED: 'declined',                 // the person said no on Google's screen
  WRONG_ACCOUNT: 'wrong_account',       // Google answered for somebody else
  DRIVE_API_DISABLED: 'drive_api_disabled',
  NO_PERMISSION: 'no_permission',       // the token came back without drive.file
  FAILED: 'failed',
};

/** Upload an .xlsx as a Google Sheet. Returns { ok, id, link } or { ok: false, reason }. */
export async function uploadAsSheet({ accessToken, xlsx, name, fetchImpl = fetch, env = process.env }) {
  const boundary = 'crm' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const meta = JSON.stringify({ name, mimeType: GOOGLE_SHEET_TYPE });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`
      + `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
    xlsx,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  let r;
  try {
    r = await fetchImpl(driveUploadUrl(env), { method: 'POST', body,
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': `multipart/related; boundary=${boundary}` } });
  } catch { return { ok: false, reason: SHEET_REASON.FAILED }; }
  if (r.ok) {
    const d = await r.json().catch(() => ({}));
    if (!d.id) return { ok: false, reason: SHEET_REASON.FAILED };
    return { ok: true, id: d.id, link: d.webViewLink || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(d.id)}/edit` };
  }
  // Drive's error body names the cause. It is read for the cause only and never
  // passed on: the request carried a token, and the reply is not ours to show.
  const text = await r.text().catch(() => '');
  if (r.status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used in project|is disabled/i.test(text)) {
    return { ok: false, reason: SHEET_REASON.DRIVE_API_DISABLED };
  }
  if (r.status === 403 || r.status === 401) return { ok: false, reason: SHEET_REASON.NO_PERMISSION };
  return { ok: false, reason: SHEET_REASON.FAILED };
}
