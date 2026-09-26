# Phase 1 - make database access asynchronous, with SQLite still underneath

**Plan written before any edit, 26.09.2026.** SQLite stays. No Postgres, no Supabase, no data
migration, no product or workflow change.

## What is actually being changed, and why it is not a refactor for its own sake

`node:sqlite` is **synchronous**. Every Postgres client is not. So the barrier to Postgres is not the
SQL - that was measured and is almost entirely portable - it is that 364 call sites expect a row to
come back from a function call rather than from a promise.

Phase 1 does that conversion **while the backend is unchanged**, so the 511 tests prove the
conversion on its own. Phase 2 then swaps SQLite for Postgres behind an interface the codebase
already speaks. One risky change becomes two verifiable ones.

## The interface

There is **no abstraction today**: `openDb()` returns a raw `DatabaseSync` and every consumer calls
`node:sqlite` directly. Phase 1 introduces the layer.

The shape is chosen to be the smallest possible diff at the call sites AND to map onto `pg` without
another rewrite later:

```js
const row  = await db.prepare(SQL).get(a, b);    // was: db.prepare(SQL).get(a, b)
const rows = await db.prepare(SQL).all(a);
const info = await db.prepare(SQL).run(a);       // { changes, lastInsertRowid }
await db.exec(SQL);
```

`prepare()` stays synchronous and only captures the SQL - it is `get`/`all`/`run` that await. That
means a call site changes by exactly one word. Under Postgres the same three methods become
`pool.query(sql, params)` returning `rows[0]`, `rows`, and the row count.

`openDb()` becomes **async**, because creating the schema is a query and under Postgres it cannot be
anything else.

## Order - callees before callers

Measured from the import graph, not assumed.

| # | Unit | Sites | Why here |
|---|---|---|---|
| 1 | `db.js` | 1 | The wrapper itself. Nothing works until it exists |
| 2 | `history.js` `identity.js` `feedback.js` `real.js` `reports.js` `seed.js` `snapshot.js` `bootstrap.js` | 38 | True leaves: none imports another database module |
| 3 | `simulator.js` | 25 | Imports `history.js` |
| 4 | `intake.js` | 29 | Imports `history.js`, `identity.js` |
| 5 | `demo.js` | 6 | Imports `intake.js`, `history.js` |
| 6 | `server.js` | 106 | Imports all of the above |
| 7 | `scripts/manage_users.mjs` | 8 | Standalone, imports `db.js` |
| 8 | `test/*.js` | 151 + 83 `openDb()` | Converted with the module each exercises |

## Checkpoints, and an honest note about them

**The full suite cannot be green in the middle of this**, and pretending otherwise would be the
dishonest part of a plan like this. The moment `intake.js` returns promises, `server.js` is wrong
until it is converted too. There is no safe half-state, and faking one with a dual-mode wrapper
would be exactly the hack rule 8 forbids.

So the checkpoints are:

| Checkpoint | What is verified |
|---|---|
| **A** after units 1-2 | Every touched file parses; the leaf modules' own tests pass where those tests do not also go through `server.js` |
| **B** after units 3-5 | Every touched file parses. Suite still red by design - `server.js` is not converted |
| **C** after units 6-7 | Server boots. A live request answers |
| **D** after unit 8 | **Full suite green: the real checkpoint** |

Anything red at D is diagnosed before anything else proceeds.

## Rules held throughout

- SQLite stays. No Postgres, no Supabase project, no data migration
- No product or workflow behaviour changes. `WORKFLOW_MODEL.md` stays unimplemented specification
- No synchronous-Postgres trick, no worker thread, no dual database, no blocking mechanism
- Callers and callees converted properly, not patched around
- Where async propagation forces a signature change, the smallest equivalent one

## What the conversion actually found (completed)

Result: **511 of 511 tests pass**, 22 of 22 modules load, 0 remaining synchronous
database access outside `src/db.js`. Baseline before the work was also 511, so no
test was lost, skipped or weakened.

The migration's real risk was never a crash. It was the family of mistakes that
**parse, run, and quietly produce the wrong value**. Seven distinct shapes turned
up, and only the last three were caught by a test:

| # | Shape | Why it is silent |
|---|---|---|
| 1 | `await f(x).n` | `await` binds to the whole expression, so `.n` is read off a Promise and is `undefined` |
| 2 | `await f(x)[0]` | Same, through an index. Every "does the chain continue?" rule looked for a DOT and missed the bracket |
| 3 | `.map(async …)` / `.filter(async …)` | Returns an array of Promises. A Promise is truthy, so `.filter` keeps every element |
| 4 | `.forEach(async …)` | The callback's promise is discarded entirely; the loop finishes before any write happens |
| 5 | `{ ...modeState() }` | Spreading a Promise contributes **no keys at all**. No error, and the field is simply absent |
| 6 | `import { report as buildReport }` | The alias appears nowhere in the module that defines it, so name-based propagation cannot see it |
| 7 | `snapshot.write(db)` | Namespace-qualified, so it is preceded by a dot - the very thing the `(?<![\w.$])` guard exists to reject |

Shapes 5, 6 and 7 share one root cause worth remembering: **the guard that stops
`db.prepare(...)` being mistaken for a bare `prepare(...)` also hides `...spread()`,
`ns.method()` and aliases.** Three separate blind spots, one regex.

### Two things no static check would have settled

- **`db.exec('BEGIN')` / `'COMMIT'` / `'ROLLBACK'` were not awaited** in
  `feedback.js` and `snapshot.js`. On SQLite the work happens before the promise
  resolves, so the transaction looks correct and the suite is green. On Postgres
  the statement is only *scheduled*: an un-awaited `BEGIN` can be overtaken by the
  writes it was meant to wrap. This changes nothing today, which is exactly why it
  had to be found now.
- **A leaked Promise is detectable at runtime, not by reading code.** Walking the
  real return value of the read APIs and asking `instanceof Promise` at every node
  found 7 leaks that four separate regex audits had all called clean - and cleared
  a site those same audits had flagged as broken.

### Tests

One conversion changed a test's meaning rather than its plumbing:
`assert.throws(() => logEvent(...))` became `await assert.rejects(async () => logEvent(...))`,
because an async function rejects and never throws. Left alone it fails in the
reassuring direction - "Missing expected exception" reads like the guard under
test has gone missing, when the guard is intact and the assertion is asking the
wrong question. The replacement pattern was checked in both directions: it passes
when the call rejects, and it fails when nothing rejects.

`src/app.html` is deliberately untouched by this work.
