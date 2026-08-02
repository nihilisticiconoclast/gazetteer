# The behaviour catalogue

The specification `src/behaviours.js` implements. One section per `behaviour` id in
`data/words.yml`. Each states what the behaviour does, what state it holds, and what
it renders in plain view.

Behaviours are grouped by tier, which is build order rather than importance. Tier 1
behaviours act on the field as a whole and have to exist before the field is
meaningful. Tier 2 act on a single node. Tier 3 are local effects that can land last.

State is one of: **none**, **session** (lost on reload), **persistent**
(`localStorage`), or **global** (mutates the field for other entries).

---

## Tier 1 — structural

### `flaneur` — Flâneur
Holds the traversal mode. Activating it releases the walker to drift; activating it
again takes the reins back. Its gloss is the only instruction the site gives about how
to move. State: **persistent**, **global**. Plain: gloss, with a note that the field
view has a walk in it.

### `ergodic` — Ergodic
Renders a coverage meter: visited nodes over total, as a proportion, alongside the
count of steps taken to get there. The gap between the two is the whole content of the
entry — coverage approaches one slowly, and the walk is much longer than the map.
State: **persistent** (reads the visited set every other behaviour writes to). Plain:
gloss plus the current figure as a static line.

### `solus` — Solipsistic
On arrival, every other node fades to nothing. For as long as the entry is open it is
the only word in the field, and the coverage meter is unreachable. On leaving, the
field returns. State: **session**, **global**. Plain: gloss, unmodified — the
behaviour has nothing to act on in a list.

### `expunge` — Expunge
Struck through on arrival, then removed from the field. The layout closes the gap and
the node is absent from traversal for the rest of the session; the visited set records
it as visited, so coverage still counts it. State: **session**, **global**. Plain:
struck through but present, and deletable by click, restored on reload.

### `qed` — Quod erat demonstrandum
Not principally a node. Appends ∎ to the foot of every definition panel as it closes,
from the moment the entry is first visited. Its own panel closes with the mark it
installs. State: **persistent**, **global**. Plain: gloss, and the mark at the end of
the plain list.

### `quarantine` — Cordon sanitaire
Holds a bordered exclusion zone in the layout that no other node's force may enter. It
is placed first and everything else settles around it. State: **none** (layout
constraint). Plain: gloss, set apart in its own ruled block.

---

## Tier 2 — node-level

### `deixis` — Deictic
The gloss is written with unresolved pointers filled from context: *this* word, *here*
in the field, *now*, and the node you arrived from. The same entry produces a different
sentence every visit, and on a first direct load has nothing to point back at, which is
also correct. State: **session**. Plain: the pointers resolved against the list —
*the seventh word here*, and so on.

### `clasp-neighbour` — Misdirected amplexus
Never responds to its own events. Hovering or activating it highlights, borders and
opens the definition panel of the adjacent node instead. Its own gloss is only
reachable from a neighbour that happens to point back. State: **none**. Plain: gloss,
with the entry printed under the wrong headword.

### `circumlocute` — Periphrasis
Glossed at ruinous length in a fully circumlocutory paragraph, with a single control
that collapses the paragraph to one word. The one word is the gloss in `words.yml`.
State: **session** (collapsed or not). Plain: collapsed by default.

### `dinkus` — Dinkus
Renders as ⁂ and nothing else. In the field it reads as an ordinary section divider
rather than a node, and the headword does not appear until it is engaged. It should be
possible to miss it entirely on a first walk. State: **session**. Plain: appears as the
divider between two sections of the list, and is also an entry.

### `mithridate` — Antidotum Mithridatium
A dose counter incremented on every visit across sessions. Successive visits desaturate
the entry: the first arrival is at full strength, and by the eighth or so it barely
registers. Tolerance to the entry is built by reading it. State: **persistent**. Plain:
gloss plus the dose count.

### `catuskoti` — Tetralemma / śūnyatā
Cycles through four positions on successive activations — is, is not, both, neither —
and on the fifth renders blank while remaining present and traversable. Further
activations stay blank. State: **persistent**. Plain: all four positions listed, then a
rule, then nothing.

### `prolepsis` — Proleptically
The definition panel is already open when the walker arrives, and retracts once it
gets there. Approaching the node is the only way to see it. State: **none**. Plain: the
gloss appears above its own headword.

### `daily` — Quotidian
Keyed to the date. Its appearance changes once a day and is otherwise entirely
unremarkable — the only entry that differs between two visits, and the only one whose
difference nobody would notice. Do not make the daily variation interesting. State:
**none** (derived from date). Plain: gloss, plus the date it was read.

### `typecast` — Mimeomia
Rendered in unstyled browser defaults: Times, blue underlined links, no Tunnel tokens
at all. It is the one entry that looks like every other page on the internet, and it
did not choose to. State: **none**. Plain: identical, which is the joke — plain view is
where it finally fits in.

### `unsettled` — Vexata quaestio
Never comes to rest. Its position in the force layout is perturbed continuously and the
node jitters at a low amplitude for as long as the field is open. Activating it does
not stop it. State: **session**. Plain: gloss, settled, because a list has no forces
in it.

### `dictation` — Amanuensis
The gloss types itself out at dictation speed, with the pauses in the wrong places —
where the speaker drew breath rather than where the sense breaks. Not skippable by
click; skippable by keyboard, because that is what an amanuensis would want.
State: **none**. Plain: gloss, complete.

### `obscure` — Obscurantism
The gloss is rendered illegibly and resolves only under sustained attention: legibility
increases with dwell time and decays when attention moves. Getting the whole sentence
takes an uncomfortably long time. Cap the time; the point is friction, not refusal.
State: **session**. Plain: legible, with a note that the field view withholds it.

### `revert` — Atavistic
Renders in an earlier version of Tunnel's own tokens — the first commit's palette and
type scale, kept in the repository for this entry alone. State: **none**. Plain: gloss,
in the old type.

### `encomium` — Encomium
Praises the previous word visited, at length, in the register of a funeral oration, by
name. Its own gloss follows in one line. On a first direct load it praises the field
itself. State: **session**. Plain: praises the preceding entry in the list.

### `mirror` — Concomitantly
Has no behaviour of its own. It performs whatever its nearest neighbour is currently
doing, and if the neighbour is `inert` it does nothing at all. State: **none**
(delegated). Plain: it renders as whatever entry precedes it, restyled.

### `stratum` — Antediluvian
Anchors the base of the stratigraphic section and, in the field, sits at the lowest
point of the layout with everything else in the water column above it. State: **none**.
Plain: gloss, and the section's floor line.

### `residuals` — Homoscedasticity
A small residual plot beside the gloss: an even band about zero. Hovering fans it into
a wedge — the counter-example, which is what the word is actually used to talk about.
State: **none**. Plain: gloss, with the even band as a static figure.

### `bearing` — Azimuthally
Sits on a bearing ring, and its definition is set at the angle you would have to stand
at to read it. Rotating the ring brings it upright. State: **session**. Plain: gloss,
upright, with the bearing given in degrees.

---

## Tier 3 — local

### `inert` — Phlegmatic
Nothing. No transition, no hover state, no response to arrival. The definition panel
opens without animation. Register no event handlers rather than registering handlers
that return early — the implementation should be as unbothered as the word.
State: **none**. Plain: gloss.

### `alacrity` — Alacrity
Responds on `mouseenter` before the walker settles, at the shortest transition duration
on the site, and its panel is open before any other entry's would have started.
State: **none**. Plain: gloss, first in the list regardless of alphabetisation.

### `cut` — Acerbic
The gloss arrives with the panel edge drawn as a single fast stroke across it, and the
entry is the shortest on the site. State: **none**.

### `boil` — Ebullition
The panel rises from the lower edge and overtops it. State: **none**.

### `torpor` — Taedium vitae
Every transition on the entry runs at punishing length — long enough to be a decision
to wait. Nothing else on the site is slow. Cap it, and let the cap be generous.
State: **none**. Plain: gloss, immediately.

### `bloom` — Effulgence
Light emitted from the type rather than applied to it: the headword's own glyphs are
the source. State: **none**.

### `variegate` — Variegated
The sole entry permitted colour. Patches, not a gradient. Every other behaviour on the
site works in Tunnel's monochrome, and this constraint is what makes the entry land —
see CLAUDE.md. State: **none**.

### `ornament` — Sybaritic
The only entry with ornament: rules, flourishes, a decorated initial. Adjacent to
`abstain`, if the layout allows. State: **none**.

### `abstain` — Abstemious
Declines every optional style rule on the site — no transition, no ornament, no
emphasis, minimum type scale. Distinct from `inert`, which is unresponsive; this one
responds and refuses. State: **none**.

### `magnify` — Magniloquent
Renders at a scale disproportionate to the length of its gloss, which is one clause.
State: **none**.

### `recoil` — Tête à claques
Flinches away from the cursor and returns. State: **none**.

### `flick` — Fillip
Released with momentum on activation, travels, and settles. The only node that moves
under its own impulse rather than under the layout's forces. State: **session**.

### `disgorge` — Vomitorium
Activation discharges the entire node set through the edges of the viewport, after
which the nodes walk back in through the same passages. Once per session; it is a
crowd leaving, not a fountain. State: **session**, **global**.

### `found-sound` — Musique concrète
Plays recorded sound rather than synthesis — field recordings, tape. Gated behind an
explicit control, never on arrival. If the audio dependency is not worth carrying, this
becomes the waveform of the recording, rendered and not played. State: **none**.

---

## Not yet assigned

Nothing. Every word in `words.yml` has a behaviour. Any word added must arrive with
one, per CLAUDE.md.
