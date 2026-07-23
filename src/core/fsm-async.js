// Asynchronous sequential circuits in fundamental mode. A model is a set of excitation functions Y = f(x, y):
// the inputs x, the secondary variables y (the feedback loops, cut), and Y the values the loops are driven
// towards. Analysis gives the transition table, the flow table and the stable states; races are found by
// exploring every order in which the excited variables can change (one at a time or together), so critical
// races, non-critical races, cycles and oscillations are told apart. The design flow runs from a primitive
// flow table to a circuit: reduction by compatibles and the merger diagram, a race-free assignment (with spare
// states when needed), excitation and output equations with hazard-free covers, and a gate circuit. Also the
// SR latch, and the hazards: static and dynamic (by exhaustive interleaving of gate events) and essential.
(function (S) {
  'use strict';
  /** 'a' or 'an' before a word as it is read aloud (an AND, an xor, an 8-bit, a NAND, a reg) */
  const an = (w) => (/^(?:[aeiou]|x(?:n?or)\b|nmos|rnmos|rtran|rcmos|rpmos|8|11(?!\d)|18(?!\d))/i.test(String(w)) ? 'an ' : 'a ');
  const As = S.Async = {};
  const Nl = () => S.Netlist, F = () => S.Fsm, U = () => S.Fsm.util;
  const bits = (v, n) => { let s = ''; for (let i = n - 1; i >= 0; i--) s += (v >> i) & 1; return s; };
  const codes = (n) => Array.from({ length: 1 << n }, (_, v) => bits(v, n));
  /** the excitation of a secondary variable: Y1 for y1, Q⁺ for Q */
  const exName = (v) => (/^[a-z]/.test(v) ? v.toUpperCase() : v + '⁺');
  As.exName = exName;
  const ham = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };

  // ---- models -------------------------------------------------------------------------------------------
  /** a model from equations: { inputs: ['x1'], vars: ['y1'], Y: { y1: 'x1 y1 + x2' }, outputs: { z: '...' } } */
  As.fromEquations = function (spec) {
    const ex = {};
    for (const v of spec.vars) { const t = spec.Y[v]; ex[v] = typeof t === 'string' ? Nl().parse(t) : t; }
    const outs = {};
    for (const [k, t] of Object.entries(spec.outputs || {})) outs[k] = typeof t === 'string' ? Nl().parse(t) : t;
    return model(spec.inputs.slice(), spec.vars.slice(), ex, outs, spec.name);
  };
  function model(inputs, vars, ex, outs, name) {
    const env = (x, y) => { const e = {}; inputs.forEach((n, i) => { e[n] = +x[i]; }); vars.forEach((n, i) => { e[n] = +y[i]; }); return e; };
    return {
      name: name || '', inputs, vars, excitation: ex, outputs: outs,
      Y: (x, y) => vars.map((v) => Nl().evaluate(ex[v], env(x, y))).join(''),
      Z: (x, y) => Object.keys(outs).map((k) => Nl().evaluate(outs[k], env(x, y))).join(''),
      text: () => vars.map((v) => exName(v) + ' = ' + U().text(ex[v])).concat(Object.entries(outs).map(([k, e]) => k + ' = ' + U().text(e))),
    };
  }
  As.model = model;

  /**
   * A model from a gate circuit with feedback: a depth-first search over the gates cuts one net in every loop
   * (the net that closes it), and each cut net becomes a secondary variable, named after an output it drives
   * or y1, y2, ... Returns the model with .cuts [{ net, name }] and a trace.
   */
  As.fromCircuit = function (c) {
    const trace = [];
    const pinDir = (r) => r.part.pins.find((q) => q.name === r.pin).dir;
    const driver = (p, pin) => { const n = p.net[pin]; return n ? n.pins.find((r) => pinDir(r) === 'out') : null; };
    const gates = c.parts.filter((p) => Nl().GATES.has(p.type));
    const sinks = (p) => { const n = p.net.y; return n ? n.pins.filter((r) => pinDir(r) === 'in' && Nl().GATES.has(r.part.type)).map((r) => r.part) : []; };
    // on each loop found, cut the net that drives an output port (else a buffer's, else the closing one)
    const state = new Map(), cut = new Set(), path = [];
    const better = (p) => (p.net.y.pins.some((r) => r.part.type === 'OUT') ? 2 : p.type === 'BUF' ? 1 : 0);
    const dfs = (p) => {
      state.set(p, 1); path.push(p);
      for (const q of sinks(p)) {
        if (state.get(q) === 1) {
          const loop = path.slice(path.indexOf(q));
          if (!loop.some((g) => cut.has(g.net.y))) cut.add(loop.reduce((a, g) => (better(g) > better(a) ? g : a), p).net.y);
        } else if (!state.has(q)) dfs(q);
      }
      path.pop(); state.set(p, 2);
    };
    // start from the gates nearest the inputs, so the cut falls on the loop's closing wire
    const order = gates.slice().sort((a, b) => depth(a) - depth(b));
    function depth(p) { return p.pins.filter((q) => q.dir === 'in').some((q) => { const d = driver(p, q.name); return d && d.part.type === 'IN'; }) ? 0 : 1; }
    for (const g of order) if (!state.has(g)) dfs(g);
    // any loop the preferred cuts missed is cut where it closes
    for (let again = true; again;) {
      again = false;
      const st2 = new Map();
      const dfs2 = (p) => {
        st2.set(p, 1);
        if (!cut.has(p.net.y)) for (const q of sinks(p)) { if (st2.get(q) === 1) { cut.add(p.net.y); again = true; } else if (!st2.has(q)) dfs2(q); }
        st2.set(p, 2);
      };
      for (const g of order) if (!st2.has(g)) dfs2(g);
    }
    const cuts = [];
    let k = 0;
    for (const net of cut) {
      const outPort = net.pins.find((r) => r.part.type === 'OUT');
      const name = net.name && /^[A-Za-z][0-9_]*$/.test(net.name) ? net.name : outPort ? outPort.part.params.name : 'y' + (++k);
      cuts.push({ net, name });
    }
    const nameOf = new Map(cuts.map((x) => [x.net, x.name]));
    const OPS = { AND: 'and', OR: 'or', XOR: 'xor', NAND: 'and', NOR: 'or', XNOR: 'xor' };
    const expr = (r, top) => {
      if (!r) return { op: 'const', v: 0 };
      const p = r.part, net = p.net[r.pin];
      if (!top && nameOf.has(net)) return { op: 'var', name: nameOf.get(net) };
      if (p.type === 'IN') return { op: 'var', name: p.params.name };
      if (p.type === 'CONST') return { op: 'const', v: p.params.value ? 1 : 0 };
      const ins = p.pins.filter((q) => q.dir === 'in').map((q) => expr(driver(p, q.name), false));
      if (p.type === 'NOT') return { op: 'not', a: ins[0] };
      if (p.type === 'BUF') return ins[0];
      if (!OPS[p.type]) throw new Error('cannot analyse ' + an(p.type) + p.type + ' in an asynchronous circuit');
      const e = { op: OPS[p.type], args: ins };
      return ['NAND', 'NOR', 'XNOR'].includes(p.type) ? { op: 'not', a: e } : e;
    };
    const ex = {};
    for (const x of cuts) { const d = x.net.pins.find((r) => pinDir(r) === 'out'); ex[x.name] = expr(d, true); }
    const outs = {};
    for (const o of c.parts.filter((p) => p.type === 'OUT')) { const d = driver(o, 'a'); outs[o.params.name] = nameOf.has(d.part.net[d.pin]) ? { op: 'var', name: nameOf.get(d.part.net[d.pin]) } : expr(d, false); }
    const inputs = c.parts.filter((p) => p.type === 'IN').map((p) => p.params.name);
    const m = model(inputs, cuts.map((x) => x.name), ex, outs, c.title);
    m.cuts = cuts;
    trace.push({ kind: 'cut', say: cuts.length ? 'Cut ' + cuts.length + ' feedback loop' + (cuts.length > 1 ? 's' : '') + ': the wire' + (cuts.length > 1 ? 's' : '') + ' ' + cuts.map((x) => x.name).join(', ') + (cuts.length > 1 ? ' become secondary variables; the values the loops are driven towards are the excitations ' : ' becomes a secondary variable; the value the loop is driven towards is the excitation ') + cuts.map((x) => exName(x.name)).join(', ') + '.' : 'The circuit has no feedback loop: it is combinational.' });
    for (const v of m.vars) trace.push({ kind: 'excitation', name: v, say: exName(v) + ' = ' + U().text(ex[v]) + '.' });
    m.trace = trace;
    return m;
  };

  // ---- analysis -----------------------------------------------------------------------------------------
  /** the transition table, stable states, flow table and races: { table, stable, flow, races, trace } */
  As.analyse = function (m) {
    const xs = codes(m.inputs.length), ys = codes(m.vars.length), trace = [], table = {}, stable = [];
    for (const y of ys) { table[y] = {}; for (const x of xs) { const Y = m.Y(x, y); table[y][x] = Y; if (Y === y) stable.push({ x, y }); } }
    trace.push({ kind: 'transition', say: 'The transition table gives ' + m.vars.map(exName).join(', ') + ' for every row y = ' + m.vars.join('') + ' and input column x = ' + m.inputs.join('') + '; a total state is stable when the excitation equals the row.' });
    for (const s of stable) trace.push({ kind: 'stable', x: s.x, y: s.y, say: 'Total state x = ' + s.x + ', y = ' + s.y + ' is stable.' });
    // the flow table: rows named a, b, c ... after the rows of the transition table
    const names = {}; ys.forEach((y, i) => { names[y] = ys.length <= 26 ? String.fromCharCode(97 + i) : 'r' + i; });
    const flow = { rows: ys.map((y) => names[y]), entries: {}, stable: {}, outputs: {} };
    for (const y of ys) {
      const r = names[y]; flow.entries[r] = {}; flow.stable[r] = {}; flow.outputs[r] = {};
      for (const x of xs) { flow.entries[r][x] = names[table[y][x]]; flow.stable[r][x] = table[y][x] === y; flow.outputs[r][x] = m.Z(x, y); }
    }
    trace.push({ kind: 'flow', say: 'Naming the rows ' + ys.map((y) => names[y] + ' = ' + y).join(', ') + ' gives the flow table; a circled entry is a stable state.' });
    const races = [];
    for (const y of ys) for (const x of xs) {
      if (table[y][x] === y) continue;
      const r = As.explore(m, x, y);
      races.push(r);
      if (r.kind !== 'none') trace.push({ kind: r.kind, x, y, say: r.say });
    }
    return { table, stable, flow, names, races, trace };
  };

  /**
   * Every order of change from an unstable total state (input column x, row y): at each step any non-empty set
   * of the excited variables may change. Returns { x, y, excited, ideal, outcomes, oscillates, kind, say } with
   * kind 'none' (one variable, one step), 'cycle' (a chain of single changes), 'noncritical', 'critical'
   * (more than one stable result, or a possible endless oscillation) or 'oscillation' (no stable state at all).
   */
  As.explore = function (m, x, y) {
    const excited = (s) => { const Y = m.Y(x, s), e = []; for (let i = 0; i < s.length; i++) if (Y[i] !== s[i]) e.push(i); return e; };
    const flip = (s, set) => s.split('').map((c, i) => (set.includes(i) ? (c === '0' ? '1' : '0') : c)).join('');
    const succ = new Map(), q = [y];
    succ.set(y, null);
    while (q.length) {
      const s = q.shift(), e = excited(s), nx = [];
      for (let mask = 1; mask < 1 << e.length; mask++) { const set = e.filter((_, k) => mask & (1 << k)); nx.push(flip(s, set)); }
      succ.set(s, nx);
      for (const t of nx) if (!succ.has(t)) { succ.set(t, null); q.push(t); }
    }
    const outcomes = [...succ.keys()].filter((s) => !succ.get(s).length).sort();
    // can the circuit run forever? a cycle among unstable states
    const color = new Map();
    let loops = false;
    const dfs = (s) => { color.set(s, 1); for (const t of succ.get(s)) { if (color.get(t) === 1) loops = true; else if (!color.has(t)) dfs(t); } color.set(s, 2); };
    dfs(y);
    // the ideal path: every excited variable changes at once
    const ideal = [y];
    for (let s = y, k = 0; k < 1 << m.vars.length; k++) { const e = excited(s); if (!e.length) break; s = flip(s, e); ideal.push(s); if (ideal.indexOf(s) < ideal.length - 1) break; }
    const e0 = excited(y), Y = m.Y(x, y);
    const chain = ideal.length > 2 && ideal.slice(0, -1).every((s) => excited(s).length === 1);
    let kind, say;
    const at = 'x = ' + x + ', y = ' + y;
    if (!outcomes.length) { kind = 'oscillation'; say = 'From ' + at + ' no stable state can ever be reached: the circuit oscillates.'; } else if (e0.length >= 2 || outcomes.length > 1 || loops) {
      if (outcomes.length > 1 || loops) { kind = 'critical'; say = 'From ' + at + ' (Y = ' + Y + ') ' + (e0.length > 1 ? e0.length + ' variables race' : 'a later step races') + ': depending on which changes first the circuit settles in ' + outcomes.join(' or ') + (loops ? ', or may keep changing' : '') + '. A critical race.'; } else { kind = 'noncritical'; say = 'From ' + at + ' (Y = ' + Y + ') ' + e0.length + ' variables race, but every order ends in ' + outcomes[0] + ': a non-critical race.'; }
    } else if (chain) { kind = 'cycle'; say = 'From ' + at + ' the circuit passes through ' + ideal.slice(1, -1).join(', ') + ' before settling in ' + outcomes[0] + ': a cycle of single changes.'; } else { kind = 'none'; say = 'From ' + at + ' one variable changes and the circuit settles in ' + outcomes[0] + '.'; }
    return { x, y, Y, excited: e0, ideal, outcomes, oscillates: loops, kind, say, graph: succ };
  };

  /**
   * Fundamental-mode simulation: from a stable total state (opts.from = y, settled first), apply each input
   * vector in turn and let the circuit settle (the ideal order: all excited variables together) before the
   * next. Returns { steps, trace } with every intermediate y.
   */
  As.simulate = function (m, seq, opts) {
    opts = opts || {};
    const trace = [], steps = [];
    let x = seq[0], y = opts.from || '0'.repeat(m.vars.length);
    const settle = (x0, y0) => { const r = As.explore(m, x0, y0); return r; };
    let r = settle(x, y);
    y = r.ideal[r.ideal.length - 1];
    trace.push({ kind: 'start', x, y, say: 'Start with x = ' + x + '; the circuit settles in y = ' + y + ' with output ' + m.Z(x, y) + '.' });
    for (let i = 1; i < seq.length; i++) {
      const nx = seq[i], changed = ham(x, nx);
      if (changed > 1) trace.push({ kind: 'warning', step: i, say: 'x goes from ' + x + ' to ' + nx + ', changing ' + changed + ' inputs at once, which fundamental mode does not allow.' });
      x = nx;
      r = settle(x, y);
      const path = r.ideal, end = path[path.length - 1];
      steps.push({ x, from: y, path, to: end, out: m.Z(x, end), kind: r.kind, outcomes: r.outcomes });
      trace.push({ kind: 'step', step: i, x, path, race: r.kind, say: 'x = ' + x + ': ' + (path.length === 1 ? 'y = ' + y + ' is already stable' : 'y goes ' + path.join(' → ')) + ', output ' + m.Z(x, end) + '.' + (r.kind === 'critical' ? ' Beware: ' + r.say : '') });
      y = end;
    }
    return { steps, y, trace };
  };

  // ---- the design flow ----------------------------------------------------------------------------------
  /**
   * A primitive flow table: { inputs, outputs, rows: { a: { '00': 'a', '01': 'b', '11': '-', '10': '-' } },
   * out: { a: '0' } } (the output of each row's stable state). It becomes a Mealy machine whose outputs are
   * given only in the stable columns.
   */
  As.flowMachine = function (t) {
    const table = {}, states = Object.keys(t.rows);
    for (const r of states) {
      table[r] = {};
      for (const [x, n] of Object.entries(t.rows[r])) table[r][x] = [n === '-' ? null : n, n === r ? t.out[r] : '-'.repeat(t.outputs.length)];
    }
    return F().create({ type: 'mealy', inputs: t.inputs, outputs: t.outputs, states, start: states[0], table, name: t.name || 'flow table' });
  };
  /** problems of a primitive flow table: each row must have exactly one stable state */
  As.checkPrimitive = function (t) {
    const out = [];
    for (const [r, row] of Object.entries(t.rows)) {
      const st = Object.keys(row).filter((x) => row[x] === r);
      if (st.length !== 1) out.push('Row ' + r + ' has ' + st.length + ' stable states; a primitive flow table has exactly one per row.');
      for (const [x, n] of Object.entries(row)) if (n !== '-' && n !== r && t.rows[n] && t.rows[n][x] !== n) out.push('Row ' + r + ' in column ' + x + ' goes to ' + n + ', which is not stable in that column.');
    }
    return out;
  };

  /**
   * A race-free assignment of a flow table (a machine whose input symbols are the columns): codes for the
   * rows such that every transition is a chain of single-variable changes, through spare codes when two rows
   * that must be adjacent cannot be. Returns { vars, codes, spare: { code: { x: nextCode } }, table, trace }.
   */
  As.assign = function (m, opts) {
    opts = opts || {};
    const rows = m.states, R = rows.length, xs = F().symbols(m), trace = [];
    // the transitions each column needs: row → destination row (where the destination is stable)
    const needs = [];
    for (const r of rows) for (const x of xs) { const t = m.next[r][x]; if (t != null && t !== r) needs.push({ r, x, t }); }
    const pairs = new Set(needs.map((n) => [n.r, n.t].sort().join('|')));
    trace.push({ kind: 'adjacency', pairs: [...pairs].map((p) => p.split('|')), say: 'The transition diagram needs these rows to be adjacent: ' + ([...pairs].map((p) => p.replace('|', '–')).join(', ') || 'none') + '.' });
    const route = (code) => {
      // per column, route every transition through single changes; spare codes may relay
      const used = new Map(rows.map((r) => [code[r], r]));
      const spare = {}, first = {};
      for (const x of xs) {
        const todo = needs.filter((n) => n.x === x).sort((a, b) => ham(code[a.r], code[a.t]) - ham(code[b.r], code[b.t]));
        const relay = new Map(); // spare code → destination row, in this column
        for (const n of todo) {
          const goal = (c) => c === code[n.t] || (relay.get(c) === n.t);
          // breadth-first over the cube, through free spare codes only
          const prev = new Map([[code[n.r], null]]), q = [code[n.r]];
          let hit = null;
          while (q.length && !hit) {
            const c = q.shift();
            for (let i = 0; i < c.length && !hit; i++) {
              const d = c.slice(0, i) + (c[i] === '0' ? '1' : '0') + c.slice(i + 1);
              if (prev.has(d)) continue;
              if (goal(d)) { prev.set(d, c); hit = d; break; }
              if (used.has(d) || relay.has(d)) continue;
              prev.set(d, c); q.push(d);
            }
          }
          if (!hit) return null;
          const path = [hit]; for (let c = prev.get(hit); c; c = prev.get(c)) path.unshift(c);
          for (let i = 1; i < path.length - 1; i++) { relay.set(path[i], n.t); (spare[path[i]] = spare[path[i]] || {})[x] = path[i + 1]; }
          (first[n.r] = first[n.r] || {})[x] = path[1];
        }
      }
      return { spare, first };
    };
    const minBits = Math.max(1, Math.ceil(Math.log2(R)));
    for (let k = minBits; k <= Math.max(minBits + 1, opts.maxBits || 0); k++) {
      const all = codes(k);
      let best = null, budget = opts.budget || 40000;
      const code = {};
      const usedC = new Set();
      // try direct adjacency first (no spares), then allow relays
      for (const allowRelay of [false, true]) {
        const bt = (i) => {
          if (best || budget-- < 0) return;
          if (i === R) {
            const res = route(code);
            if (res && (allowRelay || !Object.keys(res.spare).length)) best = { code: Object.assign({}, code), res };
            return;
          }
          for (const c of (i === 0 ? [all[0]] : all)) {
            if (usedC.has(c)) continue;
            if (!allowRelay && rows.slice(0, i).some((o) => pairs.has([o, rows[i]].sort().join('|')) && ham(code[o], c) !== 1)) continue;
            code[rows[i]] = c; usedC.add(c);
            bt(i + 1);
            usedC.delete(c); delete code[rows[i]];
            if (best) return;
          }
        };
        bt(0);
        if (best) break;
      }
      if (!best) { trace.push({ kind: 'fail', bits: k, say: 'With ' + k + ' variable' + (k > 1 ? 's' : '') + ' no assignment avoids every critical race; try ' + (k + 1) + '.' }); continue; }
      const vars = Array.from({ length: k }, (_, i) => 'y' + (k - i));
      const spareCodes = Object.keys(best.res.spare);
      trace.push({ kind: 'codes', say: 'Assign ' + rows.map((r) => r + ' = ' + best.code[r]).join(', ') + (spareCodes.length ? '; the spare code' + (spareCodes.length > 1 ? 's ' : ' ') + spareCodes.join(', ') + ' relay transitions that cannot go directly' : '; every transition changes one variable') + '.' });
      // the assigned transition table: rows by code
      const table = {};
      for (const r of rows) { table[best.code[r]] = {}; for (const x of xs) { const t = m.next[r][x]; table[best.code[r]][x] = t == null ? null : t === r ? best.code[r] : best.res.first[r][x]; } }
      for (const c of spareCodes) { table[c] = {}; for (const x of xs) table[c][x] = best.res.spare[c][x] || null; trace.push({ kind: 'spare', code: c, say: 'Spare row ' + c + ': ' + xs.filter((x) => best.res.spare[c][x]).map((x) => 'in column ' + x + ' it passes on to ' + best.res.spare[c][x]).join('; ') + '.' }); }
      return { vars, codes: best.code, spare: best.res.spare, table, trace };
    }
    throw new Error('no race-free assignment found');
  };

  /** a static-1 hazard-free cover: the minimal cover plus primes for every pair of adjacent 1s left uncovered */
  As.hazardFree = function (vars, ones, dc) {
    const u = U(), n = vars.length, base = u.qm(n, ones, dc);
    const cubes = base.cubes.slice(), added = [];
    for (const a of ones) for (let i = 0; i < n; i++) {
      const b = a ^ (1 << (n - 1 - i));
      if (b < a || !ones.includes(b)) continue;
      if (cubes.some((c) => u.covers(c, a, n) && u.covers(c, b, n))) continue;
      const p = base.primes.filter((c) => u.covers(c, a, n) && u.covers(c, b, n)).sort((x, y) => u.literals([x]) - u.literals([y]))[0];
      if (p && !cubes.includes(p)) { cubes.push(p); added.push(p); }
    }
    return { cubes, added, primes: base.primes, text: u.sopText(cubes, vars), ast: u.sopAst(cubes, vars) };
  };
  /** the static-1 hazards of a sum of products: adjacent 1s that no single term covers */
  As.staticHazards = function (cubes, vars) {
    const u = U(), n = vars.length, out = [];
    const on = (mm) => cubes.some((c) => u.covers(c, mm, n));
    for (let a = 0; a < 1 << n; a++) for (let i = 0; i < n; i++) {
      const b = a ^ (1 << (n - 1 - i));
      if (b < a || !on(a) || !on(b)) continue;
      if (cubes.some((c) => u.covers(c, a, n) && u.covers(c, b, n))) continue;
      const env = vars.filter((_, k) => k !== i).map((v) => v + ' = ' + ((a >> (n - 1 - vars.indexOf(v))) & 1));
      out.push({ from: a, to: b, variable: vars[i], say: 'With ' + env.join(', ') + ', a change of ' + vars[i] + ' moves between two terms with no term covering both: a static-1 hazard.' });
    }
    return out;
  };

  /**
   * The design flow from a primitive flow table: { stages: { primitive, compatibles, cover, merged,
   * assignment, excitation, circuit }, model, circuit, trace }.
   */
  As.design = function (t, opts) {
    opts = opts || {};
    const trace = [], stages = {};
    const problems = As.checkPrimitive(t);
    if (problems.length) throw new Error(problems[0]);
    const prim = As.flowMachine(t);
    stages.primitive = { machine: prim, say: 'The primitive flow table has ' + prim.states.length + ' rows, one stable state each.' };
    trace.push({ kind: 'stage', stage: 'primitive', say: stages.primitive.say });
    const comp = F().compatibles(prim);
    stages.compatibles = { pairs: comp.pairs, maximal: comp.maximal, trace: comp.trace, say: 'The implication table leaves ' + comp.pairs.length + ' compatible pairs; the maximal compatibles are ' + F().showClasses(comp.maximal) + '.' };
    trace.push({ kind: 'stage', stage: 'compatibles', say: stages.compatibles.say });
    const cover = F().closedCover(prim, comp);
    const merged = F().mergeCover(prim, cover.blocks).machine;
    stages.merged = { machine: merged, blocks: cover.blocks, say: 'Merging the closed cover ' + F().showClasses(cover.blocks) + ' leaves ' + merged.states.length + ' rows.' };
    trace.push({ kind: 'stage', stage: 'merged', say: stages.merged.say });
    const asg = As.assign(merged, opts);
    stages.assignment = asg;
    trace.push(...asg.trace);
    // excitation: Y over (y..., x...), with codes nobody uses as don't cares
    const k = asg.vars.length, xs = F().symbols(merged), vars = asg.vars.concat(t.inputs);
    const Yfns = asg.vars.map(() => ({ ones: [], dc: [] })), Zfns = t.outputs.map(() => ({ ones: [], dc: [] }));
    const rowOf = new Map(Object.entries(asg.codes).map(([r, c]) => [c, r]));
    for (const y of codes(k)) for (const x of xs) {
      const mt = parseInt(y + x, 2), nx = asg.table[y] ? asg.table[y][x] : null;
      asg.vars.forEach((_, i) => { if (nx == null) Yfns[i].dc.push(mt); else if (nx[i] === '1') Yfns[i].ones.push(mt); });
      t.outputs.forEach((_, i) => {
        const r = rowOf.get(y), z = r ? merged.out[r][x][i] : '-';
        if (z === '1') Zfns[i].ones.push(mt); else if (z !== '0') Zfns[i].dc.push(mt);
      });
    }
    const eqs = asg.vars.map((v, i) => { const h = As.hazardFree(vars, Yfns[i].ones, Yfns[i].dc); return { name: v.toUpperCase(), var: v, cubes: h.cubes, added: h.added, text: v.toUpperCase() + ' = ' + h.text, ast: h.ast, ones: Yfns[i].ones, dc: Yfns[i].dc }; });
    const zeqs = t.outputs.map((o, i) => { const h = As.hazardFree(vars, Zfns[i].ones, Zfns[i].dc); return { name: o, cubes: h.cubes, text: o + ' = ' + h.text, ast: h.ast, ones: Zfns[i].ones, dc: Zfns[i].dc }; });
    stages.excitation = { vars, equations: eqs.concat(zeqs), say: 'Excitation and output equations, each a hazard-free sum of products: ' + eqs.concat(zeqs).map((e) => e.text).join('; ') + '.' };
    for (const e of eqs) if (e.added.length) trace.push({ kind: 'hazard', name: e.name, say: 'In ' + e.name + ' the term' + (e.added.length > 1 ? 's ' : ' ') + e.added.map((c) => U().cubeText(c, vars)).join(', ') + (e.added.length > 1 ? ' are' : ' is') + ' added to cover adjacent 1s, so no static-1 hazard remains.' });
    trace.push({ kind: 'stage', stage: 'excitation', say: stages.excitation.say });
    // the circuit: the logic of each Y feeds back through a buffer (the lumped loop delay) to its y
    const c = new (Nl().Circuit)(t.name || 'asynchronous circuit');
    const srcs = {};
    for (const x of t.inputs) srcs[x] = { pos: c.input(x).pin('y'), neg: null };
    const bufs = asg.vars.map((v) => { const b = c.gate('BUF', 1, 'loop_' + v); srcs[v] = { pos: b.pin('y'), neg: null }; c.name(b.pin('y'), v, false); return b; });
    const fns = eqs.map((e, i) => ({ cubes: e.cubes, vars, to: bufs[i].pin('i0') })).concat(zeqs.map((e) => ({ cubes: e.cubes, vars, to: c.output(e.name).pin('a') })));
    U().sopGates(c, srcs, fns);
    asg.vars.forEach((v, i) => c.connect(bufs[i].pin('y'), c.output(v).pin('a')));
    U().closeOpen(c);
    stages.circuit = { circuit: c, say: 'The circuit: the logic of each excitation feeds back to its secondary variable.' };
    trace.push({ kind: 'stage', stage: 'circuit', say: stages.circuit.say });
    const md = As.fromEquations({ inputs: t.inputs, vars: asg.vars, Y: Object.fromEntries(eqs.map((e) => [e.var, e.ast])), outputs: Object.fromEntries(zeqs.map((e) => [e.name, e.ast])), name: t.name });
    return { stages, primitive: prim, merged, assignment: asg, equations: eqs, outputs: zeqs, model: md, circuit: c, trace };
  };

  // ---- the SR latch -------------------------------------------------------------------------------------
  /**
   * The SR latch ('nor', or 'nand' with active-low inputs S′ R′), analysed two ways: with one loop cut
   * (Y = S + R′y for NOR) and with both gate outputs as variables, where letting go of S = R = 1 together
   * shows the race.
   */
  As.srLatch = function (kind) {
    kind = kind || 'nor';
    const c = new (Nl().Circuit)('SR latch (' + kind.toUpperCase() + ')');
    // the NAND latch's inputs are active low; they keep the names S and R here
    const s = c.input('S').pin('y'), r = c.input('R').pin('y');
    const G = kind === 'nor' ? 'NOR' : 'NAND';
    // (the Q′ gate first, so the loop is cut at Q)
    const gp = c.gate(G, 2, 'gp'), gq = c.gate(G, 2, 'gq');
    if (kind === 'nor') { c.connect(r, gq.pin('i0')); c.connect(s, gp.pin('i0')); } else { c.connect(s, gq.pin('i0')); c.connect(r, gp.pin('i0')); }
    c.connect(gp.pin('y'), gq.pin('i1'), c.output('Qn').pin('a'));
    c.connect(gq.pin('y'), gp.pin('i1'), c.output('Q').pin('a'));
    c.name(gq.pin('y'), 'Q', true); c.name(gp.pin('y'), 'Qn', true);
    const one = As.fromCircuit(c), oneA = As.analyse(one);
    const two = kind === 'nor'
      ? As.fromEquations({ inputs: ['S', 'R'], vars: ['Q', 'P'], Y: { Q: '(R + P)\'', P: '(S + Q)\'' }, outputs: { Q: 'Q' }, name: 'NOR latch, both gates' })
      : As.fromEquations({ inputs: ['S', 'R'], vars: ['Q', 'P'], Y: { Q: '(S P)\'', P: '(R Q)\'' }, outputs: { Q: 'Q' }, name: 'NAND latch, both gates' });
    const twoA = As.analyse(two);
    const both = kind === 'nor' ? '11' : '00', rest = kind === 'nor' ? '00' : '11';
    const race = As.explore(two, rest, kind === 'nor' ? '00' : '11');
    const trace = one.trace.concat(oneA.trace.filter((t) => t.kind !== 'stable'));
    trace.push({ kind: 'forbidden', say: kind === 'nor' ? 'With S = R = 1 both gates output 0, so Q and Q′ are no longer complements.' : 'With S = R = 0 (both active, for these active-low inputs) both gates output 1, so Q and Q′ are no longer complements.' });
    trace.push({ kind: 'race', say: 'Letting both inputs go together (' + both + ' → ' + rest + '): ' + race.say });
    return { circuit: c, oneLoop: { model: one, analysis: oneA }, twoGates: { model: two, analysis: twoA }, race, trace };
  };

  // ---- hazards in gate circuits: every interleaving of gate events -----------------------------------------
  /**
   * Explore a gate circuit (combinational, or with feedback) after its inputs change from one assignment to
   * another: every gate whose output disagrees with its inputs may switch next, in any order. Reports, per
   * output, whether it can glitch: a static hazard (same value before and after, but a path with a pulse) or a
   * dynamic hazard (a change made with three or more transitions). Small circuits only (up to about 16 gates).
   */
  As.hazardExplore = function (c, from, to, opts) {
    opts = opts || {};
    const pinDir = (r) => r.part.pins.find((q) => q.name === r.pin).dir;
    const gates = c.parts.filter((p) => Nl().GATES.has(p.type));
    if (gates.length > (opts.maxGates || 18)) throw new Error('too many gates to explore every order');
    const gi = new Map(gates.map((g, i) => [g, i]));
    const outs = c.parts.filter((p) => p.type === 'OUT');
    const src = (p, pin, env, st) => {
      const n = p.net[pin]; if (!n) return 0;
      const d = n.pins.find((r) => pinDir(r) === 'out');
      if (d.part.type === 'IN') return env[d.part.params.name] ? 1 : 0;
      if (d.part.type === 'CONST') return d.part.params.value ? 1 : 0;
      return +st[gi.get(d.part)];
    };
    const fn = (g, env, st) => {
      const ip = g.pins.filter((q) => q.dir === 'in').map((q) => src(g, q.name, env, st));
      switch (g.type) {
        case 'NOT': return 1 - ip[0]; case 'BUF': return ip[0];
        case 'AND': return +ip.every(Boolean); case 'NAND': return 1 - ip.every(Boolean);
        case 'OR': return +ip.some(Boolean); case 'NOR': return 1 - ip.some(Boolean);
        case 'XOR': return ip.reduce((a, b) => a ^ b, 0); case 'XNOR': return 1 ^ ip.reduce((a, b) => a ^ b, 0);
      }
      return 0;
    };
    // the settled state under the old inputs (the caller's start state for circuits with memory)
    let st = opts.start || '0'.repeat(gates.length);
    for (let k = 0; k < 4 * gates.length + 4; k++) { const nx = gates.map((g) => fn(g, from, st)).join(''); if (nx === st) break; st = nx; }
    const outVal = (s, o) => src(o, 'a', to, s);
    const results = outs.map((o) => ({ name: o.params.name, before: src(o, 'a', from, st) }));
    // states: gate values plus, per output, the number of changes so far (capped at 3)
    const key = (s, cnt) => s + '/' + cnt.join('');
    const start = { s: st, cnt: outs.map(() => 0), last: results.map((r) => r.before) };
    const seen = new Map([[key(start.s, start.cnt), null]]), q = [start];
    const finals = new Set(), worst = outs.map(() => 0), witness = outs.map(() => null);
    let budget = opts.budget || 200000;
    while (q.length && budget-- > 0) {
      const cur = q.shift();
      const exc = gates.map((g, i) => (fn(g, to, cur.s) !== +cur.s[i] ? i : -1)).filter((i) => i >= 0);
      if (!exc.length) { finals.add(cur.s); continue; }
      for (const i of exc) {
        const s2 = cur.s.slice(0, i) + (cur.s[i] === '0' ? '1' : '0') + cur.s.slice(i + 1);
        const last = outs.map((o) => outVal(s2, o));
        const cnt = cur.cnt.map((c0, k) => Math.min(3, c0 + (last[k] !== cur.last[k] ? 1 : 0)));
        const k2 = key(s2, cnt);
        if (seen.has(k2)) continue;
        seen.set(k2, { from: key(cur.s, cur.cnt), gate: gates[i].id });
        cnt.forEach((v, k) => { if (v > worst[k]) { worst[k] = v; witness[k] = k2; } });
        q.push({ s: s2, cnt, last });
      }
    }
    const order = (k2) => { const out = []; for (let e = seen.get(k2); e; e = seen.get(e.from)) out.unshift(e.gate); return out; };
    const trace = [];
    for (const [k, r] of results.entries()) {
      const after = [...finals].map((s) => outVal(s, outs[k]));
      r.after = after.length ? after[0] : null;
      r.maxChanges = worst[k];
      r.kind = r.after === r.before ? (worst[k] >= 2 ? 'static-' + r.before : 'none') : (worst[k] >= 3 ? 'dynamic' : 'none');
      r.order = witness[k] ? order(witness[k]) : [];
      r.say = r.kind === 'none' ? r.name + ' changes cleanly (' + r.before + ' → ' + r.after + ') in every order of gate events.' : r.kind === 'dynamic' ? r.name + ' should change once (' + r.before + ' → ' + r.after + ') but can change three times when the gates switch in the order ' + r.order.join(', ') + ': a dynamic hazard.' : r.name + ' should stay ' + r.before + ' but can pulse when the gates switch in the order ' + r.order.join(', ') + ': a static-' + r.before + ' hazard.';
      trace.push({ kind: r.kind, output: r.name, order: r.order, say: r.say });
    }
    return { outputs: results, states: seen.size, finals: [...finals], trace };
  };

  /**
   * Essential hazards of a model (or a flow table's design): a stable total state and one input change where
   * the result after the input changes once differs from the result after it changes three times (x → x′ →
   * x → x′), the sign that a slow input path lets the circuit see the change late.
   */
  As.essentialHazards = function (m) {
    const settle = (x, y) => { const r = As.explore(m, x, y); return r.ideal[r.ideal.length - 1]; };
    const out = [];
    for (const y of codes(m.vars.length)) for (const x of codes(m.inputs.length)) {
      if (m.Y(x, y) !== y) continue;
      for (let i = 0; i < x.length; i++) {
        const x2 = x.slice(0, i) + (x[i] === '0' ? '1' : '0') + x.slice(i + 1);
        const once = settle(x2, y), thrice = settle(x2, settle(x, once));
        if (once !== thrice) out.push({ x, y, input: m.inputs[i], once, thrice, say: 'From x = ' + x + ', y = ' + y + ', a change of ' + m.inputs[i] + ' settles in ' + once + ', but three changes settle in ' + thrice + ': an essential hazard.' });
      }
    }
    return out;
  };

  // ---- an example (our own): a two-input circuit whose output Z goes to 1 when x2 rises while x1 is 1, and
  // stays 1 until x1 falls
  As.examples = {
    gatedCatch: () => ({
      name: 'gated catch', inputs: ['x1', 'x2'], outputs: ['Z'],
      rows: {
        a: { '00': 'a', '01': 'b', '11': '-', '10': 'c' },
        b: { '00': 'a', '01': 'b', '11': 'd', '10': '-' },
        c: { '00': 'a', '01': '-', '11': 'e', '10': 'c' },
        d: { '00': '-', '01': 'b', '11': 'd', '10': 'f' },
        e: { '00': '-', '01': 'b', '11': 'e', '10': 'g' },
        f: { '00': 'a', '01': '-', '11': 'e', '10': 'f' },
        g: { '00': 'a', '01': '-', '11': 'e', '10': 'g' },
      },
      out: { a: '0', b: '0', c: '0', d: '0', e: '1', f: '0', g: '1' },
    }),
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
