// Part 8, error correction in memory: a word stored with Hamming check bits, a bit flipped by a fault, the checks
// recomputed on reading, and the syndrome pointing at the bad bit (single-error correction); then the extra
// overall parity bit that tells one error, which it corrects, from two, which it can only report.
(function (S) {
  'use strict';
  const K = S.Kit, L = K.live;
  const H = () => S.Bool.Numbers.hamming;
  const title = (key, x, y, text, cls, size) => ({ key, kind: 'text', x, y, text, cls: cls || 'strong', size: size || 15 });

  S.family({ id: 'p8-ecc', part: 'memory', order: 20, title: 'Error-correcting memory', blurb: 'Hamming codes: check bits stored beside the data, a flipped bit found by the pattern of failed checks, and corrected.' });

  const W = 40, GAP = 6, X0 = 130;
  const px = (pos, secded) => X0 + (secded ? pos : pos - 1) * (W + GAP);
  /**
   * The picture of a code word and its checks.
   * o: {code: [bits by position, index 0 = P0 or unused], n, r, secded, roles(pos) -> 'p' | 'd' | 'p0', flip: Set of
   *   positions, fixed: position, rows: [{p, label, upto (show marks), result: 'even' | 'odd' | null, value}],
   *   caption, rowHot: index, blank: Set of positions with no value yet}
   */
  function word(o) {
    const items = [];
    const first = o.secded ? 0 : 1;
    for (let pos = first; pos <= o.n; pos++) {
      const role = pos === 0 ? 'p0' : (pos & (pos - 1)) === 0 ? 'p' : 'd';
      const v = o.blank && o.blank.has(pos) ? '' : String(o.code[pos]);
      const cls = 'p4-bit' + (o.flip && o.flip.has(pos) ? ' flip' : pos === o.fixed ? ' good' : role === 'd' ? (v === '1' ? ' one' : '') : ' par');
      items.push({ key: 'b' + pos, kind: 'cell', x: px(pos, o.secded), y: 50, w: W, h: 36, text: v, cls, size: 17 });
      items.push({ key: 'n' + pos, kind: 'text', x: px(pos, o.secded) + W / 2, y: 40, text: String(pos), anchor: 'middle', cls: 'p4-note', size: 12 });
      items.push({ key: 'r' + pos, kind: 'text', x: px(pos, o.secded) + W / 2, y: 104, text: role === 'p0' ? 'P0' : (role === 'p' ? 'P' : 'D') + pos, anchor: 'middle', cls: 'p4-mono', size: 12 });
    }
    items.push({ key: 'wl', kind: 'text', x: X0 - 12, y: 74, text: o.label || 'word', anchor: 'end', cls: 'strong', size: 14 });
    items.push({ key: 'pl', kind: 'text', x: X0 - 12, y: 40, text: 'position', anchor: 'end', cls: 'p4-note', size: 12 });
    (o.rows || []).forEach((row, j) => {
      const y = 126 + j * 40;
      items.push({ key: 'cl' + j, kind: 'text', x: X0 - 12, y: y + 20, text: row.label, anchor: 'end', cls: 'p4-mono' + (j === o.rowHot ? ' hot' : ''), size: 13 });
      for (let pos = first; pos <= o.n; pos++) {
        const covers = row.p === 0 ? true : (pos & row.p) !== 0;
        if (!covers) continue;
        items.push({ key: 'm' + j + ':' + pos, kind: 'cell', x: px(pos, o.secded) + 6, y, w: W - 12, h: 28, text: o.blank && o.blank.has(pos) ? '' : String(o.code[pos]), cls: 'p8-cov' + (row.result ? ' ' + row.result : '') + (j === o.rowHot ? '' : o.rowHot !== undefined ? ' dim' : ''), size: 12 });
      }
      if (row.note) items.push({ key: 'cr' + j, kind: 'text', x: px(o.n, o.secded) + W + 16, y: y + 20, text: row.note, cls: 'p4-mono' + (row.result === 'odd' ? ' bad' : row.result === 'even' ? ' good' : ''), size: 13 });
    });
    if (o.caption) items.push(title('cap', X0 - 120, 0, o.caption));
    return items;
  }
  const parseData = (v) => String(v).replace(/\s+/g, '');
  const dataCheck = (v) => (/^[01]{4,11}$/.test(parseData(v)) ? null : 'Data: 4 to 11 bits');

  // ---------------------------------------------------------------------------------------------------
  // Hamming SEC
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'hamming-sec', family: 'p8-ecc', order: 10, title: 'Hamming code: correcting a flipped bit',
    blurb: 'Number the bit positions from 1. Check bits sit at 1, 2, 4, 8…; check bit p makes even the group of positions whose number has bit p set. A single flipped bit fails exactly the checks of its own position number, so the failed checks, read as a binary number, point straight at it.',
    inputs: [
      { id: 'data', kind: 'text', label: 'Data bits', def: '1011', check: dataCheck },
      { id: 'flip', kind: 'number', label: 'Flip position (0 for none)', def: 6, min: 0, max: 15, check: (v, inp) => { const m = parseData(inp.data).length; let r = 0; while ((1 << r) < m + r + 1) r++; return v > m + r ? 'Flip position: 0 to ' + (m + r) : null; } },
    ],
    presets: [
      { label: '1011, flip position 6', values: { data: '1011', flip: 6 } },
      { label: '1011, no error', values: { data: '1011', flip: 0 } },
      { label: '1011, a check bit flips (4)', values: { data: '1011', flip: 4 } },
      { label: '8 data bits 11001010, flip 11', values: { data: '11001010', flip: 11 } },
    ],
    counters: [{ id: 'checks', label: 'checks' }],
    run(inp) {
      const data = parseData(inp.data), enc = H().encode(data), n = enc.n, r = enc.r;
      const code = [0].concat(enc.code.split('').map(Number));
      const F = new S.Frames(['checks']);
      const pars = [...Array(r).keys()].map((i) => 1 << i);
      const blank = new Set(pars);
      F.add({ items: word({ code, n, blank, label: 'code word', caption: 'data ' + data + ': ' + data.length + ' data bits, ' + r + ' check bits' }), say: enc.trace[0].say + ' The data bits fill positions ' + [...Array(n).keys()].map((i) => i + 1).filter((p) => p & (p - 1)).join(', ') + ' in order.', scene: 'w' });
      const rows = [];
      pars.forEach((p, i) => {
        const tr = enc.trace[1 + i];
        rows.push({ p, label: 'P' + p + ' group', note: 'P' + p + ' = ' + tr.bit, result: 'even' });
        blank.delete(p);
        F.count('checks');
        F.add({ items: word({ code, n, blank, rows, rowHot: i, label: 'code word', caption: 'computing the check bits' }), say: tr.say, scene: 'w', meta: { parity: p, bit: tr.bit } });
      });
      F.add({ items: word({ code, n, rows, label: 'stored', caption: 'stored in memory: ' + enc.code }), say: 'The ' + n + '-bit word ' + enc.code + ' is stored. Every group now has an even number of 1s.', scene: 'w' });
      const got = code.slice();
      const flip = inp.flip;
      if (flip) got[flip] ^= 1;
      const read = got.slice(1).join('');
      F.add({ items: word({ code: got, n, flip: new Set(flip ? [flip] : []), label: 'read', caption: flip ? 'a fault flips position ' + flip : 'read back unchanged' }), say: flip ? 'While stored, a fault flips the bit at position ' + flip + ' (' + ((flip & (flip - 1)) === 0 ? 'a check bit' : 'a data bit') + '): ' + code[flip] + ' becomes ' + got[flip] + '. The word read back is ' + read + '.' : 'No fault this time: the word read back is ' + read + '.', scene: 'w', meta: { flip } });
      const dec = H().decode(read);
      const chk = [];
      pars.forEach((p, i) => {
        const tr = dec.trace[i];
        chk.push({ p, label: 'check ' + p, note: tr.bit ? 'odd → 1' : 'even → 0', result: tr.bit ? 'odd' : 'even' });
        F.add({ items: word({ code: got, n, flip: new Set(flip ? [flip] : []), rows: chk, rowHot: i, label: 'read' }), say: tr.say, scene: 'w', meta: { check: p, bit: tr.bit } });
      });
      const syn = dec.syndrome;
      const fixed = got.slice();
      if (dec.status === 'corrected') fixed[dec.position] ^= 1;
      const last = dec.trace[dec.trace.length - 1].say.replace(/^The syndrome is [01]+ = \d+:\s*|^The syndrome is 0:\s*/, '');
      const sayEnd = last[0].toUpperCase() + last.slice(1) + (dec.status === 'corrected' ? ' The corrected word is ' + fixed.slice(1).join('') + ', and the data is ' + dec.data + '.' : dec.status === 'ok' ? ' The data is ' + dec.data + '.' : '');
      F.add({ items: word({ code: fixed, n, fixed: dec.position, rows: chk, label: 'corrected', caption: 'syndrome ' + syn.toString(2).padStart(r, '0') + ' = ' + syn }), say: 'Read the failed checks as a binary number, check ' + pars.slice().reverse().join(', ') + ' from the left: the syndrome is ' + syn.toString(2).padStart(r, '0') + ' = ' + syn + '. ' + sayEnd, scene: 'w', meta: { end: true, syn } });
      L.views(F.list);
      const def = { sections: [{ id: 'eq', kind: 'math', title: 'Hamming SEC', text: ['positions 1..' + n + '; check bits at ' + pars.join(', '), ...pars.map((p) => 'P' + p + ' covers ' + [...Array(n).keys()].map((i) => i + 1).filter((q) => q & p).join(', ')), 'syndrome = the checks that fail,', '           as a binary number', '= the position of a single wrong bit'].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.parity !== undefined, pick: 'option', ask: 'What will this check bit be?', options: ['0', '1'], answer: (fr, i) => String(fr[i + 1].meta.bit), explain: (fr, i) => fr[i + 1].say },
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.check !== undefined, pick: 'option', ask: 'Will this check pass (even) or fail (odd)?', options: ['passes (even)', 'fails (odd)'], answer: (fr, i) => (fr[i + 1].meta.bit ? 'fails (odd)' : 'passes (even)'), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'How many check bits does a Hamming code need for 8 data bits?', options: ['3', '4', '5', '8'], answer: 1, why: '2^4 = 16 ≥ 8 + 4 + 1.' },
      { q: 'Check bit P2 covers the positions…', options: ['1, 3, 5, 7', '2, 3, 6, 7', '4, 5, 6, 7', '2, 4, 6, 8'], answer: 1, why: 'Those whose number has the 2s bit set.' },
      { q: 'Checks 1 and 4 fail, check 2 passes. Which bit is wrong?', options: ['3', '5', '6', '4'], answer: 1, why: '4 + 1 = 5.' },
      { q: 'If the flipped bit is a check bit itself, the syndrome…', options: ['is 0', 'points at that check bit', 'points at a data bit', 'cannot be computed'], answer: 1, why: 'A check bit at position p fails only its own check: syndrome = p.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // SEC-DED
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'hamming-secded', family: 'p8-ecc', order: 20, title: 'SEC-DED: one error corrected, two detected',
    blurb: 'Add one more bit, P0, that makes the whole word even. One flipped bit makes the word odd and gives a syndrome: correct it. Two flipped bits leave the word even but still give a syndrome: report a double error, which cannot be corrected.',
    inputs: [
      { id: 'data', kind: 'text', label: 'Data bits', def: '1011', check: dataCheck },
      { id: 'flips', kind: 'text', label: 'Positions to flip', def: '3, 6', check: (v, inp) => { const m = parseData(inp.data).length; let r = 0; while ((1 << r) < m + r + 1) r++; const xs = String(v).split(/[\s,]+/).filter(Boolean); if (xs.length > 2 || xs.some((x) => !/^\d+$/.test(x) || +x > m + r)) return 'Positions: none, one or two, from 0 to ' + (m + r); if (xs.length === 2 && xs[0] === xs[1]) return 'Positions: two different ones'; return null; } },
    ],
    presets: [
      { label: 'Two flips: 3 and 6', values: { data: '1011', flips: '3, 6' } },
      { label: 'One flip: 5', values: { data: '1011', flips: '5' } },
      { label: 'No flips', values: { data: '1011', flips: '' } },
      { label: 'P0 itself flips', values: { data: '1011', flips: '0' } },
      { label: '8 data bits, flips 2 and 9', values: { data: '10010111', flips: '2, 9' } },
    ],
    counters: [{ id: 'flips', label: 'bits flipped' }],
    run(inp) {
      const data = parseData(inp.data), enc = H().encode(data, { secded: true }), n = enc.n, r = enc.r;
      const code = enc.code.split('').map(Number); // index 0 is P0, then positions 1..n
      const pars = [...Array(r).keys()].map((i) => 1 << i);
      const F = new S.Frames(['flips']);
      const encRows = pars.map((p) => ({ p, label: 'P' + p + ' group', note: 'P' + p + ' = ' + code[p], result: 'even' })).concat([{ p: 0, label: 'whole word', note: 'P0 = ' + code[0], result: 'even' }]);
      F.add({ items: word({ code, n, secded: true, rows: encRows.slice(0, r), label: 'code word', caption: 'Hamming code for ' + data }), say: 'First the ordinary Hamming code: ' + data.length + ' data bits and ' + r + ' check bits at ' + pars.join(', ') + ', each making its group even.', scene: 'w' });
      F.add({ items: word({ code, n, secded: true, rows: encRows, rowHot: r, label: 'stored', caption: 'plus P0 over the whole word' }), say: enc.trace.find((t) => t.kind === 'ham-overall').say + ' The stored word is ' + enc.code + ' (P0 first).', scene: 'w', meta: { p0: code[0] } });
      const flips = String(inp.flips).split(/[\s,]+/).filter(Boolean).map(Number);
      const got = code.slice();
      for (const p of flips) got[p] ^= 1;
      F.set('flips', flips.length);
      F.add({ items: word({ code: got, n, secded: true, flip: new Set(flips), label: 'read', caption: flips.length ? 'faults at ' + flips.join(' and ') : 'no fault' }), say: flips.length ? (flips.length === 1 ? 'A fault flips position ' + flips[0] : 'Faults flip positions ' + flips.join(' and ')) + '. The word read back is ' + got.join('') + '.' : 'Nothing flips. The word read back is ' + got.join('') + '.', scene: 'w', meta: { nflips: flips.length } });
      const dec = H().decode(got.join(''), { secded: true });
      const chk = pars.map((p, i) => ({ p, label: 'check ' + p, note: dec.trace[i].bit ? 'odd → 1' : 'even → 0', result: dec.trace[i].bit ? 'odd' : 'even' }));
      F.add({ items: word({ code: got, n, secded: true, flip: new Set(flips), rows: chk, label: 'read' }), say: 'The Hamming checks: ' + chk.map((c) => 'check ' + c.p + ' ' + (c.result === 'odd' ? 'fails' : 'passes')).join(', ') + '. Syndrome = ' + dec.syndrome.toString(2).padStart(r, '0') + ' = ' + dec.syndrome + '.', scene: 'w' });
      const ov = dec.trace.find((t) => t.kind === 'ham-overall');
      const all = chk.concat([{ p: 0, label: 'whole word', note: ov.bit ? 'odd' : 'even', result: ov.bit ? 'odd' : 'even' }]);
      F.add({ items: word({ code: got, n, secded: true, flip: new Set(flips), rows: all, rowHot: r, label: 'read' }), say: ov.say, scene: 'w', meta: { ask: true } });
      const verdict = { ok: 'no error', corrected: 'one error, corrected', p0: 'one error (in P0), corrected', double: 'two errors, detected only', detected: 'more than one error' }[dec.status];
      const fixed = got.slice();
      if (dec.status === 'corrected') fixed[dec.position] ^= 1;
      if (dec.status === 'p0') fixed[0] ^= 1;
      const tbl = K.table.draw({ prefix: 'dt', x: X0, y: 126 + (r + 1) * 40 + 24, size: 13, ch: 30, colHead: ['syndrome', 'whole word', 'meaning'], rows: [['0', 'even', 'no error'], ['≠ 0', 'odd', 'one error: correct it'], ['0', 'odd', 'P0 itself flipped'], ['≠ 0', 'even', 'two errors: detect only']],
        cls: (rr) => (['ok', 'corrected', 'p0', 'double'][rr] === dec.status ? 'act' : '') });
      F.add({ items: word({ code: dec.status === 'double' || dec.status === 'detected' ? got : fixed, n, secded: true, flip: dec.status === 'double' ? new Set(flips) : null, fixed: dec.status === 'corrected' ? dec.position : dec.status === 'p0' ? 0 : undefined, rows: all, label: dec.status === 'double' ? 'reported' : 'result', caption: verdict }).concat(tbl.items), say: dec.trace[dec.trace.length - 1].say + (dec.data ? ' Data: ' + dec.data + '.' : ' The memory system reports the word as bad.'), scene: 'w', meta: { end: true, status: dec.status } });
      L.views(F.list);
      const def = { sections: [{ id: 'eq', kind: 'math', title: 'SEC-DED', text: ['P0 = parity of the whole word', 'syndrome 0, word even: no error', 'syndrome s, word odd: bit s wrong, fix it', 'syndrome 0, word odd: P0 wrong', 'syndrome s, word even: two errors'].join('\n') }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, pick: 'option', ask: 'What will the memory decide?', options: ['no error', 'one error, corrected', 'one error (in P0), corrected', 'two errors, detected only'], answer: (fr) => ({ ok: 'no error', corrected: 'one error, corrected', p0: 'one error (in P0), corrected', double: 'two errors, detected only' })[fr[fr.length - 1].meta.status] || null, explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: 'With two bits flipped, the overall parity is…', options: ['odd', 'even', 'unknown', 'always 1'], answer: 1, why: 'Two flips cancel in the overall parity.' },
      { q: 'Syndrome nonzero and overall parity odd means…', options: ['two errors', 'one error at the syndrome\'s position', 'no error', 'P0 is wrong'], answer: 1, why: 'One flip changes the overall parity and points to itself.' },
      { q: 'Why can SEC-DED not correct a double error?', options: ['The syndrome then points at the wrong bit', 'It has no syndrome', 'P0 is lost', 'It can'], answer: 0, why: 'The syndrome is the XOR of the two positions, a third, innocent position.' },
      { q: 'How many check bits in all does SEC-DED need for 64 data bits?', options: ['7', '8', '9', '64'], answer: 1, why: '7 Hamming check bits (2^7 ≥ 64 + 7 + 1) plus P0: the usual 72-bit memory word.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
