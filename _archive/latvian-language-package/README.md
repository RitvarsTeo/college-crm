# The Latvian language package - archived 23.09.2026

Ritvars decided on 23.09.2026 that the interface is **English only**. Nothing was deleted.

## What is here

| File | What it is |
|---|---|
| `i18n.json` | The dictionary: 274 Latvian/English pairs and 16 patterns, plus its own notes on what was deliberately left untranslated. |
| `*.lv` | A copy of every file as it stood the moment before the English pass: `app.html`, `server.js`, `simulator.js`, `seed.js`, `real.js`, `prototype.json`, `simulator.test.js`. |

## What was removed from the live prototype

- `config/i18n.json`
- the `GET /api/i18n` endpoint in `src/server.js`
- the runtime translator in `src/app.html`: `buildDict`, `tr`, `applyLang`, `setLang`, `watchLang`
  and the MutationObserver that swapped words after every render
- the `Valoda / Language` selector in the sidebar
- the `crmLang` value in the browser's local storage is simply no longer read

## To bring it back

The dictionary is a plain list of pairs, so the machine that applied it in reverse is trivial to
write again. The `.lv` copies are a faster route: they are the real files, not a reconstruction.
Note that they predate the history and edit work of 23.09.2026, so a straight restore would lose
backlog items 9 to 12.
