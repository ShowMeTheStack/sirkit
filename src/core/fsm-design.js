// The synchronous design flow, step by step: state table → reduced table → assigned (transition) table →
// excitation table → a K-map per flip-flop input and output → equations → a gate circuit, laid out by the
// schematic engine. Also the reverse (analysis of a clocked circuit into state equations, a state table and a
// diagram), unused states and self-correction, checking a student's answer at each stage, comparing state
// assignments by cost, and sequence-detector generation.
(function (S) {
  'use strict';
  /** 'a' or 'an' before a word as it is read aloud (an AND, an xor, an 8-bit, a NAND, a reg) */
  const an = (w) => (/^(?:[aeiou]|x(?:n?or)\b|nmos|rnmos|rtran|rcmos|rpmos|8|11(?!\d)|18(?!\d))/i.test(String(w)) ? 'an ' : 'a ');
  const F = S.Fsm = S.Fsm || {};
  const U = F.util = F.util || {};
  const N = () => S.Netlist;
  const suffixOf = (v) => v.replace(/^[A-Za-z]+/, '') || v;
  const PART = { D: 'DFF', JK: 'JKFF', T: 'TFF', SR: 'JKFF' };

  // ---- a two-level circuit from covers ------------------------------------------------------------------
  /**
   * Build sums of products as gates around a set of literal sources. srcs: name → { pos: pinRef, neg: pinRef
   * or null }; a missing complement gets one shared inverter. fns: [{ cubes, vars, to: pinRef }].
   */
  U.sopGates = function (c, srcs, fns, opts) {
    opts = opts || {};
    const memo = new Map();
    const lit = (name, pos) => {
      const s = srcs[name];
      if (pos) return s.pos;
      if (!s.neg) { const g = c.gate('NOT'); c.connect(s.pos, g.pin('i0')); s.neg = g.pin('y'); }
      return s.neg;
    };
    // unshared, each function ties off with a constant of its own
    const constOf = (v, f) => { const k = (opts.share === false ? fns.indexOf(f) + ':' : '') + 'C' + v; if (!memo.has(k)) memo.set(k, c.constant(v).pin('y')); return memo.get(k); };
    for (const f of fns) {
      const terms = f.cubes.map((cube) => {
        const lits = [];
        for (let i = 0; i < cube.length; i++) if (cube[i] !== '-') lits.push([f.vars[i], cube[i] === '1']);
        if (!lits.length) return constOf(1, f);
        if (lits.length === 1) return lit(lits[0][0], lits[0][1]);
        const k = (opts.share === false ? fns.indexOf(f) + ':' : '') + 'AND:' + lits.map((l) => l[0] + (l[1] ? '' : "'")).join(',');
        if (!memo.has(k)) { const g = c.gate('AND', lits.length); lits.forEach((l, i) => c.connect(lit(l[0], l[1]), g.pin('i' + i))); memo.set(k, g.pin('y')); }
        return memo.get(k);
      });
      let y;
      if (!terms.length) y = constOf(0, f);
      else if (terms.length === 1) y = terms[0];
      else { const g = c.gate('OR', terms.length); terms.forEach((t, i) => c.connect(t, g.pin('i' + i))); y = g.pin('y'); }
      c.connect(y, f.to);
    }
  };
  /** leave every unconnected output pin open on purpose (unused Q′ and the like) */
  U.closeOpen = (c) => { for (const p of c.parts) for (const q of p.pins) if (q.dir === 'out' && !p.net[q.name]) c.leaveOpen({ part: p, pin: q.name }); };

  // ---- the design flow ---------------------------------------------------------------------------------
  /**
   * design(machine, opts): opts.ff 'D' | 'JK' | 'T' | 'SR'; opts.assign 'binary' | 'gray' | 'onehot' |
   * 'heuristic' | codes; opts.reduce (default true); opts.method for reduction; opts.unused 'dc' (default:
   * unused codes are don't cares) or 'start' (they go to the start state with outputs 0).
   * Returns { stages: { table, reduced, assigned, excitation, kmaps, equations, circuit }, machine, assignment,
   * vars, rows, functions, equations, circuit, trace }.
   */
  F.design = function (m0, opts) {
    opts = opts || {};
    const ff = opts.ff || 'D', trace = [], stages = {};
    if (!F.EXCITATION[ff]) throw new Error('unknown flip-flop type ' + ff);
    stages.table = { machine: m0, say: 'The state table has ' + m0.states.length + ' states, ' + m0.inputs.length + ' input' + (m0.inputs.length === 1 ? '' : 's') + ' and ' + m0.outputs.length + ' output' + (m0.outputs.length === 1 ? '' : 's') + '.' };
    trace.push({ kind: 'stage', stage: 'table', say: stages.table.say });
    // reduce
    let m = m0;
    if (opts.reduce !== false) {
      const r = F.reduce(m0, { method: opts.method });
      m = r.machine;
      stages.reduced = { machine: m, classes: r.classes, trace: r.trace, say: m.states.length < m0.states.length ? 'Reduction leaves ' + m.states.length + ' states: ' + F.showClasses(r.classes.filter((c) => c.length > 1)) + ' merge.' : 'No states can be merged.' };
    } else stages.reduced = { machine: m, classes: m.states.map((s) => [s]), trace: [], say: 'Reduction skipped.' };
    trace.push({ kind: 'stage', stage: 'reduced', say: stages.reduced.say });
    // assign
    const asg = F.assign(m, opts.assign || 'binary');
    if (asg.kind === 'onehot' && ff !== 'D') throw new Error('the one-hot design here uses D flip-flops');
    const vars = asg.vars, codes = asg.codes, n = vars.length, ins = m.inputs, syms = F.symbols(m);
    const used = new Set(Object.values(codes));
    if (used.size !== m.states.length) throw new Error('two states share a code');
    const rows = [];
    for (const s of m.states) for (const x of syms) {
      const ns = m.next[s][x];
      rows.push({ state: s, code: codes[s], input: x, next: ns, nextCode: ns == null ? null : codes[ns], out: F.outOf(m, s, x) });
    }
    const unusedCodes = [];
    if (asg.kind !== 'onehot') for (let v = 0; v < 1 << n; v++) { const code = U.bits(v, n); if (!used.has(code)) unusedCodes.push(code); }
    stages.assigned = { assignment: asg, vars, codes, rows, unused: unusedCodes, say: 'Assign codes (' + asg.kind + '): ' + m.states.map((s) => s + ' = ' + codes[s]).join(', ') + (unusedCodes.length ? '; ' + unusedCodes.join(', ') + ' unused' : '') + '.' };
    trace.push({ kind: 'stage', stage: 'assigned', say: stages.assigned.say });
    // excitation
    const E = F.EXCITATION[ff];
    const ffIns = []; // [{ name, bit, which }]
    vars.forEach((v, b) => E.inputs.forEach((p, k) => ffIns.push({ name: p + suffixOf(v), bit: b, which: k, v })));
    for (const r of rows) {
      r.exc = {};
      for (const fi of ffIns) r.exc[fi.name] = r.nextCode == null ? 'X' : F.excite(ff, r.code[fi.bit], r.nextCode[fi.bit])[fi.which];
    }
    stages.excitation = { ff, inputs: ffIns.map((f) => f.name), rows, say: 'With ' + ff + ' flip-flops each bit change Q → Q+ needs ' + E.inputs.join(', ') + ' from the excitation table.' };
    trace.push({ kind: 'stage', stage: 'excitation', say: stages.excitation.say });
    // functions: next-state inputs over (state vars, inputs); Moore outputs over state vars only
    const fvars = vars.concat(ins);
    const idx = (code, x) => parseInt(code + x, 2) || 0;
    const functions = [];
    const onehot = asg.kind === 'onehot';
    for (const fi of ffIns) {
      const ones = [], dc = [];
      for (const r of rows) { const v = r.exc[fi.name]; if (v === '1') ones.push(idx(r.code, r.input)); else if (v === 'X') dc.push(idx(r.code, r.input)); }
      if (opts.unused === 'start') for (const code of unusedCodes) for (const x of syms) { const v = F.excite(ff, code[fi.bit], codes[m.start][fi.bit])[fi.which]; if (v === '1') ones.push(idx(code, x)); else if (v === 'X') dc.push(idx(code, x)); }
      else for (const code of unusedCodes) for (const x of syms) dc.push(idx(code, x));
      functions.push({ name: fi.name, kind: 'ff', vars: fvars, ones, dc });
    }
    const mealy = m.type === 'mealy';
    m.outputs.forEach((o, k) => {
      const ones = [], dc = [], fv = mealy ? fvars : vars;
      for (const s of m.states) {
        if (mealy) for (const x of syms) { const z = m.out[s][x][k]; const i = idx(codes[s], x); if (z === '1') ones.push(i); else if (z === '-') dc.push(i); }
        else { const z = m.out[s][k]; const i = parseInt(codes[s], 2); if (z === '1') ones.push(i); else if (z === '-') dc.push(i); }
      }
      if (opts.unused !== 'start') for (const code of unusedCodes) { if (mealy) for (const x of syms) dc.push(idx(code, x)); else dc.push(parseInt(code, 2)); }
      functions.push({ name: o, kind: 'out', vars: fv, ones, dc });
    });
    // minimise (one-hot: read the equations off the diagram, since nearly every code is unused)
    for (const f of functions) {
      if (onehot) {
        const cubes = [];
        const add = (cube) => { if (!cubes.includes(cube)) cubes.push(cube); };
        const width = f.vars.length;
        for (const mt of f.ones) { const b = U.bits(mt, width); const st = b.slice(0, n).indexOf('1'); const cube = Array.from({ length: width }, (_, i) => (i === st ? '1' : i >= n ? b[i] : '-')).join(''); add(cube); }
        // merge cubes that differ only in one input bit (X and X′ of the same state)
        let merged = true;
        while (merged) {
          merged = false;
          for (let i = 0; i < cubes.length && !merged; i++) for (let j = i + 1; j < cubes.length && !merged; j++) {
            const a = cubes[i], b = cubes[j]; let d = -1, cnt = 0;
            for (let k = 0; k < width; k++) if (a[k] !== b[k]) { cnt++; d = k; }
            if (cnt === 1 && d >= n && a[d] !== '-' && b[d] !== '-') { cubes.splice(j, 1); cubes[i] = a.slice(0, d) + '-' + a.slice(d + 1); merged = true; }
          }
        }
        f.min = { cubes, ast: U.sopAst(cubes, f.vars), text: U.sopText(cubes, f.vars), literals: U.literals(cubes), byInspection: true };
      } else f.min = U.minimise(f.vars, f.ones, f.dc);
      f.text = f.name + ' = ' + f.min.text;
    }
    stages.kmaps = { functions, say: onehot ? 'With one-hot codes each next-state equation is read off the diagram: Yi is set by every transition into state i.' : 'One K-map per flip-flop input and per output, over ' + fvars.join(', ') + '; unused codes and unspecified entries are don\'t cares.' };
    trace.push({ kind: 'stage', stage: 'kmaps', say: stages.kmaps.say });
    for (const f of functions) trace.push({ kind: 'equation', name: f.name, text: f.text, say: f.text + ' (' + f.min.literals + ' literals).' });
    const equations = functions.map((f) => ({ name: f.name, text: f.text, ast: f.min.ast, cubes: f.min.cubes, vars: f.vars }));
    stages.equations = { equations, say: 'The equations: ' + equations.map((e) => e.text).join('; ') + '.' };
    // circuit
    const circuit = F.buildCircuit(m.name || 'fsm', { inputs: ins, vars, ff, functions, outputs: m.outputs, reset: opts.reset, start: codes[m.start] });
    stages.circuit = { circuit, say: 'The circuit: ' + n + ' ' + ff + ' flip-flop' + (n > 1 ? 's' : '') + (ff === 'SR' ? ' (drawn as JK flip-flops with J = S and K = R, which act alike while S and R are never both 1)' : '') + ' and the gates of the equations.' };
    trace.push({ kind: 'stage', stage: 'circuit', say: stages.circuit.say });
    const d = { machine: m, original: m0, ff, assignment: asg, vars, codes, rows, unused: unusedCodes, functions, equations, circuit, stages, trace };
    d.cost = F.cost(d);
    return d;
  };

  /** the circuit of a design: flip-flops, inverters on inputs as needed, AND-OR logic */
  F.buildCircuit = function (title, o) {
    const c = new (N().Circuit)(title);
    const srcs = {};
    for (const x of o.inputs) srcs[x] = { pos: c.input(x).pin('y'), neg: null };
    const clk = c.clock('CLK').pin('y');
    // with opts.reset, a RESET input presets each flip-flop to the start code (set or clear)
    const ffs = o.vars.map((v, i) => c.add(PART[o.ff], o.reset ? (o.start[i] === '1' ? { set: true } : { reset: true }) : {}, v.toLowerCase()));
    ffs.forEach((p, i) => { srcs[o.vars[i]] = { pos: p.pin('q'), neg: p.pin('qn') }; p.params.name = o.vars[i]; });
    c.connect(clk, ...ffs.map((p) => p.pin('clk')));
    if (o.reset) { const r = c.input('RESET').pin('y'); c.connect(r, ...ffs.map((p, i) => p.pin(o.start[i] === '1' ? 'set' : 'rst'))); }
    const E = F.EXCITATION[o.ff], pinName = { D: 'd', J: 'j', K: 'k', T: 't', S: 'j', R: 'k' };
    const fns = [];
    for (const f of o.functions) {
      if (f.kind === 'ff') {
        const bit = o.vars.findIndex((v) => E.inputs.some((p) => p + suffixOf(v) === f.name));
        const which = E.inputs.find((p) => p + suffixOf(o.vars[bit]) === f.name);
        fns.push({ cubes: f.min.cubes, vars: f.vars, to: ffs[bit].pin(pinName[which]) });
      } else fns.push({ cubes: f.min.cubes, vars: f.vars, to: c.output(f.name).pin('a') });
    }
    // product terms are not shared between functions: each sum keeps its own row of gates, which the state
    // machine drawing style needs
    U.sopGates(c, srcs, fns, { share: false });
    U.closeOpen(c);
    try { if (S.Styles && S.Styles.styles.fsm.test(c)) c.style = 'fsm'; } catch (e) { /* the general layout */ }
    return c;
  };

  /** cost of a design: flip-flops, product terms, literals, gate inputs (AND inputs plus OR inputs) */
  F.cost = function (d) {
    let terms = 0, literals = 0, gateInputs = 0, inverters = new Set();
    for (const f of d.functions) {
      const cs = f.min.cubes;
      for (const c of cs) { const k = c.replace(/-/g, '').length; literals += k; if (k > 1) { terms++; gateInputs += k; } for (let i = 0; i < c.length; i++) if (c[i] === '0' && i >= d.vars.length) inverters.add(f.vars[i]); }
      if (cs.length > 1) gateInputs += cs.length;
    }
    return { flipflops: d.vars.length, terms, literals, gateInputs, inverters: inverters.size, say: d.vars.length + ' flip-flops, ' + terms + ' AND gates, ' + gateInputs + ' gate inputs, ' + literals + ' literals' };
  };
  /** the four assignments side by side, each with its cost */
  F.compareAssignments = function (m, opts) {
    opts = opts || {};
    const out = [];
    for (const kind of ['binary', 'gray', 'heuristic', 'onehot']) {
      if (kind === 'onehot' && (opts.ff || 'D') !== 'D') continue;
      try { const d = F.design(m, Object.assign({}, opts, { assign: kind })); out.push({ kind, codes: d.codes, equations: d.equations.map((e) => e.text), cost: d.cost }); } catch (e) { out.push({ kind, error: String(e.message || e) }); }
    }
    const ok = out.filter((r) => r.cost);
    const best = ok.reduce((a, b) => (!a || b.cost.gateInputs < a.cost.gateInputs ? b : a), null);
    return { results: out, best: best && best.kind, say: ok.map((r) => r.kind + ': ' + r.cost.say).join('; ') + '.' };
  };

  /**
   * Check that a circuit behaves as a design's transition table: for every used code and input, the outputs
   * before the edge and the code after it. Uses the zero-delay evaluator here.
   */
  F.verify = function (d, circuit) {
    const c = circuit || d.circuit, sim = U.netSim(c), bad = [];
    const ffs = d.vars.map((v) => c.byId.get(v.toLowerCase()));
    const syms = F.symbols(d.machine);
    for (const s of d.machine.states) for (const x of syms) {
      const r = d.rows.find((q) => q.state === s && q.input === x);
      sim.load(ffs.map((p, i) => [p, +d.codes[s][i]]));
      d.machine.inputs.forEach((name, i) => sim.set(name, +x[i]));
      sim.settle();
      const out = d.machine.outputs.map((o) => sim.get(o)).join('');
      sim.clock();
      const code = ffs.map((p) => sim.get(p.id)).join('');
      if (r.out != null && !U.agree(out, r.out)) bad.push({ state: s, input: x, say: 'In ' + s + ' (' + d.codes[s] + ') with ' + U.showIn(d.machine, x) + ' the circuit outputs ' + out + ' but the table says ' + r.out + '.' });
      if (r.nextCode != null && code !== r.nextCode) bad.push({ state: s, input: x, say: 'In ' + s + ' (' + d.codes[s] + ') with ' + U.showIn(d.machine, x) + ' the circuit goes to ' + code + ' but the table says ' + r.nextCode + ' (' + r.next + ').' });
    }
    return { ok: !bad.length, problems: bad };
  };

  // ---- unused states ------------------------------------------------------------------------------------
  /**
   * Where each unused code goes in the finished circuit, and whether the circuit corrects itself: every unused
   * code must reach a used one whatever the inputs. Returns { codes: [{ code, next: {x: code}, out, lockout }],
   * selfCorrecting, trace }.
   */
  F.unusedStates = function (d) {
    const c = d.circuit, sim = U.netSim(c), trace = [];
    const ffs = d.vars.map((v) => c.byId.get(v.toLowerCase()));
    const m = d.machine, syms = F.symbols(m), used = new Map(Object.entries(d.codes).map(([s, k]) => [k, s]));
    const unused = d.unused.slice();
    if (!unused.length) return { codes: [], selfCorrecting: true, trace: [{ kind: 'none', say: 'Every code is used, so there are no unused states.' }] };
    const step = (code, x) => {
      sim.load(ffs.map((p, i) => [p, +code[i]]));
      m.inputs.forEach((name, i) => sim.set(name, +x[i]));
      sim.settle();
      const out = m.outputs.map((o) => sim.get(o)).join('');
      sim.clock();
      return { next: ffs.map((p) => sim.get(p.id)).join(''), out };
    };
    const graph = new Map();
    for (const code of unused) { const e = {}; for (const x of syms) e[x] = step(code, x); graph.set(code, e); }
    // a code locks out when some input sequence keeps the machine among unused codes forever: a cycle there
    const trapped = new Set(unused);
    for (let changed = true; changed;) {
      changed = false;
      for (const code of [...trapped]) if (!syms.some((x) => trapped.has(graph.get(code)[x].next))) { trapped.delete(code); changed = true; }
    }
    const res = unused.map((code) => {
      const e = graph.get(code), nx = {}, outs = {};
      for (const x of syms) { nx[x] = e[x].next; outs[x] = e[x].out; }
      const r = { code, next: nx, out: outs, lockout: trapped.has(code) };
      const where = syms.map((x) => (m.inputs.length ? 'on ' + U.showIn(m, x) + ' ' : '') + 'to ' + nx[x] + (used.has(nx[x]) ? ' (' + used.get(nx[x]) + ')' : ' (unused)')).join(', ');
      trace.push({ kind: 'unused', code, next: nx, lockout: r.lockout, say: 'Unused ' + code + ' goes ' + where + (r.lockout ? '; it can stay among unused codes forever (lockout).' : '.') });
      return r;
    });
    const ok = !trapped.size;
    trace.push({ kind: 'verdict', say: ok ? 'Every unused code reaches a used state, whatever the inputs: the circuit corrects itself.' : 'The codes ' + [...trapped].join(', ') + ' can lock out; redesign with the unused codes sent to the start state.' });
    return { codes: res, selfCorrecting: ok, trace };
  };

  // ---- analysis of a clocked circuit -------------------------------------------------------------------
  /**
   * analyse(circuit, opts): flip-flop input equations, state equations, the state table and the diagram.
   * The machine is Mealy when an output depends on an input, else Moore (opts.type forces one). A RESET input
   * is left out of the table (held at 0). Returns { vars, inputs, outputs, inputEquations, stateEquations, outputEquations, machine, diagram, trace }.
   */
  F.analyse = function (c, opts) {
    opts = opts || {};
    const Nl = N(), trace = [];
    const ffs = c.parts.filter((p) => ['DFF', 'JKFF', 'TFF'].includes(p.type));
    if (!ffs.length) throw new Error('the circuit has no flip-flops');
    const vars = ffs.map((p, i) => p.params.name || (/^[a-z][0-9]*$/i.test(p.id) ? p.id.toUpperCase() : 'Q' + (ffs.length - 1 - i)));
    const varOf = new Map(ffs.map((p, i) => [p, vars[i]]));
    const inputs = c.parts.filter((p) => p.type === 'IN' && p.params.name !== 'RESET').map((p) => p.params.name);
    const outs = c.parts.filter((p) => p.type === 'OUT');
    const pinDir = (r) => r.part.pins.find((q) => q.name === r.pin).dir;
    const driver = (p, pin) => { const n = p.net[pin]; return n ? n.pins.find((r) => pinDir(r) === 'out') : null; };
    const OPS = { AND: 'and', OR: 'or', XOR: 'xor', NAND: 'and', NOR: 'or', XNOR: 'xor' };
    const expr = (r, stack) => {
      if (!r) return { op: 'const', v: 0 };
      const p = r.part;
      if (p.type === 'IN') return { op: 'var', name: p.params.name };
      if (p.type === 'CONST') return { op: 'const', v: p.params.value ? 1 : 0 };
      if (varOf.has(p)) { const v = { op: 'var', name: varOf.get(p) }; return r.pin === 'qn' ? { op: 'not', a: v } : v; }
      if (stack.has(p)) throw new Error('the logic has a loop through ' + p.id + ' that no flip-flop breaks');
      stack.add(p);
      const ins = p.pins.filter((q) => q.dir === 'in').map((q) => expr(driver(p, q.name), stack));
      stack.delete(p);
      if (p.type === 'NOT') return { op: 'not', a: ins[0] };
      if (p.type === 'BUF') return ins[0];
      const e = { op: OPS[p.type], args: ins };
      if (!e.op) throw new Error('cannot analyse ' + an(p.type) + p.type);
      return ['NAND', 'NOR', 'XNOR'].includes(p.type) ? { op: 'not', a: e } : e;
    };
    const fvars = vars.concat(inputs);
    const tt = (e, vs) => { const ones = []; for (let m = 0; m < 1 << vs.length; m++) { const env = {}; vs.forEach((v, i) => { env[v] = (m >> (vs.length - 1 - i)) & 1; }); if (Nl.evaluate(e, env)) ones.push(m); } return ones; };
    const inputEquations = [];
    const pinsOf = { DFF: ['d'], TFF: ['t'], JKFF: ['j', 'k'] };
    const exprs = new Map();
    ffs.forEach((p, i) => {
      for (const pin of pinsOf[p.type]) {
        const e = expr(driver(p, pin), new Set());
        const name = pin.toUpperCase() + suffixOf(vars[i]);
        exprs.set(name, e);
        const mn = U.minimise(fvars, tt(e, fvars), []);
        inputEquations.push({ name, ast: e, text: name + ' = ' + U.text(e, fvars), min: mn.text });
        trace.push({ kind: 'input-eq', name, say: 'Follow the wires back from ' + pin.toUpperCase() + ' of ' + vars[i] + ': ' + name + ' = ' + U.text(e, fvars) + (mn.text !== U.text(e, fvars) ? ' = ' + mn.text : '') + '.' });
      }
    });
    // state equations from the characteristic equations
    const stateEquations = ffs.map((p, i) => {
      const v = { op: 'var', name: vars[i] }, sfx = suffixOf(vars[i]);
      let e;
      if (p.type === 'DFF') e = exprs.get('D' + sfx);
      else if (p.type === 'TFF') e = { op: 'xor', args: [exprs.get('T' + sfx), v] };
      else e = { op: 'or', args: [{ op: 'and', args: [exprs.get('J' + sfx), { op: 'not', a: v }] }, { op: 'and', args: [{ op: 'not', a: exprs.get('K' + sfx) }, v] }] };
      const mn = U.minimise(fvars, tt(e, fvars), []);
      const say = vars[i] + '(t+1) = ' + mn.text;
      trace.push({ kind: 'state-eq', name: vars[i], say: 'With a ' + p.type.replace('FF', '') + ' flip-flop, ' + F.CHARACTERISTIC[{ DFF: 'D', TFF: 'T', JKFF: 'JK' }[p.type]] + ', so ' + say + '.' });
      return { name: vars[i], ast: e, text: say, min: mn };
    });
    const outputEquations = outs.map((o) => {
      const e = expr(driver(o, 'a'), new Set()), mn = U.minimise(fvars, tt(e, fvars), []);
      return { name: o.params.name, ast: e, text: o.params.name + ' = ' + mn.text, dependsOnInputs: inputs.some((x) => { const ones = tt(e, fvars), k = fvars.indexOf(x), w = fvars.length; return ones.some((m) => !ones.includes(m ^ (1 << (w - 1 - k)))) || false; }) };
    });
    for (const o of outputEquations) trace.push({ kind: 'output-eq', name: o.name, say: 'The output ' + o.text + (o.dependsOnInputs ? ', which depends on the inputs: a Mealy output.' : ', which depends on the state only: a Moore output.') });
    const mealy = opts.type ? opts.type === 'mealy' : outputEquations.some((o) => o.dependsOnInputs);
    const n = vars.length, syms = U.symbols(inputs.length), table = {}, states = [];
    for (let v = 0; v < 1 << n; v++) {
      const code = U.bits(v, n); states.push(code);
      const env0 = {}; vars.forEach((q, i) => { env0[q] = +code[i]; });
      const row = mealy ? {} : { next: {}, out: '' };
      for (const x of syms) {
        const env = Object.assign({}, env0); inputs.forEach((name, i) => { env[name] = +x[i]; });
        const nx = stateEquations.map((e) => Nl.evaluate(e.ast, env)).join('');
        const z = outputEquations.map((e) => Nl.evaluate(e.ast, env)).join('');
        if (mealy) row[x] = [nx, z]; else { row.next[x] = nx; row.out = z; }
      }
      table[code] = row;
    }
    const machine = F.create({ type: mealy ? 'mealy' : 'moore', inputs, outputs: outs.map((o) => o.params.name), states, start: states[0], table, name: c.title });
    for (const s of states) trace.push({ kind: 'row', state: s, say: 'Present state ' + s + ': ' + F.symbols(machine).map((x) => (inputs.length ? 'on ' + U.showIn(machine, x) + ' ' : '') + 'next ' + machine.next[s][x] + (mealy ? ', output ' + machine.out[s][x] : '')).join('; ') + (mealy ? '' : '; output ' + machine.out[s]) + '.' });
    return { vars, inputs, outputs: outs.map((o) => o.params.name), inputEquations, stateEquations, outputEquations, machine, diagram: F.diagram(machine), trace };
  };

  // ---- checking a student's work ------------------------------------------------------------------------
  const verdict = (errors, okSay) => ({ ok: !errors.length, errors, say: errors.length ? errors[0].say : okSay });
  F.check = {
    /** a state table (a machine, or a create() spec) against the expected machine */
    table(want, got) {
      if (!got.next) got = F.create(Object.assign({ type: want.type, inputs: want.inputs, outputs: want.outputs, start: want.start }, got));
      const errors = [];
      for (const s of want.states) {
        if (!got.next[s]) { errors.push({ state: s, say: 'The table has no row for ' + s + '.' }); continue; }
        if (want.type === 'moore' && !U.agree(want.out[s], got.out[s])) errors.push({ state: s, say: 'Row ' + s + ' should output ' + want.out[s] + ', not ' + got.out[s] + '.' });
        for (const x of F.symbols(want)) {
          if (want.next[s][x] != null && got.next[s][x] !== want.next[s][x]) errors.push({ state: s, input: x, say: 'Row ' + s + ' on input ' + x + ' should go to ' + want.next[s][x] + (got.next[s][x] ? ', not ' + got.next[s][x] : '') + '.' });
          if (want.type === 'mealy' && !U.agree(want.out[s][x], got.out[s][x])) errors.push({ state: s, input: x, say: 'Row ' + s + ' on input ' + x + ' should output ' + want.out[s][x] + ', not ' + got.out[s][x] + '.' });
        }
      }
      for (const s of got.states) if (!want.states.includes(s)) errors.push({ state: s, say: 'There is no state ' + s + ' in the machine.' });
      return verdict(errors, 'The state table is right.');
    },
    /** a partition of the states into classes (arrays of names) against the true equivalence classes */
    reduced(m, classes) {
      const errors = [], where = new Map();
      classes.forEach((c, i) => c.forEach((s) => where.set(s, i)));
      for (const s of m.states) if (!where.has(s)) errors.push({ say: s + ' is in none of your classes.' });
      for (let i = 0; i < m.states.length; i++) for (let j = i + 1; j < m.states.length; j++) {
        const a = m.states[i], b = m.states[j];
        if (!where.has(a) || !where.has(b)) continue;
        const eq = F.equivalent(m, m, { fromA: a, fromB: b });
        if (where.get(a) === where.get(b) && !eq.equal) errors.push({ pair: [a, b], say: a + ' and ' + b + ' are not equivalent: from them the input ' + eq.sequence.join(' ') + ' gives ' + eq.outA[eq.outA.length - 1] + ' and ' + eq.outB[eq.outB.length - 1] + '.' });
        if (where.get(a) !== where.get(b) && eq.equal) errors.push({ pair: [a, b], say: a + ' and ' + b + ' are equivalent, so they belong in one class.' });
      }
      return verdict(errors, 'The classes are right: ' + F.showClasses(classes) + '.');
    },
    /**
     * an implication table: the set of pairs the student crossed out ([['S0', 'S2'], ...]); every pair that
     * must be crossed is named with its reason, and every pair crossed wrongly with the reason it stays
     */
    implication(m, crossed) {
      const t = F.implication(m), errors = [];
      const key = (a, b) => (m.states.indexOf(a) < m.states.indexOf(b) ? a + '|' + b : b + '|' + a);
      const mine = new Set(crossed.map((p) => key(p[0], p[1])));
      for (const c of t.pairs.values()) {
        const k = key(c.a, c.b);
        if (c.crossed != null && !mine.has(k)) errors.push({ pair: [c.a, c.b], say: '(' + c.a + ', ' + c.b + ') must be crossed out: ' + c.reason + '.' });
        if (c.crossed == null && mine.has(k)) errors.push({ pair: [c.a, c.b], say: '(' + c.a + ', ' + c.b + ') stays: ' + (c.implied.length ? 'none of the pairs it implies, ' + c.implied.map((e) => '(' + e[1] + ', ' + e[2] + ')').join(', ') + ', is crossed out' : 'the outputs agree and it implies nothing else') + '.' });
      }
      return verdict(errors, 'The implication table is right.');
    },
    /** a state assignment: distinct codes, all of one width */
    assignment(m, codes) {
      const errors = [], seen = new Map(), w = codes[m.states[0]] && codes[m.states[0]].length;
      for (const s of m.states) {
        const c = codes[s];
        if (c == null || !/^[01]+$/.test(c)) { errors.push({ state: s, say: s + ' has no code.' }); continue; }
        if (c.length !== w) errors.push({ state: s, say: s + ' has ' + an(c.length) + c.length + '-bit code but the others have ' + w + ' bits.' });
        if (seen.has(c)) errors.push({ state: s, say: s + ' and ' + seen.get(c) + ' share the code ' + c + '.' });
        seen.set(c, s);
      }
      if (w && 1 << w < m.states.length) errors.push({ say: w + ' bits give only ' + (1 << w) + ' codes for ' + m.states.length + ' states.' });
      return verdict(errors, 'Every state has its own code.');
    },
    /** the transition (assigned) table: answer[stateOrCode][input] = { next: code, out } */
    transition(d, answer) {
      const errors = [];
      for (const r of d.rows) {
        const row = answer[r.state] || answer[r.code];
        const a = row && row[r.input];
        if (!a) { errors.push({ state: r.state, input: r.input, say: 'Row ' + r.state + ' (' + r.code + ') on input ' + r.input + ' is missing.' }); continue; }
        if (r.nextCode != null && a.next !== r.nextCode) errors.push({ state: r.state, input: r.input, say: 'Row ' + r.code + ' on input ' + r.input + ' should go to ' + r.nextCode + ' (' + r.next + '), not ' + a.next + '.' });
        if (a.out != null && r.out != null && !U.agree(a.out, r.out)) errors.push({ state: r.state, input: r.input, say: 'Row ' + r.code + ' on input ' + r.input + ' should output ' + r.out + ', not ' + a.out + '.' });
      }
      return verdict(errors, 'The transition table is right.');
    },
    /** one excitation entry: does the given input pair cause q → q1? given: { J, K } or { D } ... */
    excitation(type, q, q1, given) {
      const E = F.EXCITATION[type], want = F.excite(type, q, q1);
      const bad = E.inputs.filter((p, i) => want[i] !== 'X' && String(given[p]) !== want[i] && !(String(given[p]).toUpperCase() === 'X'));
      const xs = E.inputs.filter((p, i) => want[i] !== 'X' && String(given[p]).toUpperCase() === 'X');
      const pair = E.inputs.map((p) => p + ' = ' + given[p]).join(', ');
      const name = type === 'JK' ? 'this JK pair' : type === 'SR' ? 'this SR pair' : 'this ' + type + ' input';
      if (bad.length) return { ok: false, say: name.charAt(0).toUpperCase() + name.slice(1) + ' (' + pair + ') does not cause the ' + q + '→' + q1 + ' transition: it needs ' + E.inputs.map((p, i) => p + ' = ' + want[i]).join(', ') + '.' };
      if (xs.length) return { ok: false, say: xs.join(' and ') + ' cannot be a don\'t care for ' + q + '→' + q1 + ': it needs ' + E.inputs.map((p, i) => p + ' = ' + want[i]).join(', ') + '.' };
      const loose = E.inputs.filter((p, i) => want[i] === 'X' && String(given[p]).toUpperCase() !== 'X');
      return { ok: true, say: pair + ' causes ' + q + '→' + q1 + (loose.length ? ' (' + loose.join(', ') + ' could be a don\'t care)' : '') + '.' };
    },
    /** the whole excitation table: answer[stateOrCode][input][inputName] */
    excitationTable(d, answer) {
      const errors = [];
      for (const r of d.rows) {
        const a = (answer[r.state] || answer[r.code] || {})[r.input];
        if (!a || r.nextCode == null) continue;
        d.vars.forEach((v, b) => {
          const names = F.EXCITATION[d.ff].inputs.map((p) => p + suffixOf(v));
          const given = {}; F.EXCITATION[d.ff].inputs.forEach((p, i) => { given[p] = a[names[i]]; });
          const res = F.check.excitation(d.ff, r.code[b], r.nextCode[b], given);
          if (!res.ok) errors.push({ state: r.state, input: r.input, bit: v, say: 'Row ' + r.code + ', input ' + r.input + ', ' + v + ': ' + res.say });
        });
      }
      return verdict(errors, 'The excitation table is right.');
    },
    /** an equation for one function of the design ('D1', 'J0', 'Z', ...) */
    equation(d, name, text) {
      const f = d.functions.find((q) => q.name === name);
      if (!f) return { ok: false, say: 'There is no function ' + name + ' in this design.' };
      let e;
      // the design's own names (START, Q1, ...) stay whole, in any notation
      const B = S.Bool && S.Bool.parse ? S.Bool : N();
      try { e = B === N() ? N().parse(text.replace(/^\s*\w+\s*=/, '')) : B.parse(text.replace(/^\s*\w+\s*=/, ''), { vars: f.vars }); } catch (err) { return { ok: false, say: 'The equation cannot be read: ' + err.message + '.' }; }
      const extra = [...B.vars(e)].filter((v) => !f.vars.includes(v));
      if (extra.length) return { ok: false, say: name + ' can use only ' + f.vars.join(', ') + ', not ' + extra.join(', ') + '.' };
      const w = f.vars.length, nState = d.vars.length;
      // with one-hot codes every code that is not one-hot is a don't care
      const careOH = (m) => { if (d.assignment.kind !== 'onehot') return true; const st = (m >> (w - nState)) & ((1 << nState) - 1); return st && !(st & (st - 1)); };
      for (let m = 0; m < 1 << w; m++) {
        if (f.dc.includes(m) || !careOH(m)) continue;
        const env = {}; f.vars.forEach((v, i) => { env[v] = (m >> (w - 1 - i)) & 1; });
        const want = f.ones.includes(m) ? 1 : 0, got = B.evaluate(e, env);
        if (got !== want) return { ok: false, minterm: m, say: 'With ' + f.vars.map((v) => v + ' = ' + env[v]).join(', ') + ' your ' + name + ' gives ' + got + ' but it must be ' + want + '.' };
      }
      const lits = (function count(x) { return x.op === 'var' ? 1 : x.op === 'const' ? 0 : x.op === 'not' ? count(x.a) : x.args.reduce((a, y) => a + count(y), 0); })(e);
      const best = f.min.literals;
      return { ok: true, minimal: lits <= best, say: lits <= best ? name + ' is right and minimal.' : name + ' is right, but it uses ' + lits + ' literals where ' + best + ' will do (' + f.min.text + ').' };
    },
    /** a circuit (the student's) against the design's transition table */
    circuit(d, circuit) {
      try { const r = F.verify(d, circuit); return verdict(r.problems, 'The circuit behaves as the state table says.'); } catch (e) { return { ok: false, errors: [], say: 'The circuit cannot be simulated: ' + e.message + '.' }; }
    },
  };

  // ---- sequence detectors ------------------------------------------------------------------------------
  /**
   * A detector for a bit pattern on input X with output Z. opts.type 'mealy' | 'moore'; opts.overlap (default
   * true). State Si means "the last i bits match the start of the pattern". Returns { machine, trace }.
   */
  F.detector = function (pattern, opts) {
    opts = opts || {};
    if (!/^[01]+$/.test(pattern)) throw new Error('the pattern must be 0s and 1s');
    const L = pattern.length, moore = opts.type === 'moore', overlap = opts.overlap !== false, trace = [];
    // the longest suffix of w that is a prefix of the pattern (but not all of a full match when asked)
    const back = (w) => { for (let k = Math.min(w.length, L); k > 0; k--) if (w.slice(w.length - k) === pattern.slice(0, k)) return k; return 0; };
    const count = moore ? L + 1 : L, table = {}, states = [];
    for (let i = 0; i < count; i++) states.push('S' + i);
    trace.push({ kind: 'plan', say: 'State Si means the last i bits read match the first i bits of ' + pattern + '; ' + (moore ? 'S' + L + ' means the whole pattern has just been seen and outputs 1.' : 'the output is 1 on the bit that completes the pattern.') });
    for (let i = 0; i < count; i++) {
      const row = {};
      for (const b of ['0', '1']) {
        let k, z = '0';
        if (moore && i === L) k = overlap ? back(pattern + b) : back(b);
        else {
          const w = pattern.slice(0, i) + b;
          if (w === pattern) { z = '1'; k = moore ? L : overlap ? back(w.slice(1)) : 0; } else k = back(w);
        }
        row[b] = moore ? 'S' + k : ['S' + k, z];
        trace.push({ kind: 'edge', from: 'S' + i, input: b, to: 'S' + k, out: moore ? null : z, say: 'From S' + i + ' on ' + b + ': ' + (z === '1' ? 'the pattern is complete' + (moore ? '' : ', Z = 1') + '; ' : '') + (z === '1' && !overlap && !moore ? 'without overlap the search starts again in S0.' : moore && i === L && !overlap ? 'without overlap only this bit counts, so go to S' + k + '.' : 'the longest tail that starts the pattern has ' + k + ' bit' + (k === 1 ? '' : 's') + ', so go to S' + k + '.') });
      }
      table['S' + i] = moore ? { out: i === L ? '1' : '0', next: row } : row;
    }
    const machine = F.create({ type: moore ? 'moore' : 'mealy', inputs: ['X'], outputs: ['Z'], states, start: 'S0', table, name: (overlap ? '' : 'non-overlapping ') + pattern + ' detector' });
    return { machine, trace };
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
