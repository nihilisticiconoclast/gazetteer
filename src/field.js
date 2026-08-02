/**
 * Gazetteer — the field
 *
 * A force layout over two axes (language of origin → x, semantic cluster → y),
 * a walker that moves between adjacent nodes, and the definition panel. Arriving
 * at a node triggers its behaviour; the entry is revealed after it resolves.
 *
 * Traversal state:
 *   gazetteer:visited   persistent — the set every behaviour writes to
 *   gazetteer:steps     persistent — steps taken, for the ergodic meter
 *   gazetteer:mode      persistent — 'manual' | 'drift', held by flâneur
 *   gazetteer:qed       persistent — whether panels close with the mark
 *   gazetteer:w:<id>    persistent — per-word behaviour state
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
  write(key, value) {
    try { localStorage.setItem('gazetteer:' + key, JSON.stringify(value)); } catch {}
  },
};

/* one layout axis: language of origin, west to east and then off the map */
const ORIGINS = ['english', 'french', 'latin', 'greek', 'arabic', 'sanskrit', 'coined'];

/* the other axis: semantic cluster, from the primary tag */
const CLUSTERS = [
  ['metatextual', 'rhetoric', 'typography', 'linguistics'],
  ['temperament', 'humours'],
  ['philosophy', 'self', 'medicine'],
  ['mathematics', 'cartography'],
  ['motion', 'light', 'art', 'architecture'],
  ['error', 'colour', 'relation', 'politics', 'crowd'],
  ['time', 'depth'],
];
function clusterOf(tags) {
  for (const t of tags) {
    const i = CLUSTERS.findIndex((c) => c.includes(t));
    if (i >= 0) return i;
  }
  return CLUSTERS.length - 1;
}

function hash(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const TOKENS = {
  duration: { instant: '60ms', base: '280ms', torpor: '7000ms' },
};

export function initField(words, container, panelEl, statusEl) {
  /* ── nodes ────────────────────────────────────────────────────────────── */
  const visited = new Set(LS.read('visited', []));
  let steps = LS.read('steps', 0);
  let mode = LS.read('mode', 'manual');
  let qed = !!LS.read('qed', false);

  const nodes = words.map((word) => {
    const ox = ORIGINS.indexOf(word.origin);
    const cy = clusterOf(word.tags);
    const j = (k) => ((hash(word.id + k) % 1000) / 1000 - 0.5);
    const label = word.display ?? word.headword;
    const node = {
      id: word.id,
      word,
      ax: 0.09 + ((ox + 0.5) / ORIGINS.length) * 0.82 + j('x') * 0.10,
      ay: 0.10 + ((cy + 0.5) / CLUSTERS.length) * 0.76 + j('y') * 0.08,
      anchorK: 0.010,
      x: 0, y: 0, vx: 0, vy: 0,
      // half-footprint in layout space: labels are wide, and magniloquent is
      // set at a scale out of proportion to everything, including the layout
      rad: 0.028 + label.length * 0.0011 * (word.behaviour === 'magnify' ? 3.2 : 1),
      jitter: 0,
      gone: false,
      el: null,
    };
    node.x = node.ax + j('px') * 0.05;
    node.y = node.ay + j('py') * 0.05;
    return node;
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const total = nodes.length;

  /* antediluvian sits at the lowest point, the water column above it */
  const stratum = nodes.find((n) => n.word.behaviour === 'stratum');
  if (stratum) {
    stratum.ay = 0.92;
    stratum.anchorK = 0.08;
  }

  /* the cordon sanitaire is placed first; everything else settles around it */
  const cordonNode = nodes.find((n) => n.word.behaviour === 'quarantine');
  let cordon = null;
  if (cordonNode) {
    cordon = { x: cordonNode.ax, y: Math.min(0.72, cordonNode.ay), w: 0.20, h: 0.26 };
    cordonNode.ax = cordon.x;
    cordonNode.ay = cordon.y;
    const zone = document.createElement('div');
    zone.className = 'cordon';
    zone.style.left = `${(cordon.x - cordon.w / 2) * 100}%`;
    zone.style.top = `${(cordon.y - cordon.h / 2) * 100}%`;
    zone.style.width = `${cordon.w * 100}%`;
    zone.style.height = `${cordon.h * 100}%`;
    container.append(zone);
  }

  /* ── DOM ──────────────────────────────────────────────────────────────── */
  for (const n of nodes) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'node';
    b.dataset.id = n.id;
    b.setAttribute('aria-label', n.word.display ?? n.word.headword);
    const hw = document.createElement('span');
    hw.className = 'hw';
    hw.textContent = n.word.display ?? n.word.headword;
    b.append(hw);
    if (visited.has(n.id)) b.classList.add('is-visited');
    container.append(b);
    n.el = b;
  }

  const walkerEl = document.createElement('div');
  walkerEl.className = 'walker';
  walkerEl.innerHTML =
    '<svg viewBox="0 0 40 40" aria-hidden="true">' +
    '<circle cx="20" cy="20" r="9" stroke="var(--route)" stroke-width="1.6" fill="none"/>' +
    '<line x1="20" y1="1" x2="20" y2="13" stroke="var(--route)" stroke-width="1.6"/>' +
    '<line x1="20" y1="27" x2="20" y2="39" stroke="var(--route)" stroke-width="1.6"/>' +
    '<line x1="1" y1="20" x2="13" y2="20" stroke="var(--route)" stroke-width="1.6"/>' +
    '<line x1="27" y1="20" x2="39" y2="20" stroke="var(--route)" stroke-width="1.6"/>' +
    '</svg>';
  container.append(walkerEl);

  /* ── per-word state and contexts ──────────────────────────────────────── */
  function makeState(id) {
    const session = new Map();
    return {
      session: {
        get: (k) => session.get(k),
        set: (k, v) => session.set(k, v),
      },
      persistent: {
        get: (k) => (LS.read('w:' + id, {}))[k],
        set: (k, v) => {
          const o = LS.read('w:' + id, {});
          o[k] = v;
          LS.write('w:' + id, o);
        },
      },
    };
  }

  const walker = { current: null, prev: null };
  let anchorsOffUntil = 0;
  const attachments = [];

  const fieldApi = {
    nodes,
    total,
    visited,
    walker,
    steps: () => steps,
    neighbours,
    mode: () => mode,
    setMode(m) {
      mode = m;
      LS.write('mode', m);
      renderStatus();
      if (m === 'drift') scheduleDrift(); else cancelDrift();
    },
    suspendAnchors(ms) { anchorsOffUntil = performance.now() + ms; },
    impulse(id, vx, vy) {
      const n = byId.get(id);
      if (!n) return;
      n.vx += vx; n.vy += vy;
      n.anchorK = 0.002; // it settles where the impulse leaves it, more or less
    },
    removeNode(id) {
      const n = byId.get(id);
      if (n) n.gone = true;
    },
    disgorge() {
      for (const n of nodes) {
        if (n.gone) continue;
        const dl = n.x, dr = 1 - n.x, dt = n.y, db = 1 - n.y;
        const m = Math.min(dl, dr, dt, db);
        const v = 0.055;
        if (m === dl) n.vx -= v;
        else if (m === dr) n.vx += v;
        else if (m === dt) n.vy -= v;
        else n.vy += v;
      }
      fieldApi.suspendAnchors(1700);
    },
    armQed() {
      qed = true;
      LS.write('qed', true);
    },
    qedArmed: () => qed,
    setJitter(id, amp) {
      const n = byId.get(id);
      if (n) n.jitter = amp;
    },
    trackWith(id, el, opts) {
      attachments.push({ id, el, dy: opts?.dy ?? 0 });
    },
  };

  const ctxOf = new Map();
  for (const n of nodes) {
    ctxOf.set(n.id, {
      word: n.word,
      el: n.el,
      panel: null, // set below, once the panel controller exists
      field: fieldApi,
      state: makeState(n.id),
      tokens: TOKENS,
    });
  }

  function neighbours(id) {
    const me = byId.get(id);
    if (!me) return [];
    return nodes
      .filter((n) => n.id !== id && !n.gone)
      .map((n) => ({ n, d: Math.hypot((n.x - me.x) * 0.55, n.y - me.y) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4)
      .map((o) => o.n);
  }

  /* ── the definition panel ─────────────────────────────────────────────── */
  const panel = {
    el: panelEl,
    openId: null,
    onRefreshExtra: null,
    parts: null,
    build(word) {
      panelEl.className = 'panel';
      panelEl.style.opacity = '';
      panelEl.innerHTML = '';
      const hw = document.createElement('h2');
      hw.className = 'p-hw';
      hw.textContent = word.display ?? word.headword;
      const gloss = document.createElement('p');
      gloss.className = 'p-gloss';
      gloss.textContent = word.gloss;
      const meta = document.createElement('div');
      meta.className = 'p-meta';
      const src = word.source || {};
      meta.innerHTML =
        `<span>${word.etymon}</span>` +
        `<span>attested ${word.attested}</span>` +
        `<span>source ${src.book ?? 'TODO'}${src.author ? ', ' + src.author : ''}` +
        `${src.page ? ', p. ' + src.page : ''}</span>`;
      const extra = document.createElement('div');
      extra.className = 'p-extra';
      const note = document.createElement('p');
      note.className = 'p-note';
      if (word.note) note.textContent = word.note.trim();
      panelEl.append(hw, gloss, meta, extra, note);
      return { el: panelEl, hw, gloss, meta, extra, note };
    },
    openFor(id, opts) {
      const ctx = ctxOf.get(id);
      if (!ctx) return;
      this.onRefreshExtra = null;
      const parts = this.build(ctx.word);
      this.parts = parts;
      this.openId = id;
      const b = getBehaviour(ctx.word.behaviour);
      if (b.panel) b.panel(ctx, parts);
      if (opts?.instant) panelEl.style.transitionDuration = TOKENS.duration.instant;
      else panelEl.style.transitionDuration = '';
      requestAnimationFrame(() => panelEl.classList.add('is-open'));
    },
    reopen() {
      if (this.openId) this.openFor(this.openId);
    },
    close() {
      if (!this.openId) return;
      const closing = this.openId;
      const finish = () => {
        if (this.openId !== closing) return; // reopened in the meantime
        panelEl.classList.remove('is-open');
        this.openId = null;
      };
      if (qed && this.parts) {
        const mark = document.createElement('div');
        mark.className = 'qed-mark';
        mark.textContent = '∎';
        panelEl.append(mark);
        setTimeout(finish, 420);
      } else {
        finish();
      }
    },
    isOpen() { return this.openId != null; },
  };
  for (const ctx of ctxOf.values()) ctx.panel = panel;

  /* ── mount behaviours ─────────────────────────────────────────────────── */
  for (const n of nodes) {
    const b = getBehaviour(n.word.behaviour);
    if (b.mount) b.mount(ctxOf.get(n.id));
  }

  /* ── the walk ─────────────────────────────────────────────────────────── */
  let arriveTimer = null;
  let driftTimer = null;
  let leftCurrent = false;

  /* a node is "left" either when the walker departs or when its panel is
     dismissed — solus and its kind hold the field only while the entry is open */
  function leaveNode(node) {
    if (!node || leftCurrent) return;
    leftCurrent = true;
    const b = getBehaviour(node.word.behaviour);
    if (b.leave) b.leave(ctxOf.get(node.id));
  }

  function walkTo(id) {
    const target = byId.get(id);
    if (!target || target.gone) return;
    const from = walker.current;
    if (from && from.id === id) return;
    if (from) {
      leaveNode(from);
      from.el.classList.remove('is-current');
    }
    panel.close();
    walker.prev = from;
    walker.current = target;
    target.el.classList.add('is-current');
    clearTimeout(arriveTimer);
    arriveTimer = setTimeout(() => arrive(target), 830);
    renderStatus();
  }

  function arrive(node) {
    if (node.gone) return;
    leftCurrent = false;
    visited.add(node.id);
    LS.write('visited', [...visited]);
    steps += 1;
    LS.write('steps', steps);
    node.el.classList.add('is-visited');
    const ctx = ctxOf.get(node.id);
    const b = getBehaviour(node.word.behaviour);
    const res = b.enter ? b.enter(ctx) : undefined;
    Promise.resolve(res).then((r) => {
      if (walker.current !== node) return;
      if (!(r && r.panel === false)) panel.openFor(node.id);
    });
    if (mode === 'drift') scheduleDrift();
    renderStatus();
  }

  function activateCurrent() {
    const node = walker.current;
    if (!node) return;
    const b = getBehaviour(node.word.behaviour);
    const ctx = ctxOf.get(node.id);
    if (b.activate) b.activate(ctx);
    else if (!panel.isOpen()) panel.openFor(node.id);
  }

  function scheduleDrift() {
    cancelDrift();
    driftTimer = setTimeout(() => {
      if (mode !== 'drift') return;
      const cur = walker.current;
      const opts = cur ? neighbours(cur.id) : nodes.filter((n) => !n.gone);
      if (!opts.length) return;
      const fresh = opts.filter((n) => !visited.has(n.id));
      const pool = fresh.length ? fresh : opts;
      walkTo(pool[Math.floor(Math.random() * pool.length)].id);
    }, 3800);
  }
  function cancelDrift() { clearTimeout(driftTimer); }

  /* ── input ────────────────────────────────────────────────────────────── */
  container.addEventListener('click', (e) => {
    const el = e.target.closest('.node');
    if (!el) {
      // empty terrain: dismiss the entry, which is also how solus lets go
      panel.close();
      leaveNode(walker.current);
      return;
    }
    const id = el.dataset.id;
    if (walker.current && walker.current.id === id) activateCurrent();
    else walkTo(id);
  });

  const DIRS = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  };
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea')) return;
    if (DIRS[e.key]) {
      e.preventDefault();
      const cur = walker.current;
      if (!cur) { walkTo(nodes.find((n) => !n.gone).id); return; }
      const [dx, dy] = DIRS[e.key];
      let best = null;
      let bestScore = 0.25;
      for (const n of neighbours(cur.id)) {
        const vx = n.x - cur.x, vy = n.y - cur.y;
        const m = Math.hypot(vx, vy) || 1;
        const score = (vx * dx + vy * dy) / m;
        if (score > bestScore) { bestScore = score; best = n; }
      }
      if (best) walkTo(best.id);
    } else if (e.key === 'Enter' && walker.current) {
      if (document.activeElement === walker.current.el ||
          !document.activeElement.closest('.panel')) {
        activateCurrent();
      }
    } else if (e.key === 'Escape') {
      panel.close();
      leaveNode(walker.current);
    }
  });

  function renderStatus() {
    if (!statusEl) return;
    const cur = walker.current;
    statusEl.innerHTML =
      `<span>${mode === 'drift' ? 'drift' : 'drive'}</span>` +
      `<span>${cur ? (cur.word.display ?? cur.word.headword) : 'overview'}</span>`;
  }

  /* ── the simulation ───────────────────────────────────────────────────── */
  function step(now) {
    const anchorsOn = now > anchorsOffUntil;
    for (const n of nodes) {
      if (n.gone) continue;
      if (anchorsOn) {
        n.vx += (n.ax - n.x) * n.anchorK;
        n.vy += (n.ay - n.y) * n.anchorK;
      }
      if (n.jitter) {
        n.vx += (Math.random() - 0.5) * n.jitter;
        n.vy += (Math.random() - 0.5) * n.jitter;
      }
    }
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (a.gone) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (b.gone) continue;
        const dx = (b.x - a.x) * 0.5, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const d0 = a.rad + b.rad;
        if (d < d0) {
          const f = 0.0006 * (d0 - d) / d;
          a.vx -= dx * f; a.vy -= dy * f;
          b.vx += dx * f; b.vy += dy * f;
        }
      }
    }
    for (const n of nodes) {
      if (n.gone) continue;
      if (cordon && n.word.behaviour !== 'quarantine') {
        const hw = cordon.w / 2 + 0.015, hh = cordon.h / 2 + 0.015;
        const dx = n.x - cordon.x, dy = n.y - cordon.y;
        if (Math.abs(dx) < hw && Math.abs(dy) < hh) {
          const px = hw - Math.abs(dx), py = hh - Math.abs(dy);
          if (px < py) n.vx += Math.sign(dx || 1) * px * 0.06;
          else n.vy += Math.sign(dy || 1) * py * 0.06;
        }
      }
      n.vx *= 0.86; n.vy *= 0.86;
      n.x += n.vx; n.y += n.vy;
    }
    // positional separation: anchors may not hold two labels on one spot
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (a.gone) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (b.gone) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        if (dx === 0 && dy === 0) dx = 0.001 * (i - j);
        const d = Math.hypot(dx * 0.5, dy) || 0.0001;
        const d0 = a.rad + b.rad;
        if (d < d0) {
          const m = Math.hypot(dx, dy) || 0.0001;
          const push = ((d0 - d) / d0) * 0.042;
          a.x -= (dx / m) * push; a.y -= (dy / m) * push;
          b.x += (dx / m) * push; b.y += (dy / m) * push;
        }
      }
    }
    for (const n of nodes) {
      if (n.gone) continue;
      if (anchorsOn) {
        n.x = Math.min(0.95, Math.max(0.05, n.x));
        n.y = Math.min(0.94, Math.max(0.05, n.y));
        if (stratum && n !== stratum) n.y = Math.min(0.85, n.y);
      }
    }
  }

  function render() {
    for (const n of nodes) {
      if (n.gone) continue;
      n.el.style.left = `${(n.x * 100).toFixed(2)}%`;
      n.el.style.top = `${(n.y * 100).toFixed(2)}%`;
    }
    for (const a of attachments) {
      const n = byId.get(a.id);
      if (!n || n.gone) continue;
      a.el.style.left = `${(n.x * 100).toFixed(2)}%`;
      a.el.style.top = `calc(${(n.y * 100).toFixed(2)}% + ${a.dy}px)`;
    }
    if (walker.current) {
      walkerEl.style.left = `${(walker.current.x * 100).toFixed(2)}%`;
      walkerEl.style.top = `${(walker.current.y * 100).toFixed(2)}%`;
    }
  }

  for (let i = 0; i < 320; i++) step(0); // settle before first paint
  render();

  function loop(now) {
    step(now);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* the walker starts on the flâneur if the reader has never walked, otherwise
     wherever is nearest the centre — an overview with the reins in hand */
  const start =
    (visited.size === 0 && nodes.find((n) => n.word.behaviour === 'flaneur')) ||
    nodes.filter((n) => !n.gone)
      .sort((a, b) => Math.hypot(a.x - 0.5, a.y - 0.5) - Math.hypot(b.x - 0.5, b.y - 0.5))[0];
  walkTo(start.id);
  if (mode === 'drift') scheduleDrift();
  renderStatus();

  return fieldApi;
}
