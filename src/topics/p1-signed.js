// Part 1, complements and signed numbers: r's and (r−1)'s complements, subtraction by adding a complement, the three
// signed systems side by side, the two's complement wheel and overflow in addition.
(function (S) {
  'use strict';
  const K = S.Kit, N = K.num;
  const Num = () => S.Bool.Numbers;
  const DIG = N.DIG;
  const BASE4 = [2, 8, 10, 16].map((b) => ({ value: String(b), label: 'base ' + b }));
  const REP = { sm: 'signed magnitude', '1s': "one's complement", '2s': "two's complement" };

  S.family({ id: 'p1-signed', part: 'numbers', order: 20, title: 'Complements and signed numbers', blurb: 'Subtraction by adding, negative numbers in a fixed number of bits, and what happens when a sum does not fit.' });

  // ---------------------------------------------------------------------------------------------------
  // r's and (r−1)'s complements
  // ---------------------------------------------------------------------------------------------------
  const wholeIn = (label) => (v, inp) => { try { const r = Num().read(v, +inp.base); if (r.neg || r.fp) return label + ': a whole number without a sign'; } catch (e) { return label + ': ' + e.message; } return null; };
  S.topic({
    id: 'complements', family: 'p1-signed', order: 10, title: "r's and (r−1)'s complements",
    blurb: "The (r−1)'s complement takes every digit from the largest digit; add 1 and you have the r's complement. In binary that is: invert every bit, then add 1.",
    inputs: [
      { id: 'x', kind: 'string', label: 'Number', def: '0110100', max: 8, check: wholeIn('Number') },
      { id: 'base', kind: 'choice', label: 'Base', def: '2', options: BASE4 },
      { id: 'n', kind: 'number', label: 'Digits (0: as written)', def: 0, min: 0, max: 8 },
    ],
    check: (inp) => (inp.n && inp.x.length > inp.n ? 'Digits: the number already has ' + inp.x.length + ' digits' : null),
    presets: [
      { label: 'Binary 0110100', values: { x: '0110100', base: '2', n: 0 } },
      { label: 'Decimal 2650 (9s and 10s)', values: { x: '2650', base: '10', n: 0 } },
      { label: 'Decimal 2650 in six digits', values: { x: '2650', base: '10', n: 6 } },
      { label: 'Hex 3A0', values: { x: '3A0', base: '16', n: 0 } },
      { label: 'Zero: the carry falls off', values: { x: '0000', base: '2', n: 0 } },
      { label: 'Binary 1000 (the 1 that stays)', values: { x: '1000', base: '2', n: 0 } },
    ],
    run(inp) {
      const base = +inp.base, n = Math.max(inp.n || 0, inp.x.length), x = inp.x.toUpperCase().padStart(n, '0');
      const top = DIG[base - 1];
      const dim = [...x].map((c) => DIG[base - 1 - N.val(c)]).join('');
      const plus = N.columns(dim, '1', base, '+');
      const rc = Num().complement(x, base, 'r', { digits: n }).result;
      const endCarry = plus[plus.length - 1].cout;
      const F = new S.Frames();
      const GAP = 120;
      const wA = 46 + n * 46;
      const draw = (o) => {
        const A = N.sum({ prefix: 'A', x: 0, y: 0, rows: [{ text: top.repeat(n), cls: () => 'n-key' }, { text: x }], op: '−', base, carryLabel: false, result: dim, upto: o.a === undefined ? -1 : o.a, hot: o.aHot });
        const it = A.items.concat([N.label('A:t', A.left + (n * 46) / 2, -12, (base - 1) + "'s complement", 'title', { anchor: 'middle' })]);
        if (o.b !== undefined) {
          const carries = {};
          for (const c of plus) if (c.k <= o.b && c.cout && c.k + 1 < n) carries[c.k + 1] = '1';
          const B = N.sum({ prefix: 'B', x: wA + GAP - 46, y: 0, rows: [{ text: dim }, { text: '1', pad: false }], op: '+', base, carries, result: rc.replace('.', ''), upto: o.b, hot: o.bHot, carryLabel: false });
          it.push(...B.items, N.label('B:t', B.left + (n * 46) / 2, -12, base + "'s complement", 'title', { anchor: 'middle' }));
          it.push({ key: 'AB', kind: 'edge', from: { x: wA + 8, y: 42 + 2 * 48 + 12 + 21 }, to: { x: wA + GAP - 16, y: 42 + 21 }, cls: 'hot', head: true });
          if (o.drop) it.push(N.cell('B:end', B.left - 46 - 2, 42 + 2 * 48 + 12, 34, 42, '1', 'mono n-carry bad', { size: 18, enter: 'drop', exit: 'fall' }));
        }
        return it;
      };
      F.add({ items: draw({}), say: x + ' in base ' + base + ', ' + n + ' digit' + (n === 1 ? '' : 's') + '. The largest digit is ' + top + ': subtract every digit from it.', meta: { dig: x[n - 1] } });
      for (let k = 0; k < n; k++) {
        const c = x[n - 1 - k], d = dim[n - 1 - k];
        F.add({ items: draw({ a: k, aHot: k }), say: top + ' − ' + c + ' = ' + d + (base === 2 ? ': each bit is simply inverted.' : '.') + (k === n - 1 ? ' The ' + (base - 1) + "'s complement is " + dim + '.' : ''), hl: { s0: [0] }, meta: { dig: k + 1 < n ? x[n - 2 - k] : null } });
      }
      // add 1: column by column while the carry runs, then the rest at once
      let k = 0;
      for (; k < n; k++) {
        const c = plus[k];
        F.add({ items: draw({ a: n, b: k, bHot: k }), say: 'Add 1 for the ' + base + "'s complement. Column " + (k + 1) + ': ' + DIG[c.a] + (c.k === 0 ? ' + 1' : c.cin ? ' + carry 1' : '') + ' = ' + c.total + (c.cout ? ' = ' + base + ': write 0 and carry 1.' : ': write ' + c.digit + '; nothing more to carry, so every digit to the left is copied as it is.'), hl: { s1: [0] } });
        if (!c.cout) break;
      }
      if (k < n - 1) F.add({ items: draw({ a: n, b: n }), say: 'Copy the remaining digits: the ' + base + "'s complement is " + rc + '.' });
      if (endCarry) F.add({ items: draw({ a: n, b: n, drop: true }), say: 'The carry out of the top digit has nowhere to go and is dropped: the ' + base + "'s complement of 0 is 0 again." });
      const val = parseInt(x, base), sumCheck = parseInt(rc, base) + val;
      F.add({ items: draw({ a: n, b: n }), say: (base - 1) + "'s complement " + dim + ', ' + base + "'s complement " + rc + '. Check: ' + x + ' + ' + rc + ' = ' + (sumCheck === 0 ? '0' : '1' + '0'.repeat(n)) + (sumCheck === 0 ? '' : ' = ' + base + N.sup(n)) + ', so the complement acts as the negative of ' + x + ' when only ' + n + ' digits are kept.' + (base === 2 ? ' Shortcut: copy the bits from the right up to and including the first 1, then invert the rest.' : ''), mark: 'result', hl: { s2: [0, 1] } });
      const nB = { x: wA + GAP - 60, y: -40, w: 46 + (n + 1) * 46 + 30, h: 250 };
      F.list.forEach((f, k) => { if (k < F.list.length - 1) f.narrowView = k <= n ? { x: -10, y: -40, w: wA + 20, h: 250 } : nB; });
      return { frames: F.list, def: N.def(["(r−1)'s complement", ['(rⁿ − 1) − N', 'each digit d → ' + top + ' − d']], ["r's complement", ['rⁿ − N  (0 for N = 0)', "= (r−1)'s complement + 1"]], ['Why', ['N + (rⁿ − N) = rⁿ = 1 followed by n zeros', 'with n digits kept, that is 0']]) };
    },
    predict: [
      { at: (f) => f.meta && f.meta.dig, once: true, pick: 'option', ask: (fr, i, inp) => 'What is the (r−1)\'s complement digit of ' + fr[i].meta.dig + ' in base ' + inp.base + '?', options: (fr, i, inp) => N.options(DIG[+inp.base - 1 - N.val(fr[i].meta.dig)], DIG.slice(0, +inp.base).split('')), answer: (fr, i, inp) => DIG[+inp.base - 1 - N.val(fr[i].meta.dig)], explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: "The 9's complement of 3071 is", options: ['6928', '6929', '7039', '3071'], answer: 0, why: '9 − 3, 9 − 0, 9 − 7, 9 − 1.' },
      { q: "The 2's complement of 01100 is", options: ['10011', '10100', '10010', '01101'], answer: 1, why: 'Invert to 10011 and add 1: 10100. Or copy up to the first 1 from the right (100) and invert the rest (10).' },
      { q: "The 10's complement of 0000 (four digits) is", options: ['10000', '0000', '9999', '0001'], answer: 1, why: '9999 + 1 = 10000; the fifth digit is dropped.' },
      { q: "In base 16, the (r−1)'s complement of 2C is", options: ['D3', 'D4', '3D', 'E3'], answer: 0, why: 'F − 2 = D and F − C = 3.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Subtraction with complements
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'complement-subtract', family: 'p1-signed', order: 20, title: "Subtraction by adding the r's complement",
    blurb: "M − N becomes M + (rⁿ − N). An end carry means the answer is positive: drop the carry. No end carry means it is negative: complement the sum again.",
    inputs: [
      { id: 'm', kind: 'string', label: 'M', def: '72532', max: 7, check: wholeIn('M') },
      { id: 'nn', kind: 'string', label: 'N', def: '3250', max: 7, check: wholeIn('N') },
      { id: 'base', kind: 'choice', label: 'Base', def: '10', options: BASE4 },
    ],
    presets: [
      { label: 'Decimal 72532 − 3250 (positive)', values: { m: '72532', nn: '3250', base: '10' } },
      { label: 'Decimal 3250 − 72532 (negative)', values: { m: '3250', nn: '72532', base: '10' } },
      { label: 'Binary 1010100 − 1000011', values: { m: '1010100', nn: '1000011', base: '2' } },
      { label: 'Binary 1000011 − 1010100', values: { m: '1000011', nn: '1010100', base: '2' } },
      { label: 'Equal: 456 − 456', values: { m: '456', nn: '456', base: '10' } },
      { label: 'Hex B2 − 4F', values: { m: 'B2', nn: '4F', base: '16' } },
    ],
    run(inp) {
      const base = +inp.base, M0 = inp.m.toUpperCase(), N0 = inp.nn.toUpperCase();
      const n = Math.max(M0.length, N0.length), M = M0.padStart(n, '0'), Nn = N0.padStart(n, '0');
      const comp = Num().complement(Nn, base, 'r', { digits: n }).result;
      const sub = Num().subtract(M, Nn, base);
      const cols = N.columns(M, comp, base, '+');
      const carry = cols[n - 1].cout;
      const sumDigits = cols.slice().reverse().map((c) => c.digit).join('');
      const F = new S.Frames();
      const X2 = 46 + (n + 1) * 46 + 70;
      const draw = (o) => {
        const it = [];
        // left: N and its complement
        const L = N.digits({ prefix: 'n', x: 0, y: 42, text: Nn, cw: 34, ch: 40, gap: 4, size: 17 });
        it.push(N.label('n:l', -8, 68, 'N', 'n-side', { anchor: 'end', size: 15 }), ...L.items);
        if (o.comp) {
          const C = N.digits({ prefix: 'nc', x: 0, y: 132, text: comp, cw: 34, ch: 40, gap: 4, size: 17, cls: () => 'n-sign', more: (i) => ({ enter: 'from', src: 'n:' + i }) });
          it.push(N.label('nc:l', -8, 158, "r's", 'n-side', { anchor: 'end', size: 15 }), ...C.items);
          it.push({ key: 'nc:arrow', kind: 'edge', from: { x: n * 19, y: 86 }, to: { x: n * 19, y: 128 }, cls: 'hot', label: base + "'s complement", lx: n * 19 + 70, ly: 107, size: 13 });
        }
        if (o.add !== undefined) {
          const carries = {};
          for (const c of cols) if (c.k <= o.add && c.cout) carries[c.k + 1] = '1';
          const res = (carry ? '1' : '') + sumDigits;
          const A = N.sum({ prefix: 's', x: X2, y: 0, rows: [{ text: M }, { text: comp, cls: () => 'n-sign' }], op: '+', base, carries, result: o.add >= n - 1 ? res : sumDigits.slice(-(o.add + 1)), hot: o.addHot, extra: true, width: n, carryCls: (k) => (k === n && o.drop ? 'bad' : '') });
          it.push(...A.items);
          if (o.drop && carry) it.push(N.label('s:dropl', A.left + 21, A.resultY + 66, 'dropped', 'bad', { anchor: 'middle', size: 13 }));
          if (o.neg) {
            const back = sub.result.replace('-', '').padStart(n, '0');
            const B = N.digits({ prefix: 'neg', x: A.xOf(0), y: A.resultY + 76, text: back, cw: 42, gap: 4, size: 19, cls: () => 'good', more: (i) => ({ enter: 'from', src: 's:res:' + (n - 1 - i) }) });
            it.push(...B.items, N.label('neg:l', A.xOf(0) - 10, A.resultY + 104, '−', 'strong', { anchor: 'end', size: 24 }));
          }
        }
        return it;
      };
      F.add({ items: draw({}), say: 'M − N in base ' + base + ' with ' + n + ' digits: M = ' + M + ', N = ' + Nn + '. Instead of subtracting, add the ' + base + "'s complement of N.", meta: { carry } });
      F.add({ items: draw({ comp: true }), say: 'The ' + base + "'s complement of " + Nn + ' is ' + comp + ' (' + base + N.sup(n) + ' − N).' });
      cols.forEach((c, k) => F.add({ items: draw({ comp: true, add: k, addHot: k }), say: 'Column ' + (k + 1) + ': ' + DIG[c.a] + ' + ' + DIG[c.b] + (c.cin ? ' + 1' : '') + ' = ' + c.total + (c.cout ? ': write ' + c.digit + ', carry 1.' : ': write ' + c.digit + '.') + (k === n - 1 ? (carry ? ' A carry comes out of the top digit: an end carry.' : ' No carry comes out of the top digit.') : '') }));
      if (carry) F.add({ items: draw({ comp: true, add: n, drop: true }), say: sub.trace[sub.trace.length - 1].say + ' (M ≥ N, so M + rⁿ − N ≥ rⁿ, and dropping the carry takes away the rⁿ.)', mark: 'result' });
      else {
        F.add({ items: draw({ comp: true, add: n }), say: 'No end carry: the sum ' + sumDigits + ' is rⁿ − (N − M), the complement of the answer, so the answer is negative.' });
        F.add({ items: draw({ comp: true, add: n, neg: true }), say: sub.trace[sub.trace.length - 1].say, mark: 'result' });
      }
      F.list.forEach((f, k) => { f.narrowView = k < 2 ? { x: -40, y: 20, w: n * 38 + 170, h: 200 } : { x: X2 - 20, y: -24, w: 46 + (n + 2) * 46 + 30, h: 360 }; });
      return { frames: F.list, def: N.def(['M − N with complements', ['M + (rⁿ − N) = rⁿ + (M − N)', 'end carry → M ≥ N: drop it', 'no carry → M < N: answer = −(r\'s complement of the sum)']]) };
    },
    predict: [
      { at: (f, i) => i === 1, once: true, pick: 'option', ask: 'Will the addition give an end carry?', options: ['Yes: the answer is positive', 'No: the answer is negative'], answer: (fr, i) => (fr[0].meta.carry ? 'Yes: the answer is positive' : 'No: the answer is negative'), explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: 'Computing 5250 − 1321 with the 10\'s complement: 5250 + 8679 =', options: ['13929, drop the carry: 3929', '13929, answer −3929', '3929 with no carry', '14929'], answer: 0, why: 'The end carry shows M ≥ N; dropping it gives 3929.' },
      { q: 'When there is no end carry, the answer is', options: ['the sum itself', 'the r\'s complement of the sum, with a minus sign', 'zero', 'an overflow'], answer: 1, why: 'The sum is rⁿ − (N − M), the complement of the true magnitude.' },
      { q: 'M = N gives a sum of', options: ['0 with no carry', 'rⁿ: 0 with an end carry', 'all 9s', 'N'], answer: 1, why: 'M + rⁿ − M = rⁿ; dropping the carry leaves 0.' },
      { q: 'Why do machines subtract this way?', options: ['It is more accurate', 'An adder and a complementer are all that is needed', 'It avoids carries', 'Decimal needs it'], answer: 1, why: 'No separate subtractor: complement and add.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // The three signed systems side by side
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'signed-systems', family: 'p1-signed', order: 30, title: 'Three ways to write negative numbers',
    blurb: 'Signed magnitude, one\'s complement and two\'s complement agree on the positive numbers and differ on the negative ones: two zeros in the first two, one extra negative number in the third.',
    inputs: [
      { id: 'n', kind: 'choice', label: 'Bits', def: '4', options: [{ value: '3', label: '3 bits' }, { value: '4', label: '4 bits' }] },
      { id: 'v', kind: 'number', label: 'Look at the value', def: -5, min: -8, max: 7 },
    ],
    check: (inp) => (inp.n === '3' && (inp.v < -4 || inp.v > 3) ? 'With 3 bits pick a value from −4 to 3' : null),
    presets: [
      { label: '−5 in 4 bits', values: { n: '4', v: -5 } },
      { label: '+6: all three agree', values: { n: '4', v: 6 } },
      { label: '−8: only two\'s complement', values: { n: '4', v: -8 } },
      { label: 'Zero', values: { n: '4', v: 0 } },
      { label: '−1 in 3 bits', values: { n: '3', v: -1 } },
      { label: '−4 in 3 bits', values: { n: '3', v: -4 } },
    ],
    run(inp) {
      const n = +inp.n, max = 2 ** (n - 1) - 1, min = -(2 ** (n - 1));
      // rows: +max … +0, −0, −1 … min
      const rows = [];
      for (let v = max; v >= 1; v--) rows.push({ v, label: '+' + v });
      rows.push({ v: 0, label: '+0' }, { v: -0, neg0: true, label: '−0' });
      for (let v = -1; v >= min; v--) rows.push({ v, label: String(v).replace('-', '−') });
      const RH = n === 4 ? 32 : 42, CW = 96;
      const cols = [['sm', 'sign-mag.'], ['1s', "1's compl."], ['2s', "2's compl."]];
      const pat = (r, rep) => {
        if (r.neg0) return rep === '2s' ? null : rep === 'sm' ? '1' + '0'.repeat(n - 1) : '1'.repeat(n);
        const e = Num().encode(r.v, n, rep);
        return e.ok ? e.bits : null;
      };
      const F = new S.Frames();
      const focus = rows.findIndex((r) => !r.neg0 && r.v === inp.v);
      const draw = (o) => {
        const it = [N.label('h:v', 30, -14, 'value', 'title', { anchor: 'middle' })];
        cols.forEach(([rep, name], c) => { if (c < o.cols) it.push(N.label('h:' + rep, 90 + c * (CW + 10) + CW / 2, -14, name, 'title', { anchor: 'middle' })); });
        rows.forEach((r, i) => {
          const y = i * RH, lit = o.focus === i;
          it.push(N.cell('v:' + i, 0, y, 60, RH - 4, r.label, 'mono' + (lit ? ' hot' : ' n-plain'), { size: 16 }));
          cols.forEach(([rep], c) => {
            if (c >= o.cols) return;
            const p = pat(r, rep), x = 90 + c * (CW + 10);
            const hot = lit && (o.which === undefined || o.which === c);
            it.push(N.cell('p:' + rep + ':' + i, x, y, CW, RH - 4, p === null ? '—' : p, 'mono' + (p === null ? ' gone' : hot ? ' hot' : r.neg0 && o.zeros ? ' bad' : r.v < 0 || r.neg0 ? ' n-row' : ''), { size: 16, enter: 'drop' }));
          });
        });
        return it;
      };
      const S0 = 'The values ' + n + ' bits can hold, from +' + max + ' down to ' + min + ', with +0 and −0 written apart.';
      F.add({ items: draw({ cols: 0 }), say: S0 });
      F.add({ items: draw({ cols: 1 }), say: 'Signed magnitude: the first bit is the sign (1 for negative), the rest is the size. So there are two zeros, ' + '0'.repeat(n) + ' and 1' + '0'.repeat(n - 1) + ', and ' + min + ' cannot be written.', meta: { ask: 'neg0' } });
      F.add({ items: draw({ cols: 2 }), say: "One's complement: a negative number is its positive with every bit inverted. Again two zeros, " + '0'.repeat(n) + ' and ' + '1'.repeat(n) + ', and the range is −' + max + ' to +' + max + '.' });
      F.add({ items: draw({ cols: 3 }), say: "Two's complement: invert and add 1. Only one zero, so one pattern is left over for " + min + ' (1' + '0'.repeat(n - 1) + '): the range is ' + min + ' to +' + max + '.' });
      F.add({ items: draw({ cols: 3, zeros: true }), say: 'The rows marked red are the second zeros: a comparison circuit for signed magnitude or one\'s complement must treat them as equal to 0000. Two\'s complement has no such row.' });
      if (focus >= 0) {
        cols.forEach(([rep], c) => {
          const e = Num().encode(inp.v, n, rep);
          F.add({ items: draw({ cols: 3, focus, which: c }), say: REP[rep] + ': ' + e.trace.map((s) => s.say).join(' ') });
        });
        const all = cols.map(([rep]) => Num().encode(inp.v, n, rep));
        F.add({ items: draw({ cols: 3, focus }), say: inp.v >= 0 ? 'For ' + inp.v + ' all three agree: ' + all[2].bits + '. They differ only on negative numbers.' : 'For ' + inp.v + ': ' + cols.map(([rep], c) => REP[rep] + ' ' + (all[c].ok ? all[c].bits : 'cannot')).join(', ') + '. Every negative pattern starts with 1 in all three.', mark: 'result' });
      }
      return { frames: F.list, def: N.def(['Ranges with ' + n + ' bits', ['signed magnitude: −' + max + ' … +' + max + ' (two zeros)', "one's complement: −" + max + ' … +' + max + ' (two zeros)', "two's complement: " + min + ' … +' + max + ' (one zero)']], ["Negating", ['signed magnitude: flip the sign bit', "one's: invert every bit", "two's: invert every bit, add 1"]]) };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask === 'neg0', once: true, pick: 'option', ask: (fr, i, inp) => "How many different values can " + inp.n + "-bit one's complement hold?", options: (fr, i, inp) => { const n = +inp.n; return [String(2 ** n - 1), String(2 ** n), String(2 ** n + 1), String(2 ** (n - 1))]; }, answer: (fr, i, inp) => String(2 ** +inp.n - 1), explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'Which system has a single zero?', options: ['Signed magnitude', "One's complement", "Two's complement", 'All of them'], answer: 2, why: 'Inverting 0000 gives 1111, and adding 1 wraps back to 0000.' },
      { q: "−3 in 4-bit two's complement is", options: ['1011', '1100', '1101', '0011'], answer: 2, why: '+3 = 0011, invert 1100, add 1: 1101.' },
      { q: "1010 read as 4-bit one's complement is", options: ['−2', '−5', '−6', '+10'], answer: 1, why: 'Invert to 0101 = 5: the value is −5.' },
      { q: 'The range of 8-bit two\'s complement is', options: ['−127 … 127', '−128 … 127', '−128 … 128', '0 … 255'], answer: 1, why: '−2⁷ to 2⁷ − 1.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // The two's complement wheel
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'twos-wheel', family: 'p1-signed', order: 40, title: "The two's complement wheel",
    blurb: 'Lay the n-bit patterns round a circle. Adding k walks k steps clockwise. Passing 1111 → 0000 is a carry out and harmless; passing the seam between the largest and the most negative number is an overflow.',
    inputs: [
      { id: 'n', kind: 'choice', label: 'Bits', def: '4', options: [{ value: '3', label: '3 bits' }, { value: '4', label: '4 bits' }] },
      { id: 'a', kind: 'number', label: 'Start at', def: 5, min: -8, max: 7 },
      { id: 'k', kind: 'number', label: 'Add (negative: subtract)', def: 4, min: -15, max: 15 },
    ],
    check: (inp) => { const lo = -(2 ** (+inp.n - 1)), hi = 2 ** (+inp.n - 1) - 1; if (inp.a < lo || inp.a > hi) return 'Start at: from ' + lo + ' to ' + hi + ' with ' + inp.n + ' bits'; if (Math.abs(inp.k) > 2 ** +inp.n - 1) return 'Add: at most ' + (2 ** +inp.n - 1) + ' steps'; return null; },
    presets: [
      { label: '5 + 4: overflow', values: { n: '4', a: 5, k: 4 } },
      { label: '−3 + 5: a carry, no overflow', values: { n: '4', a: -3, k: 5 } },
      { label: '2 + 3: nothing happens', values: { n: '4', a: 2, k: 3 } },
      { label: '−6 − 4: overflow going down', values: { n: '4', a: -6, k: -4 } },
      { label: 'Once round: 0 + 15', values: { n: '4', a: 0, k: 15 } },
      { label: '3 bits: 3 + 1', values: { n: '3', a: 3, k: 1 } },
    ],
    run(inp) {
      const n = +inp.n, M = 2 ** n, R = n === 4 ? 150 : 118, RB = R + 46;
      const pos = (u) => { const th = (u / M) * 2 * Math.PI - Math.PI / 2; return { x: Math.cos(th), y: Math.sin(th) }; };
      const sval = (u) => (u >= M / 2 ? u - M : u);
      const bits = (u) => u.toString(2).padStart(n, '0');
      const start = ((inp.a % M) + M) % M, dir = inp.k >= 0 ? 1 : -1, steps = Math.abs(inp.k);
      const F = new S.Frames();
      const seamAngle = (u) => ((u + 0.5) / M) * 2 * Math.PI - Math.PI / 2; // between u and u + 1
      const draw = (o) => {
        const it = [];
        for (let u = 0; u < M; u++) {
          const p = pos(u), v = sval(u);
          const cls = 'n-pos' + (v < 0 ? ' neg' : '') + (u === o.cur ? (o.bad ? ' bad' : ' hot') : u === start && o.cur !== undefined ? ' good' : o.trail && o.trail.has(u) ? ' trail' : '');
          it.push({ key: 'w:' + u, kind: 'state', x: p.x * R, y: p.y * R, r: 22, text: v > 0 ? '+' + v : String(v).replace('-', '−'), cls, size: 15 });
          it.push(N.label('wb:' + u, p.x * RB, p.y * RB + 5, bits(u), 'n-bits' + (u === o.cur ? ' hot' : ''), { anchor: 'middle' }));
        }
        const sa = seamAngle(M / 2 - 1), wa = seamAngle(M - 1);
        it.push({ key: 'seam', kind: 'line', x1: Math.cos(sa) * (R - 34), y1: Math.sin(sa) * (R - 34), x2: Math.cos(sa) * (R + 30), y2: Math.sin(sa) * (R + 30), cls: 'n-seam' });
        it.push({ key: 'wrap', kind: 'line', x1: Math.cos(wa) * (R - 34), y1: Math.sin(wa) * (R - 34), x2: Math.cos(wa) * (R + 30), y2: Math.sin(wa) * (R + 30), cls: 'n-wrap' });
        it.push(N.label('seam:l', Math.cos(sa) * (R - 52), Math.sin(sa) * (R - 52) + 5, 'overflow', 'bad', { anchor: 'middle', size: 13 }));
        it.push(N.label('wrap:l', Math.cos(wa) * (R - 52), Math.sin(wa) * (R - 52) + 5, 'carry', 'n-side', { anchor: 'middle', size: 13 }));
        it.push(N.cell('centre', -62, -22, 124, 44, o.centre || (inp.k >= 0 ? '+' + inp.k : '−' + -inp.k), 'mono n-plain', { size: 20 }));
        return it;
      };
      F.add({ items: draw({}), say: 'The ' + M + ' patterns of ' + n + ' bits round a circle, read as two\'s complement: 0 at the top, positives clockwise, negatives (shaded) anticlockwise. The red seam lies between +' + (M / 2 - 1) + ' and ' + (-M / 2) + '.', meta: { ask: true } });
      let cur = start, over = false, carried = 0;
      const trail = new Set();
      F.add({ items: draw({ cur }), say: 'Start at ' + sval(start) + ' = ' + bits(start) + '. ' + (inp.k >= 0 ? 'Adding ' + inp.k + ' is ' + steps + ' steps clockwise.' : 'Subtracting ' + -inp.k + ' is ' + steps + ' steps anticlockwise.') });
      for (let s = 0; s < steps; s++) {
        const prev = cur;
        trail.add(prev);
        cur = (cur + dir + M) % M;
        const crossSeam = (dir > 0 && prev === M / 2 - 1) || (dir < 0 && prev === M / 2);
        const crossWrap = (dir > 0 && prev === M - 1) || (dir < 0 && prev === 0);
        if (crossSeam) over = !over;
        if (crossWrap) carried++;
        F.add({ items: draw({ cur, bad: over, trail }), say: 'Step ' + (s + 1) + ': ' + bits(prev) + ' → ' + bits(cur) + ' (' + sval(cur) + ').' + (crossSeam ? ' This crosses the seam: the sign flipped although we kept ' + (dir > 0 ? 'adding' : 'subtracting') + ' — overflow.' : crossWrap ? ' This passes ' + (dir > 0 ? '1111 → 0000' : '0000 → 1111').replace(/1111|0000/g, (m) => m.slice(0, n)) + ': the unsigned count wraps (a ' + (dir > 0 ? 'carry' : 'borrow') + '), but the signed value is fine.' : '') });
      }
      const truth = inp.a + inp.k, lo = -M / 2, hi = M / 2 - 1, ok = truth >= lo && truth <= hi;
      F.add({ items: draw({ cur, bad: !ok, trail, centre: String(sval(cur)).replace('-', '−') }), say: inp.a + (inp.k >= 0 ? ' + ' + inp.k : ' − ' + -inp.k) + ' = ' + truth + (ok ? ': the wheel shows ' + sval(cur) + ', correct.' : ', which is outside ' + lo + ' … ' + hi + ': the wheel shows ' + sval(cur) + ', off by ' + M + '. That is overflow.') + (carried ? ' The ' + (dir > 0 ? 'carry' : 'borrow') + ' out of the top bit happened ' + carried + ' time' + (carried === 1 ? '' : 's') + ' and is simply dropped.' : ''), mark: 'result' });
      return { frames: F.list, def: N.def(['On the wheel', ['add k: k steps clockwise', 'subtract k: k steps anticlockwise', 'past ' + '1'.repeat(n) + ' → ' + '0'.repeat(n) + ': carry out, ignored', 'past the seam +' + hi + ' | ' + lo + ': overflow']]) };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, once: true, pick: 'option', ask: 'Will this sum overflow?', options: ['Yes', 'No'], answer: (fr, i, inp) => { const M = 2 ** +inp.n, t = inp.a + inp.k; return t < -M / 2 || t > M / 2 - 1 ? 'Yes' : 'No'; }, explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: "In 4-bit two's complement, 6 + 3 gives", options: ['9', '−7', '−9', '1'], answer: 1, why: '0110 + 0011 = 1001 = −7: the walk crossed the seam.' },
      { q: '−2 + 5 passes 1111 → 0000. Is that an overflow?', options: ['Yes', 'No, just a carry out'], answer: 1, why: 'The result 3 is in range; the carry out of the top bit is dropped.' },
      { q: 'Where does the overflow seam lie with 4 bits?', options: ['Between 1111 and 0000', 'Between 0111 and 1000', 'Between 0000 and 0001', 'There is none'], answer: 1, why: 'Between +7 and −8: the largest positive and the most negative.' },
      { q: 'Adding 16 on a 4-bit wheel', options: ['always overflows', 'goes once round and changes nothing', 'gives −16', 'is impossible'], answer: 1, why: '16 steps is a full turn.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Overflow in addition
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'signed-overflow', family: 'p1-signed', order: 50, title: 'Overflow: the carry into and out of the sign bit',
    blurb: 'Add two signed numbers as plain bits. The sum overflowed exactly when the carry into the sign bit differs from the carry out of it — or, the same thing, when two numbers of one sign give a result of the other.',
    inputs: [
      { id: 'a', kind: 'number', label: 'First (decimal)', def: 100, min: -128, max: 127 },
      { id: 'b', kind: 'number', label: 'Second (decimal)', def: 50, min: -128, max: 127 },
      { id: 'n', kind: 'number', label: 'Bits', def: 8, min: 3, max: 8 },
      { id: 'rep', kind: 'choice', label: 'System', def: '2s', options: [{ value: '2s', label: "two's complement" }, { value: '1s', label: "one's complement" }] },
    ],
    check: (inp) => { const r = Num().range(inp.n, inp.rep); for (const [k, nm] of [['a', 'First'], ['b', 'Second']]) if (inp[k] < r.min || inp[k] > r.max) return nm + ': ' + inp.n + "-bit " + REP[inp.rep] + ' holds ' + r.min + ' to ' + r.max; return null; },
    presets: [
      { label: '100 + 50: positive overflow', values: { a: 100, b: 50, n: 8, rep: '2s' } },
      { label: '−100 + −50: negative overflow', values: { a: -100, b: -50, n: 8, rep: '2s' } },
      { label: '−20 + 70: carry out, no overflow', values: { a: -20, b: 70, n: 8, rep: '2s' } },
      { label: '4 bits: 5 + 2', values: { a: 5, b: 2, n: 4, rep: '2s' } },
      { label: "One's complement: −3 + 5 (end-around carry)", values: { a: -3, b: 5, n: 4, rep: '1s' } },
      { label: 'Most negative: −8 + −1', values: { a: -8, b: -1, n: 4, rep: '2s' } },
    ],
    run(inp) {
      const n = inp.n, rep = inp.rep;
      const A = Num().encode(inp.a, n, rep).bits, B = Num().encode(inp.b, n, rep).bits;
      const r = Num().add(A, B, rep);
      const cols = N.columns(A, B, 2, '+');
      const cin = cols[n - 1].cin, cout = cols[n - 1].cout;
      const raw = cols.slice().reverse().map((c) => c.digit).join('');
      const F = new S.Frames();
      const signCls = (k) => (k === n - 1 ? 'n-sign' : '');
      const draw = (o) => {
        const carries = {};
        for (const c of cols) if (c.k <= o.upto && c.cout) carries[c.k + 1] = '1';
        const s = N.sum({ prefix: 's', x: 0, y: 0, rows: [{ text: A, cls: signCls }, { text: B, cls: signCls }], op: '+', base: 2, carries, result: o.upto >= n - 1 ? (o.final || raw) : raw.slice(-(o.upto + 1)), hot: o.hot, extra: true, width: n, cw: 38, ch: 40, carryCls: (k) => (k === n && rep === '2s' ? (o.verdict ? (r.overflow ? 'bad' : '') : '') : k === n - 1 && o.verdict && r.overflow ? 'bad' : ''), resCls: (k) => (k === n - 1 && o.verdict ? (r.overflow ? 'bad' : '') : '') });
        const it = s.items;
        const right = s.box.x + s.box.w + 16;
        it.push(N.label('va', right, 42 + 26, '= ' + inp.a, 'n-side', { size: 15 }), N.label('vb', right, 42 + 72, '= ' + inp.b, 'n-side', { size: 15 }));
        if (o.verdict) it.push(N.label('vr', right, s.resultY + 27, r.overflow ? 'overflow' : '= ' + r.value, r.overflow ? 'bad' : 'good', { size: 16 }));
        if (o.cinout) {
          const xs = s.colX(n - 1);
          it.push(N.label('cin', xs + 19, -18, 'in ' + cin + ', out ' + cout, cin !== cout ? 'bad' : 'good', { anchor: 'middle', size: 13 }));
        }
        if (o.eac) {
          const E = N.cell('eac', s.colX(0), s.resultY + 50, 38, 34, '+1', 'mono n-carry', { size: 15, enter: 'from', src: 's:res:' + n });
          it.push(E, N.label('eacl', s.colX(0) - 8, s.resultY + 73, 'end-around', 'n-side', { anchor: 'end', size: 13 }));
        }
        it.push(N.label('signl', s.colX(n - 1) + 19, s.resultY + (o.eac ? 108 : 64), 'sign bit', 'n-side', { anchor: 'middle', size: 12 }));
        return it;
      };
      F.add({ items: draw({ upto: -1, hot: 0 }), say: inp.a + ' = ' + A + ' and ' + inp.b + ' = ' + B + ' in ' + n + '-bit ' + REP[rep] + ' (the purple column is the sign bit). Add them as plain binary numbers.', meta: { ask: true } });
      cols.forEach((c, k) => F.add({ items: draw({ upto: k, hot: k }), say: 'Bit ' + k + (k === n - 1 ? ' (the sign bit)' : '') + ': ' + c.a + ' + ' + c.b + (c.cin ? ' + carry 1' : '') + ' = ' + c.total + ': write ' + c.digit + (c.cout ? ', carry 1.' : '.') + (k === n - 1 ? ' Carry into the sign bit ' + cin + ', carry out ' + cout + '.' : '') }));
      if (rep === '2s') {
        F.add({ items: draw({ upto: n, cinout: true }), say: r.trace.find((s) => s.kind === 'overflow-check').say + (cout ? ' The carry out itself is dropped.' : '') });
        F.add({ items: draw({ upto: n, cinout: true, verdict: true, final: raw }), say: r.overflow ? 'Overflow: ' + inp.a + ' + ' + inp.b + ' = ' + (inp.a + inp.b) + ' needs more than ' + n + ' bits; the pattern ' + raw + ' would read as ' + Num().decode(raw, '2s').value + '. Both inputs were ' + (inp.a >= 0 ? 'positive' : 'negative') + ' and the result is not.' : 'No overflow: ' + raw + ' = ' + r.value + '.' + (Math.sign(inp.a) !== Math.sign(inp.b) ? ' Numbers of different signs can never overflow.' : ''), mark: 'result' });
      } else {
        if (cout) {
          F.add({ items: draw({ upto: n, eac: true }), say: r.trace.find((s) => s.kind === 'end-around').say });
        }
        F.add({ items: draw({ upto: n, eac: !!cout, verdict: true, final: (cout ? '1' : '') + raw }), say: (r.overflow ? 'Overflow: two numbers of one sign gave a result of the other sign.' : 'Result ' + r.bits + ' = ' + r.value + '.') + ' In one\'s complement the end carry is not dropped but added back in.', mark: 'result' });
      }
      return { frames: F.list, def: N.def(['Overflow (two\'s complement)', ['V = carry into sign ⊕ carry out of sign', 'only when both inputs have the same sign', 'the carry out alone means nothing']], ['Range of ' + n + ' bits', [Num().range(n, rep).min + ' … ' + Num().range(n, rep).max]]) };
    },
    predict: [
      { at: (f) => f.meta && f.meta.ask, once: true, pick: 'option', ask: 'Will this addition overflow?', options: ['Yes', 'No'], answer: (fr, i, inp) => (Num().add(Num().encode(inp.a, inp.n, inp.rep).bits, Num().encode(inp.b, inp.n, inp.rep).bits, inp.rep).overflow ? 'Yes' : 'No'), explain: (fr) => fr[fr.length - 1].say },
    ],
    quiz: [
      { q: "In 8-bit two's complement, 0111 0000 + 0001 0000 =", options: ['1000 0000, overflow', '1000 0000, fine', '0 with a carry', '1 0000 0000'], answer: 0, why: '112 + 16 = 128, beyond 127: a positive plus a positive gave a negative pattern.' },
      { q: 'A carry out of the sign bit with no carry into it means', options: ['no overflow', 'overflow', 'the result is zero', 'an error in the adder'], answer: 1, why: 'The two carries differ: overflow (two negatives gave a positive).' },
      { q: 'Can a positive plus a negative number overflow?', options: ['Yes, often', 'Only with 8 bits', 'Never', 'Only at zero'], answer: 2, why: 'The sum lies between the two inputs, so it always fits.' },
      { q: "In one's complement, an end carry is", options: ['dropped', 'added back into the lowest bit', 'a sign of overflow', 'ignored only for negatives'], answer: 1, why: 'The end-around carry corrects for the (2ⁿ − 1) the representation uses.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
