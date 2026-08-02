/**
 * Gazetteer — behaviour registry
 *
 * One entry per `behaviour` id in data/words.yml. The specification for each lives in
 * docs/BEHAVIOURS.md and is the authority; this file is its implementation.
 *
 * Contract. A behaviour is an object with any of:
 *
 *   mount(ctx)      once, when the node enters the field
 *   enter(ctx)      the walker arrives; may return { panel: false } to keep the
 *                   definition panel shut, or a Promise the field awaits before
 *                   revealing the panel
 *   activate(ctx)   the walker is on the node and it is activated again
 *                   (Enter, or a second click)
 *   leave(ctx)      the walker departs
 *   panel(ctx, p)   the definition panel has been built with the default content;
 *                   p = { el, hw, gloss, meta, extra, note } are its elements and
 *                   the behaviour may restyle or rewrite them
 *   plain(ctx)      REQUIRED — what this entry renders as in plain view
 *   unmount(ctx)    cleanup; remove listeners and timers
 *
 * ctx = {
 *   word,     the record from words.yml
 *   el,       the node's root element (absent in plain view)
 *   panel,    the definition panel controller
 *   field,    { nodes, neighbours(id), visited, steps(), total, walker,
 *               mode()/setMode(), suspendAnchors(ms), impulse(id,vx,vy),
 *               removeNode(id), disgorge(), armQed()/qedArmed(), setJitter(),
 *               trackWith() }
 *   list,     plain view only: { index, total, prev, next }
 *   coverage, plain view only: { visited, total, steps }
 *   state,    per-word store: state.session / state.persistent (localStorage-backed)
 *   tokens    resolved Tunnel design tokens (durations)
 * }
 *
 * plain(ctx) returns the default record fields plus optional directives the plain
 * renderer understands: classes[], extra[] (mono lines), figure (svg string),
 * glossAbove, first, divider, ruled, struck, deletable, floor, mirrorPrev,
 * variegated, endMark, and a headword override.
 *
 * Rules of the house:
 *   - plain() must return readable content for every behaviour without exception,
 *     including the ones that are hostile to reading in the field.
 *   - Behaviours that mutate the field (global, per the spec) must be reversible in
 *     leave() or explicitly documented as not being so.
 *   - Nothing here reads from words.yml other than via ctx.word.
 */

const registry = new Map();

export function register(id, behaviour) {
  if (registry.has(id)) throw new Error(`duplicate behaviour: ${id}`);
  if (typeof behaviour.plain !== 'function') {
    throw new Error(`behaviour ${id} has no plain() — see CLAUDE.md`);
  }
  registry.set(id, behaviour);
}

export function get(id) {
  const b = registry.get(id);
  if (!b) throw new Error(`unknown behaviour: ${id}`);
  return b;
}

export function ids() {
  return [...registry.keys()];
}

/** The default plain rendering: headword, gloss, etymon, date, source. */
export function defaultPlain({ word }) {
  return {
    headword: word.display ?? word.headword,
    gloss: word.gloss,
    etymon: word.etymon,
    attested: word.attested,
    source: word.source,
    note: word.note,
  };
}

/* small deterministic hash, for per-word constants that must not be random */
function hash(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh',
  'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
function ordinal(n) {
  return ORDINALS[n - 1] ?? `${n}th`;
}

/* ------------------------------------------------------------------ *
 * Tier 1 — structural                                                 *
 * ------------------------------------------------------------------ */

/**
 * flâneur. Holds the traversal mode: activating it releases the walker to drift,
 * activating it again takes the reins back. Its gloss is the only instruction the
 * site gives about how to move. spec: docs/BEHAVIOURS.md#flaneur
 */
register('flaneur', {
  activate(ctx) {
    ctx.field.setMode(ctx.field.mode() === 'drift' ? 'manual' : 'drift');
    if (ctx.panel.onRefreshExtra) ctx.panel.onRefreshExtra();
  },
  panel(ctx, p) {
    const line = document.createElement('div');
    line.className = 'p-hint';
    const set = () => {
      line.textContent = ctx.field.mode() === 'drift'
        ? 'the walker drifts — activate again to take the reins'
        : 'the reins are in hand — activate to release the walker';
    };
    set();
    ctx.panel.onRefreshExtra = set;
    p.extra.append(line);
  },
  plain: (ctx) => ({
    ...defaultPlain(ctx),
    extra: ['the field view has a walk in it; this entry holds the reins'],
  }),
});

/**
 * ergodic. A coverage meter: visited over total, and the steps taken to get there.
 * The gap between the two numbers is the whole content of the entry.
 * spec: docs/BEHAVIOURS.md#ergodic
 */
register('ergodic', {
  panel(ctx, p) {
    const v = ctx.field.visited.size;
    const t = ctx.field.total;
    const s = ctx.field.steps();
    const div = document.createElement('div');
    div.className = 'p-hint';
    div.innerHTML =
      `coverage ${v}/${t} = ${(v / t).toFixed(3)} · steps ${s}` +
      `<div style="border:1px solid var(--index);height:8px;margin-top:.5rem">` +
      `<div style="background:var(--ink);height:100%;width:${(100 * v / t).toFixed(1)}%"></div></div>`;
    p.extra.append(div);
  },
  plain: (ctx) => ({
    ...defaultPlain(ctx),
    extra: [
      `coverage ${ctx.coverage.visited}/${ctx.coverage.total} = ` +
      `${(ctx.coverage.visited / ctx.coverage.total).toFixed(3)} · steps ${ctx.coverage.steps}`,
    ],
  }),
});

/**
 * solipsistic. For as long as this entry is open it is the only word in the field.
 * Global and reversible. spec: docs/BEHAVIOURS.md#solus
 */
register('solus', {
  enter(ctx) {
    for (const node of ctx.field.nodes) {
      if (node.id !== ctx.word.id) node.el.classList.add('is-unwitnessed');
    }
  },
  leave(ctx) {
    for (const node of ctx.field.nodes) node.el.classList.remove('is-unwitnessed');
  },
  plain: defaultPlain, // a list has other entries in it; the behaviour has no purchase
});

/**
 * expunge. Struck through on arrival, then removed from the field for the session;
 * the visited set still counts it. Not reversible in leave() by design — the gap
 * closes and stays closed until reload. spec: docs/BEHAVIOURS.md#expunge
 */
register('expunge', {
  enter(ctx) {
    if (ctx.state.session.get('gone')) return;
    ctx.el.classList.add('is-expunged');
    ctx.state.session.set('gone', true);
    setTimeout(() => {
      ctx.el.classList.add('is-gone');
      ctx.field.removeNode(ctx.word.id);
    }, 1100);
  },
  panel(ctx, p) {
    p.gloss.style.textDecoration = 'line-through';
  },
  plain: (ctx) => ({ ...defaultPlain(ctx), struck: true, deletable: true }),
});

/**
 * qed. Not principally a node: from the first visit onward, every definition panel
 * closes with ∎. Persistent and global; documented as not reversible.
 * spec: docs/BEHAVIOURS.md#qed
 */
register('qed', {
  enter(ctx) {
    ctx.field.armQed();
  },
  plain: (ctx) => ({ ...defaultPlain(ctx), endMark: true }),
});

/**
 * cordon sanitaire. A bordered exclusion zone in the layout that no other node's
 * force may enter; placed first, everything settles around it. The zone itself is
 * drawn and enforced by field.js (a layout constraint holds no listeners here).
 * spec: docs/BEHAVIOURS.md#quarantine
 */
register('quarantine', {
  plain: (ctx) => ({ ...defaultPlain(ctx), ruled: true }),
});

/* ------------------------------------------------------------------ *
 * Tier 2 — node-level                                                 *
 * ------------------------------------------------------------------ */

/**
 * deictic. The gloss is a sentence of resolved pointers — this word, here, now, and
 * the node you arrived from — so every visit reads differently, and a first direct
 * load has nothing to point back at. spec: docs/BEHAVIOURS.md#deixis
 */
register('deixis', {
  panel(ctx, p) {
    const prev = ctx.field.walker.prev;
    const near = ctx.field.neighbours(ctx.word.id)[0];
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const from = prev
      ? `the way in was from ${prev.word.display ?? prev.word.headword}`
      : 'the way in was from nowhere, and there is nothing yet to point back at';
    const beside = near ? `beside ${near.word.display ?? near.word.headword}` : 'alone';
    p.gloss.textContent =
      `This word, here in the field ${beside}, now at ${hh}:${mm}; ${from}.`;
  },
  plain: (ctx) => ({
    ...defaultPlain(ctx),
    extra: [
      `resolved against this list: the ${ordinal(ctx.list.index + 1)} word here, ` +
      `of ${ctx.list.total}; the previous entry is ` +
      `${ctx.list.prev ? (ctx.list.prev.display ?? ctx.list.prev.headword) : 'nothing'}.`,
    ],
  }),
});

/**
 * misdirected amplexus. Never responds to its own events: hovering or activating it
 * highlights and opens the definition panel of the adjacent node instead. Its own
 * gloss is only reachable from a neighbour that happens to point back.
 * spec: docs/BEHAVIOURS.md#clasp-neighbour
 */
register('clasp-neighbour', {
  mount(ctx) {
    ctx._grip = () => {
      const nb = ctx.field.neighbours(ctx.word.id)[0];
      if (!nb) return;
      nb.el.classList.add('is-held');
      ctx.state.session.set('held', nb.id);
      ctx.panel.openFor(nb.id);
    };
    ctx.el.addEventListener('mouseenter', ctx._grip);
  },
  enter(ctx) {
    ctx._grip();
    return { panel: false };
  },
  activate(ctx) {
    ctx._grip();
  },
  leave(ctx) {
    const held = ctx.state.session.get('held');
    if (held) {
      const nb = ctx.field.nodes.find((n) => n.id === held);
      if (nb) nb.el.classList.remove('is-held');
      ctx.state.session.set('held', null);
    }
  },
  unmount(ctx) {
    ctx.el.removeEventListener('mouseenter', ctx._grip);
  },
  // printed under the wrong headword — the adjacent entry's, per the spec
  plain: (ctx) => ({
    ...defaultPlain(ctx),
    headword: ctx.list.next
      ? (ctx.list.next.display ?? ctx.list.next.headword)
      : (ctx.list.prev.display ?? ctx.list.prev.headword),
  }),
});

/* The periphrastic paragraph is mechanics, not data: the behaviour's own
   circumlocution around saying-in-one-word. The one word it collapses to is the
   gloss in words.yml, read from ctx.word as the contract requires. */
const PERIPHRASIS =
  'To have recourse, in the matter of conveying a thing, not to the thing’s own ' +
  'name — which lies ready, single, and sufficient — but to a procession of ' +
  'subordinate clauses, qualifications, and approaches from unexpected quarters, each ' +
  'of which surrounds the intended sense without ever quite consenting to alight upon ' +
  'it, so that the listener, having been conducted at some expense of patience around ' +
  'the entire circumference of what is meant, arrives at last, weary and by no direct ' +
  'road, at the very place to which a single word would have delivered them at once.';

/**
 * periphrasis. Glossed at ruinous length, with one control that collapses the
 * paragraph to the one-word version — the gloss in words.yml.
 * spec: docs/BEHAVIOURS.md#circumlocute
 */
register('circumlocute', {
  panel(ctx, p) {
    const btn = document.createElement('button');
    btn.className = 'inline';
    const render = () => {
      const c = !!ctx.state.session.get('collapsed');
      p.gloss.textContent = c ? ctx.word.gloss : PERIPHRASIS;
      btn.textContent = c ? 'at length' : 'in one word';
    };
    btn.addEventListener('click', () => {
      ctx.state.session.set('collapsed', !ctx.state.session.get('collapsed'));
      render();
    });
    render();
    p.extra.append(btn);
  },
  plain: defaultPlain, // collapsed by default: the gloss as written
});

/**
 * dinkus. Renders as ⁂ and nothing else until engaged; possible to miss on a first
 * walk. spec: docs/BEHAVIOURS.md#dinkus
 */
register('dinkus', {
  mount(ctx) {
    ctx.el.classList.add('b-dinkus');
    if (!ctx.state.session.get('engaged')) ctx.el.querySelector('.hw').textContent = '⁂';
  },
  enter(ctx) {
    ctx.state.session.set('engaged', true);
    ctx.el.querySelector('.hw').textContent = ctx.word.display ?? ctx.word.headword;
  },
  plain: (ctx) => ({ ...defaultPlain(ctx), divider: true }),
});

/**
 * antidotum mithridatium. A dose counter across sessions; each visit desaturates the
 * entry until it barely registers. Tolerance is built by reading.
 * spec: docs/BEHAVIOURS.md#mithridate
 */
register('mithridate', {
  mount(ctx) {
    const dose = ctx.state.persistent.get('dose') ?? 0;
    ctx.el.style.opacity = String(Math.max(0.14, 1 - 0.12 * Math.max(0, dose - 1)));
  },
  enter(ctx) {
    const dose = (ctx.state.persistent.get('dose') ?? 0) + 1;
    ctx.state.persistent.set('dose', dose);
    const k = Math.max(0.14, 1 - 0.12 * (dose - 1));
    ctx.el.style.opacity = String(k);
    ctx.panel.el.style.opacity = String(k);
  },
  leave(ctx) {
    ctx.panel.el.style.opacity = '';
  },
  panel(ctx, p) {
    const line = document.createElement('div');
    line.className = 'p-hint';
    line.textContent = `dose ${ctx.state.persistent.get('dose') ?? 1}`;
    p.extra.append(line);
  },
  plain: (ctx) => ({
    ...defaultPlain(ctx),
    extra: [`dose ${ctx.state.persistent.get('dose') ?? 0}`],
  }),
});

const CATUSKOTI = ['It is.', 'It is not.', 'It both is and is not.',
  'It neither is nor is not.'];

/**
 * tetralemma / śūnyatā. Four positions on successive activations, then blank on the
 * fifth while remaining present and traversable. spec: docs/BEHAVIOURS.md#catuskoti
 */
register('catuskoti', {
  enter(ctx) {
    if ((ctx.state.persistent.get('turns') ?? 0) === 0) ctx.state.persistent.set('turns', 1);
  },
  activate(ctx) {
    ctx.state.persistent.set('turns', (ctx.state.persistent.get('turns') ?? 0) + 1);
    ctx.panel.reopen();
  },
  panel(ctx, p) {
    const turns = ctx.state.persistent.get('turns') ?? 1;
    if (turns <= CATUSKOTI.length) {
      p.gloss.textContent = CATUSKOTI[turns - 1];
    } else {
      p.hw.textContent = '';
      p.gloss.textContent = '';
      p.meta.textContent = '';
      p.note.textContent = '';
    }
  },
  plain: (ctx) => ({
    ...defaultPlain(ctx),
    gloss: null,
    extra: [...CATUSKOTI, '───', ' '],
  }),
});

/**
 * proleptically. The definition panel is already open when the walker arrives, and
 * retracts once it gets there; approaching is the only way to see it.
 * spec: docs/BEHAVIOURS.md#prolepsis
 */
register('prolepsis', {
  mount(ctx) {
    const mini = document.createElement('div');
    mini.className = 'pro-mini';
    mini.textContent = ctx.word.gloss;
    ctx.el.insertAdjacentElement('afterend', mini);
    ctx._mini = mini;
    ctx.field.trackWith(ctx.word.id, mini, { dy: 16 });
  },
  enter(ctx) {
    ctx._mini.classList.add('is-retracted');
    return { panel: false };
  },
  leave(ctx) {
    ctx._mini.classList.remove('is-retracted');
  },
  unmount(ctx) {
    ctx._mini.remove();
  },
  plain: (ctx) => ({ ...defaultPlain(ctx), glossAbove: true }),
});

/**
 * quotidian. Keyed to the date; the variation is real, daily, and deliberately
 * uninteresting — a fraction of a unit of letter-spacing.
 * spec: docs/BEHAVIOURS.md#daily
 */
register('daily', {
  mount(ctx) {
    const d = new Date();
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    ctx.el.style.letterSpacing = ['0', '0.012em', '0.024em'][hash(key) % 3];
  },
  plain: (ctx) => ({
    ...defaultPlain(ctx),
    extra: [`read ${new Date().toISOString().slice(0, 10)}`],
  }),
});

/**
 * mimeomia. Browser defaults: Times, blue links, no Tunnel tokens at all. The one
 * entry that looks like every other page on the internet, and it did not choose to.
 * spec: docs/BEHAVIOURS.md#typecast
 */
register('typecast', {
  mount(ctx) {
    ctx.el.classList.add('b-typecast');
  },
  panel(ctx, p) {
    p.el.classList.add('b-typecast');
  },
  plain: (ctx) => ({ ...defaultPlain(ctx), classes: ['is-typecast'] }),
});

/**
 * vexata quaestio. Never comes to rest: perturbed continuously at low amplitude for
 * as long as the field is open. Activating it does not stop it.
 * spec: docs/BEHAVIOURS.md#unsettled
 */
register('unsettled', {
  mount(ctx) {
    ctx.field.setJitter(ctx.word.id, 0.0016);
  },
  plain: defaultPlain, // settled, because a list has no forces in it
});

/**
 * amanuensis. The gloss types itself out at dictation speed with the pauses where
 * the speaker drew breath, not where the sense breaks. Skippable by keyboard only.
 * spec: docs/BEHAVIOURS.md#dictation
 */
register('dictation', {
  panel(ctx, p) {
    const words = ctx.word.gloss.split(' ');
    p.gloss.textContent = '';
    let i = 0;
    let done = false;
    const onKey = () => finish();
    const finish = () => {
      if (done) return;
      done = true;
      p.gloss.textContent = ctx.word.gloss;
      document.removeEventListener('keydown', onKey);
      clearTimeout(ctx._t);
    };
    document.addEventListener('keydown', onKey);
    const tick = () => {
      if (done) return;
      p.gloss.textContent = words.slice(0, ++i).join(' ');
      if (i >= words.length) return finish();
      // breath, not sense: pauses at seeded positions unrelated to the punctuation
      const drewBreath = hash(ctx.word.id + i) % 4 === 0;
      ctx._t = setTimeout(tick, drewBreath ? 620 : 150);
    };
    tick();
    ctx._cleanup = finish;
  },
  leave(ctx) {
    if (ctx._cleanup) ctx._cleanup();
  },
  plain: defaultPlain, // complete
});

/**
 * obscurantism. The gloss resolves only under sustained attention: legibility rises
 * with dwell and decays when attention moves. Capped — the point is friction, not
 * refusal. spec: docs/BEHAVIOURS.md#obscure
 */
register('obscure', {
  panel(ctx, p) {
    p.el.classList.add('b-obscure');
    const CAP = 9000; // ms of dwell to full legibility, after which it stays
    let dwell = ctx.state.session.get('dwell') ?? 0;
    let timer = null;
    const apply = () => {
      const k = Math.min(1, dwell / CAP);
      p.gloss.style.filter = `blur(${(7 * (1 - k)).toFixed(2)}px)`;
    };
    const attend = () => {
      clearInterval(timer);
      timer = setInterval(() => {
        dwell = Math.min(CAP, dwell + 120);
        ctx.state.session.set('dwell', dwell);
        apply();
      }, 120);
    };
    const drift = () => {
      clearInterval(timer);
      if (dwell >= CAP) return; // attention paid in full is not revoked
      timer = setInterval(() => {
        dwell = Math.max(0, dwell - 60);
        ctx.state.session.set('dwell', dwell);
        apply();
      }, 120);
    };
    p.gloss.addEventListener('pointerenter', attend);
    p.gloss.addEventListener('pointerleave', drift);
    apply();
    ctx._stop = () => clearInterval(timer);
  },
  leave(ctx) {
    if (ctx._stop) ctx._stop();
  },
  plain: (ctx) => ({
    ...defaultPlain(ctx),
    extra: ['the field view withholds this gloss until it is attended to'],
  }),
});

/**
 * atavistic. Rendered in the ancestral forms kept inside Tunnel's own first-commit
 * tokens — the fallback stacks (Georgia, system-ui, Menlo). The palette has never
 * changed since that commit, so the reversion is carried by type alone; the old
 * file is kept verbatim in src/tunnel-atavistic.css for this entry.
 * spec: docs/BEHAVIOURS.md#revert
 */
register('revert', {
  mount(ctx) {
    ctx.el.classList.add('b-revert');
  },
  panel(ctx, p) {
    p.el.classList.add('b-revert');
  },
  plain: (ctx) => ({ ...defaultPlain(ctx), classes: ['is-revert'] }),
});

function orate(name, gloss) {
  const what = gloss.replace(/\.\s*$/, '').replace(/^\w/, (c) => c.toLowerCase());
  return (
    `We are met beside ${name}. It was ${what}; it was that entirely, and without ` +
    `stint. The field is poorer along the edge where it stood, and the walk that ` +
    `passed it was the better for passing it. It asked nothing of its neighbours and ` +
    `lent them its bearings. Of few words in this collection can so much be said, ` +
    `in so public a register, and be true.`
  );
}

/**
 * encomium. Praises the previous word visited, at length, in the register of a
 * funeral oration, by name; its own gloss follows in one line. On a first direct
 * load it praises the field itself. spec: docs/BEHAVIOURS.md#encomium
 */
register('encomium', {
  panel(ctx, p) {
    const prev = ctx.field.walker.prev;
    const oration = document.createElement('p');
    if (prev) {
      oration.textContent = orate(prev.word.display ?? prev.word.headword, prev.word.gloss);
    } else {
      oration.textContent =
        `We are met in the field itself, which holds ${ctx.field.total} words at their ` +
        `stations and asks only to be walked. No single entry could be praised before ` +
        `it; it is the ground of every one of them.`;
    }
    p.gloss.before(oration);
  },
  plain: (ctx) => ({
    ...defaultPlain(ctx),
    extra: ctx.list.prev
      ? [`(preceding it, and mourned here: ${ctx.list.prev.display ?? ctx.list.prev.headword}, ` +
         `which was ${ctx.list.prev.gloss.replace(/\.\s*$/, '').toLowerCase()})`]
      : [],
  }),
});

/**
 * concomitantly. No behaviour of its own: it performs whatever its nearest
 * neighbour is currently doing, and if the neighbour is inert it does nothing at
 * all. spec: docs/BEHAVIOURS.md#mirror
 */
let mirroring = false;
register('mirror', {
  enter(ctx) {
    if (mirroring) return;
    const nb = ctx.field.neighbours(ctx.word.id)[0];
    if (!nb) return;
    const b = get(nb.word.behaviour);
    ctx.state.session.set('performing', nb.word.behaviour);
    if (b.enter) {
      mirroring = true;
      try { return b.enter(ctx); } finally { mirroring = false; }
    }
  },
  panel(ctx, p) {
    const id = ctx.state.session.get('performing');
    if (!id || mirroring) return;
    const b = get(id);
    if (b.panel) {
      mirroring = true;
      try { b.panel(ctx, p); } finally { mirroring = false; }
    }
  },
  leave(ctx) {
    const id = ctx.state.session.get('performing');
    if (!id || mirroring) return;
    const b = get(id);
    if (b.leave) {
      mirroring = true;
      try { b.leave(ctx); } finally { mirroring = false; }
    }
    ctx.state.session.set('performing', null);
  },
  plain: (ctx) => ({ ...defaultPlain(ctx), mirrorPrev: true }),
});

/**
 * antediluvian. The lowest point of the layout, with the water column above it; in
 * the section it anchors the base. The pinning itself is a field.js layout
 * constraint keyed to this behaviour id. spec: docs/BEHAVIOURS.md#stratum
 */
register('stratum', {
  plain: (ctx) => ({ ...defaultPlain(ctx), floor: true }),
});

function residualsSVG(seedStr, fanned) {
  const rng = (i) => (hash(seedStr + ':' + i) % 1000) / 1000;
  let dots = '';
  for (let i = 0; i < 26; i++) {
    const x = 14 + (i / 25) * 172;
    const spread = fanned ? 4 + 20 * (i / 25) : 12;
    const y = 36 + (rng(i) - 0.5) * 2 * spread;
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.8" fill="var(--ink)"/>`;
  }
  return (
    `<svg viewBox="0 0 200 72" width="200" height="72" role="img" ` +
    `aria-label="residuals: an even band about zero${fanned ? ', fanned into a wedge' : ''}">` +
    `<line x1="10" y1="36" x2="190" y2="36" stroke="var(--contour)" stroke-width="1" opacity=".6"/>` +
    dots + `</svg>`
  );
}

/**
 * homoscedasticity. A residual plot beside the gloss: an even band about zero, which
 * hovering fans into the wedge — the counter-example the word exists to rule out.
 * spec: docs/BEHAVIOURS.md#residuals
 */
register('residuals', {
  panel(ctx, p) {
    const fig = document.createElement('div');
    fig.innerHTML = residualsSVG(ctx.word.id, false);
    fig.addEventListener('pointerenter', () => { fig.innerHTML = residualsSVG(ctx.word.id, true); });
    fig.addEventListener('pointerleave', () => { fig.innerHTML = residualsSVG(ctx.word.id, false); });
    p.extra.append(fig);
  },
  plain: (ctx) => ({ ...defaultPlain(ctx), figure: residualsSVG(ctx.word.id, false) }),
});

/**
 * azimuthally. The definition is set at the angle you would have to stand at to
 * read it; rotating the ring brings it upright. spec: docs/BEHAVIOURS.md#bearing
 */
register('bearing', {
  panel(ctx, p) {
    const bearing = 30 + (hash(ctx.word.id) % 300); // never trivially upright
    let angle = ctx.state.session.get('angle');
    if (angle == null) angle = bearing;
    p.gloss.style.transition = 'transform .6s ease';
    p.gloss.style.transformOrigin = '50% 50%';
    p.gloss.style.transform = `rotate(${angle}deg)`;
    p.gloss.style.margin = '2.5rem 0';
    const line = document.createElement('div');
    line.className = 'p-hint';
    const btn = document.createElement('button');
    btn.className = 'inline';
    btn.textContent = 'rotate the ring';
    const readout = document.createElement('span');
    const read = () => {
      readout.textContent = ` bearing ${String(Math.round(angle)).padStart(3, '0')}°`;
    };
    read();
    btn.addEventListener('click', () => {
      angle = Math.abs(angle) < 20 ? bearing : 0;
      ctx.state.session.set('angle', angle);
      p.gloss.style.transform = `rotate(${angle}deg)`;
      read();
    });
    line.append(btn, readout);
    p.extra.append(line);
  },
  plain: (ctx) => ({
    ...defaultPlain(ctx),
    extra: [`bearing ${String(30 + (hash(ctx.word.id) % 300)).padStart(3, '0')}° in the field; upright here`],
  }),
});

/* ------------------------------------------------------------------ *
 * Tier 3 — local                                                      *
 * ------------------------------------------------------------------ */

/**
 * phlegmatic. The word is not stirred, and neither is the implementation: no
 * listeners are registered at all. Do not "implement" this as handlers that return
 * early. spec: docs/BEHAVIOURS.md#inert
 */
register('inert', {
  plain: defaultPlain,
});

/**
 * alacrity. Responds on mouseenter, before the walker has settled, at the shortest
 * transition on the site. spec: docs/BEHAVIOURS.md#alacrity
 */
register('alacrity', {
  mount(ctx) {
    ctx.el.style.setProperty('--transition', ctx.tokens.duration.instant);
    ctx._open = () => ctx.panel.openFor(ctx.word.id, { instant: true });
    ctx.el.addEventListener('mouseenter', ctx._open);
    ctx.el.addEventListener('focus', ctx._open);
  },
  unmount(ctx) {
    ctx.el.removeEventListener('mouseenter', ctx._open);
    ctx.el.removeEventListener('focus', ctx._open);
  },
  plain: (ctx) => ({ ...defaultPlain(ctx), first: true }),
});

/**
 * acerbic. The panel edge drawn as a single fast stroke; the shortest entry on the
 * site. spec: docs/BEHAVIOURS.md#cut
 */
register('cut', {
  panel(ctx, p) {
    p.el.classList.remove('b-cut');
    void p.el.offsetWidth; // restart the stroke
    p.el.classList.add('b-cut');
  },
  plain: defaultPlain,
});

/**
 * ebullition. The panel rises from the lower edge and overtops it.
 * spec: docs/BEHAVIOURS.md#boil
 */
register('boil', {
  panel(ctx, p) {
    p.el.classList.remove('b-boil');
    void p.el.offsetWidth;
    p.el.classList.add('b-boil');
  },
  plain: defaultPlain,
});

/**
 * taedium vitae. Every transition at punishing length — long enough to be a decision
 * to wait; capped generously at 7s. Nothing else on the site is slow.
 * spec: docs/BEHAVIOURS.md#torpor
 */
register('torpor', {
  mount(ctx) {
    ctx.el.classList.add('b-torpor');
  },
  panel(ctx, p) {
    p.el.classList.add('b-torpor');
  },
  plain: defaultPlain, // immediately
});

/**
 * effulgence. Light emitted from the glyphs rather than applied to them.
 * spec: docs/BEHAVIOURS.md#bloom
 */
register('bloom', {
  mount(ctx) {
    ctx.el.classList.add('b-bloom');
  },
  panel(ctx, p) {
    p.hw.style.textShadow =
      '0 0 6px rgba(255,250,232,.95), 0 0 14px rgba(255,247,222,.8), 0 0 26px rgba(255,244,212,.55)';
  },
  plain: (ctx) => ({ ...defaultPlain(ctx), classes: ['is-bloom'] }),
});

function variegateEl(el, text) {
  el.textContent = '';
  const cls = ['vg-a', 'vg-b', 'vg-c', 'vg-d'];
  const n = text.length;
  const cuts = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n];
  for (let i = 0; i < 4; i++) {
    const span = document.createElement('span');
    span.className = cls[(i + hash(text)) % 4];
    span.textContent = text.slice(cuts[i], cuts[i + 1]);
    el.append(span);
  }
}

/**
 * variegated. The sole entry permitted colour: patches, not a gradient, spent from
 * Tunnel's own accents. Everything else on the site is monochrome.
 * spec: docs/BEHAVIOURS.md#variegate
 */
register('variegate', {
  mount(ctx) {
    variegateEl(ctx.el.querySelector('.hw'), ctx.word.display ?? ctx.word.headword);
  },
  panel(ctx, p) {
    variegateEl(p.hw, ctx.word.display ?? ctx.word.headword);
  },
  plain: (ctx) => ({ ...defaultPlain(ctx), variegated: true }),
});

/**
 * sybaritic. The only entry with ornament: rules, flourishes, a decorated initial.
 * spec: docs/BEHAVIOURS.md#ornament
 */
register('ornament', {
  panel(ctx, p) {
    p.el.classList.add('b-ornament');
    const fl = document.createElement('div');
    fl.textContent = '❦ ❦ ❦';
    p.extra.append(fl);
  },
  plain: (ctx) => ({ ...defaultPlain(ctx), classes: ['is-ornament'] }),
});

/**
 * abstemious. Declines every optional style rule — no transition, no ornament, no
 * emphasis, minimum type scale. It responds, and refuses.
 * spec: docs/BEHAVIOURS.md#abstain
 */
register('abstain', {
  mount(ctx) {
    ctx.el.classList.add('b-abstain');
  },
  panel(ctx, p) {
    p.el.classList.add('b-abstain');
  },
  plain: (ctx) => ({ ...defaultPlain(ctx), classes: ['is-abstain'] }),
});

/**
 * magniloquent. A scale disproportionate to a one-clause gloss.
 * spec: docs/BEHAVIOURS.md#magnify
 */
register('magnify', {
  mount(ctx) {
    ctx.el.classList.add('b-magnify');
  },
  panel(ctx, p) {
    p.el.classList.add('b-magnify');
  },
  plain: (ctx) => ({ ...defaultPlain(ctx), classes: ['is-magnify'] }),
});

/**
 * tête à claques. Flinches away from the cursor and returns.
 * spec: docs/BEHAVIOURS.md#recoil
 */
register('recoil', {
  mount(ctx) {
    ctx.el.classList.add('b-recoil');
    ctx._flinch = (e) => {
      const r = ctx.el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - e.clientX;
      const dy = r.top + r.height / 2 - e.clientY;
      const m = Math.hypot(dx, dy) || 1;
      ctx.el.style.transform =
        `translate(calc(-50% + ${(22 * dx / m).toFixed(1)}px), calc(-50% + ${(22 * dy / m).toFixed(1)}px))`;
      clearTimeout(ctx._back);
      ctx._back = setTimeout(() => { ctx.el.style.transform = ''; }, 320);
    };
    ctx.el.addEventListener('mouseenter', ctx._flinch);
  },
  unmount(ctx) {
    ctx.el.removeEventListener('mouseenter', ctx._flinch);
    clearTimeout(ctx._back);
  },
  plain: defaultPlain,
});

/**
 * fillip. Released with momentum on activation, travels, and settles — the only
 * node that moves under its own impulse rather than the layout's forces.
 * spec: docs/BEHAVIOURS.md#flick
 */
register('flick', {
  activate(ctx) {
    const a = (hash(ctx.word.id + Date.now()) % 360) * (Math.PI / 180);
    ctx.field.impulse(ctx.word.id, Math.cos(a) * 0.045, Math.sin(a) * 0.045);
    ctx.state.session.set('flicked', true);
  },
  plain: defaultPlain,
});

/**
 * vomitorium. Activation discharges the entire node set through the edges of the
 * viewport, after which the nodes walk back in. Once per session — a crowd leaving,
 * not a fountain. spec: docs/BEHAVIOURS.md#disgorge
 */
register('disgorge', {
  activate(ctx) {
    if (ctx.state.session.get('spent')) return;
    ctx.state.session.set('spent', true);
    ctx.field.disgorge();
  },
  plain: defaultPlain,
});

function waveformSVG(seedStr) {
  let path = 'M10 40';
  for (let i = 0; i <= 90; i++) {
    const x = 10 + i * 2;
    const env = Math.sin((i / 90) * Math.PI) ** 0.6;
    const a = ((hash(seedStr + ':' + i) % 1000) / 1000 - 0.5) * 56 * env;
    path += ` L${x} ${(40 + a).toFixed(1)}`;
  }
  return (
    `<svg viewBox="0 0 200 80" width="220" height="88" role="img" ` +
    `aria-label="the waveform of a recording, rendered and not played">` +
    `<path d="${path}" stroke="var(--ink)" stroke-width="1" fill="none"/>` +
    `</svg>`
  );
}

/**
 * musique concrète. Recorded sound rather than synthesis — here, per the spec's own
 * fallback, the waveform of the recording, rendered and not played: the audio
 * dependency is not worth carrying. spec: docs/BEHAVIOURS.md#found-sound
 */
register('found-sound', {
  panel(ctx, p) {
    const fig = document.createElement('div');
    fig.innerHTML = waveformSVG(ctx.word.id);
    const cap = document.createElement('div');
    cap.className = 'p-hint';
    cap.textContent = 'tape — rendered, not played';
    p.extra.append(fig, cap);
  },
  plain: (ctx) => ({ ...defaultPlain(ctx), figure: waveformSVG(ctx.word.id) }),
});

/**
 * Integrity check. Every behaviour id referenced in words.yml must be registered, and
 * every registered behaviour must be referenced. Call once at startup with the parsed
 * word list; failing loudly here is cheaper than a silent gap in the field.
 */
export function audit(words) {
  const used = new Set(words.map((w) => w.behaviour));
  const have = new Set(registry.keys());
  const missing = [...used].filter((id) => !have.has(id));
  const orphaned = [...have].filter((id) => !used.has(id));
  const unimplemented = [...have].filter((id) => registry.get(id).__todo);
  if (missing.length) throw new Error(`words.yml references unregistered: ${missing}`);
  return { orphaned, unimplemented, coverage: 1 - unimplemented.length / have.size };
}
