// The whole CRM, as ONE Vercel function. vercel.json sends every path that is
// not a file of its own here, and src/server.js answers it exactly as it answers
// on a laptop: same routes, same door, same sign-in.
//
// The import is the boot. It opens the database, lays down the demo on an empty
// one and provisions the accounts - once per instance, not once per request.
// A request that arrives while an instance is still booting waits for it.
//
// Every route lives in src/server.js. Nothing is re-declared here, so the two can
// never disagree about what the application does.
let ready = null;

export default async function crm(req, res) {
  ready ||= import('../src/server.js');
  const { handle } = await ready;
  return handle(req, res);
}
