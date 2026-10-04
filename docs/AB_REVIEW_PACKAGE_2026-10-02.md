# Intake - A/B review package, 02.10.2026 (Session 6, QA / final control)

Branch `qa/2026-10-02-final-control-s6`, cut from `ui/2026-10-02-journey` @ `561bce2`.
**Nothing deployed. Nothing merged into any real branch. No C. No winner.**
Every check below was run by this session today unless it says otherwise.

## 1. Current authoritative state

| | State | How I know |
|---|---|---|
| Production | **`292b4f9`**, unchanged | GET at the end of this run: 367,029 bytes = `292b4f9` app.html (366,424) + the 605-byte sign-in script. Same as the morning proof |
| Run baseline | `561bce2`, **933/933** | run here |
| Authoritative control doc | `docs/INTAKE_CONTROL_2026-10-02.md` on `control/2026-10-02-s1` (`1a09a87`) | read |
| Real provider data in production | **44 rows**: Phone 4, Gmail (edu@) 40, all still `state=new` | I re-counted the backup `_backups/2026-10-02T01-17-43Z` myself, counts only |
| `intake.novikontas.org` | does not resolve yet | GET returned no host |

Product boundaries hold on every branch: MAIN, CHANNELS and APPLICATIONS stay separate;
Applications lives **inside Reports** (no menu item); the lifecycle reads
`Channels -> Intake -> qualification / follow-up -> apply.novikontas.org -> payment -> SIS`
(drawn on Channels B); AI Review Stage 2 blocks nothing in V1.

## 2. MAIN A/B - Home (`ui/2026-10-02-main-ab` @ `07bac8b`, 963/963)

| | **A - Journey first** | **B - Today first** |
|---|---|---|
| Opens with | the lead's path left to right: Arrived 115 -> New 36 -> Contacted 44 -> Follow-up 7 -> Application 4 -> Contract 0 -> Admitted 25 / Not proceeding | "Needs you": Overdue 21, Due today 0, Inbox 0, No next step 57, then the journey as a list |
| Then | month chart, programme and source bars | four KPI cards, each with a delta row against the last complete month, basis named ("Sep 15 · vs Aug 10 · +5"), then the charts and the donut |
| Donut | none (the band already says where everyone is) | kept: true circle, mustard Open, one neutral plinth |
| Answers | "where is everyone on the way" | "what do I do first today" |

Open either with `?home=a` / `?home=b` or the switch on the page.

**Shared by both, not part of the choice:** the menu spine (hairline behind the icons, blue down to
where you are), mustard `#E0A526` for Open (it was signal amber), the donut's plinth, the month
chart's self-annotating peak, cold / reject counts, kit part 9 motion.

**Verified here, on the REAL dataset (local, in memory), 1440 and 375 px, light and dark:**
both render, both read live from `/api/report`, `/api/summary`, `/api/people`, `/api/intake`;
figures agree across A and B (21 overdue = 17 + 4); 0 console errors; no sideways scroll at 375;
2 scenes on Home in each variant; nothing scales a chart mark (bars and dots fade, the line draws).

**Found by QA and fixed by MAIN:** the donut rim was each slice's own colour, so a slice at the
bottom gained ink from its position (`0401016`, now one neutral plinth); the switch did nothing
under `?home=` (`07bac8b`); A printed 20.9% under "25 admitted" when the working is 24 / 115 (`07bac8b`).

## 3. CHANNELS A/B (`ui/2026-10-02-channels-s3` @ `f388dcc`, 937/937)

| | **A - Who acts next** | **B - What is proven** |
|---|---|---|
| Shape | a work queue: one lane per person (Oksana, Ritvars, the unheld decision, nobody) | a ledger: one row per channel through This machine -> Access -> Code deployed -> Production configured -> Live verified, every cell dated with its source |
| Each item | the action, the input it needs, the blocker, the gate ahead, where it delivers | an inspector holds blocker, action and every source |
| Answers | "who do I chase, for what" | "what is actually proven, and since when" |

Open with `?chv=a` / `?chv=b` or the switch.

**Channel truth, verified:** 12 active · Google Form **dropped** · Open Day **parked**, holds nobody ·
Website = the **Tilda enquiry form**, not apply.novikontas.org · apply.novikontas.org and SIS are
**downstream**, not counted · the screen says "local, not production" · no credential value anywhere.
**Live verified 2 of 12: Phone (daily pull) and Email (edu@ only).**

**Found by QA and fixed by Channels:** the first version said live verified 0 of 12 and called PBX
an open conflict, from a 30.09 Pin line. The 02.10 backup proves otherwise (`f388dcc`).

## 4. Applications (`ui/2026-10-02-applications-s4` @ `581a032`, 944/944)

One **Applications** chapter inside Reports / Full report (`#/reports/applications`):
apply.novikontas.org web stats (mustard) and the SIS funnel (blue). `GET /api/applications` is
SELECTs only, counts only, never calls the SIS. Locally it truthfully reads "SIS · Off, 0 counted".
Production would read "No real applicant yet" (only the 6 archived team tests exist).
**No A/B was built here.** The one real choice, the funnel basis, is in section 10.

## 5. Feedback closure (`audit/2026-10-02-feedback-closure-s5` @ `a3ff235`, 943/943 at `983be15`, tip is docs only)

`docs/FEEDBACK_CLOSURE_2026-10-02.md`: every Ieva and Aigars item ends DONE or BLOCKED with an owner.
Real bugs found by clicking and fixed: the Journey card's Edit button did nothing (`7c3f30a`);
a note written on the Journey jumped to the person page and the thread stayed stale (`a6a290f`);
Plan from Today jumped the same way (`80710a6`); cold / reject skipped on the quick edit (`1345cd7`).

**The most important find of the run - `0e1da1d`:** cold / reject added `closed_tag` only to
`CREATE TABLE`. Production's `people` table already exists and **has no such column** (checked in
the backup schema). Deployed as it stood, **every status change for every person would have failed.**
The fix adds it at boot (Postgres path checked). **Any release that takes MAIN must take `0e1da1d`.**

## 6. Test results (all run by this session)

| Build | Result |
|---|---|
| Baseline `561bce2` | 933 / 933 |
| MAIN `714302b` | 954 / 954 (tip `07bac8b`: 963 reported by MAIN) |
| Channels `49706ba` | 935 / 935 (tip `f388dcc`: 937 reported by Channels) |
| Applications `581a032` | 944 / 944 |
| **All five branches merged together (scratch only)** | **988 / 988** |

The combined scratch merge: only conflict is `docs/BACKLOG.md` (each session added a section at the
top; keep both). `src/app.html` merges clean. Browser pass on it, real dataset: every tab renders,
0 page errors, no sideways scroll at 375 px, dark mode correct.

## 7. Commits (all COMMITTED, none DEPLOYED, none merged)

- **control/2026-10-02-s1:** `1a09a87`
- **main-ab:** `1bc018d` mustard · `5e20aad` spine · `0401016` plinth · `714302b` Home A/B · `80d7e63` Journey columns + tag hand-over · `07bac8b` QA truth fixes
- **channels-s3:** `80de328` record · `49706ba` A/B · `0cdd4f3` docs · `f388dcc` live verified
- **applications-s4:** `581a032`
- **feedback-closure-s5:** `0e1da1d` migration · `1345cd7` · `7c3f30a` · `a6a290f` · `80710a6` · `943df41` matrix · `7cce0f8` · `983be15` · `a3ff235` item 21 re-cited
- **qa-s6 (this):** this file

Collision caught and resolved during the run: MAIN and Closure both built cold / reject on
Outcomes, then each removed theirs pointing at the other. MAIN is now the single owner and the row
tag is back (`07bac8b`); verified once in the merge.

## 8. Known blockers and data gaps

- BLOCKED - Phone continuity after 01.10 - Ritvars - one signed-in look at `#/channels`, or wait for the 03.10 backup
- BLOCKED - Website (Tilda) not configured - Ritvars - set `WEBSITE_FORM_SECRET`, paste the webhook in Tilda
- BLOCKED - Meta four - Oksana (access), then Meta (App Review)
- BLOCKED - LinkedIn - LinkedIn (Lead Sync approval); TikTok - Oksana (access), then TikTok
- BLOCKED - Agent - Novikontas, nobody named - which partner first, and who sets up the link
- BLOCKED - training@ mailbox - Marina - authorise option B for it, if it should be connected at all
- BLOCKED - real-applicant SIS checks - a real applicant must register
- BLOCKED - 6 AI Review decisions - the AI Review session - paste them in (Stage 2, not V1)
- BLOCKED - Journey stage names, outcome reasons, next-step list - Ieva
- Data gaps: 44 real provider rows all at `state=new`, nobody has processed them; SIS sends no dates for started / admitted

## 9. Production state

`292b4f9`, untouched by all six sessions (byte check at the end of the run). It still carries the
**old** channel config (Google Form and Open Day listed as active). The 02.10 work is local only.
A release needs his GO and a named release owner; it must include `0e1da1d`.

## 10. Exact items for Ritvars

1. **Home: A (Journey first) or B (Today first).** Both running on the same reads.
2. **Channels: A (Who acts next) or B (What is proven).**
3. **Applications funnel basis:** registration-week cohort (built) - confirm, or ask for another basis. It was marked "awaits confirmation" in the control doc; the lane built one, not two.
4. **Meta and TikTok:** "Needs owner action" (Channels, because Oksana's access is today's step) or "Blocked by external provider" (control doc, because App Review can refuse). And the old `blockerKind` question / work choice.
5. **Owners to confirm:** LinkedIn = Ritvars (read from your own 02.10 actions, you never said it) · TikTok = Oksana (your 02.10 message).
6. **Dark cards: glass or solid.** 30.09 said solid; the app and Channels still use glass in dark.
7. **Cold / reject screen form:** built without the A/B the MVP map asks for (Closure item 3b).
8. **Small, for C, not a choice:** two near-identical frame greys (`#d3dce6` Channels rim, `#d6dee7` Home plinth) should become one token; the sign-in `--gate-ink:#0f1b35` is a near-navy to rule on.
