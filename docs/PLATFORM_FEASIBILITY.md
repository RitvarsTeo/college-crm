# Should the Academy CRM be built on an existing CRM codebase?

**Feasibility investigation, 25.09.2026.** No decision taken, nothing built, nothing changed.

The question Ritvars asked: we use ready-made toolstacks in Python, so could we take an existing
open-source CRM and adjust it rather than continue building our own?

**Read the honesty section at the end before acting on any of this.** I have not installed or run
any candidate. Everything below is documentation, a third-party benchmark, and measurements of our
own repository.

---

## 1. The criteria, and where they come from

Not invented. Each one traces to a constraint Ritvars or Aigars has already set.

| # | Criterion | Where it comes from | Weight |
|---|---|---|---|
| **C1** | Runs on genuinely free hosting, no payment card | Owner decision 25.09.2026: "I will NOT pay for Render or enter payment details" | **Hard. A candidate that fails this is out.** |
| **C2** | Provides real sign-in | Our largest gap. `x-acting-as` is a header the browser sets and the server believes. Zero hits for password, session, oauth, jwt or bcrypt in `server.js` | High |
| **C3** | Provides durable Postgres storage | Second gap. Today SQLite in `/tmp`, wiped on every restart | High |
| **C4** | Can represent stage exit criteria, activities and inactivity follow-up | The agreed work model | High |
| **C5** | The 14 channel adapters can survive | 590 lines of adapter plus handshake, signature and body-parsing work found by testing against real provider shapes | High |
| **C6** | Stays simple for Ieva | Aigars asked for six screens and had the Documents card deleted for clutter | High |
| **C7** | Licence permits our use | Novikontas would not distribute it, so AGPL is tolerable, but it constrains any future commercial use | Medium |
| **C8** | Adaptation effort | Time is the real budget | Medium |
| **C9** | Project will still exist in three years | A dead dependency is worse than our own code | Medium |

---

## 2. What we already own

Measured, not estimated.

| What | Lines | Would a CRM ship this? |
|---|---|---|
| 14 channel adapters, one inbound contract, Meta handshake, form-encoded and Pub/Sub parsing | 590 | **No** |
| Qualification gates, identity matching, ageing, routing, handover gap | 532 | Partly. Identity matching on the last 8 digits of a phone, no |
| PBX poller with Riga working time; Gmail service account with domain delegation | 414 | **No** |
| Reading programme and intent out of Latvian message text | 184 | **No** |
| The shared-password door | 157 | Irrelevant, it would be replaced by real sign-in |
| Business encoded as data: config, channel register, locked decisions | 1,960 | **No** |
| Tests proving all of it | 346 tests | **No** |

The channel work is the part nobody else has, and it is the part Ritvars has spent the most owner
decisions on: the PBX queue mapping, the WhatsApp number, the Meta administrator, the spam filter
that keeps "Hi" and drops sales pitches.

---

## 3. The candidates

From the Marmelab 2026 open-source CRM benchmark, plus direct checks of project documentation.

### Twenty
TypeScript, Nest.js, React, GraphQL. AGPL-3.0. Rated highest in the benchmark.

**Fails C1 outright.** Self-hosting is four containers - app, background worker, PostgreSQL and
Redis - behind a reverse proxy with TLS. Minimum 2 GB RAM, 4 GB recommended, one hosting guide
recommends 8 GB. The background worker queue requires Redis. This cannot run on a free tier; it
needs a paid VPS.

### Atomic CRM
React, shadcn-admin-kit, Supabase, PostgreSQL. **MIT.** About 15k lines. Contacts, tasks with
reminders, notes, kanban pipeline, aggregated activity history, custom fields, import and export,
and **multi-provider authentication: Google, Azure, Keycloak, Auth0**.

**Passes C1.** The frontend is a static React build; the backend is Supabase. Ritvars already has a
Supabase organisation, and a new project there costs **0 per month**, confirmed against the live
API on 24.09.2026.

**Conflict of interest to note:** the benchmark that rates Atomic CRM 8/10 is written by Marmelab,
who make Atomic CRM. Its 1.3k stars and 821 forks are a small community for something we would
depend on.

### EspoCRM
PHP, MySQL. AGPL-3.0. Roughly 90% configurable from an admin panel without forking. The benchmark
notes a "complex homemade framework" that limits deeper customisation.

**Fails C1.** PHP plus MySQL needs a VPS.

### SuiteCRM
Matches Salesforce feature-for-feature. Benchmark score 5/10, "significant technical debt", heavy
to run. **Fails C1 and C6.**

### Odoo, ERPNext, Axelor
ERP scope. The benchmark calls them unsuitable for small teams. **Fails C6.**

---

## 4. Scored

| | Twenty | **Atomic CRM** | EspoCRM | SuiteCRM |
|---|---|---|---|---|
| C1 free hosting | **FAIL** | **PASS** | FAIL | FAIL |
| C2 sign-in | yes | **yes, four providers** | yes | yes |
| C3 Postgres | yes | **yes, Supabase** | MySQL | MySQL |
| C4 model fits | good | good | good | good |
| C5 channels survive | rebuild as plugins | rebuild as Supabase functions | rebuild | rebuild |
| C6 simple for Ieva | moderate | **good, 15k lines** | poor, full suite | poor |
| C7 licence | AGPL-3.0 | **MIT** | AGPL-3.0 | AGPL-3.0 |
| C8 effort | high | **medium** | high | very high |
| C9 longevity | strong, funded | **weak, one consultancy** | strong | strong |

**Only one candidate survives the hard constraint.** Everything except Atomic CRM needs a paid
server, and paying was ruled out this morning.

---

## 5. The three honest paths

### Path A - carry on as we are
Finish the work model, then port SQLite to Postgres and add sign-in ourselves.

- **Cost:** the Postgres port is 200 call sites across 77 synchronous functions, plus sign-in from
  nothing. Days, not hours.
- **Keeps:** everything. 346 tests stay meaningful.
- **Risk:** we write authentication ourselves, which is the one area where writing it yourself is
  usually worse than using something proven.

### Path B - move onto Atomic CRM
Adopt its person, task, note and activity model; rebuild the channel intake against Supabase.

- **Cost:** learn a codebase, re-express 590 lines of adapters plus the PBX and Gmail pollers, and
  re-prove them. The 346 tests do not transfer. Add the Latvian extraction and the identity rules
  back on top.
- **Keeps:** authentication, Postgres, and the standard model, free.
- **Risk:** C9. A consultancy showcase with 1.3k stars becomes a dependency for Novikontas
  admissions. And Ieva gets sales vocabulary - deals, pipelines - rather than admissions.

### Path C - steal only the part we lack
Keep our CRM. When the Postgres port happens, put it on Supabase, and take **authentication** from
a proven library rather than inventing it.

- **Cost:** the same Postgres port as Path A, minus writing sign-in.
- **Keeps:** everything, including the tests.
- **Risk:** lowest. It is the Python-toolstack instinct applied where it actually pays.

---

## 6. What is genuinely unknown, and how to settle it cheaply

None of these needs a decision today. Each is a timeboxed check.

| # | Unknown | How to resolve | Cost |
|---|---|---|---|
| 1 | Does Atomic CRM actually run on Supabase free, or does it assume a self-hosted Supabase with Docker? Its README requires Docker locally, which may be development only | Deploy it once against a free Supabase project | Half a day |
| 2 | Can a custom inbound webhook be added without forking? Every channel depends on it | Read its API integration docs; try one endpoint | Two hours |
| 3 | Can its pipeline express stage exit criteria, or only stages? | Open the demo | One hour |
| 4 | Is Marmelab maintaining it, or is it a showcase? Commit cadence over the last 12 months, issue response time | Read the repository | One hour |
| 5 | What does Ieva actually see? Deal and pipeline wording may be unacceptable after Aigars's clutter decisions | Show her the public demo | Thirty minutes |

**Question 5 is the cheapest and the most decisive.** If Ieva looks at the demo and it reads as a
sales tool, Path B is over regardless of the engineering.

---

## 7. What this investigation does NOT establish

Said plainly, because the rest of the document reads more confident than the evidence supports.

- **Nothing here was run.** No candidate was installed, deployed or tested. Every claim about
  Twenty, Atomic CRM, EspoCRM and SuiteCRM comes from their documentation and one third-party
  benchmark.
- **The benchmark has a conflict of interest.** Marmelab wrote it and make Atomic CRM, which they
  scored 8/10 and placed second. Their scores for competitors may still be fair, but they are not
  disinterested.
- **The Supabase free-tier claim is second-hand for Atomic CRM.** What was verified on 24.09.2026
  is that a new project in Ritvars's organisation costs 0. Whether Atomic CRM runs inside free-tier
  limits was not tested.
- **The effort estimates are mine, not measured.** The only measured numbers in this document are
  our own line counts and the 346 tests.
- **"Rebuild as plugins" hides real variance.** Re-expressing the Meta handshake, the signature
  check and the form-encoded parsing inside somebody else's framework could be two days or two
  weeks, and I do not know which.

---

## 8. Recommendation

**Path C**, and do question 5 this week because it costs thirty minutes and can end the debate.

The reasoning is not that the platforms are bad. It is that the only one which survives the free
hosting constraint is also the one with the weakest longevity, and the thing we would gain from it -
authentication - can be taken on its own without adopting a whole codebase, a whole vocabulary and a
whole dependency.

**What would change this:** if Novikontas needs a CRM beyond admissions - sales, partners, alumni,
courses - a platform starts to earn its overhead, and building a second bespoke system later would
be the real mistake. That is a business question about scope, and nobody has asked it yet.
