// INTAKE'S SERVICE WORKER - the call notification when Intake is not on screen (Q6, 04.10.2026).
//
// The owner: "Corner card ... if no app is open. If app is open, than to the page." A closed or
// hidden Intake cannot show anything itself; this worker can. A push from Intake carries NO data
// (src/webpush.js): on each knock the worker asks Intake, over the colleague's own session, who is
// calling, and shows the notification in the corner of the screen. Clicking it opens Intake on the
// caller. While Intake is on screen the app itself handles the call, so the worker stays quiet.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => e.waitUntil(onPush()));

async function onPush() {
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (wins.some((w) => w.visibilityState === 'visible' && w.focused)) return;   // on screen: the app's turn
  let note = null;
  try {
    const r = await fetch('/api/calls/latest', { credentials: 'include', cache: 'no-store' });
    if (r.ok) note = (await r.json()).note;
  } catch (err) { note = null; }
  // A push must always show something; if Intake could not say who, say that a call came in.
  const n = note || { title: 'Incoming call', body: 'Open Intake', tag: 'call', href: '#/' };
  return self.registration.showNotification(n.title, { body: n.body, tag: n.tag, requireInteraction: true,
    icon: '/assets/icon-192.png', data: { href: n.href } });
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const href = (e.notification.data && e.notification.data.href) || '#/';
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (app) {
      await app.focus();
      return app.navigate ? app.navigate('/' + href) : null;
    }
    return self.clients.openWindow('/' + href);
  })());
});
