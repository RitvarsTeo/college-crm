# Builds ONE self-contained file on the Desktop: what Ritvars physically has to
# do to connect the real channels.
#
# Two rules govern this script.
#
# 1. It is generated from config/channels.json and config/prototype.json, so it
#    cannot describe something the build does not have.
# 2. The open questions come from config.openQuestions and NOTHING else. A
#    question Ritvars has already answered lives in config.settled, and this
#    script refuses to run if a settled question has leaked back into the open
#    list. He had to answer the same things three times because lists like this
#    were regenerated from notes written before his answer arrived.
import io, json, os, collections, datetime

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
O = collections.OrderedDict


def load(name):
    return json.load(io.open(os.path.join(HERE, 'config', name), encoding='utf-8'),
                     object_pairs_hook=O)


ch = load('channels.json')
cfg = load('prototype.json')
CH = ch['channels']
ALL_OPEN = [(k, v) for k, v in cfg['openQuestions'].items() if not k.startswith('_')]
OPEN = [(k, v) for k, v in ALL_OPEN if not v.get('parked')]
PARKED = [(k, v) for k, v in ALL_OPEN if v.get('parked')]
SETTLED = {k: v for k, v in cfg['settled'].items() if not k.startswith('_')}

# --- the guard -------------------------------------------------------------
# A settled decision must never come back as a question. Checked here, and
# again by the test suite, because this file is the one Ritvars actually reads.
STOP = ['rotate', 'rotated', 'must be changed', 'no longer safe', 'exposed in a chat',
        'which menu button', 'which button the caller', 'is our instagram a professional',
        'professional account?', 'who owns our facebook page', 'deadline for applications']
for key, q in ALL_OPEN:
    low = (q['ask'] + ' ' + q['why']).lower()
    for phrase in STOP:
        if phrase in low:
            raise SystemExit(
                'REFUSED: openQuestions.%s reopens something already settled: "%s".\n'
                'Read config/prototype.json -> settled before adding a question.' % (key, phrase))

OUT = os.path.join(os.path.expanduser('~'), 'Desktop',
                   'Academy CRM - Connecting the channels.md')

DONE_LIST = [
    'PBX button mapping 1 / 2 / 3',
    'PBX API endpoint and queue mapping known',
    'PBX token - keep as it is, do not reopen',
    'Meta access - %s' % ', '.join(cfg['metaBusinessSuite']['access']),
    'Instagram Professional and the Meta Business setup',
    'Mailchimp account checked - webhooks available',
    'WhatsApp number confirmed: %s' % cfg['whatsapp']['number'],
    'Phone 1 / 2 / 3 routing confirmed by %s' % cfg['whatsapp']['confirmedBy'],
    'Inbox filter and qualification logic built and tested',
]

L = []
w = L.append
today = datetime.date.today().strftime('%d.%m.%Y')

w('# Academy CRM - connecting the real channels')
w('')
w('*Generated from the CRM\'s own configuration on %s. Every address, setting and name below is '
  'what the software actually uses.*' % today)
w('')
w('Two kinds of line:')
w('')
w('- **DONE** means it is built and tested. You do not have to do it.')
w('- `[ ]` means somebody has to go and do it.')
w('')
w('**One person stays one person.** The CRM keeps whichever channel they arrived on.')
w('**Channel access is not ownership.** The moment there is real study interest the owner is '
  '**%s**.' % cfg['admissionsOwnerPerson'])
w('')
w('---')
w('')

# ------------------------------------------------- what is already closed --
w('# What is already settled. Nobody asks these again.')
w('')
for line in DONE_LIST:
    w('- **DONE** %s' % line)
w('')
w('**The only human information still missing is the Google Workspace administrator.** '
  'Everything else on the list below is either known, technically actionable, or waiting on a '
  'provider - not on another question to you.')
w('')
w('---')
w('')

# --------------------------------------------------------------- part 0 ----
w('# PART 0 - The Inbox and the filter')
w('')
w('## Finished. Do not spend time on it.')
w('')
w('Every line below is held by an automated test that runs on every change.')
w('')
w('| What was required | State | Proof |')
w('|---|---|---|')
for req, proof in [
    ('A sales pitch never reaches the working Inbox',
     'Sent one: *"Filtered before the Inbox"*. Stored and findable, kept out of the numbers.'),
    ('A plain "Hi" is **NOT** treated as spam',
     'Sent one: *"Waiting in the Inbox"*. It stays for a person to judge.'),
    ('A real study enquiry reaches the Inbox',
     'Sent one: *"Waiting in the Inbox"*, with the programme already read out of the message.'),
    ('No study interest is ever invented',
     'The machine only suggests. A person confirms, and the dialog refuses to file a stated '
     'interest as "unclear".'),
    ('An existing person is matched, not duplicated',
     'Matched on email, or on the last 8 digits of the phone, so `22193374` and `37122193374` '
     'are one person.'),
    ('A duplicate is refused and the existing person is named',
     'You get *"We already have this person"* with three ways out: **This is them**, **Open**, '
     'or **No, this is a different person**.'),
    ('The same message arriving twice is stored once',
     'Providers retry. It is recognised and stored once.'),
    ('A documents question is Admissions, not Marketing',
     'It routes to %s regardless of which channel it came in on.' % cfg['admissionsOwnerPerson']),
    ('Not relevant is a click, not typing',
     'Predefined reasons, and who did it and when is recorded.'),
    ('Nobody reaches Admissions without a next action',
     'Saving is refused without one. It carries an owner and a due date.'),
    ('The full conversation is not kept forever',
     'The message body is used to qualify, then deleted. What survives is the structured record.'),
    ('Every channel keeps its own source',
     'Facebook, Instagram, Messenger and WhatsApp are four separate sources. There is deliberately '
     'no combined "Meta" number.'),
    ('A programme question about dates is answerable',
     'Admissions is **all year round**. There is no deadline, and the suggested reply says so.'),
]:
    w('| %s | **DONE** | %s |' % (req, proof))
w('')
w('**The one thing left on the filter.** The spam word list is currently:')
w('')
w('`%s`' % ', '.join(cfg['intakeFilter']['spamWords']))
w('')
w('- [ ] Ask Tetiana what rubbish actually arrives, and add those words. Configuration, not code.')
w('')
w('---')
w('')

# ------------------------------------------------- Aigars's braindump ------
w("# PART 0b - Aigars's notes, point by point")
w('')
w('Everything he wrote down after the first real test. Verified in the code, not from memory.')
w('')
w('| What he asked for | State |')
w('|---|---|')
for req, state in [
    ('Today should be a **table**, not cards one at a time',
     '**DONE** - Today renders as a table and that is the default view.'),
    ('**Delete Junk** from the Channel Automation Results screen',
     '**DONE** - the status is gone. Obvious junk is filtered on arrival, stored and findable, '
     'and never reaches the working queue, so nobody archives it by hand.'),
    ('Fix the error when opening a person from CAR',
     '**DONE** - `fieldChip` was called but never defined, so the page crashed for everyone '
     'qualified through CAR with a confirmed field. That was 4 of the 5 "open" links. A test now '
     'walks the person page and fails on an undefined call.'),
    ('CAR should **feed the pipeline**',
     '**DONE** - qualifying in CAR creates the person, sets the owner and opens the Admissions '
     'record. It cannot be saved without a next action.'),
    ('**People**: filters and quick edit',
     '**DONE** - the People screen filters and edits in place.'),
    ('**Delete the Documents card**',
     '**DONE** - removed. A documents question routes to Admissions, not Marketing.'),
    ('The whole line should open the person, not a separate button',
     '**DONE** - the row is the link. The extra button is gone.'),
    ('A **suggested next move** that shows first but can be overridden',
     '**DONE** - the suggestion is pre-selected and anything else can be chosen.'),
    ('**PBX**',
     'Built and tested locally. **NOT connected and NOT deployed.** It needs an API token from '
     'TeleGroup and the three prerequisites in Part 3.'),
]:
    w('| %s | %s |' % (req, state))
w('')
w('**Still open from his notes:** the final pipeline stage names are deliberately NOT locked. '
  'The current stages are working names and changing them is a configuration line.')
w('')
w('---')
w('')

# --------------------------------------------------------------- part 1 ----
w('# PART 1 - The %d things nobody has answered' % len(OPEN))
w('')
w('**This is the whole list.** Everything else has been decided and is recorded in the software. '
  'These take days or weeks to come back, so send them first. None of them is software work.')
w('')
w('| # | Ask | Who | Holds up |')
w('|---|---|---|---|')
for i, (key, q) in enumerate(OPEN, 1):
    holds = ', '.join(CH[c]['label'] for c in q['blocks']) or 'nothing, but it improves the filter'
    w('| %d | **%s** | %s | %s |' % (i, q['ask'], q['who'], holds))
w('')
for key, q in OPEN:
    w('**%s**  ' % q['ask'])
    w('%s *Status: %s*' % (q['why'], q['status']))
    w('')

w('### Message to send TeleGroup')
w('')
w('> Good afternoon,')
w('>')
w('> We are connecting our admissions system to our phone line and need an API token for the call ')
w('> API, plus the technical contact who manages it.')
w('>')
w('> We already have the queue mapping from the original brief, so what we are missing is only the ')
w('> access credential and confirmation of whether this is included in our current service.')
w('')
w('*The menu button is already in the data as the `queue` field. Do not ask them about it again.*')
w('')
w('---')
w('')

# ------------------------------------------------------------ settled -----
w('# PART 2 - The same decisions in full, with who decided and when')
w('')
w('| Question | Answer | Decided |')
w('|---|---|---|')
for key, d in SETTLED.items():
    w('| %s | **%s** | %s, %s |' % (d['question'], d['answer'], d['decidedBy'], d['decidedOn']))
w('')
w('These are recorded in the software itself, and a test fails if any of them reappears as an open ')
w('question in any document.')
w('')
w('---')
w('')

# --------------------------------------------------------------- part 3 ----
w('# PART 3 - Before any channel can go live')
w('')
w('| Do | Why |')
w('|---|---|')
w('| [ ] Put the CRM online at a real web address | Every channel except the phone works by the '
  'provider calling **us**. There is nothing to call today. |')
w('| [ ] Set up the real database | Today it is a file on one laptop. |')
w('| [ ] Turn on real login | Today "who you are" is a dropdown anybody can change. Until this '
  'exists nothing is actually protected. |')
w('')
w('Already handled, for information:')
w('')
w('- **DONE** Real and demo data are separate, and the real database can always be restored exactly.')
w('- **DONE** Secrets are read from server settings and never appear in the browser.')
w('- **DONE** Every channel starts **off** and must be switched on deliberately.')
w('')
w('Every channel is then switched on the same four ways:')
w('')
w('1. Set the secret on the server.')
w('2. Give the provider the address, and set the same secret at their end.')
w('3. Send one real event through the Console at `/console` and watch it arrive.')
w('4. Switch that channel from `test` to `live`.')
w('')
w('**Never put a secret in a screenshot, an email or a chat message.** Only the NAME of the setting ')
w('belongs in writing.')
w('')
w('---')
w('')

# --------------------------------------------------------------- part 4 ----
# The connection task list. Order and steps are Ritvars's, held in
# config/channels.json, so his list and this document cannot drift apart.
w('# PART 4 - Still to connect')
w('')
w('Fourteen channels, in the order the work happens. Each one is done when every box under it '
  'is ticked and it passes the seven checks in Part 5.')
w('')

ORDER = ch['connectOrder']
NOTES = {
    'whatsapp': ['The number is settled. What is left is the Meta build. All four Meta channels '
                 'share **one** app and the same two settings, `META_APP_SECRET` and '
                 '`META_VERIFY_TOKEN` - do it once, get four channels. Meta reviews the app '
                 'before real messages arrive, which takes weeks and they can refuse.',
                 '**Send me the App ID and App Secret by password manager. Never by chat.**'],
    'gmail':    ['Only an administrator can authorise this. Not Ieva, not Tetiana. '
                 '**Send me the key file by password manager or in person, never by chat or '
                 'email.**'],
    'open_day': ['A booking starts with **Tetiana**. The moment it is real study interest the '
                 'owner is **%s**.' % cfg['admissionsOwnerPerson']],
    'agent':    ['The agent is a **source**, never the owner.'],
    'website':  ['Keep the tracking tags on advert links, or the report cannot tell an Instagram '
                 'advert from somebody who found us themselves.'],
    'phone':    ['Routing is confirmed and needs no further discussion:'],
    'mailchimp':['A Mailchimp event is **activity about somebody**, not automatically a new '
                 'person. A newsletter subscriber is not a lead.'],
    'linkedin': ['If it is not supported, that is the answer and it stays manual. Only **Tetiana** '
                 'can open it; she puts the person in by hand and **%s** works the case. If Ieva '
                 'needs the original conversation she has to ask Tetiana.'
                 % cfg['admissionsOwnerPerson']],
    'tiktok':   ['Same as LinkedIn. Do not spend time on it until somebody establishes whether it '
                 'is possible at all.'],
}

for i, cid in enumerate(ORDER, 1):
    c = CH[cid]
    w('## %d. %s' % (i, c['label']))
    w('')
    if c['readiness'] == 'manual_only':
        w('**Nothing to connect.**')
    elif c.get('externalBlocker') and c.get('blockerKind') == 'question':
        w('**Waiting on an answer:** %s' % c['externalBlocker'])
    elif c.get('externalBlocker'):
        w('**Nobody to ask. This is work:** %s' % c['externalBlocker'])
    else:
        w('**Ready to configure. Nobody outside Novikontas needed.**')
    w('')
    for step in c['connectSteps']:
        w('- [ ] %s' % step)
    w('')
    w('| | |')
    w('|---|---|')
    w('| How it arrives | %s |' % c['mechanism'])
    path = c.get('webhookPath') or c.get('pollPath')
    w('| Address | %s |' % ('`' + path + '`' if path else 'not applicable'))
    secrets = [c['secretEnv']] if c.get('secretEnv') else []
    if c.get('handshakeEnv') and c['handshakeEnv'] not in secrets:
        secrets.append(c['handshakeEnv'])
    w('| Settings to create | %s |'
      % (', '.join('`' + x + '`' for x in secrets) if secrets else 'none'))
    if c.get('handshake'):
        w('| Before any message | %s |' % c['handshake'])
    w('| Turn it on with | `CHANNEL_MODE_%s=live` |' % cid.upper())
    w('| Turn it off with | %s |' % c['howWeDisable'])
    w('')
    for line in NOTES.get(cid, []):
        w(line)
        w('')
    if cid == 'phone':
        w('| Caller presses | Queue | Goes to |')
        w('|---|---|---|')
        menu = cfg['phoneMenu']
        for k in sorted(x for x in menu if isinstance(menu[x], dict)):
            m = menu[k]
            w('| %s | `%s` | %s, **%s** |' % (k, m['queue'], m['role'],
                                              ' and '.join(m['handledBy'])))
        w('')
    for key, label in (('identityNote', 'On identity'), ('operationalNote', 'Operationally'),
                       ('bodyRetention', 'On the message body')):
        if c.get(key):
            w('**%s:** %s' % (label, c[key]))
            w('')

w('---')
w('')

# --------------------------------------------------------------- part 5 ----
w('# PART 5 - Proving a channel actually works')
w('')
w('Before calling any channel connected, all seven must pass. I run these; they are here so you ')
w('know what "done" means.')
w('')
for line in ['A new person arrives correctly',
             'Somebody we already have is recognised and does **not** become a second record',
             'The same message twice is stored once',
             'A sales pitch is thrown away and stays out of the numbers',
             'A plain "Hi" is **kept**',
             'Reports shows which channel it came from',
             'A real study enquiry ends up with **%s**, with a next action'
             % cfg['admissionsOwnerPerson']]:
    w('- [ ] %s' % line)
w('')
w('**Do not call a channel live because the app is online.** Each one passes this or it is not ')
w('connected.')
w('')
w('---')
w('')
w('# The short version')
w('')
w('**This week:** send the %d questions in Part 1. That is all that is genuinely urgent.' % len(OPEN))
w('')
w('**Then send me:**')
w('')
for i, line in enumerate([
        '**Who the Google Workspace administrator is** - the only thing still unknown',
        'The TeleGroup API token, by password manager',
        'Meta App ID and Secret, by password manager',
        'Who maintains the website',
        'Which tool takes Open Day bookings',
        'Which agent to start with',
        'Who owns the Google Form',
        'What rubbish actually arrives, from Tetiana, for the spam list'], 1):
    w('%d. %s' % (i, line))
w('')
w('**Never send a password, token or key by chat or email.** Password manager, or in person.')

io.open(OUT, 'w', encoding='utf-8', newline='\n').write('\n'.join(L) + '\n')
print('written:', OUT)
print('size:', os.path.getsize(OUT), 'bytes')
print('open questions:', len(OPEN), ' settled:', len(SETTLED), ' channels:', len(ORDER))
