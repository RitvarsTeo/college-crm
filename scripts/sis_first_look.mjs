// The same first look as GET /api/admin/sis/first-look (src/sisfirstlook.js), for a machine that
// has SIS_API_TOKEN in its environment. The Vercel CLI does NOT give production secrets to a local
// machine, so on this PC use the route instead (signed in as an admin). Shape only; read-only.
import { firstLook } from '../src/sisfirstlook.js';

console.log(JSON.stringify(await firstLook(), null, 2));
