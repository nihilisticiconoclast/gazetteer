# Gazetteer

A philavery of thirty-eight words, laid out as a field rather than a list, in which
every entry behaves according to its own meaning.

A gazetteer is the index to a map: the alphabetical list that only makes sense
alongside the terrain it refers to. That is the shape of this site. The words are
the index; the field is the terrain; the walk between them is the reading.

## The invariant

**A word's behaviour is derived from its definition, and the definition is what you
get after the behaviour has already told you.**

This is the single rule the repository exists to enforce. No entry gets an animation
because animation is nice. `phlegmatic` does nothing at all, and that is its
implementation, not an omission. If a proposed behaviour would work equally well
attached to a different word, it is decoration and it does not ship.

## How it works

Words are nodes in a two-dimensional field, positioned by a force layout over two
axes: language of origin, and semantic cluster. A walker moves between adjacent
nodes on a slow tick. Arriving at a node triggers that word's behaviour; the gloss,
etymon and provenance are revealed after it resolves. You can drive the walker
yourself or release it to drift.

Three consequences follow, and they are the reason for the structure rather than
decorations on it:

Reading order becomes the artefact. A philavery is an accretion, not an index, and
alphabetisation is the one arrangement that destroys the information in how it was
collected.

`flâneur` gets a structural role instead of an entry. Releasing the walker *is* the
word.

`ergodic` becomes literally true of the site. The visited set grows, coverage
approaches one, and the entry for `ergodic` is a meter measuring the page you are
standing on. Visited state persists in `localStorage`, so the coverage figure is a
record of your own strolling rather than a session counter.

## Second view: the stratigraphic section

Words plotted against date of first attestation, oldest at the base. `antediluvian`
anchors the bottom of the section; `homoscedasticity` and `musique concrète` sit in
the twentieth-century band; `mimeomia` is not in the section at all, because it was
coined rather than attested, and the chart should show that gap honestly rather than
give a neologism a false floor. Tunnel's existing plot idiom draws this without
modification.

## Structure

```
gazetteer/
├── README.md              this file
├── CLAUDE.md              working conventions for this repo
├── docs/
│   └── BEHAVIOURS.md      the behaviour catalogue — the spec that drives src/
├── data/
│   └── words.yml          the philavery: one record per word
├── src/
│   ├── behaviours.js      registry + contract; one entry per behaviour id
│   ├── field.js           force layout, walker, traversal state   [not built]
│   ├── plain.js           the fallback view                        [not built]
│   └── tunnel.css         tokens imported from the Tunnel skill    [not built]
└── index.html                                                      [not built]
```

## Build order

1. `data/words.yml` complete, provenance back-filled, attestation dates verified.
2. `plain.js` — the fallback view, built *first*. Everything else is an enhancement
   over a page that already works.
3. `field.js` — layout, walker, traversal, `localStorage` visited set.
4. Behaviours in tiers, per `docs/BEHAVIOURS.md`: the structural ones
   (`flaneur`, `ergodic`, `solus`, `expunge`) before the local ones.
5. The stratigraphic section.

## Outstanding

- **Provenance.** Every `source` field except `mimeomia` is `TODO`. The holiday book
  needs naming, and the words that came from elsewhere need separating out. This is
  the field that will matter most in ten years and the one easiest to lose now.
- **Attestation dates** in `words.yml` are unverified placeholders. Check against the
  OED before the stratigraphic section goes up, or the chart is fiction.
- **Repository name.** `gazetteer` sits in the same family as Tunnel, Transit, Cairn
  and Traverse; change it if something better turns up.
