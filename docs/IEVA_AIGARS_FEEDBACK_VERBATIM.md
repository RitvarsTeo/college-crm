# Ieva's and Aigars's own words, 29.09 - 01.10.2026

**Why this file exists.** Until 02.10 this project had audits *about* Ieva's feedback and not one
line *of* it. The Journey stage names sat open for days as "ask Ieva", while her actual process was
already written down in a chat nobody had copied here. Her words are now the record; the summaries
elsewhere are derived from this page, never the other way round.

Latvian as sent, with a plain English reading beside it. Nothing paraphrased into a requirement
without her sentence next to it.

---

## Ieva, Tuesday 29.09, 11:26 - the first look

> Hey, es paskatījos uzņemšanas leadu dashboard, princips man ir skaidrs, atradu, kur var
> reschedulot noteiktas darbības, pievienot statusus, notes, kontaktinformāciju, ļoti labi, ka
> **home page uzreiz ir paredzēta vieta aktuālajai statistikai**. Tas, ko es pagaidām neatradu -
> kā var pievienot jaunu leadu?

"I looked at the admissions lead dashboard, the principle is clear to me, I found where you can
reschedule certain actions, add statuses, notes, contact information. **Very good that the home page
has a place for current statistics straight away.** What I could not find yet is how to add a new
lead."

**Two facts in one message.** The home page carrying statistics is hers, praised unprompted, before
anybody designed an A/B about it. And Add lead was missing.

## Ieva, 29.09, 11:28 - the order is right, the row is wrong

> Arī ļoti labi, ka **leadu dalījums ir sakārtots secīgi**, kur uzreiz parādās overdue un due today.
> Vienīgais par notes un kontaktinformāciju - vai tās sadaļas būtu iespējams uzreiz pielikt klāt
> blakus, nevērot vaļā paša leada profilu?

"Also very good that **the leads are arranged in order**, where overdue and due today show up at
once. The only thing about notes and contact information: could those be put right alongside,
without opening the lead's own profile?"

> Te it kā ir daudz vietas, tur pagaidām pa visu rindu ir get in touch, bet tur man būtu svarīgāk
> **redzēt kontaktinformāciju un notes, lai es uzreiz jau saprotu, kas bija runāts**, un piezvanīt
> vai uzrakstīt

"There seems to be a lot of room; right now 'get in touch' runs across the whole row, but what
matters more to me is **seeing the contact information and the notes, so I understand at once what
was discussed**, and then call or write."

**The sequential order is hers too.** "Sakārtots secīgi" is the journey, named by the person who
works it, and she liked it on day one.

## Ieva, Wednesday 30.09, 09:59 - both fixed, and she starts using it

> liels paldies - tagad redzu opciju pievienot jaunu leadu un arī kontaktinformācija un notes ir
> redzami. **Es sākšu tur kārtot cilvēkus, pievienot, došu updates**, ja kaut kas vēl ienāks prātā

"Thanks, now I see the option to add a new lead and the contact information and notes are visible.
**I will start organising people there, adding them, and I will send updates** if anything else
comes to mind."

---

## Ieva, 30.09, 10:14 - THE OUTCOME MODEL, in her own process

This is the message the "Journey stages / outcomes" decision had been waiting for.

> Ā, tas par ko jau iedomājos - tagad redzu, ka ir iespēja likt next steps, bet varētu izdarīt tā,
> ka **pie not proceeding katram ir iespēja pievienot, piemēram, tag - cold, reject?**
> Jo, piemēram, **cold es vairs nelieku nākamo aktivitāti, bet viņi nav arī pavisam reject un kādā
> no cold reizēm kļūst par aktīvu leadu.** Reizēm arī **reject ir kā pagaidu reject - dotajā brīdī
> vēl nevar (piemēram, kāds vēl tikai vidusskolā), bet kontaktu tāpat saglabāju.**
> Vismaz es līdz šim tā izdalīju, arī **priekš statistikas vieglāk ir izdalīt** un var padomāt par
> kādām **papildus mārketinga aktivitātēm konkrēti tiem, kas ir cold.**

"Something I had been thinking about: I see there is now the option to set next steps, but could it
be done so that **under Not proceeding each one can have a tag, for example cold or reject?**
Because with **cold** I no longer set a next activity, **but they are not fully rejected either, and
sometimes a cold one becomes an active lead again.** And sometimes **a reject is a temporary reject:
right now they cannot (for example somebody still at secondary school), but I keep the contact
anyway.** That is how I have divided them so far. **It is also easier for statistics**, and you can
think about **extra marketing specifically for the cold ones.**"

**What this establishes, from the person who does the work:**

| Her distinction | What it means operationally |
|---|---|
| **cold** | No next activity, deliberately. **Not** rejected. Can come back and become active |
| **reject** | Often **temporary**: cannot right now, for a reason she names (still at school). The contact is kept |
| Why she wants it | Statistics, and **marketing to the cold ones specifically** |

So "Not proceeding" is not one outcome. It is a bucket holding at least two states that behave
differently, and one of them is expected to return. A person who is cold is dormant, not finished.

## Ieva, 30.09, 10:16 and 10:23 - two questions

> Pie new leads redzu arī, parādās neatbildēti zvani. No kurienes tie nāk?

"In new leads I also see unanswered calls appearing. Where do those come from?"

> Vēl jautājums - ir viens leads, kurš jau ir admitted. Tā arī saminēju u... *(cut off in the
> screenshot; the rest of this message is NOT known and must not be guessed)*

**[VERIFY: the rest of Ieva's 10:23 message]**

**Ritvars answered the first one** (01.10): the call-filtering logic is not finished and that was a
test of whether the channel is wired to the app, so unanswered calls currently appear in New Leads.
His intent: an AI bot that reads everything inbound, filters what is relevant for admissions, and
only then puts genuinely sensible leads in front of a human. That is the PBX filter plus Stage 2 AI
Review, and it is why Ieva saw them.

---

## Aigars, 30.09, 10:01

> dod update kad ir pievienoti īstie kanāli

"Give an update when the real channels are connected."

> arī kkādu lūdzu overview cik tālu mēs esam no V1 īstā deploymenta un toola lietošanas sākšanas

"Also please an overview of how far we are from the real V1 deployment and from starting to use the
tool."

> kad tas būs gatavs tad pieslēgsim domainu

"When that is ready we will connect the domain."

---

## Ritvars's channel status to the team, 01.10

Quoted because it is the most recent first-hand statement of channel state, and it disagrees with
this repository in one place.

> šodien fokuss ir uz kanāliem. **PBX ir live.** Tilda tagad konektēju; Meta piekļuve no Oksanas vēl
> waiting - viņa teica, ka šonedēļ būs. Intake pusē Gmail lasīšana un ienākošo pieteikumu apstrāde
> ir uztaisīta. Lai to pieslēgtu pie edu@novikontas.org un training@novikontas.org, vakar izgāju
> cauri Google Workspace Domain-Wide Delegation: Marina mēģināja atvērt Security -> Access and data
> control -> API controls -> Manage Domain Wide Delegation un pievienot mūsu Intake Gmail read-only
> scope, bet **viņas accountam šī API/DWD sadaļa nav pieejama**, tāpēc izskatās, ka šim variantam
> vajag **Super Admin tiesības**. Es viņai arī iedevu tiešo DWD linku, bet tā toč pārliecinās, ka
> nevar. **Otrs variants - izmantot pašas Marinas Gmail account autorizāciju**, ko tad mūsu
> uzbūvētajam Gmail connectoram, jāpārbauda vēl. Ja tas nestrādās, tad būs skaidrs, ka jāiet cauri
> Workspace Super Admin/DWD.
> Tā, tad šodien jātiek galā ar Teti LinkedIn/TikTok piekļuvēm.
> Paralēli šobrīd salieku precīzu V1 statusu pret production, kas jau ir live, kas ir commitots, bet
> vēl nav deployots, kas vēl ir backlogā un kādi ir atlikušie blockeri, bottlenecki.
> Kad kanāli ir pieslēgti un V1 statuss ir noslēgts, iedošu tev konkrētu "ready for real use" punktu.
> Tad varam migrēt un likt virsū domēnu.

**CONTRADICTION TO RESOLVE.** Ritvars told the team **"PBX ir live"** on 01.10. This repository's
Pin says `inbound` holds 15 rows, all `source=simulated`, **0 from a real provider**, and the 02.10
reconciliation records Phone as *production configured, not live verified*. Both cannot be current.

**[VERIFY: whether a real PBX call has reached production `inbound` with `source='provider'`]** -
one authenticated read settles it. Until then this repository must not claim Phone is live, and must
not claim Ritvars is wrong either.

**Gmail is further on than the config suggests:** option B (Marina's own account authorisation) is
the live fallback being tested *because* Domain-Wide Delegation needs Super Admin, which Marina does
not have. That is a sharper blocker than "twenty minutes of Marina's time".
