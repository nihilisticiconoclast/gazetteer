/**
 * Gazetteer — behaviour registry
 *
 * One entry per `behaviour` id in data/words.yml. The specification for each lives in
 * docs/BEHAVIOURS.md and is the authority; this file is its implementation.
 *
 * Contract. A behaviour is an object with any of:
 *
 *   mount(ctx)    once, when the node enters the field
 *   enter(ctx)    the walker arrives
 *   leave(ctx)    the walker departs
 *   plain(ctx)    REQUIRED — what this entry renders as in plain view
 *   unmount(ctx)  cleanup; remove listeners and timers
 *
 * ctx = {
 *   word,     the record from words.yml
 *   el,       the node's root element
 *   panel,    the definition panel element
 *   field,    { nodes, neighbours(id), visited, steps, walker, suspend(), resume() }
 *   state,    per-word store: state.session / state.persistent (localStorage-backed)
 *   tokens    resolved Tunnel design tokens
 * }
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
  };
}

/** Placeholder for an unimplemented behaviour. Renders plain and does nothing else. */
function todo(id) {
  return {
    __todo: true,
    plain: defaultPlain,
    enter() {
      if (import.meta.env?.DEV) console.warn(`behaviour not implemented: ${id}`);
    },
  };
}

/* ------------------------------------------------------------------ *
 * Reference implementations — the three that fix the contract's shape *
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
    ctx._open = () => ctx.panel.open();
    ctx.el.addEventListener('mouseenter', ctx._open);
    ctx.el.addEventListener('focus', ctx._open);
  },
  enter(ctx) {
    ctx.panel.open(); // already open on hover; idempotent
  },
  unmount(ctx) {
    ctx.el.removeEventListener('mouseenter', ctx._open);
    ctx.el.removeEventListener('focus', ctx._open);
  },
  plain: defaultPlain,
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

/* ------------------------------------------------------------------ *
 * Awaiting implementation. Build order is the tiering in BEHAVIOURS.md *
 * ------------------------------------------------------------------ */

// Tier 1 — structural
for (const id of ['flaneur', 'ergodic', 'expunge', 'qed', 'quarantine']) {
  register(id, todo(id));
}

// Tier 2 — node-level
for (const id of [
  'deixis',
  'clasp-neighbour',
  'circumlocute',
  'dinkus',
  'mithridate',
  'catuskoti',
  'prolepsis',
  'daily',
  'typecast',
  'unsettled',
  'dictation',
  'obscure',
  'revert',
  'encomium',
  'mirror',
  'stratum',
  'residuals',
  'bearing',
]) {
  register(id, todo(id));
}

// Tier 3 — local
for (const id of [
  'cut',
  'boil',
  'torpor',
  'bloom',
  'variegate',
  'ornament',
  'abstain',
  'magnify',
  'recoil',
  'flick',
  'disgorge',
  'found-sound',
]) {
  register(id, todo(id));
}

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
