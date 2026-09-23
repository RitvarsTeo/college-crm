// Europe/Riga, explicitly, everywhere.
//
// The PBX speaks Riga-local wall-clock time in both directions: the window we
// ask for is Riga-local, and every `created_at` it returns is Riga-local. The
// database stores absolute instants. So every crossing between the two has to
// name the zone, and none of it may depend on what timezone the server happens
// to be in.
//
// Latvia is EET (+02:00) in winter and EEST (+03:00) in summer. NEITHER OFFSET
// IS WRITTEN DOWN ANYWHERE IN THIS FILE. The offset is asked of the IANA time
// zone database through Intl, for the specific instant in question, so a
// transition Sunday is handled by the same code as any other day.
//
// No dependency: Intl with a timeZone IS the timezone-aware implementation, and
// it is already in the runtime. Adding a date library to do what the platform
// already does correctly would be a dependency for nothing.

export const ZONE = 'Europe/Riga';

const STAMP_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

// How far ahead of UTC the zone is AT THIS INSTANT, in minutes. Read from the
// zone database, never assumed.
export function offsetMinutesAt(instant, zone = ZONE) {
  const at = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(at.getTime())) throw new TypeError('offsetMinutesAt: invalid instant');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const g = (type) => Number(parts.find((p) => p.type === type).value);
  // en-US with hour12:false renders midnight as 24, so fold it back to 0
  const asIfUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return Math.round((asIfUtc - at.getTime()) / 60000);
}

// An absolute instant -> the wall clock a person in Riga would read, in exactly
// the shape the PBX wants: YYYY-MM-DD HH:MM:SS.
export function toRigaStamp(instant, zone = ZONE) {
  const at = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(at.getTime())) throw new TypeError('toRigaStamp: invalid instant');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const g = (type) => parts.find((p) => p.type === type).value;
  const hh = String(Number(g('hour')) % 24).padStart(2, '0');
  return `${g('year')}-${g('month')}-${g('day')} ${hh}:${g('minute')}:${g('second')}`;
}

// A Riga wall clock -> the absolute instant it names.
//
// Every offset the zone uses within three hours either side is tried, and the
// candidates that read back as the requested wall clock are the answers. On an
// ordinary day there is exactly one. On a transition Sunday there can be two or
// none, and both cases are handled below rather than guessed at.
//
// AMBIGUITY, STATED: when the clocks go back, 03:30 happens twice and the stamp
// alone cannot say which one. This returns the FIRST occurrence (the summer
// offset). The PBX gives us no way to tell them apart, so the choice is
// documented rather than hidden.
export function fromRigaStamp(stamp, zone = ZONE) {
  const m = STAMP_RE.exec(String(stamp || '').trim());
  if (!m) throw new TypeError(`fromRigaStamp: expected YYYY-MM-DD HH:MM:SS, got ${JSON.stringify(stamp)}`);
  const [, Y, Mo, D, H, Mi, S] = m;
  const wanted = `${Y}-${Mo}-${D} ${H}:${Mi}:${S || '00'}`;
  const naive = Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +(S || 0));

  // Every offset the zone is using anywhere near this wall clock. Reading the
  // zone database on both sides of the moment is what makes a transition day
  // behave like any other day.
  const nearby = new Set([
    offsetMinutesAt(new Date(naive), zone),
    offsetMinutesAt(new Date(naive - 3 * 3600000), zone),
    offsetMinutesAt(new Date(naive + 3 * 3600000), zone),
  ]);

  const candidates = [...nearby]
    .map((off) => naive - off * 60000)
    .filter((ms) => toRigaStamp(ms, zone) === wanted)
    .sort((a, b) => a - b);

  // Ambiguous (clocks went back): two instants read the same. Take the first.
  if (candidates.length) return new Date(candidates[0]);

  // Skipped (clocks went forward): that wall clock never happened. Rather than
  // invent an instant, return the moment the clock first reached that reading.
  let guess = naive - offsetMinutesAt(new Date(naive), zone) * 60000;
  guess = naive - offsetMinutesAt(new Date(guess), zone) * 60000;
  return new Date(guess);
}

// The polling window, as absolute instants and as the two Riga stamps the PBX
// is asked for. Subtracting on the instant means a DST change can never make
// the window shorter or longer than the minutes asked for.
export function pollWindow(minutes, now = new Date(), zone = ZONE) {
  if (!Number.isFinite(minutes) || minutes <= 0) throw new TypeError('pollWindow: minutes must be positive');
  const to = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (Number.isNaN(to.getTime())) throw new TypeError('pollWindow: invalid now');
  const from = new Date(to.getTime() - minutes * 60000);
  return {
    from, to,
    dateFrom: toRigaStamp(from, zone),
    dateTo: toRigaStamp(to, zone),
    minutes,
    zone,
  };
}

// For a log line that a human in Riga has to read.
export const rigaLabel = (instant, zone = ZONE) => `${toRigaStamp(instant, zone)} ${zone}`;
