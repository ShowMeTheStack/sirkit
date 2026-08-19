// Part 1, bases: integers by repeated division (the remainders drop into place and are read upward), fractions by
// repeated multiplication (with a fraction that comes round again caught), any base to decimal by the weight of each
// place, conversion between binary, octal and hexadecimal by grouping bits, and column arithmetic in other bases.
(function (S) {
  'use strict';
  const K = S.Kit, N = K.num;
  const Num = () => S.Bool.Numbers;
  const DIG = N.DIG;
  const BASES = [2, 3, 5, 8, 12, 16].map((b) => ({ value: String(b), label: 'base ' + b + (b === 2 ? ' (binary)' : b === 8 ? ' (octal)' : b === 16 ? ' (hexadecimal)' : '') }));

  S.family({ id: 'p1-bases', part: 'numbers', order: 10, title: 'Bases and conversion', blurb: 'One number, many spellings: repeated division and multiplication, the weight of each place, grouping bits into octal and hex, and arithmetic done in another base.' });

  // ---------------------------------------------------------------------------------------------------
  // Repeated division
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'base-division', family: 'p1-bases', order: 10, title: 'Decimal to any base by repeated division',
    blurb: 'Divide by the base again and again. Each remainder is one digit of the answer; they fall out last digit first, so the answer is read from the bottom up.',
    inputs: [
      { id: 'n', kind: 'number', label: 'Decimal number', def: 156, min: 0, max: 65535 },
      { id: 'base', kind: 'choice', label: 'Into', def: '2', options: BASES },
    ],
    check: (inp) => (+inp.base === 2 && inp.n > 4095 ? 'In binary, at most 4095 (twelve divisions), so the ladder fits' : null),
    presets: [
      { label: '156 into binary', values: { n: 156, base: '2' } },
      { label: '2024 into hex', values: { n: 2024, base: '16' } },
      { label: '500 into octal', values: { n: 500, base: '8' } },
      { label: 'Zero', values: { n: 0, base: '2' } },
      { label: 'A power of the base: 4096 into hex', values: { n: 4096, base: '16' } },
      { label: 'Less than the base: 11 into hex', values: { n: 11, base: '16' } },
      { label: '100 into base 3', values: { n: 100, base: '3' } },
    ],
    run(inp) {
      const base = +inp.base, r = Num().convert(String(inp.n), 10, base);
      const divs = r.trace.filter((s) => s.kind === 'divide');
      const RH = 46, X0 = 0;
      const F = new S.Frames();
      const items = (o) => {
        const it = [];
        it.push(N.label('hdr:n', 110, -22, 'divide by ' + base, 'title', { anchor: 'middle' }));
        it.push(N.label('hdr:r', 286, -22, 'remainder', 'title', { anchor: 'middle' }));
        const shown = o.rows;
        for (let k = 0; k <= shown && k <= divs.length; k++) {
          const y = k * RH;
          const v = k < divs.length ? divs[k].n : divs.length ? divs[divs.length - 1].q : '0';
          const done = k === divs.length;
          if (!done) {
            it.push(N.cell('dv:' + k, X0, y + 2, 40, RH - 6, base, 'mono n-divisor', { size: 16 }));
            it.push({ key: 'bar:v:' + k, kind: 'line', x1: X0 + 46, y1: y + 2, x2: X0 + 46, y2: y + RH - 2, cls: 'n-rule' });
            it.push({ key: 'bar:h:' + k, kind: 'line', x1: X0 + 46, y1: y + RH - 2, x2: X0 + 180, y2: y + RH - 2, cls: 'n-rule' });
          }
          it.push(N.cell('q:' + k, X0 + 54, y + 4, 118, RH - 10, v, 'mono' + (k === o.hot ? ' act' : done ? ' n-zero' : ''), { size: 18, enter: k ? 'from' : 'fade', src: k ? 'q:' + (k - 1) : undefined }));
        }
        for (let k = 0; k < Math.min(shown, divs.length); k++) {
          const d = divs[k];
          it.push(N.cell('rem:' + k, 256, k * RH + 4, 60, RH - 10, d.digit, 'mono n-rem' + (k === o.hot ? ' hot' : '') + (o.read ? ' n-read' : ''), { size: 20, enter: 'drop', sub: undefined }));
          if (base > 10 && d.r > 9) it.push(N.label('remv:' + k, 326, k * RH + 30, '= ' + d.r, 'n-side', { size: 13 }));
        }
        if (o.read && divs.length > 1) it.push({ key: 'readup', kind: 'edge', from: { x: 366, y: (divs.length - 1) * RH + 22 }, to: { x: 366, y: 4 }, cls: 'hot', label: 'read upward', lx: 420, ly: (divs.length - 1) * RH / 2 + 22, size: 14 });
        if (o.result) {
          const y = (divs.length + 1) * RH + 26, digits = r.result, w = 44;
          const x = 160 - (digits.length * w) / 2;
          [...digits].forEach((c, j) => {
            const k = digits.length - 1 - j; // the k-th remainder (from the top) is the k-th digit from the right
            it.push(N.cell('res:' + j, x + j * w, y, w - 4, 48, c, 'mono good', { size: 21, enter: divs.length ? 'from' : 'grow', src: divs.length ? 'rem:' + k : undefined }));
            if (base ** k < 1e5) it.push(N.label('resw:' + j, x + j * w + (w - 4) / 2, y + 70, String(base ** k), 'n-bits', { anchor: 'middle', size: base ** k >= 1000 ? 10 : 12 }));
          });
          it.push(N.label('res:eq', x - 8, y + 31, '(' + inp.n + ')' + N.sub(10) + ' = (', 'strong', { anchor: 'end', size: 18 }));
          it.push(N.label('res:base', x + digits.length * w + 2, y + 31, ')' + N.sub(base), 'strong', { size: 18 }));
        }
        return it;
      };
      const def = N.def(['The division ladder', ['N = q × ' + base + ' + r,  0 ≤ r < ' + base, 'r is the next digit, from the right', 'repeat with q until q = 0']], ['Why it works', ['N = dₖ' + base + 'ᵏ + … + d₁' + base + ' + d₀', 'N mod ' + base + ' = d₀', '⌊N / ' + base + '⌋ = dₖ' + base + 'ᵏ⁻¹ + … + d₁']]);
      F.add({ items: items({ rows: 0, hot: 0 }), say: inp.n === 0 ? 'Start from 0. There is nothing to divide: zero is 0 in every base.' : 'Start from ' + inp.n + ' and divide by ' + base + ' again and again; each remainder is a digit in base ' + base + '.', hl: { s0: [0] }, meta: { next: divs[0] } });
      divs.forEach((d, k) => {
        F.add({ items: items({ rows: k + 1, hot: k }), say: d.say + (k === 0 ? ' This first remainder is the last (rightmost) digit.' : d.q === '0' ? ' The quotient is 0, so this was the last division: its remainder is the leading digit.' : ''), hl: { s0: [0, 1] }, meta: { next: divs[k + 1] } });
      });
      if (divs.length) F.add({ items: items({ rows: divs.length + 1, read: true }), say: r.trace.find((s) => s.kind === 'divide-read').say + ' The first remainder is the units digit, so the last one found is written first.', hl: { s0: [1, 2] } });
      F.add({ items: items({ rows: divs.length + 1, read: divs.length > 1, result: true }), say: r.trace[r.trace.length - 1].say + ' Check: ' + [...r.result].map((c, j) => N.val(c) + '×' + base + N.sup(r.result.length - 1 - j)).join(' + ') + ' = ' + inp.n + '.', hl: { s1: [0] }, mark: 'result' });
      return { frames: F.list, def };
    },
    predict: [
      { at: (f) => f.meta && f.meta.next && f.meta.next !== undefined, once: true, pick: 'option', ask: (fr, i, inp) => 'What is ' + fr[i].meta.next.n + ' ÷ ' + inp.base + '\'s remainder, the next digit?', options: (fr, i, inp) => N.options(fr[i].meta.next.digit, DIG.slice(0, +inp.base).split('').reverse()), answer: (fr, i) => fr[i].meta.next.digit, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'Converting 37 to binary, the first remainder found is', options: ['the leading (leftmost) bit', 'the last (rightmost) bit', 'always 0', 'the number of bits'], answer: 1, why: '37 = 18 × 2 + 1: the first remainder is 37 mod 2, the units bit.' },
      { q: 'How many divisions does 255 need in base 16?', options: ['1', '2', '4', '8'], answer: 1, why: '255 ÷ 16 = 15 r 15, then 15 ÷ 16 = 0 r 15: two digits, FF.' },
      { q: 'What is 26 in base 3?', options: ['222', '2002', '1012', '212'], answer: 0, why: '26 = 8×3 + 2, 8 = 2×3 + 2, 2 = 0×3 + 2: read upward, 222. Check: 18 + 6 + 2 = 26.' },
      { q: 'Why does the ladder stop?', options: ['After 8 steps', 'When the quotient is 0', 'When a remainder is 0', 'When the quotient is less than 10'], answer: 1, why: 'Once the quotient is 0 every further digit would be a leading 0.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Fractions by repeated multiplication
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'base-fraction', family: 'p1-bases', order: 20, title: 'Fractions by repeated multiplication',
    blurb: 'Multiply the fraction by the base: the whole part that pops out is the next digit after the point. When a fraction comes round again, the digits repeat for ever.',
    inputs: [
      { id: 'f', kind: 'string', label: 'Decimal fraction 0.…', def: '0.3', max: 8, check: (v) => (/^0?\.\d{1,5}$/.test(v) ? null : 'Decimal fraction 0.…: write it as 0. and one to five digits, like 0.625') },
      { id: 'base', kind: 'choice', label: 'Into', def: '2', options: BASES },
    ],
    presets: [
      { label: '0.3 into binary (repeats)', values: { f: '0.3', base: '2' } },
      { label: '0.625 into binary (ends)', values: { f: '0.625', base: '2' } },
      { label: '0.1 into binary', values: { f: '0.1', base: '2' } },
      { label: '0.5 into base 3 (repeats at once)', values: { f: '0.5', base: '3' } },
      { label: '0.75 into hex', values: { f: '0.75', base: '16' } },
      { label: '0.2 into octal', values: { f: '0.2', base: '8' } },
      { label: '0.12345 into binary (cut off)', values: { f: '0.12345', base: '2' } },
    ],
    run(inp) {
      const base = +inp.base, text = inp.f.startsWith('.') ? '0' + inp.f : inp.f;
      const r = Num().convert(text, 10, base, { fracDigits: 10 });
      const mul = r.trace.filter((s) => s.kind === 'multiply'), rep = r.trace.find((s) => s.kind === 'repeat'), cut = r.trace.find((s) => s.kind === 'truncate');
      const RH = 44;
      const fracOf = (s) => s.split('/');
      const pText = (m) => { const [pn, pd] = fracOf(m.product); return Math.floor(+pn / +pd) + ' + ' + (+pn % +pd) + '/' + pd; };
      const FW = Math.max(120, ...mul.map((m) => S.geom.textWidth(m.frac, 16, { mono: true }) + 20));
      const PW = Math.max(120, ...mul.map((m) => S.geom.textWidth(pText(m), 15, { mono: true }) + 20));
      const XP = FW + 76, XD = XP + PW + 46;
      const F = new S.Frames();
      const items = (o) => {
        const it = [N.label('h:f', FW / 2, -18, 'fraction', 'title', { anchor: 'middle' }), N.label('h:p', XP + PW / 2, -18, '× ' + base, 'title', { anchor: 'middle' }), N.label('h:d', XD + 24, -18, 'digit', 'title', { anchor: 'middle' })];
        for (let k = 0; k < o.rows && k < mul.length; k++) {
          const m = mul[k], [pn, pd] = fracOf(m.product), whole = Math.floor(+pn / +pd), rest = +pn % +pd;
          const y = k * RH;
          const loop = o.loop && (k === o.loop.from);
          it.push(N.cell('fr:' + k, 0, y, FW, RH - 8, m.frac, 'mono' + (k === o.hot ? ' act' : '') + (loop ? ' bad' : ''), { size: 16, enter: k ? 'from' : 'fade', src: k ? 'pr:' + (k - 1) : undefined }));
          it.push(N.label('x:' + k, FW + 16, y + 24, '× ' + base + ' =', 'n-side', { size: 15 }));
          it.push(N.cell('pr:' + k, XP, y, PW, RH - 8, whole + ' + ' + rest + '/' + pd, 'mono' + (k === o.hot ? ' act' : ''), { size: 15 }));
          it.push(N.cell('dg:' + k, XD, y, 48, RH - 8, m.digit, 'mono n-rem' + (k === o.hot ? ' hot' : ''), { size: 19, enter: 'from', src: 'pr:' + k }));
        }
        if (o.loop) {
          const y = o.rows * RH;
          it.push(N.cell('fr:again', 0, y, FW, RH - 8, o.loop.frac, 'mono bad', { size: 16, enter: 'from', src: 'pr:' + (o.rows - 1) }));
          const ya = y + (RH - 8) / 2, yb = o.loop.from * RH + (RH - 8) / 2, bend = Math.min(90, 26 + (ya - yb) / 4);
          it.push({ key: 'loopback', kind: 'edge', from: { x: -6, y: ya }, to: { x: -8, y: yb }, bend, cls: 'bad', label: 'seen before', lx: -6 - bend - 50, ly: (ya + yb) / 2, size: 14 });
        }
        if (o.down && mul.length > 1) it.push({ key: 'readdown', kind: 'edge', from: { x: XD + 78, y: 18 }, to: { x: XD + 78, y: (mul.length - 1) * RH + 18 }, cls: 'hot', label: 'read down', lx: XD + 126, ly: (mul.length - 1) * RH / 2 + 18, size: 14 });
        if (o.result) {
          const y = (o.rows + (o.loop ? 1 : 0)) * RH + 34, w = 36;
          const ds = mul.map((m) => m.digit);
          const x = 120;
          it.push(N.label('res:eq', x - 10, y + 29, '(' + text + ')' + N.sub(10) + ' = 0.', 'strong', { anchor: 'end', size: 17 }));
          ds.forEach((c, j) => it.push(N.cell('res:' + j, x + j * w, y, w - 4, 44, c, 'mono ' + (r.repeating && j >= r.repeating.from ? 'n-rep' : 'good'), { size: 19, enter: 'from', src: 'dg:' + j })));
          const end = x + ds.length * w;
          it.push(N.label('res:tail', end + 2, y + 29, (r.repeating ? '…' : cut ? '…' : '') + ')' + N.sub(base), 'strong', { size: 17 }));
          if (r.repeating) it.push({ key: 'res:br', kind: 'bracket', x1: x + r.repeating.from * w - 2, x2: end - 2, y: y + 52, side: 'below', text: 'repeats: ' + r.repeating.digits, cls: 'y' });
          else if (cut) it.push({ key: 'res:br', kind: 'bracket', x1: x, x2: end - 2, y: y + 52, side: 'below', text: 'first ' + ds.length + ' digits only', cls: 'x' });
        }
        return it;
      };
      const F0 = mul.length ? mul[0].frac : '0';
      F.add({ items: items({ rows: 0 }), say: text + ' = ' + F0 + ' as an exact fraction. Multiply by ' + base + ': the whole part is the first digit after the point, and the fraction left over goes round again.', meta: { next: mul[0] } });
      mul.forEach((m, k) => F.add({ items: items({ rows: k + 1, hot: k }), say: m.say + (m.product.split('/')[0] % m.product.split('/')[1] === 0 ? ' Nothing is left over, so the digits end here.' : ''), meta: { next: k + 1 < mul.length ? mul[k + 1] : null } }));
      let loop = null;
      if (rep) {
        const seen = mul[r.repeating.from].frac;
        loop = { from: r.repeating.from, frac: seen };
        F.add({ items: items({ rows: mul.length, loop }), say: rep.say + ' It first appeared at step ' + (r.repeating.from + 1) + ', so from there on the same multiplications happen again.', mark: 'repeat' });
      } else if (cut) F.add({ items: items({ rows: mul.length }), say: cut.say });
      F.add({ items: items({ rows: mul.length, loop, down: true, result: true }), say: r.trace[r.trace.length - 1].say + (r.repeating ? ' A fraction whose denominator has a prime factor the base lacks never ends in that base.' : r.exact ? ' It ends because ' + F0.split('/')[1] + ' divides a power of ' + base + '.' : ''), mark: 'result' });
      return { frames: F.list, def: N.def(['Repeated multiplication', ['f × ' + base + ' = d + f′,  0 ≤ f′ < 1', 'd is the next digit after the point', 'continue with f′; stop at 0', 'a fraction seen before → the digits repeat']]) };
    },
    predict: [
      { at: (f) => f.meta && f.meta.next, once: true, pick: 'option', ask: (fr, i) => 'Multiply ' + fr[i].meta.next.frac + ' by the base. Which digit comes out?', options: (fr, i, inp) => N.options(fr[i].meta.next.digit, DIG.slice(0, Math.min(+inp.base, 4)).split('').concat(['1', '0', '2', '3'])), answer: (fr, i) => fr[i].meta.next.digit, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'Which decimal fraction has an exact (ending) binary form?', options: ['0.1', '0.2', '0.375', '0.3'], answer: 2, why: '0.375 = 3/8, and 8 is a power of 2: 0.011.' },
      { q: 'Converting a fraction, the digits are read', options: ['bottom to top', 'top to bottom', 'in any order', 'right to left'], answer: 1, why: 'The first multiplication gives the digit just after the point.' },
      { q: 'How do you know the binary digits of 0.3 repeat?', options: ['They are all 1', 'A fraction comes round again (3/5 here)', 'After 8 digits', 'Because 3 is odd'], answer: 1, why: 'The leftover fraction decides everything after it; once one repeats, the digits cycle.' },
      { q: '0.5 in base 3 is', options: ['0.1', '0.111… (1 repeating)', '0.15', '0.2'], answer: 1, why: '1/2 × 3 = 1 + 1/2: the digit 1 and the same fraction again, for ever.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Any base to decimal: the weight of each place
  // ---------------------------------------------------------------------------------------------------
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  S.topic({
    id: 'base-positional', family: 'p1-bases', order: 30, title: 'Any base to decimal: the weight of each place',
    blurb: 'Each digit is worth its value times a power of the base: r⁰ for units, r¹, r² to the left, r⁻¹, r⁻² after the point. Add the pieces up.',
    inputs: [
      { id: 'x', kind: 'string', label: 'Number', def: '2B.8', max: 9 },
      { id: 'base', kind: 'choice', label: 'Written in', def: '16', options: BASES },
    ],
    check: (inp) => {
      try { const v = Num().read(inp.x, +inp.base); if (v.neg) return 'Number: no sign here'; if (v.ip.length > 6 || v.fp.length > 3) return 'Number: at most six digits before the point and three after'; } catch (e) { return 'Number: ' + e.message; }
      return null;
    },
    presets: [
      { label: '2B.8 in hex', values: { x: '2B.8', base: '16' } },
      { label: '1101.101 in binary', values: { x: '1101.101', base: '2' } },
      { label: '715 in octal', values: { x: '715', base: '8' } },
      { label: '0.11 in base 3 (no ending decimal)', values: { x: '0.11', base: '3' } },
      { label: '10000 in binary', values: { x: '10000', base: '2' } },
      { label: '3A in base 12', values: { x: '3A', base: '12' } },
    ],
    run(inp) {
      const base = +inp.base, v = Num().read(inp.x, base);
      const ip = v.ip.replace(/^0+(?=.)/, ''), fp = v.fp;
      const digs = [...ip].map((c, i) => ({ c, p: ip.length - 1 - i })).concat([...fp].map((c, i) => ({ c, p: -(i + 1) })));
      const W = 64, gapPt = 18;
      const tot = digs.length * W + (fp.length ? gapPt : 0);
      const x0 = -tot / 2;
      const xOf = (j) => x0 + j * W + (digs[j].p < 0 ? gapPt : 0);
      const term = (d) => {
        const val = N.val(d.c);
        if (d.p >= 0) return { num: val * base ** d.p, den: 1, text: String(val * base ** d.p) };
        const den = base ** -d.p, g = gcd(val, den) || 1;
        const finite = (() => { let q = den / g; while (q % 2 === 0) q /= 2; while (q % 5 === 0) q /= 5; return q === 1; })();
        return { num: val, den, text: val === 0 ? '0' : finite ? String(+(val / den).toFixed(6)) : (val / g) + '/' + (den / g) };
      };
      const F = new S.Frames();
      const items = (o) => {
        const it = [];
        digs.forEach((d, j) => {
          it.push(N.cell('dg:' + j, xOf(j), 0, W - 8, 52, d.c, 'mono' + (j === o.hot ? ' act' : j < o.done ? ' read' : ''), { size: 24 }));
          if (o.weights) it.push(N.cell('w:' + j, xOf(j), 66, W - 8, 34, base + N.sup(d.p), 'mono n-weight' + (j === o.hot ? ' hot' : ''), { size: 15, enter: 'drop' }));
        });
        if (fp.length) it.push({ key: 'pt', kind: 'token', x: xOf(ip.length) - gapPt / 2 - 4, y: 44, r: 4, cls: 'n-point', audit: 'overlap-ok' });
        if (o.weights) it.push(N.label('wl', x0 - 12, 88, 'weight', 'n-side', { anchor: 'end', size: 13 }));
        // the pieces, a sum line of chips centred under the digits
        const tw = digs.map((d) => Math.max(40, S.geom.textWidth(term(d).text, 16, { mono: true }) + 16)), PG = 24;
        const lineW = tw.reduce((a, b) => a + b, 0) + PG * (digs.length - 1);
        let tx = -lineW / 2;
        for (let j = 0; j < digs.length; j++) {
          if (j < o.done) {
            const t = term(digs[j]);
            it.push(N.cell('t:' + j, tx, 134, tw[j], 40, t.text, 'mono n-term' + (j === o.hot ? ' hot' : ''), { size: 16, enter: 'from', src: 'dg:' + j }));
            if (j + 1 < o.done) it.push(N.label('plus:' + j, tx + tw[j] + PG / 2, 160, '+', 'n-side', { anchor: 'middle', size: 16 }));
          }
          tx += tw[j] + PG;
        }
        if (o.done) it.push(N.label('tl', Math.min(x0, -lineW / 2) - 12, 160, 'value', 'n-side', { anchor: 'end', size: 13 }));
        if (o.sum) it.push(N.cell('sum', -170, 204, 340, 50, o.sum, 'mono good', { size: 19, enter: 'grow' }));
        return it;
      };
      F.add({ items: items({ done: 0 }), say: inp.x + ' in base ' + base + ': ' + digs.length + ' digit' + (digs.length === 1 ? '' : 's') + (fp.length ? ', ' + ip.length + ' before the point and ' + fp.length + ' after' : '') + '.' });
      F.add({ items: items({ done: 0, weights: true }), say: 'Each place has a weight, a power of ' + base + ': ' + digs.map((d) => base + N.sup(d.p) + ' = ' + (d.p >= 0 ? base ** d.p : '1/' + base ** -d.p)).join(', ') + '.', meta: { ask: digs.length ? 0 : null } });
      digs.forEach((d, j) => {
        const t = term(d);
        F.add({ items: items({ done: j + 1, hot: j, weights: true }), say: 'Digit ' + d.c + (N.val(d.c) > 9 ? ' (= ' + N.val(d.c) + ')' : '') + ' × ' + base + N.sup(d.p) + ' = ' + t.text + '.', meta: { ask: j + 1 < digs.length ? j + 1 : null } });
      });
      // the exact sum
      let num = 0, den = 1;
      for (const d of digs) { const t = term(d); const L = den * t.den / gcd(den, t.den); num = num * (L / den) + t.num * (L / t.den); den = L; const g = gcd(num, den) || 1; num /= g; den /= g; }
      const whole = Math.floor(num / den), rest = num % den;
      const fin = (() => { let q = den; while (q % 2 === 0) q /= 2; while (q % 5 === 0) q /= 5; return q === 1; })();
      const sumText = rest === 0 ? String(whole) : fin ? String(+(num / den).toFixed(8)) : (whole ? whole + ' + ' : '') + rest + '/' + den;
      F.add({ items: items({ done: digs.length, weights: true, sum: '(' + inp.x + ')' + N.sub(base) + ' = ' + sumText }), say: 'Add the pieces: (' + inp.x + ')' + N.sub(base) + ' = ' + sumText + ' in decimal.' + (!fin && rest ? ' The fraction has no ending decimal form, so it is kept exact.' : ''), mark: 'result' });
      return { frames: F.list, def: N.def(['Positional notation', ['(dₙ…d₁d₀.d₋₁d₋₂)ᵣ', '= dₙrⁿ + … + d₁r + d₀ + d₋₁r⁻¹ + d₋₂r⁻²', 'every digit 0 ≤ dᵢ < r']]) };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask !== null && f.meta.ask !== undefined, once: true, pick: 'option', ask: () => 'What is the next piece, digit × weight?', options: (fr, i) => { const nx = fr[i + 1].say.match(/= ([^ ]+)\.$/)[1]; const n = +nx; return N.options(nx, isNaN(n) ? ['0', '1', '1/2'] : [n * 2, n / 2, n + 1, n ? n - 1 : 3].map((x) => String(+x.toFixed(6)))); }, answer: (fr, i) => fr[i + 1].say.match(/= ([^ ]+)\.$/)[1], explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'What is (101.1)₂ in decimal?', options: ['5.1', '5.5', '10.5', '5.25'], answer: 1, why: '4 + 0 + 1 + 1/2 = 5.5.' },
      { q: 'The weight of the second digit after the point in octal is', options: ['1/8', '1/16', '1/64', '1/2'], answer: 2, why: '8⁻² = 1/64.' },
      { q: '(FF)₁₆ is', options: ['225', '255', '256', '1515'], answer: 1, why: '15 × 16 + 15 = 255.' },
      { q: 'Which digit cannot appear in base 8?', options: ['0', '7', '8', '5'], answer: 2, why: 'Digits run from 0 to r − 1 = 7.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Grouping bits: binary, octal and hexadecimal
  // ---------------------------------------------------------------------------------------------------
  const P2 = [{ value: '2', label: 'binary' }, { value: '8', label: 'octal' }, { value: '16', label: 'hexadecimal' }];
  S.topic({
    id: 'base-grouping', family: 'p1-bases', order: 40, title: 'Octal and hex by grouping bits',
    blurb: 'One octal digit is exactly three bits and one hex digit exactly four. Spell each digit in bits, then regroup outward from the point, padding the ends with zeros.',
    inputs: [
      { id: 'x', kind: 'string', label: 'Number', def: '3D.A' , max: 14 },
      { id: 'from', kind: 'choice', label: 'From', def: '16', options: P2 },
      { id: 'to', kind: 'choice', label: 'To', def: '8', options: P2 },
    ],
    check: (inp) => {
      if (inp.from === inp.to) return 'Choose two different bases';
      try { const v = Num().read(inp.x, +inp.from); if (v.neg) return 'Number: no sign here'; const k = Math.log2(+inp.from); if ((v.ip.length + v.fp.length) * k > 20) return 'Number: at most 20 bits, so the picture stays readable'; } catch (e) { return 'Number: ' + e.message; }
      return null;
    },
    presets: [
      { label: 'Hex 3D.A to octal', values: { x: '3D.A', from: '16', to: '8' } },
      { label: 'Binary 1011101.11 to hex', values: { x: '1011101.11', from: '2', to: '16' } },
      { label: 'Octal 752 to hex', values: { x: '752', from: '8', to: '16' } },
      { label: 'Hex C0DE to binary', values: { x: 'C0DE', from: '16', to: '2' } },
      { label: 'Binary 110.1 to octal (pad both ends)', values: { x: '110.1', from: '2', to: '8' } },
      { label: 'Octal 17 to binary', values: { x: '17', from: '8', to: '2' } },
    ],
    run(inp) {
      const from = +inp.from, to = +inp.to, kf = Math.log2(from), kt = Math.log2(to);
      const v = Num().read(inp.x, from), conv = Num().convert(inp.x, from, to);
      const ib = [...v.ip].map((c) => N.val(c).toString(2).padStart(kf, '0')).join(''), fb = [...v.fp].map((c) => N.val(c).toString(2).padStart(kf, '0')).join('');
      // every bit has a place: integer bits 0, 1, 2 … leftward from the point, fraction bits -1, -2 … rightward
      const bitAt = new Map();
      [...ib].forEach((b, i) => bitAt.set(ib.length - 1 - i, b));
      [...fb].forEach((b, i) => bitAt.set(-(i + 1), b));
      const ilead = ib.replace(/^0+/, '').length, ftrail = fb.replace(/0+$/, '').length;
      const BW = 34, GAP = 14, Y = 110;
      // positions of bits in a grouping of size k over places hi..lo
      const layout = (k, hi, lo) => {
        const pos = new Map(); let x = 0;
        for (let p = hi; p >= lo; p--) {
          pos.set(p, x);
          x += BW;
          const nextGroupBreak = p > 0 ? p % k === 0 : p === 0 ? true : (-p) % k === 0;
          if (p > lo && nextGroupBreak) x += p === 0 ? GAP + 14 : GAP;
        }
        return { pos, w: x };
      };
      const hiF = ib.length - 1, loF = -fb.length;
      const hiT = Math.max(Math.ceil(Math.max(ilead, 1) / kt) * kt - 1, 0), loT = ftrail ? -Math.ceil(ftrail / kt) * kt : 0;
      const LF = layout(kf, hiF, loF === 0 ? 0 : loF), LT = layout(kt, hiT, loT === 0 ? 0 : loT);
      const cx = (L) => -L.w / 2;
      const F = new S.Frames();
      const groupsOf = (k, hi, lo) => { const gs = []; for (let top = hi; top >= lo; top -= k) { const ps = []; for (let p = top; p > top - k && p >= lo; p--) ps.push(p); gs.push(ps); } return gs; };
      // groups aligned to the point
      const alignedGroups = (k, hi, lo) => {
        const gs = [];
        const ints = []; for (let p = hi; p >= 0; p--) ints.push(p);
        for (let i = 0; i < ints.length; i += k) gs.push(ints.slice(i, i + k));
        const fr = []; for (let p = -1; p >= lo; p--) fr.push(p);
        for (let i = 0; i < fr.length; i += k) gs.push(fr.slice(i, i + k));
        return gs;
      };
      void groupsOf;
      const items = (o) => {
        const it = [];
        const src = [...v.ip].concat(v.fp ? ['.'] : [], [...v.fp]);
        // the source digits, above their groups of bits
        const gF = alignedGroups(kf, hiF, loF === 0 ? 0 : loF);
        let gi = 0;
        src.forEach((c) => {
          if (c === '.') return;
          const g = gF[gi++];
          if (!g) return;
          const xa = cx(LF) + LF.pos.get(g[0]), xb = cx(LF) + LF.pos.get(g[g.length - 1]) + BW;
          if (from !== 2) it.push(N.cell('src:' + gi, (xa + xb) / 2 - 22, 0, 44, 46, c, 'mono' + (o.srcHot === gi - 1 ? ' act' : '') + (o.target ? ' read' : ''), { size: 22 }));
        });
        const L = o.target ? LT : LF, x0 = cx(L);
        const hi = o.target ? hiT : hiF, lo = o.target ? loT : loF;
        if (o.bits) {
          for (let p = hi; p >= lo; p--) {
            if (p === 0 && lo === 0 && false) continue;
            if (!L.pos.has(p)) continue;
            const has = bitAt.has(p), b = has ? bitAt.get(p) : '0';
            const extra = o.target && (!has || (p >= ilead) || (p < 0 && -p > ftrail));
            const lead = !o.target && o.fade && ((p >= 0 && p >= ilead) || (p < 0 && -p > ftrail));
            it.push(N.cell('b:' + p, x0 + L.pos.get(p), Y, BW - 4, 42, b, 'mono n-bit' + (extra ? ' n-pad' : '') + (lead ? ' n-pad' : '') + (b === '1' ? ' n-one' : ''), { size: 19, enter: has ? (from === 2 ? 'fade' : 'from') : 'drop', src: has && from !== 2 ? 'src:' + (gF.findIndex((g) => g.includes(p)) + 1) : undefined }));
          }
          // the point
          if (lo < 0) it.push({ key: 'pt', kind: 'token', x: x0 + L.pos.get(0) + BW + (GAP + 14) / 2 - 1, y: Y + 36, r: 4.5, cls: 'n-point', audit: 'overlap-ok' });
          // group brackets
          const gs = alignedGroups(o.target ? kt : kf, hi, lo);
          gs.forEach((g, i) => {
            const xa = x0 + L.pos.get(g[0]), xb = x0 + L.pos.get(g[g.length - 1]) + BW - 4;
            it.push({ key: (o.target ? 'gt:' : 'gf:') + i, kind: 'bracket', x1: xa, x2: xb, y: Y + 48, side: 'below', text: o.target && o.digits ? '' : '', cls: o.target ? 'y' : 'x' });
          });
          if (o.target && o.digits) {
            gs.forEach((g, i) => {
              const xa = x0 + L.pos.get(g[0]), xb = x0 + L.pos.get(g[g.length - 1]) + BW - 4;
              const bits = g.map((p) => (bitAt.has(p) ? bitAt.get(p) : '0')).join('');
              it.push(N.cell('out:' + i, (xa + xb) / 2 - 24, Y + 78, 48, 50, DIG[parseInt(bits, 2)], 'mono good' + (o.digitHot === i ? ' hot' : ''), { size: 22, enter: 'grow' }));
            });
          }
        }
        it.push(N.label('lbl:src', cx(LF) - 18, 30, from === 2 ? '' : 'base ' + from, 'n-side', { anchor: 'end', size: 13 }));
        it.push(N.label('lbl:bits', Math.min(cx(LF), cx(LT)) - 18, Y + 27, 'bits', 'n-side', { anchor: 'end', size: 14 }));
        if (o.target && o.digits) it.push(N.label('lbl:out', Math.min(cx(LF), cx(LT)) - 18, Y + 109, 'base ' + to, 'n-side', { anchor: 'end', size: 14 }));
        return it;
      };
      const say0 = 'Base ' + from + ' and base ' + to + ' are both powers of 2: ' + from + ' = 2' + N.sup(kf) + ', ' + to + ' = 2' + N.sup(kt) + '. Binary is the bridge.';
      F.add({ items: items({ bits: from === 2 }), say: say0 });
      if (from !== 2) {
        const ds = [...v.ip, ...v.fp];
        ds.forEach((c, i) => {
          // show digits turned to bits one by one: all bits so far
          F.add({ items: items({ bits: true, srcHot: i }), say: c + ' = ' + N.val(c).toString(2).padStart(kf, '0') + ' in ' + kf + ' bits.' + (i === ds.length - 1 ? ' Every base-' + from + ' digit is exactly ' + kf + ' bits.' : '') });
        });
      }
      const trimmed = (ib.length - ilead) + (fb.length - ftrail);
      if (trimmed) F.add({ items: items({ bits: true, fade: true }), say: 'Zeros at the far left of the integer part and the far right of the fraction change nothing; ' + trimmed + ' of them can go.' });
      const padI = (hiT + 1) - Math.max(ilead, 1) > 0 ? (hiT + 1) - ilead : 0, padF = loT < 0 ? -loT - ftrail : 0;
      F.add({ items: items({ bits: true, target: true }), say: 'Regroup in ' + kt + 's, outward from the point' + (padI || padF ? ', padding with zeros (faded): ' + (padI ? padI + ' on the left' : '') + (padI && padF ? ' and ' : '') + (padF ? padF + ' on the right' : '') : '') + '.' + (to === 2 ? '' : ' Never start grouping from the left end: the groups must line up with the point.'), meta: { group: to !== 2 } });
      if (to !== 2) {
        const gs = alignedGroups(kt, hiT, loT);
        gs.forEach((g, i) => {
          const bits = g.map((p) => (bitAt.has(p) ? bitAt.get(p) : '0')).join('');
          F.add({ items: items({ bits: true, target: true, digits: true, digitHot: i }), say: bits + ' = ' + DIG[parseInt(bits, 2)] + '.' + (i === gs.length - 1 ? ' ' + conv.trace[conv.trace.length - 1].say : ''), mark: i === gs.length - 1 ? 'result' : undefined });
        });
      } else F.add({ items: items({ bits: true, target: true }), say: conv.trace[conv.trace.length - 1].say, mark: 'result' });
      return { frames: F.list, def: N.def(['Bits per digit', ['octal digit = 3 bits (8 = 2³)', 'hex digit = 4 bits (16 = 2⁴)', 'group outward from the point', 'pad the ends with 0s']], ['Result', [conv.trace[conv.trace.length - 1].say]]) };
    },
    predict: [
      { at: (f) => f.meta && f.meta.group, once: true, pick: 'option', ask: (fr, i, inp) => 'Regrouped into base ' + inp.to + ', how many digits will the answer have?', options: (fr, i, inp) => { const a = Num().convert(inp.x, +inp.from, +inp.to).result.replace('.', '').length; return N.options(a, [a - 1, a + 1, a + 2, 1].filter((x) => x > 0)); }, answer: (fr, i, inp) => String(Num().convert(inp.x, +inp.from, +inp.to).result.replace('.', '').length), explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: '(110101)₂ in octal is', options: ['65', '53', '35', '651'], answer: 0, why: '110 101 = 6 5.' },
      { q: '(7F)₁₆ in binary is', options: ['1111111', '01111111 1', '111 1111 0', '1110 1111'], answer: 0, why: '7 = 0111, F = 1111: 0111 1111, the leading 0 dropped.' },
      { q: 'Grouping 1011.1 into octal, the fraction group becomes', options: ['1', '001', '100', '010'], answer: 2, why: 'Pad on the right of a fraction: .1 → .100 = .4.' },
      { q: 'Why can octal and hex be converted without arithmetic?', options: ['They are both even', 'Both are powers of 2, so each digit is a whole number of bits', 'They use letters', 'Computers prefer them'], answer: 1, why: '8 = 2³ and 16 = 2⁴: a digit maps to a fixed group of bits.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Arithmetic in another base
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'base-arith', family: 'p1-bases', order: 50, title: 'Adding and subtracting in another base',
    blurb: 'The column method works in every base: a column that reaches the base carries one to the next, and a column that runs short borrows one worth the base.',
    inputs: [
      { id: 'a', kind: 'string', label: 'First', def: '1011', max: 10 },
      { id: 'b', kind: 'string', label: 'Second', def: '0111', max: 10 },
      { id: 'base', kind: 'choice', label: 'Base', def: '2', options: [2, 3, 8, 16].map((b) => ({ value: String(b), label: 'base ' + b })) },
      { id: 'op', kind: 'choice', label: 'Operation', def: '+', options: [{ value: '+', label: 'add' }, { value: '−', label: 'subtract' }] },
    ],
    check: (inp) => {
      try { for (const k of ['a', 'b']) { const v = Num().read(inp[k], +inp.base); if (v.neg || v.fp) return (k === 'a' ? 'First' : 'Second') + ': a whole number without a sign'; } } catch (e) { return e.message; }
      if (inp.op === '−') { const x = Num().read(inp.a, +inp.base).int, y = Num().read(inp.b, +inp.base).int; if (x < y) return 'Subtract: the first must be at least the second here (negative results come with complements)'; }
      return null;
    },
    presets: [
      { label: 'Binary: 1011 + 0111', values: { a: '1011', b: '0111', base: '2', op: '+' } },
      { label: 'Binary: carries all the way, 1111 + 1', values: { a: '1111', b: '1', base: '2', op: '+' } },
      { label: 'Octal: 657 + 236', values: { a: '657', b: '236', base: '8', op: '+' } },
      { label: 'Hex: 9F3 + 4BD', values: { a: '9F3', b: '4BD', base: '16', op: '+' } },
      { label: 'Binary: 10010 − 1011 (borrows)', values: { a: '10010', b: '1011', base: '2', op: '−' } },
      { label: 'Hex: A02 − 3F7', values: { a: 'A02', b: '3F7', base: '16', op: '−' } },
      { label: 'Base 3: 2101 + 1222', values: { a: '2101', b: '1222', base: '3', op: '+' } },
    ],
    run(inp) {
      const base = +inp.base, op = inp.op;
      const a = inp.a.toUpperCase().replace(/^0+(?=.)/, ''), b = inp.b.toUpperCase().replace(/^0+(?=.)/, '');
      const cols = N.columns(a, b, base, op);
      const n = cols.length;
      const endCarry = op === '+' && cols[n - 1].cout;
      const result = (endCarry ? '1' : '') + cols.slice().reverse().map((c) => c.digit).join('');
      const F = new S.Frames();
      const draw = (upto, hot) => {
        const carries = {};
        for (const c of cols) if (c.k <= upto && c.cout && (c.k + 1 < n || op === '+')) carries[c.k + 1] = op === '−' ? '−1' : '1';
        const lead0 = upto >= n ? result.length - (result.replace(/^0+(?=.)/, '').length) : 0;
        const s = N.sum({ prefix: 's', x: 0, y: 0, rows: [{ text: a, pad: false }, { text: b, pad: false }], op, base, carries, result: upto >= n - 1 ? result : result.slice(-(upto + 1)), hot, extra: true, width: n, resCls: (k) => (k >= result.length - lead0 ? 'n-pad' : '') });
        return s.items.concat([N.label('basel', s.box.x + s.box.w + 8, s.resultY + 38, N.sub(base), 'strong', { size: 22 })]);
      };
      F.add({ items: draw(-1, 0), say: 'In base ' + base + ', ' + a + ' ' + op + ' ' + b + '. Work column by column from the right; a digit can only be 0 to ' + DIG[base - 1] + '.', meta: { col: cols[0] } });
      cols.forEach((c, k) => {
        let say;
        if (op === '+') say = 'Column ' + (k + 1) + ': ' + DIG[c.a] + ' + ' + DIG[c.b] + (c.cin ? ' + carry 1' : '') + ' = ' + c.total + (c.total >= base ? ' = 1×' + base + ' + ' + (c.total - base) + ': write ' + c.digit + ', carry 1.' : ': write ' + c.digit + '.');
        else { const d = c.a - c.cin - c.b; say = 'Column ' + (k + 1) + ': ' + DIG[c.a] + (c.cin ? ' − 1 (borrowed)' : '') + ' − ' + DIG[c.b] + ' = ' + d + (d < 0 ? ', below 0: borrow one from the next column, worth ' + base + ' here: ' + d + ' + ' + base + ' = ' + (d + base) + ', write ' + c.digit + '.' : ', write ' + c.digit + '.'); }
        if (k === n - 1 && endCarry) say += ' The last carry becomes a new leading digit.';
        F.add({ items: draw(k, k), say, meta: { col: cols[k + 1] } });
      });
      const dec = (s) => parseInt(s, base);
      F.add({ items: draw(n, -1), say: a + ' ' + op + ' ' + b + ' = ' + result + ' in base ' + base + '. Check in decimal: ' + dec(a) + ' ' + op + ' ' + dec(b) + ' = ' + dec(result) + '.', mark: 'result' });
      return { frames: F.list, def: N.def(['Column rules in base ' + base, op === '+' ? ['sum = a + b + carry in', 'sum ≥ ' + base + ' → write sum − ' + base + ', carry 1'] : ['diff = a − borrow in − b', 'diff < 0 → add ' + base + ', borrow 1 from the left']]) };
    },
    predict: [
      { at: (f) => f.meta && f.meta.col && f.meta.col.k === 1, once: true, pick: 'option', ask: () => 'Which digit is written in the next column?', options: (fr, i, inp) => N.options(fr[i].meta.col.digit, DIG.slice(0, +inp.base).split('').reverse()), answer: (fr, i) => fr[i].meta.col.digit, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'In binary, 1 + 1 + 1 (with a carry in) is', options: ['write 1, carry 1', 'write 0, carry 1', 'write 1, carry 0', 'write 3'], answer: 0, why: '3 = 1×2 + 1.' },
      { q: 'In octal, 7 + 5 is', options: ['12, written 12', '14 (write 4, carry 1)', '13', '2'], answer: 1, why: '12 = 1×8 + 4: write 4 and carry 1, giving (14)₈.' },
      { q: 'In hex, borrowing into a column adds', options: ['10', '16', '8', '1'], answer: 1, why: 'One unit of the next column is worth the base, 16.' },
      { q: '(1111)₂ + 1 =', options: ['1111', '10000', '11110', '10001'], answer: 1, why: 'Every column carries: 15 + 1 = 16 = 10000₂.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
