/**
 * Gazetteer — the plain view
 *
 * The entire philavery as a static definition list, alphabetised, with every
 * gloss, etymon, date and source visible and no behaviour attached — except as
 * each behaviour's plain() declares. This view is a first-class deliverable:
 * several field behaviours are hostile to reading by design, and this is where
 * their entries are guaranteed legible. See CLAUDE.md.
 */

import { get as getBehaviour } from './behaviours.js';

const LS = {
  read(key, fallback) {
    try {
      const v = localStorage.getItem('gazetteer:' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
};

function makeState(id) {
  const session = new Map();
  return {
    session: { get: (k) => session.get(k), set: (k, v) => session.set(k, v) },
    persistent: {
      get: (k) => (LS.read('w:' + id, {}))[k],
      set: () => {}, // the plain view reads traversal state; it does not advance it
    },
  };
}

function metaHTML(d) {
  const src = d.source || {};
  return (
    `<span>${d.etymon}</span> · <span>attested ${d.attested}</span> · ` +
    `<span>source ${src.book ?? 'TODO'}${src.author ? ', ' + src.author : ''}` +
    `${src.page ? ', p. ' + src.page : ''}</span>`
  );
}

export function renderPlain(words, container) {
  const coverage = {
    visited: new Set(LS.read('visited', [])).size,
    total: words.length,
    steps: LS.read('steps', 0),
  };

  /* alphabetised — the one arrangement the field refuses — except that
     alacrity's plain() claims first place regardless, per its spec */
  const sorted = [...words].sort((a, b) =>
    (a.display ?? a.headword).localeCompare(b.display ?? b.headword, 'en', { sensitivity: 'base' }));

  const results = [];
  // two passes: directives like `first` change the order the list resolves in,
  // and deixis/encomium/mirror need their neighbours in the FINAL order
  let order = sorted;
  for (let pass = 0; pass < 2; pass++) {
    results.length = 0;
    for (let i = 0; i < order.length; i++) {
      const word = order[i];
      const ctx = {
        word,
        state: makeState(word.id),
        coverage,
        list: {
          index: i,
          total: order.length,
          prev: order[i - 1] ?? null,
          next: order[i + 1] ?? null,
        },
      };
      results.push({ word, d: getBehaviour(word.behaviour).plain(ctx) });
    }
    const firsts = results.filter((r) => r.d.first).map((r) => r.word);
    const rest = order.filter((w) => !firsts.includes(w));
    const next = [...firsts, ...rest];
    if (next.every((w, i) => w === order[i])) break;
    order = next;
  }

  container.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'philavery';
  let endMark = false;

  for (const { word, d } of results) {
    if (d.divider) {
      const div = document.createElement('div');
      div.className = 'plain-divider';
      div.textContent = '⁂';
      list.append(div);
    }

    const entry = document.createElement('div');
    entry.className = 'entry';
    entry.id = 'w-' + word.id;
    for (const c of d.classes ?? []) entry.classList.add(c);
    if (d.struck) entry.classList.add('is-struck');
    if (d.ruled) entry.classList.add('is-ruled');
    if (d.floor) entry.classList.add('is-floor');

    const hw = document.createElement('h3');
    hw.className = 'e-hw';
    hw.textContent = d.headword;
    if (d.variegated) {
      hw.textContent = '';
      const text = d.headword;
      const cls = ['vg-a', 'vg-b', 'vg-c', 'vg-d'];
      const cuts = [0, 0.25, 0.5, 0.75, 1].map((k) => Math.floor(text.length * k));
      for (let i = 0; i < 4; i++) {
        const span = document.createElement('span');
        span.className = cls[i];
        span.textContent = text.slice(cuts[i], cuts[i + 1]);
        hw.append(span);
      }
    }

    const gloss = document.createElement('p');
    gloss.className = 'e-gloss';
    if (d.gloss != null) gloss.textContent = d.gloss;

    const meta = document.createElement('div');
    meta.className = 'e-meta';
    meta.innerHTML = metaHTML(d);

    if (d.glossAbove) entry.append(gloss, hw, meta);
    else entry.append(hw, gloss, meta);

    if (d.mirrorPrev) {
      const prev = results[results.findIndex((r) => r.word === word) - 1];
      if (prev) {
        const echo = document.createElement('p');
        echo.className = 'e-gloss';
        echo.style.fontStyle = 'italic';
        echo.textContent = prev.d.gloss ?? '';
        gloss.after(echo);
      }
    }

    if (d.figure) {
      const fig = document.createElement('div');
      fig.innerHTML = d.figure;
      entry.append(fig);
    }
    for (const line of d.extra ?? []) {
      const ex = document.createElement('div');
      ex.className = 'e-extra';
      ex.textContent = line;
      entry.append(ex);
    }
    if (d.note) {
      const note = document.createElement('p');
      note.className = 'e-note';
      note.textContent = String(d.note).trim();
      entry.append(note);
    }
    if (d.deletable) {
      entry.title = 'expungeable';
      entry.addEventListener('click', () => entry.remove()); // restored on reload
    }
    if (d.endMark) endMark = true;

    list.append(entry);
  }

  container.append(list);
  if (endMark) {
    const mark = document.createElement('div');
    mark.className = 'plain-close';
    mark.textContent = '∎';
    container.append(mark);
  }
}
