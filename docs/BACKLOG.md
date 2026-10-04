# Academy CRM - backlog

*Named "College CRM" until 24.09.2026. The product is **Academy CRM** (formally Novikontas
Academy CRM). The folder, the package name and the GitHub repository are still spelled
`college-crm`: those are identifiers other things point at, and renaming them is a separate
decision for Ritvars.*

Nothing is deleted here. A line changes status, it does not disappear.

**Statuses:** `SAID` - somebody said it, nothing checked · `DECIDED` - the owner decided it ·
`BUILT` - it exists in the code, committed, not deployed · `LIVE` - verified running in production ·
`UNKNOWN` - named but not checked with the provider.

The CRM has been live since 27.09.2026, so `LIVE` means what it says. The words "nothing is LIVE:
this is a local prototype" stood here until 30.09.2026, from the weeks before the first deployment.

## 04.10.2026 - THE A/B BATCH (run by MASTER CONTROL, Ritvars picks)

**PICKED 04.10: header 4, blue glow** (step 1b, light only): one Novikontas Blue glow from the top-left corner,
`radial-gradient(70% 45% at 0% 0%, rgba(83,167,219,.22) 0%, transparent 70%)`, laid OVER the locked sea on the page body
(the sea is not forked; frames that carry --sea keep it); page titles navy #0a2463, 24px, weight unchanged. Home has no
visible h1, left for step 4. Measured at 1440 on Today, Journey and Reports: h1 24px / 650 / rgb(10,36,99), the glow is
the body's first layer. BUILT, next patch, not deployed.

**PICKED 04.10: type 3 strong hierarchy** (step 2a), app-wide tokens: title 30/750, headline figure 30/750 (Today's
strip and planned %, Home's figure cards), name 17/700, detail 13px slate, label under a figure 11.5/600, status chip
13.5px; names and figures navy #0a2463 in light (dark keeps its ink); red stays red for overdue. Header 4's 24px title
gave way to 30px; its glow and navy stay. **Kept bigger on purpose:** Home's Needs-you figures (44px) and the one hero
card (40px) stay above the 30px step, because they are the focal points (KB 08 P5); they take the weight and navy.
Measured at 1440 on Today: h1 30/750 navy, figures 30/750 navy, overdue 30/750 red, names 17/700 navy, details 13px,
labels 11.5/600, chips 13.5px. At 1440 and 390 on Today, Home, Journey, All people and a person page: no page sideways
scroll, nothing clipped, no chip on two lines, no Journey name wrapping. All people's table already scrolls inside its
own box at 390 (699px wide before and after this change). BUILT, next patch, not deployed.

## 04.10.2026 - RELEASED: Q4 is LIVE in production 62f8178

MASTER CONTROL cut `release/2026-10-04-intake` (2d4963a; deployed code `62f8178`, `dpl_uTzfeGw6PZNSgxUGoQUinLP41utH`),
verified live by that session: page byte-identical, 401 on private routes, 0 leaks, the closed_tag column present.
It contains `4d13f96` (Q4), so **Q4 is LIVE** (verified by MASTER CONTROL, not by this session). Merged into this
branch at `64669ce`, no conflicts, **1034/1034**, seen running on a restarted preview. **Q5 (`32232ce`) and everything
after it goes in the NEXT patch.**

## 04.10.2026 - Q4: "Acting as" shows User and Admin, no names

Ritvars, 04.10.2026: "No need to show all users!" (MASTER CONTROL queue Q4). On a test copy with nobody
signed in, the picker offers **User** and **Admin** only. User acts as the configured Admissions user (not
an admin), Admin as the first configured admin, so isAdmin(), Channels, feedback and the `by` field work as
before. A name remembered from the old picker lands on its own side. Signed in (production), the picker
stays hidden and #whoBlock shows who you are, unchanged. **BUILT**, seen running: Admin opens Channels,
User gets "Admins only". NOT DEPLOYED; MASTER CONTROL cuts the release at this commit.

**Q5, BUILT after the Q4 release commit (NOT in that patch):** left menu A/B, light mode only, switch
`?menu=a|b` plus "Menu A B" in the menu foot (light only). A = white into the 15% tint by 50%, held to the
foot. B = solid brandbook blue #53a7db, every word and icon navy #0a2463 (5.48:1; white is 2.65:1 and
fails), the Today count navy instead of amber, the official black logo file on it. Dark identical in both.
Seen running in Chrome and measured in the pane. **PICKED: B, 04.10** (Ritvars, after seeing A and B side by side at 1440 px, relayed by MASTER CONTROL). B is now the only light menu: A, the `?menu=` switch, the "Menu A B" control and the stored choice are removed. Dark unchanged. NEXT PATCH, not deployed.
**ON HOLD, 04.10 (relayed by MASTER CONTROL):** on the live look Ritvars said the contrast is not enough (navy words,
black logo, 35% navy hairline on #53a7db); he wants white on the blue. Two mockups are with him: A = white bold letters
with a thin navy edge and a white hairline; B = white letters on navy pills, the open page in white. Both put the logo
on a white plate in its official two-tone colours (the brandbook forbids outlining or shadowing the logo). The #53a7db
surface stays. Letters, logo and hairline are NOT changed until his pick arrives. SAID.
**PICKED: version 3, white logo aligned, 04.10** (Ritvars, from four mockups, relayed by MASTER CONTROL). On the
#53a7db surface: the official WHITE logo file as it is (no recolour, outline, shadow or plate); every menu word, the
Today count, icons and the spine hairline white at full opacity (lines 1.5, the active one 3); links 15.5px weight 800;
no text edge, shadow or pills. **White on #53a7db measures 2.65:1, under the 4.5:1 guideline: it is his decision, made
while looking at it.** His note "align the logo to the text": the file's symbol starts 162.49/1500 in, 17.12px at 158px,
so the image moves left by that; measured at 1440: symbol x 20.01px, "Intake · v1.0" and the slogan x 20px. The form
controls keep navy words on their white surfaces. Dark unchanged. BUILT, next patch, not deployed.
**SUPERSEDED the same day:** after seeing white, Ritvars chose navy again ("actually the navy looks better"); `612297f` is replaced.

**PICKED 04.10: navy text, white logo, v1.0 line removed, logo aligned.** On #53a7db: navy #0a2463 words, icons, counts and
hairline (as `b3083f0`); the official WHITE logo file as it is; the "Intake · v1.0" line removed in light and dark (the
slogan stays); the logo's left edge on the slogan's: measured at 1440, symbol x 20.01px, slogan x 20px.

**PICKED 04.10: immersive menu 3** (his pick of three, desktop menu, light only, no pills): the locked gradient recipe
extended (a #8fcbef glow at the top over #5aaedf -> #53a7db -> #4497cf), the official white logo file as a faint watermark
low in the menu (opacity .13, 1000px from -40px, only the symbol shows, never clickable), the menu lifting off the page
(white inner edge, soft navy shadow), the active spine line white 3 with a soft glow. The frame, never a data mark.
**Navy measured on every gradient stop: 8.27:1 at the glow, 5.92 on #5aaedf, 5.48 on #53a7db, 4.55:1 on the deepest
foot #4497cf - all pass 4.5:1, the foot by a hair.** Dark unchanged (checked). BUILT, next patch, not deployed.

**Follow-up, Ritvars 04.10 (on 07be370):** "dark mode doesnt have the same effects, nor the na logo underneath. Also dont
have the hairline progress. but also light doesnt have it completely correct, it stops a people. also it changes the shade
of the left card when switching through the cards tabs". Fixed, measured at 1440 in both modes:
- dark gets immersive menu 3 too: the sea's own #17456e glow over #0c2745 -> #08182e, the white logo watermark (.07, white
  reads stronger on dark), the lift, the logo aligned to the slogan, the progress line #8fcbef 3 wide with a glow
- the progress line reaches the PAGE: Journey and All people light with People, Today and Inbox with Admissions; the line
  now ends on the child (Journey 193px, All people 222px, Today 88px = each lit item's centre)
- the shade no longer changes: the menu is as tall as the page (1,144px Home, 3,493px Today), so the gradient is drawn
  one viewport tall (100vh) in both modes, with the foot colour below. BUILT, next patch, not deployed.

## 02.10.2026 - DECIDED (popup): the person card, the menu, black, shadows

| Decision (Ritvars, 02.10.2026) | Status |
|---|---|
| Home B: every moving visual gets the circle's shadow (same plinth, offset only across the value axis) | BUILT `449f35a` |
| Journey person card: **only after a click**, and "it expands exactly from the spot you clicked it, pushed other around it away and slightly making darker the everything around that card". The automatic first person (the "hero") is gone | BUILT |
| Menu in light: **white into a soft Novikontas Blue tint** (#53a7db at 15%) | BUILT |
| Pitch Black #011111 as the strong accent: **a short bar before each section heading** (dark mode uses its own ink, black would vanish on the sea) | BUILT |
| Motion: **every metric counts up**; the bump only when a number changed since you last saw it; a soft "presentation slide" opening for all data when a tab opens | BUILT, see the commit |
| **Two-colour sentences in subtle places** (Ritvars via MASTER CONTROL, 02.10, Q2): the apply.novikontas.org hero pattern, first word in brand blue bold, the rest plain; sparingly (a section title or an empty state), never on data, at most one per screen; Intake would use #29a8df because KB 08 P5 keeps #53a7db off text. Where it goes is a UI choice: A/B to Ritvars first | SAID |

## 02.10.2026 - DECIDED: Home is B, the Journey takes A's band

Ritvars, 02.10.2026: **"B for home. Then the journey displayed like the ui from A."**

| What | Status |
|---|---|
| Home = **B, Today first** (Needs you, KPI cards with the delta row, charts + donut) | DECIDED |
| People > Journey opens with **A's band** (Arrived -> the five stages -> Admitted / Not proceeding), in the lit well | BUILT `3235467` |
| The band takes the place of the stage row (screen 2) and of the outcomes strip behind the disclosure line; filters, board, 5 most urgent + "n more" unchanged | BUILT `3235467` |
| Home = B only: the switch, `cHomeA` and the remembered `?home=` choice are removed | BUILT `3235467` |
| **The band's stage visual = columns from one shared baseline**, the count on top, overdue the darker stacked part (hover gives its number); the words "now" and "n overdue" go. One dot per person is OUT: "cant count them really". Rule: the task picks the visual, comparison wins (KB 08 P5 rule 12) | BUILT `3235467` |

**Merge note from the feedback closure session (02.10, `audit/2026-10-02-feedback-closure-s5` at `cf6b112`):**
trial merge with `cd6b7f0` is code-clean, 994/994; only this file conflicts (both add sections at the top, keep both).
It brings to MAIN screens: "Add lead" on the Journey head (the Inbox lost its button, channel results only, his decision),
Today without finished people's leftover steps (server filter in /api/tasks), stage-fitted step and close-reason pickers,
and "Not proceeding · Cold / · Reject" in the All people Stage filter. Outcomes stays MAIN's.
**RELEASE RULE: `0e1da1d` (the closed_tag migration) must ship with anything that carries cold/reject.**

**Built 02.10 (`3235467`), 968/968, NOT DEPLOYED.** Columns on one baseline and ONE scale (the biggest
stage sets it), the count above, overdue the red base drawn at rest (on the same scale, so overdue
compares across stages too). A column IS the board's stage filter: click filters the board in place,
click again clears. Arrived and the outcomes are bookends, not columns, because they count other bases
(this year's leads, the whole database). One scene on arrival only. Seen at 1440 light and dark, and
at 390 with no sideways page scroll. **Stage names unchanged: still BLOCKED on Ieva's wording.**

## 02.10.2026 - MAIN A and B of this run: BUILT, COMMITTED, NOT DEPLOYED

Branch **`ui/2026-10-02-main-ab`**, own worktree `crm-main-ab`, cut from `561bce2`
(`ui/2026-10-02-journey`). **963/963. NOTHING DEPLOYED.** Production is still `292b4f9`.
Design prototype on the real data model: every figure is read live from `/api/report`,
`/api/summary`, `/api/people` and `/api/intake`; nothing is hardcoded.

| What | Status | Commit |
|---|---|---|
| Home donut Open slice was the signal amber `#F7C04F`; now the data mustard `#E0A526`, both modes. Donut not redesigned | BUILT | `1bc018d` |
| **The spine**: the children's hairline carried up behind the top-level menu icons, measured from the menu as drawn, blue from Home down to where you are. Settings is off it; hidden on a phone | BUILT | `5e20aad` |
| Donut solid = ONE neutral plinth ring (`--k-plinth`), not each slice again in its own colour. The per-slice rim gave a slice at six o'clock more coloured ink than one at three (found by the QA session) | BUILT | `0401016` |
| **Home A and B**, switch on the page and `?home=a|b` | BUILT | `714302b` |
| Kit part 9 motion inlined verbatim (no build step), `cScenes()` plays it per view, two scenes per tab | BUILT | `714302b` |
| Month chart: the peak annotates itself in place; its source line said a click opens the Inbox, it opens Outcomes | BUILT | `714302b` |
| **Screen 3**: each Journey column shows its 5 most urgent people, then "n more" | BUILT | `80d7e63` |
| **Cold / reject counted**: Home counts, Outcomes split with a filter per tag, the tag on each Not proceeding row | BUILT | `714302b`, `07bac8b` |
| QA truth fixes: switch dead while `?home=` was in the address; A's "20.9% of 115" printed under 25 now shows "24 / 115" | BUILT | `07bac8b` |

### A vs B - what materially differs

Neither is the winner. Both read the same data, use the same cards, colours, spine and motion kit.
**The difference is what the page is organised around.**

| | **A - Journey first** | **B - Today first** |
|---|---|---|
| Axis | where the people are in the lead's flow | what needs a person now, then how we are doing |
| Opens with | one band: Arrived → New, Contacted, Follow-up, Application, Contract → Admitted / Not proceeding | "Needs you": Overdue, Due today, In the Inbox (No next step when there is one) |
| Countable | one dot per person in every stage | figures only |
| Overdue | on the stage it belongs to ("9 overdue" on Application) | one total, first thing on the page |
| Comparison | none on the cards | delta row on Admitted and Leads, last COMPLETE month vs the one before, basis named ("Sep 4 · vs Aug 1 · +3") |
| Donut | none: the band already says where everyone is | yes, beside the month chart |
| Depth (frame only) | a lit well with the locked glow, cards on one plinth, the spine laid on its side behind them | a stacked sheet (two sheets behind, constant offset), amber top rule for "needs you" |
| Scene 1 | the spine draws and the cards arrive along it | the needs-you figures count up |
| Scene 2 | the charts: line draws, bars and dots fade | the charts, and the ring lifts in |
| Every figure opens | its stage on the Journey (filter set), the Inbox, Outcomes | Today, the Inbox, a Journey stage, Outcomes |
| Reference | Admissions' own words (statistics first, the sequential order) | Remote dashboard (to-do first, groups ending in "View all"), Square (figure first, delta row) |

**Research, 02.10, Mobbin free tier in his Chrome:** Dashboard category shows Cake Equity (a
vertical figure stack beside one hero visual, "Last 30 days vs Previous"), Quicken (a labelled
donut beside the accounts rail), Remote (things to do first, side cards ending in "View all").
Square's recorded finding (zero depth, hierarchy wins) still governs depth. Pattern only.

**What can break, and the check that catches it:** a figure that differs between A and B, or
between Home and the screen it opens. Checked: stage overdue counts sum to the Today overdue
total (21 = 1+1+2+9+8 on the synthetic set); the Journey filter Home sets is the only filter
on (`cGoStage` resets the rest); conversion prints its a / b on A, B and Reports.

**Seen running:** both at 1440 in light and dark (headless Edge for the finished state, Chrome
for the motion landing), the Journey at 1440, and A, B and the Journey at 390 measured with no
sideways overflow. Screenshots: `College CRM/For review/MAIN A-B 2026-10-02/`.

### One departure from the kit, on purpose

Kit part 9 plays a scene when it reaches **mid-screen**. A report scrolls into the middle; a
dashboard OPENS with its charts in view, and at the mid line the month chart sat as an empty
axis until somebody scrolled. `cScenes()` plays a scene once its top is in the upper 85% of
the window. The kit itself is unchanged. **[DECIDE, Ritvars]** whether the kit should carry an
"app" trigger beside the "report" one.

### Ieva and Aigars, item by item (from `docs/IEVA_AIGARS_FEEDBACK_VERBATIM.md`)

| Item | Status | Proof |
|---|---|---|
| Ieva 29.09: statistics on the home page | **DONE** | Both A and B open on live metrics; `test/home_ab.test.js` |
| Ieva 29.09: how to add a new lead | **DONE** 30.09 | She confirmed it 30.09 09:59 |
| Ieva 29.09: the sequential order, overdue and due today at once | **DONE** | A follows the order; Journey columns now sort most-late first (`test/journey_disclosure.test.js`) |
| Ieva 29.09: contact info and notes on the row | **DONE** 30.09 | She confirmed it 30.09 09:59 |
| Ieva 30.09: cold / reject on Not proceeding | **DONE** (set) `b5f3a4c`; the closure branch fixed a production-breaking fault in it (`0e1da1d`) and added the tag to both close paths |
| Ieva 30.09: cold / reject "for statistics", marketing to the cold ones | **DONE on this branch** | Counted on Home, a filter per tag on Outcomes, the tag on every row. Run end to end on the preview: tagged 2 cold + 1 reject, Home showed Cold 2 · Reject 1, the Cold chip opened exactly those 2 |
| Ieva 30.09: where do unanswered calls in New Leads come from | **BLOCKED** - the PBX filter is CHANNELS work - owner: the Channels session / Ritvars - needs: the call-filter rule, and whether PBX is live (see the open PBX check) |
| Ieva 30.09 10:23: "one lead who is already admitted..." | **BLOCKED** - the rest of the message is not in the record - owner: Ritvars - needs: the full text from the chat |
| Ieva: the real Journey stage names | **BLOCKED** - only she can name them - owner: Ieva - needs: her names for the five stages |
| Aigars 30.09: an update when the real channels are connected | **BLOCKED** - not MAIN UI - owner: Ritvars / Channels - needs: the channels connected |
| Aigars 30.09: how far from V1 real use | **BLOCKED** - a project-control report, not a screen - owner: Ritvars |
| Aigars 30.09: connect the domain when ready | **BLOCKED** - release, waits for his go - owner: Ritvars / Aigars |
| Aigars: per-person comment thread, phone chart readability | **DONE** 01.10 | Unchanged; both Home variants use the same thinned-label month chart |

### Still open on MAIN

- **[DECIDE, Ritvars] A or B.** Then C is built from his pick. Not C in this run.
- The A/B switch is a review control and goes when C is settled.
- Screen 2 (the Journey stage row) was fixed 01.10 (`d93938a`) and measured again today:
  1,615 of 1,667 px at 1920. Nothing new built there.
- Merge: a trial merge with `audit/2026-10-02-feedback-closure-s5` is clean and 971/971; the
  Outcomes tag display is owned by this branch, agreed through QA.
## 02.10.2026 - Ritvars's answers to the feedback list, in his words

Given against the closure list. Each line: what he said, and what it now means. **DECIDED** unless
marked.

| Item | His words (short) | Now |
|---|---|---|
| Ieva 10:23, cut off | pasted in full: an admitted lead still shows in Next Steps as overdue | the bug; see the build below |
| Stage names | "Isnt this already inside of a tab that we have a name for?" | Yes: the Journey's five stages are named. **The current names stand**; Ieva can rename later, it is a config edit |
| Outcome reasons | "an algorithm that depends on persons journey. There can be groups. The goal is for shorter list ... the outcomes impossible are not shown ... lets create mvp" | **DECIDED: the reasons offered depend on the stage the person leaves.** MVP, config, Ieva tunes it by using it |
| Next steps | "an algorithm that depends on at what stage the lead is! There can be groups ... shorter list ... lets create mvp" | **DECIDED: the steps offered depend on the lead's stage, by group.** MVP, config |
| Human filter before Intake | "we answered this by decision to have filter. Its wider filter to let in more messages ... All of that should come in. The Income is all the personal info ... in neat identical (sql) tables: Name, Surname, Email, Tel Ph., you decide" | Matches 1a (01.10): only spam, our own addresses and automatic senders are set aside; everything else comes in. One `inbound` table holds every channel with the same contact columns |
| D-C2 "not clear yet" | "huh???" | There is no "not clear yet" pile any more. **Closed, nothing to decide** |
| Lifecycle facts | "I dont really see how this needs my decision" | Correct: it waits on the first real SIS applicant, not on him |
| Aigars item 5 | "if there is none, there is none. you may delete" | **Deleted** |
| Journey summary | "ship" | **DECIDED: ship** |
| Add lead | "in inbox the channel automation results only. Leads are leads ... if we manually add a person, this means its a lead already ... walked-in (default in the drop-down) ... Lead is in the loop, we cant let them out without a reason" | **DECIDED: the Inbox holds only what the channels brought in.** Add lead lives with the leads, walk-in is the default. A lead leaves only with a reason (already enforced) |
| Unanswered calls | "unanswered calls go into inbox, if they are new callers. If they have numbers with names to them (existing leads) they get recorded for needs action which is today" | New callers: Inbox (already so). **DECIDED: a missed call from a known lead puts them in Today** |
| Cold / reject screen | "i just need to view which one i like more, yes?" | Yes. The UI/UX lane shows the versions, he picks |
| Marketing to cold | "kind of out of scope ... if you can autonomously think of and implement some mvp idea, ok, go for it" | **MVP allowed**, kept small |
| Aigars | "We will status Aigars when everything is done" | One update at the end |

## 02.10.2026 - Session 5: Ieva and Aigars feedback closure

Branch **`audit/2026-10-02-feedback-closure-s5`**, cut from `561bce2`. **944/944. COMMITTED,
NOT DEPLOYED.** The full matrix, every item DONE or BLOCKED with its owner:
[`FEEDBACK_CLOSURE_2026-10-02.md`](FEEDBACK_CLOSURE_2026-10-02.md).

| What was found by clicking, and fixed | Commit |
|---|---|
| **`closed_tag` had no migration.** Deployed as it stood, every status change on production would fail on a missing column. Now one `ALTER TABLE` at boot. **Schema change on release** | `0e1da1d` |
| Cold / reject skipped on the People quick edit; stored but shown nowhere. Now offered there too and named on the person page. The Outcomes display (counts, filter, row chip) is the UI/UX lane's (`ui/2026-10-02-main-ab`), agreed through QA S6 after a merge collision | `1345cd7`, `7cce0f8` |
| The Journey card's **Edit** button did nothing | `7c3f30a` |
| A note written on the Journey card jumped to the person page under a `#/journey` address, and the thread stayed stale until reload | `a6a290f` |
| Plan a next step from Today jumped the same way | `80710a6` |

**Correcting the record.** The 01.10 tables below say of the Journey stages "the screen says they
are provisional". It does not: that tag was removed on purpose on 29.09 (`6b25ce7`). The caveat
lives in DECISIONS.md and `config/prototype.json` only.

**Owed:** the MVP map says the cold / reject field and screen go to Ritvars as an A/B first. Neither
`b5f3a4c` nor `1345cd7` had one. The Outcomes form is now the UI/UX lane's to put in front of him.

## 04.10.2026 - DECIDED: the Website channel is temporary

**Ritvars, 04.10.2026:** the Website connection is **only for the forms still live** on the English
college pages - the enquiry form (college/en, college/en/contacts) and the contact form
(college/en/contacts). **The website is relaunched in its next version with NO forms.** From then
on apply.novikontas.org does all the work and the Website channel is **dropped**, like Google Form.
The Latvian pages already have no form. Recorded in `config/channels.json` (website `scope` and
`record.until`). | DECIDED |

## 04.10.2026 - SESSION 3: Q3 website field names, Q6 call pop-up

Branch `ui/2026-10-02-channels-s3`. **COMMITTED, NOT DEPLOYED.** Both for the NEXT patch (MASTER CONTROL).

| Item | Status | Commit |
|---|---|---|
| Q3 Website adapter reads the live college forms' own field names; programme and "Source" answer stored | BUILT | `4bf9921` |
| Website record: CONFIGURED 04.10 (secret + mode=test in Production, Tilda webhook Active, not ticked on a form) | BUILT | `4bf9921` |
| Q6 Call pop-up: `GET /api/calls/now` for every signed-in user, TeleGroup read shared 8 s, caller matched to a person / waiting lead / new caller, shown to the operator who answered (else everyone) | BUILT | see below |
| Q6 screens for review: **A** the person page opens, **B** a corner card (`?cp=a` / `?cp=b`, or the switch on the card) | BUILT | see below |
| training@ mailbox | PARKED (next scope, 04.10) | - |
| Does TeleGroup list a call while it RINGS, or only after hang-up? One test call to +371 23111114 (press 1) after deploy | SAID, open | - |
| Every other adapter's `extracted` (programme, intent) still dropped in toIntake | SAID, reported to control | - |
| Desktop notification when the app is not open (30.09 spec) | SAID, not in this build | - |

## 02.10.2026 - SESSION 3, Channels: reconciled again, A and B rebuilt

Worktree `crm-channels-s3`, branch **`ui/2026-10-02-channels-s3`**, cut from `561bce2`.
**935/935. COMMITTED, NOT DEPLOYED.** Design prototype on the real model: no backend change
beyond passing the record through `/api/admin/channels`.

| Item | Status | Commit |
|---|---|---|
| Channel record per active channel (access, deployed, production configured, live verified, blocker, next action, destination, each dated with its source) | BUILT | `80de328` |
| Owners: LinkedIn = Ritvars, TikTok = Oksana; Gmail = option B; LinkedIn blocked by provider | BUILT | `80de328` |
| **Channel A - who acts next** (lanes of people, cards of work) | BUILT | `49706ba` |
| **Channel B - what is proven** (ledger of the four proofs, inspector) | BUILT | `49706ba` |
| `--sea` names the one gradient; the channel frame carries it, with a uniform SVG rim below | BUILT | `49706ba` |
| Ritvars picks A or B | SAID | - |

**Open with A / B: ?chv=a or ?chv=b** in the address, or the switch on the screen.

**Research.** Recorded Square findings (figures first, named bands, comparison as its own row)
plus Mobbin 02.10 (free tier, his Chrome): **Laravel Cloud's environment canvas** - each resource
a box listing its properties with a status word each ("Enabled", "Not connected"), a direct
pattern for B's per-proof cells; **GitBook's integrations list** for A's card rhythm. Pattern
only, no colours or type taken.

**Corrected the same day** on the 02.10 production backup (VERIFIED): 44 real provider rows,
Phone 4 and Email 40 (edu@, option B). **PBX is live verified**; "PBX ir live" was right; the
gap is continuity after 01.10. Email is live for edu@ only. Live verified: 2 of 12.

**Still open, not taken here:** Phone continuity past 01.10; Meta App Review work / question /
approval; which agent partner first (nobody named); LinkedIn = Ritvars and TikTok = Oksana to
be confirmed by him (derived from his 02.10 messages, not stated as an owner change).
## 02.10.2026 - SESSION 4: Applications inside Reports (COMMITTED, NOT DEPLOYED)

Worktree `crm-applications-s4`, branch `ui/2026-10-02-applications-s4`, cut from `561bce2`.
Technical prototype (P4) on the existing shell. Production untouched: no deploy, env, sync or rollback.

| What | Status |
|---|---|
| `GET /api/applications` (src/applications.js): the SIS funnel from rows already in Intake. SELECTs only, never calls the SIS, counts only | BUILT |
| Basis: **registration-week cohort**, where each person stands NOW. No status history is made up: the SIS sends current status only | BUILT |
| A later status counts as passing the earlier ones (SIS order, already accepted 29.09 "by submit date"); rejected / withdrawn kept apart, the SIS does not say at which step | BUILT |
| The records a person archived in the Inbox (production's 6 team tests) are **set aside**, never counted | BUILT |
| One truthful state: Off / No run yet / No real applicant yet / Test / Live. A webhook record before any pull is still counted | BUILT |
| Reports / Full report: one **Applications** chapter holding apply.novikontas.org web stats and the SIS funnel, in journey order; header link + `#/reports/applications`; no menu item | BUILT |
| Funnel bars open People filtered to Came from = SIS (when anyone is linked) | BUILT |
| Frame: the locked sea gradient (#fbfcfd / #17456e) + shadow; marks flat. Web traffic in mustard #E0A526, SIS in blue. One scene (step bars draw once) | BUILT |
| **DECIDED 02.10 (Ritvars, "Ok"):** the funnel is split the way apply.novikontas.org describes it: **On the website** (Registered, Form started, Submitted) and **Academy decision** (Admitted, Matriculated). One scale for both. Ritvars renamed it: "Academy decision", not College | BUILT |
| **SAID 02.10 (Ritvars, via MASTER CONTROL QUEUE Q1):** apply.novikontas.org may be called **"Academy Application form"** in Intake, wherever Intake names it (Reports > Applications, the lifecycle line). It stays downstream, never a channel. Source: `crm-control-s1/docs/INTAKE_CONTROL_2026-10-02.md` Q1, commit `599a369`, branch `control/2026-10-02-s1`. BUILT 02.10 on his GO: the lifecycle line and the web-statistics heading in Reports > Applications. Code comments and channel notes keep the domain | BUILT |

**What production will show today** (from the 01.10 evidence, not re-read): SIS live, 6 records in the
store, 6 set aside, **0 counted -> "No real applicant yet"**. That is the true blocked state.

**Data gaps:** no date for `started` / `admitted`, so no event-by-week view; a person with two
applications counts once by week and twice by programme (both labelled); traffic and applications
are different bases, so no visit-to-application conversion is drawn.

## 02.10.2026 - HANDOFF: where this run stopped

Branch **`ui/2026-10-02-journey`**, cut from `feat/home-b-command`. **933/933. Clean tree.
NOTHING DEPLOYED.** Production is still `292b4f9`, proven today by byte comparison.

| Done this session | Commit |
|---|---|
| Channel universe reconciled: 12 active, Google Form dropped, Open Day parked | `e2ea549` |
| Channel A (operational board) and B (command centre), switch on the screen | `a7b7e08` |
| Pin reconciled - it claimed `e52e1b4`, three releases stale | `3576a3c` |
| The product is called **Intake** everywhere a person reads it, 33 strings | `05485ec` |
| AI Review decisions written in, and the six missing ones named as missing | `e084aee` |
| Ieva's and Aigars's own words, verbatim, in `docs/IEVA_AIGARS_FEEDBACK_VERBATIM.md` | `ea8757c` |
| **Cold / reject** on Not proceeding - her clearest request | `b5f3a4c` |

### The exact next action

**DONE 02.10 on `ui/2026-10-02-main-ab`**, see the section above: the spine, metrics Home in blue and
mustard, depth on the frame, two scenes per tab, A and B. Kept below as the brief it was.

Build **A and B of this run** on top of this branch. He called it "a relaunch of that same
task, properly this time", so the earlier A/B is not the deliverable.

1. **The spine.** A hairline **behind** the top-level menu icons, continuous with the children's
   existing one. They are already the same line: the children's border sits at x=18px and the
   icon centres at x=18.5px. The nav order is already the lead's journey.
2. **Metrics Home** in logo blue `#29a8df` and the data yellow **mustard `#E0A526`**. Validated
   with the dataviz validator: CVD delta-E 24.0, normal-vision 27.9. Both under 3:1 on white, so
   charts keep visible labels or the table view.
3. **Depth / 3D on an SVG basis** where it earns its place, **two animations per tab** (KB 08 P5
   raised from one to two on his decision today).
4. **KPI figures are CARDS.** Already decided 30.09 and recorded in KB 08 P5. Not an open A/B.

### The design rule set 02.10, and the research behind it

**"Use 3D geometry to give the object physical presence, but never let perspective or depth
alter the user’s ability to compare the underlying values."** His words. Written into KB 08 P5
as a new **Depth and 3D** section, so it governs every app and not this one chart.

The first extruded ring BROKE it: tilting meant a segment at the side covered more visual arc
than the same number at the top, and only front segments carried a wall, so they gained weight
from where they sat. Fixed in `074d141`: the top face is a **true circle**, every angle exactly
proportional, and the extrusion is a uniform rim entirely **below** the reading surface.

**Mobbin, Square web dashboard** (free tier, 02.10; also available: Browserbase, DoorDash
Merchant, Variant, ZARA, Calendly). **It uses ZERO depth** and wins on hierarchy instead:
figures at display size with a small label above and a small explanation below, named bands
separated by hairlines, one thin unfilled line with no gridlines, **the peak annotating itself
in place**, and **comparison as its own delta row with the basis named** ("vs Prior Monday")
rather than a second colour. Its left nav uses quiet non-clickable section labels, where ours
indents clickable parents behind a hairline.

**The synthesis: depth belongs to the FRAME, never to the MARK.** Cards, surfaces and the menu
spine may have presence; the donut face, the bar and the line stay flat and exact.

Pattern only, never their colours, type or branding.

### Open, and not ours to take

- **SETTLED 02.10 later, on evidence:** PBX is live verified (daily pull), Gmail edu@ too - 44
  provider rows in the production backup `2026-10-02T01-17-43Z`. Continuity after 01.10 is the
  only open part. See `docs/INTAKE_CONTROL_2026-10-02.md` and `docs/AB_REVIEW_PACKAGE_2026-10-02.md`.
  The line below is kept as the record.
- ~~**[VERIFY] Is PBX live?**~~ He told the team "PBX ir live" on 01.10; this file says 0 rows from
  a real provider. Production answers 401 everywhere and the read-only checker
  (`scripts/crm-check.ps1`, branch `feat/checker-gate-2026-09-30`) is committed but **not
  deployed**, so no Claude session can settle it. The cheap check: open `#/channels` signed in
  and read the Phone row.
- **Meta's APP REVIEW** is marked `blockerKind: work` although it can be refused, which is the
  config's own definition of `question`. Three options in the reconciliation document.
- **Journey stage names.** Ieva has said nothing directly; the only words on record are Aigars's
  two examples, *contacted once* and *waiting for reply*, which are two different kinds of thing
  (an action we did, and a state we are in). The current seven mix both.
- **The other six AI Review decisions**, which exist only in the relaying session.

## 02.10.2026 - AI Review decisions, written into the record at last

**These existed only in a ChatGPT session.** A search of this repository on 02.10 found no trace
of them: not in the backlog, not in DECISIONS.md, not in INBOUND_ARCHITECTURE.md, not in any
config. A decision that lives only in a chat is a defect in project control, and if that session
is lost the decisions are lost with it. Ritvars confirmed on 02.10: write them in.

**Stage 2. None of these blocks INTAKE V1.**

| # | Decision | Answer | Status |
|---|---|---|---|
| Q3 | What the AI is asked to produce | **Match + stage confirmed** | DECIDED |
| Q4 | Which model | **The cheapest model that passes** | DECIDED |
| Q7 | Monthly Anthropic spend limit | **$50 / month** | DECIDED |
| Q8 | Phone-call transcription | **DROPPED for Stage 2.** TeleGroup recordings, speech-to-text and caller-consent transcription are not in Stage 2 | DECIDED |
| Q10 | Zero Data Retention | **Action item recorded** - ZDR is required; the exact arrangement is not yet written down | DECIDED, detail open |

**Already recorded elsewhere and not re-opened here:** AI may filter the Inbox and may never
destroy; a person decides lifecycle; legal approved 01.10; the review is feasible at roughly
$1-135/month in the earlier estimate, which Q7 now caps at $50.

### The gap this exposes

The relaying session recorded **11 decisions open** for AI Review. **Five are above.** The other
six were not carried over and are not in this repository. They are not lost if that chat survives,
but this file cannot name them, and nothing here should pretend to.

**[VERIFY: the remaining six AI Review decisions]** - recover them from the AI Review session and
add them here, or re-take them. Until then the AI Review decision set in this repository is
**incomplete and known to be incomplete**.

## 01.10.2026 - Everything C has to choose between

**The two branches differ in exactly two places.** Eight of the ten commits on each are the
same work, replayed identically: the light sea, the sparklines, screens 2 and 3, the Aigars
and Ieva items, the exit reasons, the Channels owner column, the token guard. The A/B is
`c049c5a` against `dc2ddcd` for Home, and the Channels screen. **C is two choices and a port,
not a merge of two codebases.**

Everything below is built and can be looked at running. Nothing here is a mockup.

### 1. The KPI strip: hairline or cards

| | **A, the hairline** | **B, the cards** |
|---|---|---|
| What it is | one ruled row, no boxes | the modern card treatment, exactly as kit part 2 carries it |
| Where | `c049c5a` | `dc2ddcd` |

**This is two of his own decisions disagreeing, and it is the one that reaches other apps.**
On 30.09 he picked modern cards for panels and kit part 2 was built to carry that to every
app. On 01.10 he asked repeatedly for the hairline back. Rather than stop the run, both were
built.

**Impact beyond MAIN:** whichever wins has to be answered in **kit part 2**, or Intake, the
Client Hub and TA drift apart. The kit and the other apps were **not** touched. There is no
hybrid here: a strip is one or the other.

### 2. Home: stacked bands, or a headline and a rail

| | **A, Structured Operations** | **B, Visual Command Center** |
|---|---|---|
| Opens with | titled bands, stacked | one headline figure and a large visual main column |
| The rest of the numbers | inside their bands | contextual groups down the right, each ending in the action that opens it |
| Charts | in their bands | in the main column beside the donut. The rail carries only numbers that have no useful shape |
| Reference | Square, Mobbin free tier | DoorDash Merchant, Mobbin free tier |

Both read Overdue and No next step live from `/api/summary` on every load and show a dash
with a reason when the read fails. **57 is hardcoded in neither.**

**The hybrid worth building:** B's headline figure and visual main column, with A's explicit
`.ksrc` / `.kgo` source-and-destination line on every figure. B's rail already ends each group
in its destination, so the two are the same idea at different strengths and they compose.

**What it would cost:** the rail and the bands are different containers for the same helpers.
Both call the same `cDonut`, `cBars`, `cMonthChart`, `cWireCharts`. A hybrid re-parents them;
it does not rewrite them.

### 3. The Channels screen: a table, or a board cut by person

| | **A, the table** | **B, the board** |
|---|---|---|
| Axis | status, then name | the person holding it |
| Shape | 14 rows, 5 columns | one card per owner, biggest pile first, "Nobody named" last |
| Answers | "what is the state of everything" | "what do I chase, and from whom" |
| Costs | the owner is a column you scan for | status becomes secondary, and a channel moves card when its owner changes |

**The hybrid worth building:** the board for the channels that are stuck, the table for the
ones that are working. Once a channel receives there is no person to name, so a row is enough
and a card is a waste of the screen. B already separates the two piles (`chBoard` splits
`done` from `stuck`); the hybrid renders the `done` half as A's table.

### 4. Google Form and Open Day: parked where the config cannot see it

Not an A/B. A decision I did not take, written up in full in the Channels section above.
The backlog records Open Day as parked and Google Form as out; `config/channels.json` records
neither, so the new column reports both as live work and Google Form as **nobody named**.
Three ways to settle it are listed there. **Marking a channel parked is a product decision
about what the screen claims, not a rendering fix.**

### 5. Ieva's Journey stage names

Not an A/B and not a code gap. `config.stages` defines and implements seven, the screen says
they are provisional, and nothing in the code is missing. **Only the names are open**, and
only Ieva can close them.

### What C does NOT have to choose

Built once, on both branches, and carried into C whichever way the three above go: the light
sea, the KPI sparklines, screens 2 and 3 recomposed, the per-person comment thread, the phone
chart label thinning, the step-by-step next-action row, the exit reasons against the enforced
list, the Channels owner data, the token guard, and the sign-in colour fix.

## 01.10.2026 - Channels: the screen now says whose turn it is

On both variant branches. **915/915.** COMMITTED, NOT DEPLOYED.

| What | Status | Commit |
|---|---|---|
| Channels screen shows the owner and the one blocking action | BUILT | A `2338ac4` · B `5b10642` |
| Variant B: the same facts cut by person, one card per owner | BUILT | B `46d0814` |
| Every `var(--token)` must be a token the file declares | BUILT | A `6800ca9` · B `46d0814` |
| Sign-in input asked for `var(--t1)`, which does not exist | **BUG, FIXED** | A `6800ca9` · B `46d0814` |

**Nothing new was gathered.** `config/channels.json` has carried `ownerPerson`,
`ownerAction` and `externalBlocker` since the channel write-ups of 30.09, and
`src/channeladmin.js` has been sending all three to the client ever since. The screen
dropped them. An admin could see that nine of fourteen channels were not receiving and
could not see who was holding any one of them.

What the fourteen real rows say, which is what the column now prints:

| Waiting on | Channels |
|---|---|
| Oksana | Website, Facebook, Messenger, Instagram, WhatsApp |
| Tetiana | LinkedIn, TikTok |
| Ritvars | Mailchimp, Phone |
| Marina | Gmail |
| Aigars | Open Day |
| **Nobody named** | Google Form, Agent |
| Waiting on nobody | In person (by hand, and that is the design) |

**The green suite did not catch the one real fault here; printing the rows did.**
`in_person` was rendering as "nobody named" in amber, over an action that reads
"Nothing to do. Already working". The config itself defines `manual_only` as "a person
enters it by hand, and that is the design, not a gap", so a manual channel is now
waiting on nobody, same as a receiving one.

### What running the screen found that 915 green tests did not

The tests passed before any of these. Each was found by starting the server, signing in
as an admin and reading the fifteen rows.

| Found by looking | What it was |
|---|---|
| **SIS was filed under "nobody named"** | It is the fifteenth row: an integration, not a channel, modelled apart on purpose because nothing is delivered to us and it has no adapter. `config/channels.json` names **Ritvars** for it and says what he has to do. `integrationStatuses()` in `src/server.js` never copied the three owner fields that the channel path has always copied. Nothing was missing in the config; **the API dropped it.** A test now reads that function for all three, and asserts the config really does name somebody so it is not guarding an empty case |
| **`in_person` raised an amber alarm** | over an action that reads "Nothing to do. Already working". The config defines `manual_only` as "a person enters it by hand, and that is the design, not a gap" |
| **The line and the cards disagreed** | the line above the board listed people in row order, the cards below were ordered by pile size. The line follows the cards now: biggest pile first, ties alphabetical |
| **Blockers were cut mid-word** | a cell ended "...for messaging permissi", which reads as a rendering fault and not as a deliberate shortening. The cut backs up to the last space; the whole text stays in the title |
| **"Not set up" wrapped to two lines** | in the narrow Status column, making every row twice as tall for nothing |

### Two guards that did not exist

| Guard | What it caught on its first run |
|---|---|
| **Every `var(--token)` is a token the file declares** | `background:var(--hover)` is not a syntax error. There is no `--hover`; the declaration was dropped at compute time with no warning and no failing test. It found `--t1` too: the ramp is `--t2`/`--t3`/`--t4` and starts at `--ink`, so the **sign-in input had been asking for a colour that does not exist**. `--jt` is real and declared inline on the element that uses it, so the guard reads the whole file |
| **No conflict markers survive anywhere** | A cherry-pick left markers in the stylesheet and **all 918 tests passed**, because every test reads `src/app.html` as text or runs a named slice of it and no slice covered the corrupted lines. The served page would have been broken. Proved by putting a marker back and watching it fail |

### SETTLED 02.10.2026: Google Form dropped, Open Day parked, both written into the config

**This section is kept as the record of how it was found and closed.** The config now carries a
`lifecycle` per channel, neither appears as work, neither holds an owner, and the
`googleFormOwner` open question moved to `settled` with a re-ask guard. See
`docs/CHANNEL_RECONCILIATION_2026-10-02.md`. The original write-up follows.

#### As it stood on 01.10, unresolved

`docs/BACKLOG.md` records Open Day as parked (`274f31c`) and Google Form as out. The
channel config records neither. It carries `readiness: waiting_for_external_access` for
Google Form and `ready_for_configuration` for Open Day, so the new column reports both
as live work that somebody has to chase, and Google Form reports as **nobody named**.

I have not written the decision into the config. Marking a channel parked is a product
decision about what the screen claims, not a rendering fix, and inventing a `parked`
field would be me deciding the vocabulary.

Three ways to settle it, for Ritvars:

1. **Record it in the config.** A `parked` field with the reason and the date, and the
   screen groups parked channels away from the chase list. Honest, and the screen stops
   asking for work nobody intends to do.
2. **Leave it.** The column keeps naming them, and whoever reads it re-decides each time.
3. **Remove them from the config.** Cheapest to read, and it loses the record that we
   ever considered them, which this file exists to prevent.

### A/B for C: the Channels screen

Both are built and can be looked at side by side.

| | **A, the table** | **B, the board** |
|---|---|---|
| Axis | status, then name | the person holding it |
| Shape | 14 rows, 5 columns | one card per owner, biggest pile first |
| Answers | "what is the state of everything" | "what do I chase, and from whom" |
| Costs | the owner is a column you have to scan for | the status axis becomes secondary, and a channel moves card when its owner changes |
| Where it lives | `viewChannels` table | `chBoard()` |

Both read the same fields and print the same words. The hybrid worth considering for C:
the board's grouping for the channels that are stuck, and the table for the ones that
are working, because once a channel receives there is no person to name and a row is
enough.

## 01.10.2026 - Aigars and Ieva: the actionable items finished

On `feat/home-a-structured`. **900/900.** COMMITTED, NOT DEPLOYED.

Three items that had been carried as OPEN for days turned out to be actionable once the project
resources were actually searched rather than quoted.

| Item | Was | Now |
|---|---|---|
| **Aigars 3: per-person comment thread** | "preview done, a thread is not built" | **DONE.** The thread is on the Journey person card: the notes and calls that person already has, newest first, three at a time with "Show all", and the two buttons that write through the route that has always existed. No new architecture - a comment is an event of kind `note` or `call` |
| **Aigars: Home phone chart readability** | open, and live again now Home is back | **DONE.** The type was never the problem (12.5px on a phone, bigger than desktop). Twelve labels in a 324px plot area give each a 27px band against a ~22px name, so they crowd. The LABELS are thinned to about six, the newest month always keeps its tick, and every column keeps its aria-label and tooltip, so no month loses its name |
| **Ieva: the next-step list, item by item** | "NEEDS DECISION" | **DONE.** The list was never undefined: `config.nextActions` has 19 steps in 4 groups and has been driving the picker all along. The real fault was the Journey collapsing all 19 into 4 group totals. A "Step by step" row now lists the steps somebody is actually waiting on, biggest first, each its own filter |
| **Ieva: Admitted / Not proceeding reasons** | "NEEDS DECISION" | **MODEL ALREADY BUILT.** `config.closedReasons` holds a complete 10-item taxonomy, the status route refuses a close without one, and Outcomes already counts how many lack a reason. See the decision note below for what is genuinely left |
| **Ieva: real Journey stage names** | "NEEDS DECISION" | **DECISION REQUIRED, and it is only the names.** `config.stages` defines and implements seven; the screen says they are provisional. Nothing is missing in code |

**One real defect found and closed while building the thread:** the board redraws when the thread
arrives, and a redraw asks again. In flight is now marked BEFORE the await and the redraw only
happens if the answer actually landed, so a fetch that resolves without filling the map can no
longer spin. A stub in a test found it by hanging the suite for seven minutes.

## 01.10.2026 - Screens 2 and 3 recomposed (both variants)

On both `feat/home-a-structured` and `feat/home-b-command`. **882/882.** COMMITTED, NOT DEPLOYED.

**Screen 2, the wasted horizontal space.** The owner: *"we have twice as much almost space
horizontally"*. It was one value: `.c-sumrow` was `repeat(auto-fit, minmax(104px, 160px))` with
`justify-content:start`, so the tracks were **capped at 160px** and five stages used 800px of a
1400px page. Now `minmax(104px, 1fr)` and `stretch`, so the row fills the width. **The tracks stay
equal** - that is what the existing note in the file is about: boxes sized by their own label made
two equal counts draw different amounts of ink.

**Screen 3, the overload.** The owner: *"all together is just tooooo much"*. The screen opened with
two full bar rows, the exit marks, the outcomes band, four filters, the person card and five
columns - everything at level one, always. Not shrunk: **re-levelled.**

| Level | What | Why |
|---|---|---|
| Always open | Active journey: the five stages with their exit marks | What you need BEFORE asking a question: where the people you are working with are standing |
| Behind one line | "What comes next" (the same people by kind of step) and the OUTCOMES band | Answers to questions you have to ask first |

The line carries its counts - *"What comes next, and 3 finished"* - so opening it is a choice and
not a lottery, and the open state survives a redraw so filtering does not slam it shut.

**One real markup fault found doing it:** the disclosure's `onclick` held an arrow function, and the
`>` in `=>` closes the tag early for anything that parses the markup. It is a named handler now.

Not touched, still open: the person card and the five columns below. Aigars' per-person comment
thread belongs on that card and is still not built.

## 01.10.2026 - The light sea, and a shape for every figure (both variants)

Applied to **both** `feat/home-a-structured` and `feat/home-b-command`: these are shell and data
improvements, not variant choices. **878/878** on each. COMMITTED, NOT DEPLOYED.

- **The light sea.** Dark has always taken the sign-in gradient, a glow from the top centre over a
  vertical deepening (`#17456e` → `#0f2f4f` → `#08182e`). Light had none. Light now has the same
  geometry in its own tones (`#fbfcfd` → `#f7f9fb` → `#e7ebf0`), `fixed`. Not a third theme: one
  recipe, each mode in its own palette. The range spans about 3% of lightness, so no text contrast
  moves. The menu takes the same quiet fall it already takes in dark.
- **A sparkline under each KPI that has a monthly series**, drawn from the same trend the month
  chart uses. It draws NOTHING rather than a lie: under two months, or flat at zero, gets no line;
  a zero month inside a real series stays a low point on the line. Conversion and median days get
  none, because one value for a period has no shape. Colours come from the mode tokens and a test
  forbids a hard-coded hex there.

**Reference:** the Mixpanel Home screen he downloaded from Mobbin. Pattern only.

## 01.10.2026 - A/B: Home returns. Variant A, Structured Operations

Branch `feat/home-a-structured`, cut from `v0.9` (`52e2232`). **872/872.** COMMITTED, NOT DEPLOYED.

Home is the first page again. It was deleted this morning when Today absorbed Next Steps; the owner
asked for the metrics back on the landing screen, so Home returns as the visual dashboard and Today
keeps the work. Two screens, two jobs.

| What | Status |
|---|---|
| `viewHomeC` and `cDonut` restored from `62c24a4`, not rewritten. Every chart helper they need (`cMonthChart`, `cBars`, `cWireCharts`, `cChartGo`) had survived in Reports | BUILT |
| The grouped navigation and **the established hairline**, unchanged: `.cnav .kids{margin:1px 0 6px 18px;padding-left:10px;border-left:1px solid var(--rule)}`. Admissions > Today, Inbox. People > Journey, All people | BUILT |
| All five locked `C_ICON` glyphs back on the menu. Reports has **no locked icon**; a glyph in the same stroke language is marked PROVISIONAL where it is defined, and a test asserts that marking | BUILT |
| **A's half of the strip A/B: the HAIRLINE strip.** One ruled row, no boxes | BUILT |
| Every figure and every band says its source and its destination (`.kgo`, `.ksrc`) | BUILT |
| **"Active with no next step" is read live from `/api/summary`.** When the read fails the band says "Data not available" in the same shape rather than printing a remembered number. 57 is NOT hardcoded anywhere | BUILT |
| Amber for that figure is the attention rank, listed in the amber guard with its reason. Red stays late-and-overdue only and is not on Home | BUILT |

**MORNING DECISION REQUIRED - the KPI strip.** Two of the owner's own decisions disagree. On
30.09 he picked modern cards for panels, and kit part 2 carries that to every app. On 01.10 he asked
repeatedly for the hairline strip back. Rather than stop the run, the strip is now **part of the
A/B**: A is the hairline, B keeps the cards. **The shared kit and the other apps were not touched
tonight.** Whichever wins has to be answered in kit part 2 as well, or the apps drift apart.

**Still open, not decided here:** Aigars' per-person comment thread and the Home phone-chart
readability; Ieva's real Journey stage names, the item-by-item next-step list, and the
Admitted / Not proceeding outcome reasons.

## 01.10.2026 - LIVE: v0.9, all three lanes in one release

Branch `v0.9`, **pushed to GitHub**. Production commit `292b4f9`, deployment
`dpl_6ENuvYa9Gso16WXH8BgWUUJsaPNH`. **871/871** run by the deploy gate on that exact checkout.
Live `/` proven byte-identical to the commit; 70 of 70 uploaded files hash-identical to git, none
untracked; 23 leak probes clean; 8 private routes answer 401.

The first release carrying all three lanes. Base `7b327ff`, which already held APPLICATIONS, SIS
and all seventeen CHANNELS commits; the nine INTAKE FLOW commits replayed on top.

**What the reconciliation found, and why it mattered.** The lanes were two steps further on than
the brief recorded, and `lane/channels-2` already contained its own re-implementation of the
repeat-caller join. Cherry-picking "three lanes in order" would have shipped it twice.

**The join was a real merge, not a pick.** Each lane was better in a different way and the release
keeps all three behaviours:

| From | What |
|---|---|
| CHANNELS | the `contact_phone` fallback in `receive()`, for rows stored before thread keys existed. Without it every such row is orphaned the day this ships |
| CHANNELS | the archived-number filter, `filterWhy`, and the `oneOpenItemPerNumber` gate |
| INTAKE FLOW | the thread key NORMALISED to the last 8 digits. The raw number made `+37129111222`, `371 29 111 222` and `29111222` three rows for one caller |
| INTAKE FLOW | `joinBody`, so a repeat call appends "Rang again 12:20, missed call on button 1" instead of the same sentence with no time. `cCallLine` reads it to say "3 calls, last answered 11:52" |

One counter, `again`, not two. The channels lane counted `folded` and never printed it; a number
counted but never shown is not a count. Their `pbx_filter` tests were updated to both changes,
not worked around.

**One integration bug, caused and caught here:** combining the two join blocks inlined a variable
that `addLine` still referenced by name. Six tests across both lanes failed on it.

Verified before the push: all four screens, the phone chips, five per-stage exit marks, the
outcomes band, Reports. Verified after: the live page carries every integrated marker, "New Leads"
is gone, nothing of the AI layer is present, and the manifest reads **Novikontas Intake**.

## 01.10.2026 - AI Review: decided, recorded, NOT built

From the AI Review feasibility session. Brief:
`Projects/College CRM/BRIEF_INTAKE_AI_REVIEW_DIRECTION.md`, design
`STAGE2_AI_REVIEW_DESIGN.md`, report `AI_REVIEW_FEASIBILITY_2026-10-01.html`.

Feasible, about $1-$135 a month. Direction: channels capture broadly, `receive()` stores, Claude
writes a suggestion, a person decides. **Nothing of the AI layer is built and V1 does not wait for
it.** These rows are kept here because the backlog is the memory and `INBOUND_ARCHITECTURE.md`
section 5 alone is not where anybody looks for what was decided.

| What | Status | Note |
|---|---|---|
| **Stage 2 scope** | DECIDED 01.10 | the AI MAY filter the working Inbox, prioritise, recommend routing and a next action, and flag duplicates and known people. **Filtered is not destroyed:** the event stays recoverable and auditable with source, provenance and the AI's reason. Uncertain but genuine stays for a person. A person still decides every lifecycle change |
| Legal approval to send inbound data to Anthropic (US/global processing) | DECIDED 01.10 | exact record: "Legal approval obtained. Approver not specified in the current decision record." |
| **1a, what the AI may hide alone** | DECIDED 01.10 | **only spam and automated mail** at high confidence: spam, bots, bounces, newsletters, no-reply and system mail. Irrelevant, supplier, internal and not-a-prospective-student are classified and recommended, **never hidden** - each is a judgement about a real person who wrote to us |
| **1b, the threshold** | DECIDED 01.10 | **set by the test set, never a hard-coded number.** Shadow mode first, hiding nothing; measure false filtering; the threshold is where no known genuine prospective-student message is filtered. Re-measured on any change to the model, prompt, categories or threshold |
| **1c, who checks Filtered** | DECIDED 01.10 | Admissions, weekly |
| **1d, how long a filtered body is kept** | DECIDED 01.10 | 13 months from the **newest** line; joined lines each keep their own clock, so an old call never deletes a newer one. **This is now built** - see the INTAKE FLOW lane section |
| **2, who sees the AI metadata in shadow mode** | DECIDED 01.10 | admins and Admissions only |
| **3, the AI's labels** | DECIDED 01.10 | it reuses the labels that exist - unclear / lead, the archive reasons, the programme codes. No second ladder |
| **9, one line per arrival (`inbound_line`)** | **BUILT 01.10** | on Ritvars' direct instruction to this lane ("Q9 = IN V1 NOW. BUILD IT NOW"), not on a relay. The feasibility session has since confirmed it never authorised a V1 change itself |
| 11, order of work | DECIDED 01.10 | V1 and channels first |
| 4-8 and 10 | OPEN | his |
| Anthropic SDK, API key, prompt, review table, AI labels in the Inbox | NOT BUILT | out of scope until he decides |

**The six rules every change to the inbound path must keep** (also in `INBOUND_ARCHITECTURE.md` §5):

1. `receive()` is the single entry point. No per-channel lead logic.
2. Store the inbound row first, before any judgement.
3. `inbound.body` lives until qualify or archive. Never deleted earlier.
4. Machine output keeps provenance `extracted` and is never counted until somebody confirms it.
5. Person matching stays in `src/identity.js`, never in the AI.
6. Add no new place that nulls a body or filters without a trace.

**The one that already exists, verified 01.10:** the word-list junk filter in `receive()` sets the
ROW body to NULL the moment it fires and writes no history row. Left alone in V1 on his
instruction. Since this lane's line work, the **line** keeps its body, so a filtered item is
recoverable and auditable even though the row shows nothing - which is what 1a and 1c need.

## 01.10.2026 - INTAKE FLOW lane (lane/intake-flow)

Branch `lane/intake-flow`, **re-cut from production `24279e2`** (the Applications lane's release;
the live page is byte-identical to it apart from the sign-in return script the server injects).
**809/809.** NOT DEPLOYED, and this lane does not deploy.

### One line per arrival (locked 01.10, Q9)

| What | Status |
|---|---|
| `inbound_line`: one row per arrival on an inbound row. `seq`, `channel`, `external_id`, `received_at`, `kind` (message/call/form/activity), `body`, `body_deleted_at`. Unique on `(inbound_id, seq)` and on `(channel, external_id)` where it is not null | BUILT |
| Retention is **13 months per line**, from that line's OWN `received_at`. An old call can never take a newer one with it. The body is emptied, the line is kept with `body_deleted_at`, so the deletion is auditable | BUILT |
| The purge runs on every phone poll beside the existing `pbx_calls` purge, so it is a live path and not a function nobody calls | BUILT |
| **Filtering does not destroy the record.** The machine's word-list filter still empties the ROW body, so nothing filtered shows a message on screen, but the LINE keeps its body until retention takes it. A Filtered view nobody can check is not a working view | BUILT |
| **A person deciding still deletes it.** Qualify and archive have always deleted the body the moment somebody dealt with it, which is a privacy promise, so the lines go with them. Only the machine's own filter keeps its lines | BUILT |
| A repeat delivery of a LATER arrival is now caught. Its `external_id` is written to its line, never to `inbound`, so before this only the first arrival was de-duplicated | BUILT |
| `inbound.body` is kept in sync and stays the whole conversation as one text: every screen and every export reads it. The lines are the record, the body is the read | BUILT |
| Every phone number shows its dialling code and its country: `LV +371 26 551 234`, `IN +91 98 1234 5678`. A two-letter chip, not a flag emoji - checked on his screen first, Windows draws a regional-indicator pair as two small letters, so the emoji buys nothing and makes the screen depend on how each machine renders it. Longest-prefix match, because +7 is Russia and +77 is Kazakhstan. An unknown or local number keeps its number and claims no country | BUILT |
| The installed app called itself "Novikontas Academy CRM", so its window read "Novikontas Academy CRM - Novikontas Intake". The manifest is Intake now | BUILT |

### Four places, and the lifecycle in one view

Menu is **Today | Inbox | People | Reports**, Settings separated at the foot for admins.
Today holds the whole Next Steps screen plus a counts strip and the Inbox count; the KPI Home and
its donut are deleted, because Reports already held every figure and more. People is
`[Journey] [All people]`; the Journey shows the five active stages above a rule with an exit mark
in each stage's own cell, and Admitted / Not proceeding below it. `GET /api/journey/exits` reads
those counts from history. Outcomes left the MENU, not the product. All 18 old hashes resolve.

Also: IEVA-4 again (only the person page passed the finished flag to the Done dialog), and the
installed app called itself "Novikontas Academy CRM", so its window read
"Novikontas Academy CRM - Novikontas Intake". The manifest says Intake now.

## 01.10.2026 - APPLICATIONS lane (apply.novikontas.org -> SIS -> Intake)

Worktree `crm-applications`, branch `lane/applications`, cut from production `b8454f7` (live `/` proven
byte-identical to it on 01.10 with its own sign-in return script). Technical prototype (P4). Brief:
`Projects/College CRM/LANE_APPLICATIONS.md`. **Release goes through CRM V1 / Release + Ops, not this lane.**

| What | Status | Commit |
|---|---|---|
| Migrated: the SIS creates an application-first person at the application stage (decided 30.09 popup) | COMMITTED, NOT DEPLOYED | `a94e3f9` (from `73b8696`) |
| Migrated: `POST /api/intake/application`, the fast path, secret `SIS_APPLICATION_SECRET` (name only) | COMMITTED, NOT DEPLOYED | `fd5d0fd` (from `7216ec6`) |
| Migrated: an SIS-created twin folds into the real person, `POST /api/people/<id>/merge-into` | COMMITTED, NOT DEPLOYED | `fc0f877` (from `29393b6`) |
| Item 1, SIS person identity: the SIS's email, phone and programme are written onto the person as provider facts, so the page no longer lists them as "still to find out"; Came from reads SIS, not "sis not a channel" (the alias fix also covers website_form, gmail, open_day, klatiene). 761/761 | COMMITTED, NOT DEPLOYED | `557898b` |

| Item 2, held by the SIS: an SIS-created person at started or later is not counted or listed as "No next step" (Home, funnel, report, Next Steps, People, person page, Journey card and bar); registered-only still needs a step; a known lead keeps today's path; rejected or withdrawn counts again. Demo: noNextAction 2 -> 1. 768/768 | COMMITTED, NOT DEPLOYED | `91d5cbf` |

| Webhook hardening: not JSON, a list, no changedAt = 400 and nothing stored; too big = connection cut, nothing stored, the next call lands; `SIS_APPLICATION_SECRET=` (empty) in `.env.example`. 770/770 | COMMITTED, NOT DEPLOYED | `7386ced` |
| Item 3, "Same person as..." (the 30.09 undo decision) on an SIS-created person's page: search People, "This is them" calls merge-into, opens the real person. Clicked through locally. 773/773 | COMMITTED, NOT DEPLOYED | `4fa8912` |

| The SIS poller writes nothing to `inbound`: the one write moves to `confirmedBySystem()` in intake.js; a test pins it (the rule the other lanes are adding). 775/775 | COMMITTED, NOT DEPLOYED | `8391e50` |

**DECIDED 01.10.2026 by Ritvars (popup):**
- **SIS step: A, "SIS holds them".** No task for an SIS-created person at started or later; never in
  "No next step"; the page says "In the SIS: <status>". Registered-only stays a lead with a step.
- **Release: A, own release**, before the channels lane, through CRM V1 / Release + Ops.
- **SIS live: A, after this release.** Ritvars sets `CHANNEL_MODE_SIS=live` in Vercel himself;
  `SIS_API_TOKEN` is present in Production (seen in `vercel env ls`, 01.10). Then the next 08:00 run
  is verified.

- **Release owner: A, this lane deploys** (01.10, popup). No Release + Ops session was running and
  Intake MAIN V1 is told not to deploy; Ritvars chose this lane, with `deploy_verify.sh`.
- **Applications view, the metrics source: A, SIS data in Intake** (01.10, popup; the Stage 2 /
  Applications design decision). In his words: "Build the Applications view from the SIS/application
  data already available in Intake. Track the application funnel per programme and week, using the
  real SIS lifecycle data: registered -> started -> submitted -> admitted -> matriculated. Do not
  depend on Aigars' Vercel analytics account for the core Applications dashboard. The dashboard can be
  sparse until SIS goes live; that is acceptable. Do not fabricate data. Keep external
  traffic/landing-page analytics as a separate future enhancement if access becomes available."
  Evidence behind the question: apply.novikontas.org is served by Caddy (the SIS server), not Vercel,
  and its page says "No third-party analytics"; this Vercel account has no domain and no apply
  project. Traffic analytics: SAID, later, needs access.

Already decided 30.09 and NOT asked again: who is application-first, registered at New, the done New
Leads item, the history line "Created from the SIS", a known lead keeps her path, the merge as undo.

The backlog-only commits of `feat/application-first-2026-09-30` (`5ef4322`, `ef199e2`, `f6f958d`,
`9806352`) were NOT carried; these rows replace them.

**Evidence that corrects the brief (P1).** "A SIS row in New Leads shows nobody" is not what the data
says. The 30.09 00:45 backup (before the archive) holds the six SIS inbound rows with `contact_name`
6/6, `contact_email` 6/6, `contact_phone` 4/6, and the 01.10 backup still holds them after archiving.
On the live commit, run locally with one SIS applicant through the real `syncSis`, the New Leads card
shows the name. The card shows no email or phone for ANY channel, which is the card's design, not a
SIS fault. The real gap was the person page of an SIS-created person (handed over 30.09 as 3c), now
fixed in `557898b`.

**Measured on the person page, before -> after** (local, SIS applicant with email, no phone, NAV):
Came from "sis not a channel" -> "SIS"; Still to find out "interest, start, education, question,
email, phone" -> "start, education, question, phone"; chips EMAIL and WANTS TO STUDY NAV appear.

**Parked, not this lane (P3):** the "not recorded" rows on every person page (Phone, Study form,
Education, Nationality) break the 30.09 no-gaps rule app-wide; that is the person page's owner, not
the SIS. SAID.

**Application metrics (apply.novikontas.org / Vercel analytics inside Intake):** not in this lane's
brief, the MVP map or its definition of done. QUEUED after the core application/SIS path, SAID
01.10.2026. Not Intake itself; a clarifying dashboard, like the landing-page analysis.

## 01.10.2026 - SIS to LIVE: COMMITTED, NOT DEPLOYED

Branch `lane/sis`, worktree `crm-sis`, cut from production `24279e2`. Contract: the SIS team's
"Novikontas CRM API" (applicants + web-stats, one token). **Seen in production (read-only, 01.10):** the
05:31 UTC run authenticated and asked `since=2026-09-29T05:01:25Z`, got 1 repeat; 6 SIS records, 6
references, 0 repeated keys; all 6 arrived in test mode and are archived on purpose; CHANNEL_MODE_SIS=live
since 14:54 (Applications release), no live run yet.

| Item | Status | Commit |
|---|---|---|
| web-stats client; POST /api/admin/sis/sync (on demand); GET /api/admin/sis/check (live proof in counts); GET /api/web-stats | COMMITTED, NOT DEPLOYED | `14bdd26` |
| Reports: apply.novikontas.org section (popup A, 01.10); search only when the SIS sends it | COMMITTED, NOT DEPLOYED | `57d9f69` |

**Not DONE until:** deployed; an admin opens `/api/admin/sis/check` (pagination, since, 404, 400, web-stats
against the real SIS) and presses the on-demand sync; the first real applicant after 14:54 is seen in
Intake with reference, status, programme and contact; the Reports section shows real figures.
**Every 5 minutes:** the code allows it; the schedule is daily because of the Vercel plan (not a code limit).
## 01.10.2026 - CHANNELS lane: COMMITTED, NOT DEPLOYED

Branch `lane/channels`, worktree `crm-channels`, cut from production `b8454f7` (verified: deployment
`dpl_G1vvHuMFXirySJo9A6JxqcvkKWSm`, 10:27 Riga). Cherry-picked, never merged. Discovery:
`docs/CHANNELS_LANE_2026-10-01.md`. Release belongs to CRM V1 / Release + Ops, on Ritvars's yes.

**DECIDED 01.10.2026 (Ritvars):** Gmail option B, edu@ signs in once (replaces A of 30.09).
**DECIDED 01.10.2026 (Ritvars):** "there will be filtration" before calls become New Leads; "build it now".
**Kept, already decided:** an unknown caller goes to New Leads, where staff assess interest; nobody is a
lead until a person qualifies them; the menu button 1/2/3 decides whose call it is.

| Item | Status | Commit |
|---|---|---|
| Meta: Page messages are Messenger, lead forms are Facebook, one address (popup B, 30.09) | COMMITTED, NOT DEPLOYED | `f4a3ad1` (from bfdeb31) |
| Open Day: attendance sent later reaches the person (channel stays parked) | COMMITTED, NOT DEPLOYED | `274f31c` (from f927437) |
| Gmail: the daily poll writes to New Leads from the last good run; cron 05:30 UTC | COMMITTED, NOT DEPLOYED | `6ed7653` (from 8e5717d) |
| Meta and LinkedIn lead answers fetched after the notification; cron 05:45 UTC | COMMITTED, NOT DEPLOYED | `8cba9e1` (from 4f40f78) |
| TikTok content read (built for the developer webhook, NOT ad lead forms; to match on the first real test lead) | COMMITTED, NOT DEPLOYED | `5de2a02` (from 095ae31) |
| Google Form Apps Script | COMMITTED, NOT DEPLOYED | `975edb6` (from 0800af3) |
| **Gmail B reworked:** link from an admin page, no Intake account for Marina, back to the registered sign-in address, edu@ only, B wins over the key already in Vercel | COMMITTED, NOT DEPLOYED | `8536f46` + `d03cd60` (from 57222df) |
| **Phone filter** in `config.phoneFilter`: numbers archived as Spam / Supplier or vendor / Internal are filtered with the reason; a repeat call joins the open item; counted per run | COMMITTED, NOT DEPLOYED | `68c28ae` |
| **Tilda (C8):** tranid, any field case, utm from COOKIES, secret as header or field, `ok` reply, test request | COMMITTED, NOT DEPLOYED | `5759b7c` |
| The 11 owner write-ups; Marina (B), Tilda (Ritvars's steps), LinkedIn and TikTok access requests rewritten | COMMITTED, NOT DEPLOYED | `ddb1ffa` |
| C9 Mailchimp email change read from data[new_email]; C10 the four Meta channels name Oksana (30.09) | COMMITTED, NOT DEPLOYED | `1c72912` |
| Phone filter keeps the body of a filtered call (decision 1d, 01.10: filtering never deletes the body at once) | COMMITTED, NOT DEPLOYED | see git log |
| **Mailchimp is not a lead** (rule of 24.09 in config mailchimp._note): every event kept under Not relevant with the reason, never in New Leads; a known subscriber gets it on their timeline | COMMITTED, NOT DEPLOYED | this commit |

**Left out on purpose:** the application fast path and the SIS merge that rode along in 57222df's
conflict (applications lane); f737090; the twelve backlog-only commits; 8777509 (second Channels screen, open).

**Waits on, after the deploy:** Marina opens the edu@ link (Ritvars opens `/api/admin/gmail/link`);
Ritvars sets `WEBSITE_FORM_SECRET` + `CHANNEL_MODE_WEBSITE=test` and the Tilda webhook; Oksana: Meta
admin; Tetiana: LinkedIn Super admin + Account manager, TikTok ad-account Admin, and her answers.
**Not DONE until** a real message is seen in Intake as `source=provider` per channel.
**What can break:** if the OAuth consent screen is External, Google shows an "unverified app" stop for
gmail.readonly. Check: Ritvars opens the link himself first; our side keeps nothing from his account.

## 30.09.2026 - LIVE: the patch release, seven commits

Branch `release/patches-2026-09-30`. Production commit `4547505`, deployment
`dpl_BeryxGTzp776fKEXSUSyBUSo9Pqp`, **732/732** on that exact checkout.

**Cherry-picked onto the live commit, not merged over it.** The work was built on `fix/ieva-2026-09-30`,
which was cut from `e52e1b4` before the UI release shipped. Merging that branch would have reverted
the twelve UI commits. All seven applied to `037901e` with no conflicts, and the UI work was checked
still present afterwards (`cJourneySummary`, `c-sumrow`, `chActivity`, `cProgBars`, `c-tag`).

| What | Status | Commit |
|---|---|---|
| A finished person stops nagging Next Steps. `/api/summary` counted them OUT of `openPeople` and `noNextAction` and IN to `overdue` and `today`, in the same response. One name for the rule now, used by every query | LIVE | `7d1bab5` |
| The last step of a finished person can be closed. The dialog made a next step required, so completing the last one opened another. The whole row is gone for somebody finished; an open lead still keeps one | LIVE | `ffd7e54` |
| **Every dialog in the app was see-through in dark**, at every width. `--card` in dark is `rgba(255,255,255,.055)`. The help panel hit this on 28.09 and `--menu` was the answer then; same token, not a new one | LIVE | `9b99f7e` |
| The tab icon reads on a dark tab strip: letters turn white, the Novikontas blue leg stays blue, light unchanged | LIVE | `68068d0` |
| **Every walk-in was recorded as arriving from the website.** `quickAddDefaults.source_channel` was `"klatiene"`, a key no channel has, so the browser fell back to the first option. Now `in_person` | LIVE | `17cb4b7` |
| The tab says **Novikontas Intake**. It said "Academy CRM - prototype" while live and in daily use | LIVE | `17cb4b7` |
| Use the role, not the person, in the shipped comment | LIVE | `4547505` |
| The record of the two bugs and the 6 archived SIS rows | LIVE | `3d13af7` |

**The walk-in bug is the one worth remembering.** It failed silently: no error, no warning, just a
form quietly saying Website. It fed "where admitted people came from" on Home and Reports for as
long as it existed. The guard added with it checks **all five** quick-add defaults, because the trap
is a default that matches nothing picking the first option, not the spelling of one key.

**The hygiene guard that shipped with the UI release caught this session's own comment** and named
a colleague twice. The rule was right and stayed; the comment changed. That is the guard working.

**Release contents.** 7 commits over `037901e`. Files: `config/prototype.json`, `docs/BACKLOG.md`,
`src/app.html`, `src/assets/favicon.svg`, `src/server.js` and three test files. **0** for
`lib/linkedin.js`, `scripts/drill_demo.mjs`, the drill and LinkedIn tests. **`src/db.js` is
untouched, so this release writes nothing to the database on deploy.**

**Verified on production:** live `/` byte-identical to the commit plus its sign-in script; 66
uploaded files, 66 identical, 0 differing, 0 not in git; 401 on all seven private routes; 0 leaks
from 23 probes; all health checks 200. Read back off the live page: "Novikontas Intake" present,
`background:var(--menu)` present, the served `favicon.svg` carries its dark rule, and the helper
sentence "the source defaults to" is gone.

**How the config fix is proven.** `/api/config` is behind sign-in, so the live value cannot be read
without an account. The proof is file identity: `config/prototype.json` is tracked, it is one of the
66 files the deploy hashed against git, all 66 matched, and at `4547505` it reads
`in_person -> In person`.

**Not deployed and still open:** LinkedIn Lead Sync (`f737090`) and the restore drill (`937d423`).

## 30.09.2026 - LIVE: bug-fix release, four commits

Branch `release/bugfix-2026-09-30`, cut from production `b18f5f4`, four commits and nothing else.
Approved by Ritvars as its own scope, deliberately separate from the 20-commit overnight batch,
which stays unmerged and unapproved on `overnight-2026-09-30`.

| What | Status | Commit |
|---|---|---|
| Meta and WhatsApp keep **every** message in a delivery. They kept the first and dropped the rest, so a person who sent three messages arrived as one | LIVE | `8a8724e` |
| A repeated provider event is arithmetic, not a race: unique partial index on `inbound (channel, external_id) WHERE external_id IS NOT NULL`. The check-then-insert could let two deliveries of one message both land | LIVE | `5f921eb` |
| The Gmail poll writes to New Leads through `receive()`. It fetched and shaped the mail and handed it to nobody, so the mailbox was read and the queue never saw a thing. The channel stays OFF | LIVE | `e52e1b4` |
| The sign-in error box keeps the gate's own colours in light, dark and `?ui=classic`. It followed the app palette and read grey on grey in dark, on the one screen somebody sees before any preference of theirs has loaded | LIVE | `f7a8016` |

**Release record.** Production commit `e52e1b4`, deployment `dpl_5x4vMfnnePhW5nosR12H1FCWDyGW`.
Deployed from a clean detached checkout of that commit; **684/684** tests passed on that exact
checkout before the deploy could start, with the database variables unset.

**Verified on production:** live `/` byte-identical to the commit's `src/app.html` plus its own
sign-in return script; 66 uploaded source files, 66 identical to the commit, 0 differing, 0 not in
git; 401 on all seven private routes; 0 leaks from 23 plain and encoded source and config probes;
`/`, the logo, `robots.txt` and `/api/auth/me` all 200, Google start 302 to accounts.google.com.

**The database change.** `5f921eb` is not code alone: the whole schema runs on every boot, so the
index was created on Neon by the app's own first boot after the deploy. Confirmed read-only
afterwards: `CREATE UNIQUE INDEX inbound_channel_external ON crm.inbound USING btree (channel,
external_id) WHERE (external_id IS NOT NULL)`, unique and partial as written. A read-only check
immediately before the deploy showed **15 inbound rows, 15 with an external_id, 0 duplicate
groups**, so the statement could not fail. Afterwards, still 15 rows and 0 duplicate groups:
9 `phone` and 6 `sis`, all `source=simulated`, newest 29.09, none touched. People 192, tasks 34,
crm_users 4, events 249, all unchanged. Every query ran inside `BEGIN READ ONLY` and was rolled
back.

**What is NOT proven by behaviour.** `5f921eb` is proven by the index existing and `f7a8016` by
the live page's own bytes. `8a8724e` and `e52e1b4` are server-side and are proven by deployment
only: their files uploaded byte-identical to the commit and the suite passed on it. Exercising
them live would mean posting to a webhook or polling a mailbox, which writes rows. They get no
behavioural proof on production until a provider is connected.

*(The status key said "nothing is LIVE: this is a local prototype" when this row was written. It
was corrected on 30.09.2026, on Ritvars' yes, in its own commit.)*

## 30.09.2026 - Ieva's two bugs, and the 6 SIS rows archived

Branch `fix/ieva-2026-09-30`, cut from the live commit `e52e1b4`. **690/690. COMMITTED, NOT DEPLOYED.**

| What | Status | Commit |
|---|---|---|
| IEVA-3 + IEVA-5: a finished person stops nagging Next Steps. Reaching Admitted or Not proceeding closes what is still open and writes one history line naming it; a step that finishes somebody plans nothing after it | COMMITTED, NOT DEPLOYED | `ff3b444` |
| IEVA-4: the Done dialog drops the Next step row for a finished person, so their last task can actually be closed. An open lead still must keep one | COMMITTED, NOT DEPLOYED | `7b327bd` |

**What the bug actually was.** `/api/summary` counted a finished person OUT of `openPeople` and
`noNextAction` and IN to `overdue` and `today`, in the same response. One endpoint disagreeing with
itself. There is one name for the rule now, `FINISHED` and `STILL_OPEN_SQL`, used by every query,
because the bug was two copies of the same sentence drifting apart. And the only way a task ever
closed was somebody pressing Done on that exact task, while the dialog made a next step required, so
completing the last one immediately opened another.

**Found by looking, not by a test** (KB 08 P0 step 7). The first version of the IEVA-4 fix added a
"No next step" entry to a dropdown that still offered the seven real next steps to somebody already
finished. The server ignores `nextLabel` for them, so she could have picked one, pressed Save, and
nothing would have been planned. The whole row goes instead.

**Still open, handed over, not fixed here:** the modal header at 390 px. The title wraps under the
Close button and page content shows through behind the box. `min-width:0` and a flex basis improved
it and did not settle it. It affects every modal with a long title, not only this one.

**The 6 SIS rows: ARCHIVED 30.09.2026 on Ritvars' instruction, in production.**
They were the team's own submissions through apply.novikontas.org while the SIS sync was being built
(25-27.09): one named "Test Man", one with the phone +371 20000000, "Abdullah Ansari" three times
with three different emails, and three colleague names. **None of the six matched any of the 192
people.** Archived as `Internal`, `processed_by` Ritvars, in one transaction that would have rolled
back unless exactly 6 rows changed. Verified after: inbound still 15, archived 6, sis new 0, people
192 unchanged, **`sis_applicants` untouched so every identity is kept**. Archiving nulls the body,
which is the app's own behaviour. New Leads now holds 9, all phone calls.

**One row is worth a question to Māris.** The SIS holds his surname spelled correctly in the name
field (`Cirulis`) and `maris.cyrulis@gmail.com` in the email field, with a y. The CRM copies the
email verbatim - `toSisRow()` does `email: str(a.email)`, no transformation - so the two fields
disagreed at the source, before we saw them. His CRM account is `mc@novikontas.org`, and that gmail
appears nowhere else in the database. Only he can say whether it is his.

**Handed to Session B:** a SIS row in New Leads shows no name, no email and no phone. The identities
are one table away in `sis_applicants` and never reach the card, which is why these six had to be
read out of the database to be judged at all.

## 28.09.2026 - LIVE on https://crm-novikontas.vercel.app (the CRM V1 session)

**The release record below is out of date: the CRM IS live.** Every commit here was deployed from
the clean deploy folder, then checked on production: the live page byte-identical to the commit,
every uploaded file's checksum matching git, 401 on every private route, 0 leaks from 23
plain and encoded source/config probes. The full suite passed on the exact commit first (554 at
the end of the day).

| What | Status | Commit |
|---|---|---|
| Sign-in is **Google only** (Aigars' decision); the password route answers 410 | LIVE | da3d3ba |
| Concept C is the product; no control back to classic; `?ui=classic` still works | LIVE | f7734aa |
| A faked "simulated event" header no longer gets past a channel's checks | LIVE | 1e716d3 |
| Agent channel: only a real partner token passes ("0", empty, malformed refused); the verified partner is kept on the lead and the person | LIVE | a9c89db |
| Only an admin can empty or replace the database when sign-in is on (a user could before) | LIVE | 5761d23 |
| Sign-in card: "CRM" + "Sign in to continue" centred, CRM 34px, spacing balanced, card size unchanged (360 x 164.3); the sea untouched | LIVE | c0bbdb5 |
| Dark mode = the sign-in sea: its navy gradient, bright amber #F7C04F (not the mustard), glass panels | LIVE | 61d0fb0 |
| Academy icon in the browser tab (the symbol fills the tile) and installable as "Academy CRM" (Chrome: 0 installability errors); /favicon.ico answers | LIVE | a9059ff |
| Light / System / Dark switch with icons at the bottom of the menu and in Settings; System follows the computer | LIVE | a9059ff |
| Settings open to everybody, with a Help center; admin rows still admin-only | LIVE | a9059ff |
| "(c) Novikontas Academy" + Help center line at the bottom of the menu | LIVE | a9059ff |
| The corner button says FEEDBACK (it said HELP) and its box is solid in dark (it was see-through) | LIVE | a9059ff |
| Consent ticked on a form reaches the person's consent record; a later lead about a known person keeps their first source | LIVE | 41a2c64 |
| The installed app's window bar is black | LIVE | 8eb2836 |

**Also done 28.09 (not code):**
- Accounts: ritvars.vilcins@ admin, aigars.kluga@ admin, **mc@ = Maris Cirulis, Director of
  College, admin** (added on Ritvars' instruction), edu@ user. Google sign-in needs only an active
  row - no password. Adding one: `vercel env run -e development -- env CRM_PG_SCHEMA=crm node
  scripts/manage_users.mjs add <email> --role user|admin` (without CRM_PG_SCHEMA it opens an empty
  schema).
- 21 leftover test schemas in the live Neon database (from test runs on 27.09 18:46-19:19 UTC,
  and one empty one made by the users script) were **deleted on Ritvars' yes**, in one
  transaction; the real `crm` schema was identical before and after (192 people, 4 accounts).
- Everything reusable went to the component library, part 13 "Academy app kit".

**Aigars' feedback queue, item 1/5 - "ŅAV" -> "NAV": DONE 28.09.2026.**
- Found: not in the code at all. ONE stored value: person `r0131` (Admitted 25.05.2026, from
  the spreadsheet import) had programme `ŅAV`; Home's "Admitted by programme" showed it as its
  own row, "not one of the list", beside NAV's 61. No label could fix it honestly.
- Changed: on Ritvars' explicit yes, that one record only, in one transaction, with a history
  line written as the app's own edit writes one ("Programme changed: ŅAV -> NAV ..."). No code,
  no data model, no other record touched.
- Verified on the live database: NAV 61 -> 62, ŅAV 1 -> 0, people 192 -> 192. The only
  remaining "ŅAV" is that history line's old value, on purpose.
- Tests: full suite 554/554. No code commit, so no deployment: the live app reads the corrected
  row directly.
- Still there: the local import file `data/real_people.json` (gitignored, on Ritvars' PC) holds
  the same typo; a re-import from it would bring `ŅAV` back.

**Aigars' feedback queue, item 2/5 - Journey visual hierarchy: LIVE 28.09.2026, commit 035543f,
deployment dpl_Hn7uafA3NYipfoxJq1qbdpMc5jY7.**
- How far: every column carries its stage number (1-5) and a thin line across its top, one
  brandbook hue getting darker from stage 1 (Novikontas Blue) to the last (Navy); the column only
  takes a faint tint (at most 7%). Stages, their labels, order and drag-to-move are unchanged.
- Next step: its own line on each card, with an arrow, in full ink, and its due day under it.
- Overdue: a SOLID red badge with white words, "2 d. overdue" (6.5:1), and a red edge on the
  card; the column header counts them ("1 overdue", same badge). Aigars: "warning messedzus bik
  cita krasa, sita tada draudziga". Today: amber "Today", no edge. Ordinary days: quiet grey.
- Dark mode: the columns go deeper so the cards stand out ("Seit viss kka saplust viena"); the
  red edge survives the glass border.
- The explaining subtitle "Where each open person is. Drag a person when something real has
  happened." is removed - Ritvars: "If you have to explain items, the UIUX can be better".
- Tests: test/journey_visual.test.js 10/10 (overdue, today, normal and no step; every stage in
  order with its label; the tint; dark rules; phone widths; no subtitle; badge contrast); full
  suite 564/564 on the exact commit.
- Verified: live page byte-identical to the commit, all 55 files match, 401s and 0 leaks; the live
  page carries cJourneyCard, the alarm badge and no subtitle. Signed-in screens rendered from the
  exact deployed commit with demo data (overdue, today and normal cards) in light, dark and at
  390 px.

**Two fixes from Ritvars' screenshots, LIVE 28.09.2026, commit 07e5480, deployment
dpl_HCdWwKzbZzczmC75ZLY1RyzsfTSX** (568/568 on the commit; live page byte-identical):
- "Weird size indifference!": the Home KPI strip had a 54 px Admitted beside 30 px figures. Now
  one size, and label / number / note sit on shared rows, so a label that wraps ("Median time to
  admission" at a narrow width) no longer pushes its number down. Checked at 1440, 960 and 390 px.
- "Anonymize!": the feedback box said "Read by Aigars and Ritvars". Every place the screen says who
  reads feedback now says "the people who build the CRM" (the box, the form, the Feedback page,
  the Settings row, the Help center answer). WHO may read feedback is unchanged:
  `CFG.feedbackReaders` still decides it in `mayReadFeedback()`.
- The same KPI fix went to the component library, kit 13 (aa2fe35).

**Urgency, buttons, version line: LIVE 28.09.2026, commit 5321a55, deployment
dpl_2XPnQb2yPoug1UeduiN46238rsyk** (576/576). Ritvars: "these colours also are not urgent colors",
"again, doesnt feel urgent enough", the Done / Feedback buttons "doesnt match overall uiux ... the
amber now is quite not in place", "Leave: CRM v1.0".
- One urgency rule across C: overdue and late = a SOLID red badge with white words ("3 d.
  overdue"); today = a SOLID amber badge with Pitch Black words; upcoming stays neutral. On the
  Journey, Next Steps (and its Overdue / Due today counts), New Leads ("late"), Home and the
  person card.
- Buttons in C are the brandbook CTA - Navy with white (dark: white with Navy) - with no amber
  stripe; the Feedback button too. The classic UI keeps its own.
- The line under the logo reads "CRM · v1.0" (config `version`).
- NOTE: this deploy also shipped two commits from ANOTHER session on the same branch, ef7917f
  (shared links sign in first) and 0c5d65d (new app icons, "owner's pick"). Both checked working
  live afterwards (icons match the repo; a signed-out tab on an /api/ link 302s to sign-in, a script
  gets 401). From here the live page = the commit + the sign-in return script ef7917f adds in
  <head>; the deploy check now builds that exact page and compares byte for byte.

**Aigars' feedback 2A - the Journey filters: LIVE 28.09.2026, commit 95cfdad, deployment
dpl_9tdwjiBbSPkoPMkBhvwiWVoawh3T** (581/581; live page = commit + sign-in script, byte-identical).
- One row under the title: **Programme ▾ · Overdue / Today ▾ · Owner ▾ · Came from ▾**, compact
  dropdowns. Programme and Came from offer the values the open people carry (and "not
  recorded"); Owner offers every configured role, Student Coordinator included ("add
  coordinator also"); Overdue / Today offers Overdue and Today ("Overdue or today" was dropped:
  "What is the point of this?").
- They combine (all must hold); a set filter gets a Navy edge and shows its value; Clear appears
  when any is set; column counts follow the filter. Phone: two by two.
- Tests: test/journey_filters.test.js (each filter, combined, the options, the set state, phone).

**Charts and menu: Novikontas Blue + yellow - LIVE 28.09.2026, commit 3b1f3ca, deployment
dpl_Dwj3TANZeqwTwTDF9piWhs7Doswh** (584/584; live page = commit + sign-in script, byte-identical).
Ritvars: "Priority is novikontas blue and yellow. for admissions you can use a navy blue line,
admitted novikontas blue", and on the menu "it doesnt need to be highlighted, the home can just stay blue".
- Admitted = Novikontas Blue #29a8df (month bars, donut, programme bars, came-from bars, report
  bars); new leads = a Navy #0a2463 line (dark: light grey #e7ebf0, Navy disappears on the sea);
  Open = yellow #F7C04F; Not proceeding / not recorded = grey. No other chart colours.
- Light menu: a faint blue hover and tree line; the active item keeps its Navy text and blue icon
  with no block behind it. Dark menu unchanged (its own look).
- Checked: Home light, dark and phone (390 px). Tests: test/metrics_colours.test.js.

**Kit 13 polish (three-app dev-kit audit) - LIVE 28.09.2026, commit ea5d291, deployment
dpl_BQ2rpkN6ggPPktnFekPPkrBaGBSj** (588/588; live page = commit + sign-in script, byte-identical).
- Phone: the Light/System/Dark switch and the (c) line + Help center now sit at the bottom of the
  PAGE (they were hidden below 760 px). Desktop unchanged. Kit level 2 -> 3 for both.
- Light base colours -> brandbook (kit 2 -> 3): side menu Light Grey #e7ebf0, page #f5f7fa, text
  Pitch Black, secondary Steel Blue #415c8f (+ two steps, 4.5:1+ on the menu), focus/marks Navy
  instead of the teal #2e6b70, field and switch edges #6f7e97 (3:1; #c9d0d3 was 1.5:1). The blues,
  amber, green/red states and the chart colours unchanged.
- Dark (kit 2 -> 3): field edge #82a0ba and the menu tree line at 28%, the two lines kit 13
  lightened; Admitted = the logo blue #29a8df as in light. The sea itself unchanged.
- Texts cut to a third (Ritvars): People "Click a row to edit.", its count "All N people.", Next
  Steps "What the team has to do.", New Leads "New arrivals land here first."
- Checked: desktop light/dark, phone light/dark. Tests: test/kit13_polish.test.js.
**Retention 13 months - DECIDED + IMPLEMENTED 29.09.2026** (Ritvars: "ok 13 months"). Raw `pbx_calls` and
`sis_applicants` rows older than 13 months are deleted at the end of each run; timeline entries stay with the person.
Also handed to CRM V1 on his yes: New Leads phone rows show the caller's number (tel: link) instead of "Unknown".

**Phone catches up - LIVE 29.09.2026, commit 7ded9c2, dpl_DznzBX4SMXqXMWa4tfqCUy9zZxiv** (656/656). Ritvars: a run should
bring in all the calls, daily at 08:15 Riga. A run now walks from the bookmark (`pbx_until`) to now in 15-minute
pieces (at most 24 h, stops at 40 s and carries on next run). Schedule 05:15 UTC = 08:15 Riga, 07:15 after 25.10.
First Run before this change: TeleGroup answered, 0 calls in 16:13-16:28 (the real token works).
FIRST CATCH-UP RUN 29.09.2026 16:43 Riga (Ritvars pressed Run): 28.09 16:43 -> 29.09 16:43, 96 pieces, caught up;
TeleGroup returned 152 calls, 9 were incoming on the three college queues, 0 matched a CRM person, 9 went to New Leads
as `simulated`. Next: Ritvars looks at the 9, then says when the phone goes live.

**Phone channel in TEST mode, with a Run button - LIVE 29.09.2026, commits ad597ce + 3cac650, deployment
dpl_CDRxXtVNDtZbhJjtiegmD229uwL4, then a redeploy for the mode** (651/651). Ritvars added PBX_API_TOKEN himself
(Secret, Production). `/api/cron/pbx-calls` is on the Vercel schedule once a night (01:00 UTC) so the Cron Jobs
page has a Run button that sends CRON_SECRET itself; CHANNEL_MODE_PHONE=test, so unknown callers land in New Leads
as `simulated`. TeleGroup (novikontas.tg.lv) not yet called with the real token: first run by hand is next.
OPEN: the nightly run only reads the last 15 minutes; every 5 minutes waits for Vercel Pro.

**New Leads: a missed call you can ring back - LIVE 29.09.2026** (658/658): the phone job put 9 real calls into
New Leads and every row read "Unknown" with no number anywhere on it, so the one thing an operator needs after a
missed call was the one thing the screen did not show. The number was there all along - sync.js storeCall passes
`phone: r.caller_num` into receive(), and listInbound selects `i.*` - only the row template dropped it. The classic
view had always printed it; concept C never did. A row with no name and no handle now shows the number in the name
slot as a `tel:` link, the same call link as Next Steps, People and the person card. A row with a name is unchanged;
with neither a name nor a number it still says "Unknown". No explaining sentence. Checked on a real phone-shaped
lead, not on the source. Test: test/new_leads_callback.test.js, which fails if the fallback is removed.

**Home width + call / write everywhere - LIVE 29.09.2026, dpl_ACLDen7gEjeuxcoVkpMJBEreL4wy** (660/660, commit 31c6b90):
Ritvars, from a screenshot: "a lot of space here". MEASURED at 1920: Home was held at 1080px by `.kpage`
inside a main that allows 1320, and main is left-aligned, so 576px sat empty down the right and 284px below,
and the page did not scroll - while Journey and People already used the full width. The `.kpage` cap is gone,
so Home AND Reports now take the same width as every other screen. No Home content, hierarchy, colour or
component changed. The month chart keeps its own 900px cap on purpose. Checked 1920 / 1440 / 960 / phone,
light and dark. Test: the width rule in test/frame_drifts.test.js.
Also LIVE: Ieva's "piezvanīt vai uzrakstīt" applied where it had been missed. `tel:` and `mailto:` existed in
exactly ONE place in the whole app, the Next Steps row; the People row and the Journey person card printed the
same phone and email as dead text. One helper now (`cTelLink` / `cMailLink` / `cReach`) used by all three.
The narrow Journey column cards are deliberately left alone: the person card is one click away and those
columns are 150px. Test: test/ieva_feedback.test.js.

**A next step says what KIND it is - LIVE 29.09.2026, same deployment** (commit f49a1f7): Aigars' "a colour or
icon per next-step type". An ICON, not a colour: the card already spends its only two accents on time (amber is
today, red is overdue), so a colour per type would argue with the only two colours that mean anything there.
One mark per GROUP, the four the picker is built from. FINDING: on the real database all 34 open next steps are
the 23.09 import's "Get in touch (from the sheet)", which is in no group, so every real card keeps the plain
arrow and this shows nothing until Admissions plans real steps. Whether that imported step counts as
Conversation is OPEN, for Ritvars. Two demo labels had also drifted out of the configured list
("Check the documents", "Collect the medical certificate") and so could never be matched to a type; both fixed,
and a test now refuses any demo next step that is not in `config.nextActions`.
OPEN, not started: the Journey summary for management (Ritvars: decide after seeing the corrected Home width;
it also needs `0. NJK KPI 2026.xlsx` and Ieva's slides). The Channels rework + the SIS row: layout to be shown
to Ritvars BEFORE anything is built.

**Ieva's two points - LIVE 29.09.2026, dpl_4hDHjrpkzxdMSydQAMmpoUMKnqzq** (651/651): "Add lead" on New Leads (the Add person form);
every Next Steps row shows the phone and email as call / write links and one line of the newest comment (else the imported note), without
opening the profile. Test: test/ieva_feedback.test.js. Also LIVE today: e070927 the Postgres schema as a connection option (the pg
DeprecationWarning gone; checked read-only on Neon first).
NEXT: Aigars' open three - a colour/icon per next-step type, a Journey summary for management, the real channels.

**People filters as dropdowns - LIVE 29.09.2026, dpl_5vWRBip8K4L3E9ooQZRfnc8iuz9T** (647/647): Aigars' "filtrus ... nevis vnk pills" was
written under the PEOPLE screenshot. Stage, Programme, Next step, Owner, Came from, Details - the Journey's look, combined, every old
pill kept as an option. Test: test/people_filters.test.js.
NEXT (Ieva, 29.09): (1) "kā var pievienot jaunu leadu?" - Add person is on People only; make adding a lead findable where she works;
(2) Next Steps rows show the contact details and the notes right there, without opening the profile ("lai es uzreiz saprotu, kas bija
runāts, un piezvanīt vai uzrakstīt"). Then Aigars' open three: a colour/icon per next-step type, a Journey summary for management,
the real channels.

**Aigars item 4 ("Application form started" / "Matriculated" from the SIS, automatically): CAPABILITY DONE 29.09.2026** - Ritvars: "we are just creating and testing ... i talk about capabilities". Built, connected, deployed, first real sync run; real people follow as the SIS fills.

**THE FIRST REAL SIS SYNC - 29.09.2026 14:30 Riga, test mode** (Ritvars added CRON_SECRET; CHANNEL_MODE_SIS=test
set; deployed dpl_CqpFohBN4yHXuFhUmLVgQhdcT7RW; the cron route now 401s a wrong secret; Ritvars pressed Run).
Read-only before/after: fetched 6, stored 6 (registered 4, submitted 1, matriculated 1), unusable 0,
**linked 0, stage moves 0, facts 0, Inbox 6** (all `simulated`, state new). Correct: none of the 6 has an
email or phone (last 8 digits) that exists on any of the 192 CRM people - checked as counts. The
bookmark is the newest changedAt (2026-09-29T05:01:25Z), so the next run asks only for what changed.
People unchanged (192; statuses as before). The daily run (08:00 Riga) now repeats this in test mode.
OPEN, Ritvars: the 6 SIS applicants are in New Leads as simulated items - confirm them as people or
archive them; and when to switch CHANNEL_MODE_SIS from test to live.

**Live call test - COMMITTED, NOT DEPLOYED 30.09.2026** (Ritvars' test brief; branch test/pbx-live-2026-09-30 from live
e52e1b4). Question: does /api/crm/pbx/calls/list/ show a call while it rings and while it is answered, or only after it
ends? It decides the call pop-up (poll every ~10 s vs a real-time event from TeleGroup). GET /api/admin/pbx/live: admins
only, behind sign-in, the last 2 minutes, per call only uniqueid, created_at, queue, state, operator_name, caller's last
4 digits; never the token. Needs production (the token lives only in Vercel), so it waits for his go to deploy.
Then: he calls +371 23111114 (press 1); it is read while ringing, after answer, after hang-up. RESULT: not run yet.

**SIS mapping decided + where the person is in the SIS - LIVE 29.09.2026, commits 4b31df5 + fecde5e,
deployment dpl_8Cazdz5YttPu88dkC94GnYknm6Pu** (645/645).
- Ritvars: an application already past `started` also shows "Application form started", dated by its
  submittedAt ("Yes, by submit date"). Every SIS date reads "by <date>" (the SIS dates come after the
  moment). Registered-only: no fact.
- Ritvars: after submission it is the Student Coordinator's work; Admissions must see the next step
  and whether it happened, to nudge. One line on the person page: "In the SIS: Submitted by <date> -
  next: Admitted (Student Coordinator)"; "SIS: <status>" on the Journey card. SIS statuses only, the
  next one in their order; a role only where he named one. Not a stage.
- vercel.json: /api/cron/sis-sync once a day, 08:00 Riga (Hobby allows daily; deploy accepted) - it
  gives the Cron Jobs page a Run button that sends CRON_SECRET itself.
- WAITING: CRON_SECRET (Ritvars, steps given), then CHANNEL_MODE_SIS=test, redeploy, one Run, check.

**SIS token in Vercel (Ritvars) + the first real reply read - 29.09.2026, commit 5d19d10, deployment
dpl_6otifuBwFPWMQkuUcuB36mDowCYh** (643/643). The Vercel CLI does not give production secrets to a local
machine, so the first look runs inside production: GET /api/admin/sis/first-look (admins only, one
read-only GET, SHAPE only). Ritvars opened it: 6 applicants, all documented fields and no others,
registered 4 / submitted 1 / matriculated 1, no started or matriculated date field. Matriculated
CONFIRMED as a status (dated by changedAt); "form started" still PROVISIONAL (no `started` record yet).
OPEN, Ritvars: should an application already past `started` show "Application form started", and dated
how? Then: CRON_SECRET + CHANNEL_MODE_SIS=test for the first sync (writes the 6 SIS rows, links/moves
matching people, raises Inbox items) - needs his yes. docs/LIFECYCLE.md.

**SIS feed merged and connected to the lifecycle facts - DEPLOYED 29.09.2026, commits 78108be + f9addb8,
deployment dpl_93UAHjoPd1xi8qC4hFTG8rv9RRRd** (640/640; live page = commit + sign-in script, byte-identical).
- Taken from the channels branch: ONLY 4f14180 (SIS client lib/sis.js, sync src/sync.js, storage
  sis_applicants + sync_state, the PBX poller that shares those files, api/cron/*), cherry-picked as
  78108be with no conflict on today's v1-test. NOT taken: dbbb027, 8777509, ebe0044 (the channels
  register, the Channels screen, their docs) - the feed does not need them; they stay on the branch.
- f9addb8: applyToPerson() calls recordSisLifecycle() for every SIS row linked to a person (stats.facts);
  4 new tests (started -> fact once, matriculated added later, submitted/unmatched write nothing, the
  cursor page is followed). vercel.json has NO */5 cron (Vercel Hobby refuses it): the schedule is the
  deployment dependency. scripts/sis_first_look.mjs = the read-only first look at a real reply.
- Production, checked: /api/cron/sis-sync answers 500 "Missing CRON_SECRET" with no or a wrong bearer
  (does nothing); lib/, src/ not public (404). Read-only DB: sis_applicants, sync_state, pbx_calls,
  lifecycle_events exist with RLS on, all 0 rows; the SIS channel mode has no row (off); only schema crm.
- Vercel env (names only): SIS_API_TOKEN, CRON_SECRET, PBX_API_TOKEN are NOT set. So no real SIS
  reply has been received and the mapping is still PROVISIONAL.
- REMAINS, in order: (1) Ritvars adds SIS_API_TOKEN + CRON_SECRET in Vercel; (2) the first look
  (`vercel env run -e production -- node scripts/sis_first_look.mjs`), confirm/change SIS_LIFECYCLE_MAP;
  (3) CHANNEL_MODE_SIS=test, one call of the route with the secret, check; then live; (4) the schedule:
  Vercel Pro + the */5 cron, or another scheduler calling the route. docs/PBX_SIS_SYNC.md, docs/LIFECYCLE.md.

**Aigars compliance 29.09.2026 - lifecycle facts, comments, phone chart, copy - LIVE**
- Lifecycle facts "Application form started" / "Matriculated" - **1780c71**, dpl_8GK28PkftV76rZzHWz6TgiEDJg91,
  615/615. src/lifecycle.js: PROVISIONAL mapping in one place (SIS status 'started' / 'matriculated',
  dated by changedAt; the SIS document has no startedAt/matriculatedAt; nothing else writes a fact),
  idempotent (one per person, fact and SIS application). **Schema change on production, one table:**
  lifecycle_events (PK person_id, fact, source, source_ref), created only if missing, RLS on. Read-only
  check after deploy: exists, RLS on, 0 rows, 0 of 192 people show a fact, Postgres plans the insert
  as ON CONFLICT DO NOTHING on its key; src/lifecycle.js not public (404). Shown on the person page,
  Journey card + side card, Outcomes - never a stage. Test: test/lifecycle.test.js. docs/LIFECYCLE.md.
  **NOT RUNNING YET:** the SIS fetch (token, since/cursor paging, 5-minute run) is the channels branch
  channels-pbx-sis (4f14180), not merged; it needs the one recordSisLifecycle() call named in
  docs/LIFECYCLE.md, Vercel Pro for */5 crons, SIS_API_TOKEN in Vercel, then one real reply to confirm
  the mapping. The channels session was not reachable to be told (29.09).
- Comments, dead ends, phone chart, copy - **2f67553 + 43a3f9c**, dpl_BR6G7qGwFLNrSBs6L6T77KdGJ1oe, 619/619
  (2f67553 alone failed 7 card tests; the deploy gate refused it and nothing was deployed until the
  test fix 43a3f9c): the Journey card previews the NEWEST comment written on the person page (Add a
  note / Log a call), else the imported note; the thread is the person page's History (read-only on
  production: the query runs; 0 of 192 have a written comment yet). Phone month chart drawn 360 wide,
  labels ~11 px (were 5-6 px). Removed: Home chart caption, Settings sub-lines, the feedback inbox
  and box lines (incl. the untrue "stays on this machine"), the report's "count of rows". Kept: data
  warnings (To fix, Data to tidy). Test: test/aigars_gaps.test.js.

**Unified audit work 29.09.2026 (Projects/College CRM/UNIFIED_AUDIT_WORK_2026-09-29.md) - all four
items LIVE**, each deployed from the clean folder and read back (live page = commit + sign-in script,
byte-identical; 401s; 0 leaks):
- Items 3-4, frame drifts (dev kit part 2) - **9bc41e2**, dpl_6QSwwqFAbdTGVbWnHhvyeL8j3YKK, 599/599:
  manifest background_color #ffffff (read back live); the logo link aria-label "Novikontas Academy -
  Home" (read back live); the official two-tone logo on light (src/assets/NoAca_logo_twotonehor.svg,
  served 200; replaces the Pitch Black recolour of 24.09); icon comments say white tile; C headings
  Inter everywhere (the owner locked Inter, 28.09). Test: test/frame_drifts.test.js.
- Item 2, feedback kind QUESTION - **ea3b586**, dpl_AdLkFKjerMo62dbNeZnFMoN41Fom, 603/603: the box has
  An idea / Something broken / A question; server KINDS + sql/002 check; both inboxes label it;
  "Report a problem" (Settings, Help center) opens the box on Something broken. The live feedback
  table stores kind as plain TEXT (no DB check), so no schema change. Verified end to end on a
  local throwaway copy only (a made-up test question, never on production).
  Test: test/feedback_question.test.js.
- Item 1, Help center (dev kit part 3) - **1caf366**, dpl_Gg25T1NUi996KdrzyMd59ahvWCyZ, 610/610: Take
  the tour (steps ring the real menu, Next Steps, Journey, the switch, Feedback), "Questions and
  answers" with search, most opened first, "Didn't find it? Ask a question" -> the box on A
  question. Questions in config/help.json. Routes POST /api/help/opened, GET /api/help/counts behind
  sign-in (401 signed out, read back). **Schema change on production, one table:** help_faq_opens
  (faq_id TEXT PK, opens INTEGER, last_at TEXT) - a count per question id, nothing about who; created
  by the boot schema (CREATE TABLE IF NOT EXISTS, RLS switched on like every CRM table), so it is
  idempotent. Read-only check after deploy: exists, RLS on, those 3 columns, 0 rows, Postgres plans
  the counting upsert (arbiter = its primary key), no other schema created. Test: test/help_center.test.js.
- OPEN, the owner's call (audit item 3): light page #f5f7fa (the app, chosen 28.09 so Home is not
  sterile) vs the kit's #ffffff - which one changes? Dark active menu item: the kit still has the
  #1a4670 block; the owner removed it in the CRM (28.09 "remove the large highlighted background"),
  so the KIT should follow (Unified Audit session).

**Aigars UX compliance pass - LIVE 28.09.2026, commit c058e63, deployment dpl_5CAAu35HLnJVDRCu4jA5dZRNobQU**
(595/595; live page = commit + sign-in script, byte-identical; 401s and 0 leaks). Audited screen by
screen on the real-data snapshot (local, in memory) at 1440 / 900 / 390 px, light and dark.
- Phone + tablet (<= 900 px): the C menu was a 360 px block PINNED over the work; now one sideways
  row of the same links in the same order (~95 px), the current place scrolled into view, solid in
  dark; switch + (c) line at the page bottom on every top-bar width. No page is wider than a phone.
- Journey cards: the next step reads "Get in touch" - the import titled all 34 open production
  tasks "Get in touch (from the sheet)" (read-only count 28.09); display only, stored titles
  untouched. A one-line comment preview of what people wrote, without the import's "Sheet status: |
  Docs: |" tags (68 of 91 open notes carry them); the whole note stays on the card and person page.
- Phone Journey opens on its columns; the person card appears once a card is tapped.
- Dark menu: no block behind the active item (light had lost it earlier today).
- Sentences removed: Next Steps footer, person Stage explanation, Journey "working version"
  (both now the tag "Stages to agree"), Settings and Outcomes subtitles. Outcomes rows and the
  Settings switch fit a phone.
- Tests: test/aigars_ux_pass.test.js (+ journey_visual, kit13_polish updated).
- NOT verifiable by me on production: the signed-in screens (Google sign-in). Proof is byte identity
  of the live page with the commit plus the local renders on the real snapshot.
- STILL OPEN from Aigars: #3 comments (preview done; a comment thread per person is not built),
  #4 lifecycle facts "Application form started" / "Matriculated" (NOT built: the SIS feed exists only
  on the unmerged branch channels-pbx-sis, e14a952, never called against the real SIS; missing
  evidence = one real SIS response showing which field says a form was started and which says
  matriculated, and who confirms the mapping), #5 (never written down in this session - Ritvars to
  restate). Channels simplification is the channels session's. Phone Home chart labels are tiny.

- Left as decided/for Ritvars: part 1 (the CRM is Google-only by Aigars' decision; part 13's card is
  its standard), part 2 backup (none yet; it would hold real people's data - where it may be kept is
  his call), part 14 moving lines (an add-on, not a default; the sign-in has its own sea).

**OPEN after 28.09:**
- **Privacy, Ritvars to decide:** one real person in the live CRM (created 2026-07-20, source
  unknown) has the same name + phone as a person in the demo data, and that name + phone are
  committed in src/demo.js, src/simulator.js, config/inbound_fixtures.json,
  test/connection.test.js and test/regressions.test.js. Untouched.
- The CRM still uses the sea palette; moving it to the kit's brandbook colours is not started.
- Channel audit findings, all still open: Meta/WhatsApp keep 1 of N messages per delivery;
  Mailchimp events land in New Leads instead of consent; Gmail and PBX never reach New Leads;
  LinkedIn answer fetch not built; dedupe not enforced by the database; `/api/sim/*`,
  `/api/intake/demo` add demo records for any signed-in user; production has never received an
  inbound event.
- A consent WITHDRAWAL (Mailchimp unsubscribe) is not recorded from intake - it belongs to the
  consent route above.
- Queued: reconcile the Admissions numbers against "0. NJK KPI 2026.xlsx" and Ieva's slides.
- The production database moves to Aigars' paid Supabase later; not started, by instruction.

## Pin

**04.10.2026 (second patch) - LIVE: `0078bff` (release/2026-10-04-intake-2), dpl_E56YxQrYhFY5GXkGssK9uUMpXxG4, verified by MASTER CONTROL. Menu final + immersive (light and dark), header glow + navy titles, Channels one line per channel, website field names (Q3), Website temporary, Admissions reads all History. NOT in it: the call pop-up (unpicked A/B, polls every 3 s), type 2a and cards 2c (not built yet).**

**04.10.2026 - LIVE: `62f8178` (release/2026-10-04-intake), dpl_uTzfeGw6PZNSgxUGoQUinLP41utH, verified by MASTER CONTROL; record in docs/INTAKE_CONTROL_2026-10-02.md (control/2026-10-02-s1). Production was 292b4f9 until today.**

**02.10.2026 control state: `docs/INTAKE_CONTROL_2026-10-02.md` is the authoritative current state for this run. The product is INTAKE.**

**PIN: ACADEMY CRM V1 IS DEPLOYED AND IN USE. CHANNELS ARE NOT CONNECTED.**

Rewritten 30.09.2026. It said "NOT RELEASED, NOT DEPLOYED, NOT CONNECTED" until then, which had
been untrue since 27.09 and sat directly under a note saying the opposite. The old text is kept
below, dated, as the record of where the project was.

- **Version:** V1.
- **Live:** https://crm-novikontas.vercel.app, Vercel + Neon Postgres, production at `292b4f9`.
  **PROVEN 02.10.2026:** the live page is byte-identical to that commit apart from the 605-byte
  sign-in return script the server injects (367029 = 366424 + 605). The Pin said `e52e1b4` until
  today, which was three releases stale.
  It holds the real 2026 admissions people. Google sign-in only; the password route answers 410.
- **The UI:** Concept C is the product, ACCEPTED by Ritvars 28.09.2026. The previous UI stays at
  `?ui=classic` as the fallback until Admissions has verified C. Nobody from Admissions has worked
  a full day in C on the real people yet.
- **Channels: 12 active, NOT CONNECTED.** The universe was reconciled 02.10
  (`docs/CHANNEL_RECONCILIATION_2026-10-02.md`): Google Form is **dropped**, Open Day is **parked**,
  apply.novikontas.org is **downstream and not a channel**, and SIS is an **integration**. The old
  counts of 14 and 15 included those. Every adapter is written and tested and every one is switched off.
  ~~`inbound` holds 15 rows, all `source=simulated`, and 0 from a real provider.~~ **Stale since
  01.10 05:27Z** [seen 02.10, production backup `2026-10-02T01-17-43Z`]: **44 provider rows**, Phone 4
  (TeleGroup daily pull) and Gmail 40 (option B, edu@novikontas.org). Phone and Gmail(edu@) are
  **live verified**; all 44 still sit at `state=new`. See `docs/INTAKE_CONTROL_2026-10-02.md`.
- **Scope: NOT LOCKED.** It changes daily on owner feedback, and Ieva has not validated the
  workflow, so treat every row below as provisional until she has.
- **Release line:** `v0.9`, pushed to GitHub (`origin/v0.9` at `52e2232`, one doc commit above
  production). `master` is still `afea424`, unchanged, never deployed, no tag exists. Production is
  deployed from release branches cut off the live commit, not from `master` - the arrangement in
  force, not a release process anybody has signed off. **Open tidy-up:** whether `v0.9` becomes the
  permanent release line, whether `master` is fast-forwarded or retired, and whether `v1-test`
  (behind, at `3fb39c5`) is deleted. Nothing is blocked on it.
- **How a deploy happens:** from a clean checkout of one commit, after the whole suite passes on
  that checkout, then checked on the live site (page byte-identical to the commit, 401 on every
  private route, 0 leaks from the source and config probes).
- **Next:** Ieva validates the workflow (rows 46, 50, 51). V2: **UNKNOWN** - no V2 has been defined
  by the owner and this file does not invent one.
- **Blockers:** rows 46, 50, 51 (all Ieva); the 2 open questions in `config/prototype.json`
  (Tetiana's spam words, which agent partner to start with); connecting the channels. **Open owner
  decisions, none blocking code:** the KPI strip (hairline or cards, and it reaches kit part 2),
  Home A (journey first) or B (today first), rebuilt 02.10 on `ui/2026-10-02-main-ab`, Channels A or B, Ieva's Journey stage names, and whether Meta's APP REVIEW is a
  decisions, none blocking code:** ~~the KPI strip~~ (CARDS, decided 30.09 in KB 08 P5, not open -
  corrected 02.10), Home A or B, Channels A or B, Ieva's Journey stage names, and whether Meta's APP REVIEW is a
  `question` or `work` in `blockerKind`.

Decisions and the open D-C questions are in [DECISIONS.md](DECISIONS.md).

### The Pin as it stood on 25.09.2026, kept

Read from Git and a test run at the time, not from memory of a conversation. Every line below was
true then and several are not true now: the CRM was deployed on 27.09.2026.

**PIN (25.09.2026): ACADEMY CRM - V1 VIRTUAL PROTOTYPE. NOT RELEASED, NOT DEPLOYED, NOT CONNECTED.**

- **State:** implemented and tested locally; committed and pushed to `v1-test` for Aigars to test.
  Not deployed anywhere, so not verified anywhere but a local browser.
- **Release line / deployed:** `master` at `afea424`, unchanged and never deployed. `v1-test` at
  `b4d7ba3` is the **testing branch** Aigars works from, meant to reach `master` through a pull
  request once Ieva has validated the workflow. That answer reached this file relayed rather than
  directly, so question 14 stayed open. Nothing had been merged, deployed or tagged either way.
- **Blockers then:** rows 46, 50, 51; open questions 1 to 6 and 9 to 14; the Google Workspace
  administrator; every remaining item under "What is NOT done". There was no authentication at
  all, so every admin-only screen was a workflow rule and not a security boundary.

| Delivery state | Answer | Evidence |
|---|---|---|
| Implemented | Yes | `git status --porcelain` is **empty**: the working tree is clean |
| Tested | Yes, locally | `node --test test/*.test.js` -> **326 pass, 0 fail**, run 25.09.2026 |
| Committed | **Yes** | `v1-test` = `b4d7ba3`. Five commits on top of `afea424` |
| Pushed | **Yes** | `origin/v1-test` = `b4d7ba3`, byte-identical to local. `origin/master` = `afea424`, untouched |
| Merged | **No** | nothing has been merged into `master`, by design. `git log --merges` is still empty |
| Deployed | **No** | no environment has ever received this code. No Supabase project, no Vercel project |
| Verified | **Locally only** | observed in a local browser. There is no deployed environment to verify in |
| Released | **No** | `git tag` is empty and there is no release record |

**A commit on GitHub is not a deployment and not a release.** `v1-test` existing on GitHub means
Aigars can fetch and run it. It means nothing about deployed, verified or released.

## Project control map

Where each concept lives in this project, so a session does not have to rediscover it. There is no
`CLAUDE.md` in this repository, so the map lives here.

| Concept | Home |
|---|---|
| Pin | this file, the **Pin** section above |
| Scope, and whether locked | this file, the **Pin** section above |
| Remaining work | this file: open rows below, plus **Open questions for Ritvars** and **What is NOT done** |
| Backlog | this file. Numeric `#` IDs, statuses `SAID` / `DECIDED` / `BUILT` / `LIVE` / `UNKNOWN` |
| Owner decisions and blockers | [DECISIONS.md](DECISIONS.md) - locked decisions with the test behind each, and the blocking table at its end. Plus **Open questions for Ritvars** here. |
| Release record | this file, the **Release record** section below. There was none before 24.09.2026. |
| Handoff | this file, the **Handoff** section below. There was none in the repository before 24.09.2026; it lived only in assistant memory, which no other account can read. |

Status words in this project do not mean what a generic checklist might assume:

- `BUILT` means it exists in the prototype. **It does not mean deployed, and it does not mean
  verified anywhere but a local browser.**
- `LIVE` means verified running in production. **Nothing in this project is LIVE, and nothing can
  be until something is deployed.**
- `DECIDED` means the owner decided it. It says nothing about whether it is built.

## Release record

**Nothing has ever been released.** No tag exists. No environment has received this code.

| Version | Released | Tag | Deployed to | Verified |
|---|---|---|---|---|
| V1 | No | none | nowhere | local browser only |

The published artefact is the GitHub repository `RitvarsTeo/college-crm` (private). It now holds
two branches: `master` at `afea424`, untouched, and `v1-test` at `b4d7ba3`, which is what Aigars
tests. **A commit on GitHub is not a deployment and not a release.**

## Handoff

Written 24.09.2026. A fresh session on any account should be able to work from this alone.

- **Branch:** `v1-test` at `b4d7ba3`. One worktree, no others (`git worktree list`). The working
  tree is **clean**.
- **Remote:** `origin` -> `https://github.com/RitvarsTeo/college-crm.git` (private, owner
  `RitvarsTeo`, collaborator `NovikontasAcademy` with write access). `origin/v1-test` = `b4d7ba3`,
  `origin/master` = `afea424` and **must stay there** - nothing is pushed or merged to `master`.
- **Other branch:** `deployment-audit` at `7438633` exists **locally only**. It holds a deployment
  audit that was deliberately not published. Do not delete it without asking.
- **What is on `v1-test`,** five commits on top of `afea424`: the 14 channel adapters and the
  locked navigation (`45afc38`), the Mailchimp check and typed blockers (`9638051`), Marina's
  WhatsApp and phone confirmations (`7305310`), the guide rebuilt as the connection task list
  (`690f1f5`), and four faults found by testing against real provider shapes (`b4d7ba3`).
- **Tests:** `node --test test/*.test.js` -> **326 pass, 0 fail**, run 25.09.2026.
- **Run it:** `npm start`, then `http://localhost:8800`.
- **Database:** `data/crm.db`, git-ignored. It **survives a restart** - verified by seeding a row,
  restarting and reading it back, after row 58 fixed a boot-time wipe that made an earlier claim of
  this wrong. `CRM_DB=:memory:` restores throwaway behaviour; the tests use it. `DATASET=empty|real|synthetic`
  forces a load at boot and therefore CLEARS what is there.
- **Open owner decisions:** since Concept C was accepted (28.09.2026) these are **D-C1 to D-C8** in
  [DECISIONS.md](DECISIONS.md): the real Journey stages (was rows 46 and 50, "the real process after
  To look at"), the lead who said nothing useful (row 108), the next-step list and the outcomes (row 51),
  dragging between stages, the Home measures, the facts a person needs, and Marketing's part. Plus
  everything in that file's blocking table.
- **Exact next action:** Ieva validates the workflow (rows 46, 50, 51). Committing and pushing to
  `v1-test` is authorised; `master` is not, and nothing is deployed anywhere.
- **UNKNOWN:** whether V1 is ever meant to be deployed, and to what. No environment has been chosen.

### Git workflow: proposed, not established

This repository has **one commit and no merge commits**, so it has no established branch or PR
convention to follow. Rather than inventing one, here is the proposal for Ritvars to confirm or
reject:

- work on a feature branch per bounded change, named `feature/<row-id>-short-name` or
  `fix/<row-id>-short-name`, branched from `master`;
- open a pull request against `master` stating purpose, behaviour, evidence, what is unverified and
  the rollback, and merge it there;
- keep `master` as the release line, and tag only a commit that has actually been deployed and
  verified - which, today, means no tags at all.

**Superseded 24.09.2026.** Ritvars established the convention himself: `v1-test` is the testing
branch for Aigars, work is committed and pushed there directly, and `master` is never pushed to or
modified. No pull request has been opened and no branch has been merged. Whether `v1-test` later
becomes the release line, or merges into `master`, is open question 14.


**To connect a real channel, start at [CONNECTING_CHANNELS.md](CONNECTING_CHANNELS.md).** It is the
walk-through: the exact endpoint, the exact secret name, and the exact person outside this
repository who has to act first, in the order the work should be done.

The locked decisions live in [DECISIONS.md](DECISIONS.md), each with the test that keeps it honest.
The inbound design is in [INBOUND_ARCHITECTURE.md](INBOUND_ARCHITECTURE.md) and is **awaiting
approval - nothing is connected**. The questions for each provider are in
[PROVIDER_QUESTIONS.md](PROVIDER_QUESTIONS.md).

---

## From the meeting of 23.09.2026

| # | What | Status | Notes |
|---|---|---|---|
| 1 | Three owner roles: Admissions / Student Coordinator / Other | DECIDED, BUILT | Admissions is the default owner. The role reads **Admissions** on every screen. |
| 2 | Who holds each role | **SUPERSEDED by 16** | The 23.09 evening decision locks a user list, so the roles and the people are now two separate things in the config and on the screen. |
| 3 | Telephony provider is TeleGroup | SAID | Recorded on the phone channel in `config/providers.json`. |
| 4 | A call gives us the caller ID | SAID | Not verified with TeleGroup. |
| 5 | A call gives us the menu choice the caller presses (1-3) | SAID | Not verified with TeleGroup. |
| 6 | After the call, TeleGroup sends a notification to the app | **OPEN - external question** | Nobody has asked TeleGroup: *does the phone system provide a post-call notification, and what does it contain?* Until that is answered the phone stays **manual in V1** and the prototype does not claim automatic phone integration. |
| 7 | Email: a human reads it, the valuable part is pushed in by a browser EXTENSION | SAID (idea) | Recorded on the gmail channel as `alternativeApproach`. Not designed, not built, not costed. |
| 8 | Cost limits table | DELIVERED | `C:\Users\ritvarsv\Desktop\WF\Local Repo\Projects\College CRM\College_CRM_Cost_Limits.xlsx` (moved off the Desktop 25.09.2026), 12 rows, exactly as supplied. |
| 9 | **Edit a person.** | **DECIDED 23.09.2026, BUILT** | Editable: name, email, phone, programme, study form, education, owner, notes. **Locked: source channel, source campaign, source detail, first-contact date** - historical facts, not current state. A locked field is refused **by name and with a reason**, and a refused edit writes nothing at all, not even the legal half of it. Policy lives in `config/prototype.json` → `editPolicy` and in `src/history.js`. |
| 10 | **Manual tracking goes in the same log.** | BUILT | One table, one screen. Every entry carries `origin`: `manual` or `automatic`. Adding somebody by hand, logging a call, marking open-day attendance, changing a status by hand, editing - all `manual`. Integration inbound and outbound, and the automatic stage move - all `automatic`. `logEvent()` **throws** if a write does not say which, so it cannot be forgotten in one place and remembered in twenty. |
| 11 | **Edits go in the same log.** | BUILT | One entry per field that really changed: field, old value, new value, who, when. Two fields changed at once are two entries, not one lump. Setting a field to the value it already has writes nothing. |
| 12 | **The whole history log is for admins only.** | **DECIDED 23.09.2026, BUILT as far as it can be** | **The admins are Aigars, Ritvars and Marina.** Nobody in the admissions trio is an admin. **This is not security and the screen says so:** the prototype has no login, so "who you are" is a dropdown in the sidebar, not a check. Real enforcement waits for authentication. |
| 13 | **The interface is English only.** | DECIDED 23.09.2026, BUILT | The Latvian/English switch and the 274-pair dictionary are gone. They are archived, not deleted: `_archive/latvian-language-package/` holds `i18n.json` and a `.lv` copy of every file that was translated. |
| 14 | **An ordinary user sees the history of their own actions. An admin sees the full picture.** | **DECIDED 23.09.2026, BUILT** | Not a refusal any more: a non-admin gets a screen headed **My history** listing only what was done under their name, with no "By" column because every line is theirs. An admin gets the whole log, both origins, every person. Caveat printed on the screen: **a role is not yet a person** - "Admissions" is shared, so it shows everything done under that role. Per-person history needs a login. |
| 15 | **What the CRM writes to an applicant is in English.** | DECIDED 23.09.2026 | The outbound drafts are English. They are still prototype wording, not approved copy - what is actually sent, and when, is a separate decision. |
| 16 | **The CRM users are Ieva, Laura, Tetiana and Maris Cirulis. A role is not a person.** | **DECIDED 23.09.2026, BUILT** | The sidebar picker lists PEOPLE. The owner field lists ROLES and says so on the label. Tetiana is Head of Marketing, so Marketing joins the owner roles. No email addresses, no authentication: identity is still a setting. |
| 17 | **A normal user sees their own actions and their own corrections, never a colleague's corrections.** | **DECIDED 23.09.2026, BUILT** | The person's activity (calls, notes, messages, visits, status) stays visible to everybody who may open the record - otherwise two people ring the same applicant. An internal correction is private to whoever made it. The page counts what it is hiding instead of pretending nothing happened. Verified: Laura sees the notice and not the field change; Ieva and Marina see it. |
| 18 | **One person record from lead to admitted, then handed to SIS.** | **DECIDED 23.09.2026, BUILT** | Conversion stays measurable on the same row. A test walks a person through every stage and asserts one row, an unchanged source and an unchanged first-contact date. The CRM does not become the SIS. |
| 19 | **Ownership follows the current stage, not a permanent assignment.** | **PRINCIPLE LOCKED, map NOT decided** | `ownershipFollowsStage` is `false` and says why. The stage list and the stage-to-owner map are the first blocking decision. |
| 20 | **Notes carry a type and stay in the same history.** | **DECIDED 23.09.2026, BUILT** | Call note, On-site visit note, Admissions note, Stage note, Other note. A test asserts no separate notes table can exist. |
| 21 | **A person is never closed without a reason, and "Other" needs an explanation.** | **DECIDED 23.09.2026, BUILT** | Ten reasons, provisional until Admissions validates them. Two new columns hold the reason and the note. |
| 22 | **Duplicates are blocked, not warned about.** | **DECIDED 23.09.2026, BUILT** | A match returns 409 with the existing record and an Open button. Getting past it takes an explicit "this is a different person". One matcher serves both the live warning and the save, so they cannot disagree. **Merging two records is still missing.** |
| 23 | **Search reaches whatever the operator remembers.** | **DECIDED 23.09.2026, BUILT** | Name, email, phone, programme, study form, education, source, campaign, id, student number, notes - and the channel's plain name, so "instagram" works. |
| 24 | **Today is grouped, the order is the user's, and nothing is ever hidden.** | **DECIDED 23.09.2026, BUILT** | New leads / Follow-ups / Replies / Other attention. Each shows done/total; an empty group says "clear" rather than disappearing. The order is remembered per browser. |
| 25 | **Three core metrics, and the conversion caveat is stated out loud.** | **DECIDED 23.09.2026, BUILT** | New leads this month, admissions this month, conversion %. The screen says that admissions-this-month and conversion-this-month count different populations. The wider reporting dimensions are recorded as things to investigate, and **nationality is not in the schema at all**. |
| 26 | **The operator never sees API machinery.** | **DECIDED 23.09.2026, BUILT** | A test scans the daily screens for webhook / oauth / Pub/Sub / endpoint / API key and fails if any reaches a screen Ieva uses. |
| 27 | **Inbound information architecture.** | **DESIGNED 23.09.2026, AWAITING APPROVAL. NOTHING CONNECTED.** | A machine may sort, only a person may discard. Model B (intake queue) is the spine, Model A labels and ranks inside it, Model C is the fallback where App Review fails. See [INBOUND_ARCHITECTURE.md](INBOUND_ARCHITECTURE.md). |
| 28 | **Person page split into sections.** | DECIDED as a principle, **deliberately not built** | The visual hierarchy belongs to the next visual review, so the page was left alone rather than redesigned twice. |
| 29 | **Inbound -> Warm -> Hot. Marketing qualifies before Admissions sees anything.** | **DECIDED 23.09.2026 (Aigars), DESIGNED, not built** | Tetiana already works IG / WhatsApp / Facebook / LinkedIn, so broad inbound is hers. "Hi" is a raw contact, not a lead. Recorded in `config.qualification` as a **separate field**, never merged into the stage list. |
| 30 | **Warm-to-Hot threshold.** | **NOT DECIDED, and defended as not decided** | `warmToHotThreshold` is `null`; a test fails if anybody fills it in. Three candidate definitions are written up, none chosen. |
| 31 | **Notification model: raw notifies nobody, hot notifies Admissions.** | **DECIDED 23.09.2026, in config, not built** | Thirty "Hi" messages produce zero notifications for Ieva and thirty rows for Marketing. A raw contact is visible and searchable; being un-notified is not the same as being invisible. |
| 32 | **The machine proposes, never asserts.** | **DECIDED 23.09.2026, in config, not built** | Every field carries provenance. An `extracted` value is a suggestion, shown differently, and excluded from every count and report until a human confirms it. Missing information is displayed, never a reason to block creation. |
| 33 | **No conversation bodies in V1.** | **DECIDED 23.09.2026** | Identity, source, timestamp, thread key, qualification, extracted fields, notes, who processed it, next action, owner, audit. **The cost is recorded:** an extraction error becomes uncheckable, and the earlier claim that the queue "preserves full message context" is withdrawn in the architecture document rather than left standing. |
| 34 | **Browser extension demoted.** | **DECIDED 23.09.2026** | Not a V1 component. Marketing works on a phone. Fallback only if a provider approval is refused outright. |
| 35 | **LinkedIn is a real channel with zero research.** | **UNKNOWN, recorded as unknown** | Kept OUT of the researched provider config on purpose, with a test enforcing it, so it cannot look investigated. Questions written. |
| 36 | **PBX incoming-call logger.** | **BUILT 23.09.2026, NOT DEPLOYED, NOTHING CONNECTED** | Vercel Cron every 5 min asks the tg.lv PBX for the last 15 min, keeps incoming calls on the three college queues, upserts on `uniqueid`. Europe/Riga handled explicitly with no hardcoded offset and both DST transitions tested. The token lives only in `process.env.PBX_API_TOKEN`, is never logged, and is never logged. `sql/001` is written and NOT applied. See [PBX_CALL_LOGGER.md](PBX_CALL_LOGGER.md). |
| 37 | **Vercel plan for the 5-minute cron.** | **UNCHECKED, blocking** | A 5-minute cron needs Pro. On Hobby it silently becomes daily and a 15-minute window would then miss almost every call. Nobody has confirmed which plan the Academy CRM project is on. |
| 38 | **Call-record retention.** | **NOT DECIDED** | The table holds caller numbers. No purge job exists, because how long a call may be kept is a privacy decision and a default would be an invented policy. |

## Prototype state

| What | Status | Notes |
|---|---|---|
| Interface in English, no language switch | BUILT | `config/i18n.json` removed, `/api/i18n` removed, the runtime translator removed. Verified screen by screen in the browser. |
| Table starts empty, channel demo writes the first person in | BUILT | Verified end to end after the history work: 0 people / 0 history → demo → 7 people / 35 entries → clear → 0 / 0 → demo again → 7 / 35. |
| Edit a person, from the person's own record | BUILT | "Edit record" on the person page. The locked fields and the reason they are locked are printed inside the form, so the rule is visible on screen and not only in the server. |
| One history screen | BUILT | Sidebar → History. Person events and integration events are merged and sorted as one list. An admin gets the whole thing with Everything / Manual only / Automatic only filters; anybody else gets **My history** - their own actions, no filters, no "By" column. |
| "Acting as" picker in the sidebar | BUILT | Three roles and three admins, labelled **NO LOGIN**. Everything written carries that name as the actor. It is a demonstration of who would see what, not a permission system. |
| Next step is mandatory, chosen from a dropdown | BUILT | The server refuses to close an action without one. |
| Status follows the events automatically | BUILT | Forwards only, never past "Not proceeding", and the move is written to the history as `automatic`. |
| Open days sit inside Channels | BUILT | It is a channel, not a separate screen. |
| Real people from the admissions sheet | BUILT | 470 loadable on demand; the file is git-ignored and never leaves this machine. |
| Identity is a person, ownership is a role | BUILT | The sidebar picks Ieva / Laura / Tetiana / Maris Cirulis / the three admins. Records are owned by Admissions / Student Coordinator / Marketing / Other. |
| Typed notes | BUILT | Five types, one history. |
| Closing needs a reason | BUILT | Ten reasons; "Other" needs an explanation; both refused server-side. |
| Duplicates blocked | BUILT | 409 with the existing record and an Open button, and an explicit override. |
| Today grouped and re-orderable | BUILT | Four groups, done/total on each, order remembered, nothing hidden. |
| Three core metrics | BUILT | On Today, with the population caveat printed under them. |
| Tests | 182 PASSING | `node --test test/*.test.js`. Includes 33 for the intake flow and 35 for the PBX logger, none of which need a network or a real token. |
| The undecided things are defended by tests | BUILT | Sabotaging the config (inventing a threshold, notifying Admissions on raw, turning on body storage) was tried and **4 tests failed**, so these are real guards rather than decoration. |

## What is deliberately still in Latvian, and why

The **interface** is English everywhere. Three things are not, on purpose:

1. **Simulated inbound payloads.** The Google Form field is really called `Vārds uzvārds`; the
   applicant's WhatsApp message really is in Latvian. Translating them would misrepresent what the
   integration actually receives, and the field mapping panel exists to show exactly that.
2. **Latvian names** in the synthetic data. The applicants are Latvian.
3. **`Piemēri Profesiju`** in `config/providers.json` - the real name of a real event.

The **outbound** message drafts are English - decided 23.09.2026. They are still prototype wording,
not approved copy: what the CRM actually says to an applicant, and at which step, has not been
written by anybody who owns that text.

The research prose on the Integrations / Metrics / Privacy screens stays English because it quotes
provider documentation.

---

## From Aigars's first real test, 24.09.2026

He ran the prototype and wrote a braindump (`Crm braindump.docx`, six screenshots). This is what he
said, what was decided, and what was built the same day. Ritvars confirmed each decision before it
was built.

| # | What | Status | Notes |
|---|---|---|---|
| 40 | **CAR: clicking "open" threw an error.** | **BUG, FIXED** | Reproduced: the page said `Failed to load: not found`. The cause was not the link. The database lived in memory, so every restart emptied it while the open browser tab carried on showing rows that no longer existed. Two fixes: the database is now a **file** (`data/crm.db`, gitignored), and a missing record now says *"Not here any more"* with why, instead of the word "failed". |
| 41 | **People: the four filters did nothing at all.** | **BUG, FIXED** | Aigars drew a question mark over each one. They were unlabelled - and also had no change handler, so none of them had ever filtered anything. They now carry the name of what they filter (Search, Stage, Programme, Owner, Came from, Next step) and all of them work. |
| 42 | **Today: a table, not one card at a time.** | **DECIDED 24.09.2026, BUILT** | "Šeit vajadzētu tabulas view lai ir overview." The table is the default. The one-at-a-time card view is kept behind a **Table / One at a time** switch, because it is the better shape on a phone. This reverses the 23.09 instruction that Today must show one person at a time; both owners have now said table. The choice is remembered per browser. |
| 43 | **CAR: two tabs too many.** | **DECIDED 24.09.2026, BUILT** | The **Junk** tab is gone. Machine-filtered sales pitches and items a person marked *Not relevant* are now one list, hidden by default behind **Show not relevant**. Underneath they stay two states (`filtered` and `archived`) because the funnel counts real contacts and a sales pitch was never one. |
| 44 | **CAR: an operator could not say what somebody wanted.** | **BUG, FIXED - this was the real complaint** | Aigars wrote a note saying the person wanted the engineer programme, pressed Save, and the person landed in *Done* marked "Not clear yet". The dialog only offered tick boxes for what the **machine** had extracted, and a message saying "hello" gives the machine nothing to extract. So there was no way to record what he already knew, the item could only be filed as unclear, and the person came to rest with nobody owning them. The dialog now asks **"What do they want to study?"** with the programme list, pre-filled from the message when the machine did read one. Saying a programme makes it a lead, routes it to Admissions and puts the person on the pipeline. The value is stored with provenance `operator` - a person said it, not a machine. Stating an interest and filing it as unclear is now **refused**, not quietly accepted. |
| 45 | **A qualified lead must reach a pipeline.** | **DECIDED 24.09.2026, BUILT** | New **Pipeline** screen: a horizontal board, one column per configured stage, counts per column, people as compact cards showing programme, education, channel, owner and next step. Cards are **dragged between columns and that is a real stage change**: it saves the same way the person page does, so it lands in the history with who moved it, from which stage to which. Dropping somebody into *Not proceeding* still asks for a reason first and changes nothing until it is given. |
| 46 | **The pipeline stage names are not agreed.** | **OPEN - for Ieva** | The board reads `config/prototype.json` → `stages` and there is no stage list in the code. Renaming, reordering, adding or removing a column is a config edit. The screen says on it that the columns are provisional. **This is the first thing to walk through with Ieva.** **28.09.2026:** carried into **D-C1** (the real Journey stages) in [DECISIONS.md](DECISIONS.md). Still open, for Ieva. |
| 47 | **People: edit without opening the profile.** | **DECIDED 24.09.2026, BUILT** | Every row has an **Edit** button that opens the eight editable fields plus a note box inline, under the row. It saves through the same route the person page uses, so the same field policy applies and the same history entries are written. |
| 48 | **The Documents card is removed.** | **DECIDED 24.09.2026, BUILT** | Aigars crossed it out: documents are collected in the admissions portal, not here. A half-mirrored checklist only invites somebody to trust the wrong copy. |
| 49 | **In-app feedback, like the one in Suggest.** | **DECIDED 24.09.2026, BUILT** | A floating **HELP** pill on every screen opens *Send feedback*: an idea or something broken, a message, and an optional screenshot that can be **pasted with Ctrl+V** straight after a Win+Shift+S capture. It records the screen it was sent from. Admins get a **Feedback** inbox with the screenshot inline, a link back to the screen, and *Mark handled*. Built from Aigars's own brief (`feedback-widget-brief.md`). |
| 50 | **The pipeline after "To look at" needs Ieva's real process.** | **OPEN - for Ieva** | Aigars: "šeit ir jāparunā ar Ievu, kāds šobrīd reali ir tas process". He named *contacted once*, *waiting for reply* as examples. Nothing has been invented: the board uses the stages that were already configured. **28.09.2026:** Concept C has no "To look at": a message is a New Lead, a promise is a Next Step. The question is now **D-C1** (the real Journey stages) in [DECISIONS.md](DECISIONS.md). Still open, for Ieva. |
| 51 | **Follow-up outcomes and next steps need Ieva.** | **OPEN - for Ieva** | Aigars had nothing to add himself and asked for Ieva to go through the lists and comment. **28.09.2026:** now **D-C3** (the next-step list, item by item) and **D-C4** (the outcomes and their reasons) in [DECISIONS.md](DECISIONS.md). Still open. |
| 52 | **Does every message reach the CRM, or does a human filter first?** | **OPEN - Aigars's question** | Today: obvious sales pitches are dropped on arrival by a word filter and everything else reaches *To look at*, where a person decides. That is the design, but Aigars did not find it obvious from the screens, which is itself worth fixing. |

| 53 | **Renamed to Novikontas Academy CRM, with the official logo.** | **DECIDED 24.09.2026, BUILT** | The header carries the **authorised logo file**, not a redrawn one, and there are two of them: `NoAca_logo_darkhor.svg` on the light shell and `NoAca_logo_whitehor.svg` on the dark one. Neither is recoloured by hand, which the brandbook forbids. Under it, one line only: `CRM - V1 virtual prototype`. The **"V1 DEMO DATA - 12 people" badge is gone from the header** and now sits in DEV CONTROL, next to the buttons that change the dataset. |
| 54 | **The logo is the way Home.** | **DECIDED 24.09.2026, BUILT** | Clicking it goes to Today from anywhere. |
| 55 | **The pipeline fills the page.** | **BUG, FIXED** | The board ran off the right-hand edge behind a scrollbar and the last column was clipped. The cause was the page itself stretching: `main` is a grid item, and a grid item defaults to `min-width:auto`, so wide content widens the column instead of scrolling inside it. With `min-width:0` the board's own scrolling works, and the stage columns now share the width so all seven are on screen at once. |
| 56 | **Dark mode: the dropdown lists were unreadable.** | **BUG, FIXED** | The list a `<select>` drops open is drawn by the browser, not by the stylesheet, so it stayed white while the options inherited light text - "Light" was white on white. `color-scheme` now tells the browser which theme it is drawing, and the options carry an opaque `--menu` colour. It had to be a new token: `--surface` is a 5.5% translucent overlay in this dark theme, and a browser-drawn menu has nothing of ours behind it. |

| 57 | **Black logo on the light theme.** | **OWNER OVERRIDE 24.09.2026, BUILT** | The dark theme uses the authorised `NoAca_logo_whitehor.svg` unchanged. The light theme does **not** use an authorised file: `src/assets/NoAca_logo_blackhor.svg` is the official `NoAca_logo_darkhor.svg` with its fill changed from Novikontas navy `#022367` to Pitch Black `#011111`. Exactly one line differs and the geometry is untouched, which was verified by diffing the two files. **The Novikontas brandbook lists recolouring among its nine don'ts and no official black variant exists anywhere on this machine.** Ritvars was told that and decided to use black anyway for this prototype. The file carries the same warning in its own header. If an official black asset ever appears, replace this file and delete it. |

| 58 | **The file database was still being wiped on every restart.** | **BUG, FIXED - my own regression** | Row 40 made the database a file so a restart would stop emptying it under a tester. It did not work, and I reported that it did. `src/server.js` ran `loadDataset(...)` at boot, and `loadDataset` clears every table first. That cost nothing while the database was in memory - a new process was empty anyway - but against a file it destroyed everything on every start. Only `feedback` survived, because `clearAll()` does not touch it, and that is what made it look like persistence was working. Boot now leaves an existing database alone and only applies the configured starting dataset to a new, empty one; `DATASET=...` still forces a load, which is what the tests use. **Proved by seeding a row, restarting, and reading it back.** |
| 59 | **One admin seat in the demo.** | **DECIDED 24.09.2026, BUILT** | The picker listed Aigars, Ritvars and Marina. It now offers one **Admin**. There are still three real admins and `config/prototype.json` → `_admins` names them; two tests assert that the note keeps naming all three, so the fact cannot be dropped quietly. The reason is honesty: without a login, three named admins in a dropdown was fiction - anybody could pick any of them. One seat says what is true, which is that admin is a level of access and not yet a person. |
| 60 | **Follow-ups and Replies merged into "Waiting on us".** | **DECIDED 24.09.2026, BUILT** | They were two tabs answering the same question, *who needs me today?*, and they differed only by **who started it**: Follow-ups were open tasks due or late (we planned them), Replies were people whose last event is inbound with nothing sent back (they wrote). Worse, somebody with both appeared **twice**. Now one queue, de-duplicated by person, oldest first. Each row carries a small marker - `we planned this`, `they wrote`, or `they also wrote` - and keeps its own action, because a planned step is marked done and a message is answered. Today is three tabs, not four. |

| 61 | **A person's timeline was a raw data dump.** | **BUG, FIXED** | A website application read `submission_id: web-so1np9hp submitted_at: 2026-09-24T10:12:51.730Z name: ... utm_source: instagram utm_medium: paid ...`, and its heading was in Latvian. Ieva reads this between phone calls. It now says: *Wants to study NAV, full time. Reach them on +371 26 411 900 or the email. Agreed to be contacted about applying and about news and offers. Found us through a paid Instagram ad (campaign nav-2026-09).* **The full payload is not lost** - it is kept in `sim_events` and shown on the Channels and Inspector screens, where somebody is deliberately looking at the plumbing. Same treatment for the Google form and the Mailchimp events. |
| 62 | **The timeline named the wrong channel.** | **BUG, FIXED** | A website form carrying `utm_source=instagram` was listed as an **Instagram** message, because the event took its channel from the traffic source. It now shows the channel the message ARRIVED on; where the traffic came from is a separate fact and is in the sentence and on the person record. That exposed three simulator channels with no plain name - `website_form`, `gmail`, `open_day` - which are now aliases of Website, Email and Open Day. A test fails if any simulator channel has no plain name, and I proved it fails by deleting one. |
| 63 | **Latvian on English-only screens.** | **BUG, FIXED** | Three headings were Latvian (`Pieteikuma forma`, `QR pieteikums`, `Google formas pieteikums`), and a website fixture wrote the study form as `Pilna laika` into a person record whose configured vocabulary is Full time / Part time. All English now. **What deliberately stays Latvian:** the raw Google Form field names, the raw notification email, and profession names like *Kuģu kapteinis*. Those are what genuinely arrives from Latvian systems and from real people; changing them would be inventing data. A real sender's email subject also keeps their own words - only our own system-generated notification says it in English. |
| 64 | **Today showed everybody's work under one person's name.** | **BUG, FIXED** | The sidebar said *waiting for you 4* and Today said *Waiting on us 6*, which is what Ritvars spotted. They were measuring different things: the sidebar is filtered to your role, Today was not filtered at all. Today now shows the acting person's role by default, with a **role / Everyone** switch beside the Table switch. |
| 65 | **The sidebar folded two different numbers into one.** | **BUG, FIXED** | *waiting for you* was live-leads-you-own plus overdue steps. The lead part only ever grows, so the number never emptied and never matched Today. It is now two lines: **needs you today** (messages to look at and late next steps - the same things Today asks for) and **leads you own** (how many people are in your pipeline, which is not a to-do). |
| 66 | **Feedback is for Aigars and Ritvars only.** | **DECIDED 24.09.2026, BUILT** | Not derived from the admin list: **Marina is an admin and must not see the feedback inbox.** `config/prototype.json` → `feedbackReaders` is its own list, every feedback route checks it, and the screen hides the inbox from anybody else. Proved by sabotage twice: adding Marina to the readers turns 3 tests red, and putting the routes back on `isAdmin` turns 4 red. Note the honest limit: with no login this checks the **name that is selected**, not who selected it. |
| 67 | **Being told when feedback arrives.** | **BUILT 24.09.2026, in-app only** | **This app has no email mechanism of any kind** - nothing here can send mail, and nothing is deployed to send it from. So the notification is in the app: a count beside the Feedback link, visible only to the two readers, that clears as items are handled. **An external channel is still an open decision** - see the question below. |

| 68 | **The person page crashed for everybody CAR produced.** | **BUG, FIXED** | `fieldChip` was called on the person page and defined nowhere. It broke **4 of 12** demo people - exactly those qualified through CAR with a confirmed field - and therefore **4 of the 5 open links in CAR Done**. Present since the V1 commit `afea424`. My earlier "open is fixed" report was half right: the stale-database cause was real and fixed, this second cause was never found. Now 0 of 12 crash. A test walks the person page and fails if it calls anything undefined; proved by deleting `fieldChip` again. |
| 69 | **Qualifying from CAR created duplicates in silence.** | **BUG, FIXED** | `config.duplicateRule.blockOnMatch` has been `true` since 23.09 and was applied on the manual Add person screen ONLY. `qualify()` never asked. That is how two Emīls Baltputnis records with the same phone got in. The matcher now lives in `src/identity.js` and every path uses it. Qualifying a known contact is refused and the screen **names who it already has**, offering three ways out: *This is them*, *Open*, or *No, this is a different person*. Phone matching normalises `+37120423829`, `37120423829` and `20423829` to one person. |
| 70 | **Qualifying created leads with nobody scheduled to act.** | **BUG, FIXED** | `config.nextActionRequired` has been `true` since 23.09 and was enforced when COMPLETING a task, never when creating a lead. Three demo leads sat on the pipeline with zero tasks. The dialog now asks **What happens next?** and the save is refused without it. The due date comes from the configured action's `days`, never from a number in the code. A later message about somebody who already has a step does not stack a second one. **People with no next step: 3 before, 0 now.** |
| 71 | **The demo walk-through reported work it had not done.** | **BUG, FIXED** | Found while fixing 70. The script pushed whatever `qualify()` returned into an array and reported its length as a success count. When the new gates started refusing every step it still announced `qualified: 5` with **nothing qualified** and quietly lost five people. It now reads the return value and fails loudly. A test asserts the number reported equals the number that happened. |
| 72 | **One inbound contract, and an adapter for all thirteen channels.** | **BUILT 24.09.2026** | `src/inbound.js` defines the normalised event; `src/adapters.js` maps every provider shape into it; `config/channels.json` is the register. The path is always `provider event -> adapter -> normalised event -> filter -> CAR -> human -> person`, with **no shortcut into CAR anywhere**, so what is tested locally is the path a real provider will take. The provider payload is kept raw and never becomes the CRM's data model. |
| 73 | **A generic inbound endpoint with real security interfaces.** | **BUILT 24.09.2026** | `POST /api/inbound/<channel>`. Meta signatures are verified with a real HMAC over the raw bytes; shared secrets are compared in constant time; Mailchimp's URL secret **says in its own result that it is the weak option**, because Mailchimp does not sign. A missing secret is an honest failure, never a silent pass. LinkedIn and TikTok report `unconfirmed` rather than pretending. Idempotency is by `(channel, external id)`: a provider retry is stored once. An event with no id to deduplicate on is refused rather than guessed at. |
| 74 | **Connections screen and inbound diagnostics.** | **BUILT 24.09.2026** | **Connections** shows every channel with its status, mechanism, event count, whether credentials are present, whether a webhook is verified, and what it is blocked on. **No secret value ever reaches the screen** - only present or absent, and a test asserts the value cannot leak. **What arrived** shows where each inbound event ended up and every delivery attempt including refused ones. Today: 3 ready for configuration, 9 waiting on somebody outside, 13 with an adapter, **0 connected**. |
| 75 | **Every channel can be simulated through the real path.** | **BUILT 24.09.2026** | Provider-shaped fixtures in `src/fixtures.js`, used by **both** the simulator and the test suite so what is demonstrated cannot drift from what is verified. All 13 simulate end to end over HTTP and every one terminates in a valid state. |
| 76 | **Channel readiness documentation.** | **BUILT 24.09.2026** | [CHANNEL_READINESS.md](CHANNEL_READINESS.md), generated from the config by `scripts/gen_readiness.py` so the document cannot drift from the register. Per channel: what we control, what the provider controls, credentials, who outside must act, how we test, how we go live, how we turn it off. Unknowns are marked **EXTERNAL CONFIRMATION REQUIRED**, never guessed. |

| 77 | **The navigation is the product now.** | **DECIDED 24.09.2026, BUILT** | Six items and nothing technical: **Today, Inbox, Admissions, Follow-ups, People, Reports**. CAR is gone as a word - it is the **Inbox**. Pipeline is gone - it is **Admissions**. Channels, Connections, What arrived, History and Privacy left the main product entirely. Old links still resolve (`#/car`, `#/pipeline`) so a bookmark or a link in a feedback report does not break. |
| 78 | **The Console is our control room; the CRM is their product.** | **DECIDED 24.09.2026, BUILT** | There is no demo mode inside the CRM any more: no simulator buttons, no demo banners, no dataset switch. All of it moved to `#/console`, which carries Send an event, Demo data, Connections, What arrived, Channel research, Full history and Privacy. **A Console event travels the real path** - payload, adapter, filter, Inbox - so what it demonstrates is the product and not a picture of it. Verified: a Messenger documents-question landed in the Inbox, a pitch was filtered, and an existing-person scenario matched a real imported person by phone. |
| 79 | **Messenger is its own channel; Meta is one connection.** | **DECIDED 24.09.2026, BUILT** | Facebook, Instagram, Messenger and WhatsApp share ONE Meta Business Suite connection. That is an integration detail. Each stays a **separate source** in the CRM for reporting, filtering and history, and a test fails if a combined "Meta" figure ever appears - it would hide where people actually came from. 14 channels now. |
| 80 | **Klātiene is In person.** | **BUILT 24.09.2026** | The channel id is `in_person` and the label is *In person*. The old id survives only as an alias so the 19 imported people who arrived that way still read correctly, and a test fails if any Latvian reaches a channel name on screen. |
| 81 | **Admissions ownership is always Ieva.** | **LOCKED 24.09.2026** | A confirmed Admissions case is owned by **Admissions**, and Ieva holds that role, whatever channel it arrived on. A test walks **all 14 channels** and asserts it. Channel access is a separate question: Tetiana is the only person who can open LinkedIn, and a LinkedIn lead is still Ieva's case. Arina has no social access at all and is phone button 3 backup only. |
| 82 | **Reports is a KPI meeting tool.** | **BUILT 24.09.2026** | Pick a period (this month, last month, this year, everything, or any two dates). Eight headline figures, a twelve-month trend of arrivals against admissions, per-programme leads and admissions, and breakdowns by source, programme, study form, education and stage, plus why people did not proceed. CSV download. **Every number is a count of rows**, and conversion names its population out loud because admitted-this-month counts a different one. |
| 83 | **What Reports cannot measure is listed, not left blank.** | **BUILT 24.09.2026** | Nationality (no field anywhere, and the export has none), HE applications (nothing marks one), maritime school graduates (partial - derived from an education field that is mostly empty), admission duration (partial - only exists for admitted people). Each says why and what would fix it. A blank column reads as zero; a named gap does not. |
| 84 | **The real database runs the whole product.** | **BUILT 24.09.2026** | `data/real_people.json` holds the full ADMISSIONS DATABASE export - **470 people**, git-ignored, never leaves the machine. The default selection is 116: the 91 open leads first contacted in 2026 plus the 25 most recently admitted. Verified working through People, Inbox, Admissions, Follow-ups and Reports. **Reports on real data:** 116 leads, 29 applications, 25 admitted, 21.6% conversion, 43-day median to admission, and the real programme split. |
| 85 | **The real data exposes a real problem, and the CRM shows it.** | **FINDING 24.09.2026** | **57 of the 91 active people carry no next step at all.** That is not a defect in the CRM; it is what the current spreadsheet actually contains. It is exactly the thing this product exists to prevent, and Reports puts it on the front page as a number that should be zero. Worth showing Ieva. |

| 86 | **The Console is a different address, not a hidden tab.** | **DECIDED 24.09.2026, BUILT** | The CRM is `http://127.0.0.1:8800/` and the Console is `http://127.0.0.1:8800/console`. Separate page, separate stylesheet, deliberately dark so the two can never be mistaken for one another. **The CRM carries no link and no route to it** and a test asserts both, along with the absence of demo wording. The technical screens - channel research, the event inspector, raw intake, privacy notes - are no longer routed from the product at all. |
| 87 | **Two databases, and the real one is always restorable.** | **BUILT 24.09.2026** | A clean snapshot is written **from the source file at the moment the real database is loaded**, never rebuilt afterwards from a database somebody has been testing in. Restoring wipes every table and replays it row for row, then **checksums the result and reports whether it matched**. Verified live: 116 people, switch to demo, send events, restore, `verified: true`, 116 people again. Feedback is deliberately outside the snapshot, so bug reports survive a restore. |
| 88 | **Destroying data takes a deliberate act.** | **BUILT 24.09.2026** | Switching to demo, restoring real data and emptying all return **HTTP 428** without an explicit confirmation, so a typo in a fetch cannot replace the database. The Console shows the current state in red for REAL and green for DEMO, with the people count and the snapshot age, and asks again in a dialog before acting. |
| 89 | **A calm demo environment, built the real way.** | **BUILT 24.09.2026** | 12 people, one per channel, spread across New, Contacted, Application, Contract and Admitted; 6 items waiting in the Inbox including a known person writing again and an unknown phone caller; 2 sales pitches filtered; 2 marked not relevant with a recorded reason; 1 overdue follow-up. **Every demo person arrived through the Inbox** - a test asserts there are no direct inserts - and nobody is left without a next step. |
| 90 | **A snapshot path that a test could not redirect.** | **BUG, FIXED - caught by its own test** | `SNAPSHOT_FILE` was a module constant, resolved at import. A test that set `CRM_SNAPSHOT` could not move it, so the first run of the snapshot test **wrote 25 fake people straight over the real snapshot** - precisely the accident the file exists to prevent. The path is resolved at call time now, and the test asserts it is writing somewhere harmless before it writes anything. |
| 91 | **Desktop QA.** | **DONE 24.09.2026** | All six screens measured at 1440x900: no page overflow, no main overflow, sidebar at its full 238px, desktop layout active on every one. The Follow-ups heading was saying "Follow-up list" while its tab said "Follow-ups"; they match now. |
| 92 | **A Meta message carries a name only when Meta sends one.** | **FIXED 24.09.2026** | The demo showed `@darja.s` as somebody's name. The adapter now reads `sender.name` when the payload has it and **still never invents one**, because a real Instagram DM often carries only a handle until the person says who they are. Separately, the Mailchimp fixture's own hardcoded name was overriding the person's, which put two different demo people into the CRM as "Marta Liepa". |

| 93 | **"Cannot measure" was mostly wrong. Three of the four were just missing a box.** | **CORRECTED 24.09.2026** | Ritvars asked whether nationality would not simply be collected by hand, and he was right. The report was presenting a **data-entry gap as a limit of the software**, which is a different job needing different work. Rewritten into three honest kinds: *needs typing in*, *needs a decision*, and *by definition*. Only **HE applications** genuinely needs a decision - nothing anywhere says what separates one, and no amount of typing fixes that. |
| 94 | **Nationality is a real field now.** | **BUILT 24.09.2026** | It was never unmeasurable; there was simply nowhere to type it. It is on the person record, editable on the person page and in the People quick edit, a People filter, searchable, and its own Reports breakdown. **Never derived** - not from a name, not from a phone prefix - and a test asserts it starts empty and only changes when somebody types it, with the change in the history. |
| 95 | **Maritime school graduates is a real number, not a gap.** | **CORRECTED 24.09.2026** | Education has been filled in by hand for years: **179 of 470 real records have it**, including 41 maritime. The count works today. What is thin is the coverage, so the report shows the number **and** how complete it is, instead of withholding it. `config.maritimeEducations` names which values count (Maritime school, LJA, LJK) and says Ieva confirms the list. |
| 96 | **The export sheet spoke two languages.** | **FIXED 24.09.2026** | The same school was typed as *Vidusskola* and *Secondary* over several years, and as *Jūrskola* and *Maritime school*. They are mapped on import, so a report can count them, and **the source export is never edited**. |
| 97 | **The download is a choice, not a dump.** | **BUILT 24.09.2026** | Ritvars: "the CSV has to be able to filtrate what exactly the person wants". **Export CSV** opens nine plain checkboxes - Summary, Monthly trend, Programme breakdown, Study form, Source / channel, Stage, Education, Lost reasons, People list - with the first three on. The chosen period travels with the file. A test proves what was not ticked does not appear, and that no label grows past a checkbox. My first version had eleven items with a sentence of explanation under each; Ritvars called it overengineered and he was right. |
| 98 | **A file database never gained a new column.** | **BUG, FIXED** | `CREATE TABLE IF NOT EXISTS` creates nothing for a table that already exists, so adding `nationality` left every existing `data/crm.db` on the old shape and Reports died with *no such column*. There is a small migration on open now that adds missing columns without touching the rows. Found by opening the demo database straight after adding the field. |
| 99 | **The Meta sentence left the Reports page.** | **DONE 24.09.2026** | "Facebook, Instagram, Messenger and WhatsApp share one connection but are never added together" explained our plumbing on a page about their numbers. The rule still holds and is still tested; it is simply not something Ieva needs to read. |

| 100 | **A how-to for connecting the channels.** | **WRITTEN 24.09.2026** | [CONNECTING_CHANNELS.md](CONNECTING_CHANNELS.md). Not a generic checklist: every endpoint, secret name and channel mode in it was checked against `config/channels.json`, so it cannot describe something that does not exist. Ordered by what is actually possible - the three channels needing nobody outside first, then the four long poles that are questions for people rather than code. |

| 101 | **The dialog asked about a conversation that had not happened.** | **FIXED 24.09.2026** | The note box said *"Anything worth knowing about this conversation"* while somebody was reading a message that had just arrived. Ritvars: "there hasn't been a conversation yet." It now says **"Anything you know that the message does not say"**, which is what the box is actually for at that moment, and the label admits it is optional. |
| 102 | **Four sentences still said "pipeline" after the tab was renamed.** | **FIXED 24.09.2026** | Found in the same screenshot. *"onto the pipeline at New"*, *"Nobody stays on the pipeline"*, *"how many people are in your pipeline"*, and the provisional note on the person page. All say **Admissions** now, the sidebar link points at `#/admissions`, and `viewPipeline` was renamed `viewAdmissions` so the code speaks the product's language too. The route alias stays, so an old link still works. **A test now fails if "pipeline" or "CAR" reaches the interface again**, checking the config's own on-screen text as well. |
| 103 | **And then the rename made it stutter.** | **FIXED 24.09.2026** | With the board renamed, *"goes to Admissions and into Admissions at New"* said the same word twice for two different things. The owner and the stage were two words before and are one now, so the sentence is written properly: *"this becomes an Admissions case starting at New"*, with the owner on the line below where it belongs. |

| 104 | **The explanation box in the qualify dialog is gone.** | **DECIDED 24.09.2026** | It restated the answers back at somebody who had just typed them: they pick a programme, they pick a next step, and a grey panel then tells them they picked a programme and a next step. The dialog asks its two questions plainly and the required hint already says why a next step is needed. Removed, along with the function behind it. Saving is unchanged and still verified. |
| 105 | **Two hints assumed a conversation that had not happened.** | **FIXED 24.09.2026** | Both sat in a dialog somebody opens while reading a message that has just arrived. *"Anything worth knowing about this conversation"* became **"Anything you know that the message does not say"**, and *"If you know from the conversation, say so here"* became **"If you already know, say so here."** |

### Also changed while fixing the above

- **The database is a file now.** `data/crm.db`, gitignored, override with `CRM_DB`. Tests still run
  in memory. A restart no longer empties the prototype under a tester's open tab.
- **The app page is never cached** (`cache-control: no-store`). A tester was holding a cached copy and
  would have kept reporting bugs that were already fixed.
- **Every request says who is asking.** The actor header used to be sent on writes only, so an
  admin-only screen could be refused for the wrong reason.
- **A slow request shows a thin bar** at the top of the window. A request that answers straight away
  shows nothing, so nothing flickers.
- The person page no longer prints a stray separator when somebody has no email.

### What is NOT done

- **Nothing is deployed.** No Supabase, no Vercel, no production anything. `sql/002_feedback.sql` is
  written but **NOT APPLIED**.
- **The PBX call logger is built and tested locally and is NOT connected.** No credentials are
  configured, the migration is not applied, and the cron is not enabled.
- There is still **no login**. "Acting as" is a dropdown. The admin-only screens are a workflow rule,
  not a security boundary, and they say so on screen.

## Open questions for Ritvars

**Answered since this list was written** (kept so the record shows they were closed, not dropped):

- ~~The person's own page: who sees a correction?~~ **ANSWERED 23.09.2026** - own corrections only,
  admins see all. Built, and item 17 records it.
- ~~Should a person's name ever show on screen, or only the role?~~ **ANSWERED 23.09.2026** - both,
  and they are different things. The USER is a person (Ieva). The OWNER is a role (Admissions).
  Item 16.
- ~~Is the browser extension the direction, or a fallback?~~ **ANSWERED 23.09.2026** - neither. It is
  demoted out of V1 entirely. Item 34.

**Still open:**

1. **The Warm-to-Hot threshold.** Three candidate definitions are written up in
   [INBOUND_ARCHITECTURE.md](INBOUND_ARCHITECTURE.md) section 7. None chosen, and a test fails if
   anybody invents one.
2. **The stage list**, and how raw / warm / hot relate to it. Ownership waits on this.
3. **Who qualifies when Tetiana is away?** The middle rung of the ladder currently has one person on it.
4. **Do we keep a message body until the qualification decision, then delete it?** Without it an
   extraction error is uncheckable. This is the one trade-off in the storage decision worth a second look.
5. **How many days** before an untouched raw contact is surfaced as ageing?
6. **Is a next action assigned to a role or to a person?** The "Owner: Ieva" example says person; the
   record's owner is a role. Two fields, one exists.
7. ~~**TeleGroup:** does a post-call notification exist, and what does it carry?~~ **ANSWERED
   24.09.2026 - do not ask again.** The event carries a `queue`, and the queue IS the button. It was
   in the original TeleGroup brief and has been mapped in `config/prototype.json` -> `phoneMenu`
   since 23.09.2026. Marina confirmed the 1/2/3 routing on 24.09.2026. Recorded in
   `config/prototype.json` -> `settled` as `pbxQueueIsTheButton` and `phoneButtonsConfirmed`, both
   `doNotReopen`. The phone channel waits on **one** thing: an API token from TeleGroup. The token
   itself is **not** being changed - that is settled too.
8. **LinkedIn:** is any inbound integration possible at all? Nothing is known.
9. **Retention:** how long do we keep archived intake items and extracted data?
10. **Merging** two records that turn out to be one human. Needed, not designed.
11. Should the research text on the demo screens stay as provider quotation, or be rewritten?
12. What should the CRM actually say to an applicant, and at which step? English is decided; the
    wording is still placeholder.
13. **How should Aigars and Ritvars be told that feedback has arrived, outside the app?** There is
    **no email mechanism in this project at all** - nothing can send mail and nothing is deployed.
    The in-app count works today. An external channel needs a decision and then real work:
    email would need a sending route (a transactional provider or the Gmail API) and somewhere
    deployed to send from; WhatsApp or Telegram would need an account and an integration. Until
    that is decided, feedback is only visible to somebody who opens the app.

14. **Is `v1-test` the release line, or a testing branch off `master`?** Today `master` sits
    untouched at `afea424` and all the work and all of Aigars's testing are on `v1-test`. The two
    readings lead somewhere different later: if `v1-test` is the release line, `master` is dead
    weight and should be retired; if it is a testing branch, the work has to merge back and
    `master` stays the thing that gets deployed and tagged. Nothing needs deciding to keep working,
    but "released" cannot be defined until it is. **Recommendation:** keep `master` as the release
    line and merge `v1-test` into it once Ieva has validated the workflow, because a release line
    that has never received a merge is easier to protect than one that is also the working branch.
    **Cost of waiting:** none today; it blocks only the first real release.

    **ANSWERED 25.09.2026, relayed - awaiting Ritvars's direct confirmation.** The answer came
    through another assistant session rather than from him in this one: *"v1-test is a testing
    branch; master stays the release line. When Ieva has validated the workflow, v1-test joins
    master through a pull request."* It matches the recommendation above and nothing has been done
    that depends on it. It is recorded here rather than acted on, and it is marked relayed because
    a decision in this file has to say where it came from. One word from him closes it.
    **OVERTAKEN BY EVENTS, 01.10.2026.** Neither reading survived. The release line is
    now `v0.9`: it was pushed to GitHub and deployed, production runs `292b4f9` from it,
    and `origin/v0.9` carries one commit more (`52e2232`, the backlog record of the
    release). `master` is still untouched at `afea424` and has never received a merge.
    `origin/v1-test` sits at `3fb39c5` and is behind the release. So "released" is now
    defined, and it is defined by a branch that did not exist when this question was
    written. **What is left of the question** is only tidying: whether `v0.9` becomes the
    permanent release line, whether `master` is fast-forwarded to it or retired, and
    whether `v1-test` is deleted. Nothing is blocked on it, and no work depends on it.

## 24.09.2026 - settled decisions can no longer be reopened

| # | What | Status |
|---|---|---|
| | `config/prototype.json` -> `settled`: five decisions Ritvars made, each with the question, the answer, who decided and when, and `doNotReopen: true`. | LIVE |
| | `config/prototype.json` -> `openQuestions`: the ONLY five things genuinely unanswered. Every question list is generated from this and nothing else. | LIVE |
| | `scripts/make_desktop_guide.py` rewritten. It reads both registers, refuses to build if a settled phrase appears in the open list, and regenerates the Desktop file from config so it cannot drift. Sabotage-proved: adding a settled question exits 1. | LIVE |
| | Three tests in `test/regressions.test.js` fail if a settled item reappears as a question, blocker or checkbox in `config/channels.json` or any `docs/*.md`. Sabotage-proved: 1 failing. | LIVE |
| | Every token-rotation line removed from `config/channels.json`, `docs/BACKLOG.md`, `docs/PBX_CALL_LOGGER.md`, `docs/CONNECTING_CHANNELS.md`, `docs/CHANNEL_READINESS.md` and the Desktop file. The token is not being changed. | LIVE |
| | Instagram `externalBlocker` no longer claims the Professional-account check is outstanding. It is in Business Suite, so it is already Professional. | LIVE |
| | Phone `externalBlocker` no longer claims the menu button is unknown. The event carries `queue` and the queue is the button. | LIVE |

**Cause:** open-question lists were rebuilt from `externalBlocker` notes written before his
answers arrived, so his answers existed and the summaries did not read them. He had to repeat
the token decision three times.

**Test count: 282 passing, 0 failing.**

## 24.09.2026 - Mailchimp checked against the live account

Ritvars asked me to check it rather than ask him. Queried the Novikontas Mailchimp account
directly, read-only, using the key already on this machine in the Grand Opening hub. The key
was never copied into this project and never printed.

- Account **Novikontas**, monthly plan, 2,827 subscribers. Audience `c6ab4facba`, 2,779 members.
- The webhooks endpoint returns **200** and **zero** webhooks are configured.

So webhooks are available and nothing has to be bought or asked for. Mailchimp moved from
`waiting_for_external_access` to `ready_for_configuration`, its blocker removed, and the
question moved from `openQuestions` to `settled`. Recorded in `config/prototype.json` ->
`mailchimp`.

A blocker is now typed as `question` (somebody has to answer, and the answer may be no) or
`work` (the steps are known, nobody has done them). A `question` blocker with no owner in
`openQuestions` fails a test - that caught LinkedIn and TikTok, which are now recorded as
parked by decision rather than silently blocked.

**Remaining unknowns: 3 live, 1 parked.** A WhatsApp number, the Google Workspace administrator,
a TeleGroup API token. Parked: whether LinkedIn or TikTok allow this at all.

## 24.09.2026 - Marina closed WhatsApp and the phone buttons

- **WhatsApp number: +371 23111114**, the Higher Education number. Confirmed by Marina.
- **Phone buttons 1 / 2 / 3 confirmed** as the existing live routing.

Both are now in `settled` with `doNotReopen`. WhatsApp moved from a `question` blocker to a
`work` blocker: the number was the input we lacked, and what remains is the Meta build - a
WhatsApp Business Account, the number registered against it, the app connected, the webhook
pointed at us, business verification. None of that is a question for anybody at Novikontas.

Together with `pbxQueueIsTheButton`, the phone routing is closed entirely. The PBX API already
exposes the queue and the queue IS the button. The phone channel now waits on one thing only:
an API token from TeleGroup.

**Remaining unknowns: 3 live, 1 parked.** The Google Workspace administrator, a TeleGroup API
token, and the spam word list from Tetiana. Parked: whether LinkedIn or TikTok allow this at all.

## 24.09.2026 - the guide is now Ritvars's connection task list

He gave the list he actually wants to work from: a settled/done block at the top, then
fourteen channels in HIS order with per-channel steps. Both the order and the steps now live
in `config/channels.json` as `connectOrder` and `connectSteps`, and the Desktop guide renders
them, so his list and the generated document cannot drift apart.

Order: WhatsApp, Facebook, Instagram, Messenger, Gmail, Website, Google Form, Open Day, Agent,
Phone, Mailchimp, LinkedIn, TikTok, In person.

Each channel now states which of three it is, rather than a flat "blocked":

- **Ready to configure** - nobody outside needed
- **Waiting on an answer** - a `question` blocker, and it must have an owner in `openQuestions`
- **Nobody to ask, this is work** - the steps are known and nobody has done them

WhatsApp's `operationalNote` claimed its place in the shared Meta Business Suite was NOT
VERIFIED. Ritvars settled that, so the note and the test that guarded it were both corrected.
The rule did not change - the note must say which it is and never leave it hanging - only the
answer did.

**One human unknown remained at the time of writing: the Google Workspace administrator.**
**SUPERSEDED 25.09.2026** - it is Marina, and there are now none. See the entry at the end of
this file.

## 24.09.2026 - four faults that only a real provider shape would have found

Every one of these passed 282 tests. All four were proved against the running
server BEFORE being fixed, and each fix was then proved by breaking it again.

| # | What | Consequence |
|---|---|---|
| 1 | No GET handshake route. `GET /api/inbound/facebook?hub.challenge=...` answered **404**. | Meta could never have been connected. It never gets as far as a message: it will not save a subscription whose challenge is not echoed back. |
| 2 | Every body went through `JSON.parse`. Mailchimp only ever posts `application/x-www-form-urlencoded`. | A real Mailchimp webhook answered **400 "the payload is not readable JSON"**. |
| 3 | The website adapter read consent as `raw.consent_admissions === true`. An HTML checkbox arrives as the STRING `"true"`. | A real form with **both consent boxes ticked recorded consent as NOT GIVEN**. Consent is a legal record. |
| 4 | `config/channels.json` declared `/api/cron/gmail-poll` and nothing implemented it. | The register read as ready for a route that did not exist. |

What they share: all four passed when driven by JSON fixtures we wrote
ourselves, and none survived the shape a provider actually sends.

**Built**

- `handshake()` in `src/inbound.js` - Meta's verify token compared in constant
  time and the exact challenge echoed as plain text; Mailchimp's URL check
  answered. Wrong token 403, missing token 503, and the real token is never
  echoed back in an error.
- `parseInboundBody()` - form-encoded (including Mailchimp's `data[email]`
  bracket notation and repeated keys), JSON, an undeclared content type, and the
  Gmail Pub/Sub envelope unwrapped from base64.
- `truthy()` in `src/adapters.js` - a ticked box in any of true/on/yes/1/Jā;
  anything not clearly yes, including an absent box, is NOT consent.
- `channel_handshake` table, so `webhookVerified` reports a handshake that
  really happened instead of a hardcoded `false`.
- `lib/gmail.js` and `api/cron/gmail-poll.js` - the whole Gmail path that does
  not need the administrator: the JWT assertion with `sub=edu@novikontas.org`,
  read-only scope, the poll window, header and multipart flattening, watch
  expiry, and `unauthorized_client` reported as *the administrator has not
  allowed this* rather than as 401. It refuses before making a request when
  there are no credentials, so a call that was never made is never reported as
  "nothing to do".
- `META_VERIFY_TOKEN` added to `.env.example` and to the register.

**One regression I caused and caught:** the handshake pattern `[a-z_]+` also
matched `GET /api/inbound/events`, and the observability view went blank. Three
existing tests failed, which is what they are for.

**Tests: 326 passing** (282 + 26 connection + 18 gmail). One of the new tests
walks every `pollPath` in the register and fails if the file does not exist, so
fault 4 cannot recur.

Nothing is enabled. Every channel is still off, no secret is set, and no
provider has been contacted.

## 25.09.2026 - a shared testing copy, so Aigars and Ieva can actually use it

Ritvars needs Aigars testing and Ieva reviewing the workflow, on a real address,
today. Two things stood between that and a public URL, and neither was optional.

**1. There is no sign-in.** `src/server.js` reads an `x-acting-as` header and
believes it. Searching that file for password, session, oauth, jwt or bcrypt
returns **zero** hits. Anybody with the address is anybody they type, including
Marina, who can read the whole history log.

**2. The database is a file.** 14 tables in SQLite. Vercel has no disk that
survives, so on Vercel the data would vanish between clicks.

**What was built instead of solving both today.** `src/gate.js`: one shared
password in front of the whole copy, and it is deliberately NOT called
authentication. Inside, identity is still a dropdown.

- The server **refuses to start** if `CRM_PUBLIC` is on and `CRM_ACCESS_PASSWORD`
  is missing or under 12 characters. A copy on the internet with no door is
  worse than no copy, and a warning in a log nobody reads is not a door.
- The server **refuses to start** with `DATASET=real` on a shared copy, and
  `loadDataset('real')` throws there too. **This is the control that makes the
  address safe to hand out**, not the password: the copy holds demo data only.
- The ticket is signed with a key derived from the password, so the password
  never reaches the browser and changing it invalidates every ticket. Expiry is
  checked after the signature, so an old ticket and a forged one look identical.
- A provider webhook stays reachable, because a signature is stronger than a
  password a human types.

**A leak my own test caught before it shipped.** Allowing `/api/inbound/*` by
prefix also published `/api/inbound/events` - the observability view, with sender
names and message bodies in it. Now only a path matching a real channel in the
register is open. Same trap as the Meta handshake route, which matched the same
path for the same reason. Prefix matching on a route namespace has now caused
two faults; match the whole path against the register.

`render.yaml` deploys `v1-test` to Render on the starter plan with a 1 GB disk,
health check at `/healthz`, and the password marked `sync: false` so it is set in
the dashboard and never written down in the repository.

**Not Vercel, and not yet Supabase.** Supabase is the database, not where code
runs, so "deploy to Supabase" is not a thing that can be done. Moving to
Vercel plus Supabase means porting ~113 SQL statements to Postgres and building
sign-in from nothing - `docs/PRODUCTION_MIGRATION.md`, written 23.09. Whose
Supabase account it eventually is matters for **who owns the applicant data**,
not for how code is committed.

**343 tests pass.** Verified end to end in a browser: the door appears, the
password opens the CRM, and the demo data is there.

## 25.09.2026 - the plan to finish V1

Written from Aigars's braindump re-read today, from ChatGPT's summary, and from
opening every screen of the running app rather than from memory. Three things
Ritvars asked for: the channel automation carried through, a workflow that makes
sense, and a UI nobody can usefully polish further.

**The order matters.** A is the workflow fault Aigars actually reported and it
changes what the screens are FOR, so it comes before B. C is weeks of external
waiting, so it starts in parallel but finishes last. The Ieva test sits between
A+B and C, and is the real gate.

### A. The workflow Aigars reported, and it is still broken

His words: *"sanāk es izdaru 2 soļus bet nekas nenotiek"* - I do two steps and
nothing happens. And: *"Būtībā CAR sadaļā ir jābūt tikai To look at manā
uztverē"* - the Inbox should have only To look at.

The Inbox today still shows **three** tabs: To look at 6, Done 12, Show not
relevant (4). That is the fault, not a cosmetic one: "Done" is a second place a
person can sit and be forgotten, which is exactly what he described.

| # | What | Status | Notes |
|---|---|---|---|
| 106 | **Inbox has ONE list: To look at.** Delete the Done tab and the not-relevant tab from the Inbox. | **SAID** | Qualified means gone from here and visible in Admissions. Not relevant means archived and findable from People or search, not a board. Aigars asked for this directly and it was not done. |
| 107 | **Qualify is one action, not two.** Confirming what somebody wants puts them in Admissions with an owner and a next step, in one save, and the screen moves on. | **SAID** | Partly built - qualify() already creates the person and the task. What is missing is that the Inbox still leaves them visible in Done, so it reads as unfinished. |
| 108 | **"Unclear" needs a plain name and a plain next step.** Aigars wrote a note that somebody wanted the engineer programme and the person appeared in Done as "not clear yet", and he could not tell what it meant or what to do. | **SAID** | Either it means "we asked, waiting for their answer" - which is a next step with a due date - or it should not be an outcome at all. Decide with Ieva. **28.09.2026:** Concept C has no "not clear yet" pile; whether that is right is **D-C2** in [DECISIONS.md](DECISIONS.md), for Ieva and Aigars. |
| 109 | **Nobody can be left nowhere.** Every person in the system is either in a stage with a next step, or archived with a reason. | **SAID** | Assert it in a test, the way the no-next-action rule already is. |
| 110 | **Two route names for the same screen.** `#/car` and `#/inbox` both exist, and so do `#/admissions` and `#/pipeline`. | **SAID** | One name per screen. Old names redirect, so a bookmark still works. |

### B. Take the TMI off the boards

Counted on the running app today, not guessed.

| # | What | Status | Notes |
|---|---|---|---|
| 111 | **Admissions cards carry four lines each.** Programme, education, channel, owner, next action, date. Owner reads "Admissions" on 10 of 12, so it is noise on every card. | **SAID** | A card needs the name, what they want, and the next step with its date. Education and channel belong on the person, not the board. Owner appears only when it is NOT the usual one. |
| 112 | **People has six filter dropdowns open at once** above the table, and the table then repeats programme+education stacked in one column and owner in another. | **SAID** | Search plus the two filters people actually use, with the rest behind "More filters". Aigars asked for the filters to say what they filter - that part is done. |
| 113 | **Today has seven controls for a screen showing one item**: Admissions/Everyone, Table/One at a time, and three tabs. | **SAID** | Keep the table default (Aigars's decision, row 40) and the three tabs. The Admissions/Everyone and Table/One-at-a-time toggles go into a single small control, or away. |
| 114 | **Delete the explanatory paragraphs from every board.** "Nothing becomes an applicant on its own", "What the machine read is a suggestion until somebody agrees with it", "These stage names are a first draft". | **SAID** | Each was written to defend a design decision to Ritvars. A person using the CRM daily does not need to be told. The stage-names caveat moves to where stages are edited. |
| 115 | **One number per screen, in the heading.** "12 people in the journey", "12 records", "6 to look at". Not repeated in tabs, cards and footers. | **SAID** | |
| 116 | **Quick edit everywhere Aigars asked for it.** He wants to add a note or fix a field without opening the person page. | **BUILT** | Done in People. Check it exists on the Inbox row and the Admissions card too, since those are where somebody is actually working. |

### C. The channel automation, carried through

Adapters, filter, identity matching, duplicate protection and the handshake are
built and tested for all 14. What is missing is real credentials and, for Meta,
their review. Nothing here is code we can finish alone.

| # | What | Status | Notes |
|---|---|---|---|
| 117 | **Deploy the shared testing copy** so there is an address for a provider to call at all. | **BUILT** | `render.yaml`, row above. Needs Ritvars to create the Render account and set the password. |
| 118 | **Website, Google Form, Open Day, Agent, In person.** Nobody outside Novikontas is needed. | **SAID** | The four quickest. Each needs the owner of that form or tool to paste an address and a secret. |
| 119 | **Meta: one app, four channels** - WhatsApp (+371 23111114), Facebook, Instagram, Messenger. | **SAID** | App Review takes weeks and can be refused, so start it first even though it finishes last. |
| 120 | **Gmail** - everything on our side is built. | **SAID** | UPDATED 25.09.2026: the administrator is **Marina**. Not a question any more; it is twenty minutes of her time at admin.google.com, and the key file back by password manager. |
| 121 | **Phone/PBX** - routing is settled, the poller is written. | **SAID** | UPDATED 25.09.2026: **Ritvars holds the token.** Nothing is owed by TeleGroup. It goes into `PBX_API_TOKEN` on the host and nowhere else. The discovery token is still not being changed. |
| 122 | **Mailchimp** - webhooks confirmed available on the live account. | **SAID** | Paste one address into the audience settings. |
| 123 | **Each channel passes the same seven checks** before it is called connected. | **BUILT** | The checks exist as tests. What is missing is running them against the real provider. |

### The gate, and it is not code

| # | What | Status | Notes |
|---|---|---|---|
| 124 | **Ieva walks the whole thing**: TODAY, INBOX, ADMISSIONS, FOLLOW-UPS, PEOPLE, REPORTS, and says whether her eyes tell her what to do next. | **SAID** | Rows 46, 50 and 51 - the stage names, the real process after To look at, and the follow-up outcomes - can only be answered here. Do A and B first so she is reacting to the intended design, not to clutter. **28.09.2026:** the screens are now Concept C's (Home, New Leads, Next Steps, People, Journey, Outcomes) and the questions are D-C1 to D-C8 in [DECISIONS.md](DECISIONS.md). When Admissions starts working in C is Ritvars's decision, recorded there. |

### Correcting the record

ChatGPT's summary says the suite is **282 tests**; it is **343**. It also lists
"Aigars' current UI changes" as done. Rows 106 to 108 are his clearest request
and they are not done, which is why the Inbox still has three tabs.

## 25.09.2026 - group A and B built

### Two corrections to yesterday's plan, found by inspecting instead of trusting it

- **Row 110 was already done.** `src/app.html` has had
  `const ALIAS = { '#/car': '#/inbox', '#/pipeline': '#/admissions' }` and a router that
  accepts both names. I raised it from grepping route strings without reading the router.
  **Status corrected to BUILT**, nothing changed.
- **Follow-ups was never broken.** The route is `#/followup`, singular. My earlier note said
  navigation "could fall back to Today"; I had typed `#/followups`. Verified working with a row
  in it. **No fix needed and none made.**

### What changed

| # | What | Status |
|---|---|---|
| 106 | The Inbox has **one** queue. The Done tab, the Not relevant tab and the show/hide control are gone, with `INBOX_STATE` and `SHOW_IRRELEVANT` deleted. | **BUILT** |
| 107 | Qualifying now **reports where the person went**. `POST /api/intake/:id/qualify` returns `landed` (id, name, stage, programme, next action, due date) and the Inbox shows it as a one-line receipt: *"Raivis Bresis is now in Admissions - New - NAV. Next: Reply by 2026-09-26. Open"*. It clears on the next visit, because it is a receipt and not a place. | **BUILT** |
| 108 | Not touched. Renaming "unclear" is Ieva's wording to choose, and inventing it would be deciding her business language for her. **Still OPEN, for Ieva.** | **SAID** |
| 109 | Not yet asserted as a rule. The receipt makes the landing visible, which is most of the value, but the invariant itself is not tested. | **SAID** |
| 110 | Already done before today. | **BUILT** |
| 111 | Admissions cards are **name, programme, next step + date**. Education and channel dropped; owner shows only when it is not the usual Admissions, which removed it from 10 of 12 cards. | **BUILT** |
| 112 | People shows **search, stage, next step** and a **More filters** control. Programme, nationality, owner and came-from fold away. A hidden filter that is actually set forces the panel open, so a filter can never be filtering while invisible. | **BUILT** |
| 113 | Today lost the duplicated `Ieva - Admissions` line, which the sidebar already shows, and the Table / One-at-a-time pair became one toggle. | **BUILT** |
| 114 | The explanatory paragraphs are gone from Today, Inbox and Admissions. **Three were kept on purpose**: the Reports honesty note, the History "there is no login yet" warning, and "Nothing is deleted" on the archive dialog. Each informs the decision being made on that screen, which is the test that was applied - not whether prose exists. | **BUILT** |
| 115 | The count lives in the heading: `Inbox · 2`, `People · 12`, `Admissions · 12`, `Today · 4`. | **BUILT** |
| 116 | The Inbox row already opens the qualify dialog, which is its editing surface. No second editing workflow was added, deliberately. | **BUILT** |

### Where archived items went

Removing the Not relevant board means an archived item has no board in the CRM. It is **not
deleted**: `state=notrelevant` still returns it through the API, a test asserts that, and the
Console can read it. If Ieva ever needs to un-archive something from the screen, that is a new
row, not a silent re-addition of the board Aigars asked to remove.

### Verified

346 tests pass. Manually in a browser against demo data: the Inbox shows one queue with no tabs;
qualifying Raivis Bresis hit the duplicate guard, "This is them" completed it, the receipt
appeared, the queue went 3 to 2 and the heading followed; the receipt was gone on return;
Admissions cards read name, programme, next step; People went from six open dropdowns to two;
a hidden filter set to NAV refused to collapse and filtered 12 people to 5; Follow-ups renders
its own screen at `#/followup`.

## 25.09.2026 - the last three human unknowns closed

Ritvars answered all three in one line: **Marina is the Google Workspace administrator, he holds
the TeleGroup API token, and Tetiana administers the Meta Business Suite.**

| Was | Now | Effect |
|---|---|---|
| Gmail was blocked on an unnamed administrator | **Marina** - ANSWERED 25.09.2026, recorded in `config/prototype.json` -> `gmail` | Gmail moved from a `question` blocker to a `work` blocker. Everything on our side was already built, so what is left is twenty minutes of her time and the key file. |
| Phone was blocked on a token from TeleGroup | **Ritvars holds it** - ANSWERED 25.09.2026 | Nothing is owed by TeleGroup. The phone channel is now ours to configure. |
| Meta - access known, holder unnamed | **Tetiana** - ANSWERED 25.09.2026 | She is who creates the app at `developers.facebook.com` and submits for App Review. Recorded on all four Meta channels. |

**The token value is not in this repository and must never be.** Only the fact that it exists and
where it goes: `PBX_API_TOKEN`, set on the host, kept in Bitwarden. This is a different token from
the discovery one, which is also not being changed - see `pbxTokenNotRotated`.

**`openQuestions` is down to one live item**: the spam word list, from Tetiana, which blocks no
channel. Plus LinkedIn/TikTok, parked by decision.

The Desktop guide's headline said "the only human information still missing is the Google
Workspace administrator". That sentence was hardcoded, so it could not notice being answered.
It is now generated from the open list and reads what is actually true.

**A stale note corrected while in there.** `metaBusinessSuite._note` still said "STILL UNVERIFIED:
whether WhatsApp is genuinely inside the same Business Suite inbox... Ritvars is checking", which
he had already answered on 24.09 ("yes, all the meta is, because is business suite"). It
contradicted the channel note I had already corrected. Same failure mode as rows 106 to 108: the
answer existed and the note did not read it.

The settled guard caught two of these itself: it refused to pass until every new decision had a
phrase protecting it from being re-asked, and then found `docs/CHANNEL_READINESS.md` still
requesting the token from TeleGroup. It then caught this very entry twice, because writing about
a closed question in the words of the question is indistinguishable from re-asking it. That is the
guard behaving correctly, and it is why these rows now record the answer instead of the question.

346 tests.

## 25.09.2026 - the testing copy goes on Render Free, with the reset accepted

**Owner decision.** No paid service and no payment card. Render Free, ephemeral SQLite, demo data
rebuilt automatically. Ritvars explicitly accepted that anything a tester types disappears on a
restart, redeploy or 15 minutes of idle sleep, because this phase validates the workflow and the
screens rather than keeping records.

**Also decided, and NOT being done now:** no SQLite to PostgreSQL port, no Supabase project of
ours, and Aigars's Supabase project is not being used. The port remains the right destination and
the wrong week for it.

**Why the port is days rather than hours** - measured on 25.09.2026, and larger than the 23.09
audit said:

| | |
|---|---|
| Tables | 13 |
| Database call sites | 200 |
| Functions touching the database | 77 |
| Of those already `async` | **0** |
| `await` on any database call | **none** |

`node:sqlite` is synchronous. Every PostgreSQL driver is not. So the cost is not translating SQL -
that part is small, with 9 `AUTOINCREMENT` columns, 20 `_at TEXT` columns that should be
`timestamptz`, one `ON CONFLICT` and no SQLite-only functions - it is that 200 call sites gain
`await`, 77 functions become `async`, and the change then cascades to every caller. A forgotten
`await` returns a Promise that behaves like a truthy object instead of failing, which is where the
bugs would come from.

**Aigars's Supabase project was never inspected.** The Supabase access here is authenticated as
Ritvars and sees one organisation, `RitvarsTeo`, with three projects. Aigars's is not reachable, so
nothing was reported about what it holds. Recorded rather than guessed.

**The changes, which are two files:**

- `render.yaml`: `plan: starter` to `plan: free`, the `disk:` block deleted because Render Free
  cannot have one, and `CRM_DB` moved to `/tmp/crm.db`. That last one matters: `data/` is
  gitignored and `openDb()` does not create directories, so the default path would fail on a fresh
  container's first boot.
- `src/gate.js`: the login page now reads **"Demo data only - changes reset when the demo
  restarts."**

**Unchanged on purpose:** the shared-password gate, the refusal to start without a password, the
refusal to start with real applicant data, the route gating that keeps `/api/inbound/events` closed,
and the automatic demo seed.

**Verified, not assumed.** Booted against genuinely empty storage: 12 demo people appeared by
themselves. Signed in as Ieva, added a person, reached 13; booted again on a fresh path and the
person was gone while the demo rebuilt to 12. The first attempt at that test was wrong - the delete
failed because the file was still locked, so the app reopened the old database and reported the
person had survived. Redone on a clean path.

Render's own documentation confirms the terms: free web services cannot have a persistent disk,
files without one are "lost every time the service redeploys or restarts", sleep is 15 minutes,
wake is about a minute, and the allowance is 750 instance hours a month. **Whether Render asks for
a card at signup is NOT verified** - their docs imply it does not, and if it does, stop.

346 tests.

## 25.09.2026 - a person against every channel

Ritvars named who physically has to act, per channel. Recorded in
`config/channels.json` as `ownerPerson` and `ownerAction`, and rendered in the
Desktop guide as a line on each channel. **A name here is a person, not a team,
because "somebody at marketing" never does anything.**

| Channel | Who |
|---|---|
| WhatsApp, Facebook, Instagram, Messenger | **Tetiana** - the Meta app and App Review for all four |
| Gmail | **Marina** - Workspace administrator approval |
| Website form | **Oksana** - a new name to this register |
| Open Day | **Aigars** - the booking tool's webhook |
| Phone, Mailchimp | **Ritvars** - configuration on our side |
| Google Form | **nobody named yet** |
| Agent or partner | **nobody named yet** |
| LinkedIn, TikTok, In person | manual, no integration |

**Two channels moved backwards, correctly.** Google Form and Agent were both
marked `ready_for_configuration`. Naming everybody else exposed that these two
have no person at all, so they are now `waiting_for_external_access` with a
`question` blocker and an entry in `openQuestions`.

The settled guard caught this itself: it refused to pass while a question
claimed to block a channel typed as `work`. Google Form was `work` on the
assumption somebody known would run the Apps Script, and nobody is known.

**Open questions: 2** (was 4). The spam word list from Tetiana, and which agent we start with.
The Google Form owner is SETTLED 01.10 - the channel is dropped, so it does not matter who owns
the form. LinkedIn and TikTok are active channels waiting on developer-app approval, which is a
blocker and not a question.

346 tests.


---

## 25.09.2026 - sign-in, and an admin Channels panel

**BUILT, not deployed, not connected.** 423 tests, 0 failing. Nothing committed.

### Sign-in

The identity was `x-acting-as`: a header the browser set and the server believed. Every history
entry, every admin screen and every "who did this" was therefore self-declared.

Adapted from the Talent Acquisition hub's `lib/_auth.js`, which was itself lifted from the Client
Hub and has been running since August 2026. Reused rather than rewritten on purpose.

| | |
|---|---|
| `src/auth.js` | scrypt hashes with a version field, HMAC-signed sessions, decoy hash on a missing account |
| `crm_users` | id, email, display_name, password_hash, role, active, session_version, last_login_at |
| `scripts/manage_users.mjs` | the only way an account is made. `seed`, `add`, `password`, `role`, `disable`, `signout`, `secret` |
| Two roles | `admin` (Aigars, Ritvars, Marina) and `user` (Ieva, Laura, Tetiana, Maris, Arina) |
| `CRM_AUTH=1` | switches it on. **Off by default**, so the 346 tests that send the header still pass unchanged |

**With sign-in on, the header is IGNORED, not preferred.** There is a test that asserts exactly
that, because a fallback would have made the login walk-aroundable.

**The role is re-read from the database on every request**, never taken from the cookie. Taking away
somebody's admin rights is in force on their next click, not when their cookie expires.

### The Channels panel - `#/channels`, admins only

Four states, and the distinction between two of them is the whole point.

| | |
|---|---|
| `NOT CONFIGURED` | a setting it needs is missing |
| `CONFIGURED` | the settings exist, and **nothing has proved the path works** |
| `CONNECTED` | **the provider itself has reached us** |
| `ERROR` | it was checked and the check failed |

**ON/OFF is a separate axis.** Everything is OFF. Nothing here connected anything.

**A passing check does NOT make a channel CONNECTED.** Our check runs against our own code in our
own process, so passing it proves our side works and says nothing about whether Meta has been
pointed at us. The panel says so in those words on every channel.

**No secret value is ever shown or sent.** The NAME of each setting is, plus the word OK or MISSING.
Three tests grep for the values: one on the module's output, one on the check result, one on the
HTTP response the browser actually receives.

### What the checks actually do

Nothing goes out to a provider, nothing is written to the Inbox, nothing is sent to anybody.

| Kind | Channels | What it does |
|---|---|---|
| `handshake` | the four Meta channels, Mailchimp | runs the provider verification exchange in process: the right token must be accepted, a wrong one must be refused, the challenge must come back exactly |
| `simulated` | every webhook channel | pushes a provider-shaped payload through the real verify, parse and adapt path, signed with the real secret, and asserts a tampered payload is refused |
| `config` | Phone, Email | settings present and the poll route wired. **TeleGroup and Google are deliberately not called** |
| `none` | In person, LinkedIn, TikTok | nothing can be checked without a person. Reported as SKIPPED, never as a pass |

A Meta channel runs **both** the handshake and the message path, because they are different
failures: the handshake is what lets Meta save the subscription, the signature is what lets a
message through afterwards.

### Two faults this found in existing code

- **`inbound` had no provenance.** The demo builder and the simulator write through the same table a
  real provider writes to, so counting those rows would have shown every channel on the testing copy
  as CONNECTED, to Aigars, on day one. Added `inbound.source` - `provider` | `simulated` | `demo` |
  `manual` - and only `provider` counts as evidence.
- **A port already in use was swallowed.** `server.listen` had no error handler, so a stale server
  answered for a new one. It now exits, and the boot line prints the port it really got.

### What is NOT covered by a test

The frontend. Both faults found while building it - the server answering `auth` while the page read
`on`, and the hash listener never being registered after a sign-in - were found by looking at the
screen, not by a test. A source-text assertion would not have caught either.

**Open questions: still 4.** Nothing here answered or reopened one.

423 tests.

---

## 25.09.2026 (later) - Google sign-in, the API door, and a QA pass

**478 tests, 0 failing. Nothing committed. Nothing deployed. No provider contacted.**

### Where sign-in actually stands

| | Status |
|---|---|
| Password sign-in | **BUILT and working.** scrypt hashes, signed sessions, throttled guessing |
| Google sign-in | **BUILT. NOT LIVE, and not provider-verified.** See below |
| `x-acting-as` header | **Ignored entirely** when `CRM_AUTH=1` |
| The API before sign-in | **Closed.** See "the door that was missing" |

**GOOGLE IS NOT CONNECTED TO ANYTHING.** The flow is implemented and tested against a key pair
generated inside the test process - the tests prove our code, not Google. No OAuth client exists for
the Academy CRM, no redirect URI is registered, and `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and
`GOOGLE_REDIRECT_URI` are unset everywhere. With them unset the button is not drawn at all and
`/api/auth/google/start` answers `503 google_not_configured`. **A passing callback test is not a
working Google sign-in**, and nothing here should be read as saying otherwise.

### The accounts, and only these

| Address | Name | Role | Channels |
|---|---|---|---|
| `ritvars.vilcins@novikontas.org` | Ritvars | admin | yes |
| `aigars.kluga@novikontas.org` | Aigars | admin | yes |
| `edu@novikontas.org` | Admissions | user | no, 403 |

**`edu@` is the shared Admissions account that Ieva and Laura both work from.** It is recorded with
`sharedBy: ["Ieva", "Laura"]`, and signing in with it is a normal, intended way for either of them to
use the CRM. It is `user` because **Channels is admin-only for everybody** and admissions work needs
no channel configuration - the same rule every admissions seat is under, not a restriction aimed at
them. The one thing it does carry is that an entry made from it reads "Admissions" rather than the
individual, so where the history has to name a person, that person signs in as themselves.

Marina, Tetiana, Maris Cirulis and Arina have **no address recorded**, so they have no account, and
`seed` names them on every run rather than inventing one.

**Addresses are never derived from names.** `seed` used to build `first.last@novikontas.org` from a
display name and produced `ritvars@` for somebody who is `ritvars.vilcins@`. With Google that is not
cosmetic: the allowlist matches on the address, so the guessed row refuses the real person and lets
nobody in. It no longer guesses, and a test asserts the configured address is not what a name would
produce.

### The door that was missing

**With `CRM_AUTH=1` and nobody signed in, the data API answered anyway.** `GET /api/people`,
`/api/tasks`, `/api/reports` and `/api/config` all returned 200, and `/api/whoami` reported the
caller as **"Ieva"** because the route fell back to the first name in the config when nobody was
identified. The login screen refused to draw the CRM, but the screen was never the boundary.

Closed. Every `/api/` path now answers `401 not signed in` unless a session proves otherwise, with
the same allow-list shape `src/gate.js` already uses for the shared door - including its recorded
trap that a prefix match on `/api/inbound/` also opens `/api/inbound/events`, which carries sender
names and message bodies. Only a path naming a **real channel** stays open, plus `/api/auth/` and
`/api/cron/`, because a provider proves itself with a signature and has no cookie.

Verified by hand as well as by test: the Meta handshake still answers and echoes its challenge, a
wrong verify token is still refused by the handshake rather than by the door, and a signed website
webhook still queues an event - all with no session at all.

### Smaller fixes in the same pass

- **`/assets/na_pattern_tile.png` 404'd on every page load.** The sign-in card's mask references it
  and the asset had not been carried over. Copied in; the assets allow-list is now name to
  content-type so a new kind of file cannot be served with the wrong one.
- **The shell fetched `/api/config` before asking who you are**, so 34KB of configuration reached an
  unauthenticated browser before the login screen appeared. Auth now runs first.
- **A poll channel's check said "a poll route is declared" and stopped there.** Declared only means
  the register names a path. It now also checks a handler file exists, because the poll routes are
  Vercel functions under `api/` and not routes in `src/server.js`.
- **`currentUser()` ran a fresh query per caller**, up to three or four times per request. Cached
  per request.
- `.env.example` had none of the sign-in or Google variables. All present now, by name only.

### Still needing a human

- **An OAuth client for the Academy CRM**, and its redirect URI registered at Google Cloud Console
  BEFORE the values are set here. Google compares `redirect_uri` character for character and refuses
  on its own error page, before any of our code runs, so a wrong value leaves nothing on our side to
  debug. Owner decision: reuse the Talent Acquisition client or create a separate one.
- **Whether `edu@novikontas.org` can complete an OAuth sign-in at all.** Shared mailboxes sometimes
  cannot. Only matters if Google is preferred over a password for that account.
- **Passwords**, if Google is not used. Not settable by anyone but Ritvars.
- Addresses for Marina, Tetiana, Maris Cirulis and Arina, if they are to have accounts.

478 tests.

---

## EVERYTHING NOT DONE, as of 25.09.2026

Written at Ritvars's instruction at the end of the autonomous QA run. **Nothing below is a
recommendation to act now.** It is the honest list of what is open, so that nothing is carried only
in somebody's head or in a chat window.

Statuses as used everywhere in this file: `SAID` nobody checked it - `DECIDED` the owner decided it -
`BUILT` it exists in the prototype - `LIVE` verified running in production - `UNKNOWN` named but not
checked. **Nothing in this whole project is LIVE.**

### A. Blocked on somebody outside this repository

| # | What | Status | Whose |
|---|---|---|---|
| A1 | **An OAuth client for the Academy CRM.** Reuse the Talent Acquisition client or create a separate one. The redirect URI must be registered at Google Cloud Console **before** the values are set here: Google compares it character for character and refuses on its own error page, before any of our code runs, so a wrong value leaves nothing on our side to debug | **NOT DECIDED** | Ritvars decides, then it is registered |
| A2 | Whether `edu@novikontas.org` can complete an OAuth sign-in at all. Shared mailboxes sometimes cannot. Only matters if Google is preferred over a password for that account | **UNKNOWN** | Marina, Workspace admin |
| A3 | Passwords for the three accounts, if Google is not used. Not settable by anyone but Ritvars, and never through a Claude session | **SAID** | Ritvars |
| A4 | Email addresses for Marina, Tetiana, Maris Cirulis and Arina, if they are to have accounts at all. `seed` names them on every run rather than inventing one | **UNKNOWN** | Ritvars |
| A5 | The 14 channels. Every external blocker is already recorded per channel in `config/channels.json` as `ownerPerson` and `ownerAction`: Tetiana holds the Meta build for four channels, Marina the Gmail delegation, Oksana the website form, Aigars the Open Day webhook, Ritvars the PBX token and Mailchimp | **SAID** | named per channel |
| A6 | The open questions in `config/prototype.json` under `openQuestions`: **2 since 02.10** - the spam word list from Tetiana, and which agent to start with. The Google Form owner moved to `settled` when the channel was dropped | **UNKNOWN** | named per question |

### B. Product and workflow decisions nobody has taken

All of `docs/WORKFLOW_MODEL.md` is specification. **None of it is implemented**, and it carries
**16 open decisions**. The ones that change the shape of everything else:

| # | What | Status |
|---|---|---|
| B1 | **Where outstanding requirements come from** - automatically from the stage, by hand, or hybrid. Decision 13. The OpenEduCat appendix added a fourth and simplest answer: that there are no requirements at all, only stages and planned actions | **NOT DECIDED** |
| B2 | Whether admission contains a **decision step**. Our stages run Application straight into Contract, so there is nowhere a person is "with us" rather than waiting on them, and the silence clock would chase somebody whose file is on our own desk | **NOT DECIDED** |
| B3 | The other 14 decisions in `WORKFLOW_MODEL.md`: silence thresholds, what restarts the clock, one clock or two, pausing somebody deliberately, terminal stages, the documents boundary, and whether Admissions needs a stage-level "where is this stuck" view | **NOT DECIDED** |
| B4 | **Ieva has not validated the workflow at all.** Every row in this file about how work flows is provisional until she has | **SAID** |

### C. Architecture, parked with a recommendation

| # | What | Status |
|---|---|---|
| C1 | `docs/PLATFORM_FEASIBILITY.md` recommends **Path C**: keep our CRM, move to Postgres when that happens, and take authentication from something proven rather than inventing it. The authentication half is now done, from the proven source. The rest is untouched | **NOT DECIDED** |
| C2 | **The thirty-minute test that could end the platform debate**: show Ieva the Atomic CRM public demo. If it reads as a sales tool, Path B is over regardless of the engineering. Nobody has done it | **SAID** |
| C3 | **Durable storage.** The testing copy is SQLite on Render Free and tester changes disappear on restart, which the owner explicitly accepted. A Postgres port is roughly 200 call sites across 77 synchronous functions | **NOT DECIDED** |
| C4 | Aigars already has a paid Supabase project. It has not been used, and a new one must not be created | **SAID** |

### D. Known, and deliberately not fixed

| # | What | Why it was left |
|---|---|---|
| D1 | **The frontend has no automated test coverage at all.** Every UI fault found on 25.09.2026 was found by looking at the screen: the `auth`/`on` field mismatch, the unregistered hash listener, the dropped `google` field, the missing `.hidden` class, the Sign in button falling outside its mask window, and `type="email"` refusing a bare name. A source-text assertion would have caught none of them | A real gap. Closing it means choosing a browser test runner, which is a tooling decision |
| D2 | Below 360px the login's Sign in button is narrower than the fixed 304px hole the card mask punches, so a thin sliver shows around its edge | It is the sign-in kit's own behaviour, and the instruction was not to redesign the login |
| D3 | `/api/cron/pbx-calls` and `/api/cron/gmail-poll` exist as Vercel functions under `api/`, **not** as routes in `src/server.js`, so the local prototype answers 404 on them. The channel check now confirms a handler file exists, which is the honest half of the question | A deployment-shape fact rather than a bug. Making the local server serve them is a real change |
| D4 | Several screens fetch `/api/summary`, `/api/intake` and `/api/waiting` two or three times per navigation | Pre-existing, route-level, and outside a small safe cleanup |
| D5 | Signing out clears the cookie but does not revoke the session server-side, so a captured cookie stays valid until it expires. `session_version` exists to invalidate every session for one person at once | The same model the Talent Acquisition hub has run since August 2026. Changing it is a design decision |
| D6 | `src/app.html` carries CRLF line endings and git warns on every diff | Converting it has broken a sibling project's test suite before |

### E. Not adopted from the sign-in kit

The login screen is the kit's. Four things it offers were **not** taken, because Academy CRM's
sign-in is single-step and adopting them would change behaviour rather than appearance:

- the remembered-account chip
- the two-step reveal, where the password field appears only after the email
- the "signing you in" pending card shown while a session is resolving
- the forced first-password-change flow, and the 10,000-word password blocklist

The kit also carries a **four-role** model, owner / admin / editor / viewer. Academy CRM has two,
`admin` and `user`, and that stays until somebody decides otherwise.

### F. Parked mid-flight

| # | What | Where it stopped |
|---|---|---|
| F1 | **The contrast audit.** `check_contrast_real.mjs` from the component library was copied in and adapted to this project's sign-in selectors, theme switch and screen list, then **removed again** when Ritvars said to stop until the login was right. Nothing of it remains in the tree. The adaptation is small and known: three selectors, the theme call, and the `SURFACES` list | Removed, to be redone |
| F2 | A wider accessibility pass: focus order, landmarks, alt text, keyboard reachability. The contrast tool covers WCAG 1.4.3 on text only and nothing else | Never started |

### G. Release

| # | What | Status |
|---|---|---|
| G1 | **Nothing from 25.09.2026 is committed.** 11 modified files and 10 untracked, on `v1-test` at `16d82f0`. `master` is untouched at `afea424` | **NOT APPLIED** |
| G2 | Nothing is deployed. The Render testing copy is still running older code, so none of the sign-in work is in front of Aigars or Ieva | **NOT APPLIED** |
| G3 | `v1-test` is meant to reach `master` through a pull request once Ieva has validated the workflow. That answer reached this file relayed rather than directly, so it stays open until Ritvars confirms it himself | **SAID** |

480 tests.

---

## DEPLOYMENT BLOCKER: do not enable CRM_AUTH=1 on Render yet

**Recorded 25.09.2026 after live verification. Nothing here is implemented, and nothing about the
Render service was changed.**

### The blocker, in one sentence

The authentication implementation is complete and tested in the committed code, but switching
`CRM_AUTH=1` on the current Render Free deployment **would lock everybody out of the testing copy**,
because that deployment has no sign-in accounts and no way to keep any.

### 1. Auth implementation

| | |
|---|---|
| The code | **BUILT**, committed as `86446bb` on `v1-test` |
| Test suite | **480 passing, 0 failing** |
| Admin and user authorization | **Tested.** Admin reaches the Channels routes, a normal user gets 403, an unauthenticated caller gets 401 |
| Google callback and allowlist, application side | **Tested**, against an RSA key pair minted inside the test process |
| Real Google OAuth | **NOT CONFIGURED.** See section 5 |

### 2. Render deployment

- The test copy **must remain usable with the existing shared-password gate**, exactly as it is now.
- **Do not enable `CRM_AUTH=1`.**
- Do not set or invent passwords.
- Do not create Google credentials.
- Do not change the Render configuration.

### 3. Root cause

Four facts, each verified rather than reasoned:

1. `render.yaml` sets `CRM_DB=/tmp/crm.db`. Free has no disk, so that file is **ephemeral** and is
   gone on every restart, redeploy and wake from idle sleep.
2. `crm_users` is written **only** by `scripts/manage_users.mjs`. Neither `buildCommand`
   (`npm install`) nor `startCommand` (`npm start`) calls it.
3. A fresh container therefore has **zero** sign-in accounts. Reproduced locally with Render's exact
   configuration: `crm_users rows: 0 | with a password: 0`, while the demo data self-seeded to 12
   people - so the service looks healthy and a deploy looks successful.
4. Accounts created by hand on the running container **would not survive** the next restart.

What a person would actually hit, walked end to end against Render's configuration locally:

| Step | Result |
|---|---|
| Shared password door | passes, `crm_access` cookie issued |
| The app page inside it | served, 195,944 bytes, login form present |
| `ritvars.vilcins` signs in | `That email and password do not match an account.` |
| `aigars.kluga` signs in | the same |
| `edu` signs in | the same |

The login screen renders correctly and nobody can get past it. Aigars and Ieva would lose the
testing copy.

### 4. DECISION NEEDED

**The owner must choose how authentication accounts are provisioned for the V1 test deployment
before `CRM_AUTH` can safely be enabled.** Three directions, recorded without a recommendation and
**none of them implemented**:

| | Direction |
|---|---|
| **A** | Deterministic test-account provisioning at startup, so a fresh container always comes up with the accounts it needs |
| **B** | Google OAuth provisioning and authentication, so identity does not depend on anything stored in the container |
| **C** | Continue using the shared-password gate until the deployment architecture is decided |

This is a deployment architecture decision and it belongs to Ritvars. It also overlaps the durable
storage question already recorded in this file at C3.

### 5. Google

| Variable | Status |
|---|---|
| `GOOGLE_CLIENT_ID` | **not configured** |
| `GOOGLE_CLIENT_SECRET` | **not configured** |
| `GOOGLE_REDIRECT_URI` | **not configured** |

**Real Google SSO is not live.** With these unset the button is not drawn at all and
`/api/auth/google/start` answers `503 google_not_configured`. The passing callback tests prove our
own code against a locally minted key pair; they prove nothing about Google, and nothing in this
file should be read as saying otherwise.

### 6. Verification status

Kept separate on purpose, because three of these are commonly conflated.

| What | Status | How |
|---|---|---|
| Local and committed auth code | **VERIFIED** | 480 tests, plus the live door-by-door walk above |
| Render service health | **VERIFIED** | `GET /healthz` -> `200 {"ok":true,"people":12}` |
| Which commit is live on Render | **NOT VERIFIED** | No Render CLI, API key or dashboard tooling in the session. Every externally reachable endpoint is byte-identical between `16d82f0` and `86446bb`, because the new API door only activates when `CRM_AUTH=1` and the shared gate answers before any new route. There is no external signal. It needs the Render dashboard |
| Individual authentication on Render | **NOT ENABLED** | `CRM_AUTH` is not set there, deliberately |
| Google SSO | **NOT CONFIGURED** | Section 5 |

### 7. Account semantics

| Address | Who | Role | Channels |
|---|---|---|---|
| `ritvars.vilcins@novikontas.org` | Ritvars | admin | yes |
| `aigars.kluga@novikontas.org` | Aigars | admin | yes |
| `edu@novikontas.org` | **the shared Admissions account Ieva and Laura both work from** | user | **no, 403** |

`edu@` is **not an individual person** and must never be written up as one. It is the Admissions
account the two of them share, recorded with `sharedBy: ["Ieva", "Laura"]`, and signing in with it is
a normal, intended way for either of them to use the CRM. It stays `user`: **Channels is admin-only
for everybody**, and admissions work needs no channel configuration, so this is the same rule every
admissions seat is under rather than a restriction aimed at them. It **must not** receive Channels
admin access.

### UPDATE 25.09.2026 (later): the code side is solved, the host side is not

**The historical explanation above is left exactly as it was.** It is the record of a fault that was
caught before it reached anybody, and the reasoning is still the reason this mechanism exists.

**Status: RESOLVED IN CODE. NOT YET READY ON RENDER.** Both halves matter and they are not the same
thing.

#### What is solved

`src/bootstrap.js` provisions the accounts at boot, so an ephemeral database is no longer a lockout.

| Property | How it behaves |
|---|---|
| Runs | At every startup, after the database and the demo data, before the server listens |
| Creates | **Only** the addresses in `config/prototype.json` -> `accounts`. Never invents one |
| Idempotent | Proved over five consecutive runs: 3 created once, then 0 created, 3 kept, no duplicates |
| Existing accounts | **Never touched.** Not the role, not the password, not the active flag. A bootstrap that corrected a role on every restart would quietly undo an administrator |
| Passwords | Read from the host environment, by the variable named in each account's `passwordEnv`. Never generated, never printed, never written down |
| Half-made accounts | **Impossible.** An account that cannot be given a password is not created at all, because an account with no password is the lockout wearing a different hat |
| With sign-in off | Does nothing and demands nothing, so a laptop still works with none of these set |

The three-way rule on the provisioning variables, which is the part worth understanding:

- **none set** - this copy provisions accounts some other way. Bootstrap stays out of it and the
  server starts. If that leaves nobody able to sign in, it prints a loud WARNING naming the
  variables, because a login screen nobody can pass looks healthy from outside.
- **some set** - somebody meant to use it and got it wrong. **Refuses to start** and names what is
  missing. Half a set is the confusing case: two people sign in and the third is told their password
  is wrong, which reads as their mistake rather than a deployment one.
- **all set** - creates whatever is missing, leaves everything else alone.

The first version of this refused whenever the variables were absent, which broke eleven existing
tests by refusing to start servers that were provisioned another way. That was caught by the full
suite, not by the focused one - the focused run was green.

#### Proved locally, against Render's exact configuration

A fresh database with `CRM_PUBLIC=1`, `CRM_DB` in a temporary directory, `CRM_AUTH=1` and the three
provisioning variables:

```
accounts: 3 created, 0 already there
crm_users = 3
```

| Account | Role | Signs in | Channels |
|---|---|---|---|
| `ritvars.vilcins@novikontas.org` | admin | yes | **200** |
| `aigars.kluga@novikontas.org` | admin | yes | **200** |
| `edu@novikontas.org` - Admissions, shared by Ieva and Laura | user | yes | **403** |
| an unlisted `@novikontas.org` address | - | **refused** | - |

Restarted twice on the same database: `0 created, 3 already there`, still exactly 3 rows. No password
value appeared in any boot log, in any refusal, or in anything the module returns - asserted by test,
not by reading.

#### What is NOT solved, and blocks turning this on

`render.yaml` now declares `CRM_AUTH=1` and four variables as `sync: false` - **names only, no
values, nothing secret in source control**. Those four values have to be set **in the Render
dashboard**, and nobody in a Claude session can do it:

| Variable | Purpose |
|---|---|
| `CRM_SESSION_SECRET` | signs the session cookies, at least 24 characters |
| `CRM_RITVARS_PASSWORD` | Ritvars |
| `CRM_AIGARS_PASSWORD` | Aigars |
| `CRM_ADMISSIONS_PASSWORD` | the shared Admissions account |

**Until all four are set, the deployment will refuse to start** - deliberately, and far better than
booting into a lockout. Render keeps the last healthy deploy serving when a new one fails its health
check, which should mean the current copy stays up meanwhile; that is Render's documented behaviour
and it has **not** been verified here.

**Passwords are Ritvars's to choose and set.** None was generated, suggested or recorded by anyone
else, and none belongs in this file.

#### Still true, and not changed by any of this

- **Google OAuth is not configured.** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and
  `GOOGLE_REDIRECT_URI` are unset, no client exists, and live Google SSO does not work. The password
  path is what makes the V1 testing copy usable, and that was the point of doing it this way.
- **`edu@novikontas.org` is the shared Admissions account Ieva and Laura both work from**, role
  `user`, 403 from Channels. Not an individual, and not a lesser account: Channels is admin-only for
  everybody.
- The `/tmp` database still loses everything else on restart, including whatever a tester entered.
  That is the accepted trade recorded at C3, and account provisioning does not change it.

507 tests.


---

## 26.09.2026 - autonomous queue run

Safe, already-decided engineering only. No product decision was taken, no Render configuration was
touched, no Google credential was created, no password was invented.

### Faults found and fixed

#### 1. `DATASET=demo` silently produced an empty database - **FIXED**

`loadDataset()` handled `real` and `synthetic`, and everything else fell through to an `else` that
emptied every table and reported success. `demo` is a first-class dataset everywhere else -
`.env.example` lists it, the Console offers it, the boot path builds it for a fresh shared copy - so
it silently did nothing.

Three consequences, all real:

- a documented value that did nothing
- `POST /api/dataset` passes the caller's own text straight in, so **a typo emptied the database and
  answered `200 ok`**
- one channels test asserted that a demo build is not mistaken for a real provider connection
  **while there was no demo build to mistake**. It passed in 0.6s against nothing; it now takes 7.7s
  and means something

**The first fix was itself wrong** and worth recording: it added the branch and threw on an unknown
name, but `clearAll()` was still the first line, so a refused name still wiped the database before
complaining. Validation now happens **before** anything is cleared. Proved: 64 people, `POST` a
typo, `400`, still 64 people.

Four tests added in `test/modes.test.js`, including the destructive one.

#### 2. The Admissions board rendered nothing after a form sign-in - **FIXED**

`CFG` had **0 keys** after signing in through the login form. The board builds its columns from
`CFG.stages`, so it drew a heading reading "Admissions - 12" above an empty board. Today rendered
almost nothing for the same reason.

**Introduced on 25.09.2026 by me**, moving the `/api/config` fetch below the login early-return so
that configuration no longer reached an unauthenticated browser. That was right; what was missed is
that `doLogin()` then called `route()` directly and never fetched it. The post-sign-in path is now a
shared `startShell()` that both the first load and a successful sign-in run.

**It healed on the next reload, which is exactly why a manual pass missed it.** Found by the
contrast tool's "suspiciously few elements" guard, not by looking at the screen. Measured before and
after: 0 keys / 0 columns / 0 cards / 35 characters, then 88 / 7 / 12 / 1572.

#### 3. The ERROR state failed AA in the dark theme - **FIXED**

`.chstate.s-error` was written as `var(--bad,#b3261e)` and `--bad` was declared in **neither**
palette, so the hardcoded fallback was always what rendered. It measures **2.64:1** on the dark card
against a 4.5:1 requirement. `--bad` is now declared in both palettes - the light value unchanged at
6.05:1, the dark one at 8.83:1 - and the fallback is gone. Re-measured: dark went from 2 below AA to
**0**.

Mine, from 25.09.2026, and the same shape as the `--amber` fault already recorded in this project.

### The contrast audit - F1, now DONE

`scripts/check_contrast.mjs`, adapted from the component library. Only the four things its README
names as the host project's were changed: the sign-in selectors, the theme switch, the screen list
and the output path. **The measurement region is byte-identical to the kit's**, checked with a diff,
and the kit's own 16 colour-maths tests pass.

It drives headless Chrome, signs in as a real account, walks 8 screens in both themes, and refuses
to report at all if it did not sign in.

| | Light | Dark |
|---|---|---|
| Measured | 563 | 563 |
| Below AA | **58** | **0** |
| Unmeasurable | 0 | 0 |

**The 58 light-theme failures are NOT fixed, deliberately.** Every one is the same core token:
`--t4: rgba(17,28,33,.48)`, which is 3.09:1 on paper and 3.12:1 on a card, against 4.5:1 for text
under 18pt. It is used app-wide for secondary text - `.sub2`, `.footnote`, table headers, report
figures - across six screens. Changing it is a visual-design change to the whole application, and
the palette is Ritvars's. **DECISION NEEDED.**

Two limits of the run, said rather than hidden: it measures only the **default tab** of a screen, so
Today's other two tabs were never walked; and Today legitimately measured 9 elements because the
demo has nothing outstanding, which was checked rather than assumed.

### Security sweep - no bypass found

Every route was enumerated and checked against the sign-in door.

- 43 literal `/api/` routes: **5 open** (exactly `/api/auth/*`), 38 gated
- 18 regex routes checked individually. `/api/inbound/events` gated, `/api/inbound/<channel>/simulate`
  gated, an unknown channel name gated, the 14 real channels open
- Provider access intact: the Meta handshake answers and a wrong verify token is refused by the
  handshake rather than by the door
- **No HTTP route writes a role or a password.** The only writes to `crm_users` from a request are
  `last_login_at`
- No secret shape anywhere in the diff or the untracked files

### New finding, NOT fixed

**Feedback access is authorised by display name, and display names are not unique.**
`canReadFeedback()` matches `crm_users.display_name` against `config.feedbackReaders`
(`["Aigars","Ritvars"]`), but only `email` carries a UNIQUE constraint. Two accounts with the same
display name both pass. Proved: a second row with `display_name` "Ritvars" inserts without
complaint.

Not exploitable by a non-admin - only `manage_users.mjs` creates accounts - so it is a footgun for
an administrator rather than an escalation path. **Not fixed because the fix changes who may read
feedback, which is not an engineering decision.** **DECISION NEEDED.**

### Statuses

| Item | Was | Now |
|---|---|---|
| G1 nothing committed | NOT APPLIED | **DONE.** `86446bb` and `b8919c1` pushed to `v1-test` |
| G2 nothing deployed | NOT APPLIED | **BLOCKED.** `b8919c1` deployment FAILED; cause diagnosed and recorded above |
| F1 contrast audit | Removed, to be redone | **DONE.** Tool in `scripts/check_contrast.mjs`, run, findings above |
| D1 no frontend test coverage | A real gap | **STILL OPEN**, and this run is the evidence for why: two of the three faults above were frontend, and neither was findable by the 511 tests. Closing it still needs a browser-runner decision |

---

## LOGIN DECISION SHEET - V1 test deployment

**Written 26.09.2026 as analysis, not as a proposal. Nothing here was implemented, no option is
recommended, and the options are deliberately not ranked.** The decision is Ritvars's.

### A. Where things actually stand

| Piece | State | Evidence |
|---|---|---|
| Password sign-in | **BUILT, tested** | scrypt hashes, HMAC-signed sessions, throttled guessing, `src/auth.js` |
| Two roles, admin and user | **BUILT, tested** | Role read from the database on every request, never from the cookie |
| The API door | **BUILT, tested** | Every `/api/` path answers 401 without a session, except `/api/auth/`, `/api/cron/` and the 14 real channel endpoints |
| Google OAuth, application side | **BUILT, tested** | Token verification, nonce, hosted-domain check, allowlist. Tested against a key pair minted inside the test process |
| Google OAuth, provider side | **DOES NOT EXIST** | No client, no redirect URI, three variables unset. Live Google SSO does not work |
| Account provisioning | **BUILT, tested** | `src/bootstrap.js`, idempotent, creates only the three configured addresses, never touches an existing account |
| Shared-password gate | **BUILT, running live** | `src/gate.js`, `CRM_PUBLIC=1`, one password for the whole copy. This is what protects the address today |
| `CRM_AUTH` | Declared `value: "1"` in `render.yaml` | Literal blueprint values apply automatically |
| `CRM_SESSION_SECRET` | `sync: false` | Must be set in the dashboard. The server refuses to start without it when auth is on |
| Database persistence | **EPHEMERAL** | `CRM_DB=/tmp/crm.db` on Render Free. Gone on restart, redeploy and wake from idle sleep |

**The account persistence problem, precisely.** `crm_users` lives in that ephemeral file, so accounts
created by hand vanish. `src/bootstrap.js` is the answer to exactly that: it recreates them from
configuration at every boot. What it needs is the passwords, and those come from the environment.

**Environment variables are NOT ephemeral.** Only the disk is. The shared door's
`CRM_ACCESS_PASSWORD` has been `sync: false` and surviving restarts on this service for days, which
is this project's own evidence that dashboard-set variables persist across restarts and redeploys.
That is the fact that makes option 1 a one-time setup rather than a chore after every sleep.

### B. The options

Four, each genuinely supported by what exists today. **No ranking. No recommendation.**

---

#### Option 1 - Password sign-in with provisioning at startup

*This is what is already built and pushed. It is listed as an option, not as a fait accompli: it is
not switched on and can be left off.*

| | |
|---|---|
| **What changes** | `CRM_AUTH=1`; four values set once in the Render dashboard. Each person signs in as themselves |
| **What stays** | Everything else. The shared gate can stay or go, independently |
| **Security** | Individual identity, so the history names a person who proved who they were. Passwords are scrypt-hashed; sessions are HMAC-signed and carry the role inside the signature |
| **Persistence** | Solved. Accounts are recreated from configuration at every boot; the environment holds the passwords and survives restarts |
| **Render Free** | Works as it is. No disk, no paid plan, no extra service |
| **Ritvars must configure** | Four values in the dashboard, once: the session secret and three passwords. Nothing after that |
| **Can Aigars and Ieva test it?** | Yes, once they are told their passwords - and if the shared gate stays on, they need that one too, so two passwords each |
| **After restart / sleep / redeploy** | Accounts reappear automatically. Everything a tester *entered* is still lost, because the database is still `/tmp` - that is unchanged and separate |
| **Complexity** | Already written. 27 tests |
| **Risks** | If any of the four values is missing the service refuses to start. That is deliberate, and it is exactly what the failed deploy of `b8919c1` was |
| **Coexists with the shared gate?** | Yes. Both can run; the gate answers first |

---

#### Option 2 - Google sign-in

| | |
|---|---|
| **What changes** | An OAuth client is created and its redirect URI registered; three variables set. People sign in with their Novikontas Google account |
| **What stays** | The allowlist, the roles, the API door, the account list. Google proves identity; `crm_users` still decides what anybody may do |
| **Security** | Arguably the strongest: no password for this app exists to leak, and Workspace policy applies. The hosted-domain check on the verified token is what keeps every other Google account out |
| **Persistence** | Accounts still have to exist in `crm_users`, because signing in never creates one. So this does **not** remove the provisioning question - it removes only the password half |
| **Render Free** | Fine. No extra service |
| **Ritvars must configure** | An OAuth client, the redirect URI registered at Google **before** the values are set, and three variables. Plus a decision: reuse the Talent Acquisition client or make a separate one |
| **Can Aigars and Ieva test it?** | Yes, and with no password to be told - provided `edu@novikontas.org` can complete an OAuth sign-in at all, which is unknown and is Marina's to answer |
| **After restart / sleep / redeploy** | Same as option 1: the accounts still need provisioning, so it pairs with the bootstrap rather than replacing it |
| **Complexity** | Code is done. The work is entirely in Google Cloud Console |
| **Risks** | The redirect URI is compared character for character and fails on Google's own error page, leaving nothing on our side to debug. A shared mailbox may not be able to sign in |
| **Coexists with the shared gate?** | Yes |

---

#### Option 3 - Keep the shared password only

| | |
|---|---|
| **What changes** | Nothing. `CRM_AUTH` stays off |
| **What stays** | Everything, including the current live behaviour |
| **Security** | One password for everybody. No individual identity, so the history cannot name who did what - `x-acting-as` is a dropdown, not a check. Acceptable precisely because the copy holds demo data only, which the code enforces by refusing `DATASET=real` while `CRM_PUBLIC` is on |
| **Persistence** | No accounts to persist, so the problem does not arise |
| **Render Free** | Already working |
| **Ritvars must configure** | Nothing |
| **Can Aigars and Ieva test it?** | Yes, and this is the only option where they can test it right now, today, with what they already have |
| **After restart / sleep / redeploy** | Unaffected |
| **Complexity** | None |
| **Risks** | The sign-in work stays unexercised by real testers, so faults in it are found later rather than sooner. And "who did this" stays unanswerable |
| **Coexists with the shared gate?** | It *is* the shared gate |

---

#### Option 4 - Durable storage, then provision once

| | |
|---|---|
| **What changes** | The database stops being `/tmp`: a Render paid disk, or an external Postgres. Accounts are then created once and stay |
| **What stays** | All the auth code, unchanged. The bootstrap becomes unnecessary rather than wrong |
| **Security** | Same as whichever sign-in method is chosen. Orthogonal |
| **Persistence** | Solves the whole class: accounts **and** everything a tester enters survive |
| **Render Free** | **Does not fit.** Free has no disk. This needs a paid plan or an external database, and paying was ruled out on 25.09.2026 |
| **Ritvars must configure** | A paid plan, or Aigars's existing Supabase project - and then the Postgres port, roughly 200 call sites across 77 synchronous functions |
| **Can Aigars and Ieva test it?** | Yes, and it is the only option where their test data survives the night |
| **After restart / sleep / redeploy** | Everything survives |
| **Complexity** | By far the largest. This is backlog item C3 and it is a real project |
| **Risks** | Cost, or a database migration nobody has scheduled |
| **Coexists with the shared gate?** | Yes |

---

### C. Can the test deployment be self-sufficient?

**Yes, for accounts, and it already is - given a one-time setup.** Verified locally against Render's
exact configuration: a fresh empty database plus the four environment values produces
`accounts: 3 created`, all three sign in with the right roles, and a restart on the same database
produces `0 created, 3 already there`. Because Render's environment variables persist and only the
disk does not, that setup is done once rather than after every sleep.

**No, for everything else.** Applicant records, tasks and notes a tester enters still live in
`/tmp/crm.db` and still disappear. Nothing short of option 4 changes that, and the owner already
accepted it on 25.09.2026.

**What was deliberately not built:** nothing that stores a password anywhere but the host
environment - no seeded default password, no generated-and-printed password, no password in a file,
a fixture, a log or this document. Those would each make the copy "self-sufficient" by making it
unsafe.

### D. Google stays separate

The application-side code exists and is tested. The provider configuration does not exist. **Live
Google SSO does not work**, no credentials were created, and nothing in this sheet should be read as
saying otherwise. Option 2 is what it would take, not a description of something that runs.

---

## DECISION 26.09.2026: College CRM V1 does not go in either existing Supabase project

**DECIDED by Ritvars, 26.09.2026, after a read-only inspection of the whole Supabase organisation.**
Nothing was created, altered or deleted during that inspection.

### The decision

**College CRM V1 must NOT use `novikontas-customer-hub` or `novikontas-workforce-hub`.**

Both are **live production databases holding real personal data**. No CRM table, schema, function,
user, policy, index or any other object may be created in either project.

**`QR Sert` must not be repurposed either.**

### What the inspection found

One organisation, `RitvarsTeo`, **on the free plan**. Three projects:

| Project | Status | What is in it |
|---|---|---|
| `novikontas-customer-hub` | ACTIVE_HEALTHY, eu-central-1 | 16 tables. **2,235 real contacts**, 11,833 audit rows, 2,736 campaign recipient results, 14 sign-in accounts |
| `novikontas-workforce-hub` | ACTIVE_HEALTHY, eu-central-1 | 31 tables. **105 real candidates**, 812 append-only hiring events, 94 uploaded files, 835 distilled facts, 214 sign-in attempts |
| `QR Sert` | INACTIVE, eu-west-2 | unrelated |

Five independent reasons, any one of which is sufficient:

1. **Real personal data.** 2,235 clients and 105 job applicants, including the append-only evidence
   trail behind hiring decisions. The risk of sharing a database runs toward the hubs, not toward
   the prototype.
2. **The organisation is on the FREE plan.** Both active-project slots are used, and free-tier
   egress is shared org-wide - which has already taken both hubs down once, on 20.09.2026, with the
   Data API returning 402 while the projects read healthy.
3. **Concrete schema collisions.** `feedback` and `feedback_screenshots` already exist in **both**
   projects and in the CRM. Five more CRM tables carry names generic enough to be hazardous in a
   shared `public` schema: `people`, `tasks`, `events`, `documents`, `consents`.
4. **Using either would require the Postgres port first**, which is a much larger piece of work than
   the deployment problem it would be solving.
5. A prototype under daily change does not belong next to production.

### Backlog C4 is corrected

C4 recorded that *"Aigars already has a paid Supabase project."* **Nothing in the `RitvarsTeo`
organisation is paid** - the plan reads `free`, tier `tier_free`. Either that project sits in an
account this session cannot see, or the note was wrong. **C4 is now UNVERIFIED rather than SAID**,
and it matters, because the two-active-project limit follows from it.

### THE REMAINING INFRASTRUCTURE DECISION

> **Dedicated persistent Postgres environment for College CRM V1.**

**DECISION NEEDED.** Where a durable database for the CRM actually lives. Ruled out already: both
existing hub projects, and `QR Sert`. Not ruled out and not chosen: a new Supabase project on a paid
plan, some other managed Postgres, or a Render paid plan with a disk. This overlaps C3.

### Until then

**The CRM remains on SQLite.** `node:sqlite`, `CRM_DB`, exactly as it is today.

**The SQLite to Postgres migration must NOT begin.** It is roughly 200 call sites across 77
synchronous functions - `node:sqlite` is synchronous and every Postgres client is not - and starting
it before the destination is chosen would mean writing it against a database nobody has picked.

Everything downstream of that stays where it is: the ephemeral `/tmp` database on Render Free, the
account bootstrap that exists because of it, and the accepted loss of tester data on restart.

---

## SECURITY FINDING - Client Hub: anon-callable SECURITY DEFINER functions

**This is a Client Hub issue. It has nothing to do with College CRM**, and is recorded here only
because it was found while answering a College CRM question.

**NOT FIXED. Nothing in the Client Hub was modified.** Do not change it without instruction.

### What it is

`novikontas-customer-hub` exposes **six `SECURITY DEFINER` functions that the `anon` role can call**
through the public REST API at `/rest/v1/rpc/<name>`. A `SECURITY DEFINER` function runs with its
owner's rights, so it steps over the caller's permissions by design - which is fine when only the
application can call it, and not fine when `anon` can.

Confirmed examples:

- `hub_authorized_contacts()`
- `hub_approved_never_sent()`
- `hub_campaign_completion()`

The other three are `hub_clear_not_invited(...)`, `hub_import_batch_members(p_batch)` and
`rls_auto_enable()`. All six are also callable by the `authenticated` role.

Reported by Supabase's own database linter as
[`0028_anon_security_definer_function_executable`](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
level WARN, facing EXTERNAL, observed 26.09.2026.

### Why it matters

Every table in that project has RLS enabled with **no policies**, which is deny-by-default and
correct given the application uses the service key. But that also means **RLS is not load-bearing**:
nothing behind these functions is protected by a policy, so a `SECURITY DEFINER` function reachable
by `anon` is not held back by anything else. `hub_authorized_contacts()` names contacts.

### Why it looks like drift rather than design

**`novikontas-workforce-hub` has none.** The same linter reports zero anon-executable
`SECURITY DEFINER` functions there, on a larger schema. The two hubs were built by the same hands to
the same standards, so the difference is very unlikely to be intentional.

### What it is not

Not a College CRM issue, not a blocker for any College CRM work, and not evidence that anything has
been accessed. It is an exposure, not a breach: nothing here says anybody called them.

**Remediation is the Client Hub's own decision** - revoke `EXECUTE` from `anon`, switch the
functions to `SECURITY INVOKER`, or move them out of the exposed schema. Which of those is right
depends on whether each function is meant to be public at all, and that is a question for whoever
owns the Client Hub.

---

## 26.09.2026 - accessibility, the objective half (F2, PARTLY DONE)

Taken on because it is the one queue item that needs no infrastructure decision. **Only faults with
an unambiguous fix and an already-established intended behaviour were touched.** Nothing was
redesigned.

### Fixed

**1. The Channels rows could not be reached by keyboard at all.** All 14 rows were
`<tr style="cursor:pointer" onclick="...">` with no `tabindex`, so a keyboard user could not open a
channel's detail page by any means. **Mine, from 25.09.2026.**

Fixed by using the convention this application already has rather than inventing one: `class="row"`
plus `tabindex="0"`, which the existing global Enter/Space handler already answers. Proved with a
real key press, not a synthetic event: focus a row, press Enter, the address becomes
`#/channels/agent` and the detail page opens.

**2. Seven filter controls were announced as unlabelled.** The `field()` helper rendered its caption
in a `<span>` inside a `<div>` - a **visual** label that is not a **programmatic** one. Search,
Stage, Next step, Programme, Nationality, Owner and Came from were all captioned on screen and
anonymous to a screen reader.

Fixed by making the helper render a `<label>` instead of a `<div>`. Every usage wraps exactly one
control, checked, so the association is implicit and no `for=` is needed. **Nothing moves on
screen:** the `.flab` class and its styling are unchanged.

**3. The People sort headers took a tab stop and then did nothing.** `<th onclick="sortBy(...)">`
with no `tabindex`. Adding `tabindex` alone would have been the worse of the two states - focusable
but not activatable - so the global key handler was widened to cover a `TH` carrying an `onclick`,
alongside the rows it already handled.

### Measured after

Four screens, signed in, demo data:

| Screen | Not keyboard reachable | Unlabelled controls |
|---|---|---|
| Today | 0 | 0 |
| People | 0 | 0 |
| Channels | 0 | 0 |
| Inbox | 0 | 0 |

The login screen was already clean: no unlabelled control, no image without `alt`, no button without
a name, `lang="en"`, one `h1`, `main` and `nav` present.

### NOT done - F2 stays open

- **Focus order** has not been examined. Nothing here says the tab sequence is sensible, only that
  the controls are in it
- **Focus visibility** was not re-checked on the new stops. A programmatic `.focus()` does not
  trigger `:focus-visible`, so this needs real Tab presses to measure and was not done
- Screens beyond the four above
- Headings hierarchy, `aria-live` on the parts that update, reduced motion, zoom to 200 per cent
- **This was not run against a checker.** Four properties were measured by hand. A missing property
  is not a passing one

### And still open from the contrast run

**58 light-theme AA failures**, every one the same token `--t4` at 3.09:1 against a 4.5:1
requirement, used app-wide for secondary text. Untouched: changing it is a visual-design change to
the whole application. **DECISION NEEDED.**

---

## DECISION 27.09.2026: the Postgres destination is a dedicated Supabase project, hosted on Vercel

**DECIDED by Ritvars, 27.09.2026.** This closes "THE REMAINING INFRASTRUCTURE DECISION" of
26.09.2026 above, and C3.

    GitHub -> Vercel -> College CRM Node.js app -> pg -> DEDICATED Supabase project -> PostgreSQL

- **Dedicated** means a new Supabase project holding only the CRM. The 26.09.2026 rule stands:
  nothing goes in `novikontas-customer-hub`, `novikontas-workforce-hub` or `QR Sert`.
- **The driver is `pg`**, not `supabase-js`: the CRM is a Node backend talking SQL.
- **Phase 2 (SQLite to Postgres) is now unblocked in principle.** Phase 1 (`c382114`, async
  database access on SQLite) is committed, pushed to `v1-test` on 27.09.2026 and 511/511 green.

### What is true today, checked 27.09.2026, not assumed

| Piece | State |
|---|---|
| Dedicated Supabase project | **Does not exist.** The organisation is on the free plan and both active slots are the two hubs, so a third active project needs a paid plan. Only Ritvars can upgrade and create it |
| Vercel project | **Does not exist.** `vercel.json` only declares the PBX cron and headers |
| Current test deployment | Render Free, `academy-crm-test`, `v1-test`, SQLite in `/tmp`. `/healthz` answered 200 with 12 demo people |
| Hosting shape | `src/server.js` is one long-running HTTP server. Vercel runs functions, so the server must be wrapped or split to run there. **Not started** |

Until the Supabase project exists, the Render copy stays exactly as it is.

---

## 27.09.2026 - channels: what exists, checked against an outside architecture review

Ritvars brought in an architecture recommendation for the inbound channels. It was compared with the
code, not with our documents. **The shape it recommends is the shape already built**: one endpoint per
provider, one adapter per channel, one normalized event, one shared receive path, and the four Meta
channels as one integration. No separate gateway, no queue, deliberately. Full comparison:
[INBOUND_ARCHITECTURE.md](INBOUND_ARCHITECTURE.md) section 0. Per-channel reliability now lives in
`config/channels.json` (`reliability`, `reconciliation`) and renders in
[CHANNEL_READINESS.md](CHANNEL_READINESS.md), regenerated the same day. The regeneration also
corrected two rows the hand-maintained copy had let drift: Agent had read READY and is WAITING, and
the Google Form blocker was the old wording.

| # | What | Status |
|---|---|---|
| 125 | **The dedupe is not database-enforced.** `config/channels.json` said a unique index on `(channel, external_id)` exists. It does not; `receive()` looks, then inserts. On Postgres two concurrent retries can both insert. Fix: a partial unique index plus an insert that tolerates the conflict. The register text is corrected | **OPEN, part of Phase 2** |
| 126 | **Refused and failed deliveries leave no durable trace.** The inbound log is an in-memory list of 500 in `src/server.js`, lost on restart and per-instance on Vercel | **OPEN** |
| 127 | **Gmail stops at the fetch.** `runPoll()` returns messages; nothing passes them to `receive()`. Also a fixed 15-minute look-back and a 25-message cap, so a missed run or a busy window loses mail | **OPEN** |
| 128 | **Phone calls stop at `pbx_incoming_calls`.** Written through the Supabase REST API; nothing in `src/` reads the table, so no call reaches the Inbox | **OPEN** |
| 129 | **The PBX has no 5-minute trigger on Vercel Hobby.** Hobby rejects any cron more frequent than daily. The cron was removed from `vercel.json`; the route stays. Needs a free external trigger or a plan change before the channel goes live | **OPEN** |
| 130 | **Gmail: domain-wide delegation or OAuth on one dedicated mailbox.** Delegation can reach every mailbox with the scope; OAuth reaches one. The scope is already read-only | **DECISION NEEDED** - Ritvars with Marina |
| 131 | **No reconciliation on any webhook channel.** Mailchimp (re-read the audience), Google Form (re-read responses) and Meta (Graph API) are all possible; none is built | **OPEN** |
| 132 | Google Form: bind the script to the form's submit trigger, not the response sheet, unless the sheet is used | **SAID** - review suggestion |
| 133 | Agent: a referral token on our own website form instead of a partner-side webhook | **SAID** - review suggestion, worth choosing before anybody builds for a partner |

---

## DECISION 27.09.2026 (later): the temporary Postgres is Neon Free, not Supabase

**DECIDED by Ritvars, 27.09.2026.** Supersedes "a dedicated Supabase project" for NOW, not as the
destination.

**Why Supabase cannot be it today, from Supabase's own billing page:** a person may have two free
projects, and the limit counts across every organisation they own or administer. The two hubs use
both. An empty second organisation (Family) does not add a slot. No upgrade, no new account, and the
hubs and QR Sert are not touched.

**Options weighed, all at $0:**

| Option | Verdict |
|---|---|
| **Neon Free**, Frankfurt, added through the Vercel Marketplace | **CHOSEN.** Permanent free plan, no card, 0.5 GB per project, 100 compute-hours a month, sleeps after 5 minutes idle. Vercel's own Postgres was moved to Neon in December 2024. The Marketplace puts the connection into Vercel's settings itself, so nobody pastes a secret |
| Render Free Postgres | Rejected: expires 30 days after creation, deleted 14 days later, no backups, one per workspace |
| Keep Render + SQLite until the paid Supabase exists | Rejected: Vercel is impossible without a durable database, the Postgres code stays unproven, testers keep losing data |
| Other free providers (Aiven, Prisma Postgres, ...) | Not evaluated in depth, so not introduced |

**The destination is unchanged:** the colleague's paid Supabase, when College CRM is complete. The
code is plain Postgres through `pg`, so the move is a dump and restore of the `crm` schema and one new
`DATABASE_URL`. Nothing Neon-specific may be introduced.

**Fit work this creates, known now:**
- Neon's default connection is pooled in transaction mode, which does not keep the per-connection
  `search_path` the code sets. The code prefers `DATABASE_URL_UNPOOLED` when it is present.
- `lib/pbx.js` writes through the Supabase REST API. On Neon it must go through `pg` instead - which
  row 128 needs anyway.

**Who does what:** Ritvars creates the Neon database through the Vercel Marketplace (an account is
his to create). Everything after that is the session's: tests against Postgres, deploy, live check.
Render stays as it is until Vercel is verified live.
