import io, json, collections

cfg = json.loads(io.open('config/channels.json', encoding='utf-8').read(),
                 object_pairs_hook=collections.OrderedDict)
ch = cfg['channels']

READY_LABEL = {
    'ready_for_configuration': 'READY FOR CONFIGURATION',
    'waiting_for_external_access': 'WAITING FOR EXTERNAL ACCESS',
    'manual_only': 'MANUAL ONLY, BY DESIGN',
    'capability_unconfirmed': 'CAPABILITY UNCONFIRMED',
    'not_prepared': 'NOT PREPARED',
}

out = []
w = out.append
w('# Channel readiness')
w('')
w('**Generated from `config/channels.json` by `scripts/gen_readiness.py`. Do not hand-edit:**')
w('change the config and regenerate, or the register and this document drift apart.')
w('')
w('Nothing in this repository is connected to anything. No channel has credentials, no webhook has')
w('been registered with any provider, and nothing is deployed. What exists is the adapter, the')
w('contract, the security interface and the tests. Switching a channel on later should be:')
w('')
w('1. configure credentials,')
w('2. configure the webhook or endpoint at the provider,')
w('3. verify,')
w('4. switch the channel from test to live.')
w('')
w('It should not require redesigning the CRM. That is the whole purpose of this file.')
w('')
w('## Where every channel stands')
w('')
w('| Channel | Readiness | How it arrives | Blocked on |')
w('|---|---|---|---|')
for cid, c in ch.items():
    blocker = c.get('externalBlocker') or 'nothing - our side is finished'
    w('| **%s** | %s | %s | %s |' % (
        c['label'], READY_LABEL.get(c['readiness'], c['readiness']),
        c['direction'].replace('_', ' '), blocker))
w('')
w('## What Novikontas has to do, by channel')
w('')
w('These are the actions nobody in this repository can perform.')
w('')
todo = [(cid, c) for cid, c in ch.items()
        if c.get('externalActionRequired') and c['externalActionRequired'] != 'None.']
for cid, c in todo:
    w('- **%s** - %s' % (c['label'], c['externalActionRequired']))
w('')

w('---')
w('')
for cid, c in ch.items():
    w('## %s' % c['label'])
    w('')
    w('| | |')
    w('|---|---|')
    w('| Readiness | **%s** |' % READY_LABEL.get(c['readiness'], c['readiness']))
    w('| Mechanism | %s |' % c['mechanism'])
    w('| Direction | %s |' % c['direction'].replace('_', ' '))
    w('| Security | %s |' % c['auth'].replace('_', ' '))
    w('| Endpoint | %s |' % ('`%s`' % c['webhookPath'] if c.get('webhookPath')
                             else ('`%s`' % c['pollPath'] if c.get('pollPath') else 'not applicable')))
    w('| External id | %s |' % c['externalIdSource'])
    w('| Timestamp | %s |' % c['timestampSource'])
    w('| Deduplicated on | %s |' % c['dedupKey'])
    w('| Rate limits | %s |' % c.get('rateLimit', 'UNKNOWN'))
    w('')
    w('**What we control:** %s' % ('; '.join(c['weControl']) if c['weControl'] else 'nothing'))
    w('')
    w('**What the provider controls:** %s' % ('; '.join(c['providerControls'])))
    w('')
    creds = c.get('credentialsNeeded') or []
    w('**Credentials required:** %s' % ('; '.join(creds) if creds else 'none'))
    w('')
    if c.get('externalBlocker'):
        w('**EXTERNAL BLOCKER:** %s' % c['externalBlocker'])
        w('')
    if c.get('externalActionRequired') and c['externalActionRequired'] != 'None.':
        w('**Somebody outside has to:** %s' % c['externalActionRequired'])
        w('')
    w('**How we test:** %s' % c['howWeTest'])
    w('')
    w('**How we go live:** %s' % c['howWeGoLive'])
    w('')
    w('**How we turn it off:** %s' % c['howWeDisable'])
    w('')
    for key, label in [('identityNote', 'On identity'), ('operationalNote', 'Operationally'),
                       ('bodyRetention', 'On the message body'), ('_note', 'Note'), ('_gap', 'Known gap')]:
        if c.get(key):
            w('**%s:** %s' % (label, c[key]))
            w('')
    w('')

io.open('docs/CHANNEL_READINESS.md', 'w', encoding='utf-8', newline='').write('\n'.join(out))
print('docs/CHANNEL_READINESS.md written,', len(out), 'lines, from', len(ch), 'channels')
