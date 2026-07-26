// CMOS cells built from transistors. A static complementary gate computes Y = G′: its pull-down network of
// nMOS switches realises G (series for AND, parallel for OR), and its pull-up network of pMOS switches is the
// dual (parallel for AND, series for OR) with the same inputs, so exactly one of the two conducts for every
// input. fromExpression builds the cell for any expression: one stage when the expression is a complement
// ((AB + C)′), else that stage and an output inverter; complemented inputs get inverters of their own.
// Also the usual cells: inverter, NAND, NOR, AOI, OAI, the transmission gate, a tristate inverter and a 2:1
// multiplexer of transmission gates.
(function (S) {
  'use strict';
  const C = S.Cmos = S.Cmos || {};

  // ---- series/parallel trees ------------------------------------------------------------------------------
  /** push complements down to the variables (XOR expanded first); the result has and, or, var, nvar, const */
  function nnf(e, neg) {
    switch (e.op) {
      case 'var': return neg ? { op: 'nvar', name: e.name } : { op: 'var', name: e.name };
      case 'const': return { op: 'const', v: neg ? 1 - e.v : e.v };
      case 'not': return nnf(e.a, !neg);
      case 'xor': {
        // a ⊕ b ⊕ ... as a sum of products of its two halves
        const [a, ...rest] = e.args;
        const b = rest.length === 1 ? rest[0] : { op: 'xor', args: rest };
        const x = { op: 'or', args: [{ op: 'and', args: [a, { op: 'not', a: b }] }, { op: 'and', args: [{ op: 'not', a }, b] }] };
        return nnf(x, neg);
      }
      case 'and': case 'or': {
        const op = (e.op === 'and') !== !!neg ? 'and' : 'or';
        const args = e.args.map((x) => nnf(x, neg));
        return { op, args: args.flatMap((x) => (x.op === op ? x.args : [x])) };
      }
    }
    throw new Error('bad expression');
  }
  C.nnf = (e) => nnf(e, false);
  const treeText = (t, kind) => {
    if (t.op === 'var') return t.name;
    if (t.op === 'nvar') return t.name + "'";
    if (t.op === 'const') return String(t.v);
    const inner = t.args.map((a) => ((a.op === 'or' && t.op === 'and') || (kind && (a.op === 'and' || a.op === 'or')) ? '(' + treeText(a, kind) + ')' : treeText(a, kind)));
    return inner.join(t.op === 'and' ? (kind ? ' series ' : '·') : (kind ? ' ∥ ' : ' + '));
  };
  C.treeText = treeText;

  /**
   * Build a switch network for tree t between nodes top and bottom. type 'n': and → series, or → parallel;
   * type 'p' builds the dual (and → parallel, or → series). gateOf(literal) names the node that drives the
   * gate of each switch.
   */
  function build(net, t, top, bottom, type, gateOf, made) {
    const series = (t.op === 'and') === (type === 'n');
    if (t.op === 'var' || t.op === 'nvar') { made.push(net.add(type, gateOf(t), top, bottom)); return; }
    if (t.op === 'const') {
      // a constant: a switch that is always on (1 in a pull-down) or a missing branch (0)
      const on = type === 'n' ? t.v === 1 : t.v === 0;
      if (on) made.push(net.add(type, type === 'n' ? 'VDD' : 'GND', top, bottom));
      return;
    }
    if (series) {
      let a = top;
      t.args.forEach((x, i) => { const b = i === t.args.length - 1 ? bottom : net.fresh('n'); build(net, x, a, b, type, gateOf, made); a = b; });
    } else for (const x of t.args) build(net, x, top, bottom, type, gateOf, made);
  }

  /**
   * The cell for an expression: { net, expr, pullDown, pullUp, stages, trace }. opts.name, opts.output (the
   * output node, default 'Y').
   */
  C.fromExpression = function (text, opts) {
    opts = opts || {};
    const Nl = S.Netlist;
    const e = typeof text === 'string' ? Nl.parse(text) : text;
    const inputs = [...Nl.vars(e)].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    const out = opts.output || 'Y';
    const net = C.network(opts.name || (typeof text === 'string' ? text : 'cell'), { inputs, outputs: [out] });
    const trace = [];
    // a complement (G)′ is one stage whose pull-down realises G; any other F is the stage for (F)′ on node W
    // followed by an inverter, so the pull-down realises F itself
    const oneStage = e.op === 'not';
    const pd = nnf(oneStage ? e.a : e, false);
    const node1 = oneStage ? out : 'W';
    if (!oneStage) net.nodes.add('W');
    const inv = {};
    const gateOf = (lit) => {
      if (lit.op === 'var') return lit.name;
      if (!inv[lit.name]) {
        const nn = lit.name + '_n';
        net.nodes.add(nn);
        net.p(lit.name, 'VDD', nn, 'I' + lit.name + 'p'); net.n(lit.name, nn, 'GND', 'I' + lit.name + 'n');
        inv[lit.name] = nn;
        trace.push({ kind: 'inverter', input: lit.name, say: 'An inverter makes ' + lit.name + "' (node " + nn + ') for the switches that need it.' });
      }
      return inv[lit.name];
    };
    const down = [], up = [];
    build(net, pd, node1, 'GND', 'n', gateOf, down);
    build(net, pd, node1, 'VDD', 'p', gateOf, up);
    trace.push({ kind: 'pulldown', ids: down.map((t) => t.id), say: 'Pull-down (nMOS) from ' + node1 + ' to GND for ' + treeText(pd) + ': ' + treeText(pd, true) + '.' });
    trace.push({ kind: 'pullup', ids: up.map((t) => t.id), say: 'Pull-up (pMOS) from VDD to ' + node1 + ', the dual: every series group becomes parallel and every parallel group series.' });
    if (!oneStage) {
      net.p('W', 'VDD', out, 'Op'); net.n('W', out, 'GND', 'On');
      trace.push({ kind: 'output-inverter', say: 'The stage gives (' + treeText(pd) + ")′ on W, so an output inverter makes " + out + ' = ' + treeText(pd) + '.' });
    }
    return { net, expr: e, pullDown: pd, stages: oneStage ? 1 : 2, transistors: net.transistors.length, trace };
  };

  // ---- the usual cells ----------------------------------------------------------------------------------
  const letters = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
  C.cells = {
    inverter: () => C.fromExpression("A'", { name: 'inverter' }),
    nand: (n) => C.fromExpression('(' + letters(n || 2).join('') + ")'", { name: 'NAND' + (n || 2) }),
    nor: (n) => C.fromExpression('(' + letters(n || 2).join(' + ') + ")'", { name: 'NOR' + (n || 2) }),
    aoi21: () => C.fromExpression("(AB + C)'", { name: 'AOI21' }),
    aoi22: () => C.fromExpression("(AB + CD)'", { name: 'AOI22' }),
    oai21: () => C.fromExpression("((A + B)C)'", { name: 'OAI21' }),
    oai22: () => C.fromExpression("((A + B)(C + D))'", { name: 'OAI22' }),
    /** the transmission gate: A passes to Y while C = 1 (nMOS gate C, pMOS gate C′); else Y is cut off */
    tgate: () => {
      const net = C.network('transmission gate', { inputs: ['A', 'C'], outputs: ['Y'] });
      net.nodes.add('Cn');
      net.p('C', 'VDD', 'Cn', 'ICp'); net.n('C', 'Cn', 'GND', 'ICn');
      net.n('C', 'A', 'Y', 'TN'); net.p('Cn', 'A', 'Y', 'TP');
      return { net, trace: [{ kind: 'cell', say: 'An nMOS and a pMOS switch side by side between A and Y, gated by C and C′: both conduct when C = 1, neither when C = 0.' }] };
    },
    /** a tristate inverter: Y = A′ while EN = 1, cut off (Z) while EN = 0 */
    tristate: () => {
      const net = C.network('tristate inverter', { inputs: ['A', 'EN'], outputs: ['Y'] });
      net.nodes.add('ENn');
      net.p('EN', 'VDD', 'ENn', 'IEp'); net.n('EN', 'ENn', 'GND', 'IEn');
      const u = net.fresh('n'), d = net.fresh('n');
      net.p('A', 'VDD', u, 'MP1'); net.p('ENn', u, 'Y', 'MP2');
      net.n('EN', 'Y', d, 'MN2'); net.n('A', d, 'GND', 'MN1');
      return { net, trace: [{ kind: 'cell', say: 'An inverter with an extra switch in each network: the pMOS gated by EN′ and the nMOS by EN, so both networks are cut off while EN = 0.' }] };
    },
    /** a 2:1 multiplexer of two transmission gates: Y = A while S = 0, B while S = 1 */
    tgmux: () => {
      const net = C.network('2:1 transmission-gate multiplexer', { inputs: ['A', 'B', 'S'], outputs: ['Y'] });
      net.nodes.add('Sn');
      net.p('S', 'VDD', 'Sn', 'ISp'); net.n('S', 'Sn', 'GND', 'ISn');
      net.n('Sn', 'A', 'Y', 'TAn'); net.p('S', 'A', 'Y', 'TAp');
      net.n('S', 'B', 'Y', 'TBn'); net.p('Sn', 'B', 'Y', 'TBp');
      return { net, trace: [{ kind: 'cell', say: 'Two transmission gates into Y: the one from A conducts while S = 0, the one from B while S = 1.' }] };
    },
  };

  /**
   * Check a static cell against an expression on every input: the output must equal the expression, be
   * driven (never floating), and never in conflict. Returns { ok, problems, rows }.
   */
  C.check = function (net, expr) {
    const Nl = S.Netlist;
    const e = typeof expr === 'string' ? Nl.parse(expr) : expr;
    const rows = C.table(net), problems = [], y = net.outputs[0];
    for (const r of rows) {
      const at = net.inputs.map((x) => x + ' = ' + r.inputs[x]).join(', ');
      const want = Nl.evaluate(e, r.inputs);
      if (r.strength[y] === 'conflict') problems.push({ inputs: r.inputs, say: 'With ' + at + ' both networks conduct: ' + y + ' is joined to VDD and GND.' });
      else if (r.strength[y] === 'floating' || r.strength[y] === 'charged') problems.push({ inputs: r.inputs, say: 'With ' + at + ' neither network conducts: ' + y + ' floats.' });
      else if (r.out[y] !== want) problems.push({ inputs: r.inputs, say: 'With ' + at + ' the cell gives ' + r.out[y] + ' but the expression is ' + want + '.' });
    }
    return { ok: !problems.length, problems, rows };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
