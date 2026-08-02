# CLAUDE.md

Working conventions for this repository. Read `README.md` for what the project is and
`docs/BEHAVIOURS.md` for the specification that `src/behaviours.js` implements.

## The rule that governs every change

A word's behaviour must be derivable from its definition. Before implementing or
accepting a behaviour, apply the substitution test: if the behaviour would work just
as well attached to a different headword, it is decoration and it does not ship.
Report the failure rather than weakening the behaviour into something generic.

## Data

`data/words.yml` is the single source of truth for content. Mechanics live in
`src/behaviours.js`, referenced by the `behaviour` key. Never inline a gloss, etymon
or date into a behaviour implementation.

Record schema, all fields required except where noted:

| field | notes |
|---|---|
| `id` | lowercase, ASCII, hyphenated; the key used everywhere else |
| `headword` | as it should display, diacritics intact |
| `display` | optional; overrides `headword` where the source rendered it oddly |
| `gloss` | one sentence, no hedging |
| `origin` | `latin` `greek` `french` `sanskrit` `arabic` `english` `coined` — drives one layout axis |
| `attested` | year or century; `coined` for neologisms. Currently unverified |
| `tags` | semantic clusters; drives the other layout axis |
| `behaviour` | id in `src/behaviours.js`; `null` is not permitted |
| `source.book` / `source.page` | provenance; `TODO` until back-filled |
| `note` | optional; anything odd about how the word was encountered |

Adding a word means: append the record, add the behaviour stub, write its section in
`docs/BEHAVIOURS.md`, and define its `plain` rendering. A word without a `plain`
rendering is unreachable for a substantial share of readers and is not finished.

## Accessibility is a hard constraint, not a pass at the end

Several behaviours are hostile to reading by design. `expunge` deletes content.
`obscurantism` resists legibility. `taedium vitae` runs at punishing length. This is
the point of the site and it is also a genuine barrier, so the plain view is a
first-class deliverable rather than a fallback:

- `?plain` renders the entire philavery as a static definition list, alphabetised,
  with every gloss, etymon, date and source visible and no behaviour attached.
- `prefers-reduced-motion: reduce` routes to plain automatically, and the field view
  remains reachable by explicit link.
- The field is keyboard-traversable: arrow keys move the walker between adjacent
  nodes, `Enter` activates, `Escape` returns to the overview.
- Every behaviour implements `plain(ctx)`. `expunge` in plain view is struck through,
  not removed.

## Style

Vanilla JS, ES modules, no framework and no build step — this has to be servable from
GitHub Pages as static files. `js-yaml` from a CDN, or a small build step that emits
`words.json`, whichever ends up less trouble; do not hand-maintain a JSON copy.

Visual tokens come from the Tunnel skill. Do not define a new palette. The
cartography-and-phase-space idiom is the direction, and the walker's cross-hair is
Tunnel's, not a new mark. `variegated` holds the sole licence for colour on the site
and that constraint is what makes the entry work — do not spend colour elsewhere.

Prose in glosses and documentation: plain sentences, no exclamation, no addressing the
reader as "you" outside this file and the README.

## What not to do

Do not add a search box. Searching the field defeats the traversal, and the plain view
is already `Ctrl-F`-able.

Do not alphabetise the field view.

Do not add words to fill the field out. Thirty-eight is what was collected; the count
is data.
