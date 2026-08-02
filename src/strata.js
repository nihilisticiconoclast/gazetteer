/**
 * Gazetteer — the stratigraphic section
 *
 * Words plotted against date of first attestation, oldest at the base.
 * Antediluvian anchors the bottom of the section as its floor, whatever its own
 * attestation says — the word means "from before the record". Mimeomia is not in
 * the section at all: it was coined rather than attested, and the chart shows
 * that gap honestly rather than give a neologism a false floor.
 *
 * The dates themselves are century-level placeholders, unverified against the
 * OED — data/words.yml says so — and the caption on the section says so too.
 */

const BAND_ORDER = ['antiquity', '14c', '16c', '17c', '18c', '19c', '20c'];

function bandOf(attested) {
  const a = String(attested).toLowerCase();
  if (a === 'ancient' || a === 'antiquity') return 'antiquity';
  if (/^\d{4}$/.test(a)) return `${Math.floor((Number(a) - 1) / 100) + 1}c`;
  return a;
}

export function renderStrata(words, container) {
  container.innerHTML = '';

  const floor = [];
  const gap = [];
  const bands = new Map(BAND_ORDER.map((b) => [b, []]));
  for (const w of words) {
    if (w.behaviour === 'stratum') { floor.push(w); continue; }
    if (w.origin === 'coined' || String(w.attested) === 'coined') { gap.push(w); continue; }
    const b = bandOf(w.attested);
    if (!bands.has(b)) bands.set(b, []);
    bands.get(b).push(w);
  }

  const list = document.createElement('ol');
  list.className = 'strata';
  list.setAttribute('aria-label', 'words by date of first attestation, oldest at the base');

  /* youngest at the top of the section, oldest at the base, floor last */
  const labels = [...bands.keys()].sort((a, b) => BAND_ORDER.indexOf(b) - BAND_ORDER.indexOf(a));
  for (const label of labels) {
    const ws = bands.get(label);
    if (!ws.length) continue;
    const li = document.createElement('li');
    li.className = 'band' + (label === '17c' ? ' is-index' : '');
    const yr = document.createElement('span');
    yr.className = 'year';
    yr.textContent = label;
    const row = document.createElement('p');
    row.className = 'band-words';
    for (const w of ws) {
      const s = document.createElement('span');
      s.textContent = w.display ?? w.headword;
      if (/^\d{4}$/.test(String(w.attested))) {
        const y = document.createElement('small');
        y.className = 'year';
        y.textContent = ` ${w.attested}`;
        s.append(y);
      }
      row.append(s);
    }
    li.append(yr, row);
    list.append(li);
  }

  for (const w of floor) {
    const li = document.createElement('li');
    li.className = 'band floor';
    const yr = document.createElement('span');
    yr.className = 'year';
    yr.textContent = 'floor';
    const row = document.createElement('p');
    row.className = 'band-words';
    const s = document.createElement('span');
    s.textContent = w.display ?? w.headword;
    row.append(s);
    li.append(yr, row);
    list.append(li);
  }

  container.append(list);

  for (const w of gap) {
    const note = document.createElement('p');
    note.className = 'strata-gap';
    note.textContent =
      `${w.display ?? w.headword} is not in the section: coined, not attested. ` +
      `The gap is the honest rendering — the one word here with no history is the ` +
      `one about being read as a type.`;
    container.append(note);
  }

  const caveat = document.createElement('p');
  caveat.className = 'strata-gap';
  caveat.textContent =
    'The attestation dates are century-level placeholders, not yet verified against ' +
    'the OED; until that pass is done this section is a sketch of the strata, not a ' +
    'survey of them.';
  container.append(caveat);
}
