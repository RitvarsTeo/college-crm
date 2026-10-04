# Ieva and Aigars feedback - closure matrix, 02.10.2026

Session 5, branch `audit/2026-10-02-feedback-closure-s5`, cut from `ui/2026-10-02-journey` at
`561bce2`. **944/944. NOTHING DEPLOYED.** Production is still `292b4f9`.

**Sources read:** `docs/IEVA_AIGARS_FEEDBACK_VERBATIM.md` (the record), `docs/BACKLOG.md` (rows
40-71, 106-124, the 28-29.09 Aigars passes, the 01.10 "actionable items finished" table, the 02.10
handoff), `docs/DECISIONS.md` (decision 8, D-C1 to D-C8), `../MVP_MAP.md` (IEVA-1), KB 08 P5/P8,
the code on this branch, and the sibling lane `ui/2026-10-02-main-ab` (`1bc018d`).

**How each line was checked:** clicked on the running app (`intake-closure-s5`, port 8875,
synthetic data, in memory), plus the test named. "DONE" means seen working, not read in code.

**Rule:** every line ends DONE or BLOCKED. A business rule was never invented to close one.

## The matrix

| # | Item | Source | Current state (seen) | Action | Test | Commit | Status |
|---|---|---|---|---|---|---|---|
| 1 | **Cold / Reject: the data survives a deploy** | Ieva 30.09 10:14; MVP map IEVA-1 | `closed_tag` was in CREATE TABLE only. Production's `people` table exists, so on deploy **every status change** (the route clears the tag on any stage) would fail on a missing column | Added to `ADDED_COLUMNS`: one `ALTER TABLE people ADD COLUMN closed_tag TEXT` at boot | `closed_tag.test.js`: old DB, column dropped, reopened | `0e1da1d` | **DONE** |
| 2 | **Cold / Reject: offered on every close path** | same | The close dialog offered it; **the People quick edit could set Not proceeding with no tag at all** | Same two choices from `config.closedTags` on the quick edit; tag sent | `closed_tag.test.js`; closed a person from People as Cold, read back `closed_tag=cold` | `1345cd7` | **DONE** |
| 3 | **Cold / Reject: readable, "priekš statistikas"** | same | Stored, **shown nowhere** | **Person page** (this branch): Cold or Reject beside the reason. **Outcomes rows, counts and the Cold / Reject filter: owned by the UI/UX lane** `ui/2026-10-02-main-ab` (counts + filter `714302b`/`80d7e63`; row chip being restored there). This branch first drew them too (`1345cd7`), and QA S6 found the collision; removed here (`7cce0f8`) | `closed_tag.test.js` (person page) | `1345cd7`, `7cce0f8` | **DONE** - released 04.10 in `62f8178`: person page here, Outcomes chip + counts by the UI/UX lane |
| 3b | Cold / Reject: the FORM of that screen | MVP map A/B | The UI/UX lane shows the versions on Outcomes | none here | - | - | **BLOCKED** - **Ritvars** - "i just need to view which one i like more" (02.10): yes, pick when the UI/UX lane puts the versions up |
| 4 | Cold / Reject: going back clears the tag | Ieva: "a cold one sometimes becomes an active lead again" | Moved the Cold person back to New: `closed_tag` null, appears under No next step | none needed | `closed_tag.test.js` | `b5f3a4c` | **DONE** |
| 5 | Cold / Reject: marketing to the cold ones | Ieva 30.09; Ritvars 02.10 "if you can ... implement some mvp idea, ok" | All people > Stage: "Not proceeding · Cold" / "· Reject" lists exactly them, with phone and email. Nothing is sent from Intake; marketing consent is not decided by a filter | MVP filter | `closed_tag.test.js`; one Cold person listed alone on the running app | `2daecee` | **DONE** (MVP) |
| 6 | **Journey stage terminology** | Aigars row 50; D-C1; Ritvars 02.10 "Isnt this already inside of a tab that we have a name for?" | Yes: the five Journey stages are named (New, Contacted, Follow-up, Application, Contract) plus Admitted and Not proceeding. **The current names stand** (Ritvars 02.10); renaming later is a config edit | none | stageRoles tests | `4f60a2e` (decision) | **DONE** |
| 7 | **Item-by-item Next Step model: shown** | Aigars row 51; D-C3; Ieva 29.09 | Journey > "What comes next" > **Step by step**: 5 steps, each its own count and filter | none | suite | `285d4ec` | **DONE** |
| 7b | Next Step model: the LIST itself | D-C3; Ritvars 02.10 "an algorithm that depends on at what stage the lead is ... lets create mvp" | The steps offered follow the stage, by group (`config.stepGroupsByStage`); Answer the question and Call back fit every stage; the planned step is never hidden. New 10 of 20, Contract 7 | MVP built | `steps_by_stage.test.js`; Plan a next step and Done on the running app | `40d6487` | **DONE** (MVP, Ieva tunes it in config) |
| 7c | Next Step: writing it keeps your place | Aigars rows 47/116 quick edit; Ieva's Next Steps | **Three defects found by clicking:** the Journey card's **Edit** did nothing; **saving a note** jumped to the person page under a `#/journey` address and the thread stayed stale until reload; **Plan a next step** from Today jumped the same way | Edit opens All people with the form; note and plan redraw the screen they were made on; the Journey thread is re-read | `journey_edit_button.test.js`, `note_stays_put.test.js` (cache line sabotaged: red) | `7c3f30a`, `a6a290f`, `80710a6` | **DONE** |
| 8 | **Outcome reasons: the model** | Decision 8; D-C4; Ieva | 10 reasons in config, the server refuses a close without one and "Other" without a note; Outcomes lists all ten with counts, unused at zero | none | `outcome_reasons.test.js` | `e8896dc` | **DONE** |
| 8b | Outcome reasons: the WORDING | Decision 8; Ritvars 02.10 "an algorithm that depends on persons journey ... lets create mvp" | The reasons offered follow the stage left (`config.closedReasonsByStage`): New 6 of 10, Contract 7; Other always; the server still accepts all ten | MVP built | `reasons_by_stage.test.js`; close dialog on the running app | `296f7ca` | **DONE** (MVP) |
| 9 | Finished means finished | IEVA-3/4/5, 30.09 | Closing finished the open step; the cold person had no step left | none | suite | `7d1bab5`, `ffd7e54` (replays of `ff3b444`, `7b327bd`) | **DONE** |
| 10 | **Feedback / history: per-person thread** | Aigars #3 (28.09) | Thread on the Journey card; a note written there appears at once (count 2 -> 3), newest first | stale-thread fix, row 7c | `note_stays_put.test.js` | `285d4ec`, `a6a290f` | **DONE** |
| 10b | History visibility | DECISIONS 2 / row 12; Ritvars 04.10 "Ieva is the main user, she needs to see the full picture" | Ieva signs in as edu@ = "Admissions". `config.historyReaders` (Admissions, Ieva) sees every line and every colleague's correction, on each person page and in the log. Everybody else keeps own actions only | built | `history_admissions_reads_all.test.js` (real server) | see commit | **DONE** |
| 10c | In-app feedback (HELP pill, readers Aigars + Ritvars only) | Aigars rows 49, 66, 67 | Built 24.09, sabotage-proven tests | none | `feedback.test.js`, `feedback_question.test.js` | 24.09 | **DONE** |
| 10d | Being told outside the app that feedback arrived | row 67, open question 13 | In-app count only; the app sends no mail | none | - | - | **BLOCKED** - **DECIDED 04.10: emailed to Ritvars, sent from ritvars.vilcins@novikontas.org.** Not built: needs his one-time Google OK for sending - **Ritvars** - one Google consent click when the code is ready |
| 11 | **Phone chart readability** | Aigars 28.09 "Phone Home chart labels are tiny" | Measured at 375 px: 12.5 px labels, 5 month ticks 58 px apart, no overlap, newest month kept, all 10 columns carry an aria-label | none | suite | `285d4ec` | **DONE** |
| 12 | Add a lead | Ieva 29.09; Ritvars 02.10 "in inbox the channel automation results only. Leads are leads" | **Moved:** no add button on the Inbox; "Add lead" on Journey and All people; In person (walk-in) is the default; a lead added there is New with a next step and never in the Inbox | moved | `ieva_feedback.test.js`; added one on the running app | `6d95ffd` | **DONE** - tell Ieva the button moved to People |
| 13 | Contact + notes on each Next Steps row | Ieva 29.09 11:28 | Today rows carry phone, email and the note; she confirmed 30.09 | none | `ieva_feedback.test.js` | 29.09 | **DONE** |
| 14 | Metrics first, journey in order, overdue and today first | Ieva 29.09, praise | Home opens on figures; Today: Overdue, Due today, Coming up, No next step | none | suite | - | **DONE** |
| 15 | Unanswered calls in New Leads | Ieva 30.09 10:16; Ritvars 02.10 | A new caller goes to the Inbox (already so). **A missed call from a known lead plans a "Call back" step in Today**, due when they rang, one at a time, none for a finished person | built | `pbx_filter.test.js` (3 new) | `1372ed6` | **DONE** |
| 16 | Ieva 10:23: an admitted lead still shows in Next Steps as overdue | Ieva 30.09, full text pasted 02.10 | On production (02.10 backup) r0062 was admitted 07:21 and a step created 07:24, so the 30.09 fix never saw it, and `/api/tasks` (what Today reads) had no "still open" rule | `/api/tasks` now leaves finished people out; the leftover stays on their page under Still open | `ieva_finished_person.test.js` reproduces r0062; on the running app the admitted person left Today | `85db4bd` | **DONE** (on deploy, r0062 leaves Next Steps with no data change) |
| 17 | "Not clear yet" | Aigars row 108; D-C2 | There is no "not clear yet" pile any more; an unclear message gets a next step like anyone. Nothing left to decide (Ritvars 02.10 "huh???") | none | - | `4f60a2e` | **DONE** |
| 18 | Does a human filter before Intake | Aigars row 52; Ritvars 02.10 "a wider filter to let in more messages ... All of that should come in" | Matches decision 1a: only spam, our own addresses and automatic senders are set aside; everything else comes in, into one `inbound` table with the same contact columns for every channel. AI sorting is Stage 2 | none | `pbx_filter`, `gmail` tests | `4f60a2e` | **DONE** |
| 19 | Lifecycle facts | Aigars #4; Ritvars 02.10 "I dont really see how this needs my decision" | Correct, it does not. Built and running; the 02.10 backup has 0 facts and only the 6 SIS test rows, so no real applicant has come through yet | none | `lifecycle.test.js` | `1780c71` | **BLOCKED** - waits on the first real SIS applicant, nobody's decision - check `lifecycle_events` in the next backup |
| 20 | Aigars #5 | 28.09 | Ritvars 02.10: "if there is none, there is none. you may delete" | deleted | - | `4f60a2e` | **DONE** (deleted) |
| 21 | Update when real channels connect; V1 overview; then the domain | Aigars 30.09 10:01 | **Settled on evidence:** the 02.10 production backup `_backups/2026-10-02T01-17-43Z` holds 44 `source=provider` inbound rows, phone 4 (calls of 30.09, daily pull) and gmail 40 (edu@, option B). Re-counted by this session from `data/inbound.jsonl`. **Phone is live verified; continuity after 01.10 is unproven.** Recorded in `1a09a87` (control) and `f388dcc` (channels). The other 10 channels still wait on their owners | none in this lane | - | `1a09a87`, `f388dcc` | **BLOCKED** - nothing tells Aigars yet, and the V1 "ready for real use" point is not written - **Ritvars** - **DECIDED 02.10 by Ritvars: Aigars gets one status update when everything is done**, not piecemeal; then the domain follows his go |
| 22 | D-C5 drag backwards, D-C6 Home KPIs, D-C7 person facts, D-C8 Marketing's part; Journey summary | DECISIONS 28.09; MVP map | **Journey summary: ship** (Ritvars 02.10). The four D-C items stay open with their owners | none | - | `4f60a2e` | **BLOCKED** - **Ieva** (C5, C7), **Ritvars** (C6), **Aigars + Tetiana** (C8) |
| 23 | `--v-open:#F7C04F` as a data colour | KB 08 P5 | Fixed to mustard `#E0A526` on lane `ui/2026-10-02-main-ab` (`1bc018d`, read). Not on this branch, deliberately not duplicated | none here | `metrics_colours.test.js` there | `1bc018d` | **DONE** - `1bc018d` released 04.10 in `62f8178`; `--v-open:#E0A526` on release |

## Release notes for whoever deploys this

- **Schema change on production:** `0e1da1d` adds one column, `people.closed_tag TEXT`, at boot,
  through the same `ADDED_COLUMNS` path `nationality` and `inbound.source` used. Read-only check
  after deploy: the column exists, every row is NULL.
- Without `0e1da1d`, `b5f3a4c` must not ship: every status change would fail.
- `doNote` and `doNewTask` now call `route()` off the person page. The classic UI uses the same
  `#/person/` address, so it keeps its behaviour.

## Found and not mine

- Synthetic seed steps ("Check the documents", "Prepare the contract"...) are not in
  `config.nextActions`, so "What comes next" shows all 34 under **No group**. On production the
  imported steps ("Get in touch (from the sheet)") will do the same until steps are planned from
  the list. Honest, not a bug, but the group row says little until then.
