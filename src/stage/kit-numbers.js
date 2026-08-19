// Numbers on the stage: digit rows with place weights, column arithmetic with carries in any base, and the small
// helpers the number and code topics share (subscripts, answer options, the definition panel).
// S.Kit.num.cell(key, x, y, w, h, text, cls, more) -> a cell item; .label(key, x, y, text, cls, more) -> a text item
// S.Kit.num.digits({prefix, x, y, text, cw, ch, gap, cls(i, ch), sub(i, ch), more(i, ch)}) -> {items, box, keyOf(i), xOf(i)}
// S.Kit.num.columns(a, b, base, {sub}) -> per column, right to left: {i, a, b, cin, total, digit, cout}
// S.Kit.num.sum({prefix, x, y, rows: [{name, text}], base, upto, cw, ch, op, carries, result, hot}) -> {items, box, xOf(i)}
//   column arithmetic laid out right-aligned: a carry row on top, the operand rows, a rule, the result written in as
//   far as column `upto` (0 = the rightmost); carries that have happened drop into the carry row.
(function (S) {
  'use strict';
  const K = (S.Kit = S.Kit || {});
  const N = (K.num = {});
  const DIG = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  N.DIG = DIG;
  N.sub = (n) => String(n).split('').map((c) => '₀₁₂₃₄₅₆₇₈₉'[+c] || c).join('');
  N.sup = (n) => String(n).split('').map((c) => ({ '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' })[c] || c).join('');
  N.val = (ch) => DIG.indexOf(String(ch).toUpperCase());
  N.cell = (key, x, y, w, h, text, cls, more) => Object.assign({ key, kind: 'cell', x, y, w, h, text: String(text), cls: cls || '' }, more || {});
  N.label = (key, x, y, text, cls, more) => Object.assign({ key, kind: 'text', x, y, text: String(text), cls: cls || '' }, more || {});
  /** four answer choices (or fewer when the pool is small) holding the answer, in a fixed order */
  N.options = (answer, pool, n) => {
    n = n || 4;
    const out = [String(answer)];
    for (const p of pool.map(String)) { if (out.length >= n) break; if (!out.includes(p)) out.push(p); }
    return out.sort((a, b) => (isNaN(a) || isNaN(b) ? (a < b ? -1 : a > b ? 1 : 0) : +a - +b));
  };
  /** a definition panel from [title, lines] pairs; ids are s0, s1, ... */
  N.def = (...secs) => ({ sections: secs.map(([title, lines], i) => ({ id: 's' + i, kind: 'math', title, text: [].concat(lines).join('\n') })) });

  N.digits = function (o) {
    const P = o.prefix || 'd', cw = o.cw || 40, ch = o.ch || 44, gap = o.gap === undefined ? 4 : o.gap;
    const chars = [...String(o.text)];
    const items = [];
    const xOf = (i) => (o.x || 0) + i * (cw + gap);
    chars.forEach((c, i) => {
      const it = N.cell(P + ':' + i, xOf(i), o.y || 0, cw, ch, c, 'mono ' + (o.cls ? o.cls(i, c) || '' : ''), { size: o.size || 18 });
      if (o.sub) { const s = o.sub(i, c); if (s !== undefined && s !== null) it.sub = String(s); }
      if (o.more) Object.assign(it, o.more(i, c) || {});
      items.push(it);
    });
    return { items, keyOf: (i) => P + ':' + i, xOf, box: { x: o.x || 0, y: o.y || 0, w: chars.length * (cw + gap) - gap, h: ch } };
  };

  /** column by column, right to left, for addition (op '+') or subtraction with borrows (op '−', a ≥ b) */
  N.columns = function (a, b, base, op) {
    const n = Math.max(a.length, b.length);
    const A = a.padStart(n, '0'), B = b.padStart(n, '0'), out = [];
    let c = 0;
    for (let k = 0; k < n; k++) {
      const i = n - 1 - k, x = N.val(A[i]), y = N.val(B[i]);
      if (op === '−') {
        let t = x - y - c, borrow = 0;
        if (t < 0) { t += base; borrow = 1; }
        out.push({ i, k, a: x, b: y, cin: c, total: x - c, digit: DIG[t], cout: borrow });
        c = borrow;
      } else {
        const t = x + y + c;
        out.push({ i, k, a: x, b: y, cin: c, total: t, digit: DIG[t % base], cout: t >= base ? 1 : 0 });
        c = t >= base ? 1 : 0;
      }
    }
    return out;
  };

  N.sum = function (o) {
    const P = o.prefix || 'sum', cw = o.cw || 42, ch = o.ch || 42, gap = 4, x0 = o.x || 0, y0 = o.y || 0;
    const rows = o.rows, n = Math.max(...rows.map((r) => r.text.length), o.width || 0);
    const items = [];
    const lead = o.extra ? 1 : 0; // a column on the left for an end carry
    const xOf = (i) => x0 + 46 + (i + lead) * (cw + gap); // i: index from the left in an n-digit row
    const hot = o.hot === undefined ? -1 : o.hot;
    const colOf = (k) => n - 1 - k; // k: 0 = rightmost
    // carry row
    const cy = y0;
    if (o.carryLabel !== false) items.push(N.label(P + ':cl', x0 + 36, cy + 21, o.carryLabel || (o.op === '−' ? 'borrow' : 'carry'), 'n-side', { anchor: 'end', size: 13 }));
    for (const [k, v] of Object.entries(o.carries || {})) {
      const i = colOf(+k);
      const cc = o.carryCls ? o.carryCls(+k) : '';
      items.push(N.cell(P + ':c:' + k, xOf(i) + cw / 2 - 13, cy + 8, 26, 26, v, 'mono n-carry' + (+k === hot + 1 ? ' hot' : '') + (cc ? ' ' + cc : ''), { size: 14, rx: 13, enter: 'drop' }));
    }
    rows.forEach((r, ri) => {
      const y = y0 + 42 + ri * (ch + 6), t = r.text.padStart(n, r.pad === false ? ' ' : '0');
      const first = [...t].findIndex((c) => c !== ' ');
      const lx = xOf(first < 0 ? 0 : first) - 10;
      if (r.name) items.push(N.label(P + ':rn:' + ri, x0 + 36, y + ch / 2 + 6, ri === rows.length - 1 && o.op ? o.op + ' ' + r.name : r.name, 'n-side', { anchor: 'end', size: 14 }));
      else if (ri === rows.length - 1 && o.op) items.push(N.label(P + ':rn:' + ri, lx, y + ch / 2 + 7, o.op, 'strong', { anchor: 'end', size: 22 }));
      [...t].forEach((c, i) => {
        if (c === ' ') return;
        const k = n - 1 - i;
        items.push(N.cell(P + ':r' + ri + ':' + k, xOf(i), y, cw, ch, c, 'mono' + (k === hot ? ' act' : '') + (r.cls ? ' ' + r.cls(k, c) : ''), { size: 19 }));
      });
    });
    const ry = y0 + 42 + rows.length * (ch + 6) + 4;
    items.push({ key: P + ':rule', kind: 'line', x1: xOf(0) - (lead ? cw + gap : 0) - 6, y1: ry, x2: xOf(n - 1) + cw + 6, y2: ry, cls: 'n-rule' });
    const res = o.result || '';
    const yr = ry + 8;
    [...res].forEach((c, j) => {
      // the result is written right-aligned with the operands, one column wider for an end carry
      const i = n - res.length + j, k = res.length - 1 - j;
      if (o.upto !== undefined && k > o.upto) return;
      items.push(N.cell(P + ':res:' + k, xOf(i), yr, cw, ch, c, 'mono n-res' + (k === hot ? ' hot' : '') + (o.resCls ? ' ' + o.resCls(k, c) : ''), { size: 19, enter: o.resFrom && o.resFrom(k) ? 'from' : 'grow', src: o.resFrom ? o.resFrom(k) : undefined }));
    });
    const left = xOf(0) - (lead ? cw + gap : 0);
    return { items, xOf, colX: (k) => xOf(colOf(k)), box: { x: x0, y: y0, w: xOf(n - 1) + cw - x0, h: yr + ch - y0 }, left, resultY: yr, ruleY: ry };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
