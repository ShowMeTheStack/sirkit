// Part 1, codes: BCD addition with the +6 correction, the weighted and self-complementing decimal codes, Gray code on
// a turning encoder disc, ASCII with a parity bit, and Hamming codes with their parity circles and syndrome.
(function (S) {
  'use strict';
  const K = S.Kit, N = K.num;
  const B = () => S.Bool;
  const Num = () => S.Bool.Numbers;

  S.family({ id: 'p1-codes', part: 'numbers', order: 30, title: 'Codes', blurb: 'Bits that stand for decimal digits, positions on a dial and letters, and extra bits that catch (and even mend) errors.' });

  const decimalIn = (label, max) => (v) => (/^\d+$/.test(String(v)) && String(v).length <= max ? null : label + ': a whole decimal number of at most ' + max + ' digits');
  const nib = (d) => d.toString(2).padStart(4, '0');

  // ---------------------------------------------------------------------------------------------------
  // BCD addition
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'bcd-add', family: 'p1-codes', order: 10, title: 'BCD addition and the +6 correction',
    blurb: 'Each decimal digit is its own group of four bits. Add the groups as binary; a group that comes out above 9 (or carries) skips the six unused patterns by adding 0110.',
    inputs: [
      { id: 'a', kind: 'string', label: 'First', def: '478', max: 4, check: decimalIn('First', 4) },
      { id: 'b', kind: 'string', label: 'Second', def: '365', max: 4, check: decimalIn('Second', 4) },
    ],
    presets: [
      { label: '478 + 365: two corrections', values: { a: '478', b: '365' } },
      { label: '42 + 35: none needed', values: { a: '42', b: '35' } },
      { label: '9 + 9: the binary carry', values: { a: '9', b: '9' } },
      { label: '999 + 1: a ripple of corrections', values: { a: '999', b: '1' } },
      { label: '5 + 5 = 10', values: { a: '5', b: '5' } },
    ],
    run(inp) {
      const r = Num().bcdAdd(inp.a, inp.b);
      const steps = r.trace.filter((s) => s.kind !== 'result');
      const A = inp.a.split('').reverse().map(Number), Bd = inp.b.split('').reverse().map(Number), n = steps.length;
      const info = [];
      let c = 0;
      for (let i = 0; i < n; i++) { const x = A[i] || 0, y = Bd[i] || 0, raw = x + y + c, fix = raw > 9; info.push({ x, y, cin: c, raw, fix, out: fix ? (raw + 6) & 15 : raw, cout: fix ? 1 : 0 }); c = fix ? 1 : 0; }
      const BW = 27, BLK = 5 * BW + 34;
      const bx = (i) => -(i + 1) * BLK; // block i (0 = units) from the right
      const F = new S.Frames();
      const draw = (o) => {
        const it = [];
        for (let i = 0; i < n; i++) {
          const d = info[i], x0 = bx(i), hot = o.hot === i;
          const cell = (key, j, y, b, cls, more) => N.cell(key, x0 + j * BW, y, BW - 3, 32, b, 'mono n-bit ' + (cls || '') + (b === '1' ? ' n-one' : ''), Object.assign({ size: 16 }, more || {}));
          it.push(N.label('h:' + i, x0 + 2.5 * BW, -16, d.x + ' + ' + d.y + (d.cin && o.done > i - 1 && o.done >= i ? ' + 1' : ''), 'title', { anchor: 'middle', size: 13 }));
          [...nib(d.x)].forEach((b, j) => it.push(cell('a:' + i + ':' + j, j + 1, 0, b, hot ? 'act' : '')));
          [...nib(d.y)].forEach((b, j) => it.push(cell('b:' + i + ':' + j, j + 1, 38, b, hot ? 'act' : '')));
          if (d.cin && o.done >= i) it.push(N.cell('cin:' + i, x0 + 5 * BW + 2, 20, 26, 26, '1', 'mono n-carry' + (hot ? ' hot' : ''), { size: 13, rx: 13, enter: 'from', src: 'cout:' + (i - 1) }));
          it.push({ key: 'rule1:' + i, kind: 'line', x1: x0, y1: 77, x2: x0 + 5 * BW - 3, y2: 77, cls: 'n-rule' });
          if (o.done >= i) {
            const rawBits = d.raw.toString(2).padStart(5, '0');
            [...rawBits].forEach((b, j) => it.push(cell('raw:' + i + ':' + j, j, 84, b, j === 0 ? 'n-sign' : '', { enter: 'grow' })));
            it.push(N.label('rawv:' + i, x0 + 2.5 * BW, 136, '= ' + d.raw + (d.raw > 9 ? ' > 9' : ''), d.raw > 9 ? 'bad' : 'n-side', { anchor: 'middle', size: 13 }));
            if (d.fix && (o.done > i || o.fixed >= i)) {
              [...'0110'].forEach((b, j) => it.push(cell('six:' + i + ':' + j, j + 1, 146, b, 'n-diff', { enter: 'drop' })));
              it.push(N.label('sixl:' + i, x0 + 6, 168, '+', 'strong', { anchor: 'end', size: 18 }));
              it.push({ key: 'rule2:' + i, kind: 'line', x1: x0, y1: 185, x2: x0 + 5 * BW - 3, y2: 185, cls: 'n-rule' });
            }
            const done = !d.fix || o.done > i || o.fixed >= i;
            if (done) {
              const y = d.fix ? 192 : 146;
              [...nib(d.out)].forEach((b, j) => it.push(cell('out:' + i + ':' + j, j + 1, y, b, 'n-res', { enter: 'grow' })));
              it.push(N.cell('dig:' + i, x0 + 1.5 * BW, y + 42, 2 * BW, 34, d.out, 'mono good', { size: 18, enter: 'grow' }));
              if (d.cout) it.push(N.cell('cout:' + i, x0 - 4, y + 3, 26, 26, '1', 'mono n-carry', { size: 13, rx: 13, enter: 'grow' }));
            }
          }
        }
        if (o.final && info[n - 1].cout) {
          const x0 = bx(n);
          [...'0001'].forEach((b, j) => it.push(N.cell('out:' + n + ':' + j, x0 + (j + 1) * BW, 192, BW - 3, 32, b, 'mono n-bit n-res' + (b === '1' ? ' n-one' : ''), { size: 16, enter: 'from', src: 'cout:' + (n - 1) })));
          it.push(N.cell('dig:' + n, x0 + 2.5 * BW, 234, 2 * BW, 34, '1', 'mono good', { size: 18 }));
        }
        return it;
      };
      F.add({ items: draw({ done: -1, fixed: -1 }), say: inp.a + ' + ' + inp.b + ' in BCD: each decimal digit is written as its own 4-bit group. Add group by group from the units, as binary numbers.', meta: { d: info[0] } });
      info.forEach((d, i) => {
        F.add({ items: draw({ done: i, fixed: i - 1, hot: i }), say: ['Units', 'Tens', 'Hundreds', 'Thousands'][i] + ': ' + nib(d.x) + ' + ' + nib(d.y) + (d.cin ? ' + carry 1' : '') + ' = ' + d.raw.toString(2).padStart(5, '0') + ' = ' + d.raw + (d.raw > 9 ? ': more than 9 is not a BCD digit' + (d.raw > 15 ? ' (and the binary sum even carried out of the group)' : '') + '.' : ', a valid digit; no correction.'), meta: { d: info[i + 1] } });
        if (d.fix) F.add({ items: draw({ done: i, fixed: i, hot: i }), say: steps[i].say + ' Adding 6 skips the six patterns 1010–1111 that BCD never uses.' });
      });
      F.add({ items: draw({ done: n, fixed: n, final: true }), say: r.trace[r.trace.length - 1].say, mark: 'result' });
      // on a phone, a close-up of the digit being added
      const nv = (i) => ({ x: bx(i) - 40, y: -36, w: BLK + 22, h: 320 });
      let cur = 0;
      F.list.forEach((f, k) => { if (k === F.list.length - 1) return; const m = /^(Units|Tens|Hundreds|Thousands)/.exec(f.say); if (m) cur = ['Units', 'Tens', 'Hundreds', 'Thousands'].indexOf(m[1]); f.narrowView = nv(cur); });
      return { frames: F.list, def: N.def(['BCD digit sum', ['add the two groups (and the carry) in binary', 'sum ≤ 9: keep it', 'sum > 9: add 0110, carry 1 to the next digit']], ['Why 6', ['4 bits count to 16; BCD uses only 10 of the patterns', 'adding 6 jumps over the 6 unused ones']]) };
    },
    predict: [
      { at: (f) => f.meta && f.meta.d, once: true, pick: 'option', ask: (fr, i) => 'Adding ' + fr[i].meta.d.x + ' + ' + fr[i].meta.d.y + (fr[i].meta.d.cin ? ' + 1' : '') + ' in BCD: does this digit need the +6 correction?', options: ['Yes', 'No'], answer: (fr, i) => (fr[i].meta.d.fix ? 'Yes' : 'No'), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: '0111 + 0101 in BCD (7 + 5) gives', options: ['1100', '0001 0010', '1 0010 without correction', '0001 1100'], answer: 1, why: '1100 = 12 > 9: add 0110 to get 1 0010: digit 2, carry 1.' },
      { q: 'Why is 9 + 9 tricky?', options: ['It is not', 'The binary sum 10010 is ≤ 15 after the carry', 'The 4-bit sum carries out (18 > 15), yet still needs the +6', 'It overflows BCD'], answer: 2, why: '1001 + 1001 = 1 0010: the group looks valid (0010) but the carry means the sum was 18; adding 6 gives 1 1000: 8, carry 1.' },
      { q: 'How many 4-bit patterns does BCD leave unused?', options: ['4', '6', '8', '10'], answer: 1, why: '1010 to 1111.' },
      { q: '58 in BCD is', options: ['0011 1010', '0101 1000', '111010', '1000 0101'], answer: 1, why: '5 = 0101 and 8 = 1000, each digit on its own.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Decimal codes: 8421, excess-3, 2421
  // ---------------------------------------------------------------------------------------------------
  const CODE_NAMES = { bcd: 'BCD (8421)', 'excess-3': 'excess-3', '2421': '2421' };
  S.topic({
    id: 'decimal-codes', family: 'p1-codes', order: 20, title: 'Decimal codes: 8421, excess-3 and 2421',
    blurb: 'Three ways to spell a decimal digit in four bits. Excess-3 and 2421 are self-complementing: inverting every bit gives the code of the 9\'s complement digit.',
    inputs: [
      { id: 'x', kind: 'string', label: 'Decimal number', def: '2093', max: 4, check: decimalIn('Decimal number', 4) },
      { id: 'code', kind: 'choice', label: 'Code', def: 'excess-3', options: Object.entries(CODE_NAMES).map(([value, label]) => ({ value, label })) },
    ],
    presets: [
      { label: '2093 in excess-3', values: { x: '2093', code: 'excess-3' } },
      { label: '2093 in 2421', values: { x: '2093', code: '2421' } },
      { label: '2093 in BCD (not self-complementing)', values: { x: '2093', code: 'bcd' } },
      { label: '45 in excess-3', values: { x: '45', code: 'excess-3' } },
    ],
    run(inp) {
      const codes = Num().codes, code = inp.code, tbl = codes[code];
      const cols = ['bcd', 'excess-3', '2421'];
      const RH = 32, CW = 84, X0 = 50;
      const ds = inp.x.split('').map(Number);
      const enc = Num().encodeDecimal(inp.x, code);
      const inv = enc.bits.map((g) => [...g].map((b) => (b === '1' ? '0' : '1')).join(''));
      const back = inv.map((g) => tbl.indexOf(g));
      const XR = X0 + 3 * (CW + 8) + 60, GW = 4 * 22 + 14;
      const F = new S.Frames();
      const draw = (o) => {
        const it = [N.label('h:d', 18, -14, 'digit', 'title', { anchor: 'middle' })];
        cols.forEach((c, ci) => { if (ci < o.cols) it.push(N.label('h:' + c, X0 + ci * (CW + 8) + CW / 2, -14, c === 'bcd' ? '8421' : c, 'title', { anchor: 'middle' })); });
        for (let d = 0; d <= 9; d++) {
          const y = d * RH, lit = o.lit && o.lit.includes(d);
          it.push(N.cell('d:' + d, 0, y, 36, RH - 4, d, 'mono' + (lit ? ' hot' : ' n-plain'), { size: 16 }));
          cols.forEach((c, ci) => {
            if (ci >= o.cols) return;
            const mine = c === code;
            it.push(N.cell('t:' + c + ':' + d, X0 + ci * (CW + 8), y, CW, RH - 4, codes[c][d], 'mono' + (lit && mine ? ' hot' : o.pair && mine && o.pair.includes(d) ? ' act' : mine && o.cols === 3 ? ' n-row' : ''), { size: 15, enter: 'drop' }));
          });
        }
        // the number on the right
        if (o.enc) {
          it.push(N.label('r:t', XR + (ds.length * GW) / 2, -14, inp.x + ' in ' + CODE_NAMES[code], 'title', { anchor: 'middle' }));
          ds.forEach((d, i) => {
            if (i >= o.enc) return;
            it.push(N.cell('rd:' + i, XR + i * GW + GW / 2 - 21, 10, 42, 34, d, 'mono n-plain', { size: 18 }));
            [...enc.bits[i]].forEach((b, j) => it.push(N.cell('rb:' + i + ':' + j, XR + i * GW + j * 22, 52, 20, 30, b, 'mono n-bit' + (b === '1' ? ' n-one' : ''), { size: 15, enter: 'from', src: 't:' + code + ':' + d })));
          });
        }
        if (o.inv) {
          it.push(N.label('inv:l', XR - 8, 140, 'invert', 'n-side', { anchor: 'end', size: 13 }));
          ds.forEach((d, i) => [...inv[i]].forEach((b, j) => it.push(N.cell('ib:' + i + ':' + j, XR + i * GW + j * 22, 122, 20, 30, b, 'mono n-bit n-diff', { size: 15, enter: 'from', src: 'rb:' + i + ':' + j }))));
        }
        if (o.back) {
          it.push(N.label('bk:l', XR - 8, 212, 'reads as', 'n-side', { anchor: 'end', size: 13 }));
          ds.forEach((d, i) => {
            const v = back[i];
            it.push(N.cell('bk:' + i, XR + i * GW + GW / 2 - 21, 190, 42, 34, v < 0 ? '?' : v, 'mono ' + (v === 9 - d ? 'good' : 'bad'), { size: 18, enter: 'grow' }));
          });
          it.push(N.label('bk:n', XR + (ds.length * GW) / 2, 254, '9\'s complement of ' + inp.x + ' = ' + ds.map((d) => 9 - d).join(''), 'n-side', { anchor: 'middle', size: 13 }));
        }
        return it;
      };
      F.add({ items: draw({ cols: 1 }), say: 'BCD (8421): each digit in plain binary, the bits weighing 8, 4, 2, 1. The patterns 1010 to 1111 are never used.' });
      F.add({ items: draw({ cols: 2 }), say: 'Excess-3: each digit plus 3, in binary (0 → 0011, 9 → 1100). Not weighted, but no digit is all zeros.' });
      F.add({ items: draw({ cols: 3, pair: [] }), say: '2421: the bits weigh 2, 4, 2, 1, with the patterns chosen so that 0–4 start with 0 and 5–9 start with 1.' });
      const s = code === 'bcd' ? 'BCD' : code;
      F.add({ items: draw({ cols: 3, pair: [3, 6] }), say: s + ': 3 is ' + tbl[3] + ' and 6 = 9 − 3 is ' + tbl[6] + (code === 'bcd' ? ': not each other\'s complement.' : ': each other\'s bitwise complement. That holds for every pair d, 9 − d.'), meta: { ask: true } });
      ds.forEach((d, i) => F.add({ items: draw({ cols: 3, lit: [d], enc: i + 1 }), say: enc.trace[i].say }));
      F.add({ items: draw({ cols: 3, enc: ds.length, inv: true }), say: 'Invert every bit: ' + inv.join(' ') + '.' });
      const ok = back.every((v, i) => v === 9 - ds[i]);
      F.add({ items: draw({ cols: 3, enc: ds.length, inv: true, back: true, lit: ds.map((d) => 9 - d).filter((v, i) => back[i] === v) }), say: ok ? 'Read back in ' + s + ', the inverted bits are ' + back.join('') + ', the 9\'s complement of ' + inp.x + ': ' + s + ' is self-complementing, so a 9\'s complement circuit is just inverters.' : 'Read back in BCD, the inverted bits give ' + back.map((v) => (v < 0 ? '?' : v)).join('') + ', not ' + ds.map((d) => 9 - d).join('') + ' (a ? is a pattern BCD does not use): BCD is not self-complementing.', mark: 'result' });
      return { frames: F.list, def: N.def(['The codes', ['8421: the plain binary of the digit', 'excess-3: binary of digit + 3', '2421: weights 2, 4, 2, 1']], ['Self-complementing', ['code(9 − d) = invert(code(d))', 'excess-3 and 2421 are; 8421 is not']]) };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, once: true, pick: 'option', ask: (fr, i, inp) => 'Invert the ' + CODE_NAMES[inp.code] + ' bits of ' + inp.x + '. Will they spell the 9\'s complement, ' + inp.x.split('').map((d) => 9 - d).join('') + '?', options: ['Yes', 'No'], answer: (fr, i, inp) => (inp.code === 'bcd' ? 'No' : 'Yes'), explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: '7 in excess-3 is', options: ['0111', '1010', '1101', '0100'], answer: 1, why: '7 + 3 = 10 = 1010.' },
      { q: 'Which code is self-complementing?', options: ['8421', 'excess-3', 'ASCII', 'Gray'], answer: 1, why: 'Inverting the excess-3 code of d gives that of 9 − d.' },
      { q: 'In 2421, 1011 stands for', options: ['11', '5', '7', '9'], answer: 1, why: '2 + 0 + 2 + 1 = 5.' },
      { q: 'How many bits does BCD need for 4096?', options: ['12', '13', '16', '4'], answer: 2, why: 'Four decimal digits, four bits each.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Gray code: a turning encoder disc
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'gray-encoder', family: 'p1-codes', order: 30, title: 'Gray code on a turning disc',
    blurb: 'A shaft encoder reads a pattern of tracks under a fixed head. With plain binary several tracks can change at one boundary, and a reading on the boundary can be wildly wrong; with Gray code exactly one changes.',
    inputs: [
      { id: 'n', kind: 'choice', label: 'Tracks (bits)', def: '4', options: [{ value: '3', label: '3' }, { value: '4', label: '4' }] },
      { id: 'from', kind: 'number', label: 'Start at sector', def: 5, min: 0, max: 15 },
      { id: 'steps', kind: 'number', label: 'Turn by', def: 4, min: 1, max: 16 },
    ],
    check: (inp) => (inp.from >= 2 ** +inp.n ? 'Start at sector: below ' + 2 ** +inp.n : inp.steps > 2 ** +inp.n ? 'Turn by: at most one turn' : null),
    presets: [
      { label: '5 → 9 across the middle', values: { n: '4', from: 5, steps: 4 } },
      { label: '3 bits, a full turn', values: { n: '3', from: 0, steps: 8 } },
      { label: '15 → 0: the wrap', values: { n: '4', from: 14, steps: 3 } },
    ],
    run(inp) {
      const n = +inp.n, M = 2 ** n, R0 = 58, DR = n === 4 ? 24 : 30, RD = R0 + (n - 1) * DR + 22;
      const bin = (u) => u.toString(2).padStart(n, '0');
      const gray = (u) => Num().toGray(bin(u)).gray;
      const discs = [{ id: 'b', title: 'binary', code: bin, cx: -RD - 40 }, { id: 'g', title: 'Gray', code: gray, cx: RD + 40 }];
      const F = new S.Frames();
      const draw = (p, prev) => {
        const it = [];
        for (const D of discs) {
          it.push({ key: D.id + ':disc', kind: 'ellipse', x: D.cx, y: 0, rx: RD, ry: RD, cls: 'n-disc' });
          it.push(N.label(D.id + ':title', D.cx, -RD - 52, D.title, 'title', { anchor: 'middle' }));
          it.push({ key: D.id + ':head', kind: 'head', x: D.cx, y: -RD + 4, text: 'head', side: 'above', cls: 'read' });
          const SUB = n === 4 ? 4 : 6; // dots per sector along each track, so a run of 1s reads as a solid arc
          for (let s = 0; s < M; s++) {
            const code = D.code(s);
            for (let q = 0; q < SUB; q++) {
              const th = ((s - p + (q + 0.5) / SUB - 0.5) / M) * 2 * Math.PI - Math.PI / 2;
              for (let t = 0; t < n; t++) {
                const r = R0 + t * DR, on = code[t] === '1', under = s === p && (q === SUB / 2 || q === SUB / 2 - 1);
                it.push({ key: D.id + ':k:' + s + ':' + q + ':' + t, kind: 'token', x: D.cx + Math.cos(th) * r, y: Math.sin(th) * r, r: on ? 6.5 : 2.2, cls: (on ? 'n-on' : 'n-off') + (under ? ' n-read' : ''), audit: 'overlap-ok' });
              }
            }
          }
          // the reading
          const now = D.code(p), was = prev === null ? null : D.code(prev);
          const W = 34, x0 = D.cx - (n * W) / 2;
          [...now].forEach((b, j) => it.push(N.cell(D.id + ':r:' + j, x0 + j * W, RD + 26, W - 4, 38, b, 'mono' + (was && was[j] !== b ? ' n-diff' : ''), { size: 19 })));
          const ch = was ? [...now].filter((b, j) => b !== was[j]).length : 0;
          it.push(N.label(D.id + ':ch', D.cx, RD + 94, was ? ch + ' bit' + (ch === 1 ? '' : 's') + ' changed' : 'sector ' + p, ch > 1 ? 'bad' : was ? 'good' : 'n-side', { anchor: 'middle', size: 14 }));
        }
        it.push(N.label('mid', 0, RD + 52, 'sector ' + p, 'strong', { anchor: 'middle', size: 15 }));
        return it;
      };
      F.add({ items: draw(inp.from, null), say: 'Two discs with ' + n + ' tracks (the most significant inside). A filled dot is a 1. The head at the top reads the sector under it: sector ' + inp.from + ' is ' + bin(inp.from) + ' in binary and ' + gray(inp.from) + ' in Gray code.', meta: { next: (inp.from + 1) % M } });
      let p = inp.from;
      for (let s = 0; s < inp.steps; s++) {
        const q = (p + 1) % M;
        const bc = [...bin(q)].filter((b, j) => b !== bin(p)[j]).length;
        F.add({ items: draw(q, p), say: 'Sector ' + p + ' → ' + q + ': binary ' + bin(p) + ' → ' + bin(q) + ' changes ' + bc + ' bit' + (bc === 1 ? '' : 's') + '; Gray ' + gray(p) + ' → ' + gray(q) + ' changes 1.' + (bc > 1 ? ' A head sitting on the boundary could read any mix of the ' + bc + ' changing tracks — ' + 2 ** bc + ' possible readings in binary, but only the two true neighbours in Gray.' : '') + (q === 0 ? ' Gray code even wraps round with one change.' : ''), meta: { next: s + 1 < inp.steps ? (q + 1) % M : null } });
        p = q;
      }
      const g = Num().toGray(bin(p));
      F.add({ items: draw(p, null), say: 'From binary to Gray: ' + g.trace.slice(0, -1).map((x) => x.say).join(' ') + ' So sector ' + p + ' reads ' + g.gray + '.', mark: 'result' });
      return { frames: F.list, def: N.def(['Reflected Gray code', ['g₀ = b₀ (the leading bit)', 'gᵢ = bᵢ₋₁ ⊕ bᵢ', 'back: bᵢ = bᵢ₋₁ ⊕ gᵢ']], ['Neighbours', ['consecutive codes differ in one bit', 'including the last and the first']]) };
    },
    predict: [
      { at: (f) => f.meta && f.meta.next !== null && f.meta.next !== undefined, once: true, pick: 'option', ask: (fr, i, inp) => 'Turning one more sector: how many bits change in binary?', options: (fr, i, inp) => ['1', '2', '3', '4'].slice(0, +inp.n), answer: (fr, i, inp) => { const n = +inp.n, q = fr[i].meta.next, pp = (q - 1 + 2 ** n) % 2 ** n; return String([...q.toString(2).padStart(n, '0')].filter((b, j) => b !== pp.toString(2).padStart(n, '0')[j]).length); }, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'The Gray code of binary 0110 is', options: ['0101', '0110', '0100', '1010'], answer: 0, why: '0, 0⊕1 = 1, 1⊕1 = 0, 1⊕0 = 1: 0101.' },
      { q: 'Going from 7 to 8 in 4-bit binary changes', options: ['1 bit', '2 bits', '3 bits', '4 bits'], answer: 3, why: '0111 → 1000.' },
      { q: 'Why is Gray code used on shaft encoders?', options: ['It uses fewer tracks', 'A misread at a boundary is off by at most one position', 'It is weighted', 'It is easier to add'], answer: 1, why: 'Only one track changes, so a boundary reading is one of the two neighbours.' },
      { q: 'Gray 1101 in binary is', options: ['1001', '1101', '1011', '1110'], answer: 0, why: 'b = 1, 1⊕1 = 0, 0⊕0 = 0, 0⊕1 = 1: 1001.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // ASCII and parity
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'ascii-parity', family: 'p1-codes', order: 40, title: 'ASCII with a parity bit',
    blurb: 'Each character is seven bits; an eighth bit makes the count of 1s even (or odd). The receiver counts again: one flipped bit — or any odd number — is caught; two cancel out and slip through.',
    inputs: [
      { id: 'text', kind: 'string', label: 'Text', def: 'Gate', spaces: true, max: 5, check: (v) => ([...v].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126) ? 'Text: printable ASCII characters only' : v.length ? null : 'Text: at least one character') },
      { id: 'parity', kind: 'choice', label: 'Parity', def: 'even', options: [{ value: 'even', label: 'even' }, { value: 'odd', label: 'odd' }] },
      { id: 'flips', kind: 'list', label: 'Flip bits (char.bit, bit 1 = leftmost)', def: ['2.4'], max: 4, check: (v, inp) => { for (const f of v) { const m = /^(\d)\.(\d)$/.exec(f); if (!m || +m[1] < 1 || +m[1] > inp.text.length || +m[2] < 1 || +m[2] > 8) return 'Flip bits: write char.bit like 2.4 (character 1–' + inp.text.length + ', bit 1–8)'; } return null; } },
    ],
    presets: [
      { label: 'One flip: caught', values: { text: 'Gate', parity: 'even', flips: ['2.4'] } },
      { label: 'Two flips in one character: missed', values: { text: 'Gate', parity: 'even', flips: ['3.2', '3.6'] } },
      { label: 'Odd parity, no errors', values: { text: 'OK!', parity: 'odd', flips: [] } },
      { label: 'The parity bit itself flipped', values: { text: 'Hi', parity: 'even', flips: ['1.1'] } },
    ],
    run(inp) {
      const chars = [...inp.text], P = inp.parity;
      const sent = chars.map((c) => Num().ascii(c, P));
      const flips = inp.flips.map((f) => f.split('.').map(Number));
      const recv = sent.map((s, i) => { const b = [...s.bits8]; for (const [ci, bi] of flips) if (ci === i + 1) b[bi - 1] = b[bi - 1] === '1' ? '0' : '1'; return b.join(''); });
      const RH = 46, BW = 26, XS = 90, XR = XS + 8 * BW + 120;
      const F = new S.Frames();
      const draw = (o) => {
        const it = [N.label('h:s', XS + 4 * BW, -16, 'sent', 'title', { anchor: 'middle' })];
        chars.forEach((c, i) => {
          const y = i * RH, s = sent[i];
          it.push(N.cell('ch:' + i, 0, y, 38, RH - 8, c === ' ' ? '␠' : c, 'mono' + (o.hot === i ? ' hot' : ' n-key'), { size: 18 }));
          it.push(N.label('hex:' + i, 44, y + 24, s.code, 'n-bits', { size: 12 }));
          if (o.bits > i) [...s.bits7].forEach((b, j) => it.push(N.cell('s:' + i + ':' + (j + 1), XS + (j + 1) * BW, y + 3, BW - 3, RH - 14, b, 'mono n-bit' + (b === '1' ? ' n-one' : ''), { size: 15, enter: 'from', src: 'ch:' + i })));
          if (o.par > i) it.push(N.cell('s:' + i + ':0', XS, y + 3, BW - 3, RH - 14, s.bits8[0], 'mono n-parity', { size: 15, enter: 'grow' }));
          if (o.sent) {
            [...recv[i]].forEach((b, j) => {
              const flipped = b !== s.bits8[j];
              it.push(N.cell('r:' + i + ':' + j, XR + j * BW, y + 3, BW - 3, RH - 14, b, 'mono n-bit' + (flipped && o.flip ? ' n-flip' : j === 0 ? ' n-parity' : b === '1' ? ' n-one' : ''), { size: 15, enter: 'from', src: 's:' + i + ':' + j }));
            });
            if (o.check > i) {
              const pc = B().parityCheck(recv[i], P);
              it.push(N.cell('ok:' + i, XR + 8 * BW + 12, y + 3, 40, RH - 14, pc.ok ? '✓' : '✗', pc.ok ? 'good' : 'bad', { size: 18 }));
            }
          }
        });
        if (o.sent) {
          it.push(N.label('h:r', XR + 4 * BW, -16, 'received', 'title', { anchor: 'middle' }));
          it.push({ key: 'wire', kind: 'edge', from: { x: XS + 8 * BW + 14, y: (chars.length * RH) / 2 - 4 }, to: { x: XR - 14, y: (chars.length * RH) / 2 - 4 }, cls: 'hot', label: o.flip && flips.length ? 'noise' : 'line', lx: (XS + 8 * BW + XR) / 2, ly: (chars.length * RH) / 2 - 22, size: 13 });
        }
        it.push(N.label('pl', XS + BW / 2 - 1, chars.length * RH + 6, 'P', 'n-side', { anchor: 'middle', size: 12 }));
        return it;
      };
      F.add({ items: draw({}), say: '"' + inp.text + '" as ASCII: each character has a 7-bit code (its decimal value is shown beside it).' });
      chars.forEach((c, i) => F.add({ items: draw({ bits: i + 1, par: i, hot: i }), say: '"' + c + '" is ' + sent[i].code + ' = ' + sent[i].bits7 + ' (hex ' + sent[i].hex + ').' }));
      chars.forEach((c, i) => F.add({ items: draw({ bits: chars.length, par: i + 1, hot: i }), say: sent[i].say, meta: i === 0 ? { ask: sent[1] || sent[0], idx: sent[1] ? 1 : 0 } : undefined }));
      F.add({ items: draw({ bits: chars.length, par: chars.length, sent: true }), say: 'Send all ' + chars.length * 8 + ' bits down the line.' });
      if (flips.length) F.add({ items: draw({ bits: chars.length, par: chars.length, sent: true, flip: true }), say: 'Noise flips ' + flips.map(([c, b]) => 'bit ' + b + ' of character ' + c).join(' and ') + '.' });
      chars.forEach((c, i) => F.add({ items: draw({ bits: chars.length, par: chars.length, sent: true, flip: true, check: i + 1, hot: i }), say: 'Character ' + (i + 1) + ': ' + B().parityCheck(recv[i], P).say }));
      const caught = chars.filter((c, i) => !B().parityCheck(recv[i], P).ok).length;
      const damaged = chars.filter((c, i) => recv[i] !== sent[i].bits8).length;
      F.add({ items: draw({ bits: chars.length, par: chars.length, sent: true, flip: true, check: chars.length }), say: !damaged ? 'Every character checks: nothing was damaged.' : caught === damaged ? 'Every damaged character was caught (' + caught + '). Parity can say that something is wrong, but not which bit, so the character must be sent again.' : (damaged - caught) + ' damaged character' + (damaged - caught === 1 ? '' : 's') + ' passed the check: an even number of flips leaves the count of 1s even. Parity only catches odd numbers of errors.', mark: 'result' });
      const H = chars.length * RH + 30;
      F.list.forEach((f, k) => { f.narrowView = k < chars.length * 2 + 1 ? { x: -10, y: -36, w: XS + 8 * BW + 16, h: H + 10 } : { x: XR - 24, y: -36, w: 8 * BW + 84, h: H + 10 }; });
      return { frames: F.list, def: N.def(['Parity', ['even: the 8 bits hold an even number of 1s', 'odd: an odd number', 'P = b₁ ⊕ b₂ ⊕ … ⊕ b₇ (even)', 'catches 1, 3, 5 … flipped bits; not 2, 4 …']]) };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, once: true, pick: 'option', ask: (fr, i, inp) => 'What parity bit does "' + fr[i].meta.ask.char + '" (' + fr[i].meta.ask.bits7 + ') get for ' + inp.parity + ' parity?', options: ['0', '1'], answer: (fr, i) => fr[i].meta.ask.bits8[0], explain: (fr, i) => fr[i].meta.ask.say },
    ],
    quiz: [
      { q: 'The even parity bit for 1011001 is', options: ['0', '1'], answer: 0, why: 'Four 1s: already even.' },
      { q: 'A received word with even parity has two flipped bits. The check', options: ['catches it', 'misses it', 'corrects it', 'flips it back'], answer: 1, why: 'Two flips keep the count even.' },
      { q: '"A" is 65. Its 7-bit code is', options: ['1000001', '0100001', '1000011', '1100001'], answer: 0, why: '64 + 1.' },
      { q: 'What does a single parity bit let the receiver do?', options: ['Correct one error', 'Detect an odd number of errors', 'Detect any error', 'Find which bit is wrong'], answer: 1, why: 'It only says whether the count of 1s changed by an odd amount.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Hamming codes
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'hamming', family: 'p1-codes', order: 50, title: 'Hamming code: parity circles and the syndrome',
    blurb: 'Parity bits sit at positions 1, 2, 4, 8 and each checks the positions whose number has that bit set. When one bit flips, the failing checks spell out its position in binary.',
    inputs: [
      { id: 'data', kind: 'string', label: 'Data bits', def: '1011', alphabet: '01', min: 2, max: 11 },
      { id: 'secded', kind: 'choice', label: 'Extra overall parity (SEC-DED)', def: 'no', options: [{ value: 'no', label: 'no' }, { value: 'yes', label: 'yes' }] },
      { id: 'flips', kind: 'list', label: 'Flip positions', def: ['6'], max: 2, check: (v) => (v.every((x) => /^\d+$/.test(x)) && new Set(v).size === v.length ? null : 'Flip positions: different position numbers, like 6 or 3, 5') },
    ],
    check: (inp) => { const m = inp.data.length; let r = 0; while ((1 << r) < m + r + 1) r++; const n = m + r; const lo = inp.secded === 'yes' ? 0 : 1; const bad = inp.flips.find((x) => +x < lo || +x > n); return bad !== undefined ? 'Flip positions: from ' + lo + ' to ' + n : null; },
    presets: [
      { label: '1011, bit 6 flipped', values: { data: '1011', secded: 'no', flips: ['6'] } },
      { label: '1011, a parity bit flipped', values: { data: '1011', secded: 'no', flips: ['4'] } },
      { label: '1011, no error', values: { data: '1011', secded: 'no', flips: [] } },
      { label: 'SEC-DED, two errors', values: { data: '1011', secded: 'yes', flips: ['3', '6'] } },
      { label: 'SEC-DED, one error', values: { data: '1011', secded: 'yes', flips: ['5'] } },
      { label: '8 data bits, bit 10 flipped', values: { data: '11001010', secded: 'no', flips: ['10'] } },
    ],
    run(inp) {
      const sd = inp.secded === 'yes';
      const H = Num().hamming, enc = H.encode(inp.data, { secded: sd });
      const n = enc.n, r = enc.r;
      const word = enc.layout.filter((l) => l.pos >= 1);
      const flips = inp.flips.map(Number);
      const recvBits = new Map(enc.layout.map((l) => [l.pos, flips.includes(l.pos) ? 1 - l.bit : l.bit]));
      const recv = (sd ? String(recvBits.get(0)) : '') + word.map((l) => recvBits.get(l.pos)).join('');
      const dec = H.decode(recv, { secded: sd });
      const venn = n === 7;
      const CW = 38, X0 = sd ? CW + 14 : 0;
      const px = (pos) => (pos === 0 ? 0 : X0 + (pos - 1) * CW);
      const checks = [...Array(r).keys()].map((i) => 1 << i);
      const VX = X0 + n * CW + 215; // the circles' centre
      const VC = { 1: { x: VX - 52, y: 90 }, 2: { x: VX + 52, y: 90 }, 4: { x: VX, y: 178 } };
      const VPOS = { 1: [-108, -46], 2: [108, -46], 3: [0, -64], 4: [0, 112], 5: [-60, 46], 6: [60, 46], 7: [0, 14] };
      const F = new S.Frames();
      const kind = (pos) => (pos === 0 ? 'p0' : (pos & (pos - 1)) === 0 ? 'p' : 'd');
      const draw = (o) => {
        const it = [];
        const bitAt = (pos) => (o.recv ? recvBits.get(pos) : o.known.has(pos) ? enc.layout.find((l) => l.pos === pos).bit : null);
        const posList = (sd ? [0] : []).concat([...Array(n).keys()].map((i) => i + 1));
        for (const pos of posList) {
          const b = bitAt(pos), k = kind(pos), flipped = o.recv && o.flip && flips.includes(pos), fixed = o.fixed && dec.position === pos;
          it.push(N.label('pn:' + pos, px(pos) + (CW - 4) / 2, -10, String(pos), 'n-bits' + (o.hotPos === pos ? ' hot' : ''), { anchor: 'middle' }));
          it.push(N.cell('w:' + pos, px(pos), 0, CW - 4, 40, b === null ? '' : String(fixed ? 1 - b : b), 'mono' + (fixed ? ' good' : flipped ? ' n-flip' : k !== 'd' ? ' n-parity' : b === 1 ? ' n-one' : '') + (o.hotPos === pos && !flipped ? ' hot' : ''), { size: 18 }));
          if (pos) it.push(N.label('pb:' + pos, px(pos) + (CW - 4) / 2, 58, pos.toString(2).padStart(r, '0'), 'n-bits', { anchor: 'middle', size: 10 }));
        }
        // the check matrix
        checks.forEach((p, ci) => {
          const y = 80 + ci * 40, lit = o.check === p;
          it.push(N.cell('cl:' + p, -64, y, 52, 32, 'P' + p, 'mono ' + (lit ? 'hot' : 'n-key'), { size: 14 }));
          for (let pos = 1; pos <= n; pos++) {
            if (!(pos & p)) continue;
            const b = bitAt(pos);
            it.push(N.cell('m:' + p + ':' + pos, px(pos) + 4, y + 2, CW - 12, 28, b === null ? '·' : String(b), 'mono' + (lit ? ' act' : ' n-row') + (pos === p ? ' n-parity' : ''), { size: 14 }));
          }
          if (o.syn && o.syn.has(p)) { const v = o.syn.get(p); it.push(N.cell('sv:' + p, X0 + n * CW + 8, y + 2, 34, 28, String(v), 'mono ' + (v ? 'bad' : 'good'), { size: 15, enter: 'grow' })); }
        });
        if (o.syn && o.syn.size === r) {
          const sbits = checks.slice().reverse().map((p) => o.syn.get(p)).join('');
          it.push(N.cell('syn', X0 + n * CW - 40, 80 + r * 40 + 6, 82, 34, sbits, 'mono ' + (+('0b' + sbits) ? 'bad' : 'good'), { size: 17 }));
          it.push(N.label('synl', X0 + n * CW - 48, 80 + r * 40 + 28, 'syndrome (read up) = ' + parseInt(sbits, 2), 'n-side', { anchor: 'end', size: 13 }));
        }
        if (o.overall !== undefined && sd) it.push(N.cell('ov', -78, 80 + r * 40 + 6, 66, 34, 'all ' + o.overall, 'mono ' + (o.overall ? 'bad' : 'good'), { size: 13 }));
        if (venn) {
          const failing = o.syn ? checks.filter((p) => o.syn.get(p)) : [];
          [1, 2, 4].forEach((p) => it.push({ key: 'v:' + p, kind: 'ellipse', x: VC[p].x, y: VC[p].y, rx: 92, ry: 92, text: 'P' + p, tx: VC[p].x + (p === 1 ? -74 : p === 2 ? 74 : 0), ty: VC[p].y + (p === 4 ? 112 : -66), cls: 'n-c' + [1, 2, 4].indexOf(p) + (o.check === p ? ' good' : '') + (failing.includes(p) ? ' bad' : '') }));
          for (let pos = 1; pos <= 7; pos++) {
            const b = bitAt(pos), [dx, dy] = VPOS[pos], flipped = o.recv && o.flip && flips.includes(pos), fixed = o.fixed && dec.position === pos;
            it.push(N.cell('vb:' + pos, VX + dx - 17, 120 + dy - 16, 34, 32, b === null ? '' : String(fixed ? 1 - b : b), 'mono' + (fixed ? ' good' : flipped ? ' n-flip' : kind(pos) === 'p' ? ' n-parity' : ''), { size: 16, enter: 'from', src: 'w:' + pos }));
            it.push(N.label('vn:' + pos, VX + dx + 21, 120 + dy + 12, String(pos), 'n-bits', { size: 10 }));
          }
        }
        return it;
      };
      const known = new Set(word.filter((l) => l.kind === 'd').map((l) => l.pos));
      const t = enc.trace;
      F.add({ items: draw({ known: new Set() }), say: inp.data.length + ' data bits. ' + t[0].say });
      F.add({ items: draw({ known }), say: 'The data bits ' + inp.data + ' go, in order, into the positions that are not powers of two: ' + [...known].join(', ') + '.' });
      checks.forEach((p, ci) => {
        known.add(p);
        F.add({ items: draw({ known: new Set(known), check: p, hotPos: p }), say: t[1 + ci].say + ' (These are the positions whose binary number has a 1 in the ' + p + 's place.)', meta: ci === 0 ? { ask: 'p' + p, ans: String(enc.layout.find((l) => l.pos === p).bit) } : undefined });
      });
      if (sd) { known.add(0); F.add({ items: draw({ known: new Set(known) }), say: t.find((x) => x.kind === 'ham-overall').say }); }
      F.add({ items: draw({ known: new Set(known) }), say: 'The code word: ' + enc.code + '.' });
      F.add({ items: draw({ recv: true, flip: true, known }), say: flips.length ? 'In storage or on the line, bit' + (flips.length > 1 ? 's ' : ' ') + flips.join(' and ') + ' flip' + (flips.length > 1 ? '' : 's') + ': the receiver gets ' + recv + '.' : 'The word arrives unchanged: ' + recv + '.', meta: { syn: true } });
      const syn = new Map();
      const checksTrace = dec.trace.filter((x) => x.kind === 'ham-check');
      checks.forEach((p, ci) => {
        syn.set(p, checksTrace[ci].bit);
        F.add({ items: draw({ recv: true, flip: true, known, check: p, syn: new Map(syn) }), say: checksTrace[ci].say });
      });
      const ov = dec.trace.find((x) => x.kind === 'ham-overall');
      if (sd) F.add({ items: draw({ recv: true, flip: true, known, syn: new Map(syn), overall: ov.bit }), say: ov.say });
      const verdict = dec.trace.find((x) => x.kind === 'ham-verdict');
      F.add({ items: draw({ recv: true, flip: true, known, syn: new Map(syn), overall: sd ? ov.bit : undefined, hotPos: dec.position || undefined }), say: verdict.say + (venn && dec.status === 'corrected' ? ' In the circles: the bit lies inside every failing circle and outside every passing one.' : '') });
      if (dec.status === 'corrected' || dec.status === 'p0') F.add({ items: draw({ recv: true, flip: true, fixed: true, known, syn: new Map(syn), overall: sd ? ov.bit : undefined }), say: 'Flip it back: ' + dec.corrected + '. The data bits are ' + dec.data + (dec.data === inp.data ? ', as sent.' : '.'), mark: 'result' });
      else F.last().mark = 'result';
      // on a phone the circles are left out: the word, the checks and the syndrome fill the screen
      if (venn) for (const f of F.list) f.narrowView = { x: -96, y: -40, w: X0 + n * CW + 156, h: 80 + r * 40 + 100 };
      return { frames: F.list, def: N.def(['Layout', ['parity bits at 1, 2, 4, 8 …', 'Pₖ checks every position with bit k set', r + ' parity bits: 2^' + r + ' ≥ ' + inp.data.length + ' + ' + r + ' + 1']], ['Decoding', ['syndrome = the failing checks, as a number', '0: no error; else the wrong position', sd ? 'SEC-DED: syndrome ≠ 0 and overall even → two errors' : 'two errors give a wrong position']]) };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, once: true, pick: 'option', ask: (fr, i) => 'What is ' + fr[i].meta.ask.toUpperCase() + ' (even parity over its positions)?', options: ['0', '1'], answer: (fr, i) => fr[i].meta.ans, explain: (fr, i) => fr[i].say },
      { at: (f) => f.meta && f.meta.syn, once: true, pick: 'option', ask: 'What will the syndrome point to?', options: (fr, i, inp) => { const fl = inp.flips.map(Number); const m = inp.data.length; let r = 0; while ((1 << r) < m + r + 1) r++; const n = m + r; const a = fl.length === 0 ? 'no error (0)' : fl.length === 1 ? 'position ' + fl[0] : 'something else'; return N.options(a, ['no error (0)', 'position ' + Math.min(n, (fl[0] || 1) + 1), 'position 1', 'something else']); }, answer: (fr, i, inp) => { const fl = inp.flips.map(Number); if (fl.length === 0) return 'no error (0)'; if (fl.length === 1) return fl[0] === 0 ? 'no error (0)' : 'position ' + fl[0]; return 'something else'; }, explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: 'Which positions does P2 check in a 7-bit Hamming code?', options: ['1, 3, 5, 7', '2, 3, 6, 7', '4, 5, 6, 7', '2, 4, 6'], answer: 1, why: 'Those whose binary number has the 2s bit set: 010, 011, 110, 111.' },
      { q: 'The checks P1 and P4 fail, P2 passes. Which bit is wrong?', options: ['3', '5', '6', '7'], answer: 1, why: 'Syndrome 101 = 5.' },
      { q: 'How many parity bits does 8 bits of data need for single error correction?', options: ['3', '4', '5', '8'], answer: 1, why: '2⁴ = 16 ≥ 8 + 4 + 1.' },
      { q: 'With SEC-DED, a non-zero syndrome but even overall parity means', options: ['one error, corrected', 'two errors, detected only', 'no error', 'the overall bit is wrong'], answer: 1, why: 'Two flips keep the overall parity even while the checks still fail.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
