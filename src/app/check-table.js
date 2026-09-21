// Tables to fill in: a truth table of an expression, or any table an exercise spells out. S.Check.tableSpec(x)
// gives the layout and the expected value of every cell (from the engines, so an exercise only names the
// expression), and the checker compares cell by cell. More kinds of table register in S.Check.tables:
//   S.Check.tables.mykind = (x) => ({ rows, cols, corner, cell(r, c) -> key | null, expected: {key: text}, kind })
// kind 'text' compares text (case and spaces ignored), 'bit' a single 0, 1 or X, 'set' a list like a, b.
(function (S) {
  'use strict';
  const K = (S.Check = S.Check || {});
  K.kinds = K.kinds || {};
  K.tables = K.tables || {};

  /** a custom table: rows, cols and cells {"row|col": expected} given by the exercise */
  K.tables.custom = (x) => {
    const cells = x.cells || {};
    return { rows: x.rows, cols: x.cols, corner: x.corner || '', cell: (r, c) => { const k = x.rows[r] + '|' + x.cols[c]; return k in cells ? k : null; }, expected: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])), kind: x.cellKind || 'text' };
  };
  /** the output column of a truth table: x.expr (or x.outputs {F: expr}), x.vars in order (else sorted) */
  K.tables.truth = (x) => {
    const N = S.Netlist;
    const outs = x.outputs || { F: x.expr };
    const asts = Object.entries(outs).map(([k, e]) => [k, N.parse(e)]);
    const vars = x.vars || [...new Set(asts.flatMap(([, e]) => [...N.vars(e)]))].sort();
    const n = vars.length, rows = [], expected = {};
    for (let m = 0; m < 1 << n; m++) {
      const env = {};
      vars.forEach((v, i) => { env[v] = (m >> (n - 1 - i)) & 1; });
      const label = vars.map((v) => env[v]).join('');
      rows.push(label);
      for (const [k, e] of asts) expected[label + '|' + k] = String(N.evaluate(e, env));
    }
    const cols = asts.map(([k]) => k);
    return { rows, cols, corner: vars.join(''), cell: (r, c) => rows[r] + '|' + cols[c], expected, kind: 'bit' };
  };

  K.tableSpec = function (x) {
    const make = K.tables[x.table || 'custom'];
    if (!make) throw new Error('unknown table ' + x.table);
    return make(x);
  };

  const sameSet = (a, b) => { const A = K.asSet(a), B = K.asSet(b); return A.length === B.length && A.every((v, i) => v === B[i]); };
  K.cellRight = function (kind, want, got) {
    if (kind === 'set') return sameSet(want, got);
    if (kind === 'bit') return String(want).trim().toUpperCase() === String(got === undefined ? '' : got).trim().toUpperCase();
    return String(want).trim().replace(/\s+/g, ' ').toLowerCase() === String(got === undefined ? '' : got).trim().replace(/\s+/g, ' ').toLowerCase();
  };

  K.kinds.table = {
    check(x, a) {
      a = a || {};
      const SP = K.tableSpec(x);
      const keys = Object.keys(SP.expected);
      const cells = {};
      let wrong = 0, empty = 0;
      for (const k of keys) {
        const got = a[k] === undefined ? '' : String(a[k]);
        if (!got.trim() && SP.expected[k] !== '') empty++;
        cells[k] = K.cellRight(SP.kind, SP.expected[k], got);
        if (!cells[k]) wrong++;
      }
      if (!wrong) return { ok: true, cells, message: 'Every one of the ' + keys.length + ' cells is right.' };
      const details = [];
      if (empty) details.push(K.plural(empty, 'cell is', 'cells are') + ' still empty.');
      if (SP.kind === 'set') details.push('A set is written like a, b; leave a cell empty for the empty set.');
      if (SP.kind === 'bit') details.push('Each cell holds 0 or 1.');
      return { ok: false, cells, message: K.plural(wrong, 'cell is', 'cells are') + ' not right yet (marked in red).', details };
    },
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
