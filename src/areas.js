// WHICH HALF OF INTAKE A PERSON MAY OPEN (19.10.2026).
//
// The owner, 19.10.2026: "Academy people who are academy team can open it, people who are TC people can open that.
// We will have to give permissions." Intake now holds two halves: Academy (every applicant) and Training Centre (every
// client company). Each account has AREAS, academy and/or tc, kept in crm_user_areas.
//
// TWO QUESTIONS, KEPT APART. The role (admin | user) still answers "may they change wiring". The area answers "which
// half may they open". Both are read from the database on every request, never from the cookie.
//
// THE GATE FAILS CLOSED. Every /api/ path needs a session (the sign-in door) and then an area: /api/tc/* and
// /api/admin/tc/* need tc; a short pinned SHARED list needs only the session; EVERY OTHER /api/ path needs academy, so a
// new route is Academy-only until somebody says otherwise here. test/security_guards.test.js pins this function.

export const AREAS = ['academy', 'tc'];
export const AREA_LABEL = { academy: 'Academy', tc: 'Training Centre' };

/** What an /api/ path needs: 'shared' (a session is enough), 'tc' or 'academy'. */
export function areaOfApi(pathname) {
  if (pathname.startsWith('/api/auth/')) return 'shared';           // signing in and out, who am I
  if (pathname === '/api/whoami') return 'shared';                   // says only who is asking
  if (pathname === '/api/feedback') return 'shared';                 // a bug report from either half
  if (pathname === '/api/feedback/waiting') return 'shared';         // a count for the feedback readers only
  if (pathname.startsWith('/api/help/')) return 'shared';            // the Help center's open counts
  if (pathname === '/api/admin/access') return 'shared';             // People and access: admin role checked in the route
  if (pathname === '/api/tc' || pathname.startsWith('/api/tc/')) return 'tc';
  if (pathname.startsWith('/api/admin/tc/')) return 'tc';            // and the admin role, checked in the route
  return 'academy';
}

/** May this signed-in user open this path? `user.areas` comes from resolveUser, read this request. */
export function areaAllows(user, pathname) {
  const need = areaOfApi(pathname);
  if (need === 'shared') return true;
  return Boolean(user && Array.isArray(user.areas) && user.areas.includes(need));
}

export async function areasOf(db, userId) {
  if (!userId) return [];
  const rows = await db.prepare('SELECT area FROM crm_user_areas WHERE user_id = ? ORDER BY area').all(userId);
  return rows.map((r) => r.area).filter((a) => AREAS.includes(a));
}

export const parseAreas = (raw) => {
  const list = String(raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const bad = list.filter((a) => !AREAS.includes(a));
  return { areas: [...new Set(list.filter((a) => AREAS.includes(a)))], bad };
};

/** Give or take one area, and write it down. Returns { changed } - false when it was already so. */
export async function setArea(db, { userId, area, on, by, at = new Date().toISOString() }) {
  if (!AREAS.includes(area)) throw new Error(`unknown area ${area}`);
  return db.transaction(async (tx) => {
    const has = await tx.prepare('SELECT 1 AS x FROM crm_user_areas WHERE user_id = ? AND area = ?').get(userId, area);
    if (Boolean(has) === Boolean(on)) return { changed: false };
    if (on) {
      await tx.prepare('INSERT INTO crm_user_areas (user_id, area, granted_at, granted_by) VALUES (?,?,?,?)').run(userId, area, at, by);
    } else {
      await tx.prepare('DELETE FROM crm_user_areas WHERE user_id = ? AND area = ?').run(userId, area);
    }
    await tx.prepare('INSERT INTO crm_user_area_log (user_id, area, action, at, by) VALUES (?,?,?,?,?)')
      .run(userId, area, on ? 'grant' : 'revoke', at, by);
    return { changed: true };
  });
}

// THE FIRST BOOT. Nobody loses access: every account that exists gets academy, and the admins get both (the owner,
// 19.10.2026). ONCE: the marker in sync_state means an account made later is never granted by accident; it gets its
// areas from scripts/manage_users.mjs --areas or from an admin on People and access.
export const BACKFILL_MARK = 'areas_backfill_2026_10';
export async function backfillAreas(db, { at = new Date().toISOString() } = {}) {
  return db.transaction(async (tx) => {
    if (tx.kind === 'pg') await tx.query('SELECT pg_advisory_xact_lock(7240019)');
    const done = await tx.prepare('SELECT value FROM sync_state WHERE name = ?').get(BACKFILL_MARK);
    if (done) return { ran: false };
    const users = await tx.prepare('SELECT id, role FROM crm_users').all();
    let granted = 0;
    for (const u of users) {
      for (const area of u.role === 'admin' ? ['academy', 'tc'] : ['academy']) {
        const has = await tx.prepare('SELECT 1 AS x FROM crm_user_areas WHERE user_id = ? AND area = ?').get(u.id, area);
        if (has) continue;
        await tx.prepare('INSERT INTO crm_user_areas (user_id, area, granted_at, granted_by) VALUES (?,?,?,?)').run(u.id, area, at, 'first boot');
        await tx.prepare('INSERT INTO crm_user_area_log (user_id, area, action, at, by) VALUES (?,?,?,?,?)').run(u.id, area, 'grant', at, 'first boot');
        granted += 1;
      }
    }
    await tx.prepare('INSERT INTO sync_state (name, value, ran_at, detail) VALUES (?,?,?,?)')
      .run(BACKFILL_MARK, 'done', at, `${users.length} accounts, ${granted} areas given`);
    return { ran: true, accounts: users.length, granted };
  });
}

/** People and access: every account with its areas, and the latest changes. Never a password or a hash. */
export async function accessList(db) {
  const users = await db.prepare(`SELECT id, email, display_name, role, active, last_login_at FROM crm_users
    ORDER BY display_name, email`).all();
  const rows = await db.prepare('SELECT user_id, area FROM crm_user_areas').all();
  const by = new Map();
  for (const r of rows) { if (!by.has(r.user_id)) by.set(r.user_id, []); by.get(r.user_id).push(r.area); }
  const log = await db.prepare(`SELECT l.at, l.area, l.action, l.by, u.display_name, u.email FROM crm_user_area_log l
    LEFT JOIN crm_users u ON u.id = l.user_id ORDER BY l.id DESC LIMIT 30`).all();
  return {
    areas: AREAS.map((id) => ({ id, label: AREA_LABEL[id] })),
    users: users.map((u) => ({ id: u.id, email: u.email, name: u.display_name || u.email, role: u.role,
      active: Number(u.active) === 1, lastLogin: u.last_login_at || null, areas: (by.get(u.id) || []).filter((a) => AREAS.includes(a)).sort() })),
    log: log.map((l) => ({ at: l.at, area: l.area, action: l.action, by: l.by, who: l.display_name || l.email || '' })),
  };
}
