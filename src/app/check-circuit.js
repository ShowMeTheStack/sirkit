// Circuits in exercises: reading a circuit from any of the ways content gives one, comparing two circuits (or a
// circuit and a function) by exhaustive simulation, and the kinds that rest on it: circuit, timing, waveform.
// Fields of each kind: src/app/check-index.js.
//
// A circuit can be given as
//   a text netlist, one part per line (# starts a comment):
//       n1 = NAND(A, B)              a gate; its inputs are names (an undefined name is a circuit input), 0 or 1
//       F = NAND(n1, C)              a name listed as an output becomes an output port
//       Q = DFF(D)                   flip-flops (DFF d, TFF t, JKFF j k) are clocked by CLK; Q' is the other output
//       m = MUX(d0=A, d1=B, s0=S)    pins by name; params in brackets: dec = DECODER[k=2](a1=A1, a0=A0); dec.y3 is a pin
//                                    (arguments without names fill the inputs in pin order: a0 first, then a1)
//       G = n1                       an output that is a name already made
//   an editor document ({parts, wires}), a Netlist.Circuit, a function returning one, or
//   {expr: "A'B + C" | outputs: {F: .., G: ..}, style: 'multi' | 'nand' | 'nor' | 'and-or' | ...}.
(function (S) {
  'use strict';
  const K = (S.Check = S.Check || {});
  K.kinds = K.kinds || {};
  const plural = (n, w, ws) => n + ' ' + (n === 1 ? w : ws || w + 's');

  const SEQ = new Set(['DFF', 'JKFF', 'TFF', 'SRFF', 'LATCH', 'SRLATCH', 'REG', 'COUNTER', 'SHIFT', 'USHIFT', 'RAM']);
  const PORT = new Set(['IN', 'OUT', 'CLOCK', 'CONST', 'SWITCH', 'BUTTON', 'VCC', 'GND', 'PULLUP', 'PULLDOWN', 'LED', 'PROBE', 'HEX', 'SEG7']);
  K.isPortType = (t) => PORT.has(t);

  // ---- reading a circuit -----------------------------------------------------------------------------------------
  /** a text netlist as a Netlist.Circuit; opts.outputs names the output ports (else every name no line reads) */
  K.parseNetlist = function (text, opts) {
    opts = opts || {};
    const N = S.Netlist;
    const lines = String(text).split('\n').map((l, i) => ({ n: i + 1, t: l.replace(/#.*$/, '').trim() })).filter((l) => l.t);
    const defs = [];
    for (const l of lines) {
      const m = /^([A-Za-z_][\w]*)\s*=\s*(?:([A-Za-z][\w]*)\s*(?:\[([^\]]*)\])?\s*\(([^)]*)\)|([A-Za-z_][\w.]*'?|[01]))\s*$/.exec(l.t);
      if (!m) throw new Error('line ' + l.n + ' cannot be read: "' + l.t + '" (write name = TYPE(inputs))');
      const params = {};
      if (m[3]) for (const kv of m[3].split(',')) { const [k, v] = kv.split('=').map((s) => s.trim()); if (k) params[k] = v === undefined ? true : /^-?\d+$/.test(v) ? +v : v === 'true' ? true : v === 'false' ? false : v; }
      const args = m[2] ? m[4].split(',').map((s) => s.trim()).filter(Boolean) : null;
      defs.push({ line: l.n, name: m[1], type: m[2] ? m[2].toUpperCase() : null, params, args, alias: m[5] || null });
    }
    const named = new Map(defs.map((d) => [d.name, d]));
    if (named.size !== defs.length) { const seen = new Set(); for (const d of defs) { if (seen.has(d.name)) throw new Error('line ' + d.line + ': ' + d.name + ' is made twice'); seen.add(d.name); } }
    const read = new Set();
    for (const d of defs) for (const a of (d.args || []).map((x) => x.replace(/^\w+\s*=\s*/, '')).concat(d.alias ? [d.alias] : [])) read.add(a.replace(/'$/, '').replace(/\..*$/, ''));
    const outs = opts.outputs || defs.filter((d) => !read.has(d.name)).map((d) => d.name);
    const c = new N.Circuit(opts.title || 'circuit');
    const parts = new Map(), inputs = new Map();
    let clock = null;
    for (const d of defs) {
      if (!d.type) continue;
      const t = d.type;
      const params = Object.assign({}, d.params);
      if (!['NOT', 'BUF'].includes(t) && /^(N?AND|N?OR|XN?OR)$/.test(t) && params.n === undefined) params.n = d.args.length;
      let p;
      try { p = c.add(t, params, d.name.toLowerCase() === d.name ? d.name : 'p_' + d.name); } catch (e) { throw new Error('line ' + d.line + ': ' + e.message); }
      parts.set(d.name, p);
      if (p.pins.some((q) => q.clock)) { if (!clock) clock = c.clock('CLK'); c.connect(clock, p.pin(p.pins.find((q) => q.clock).name)); }
    }
    const driver = (ref, line) => {
      if (ref === '0' || ref === '1') return c.constant(+ref);
      const inv = /'$/.test(ref), base = ref.replace(/'$/, '');
      const dot = /^(\w+)\.(\w+)$/.exec(base);
      if (dot) { const p = parts.get(dot[1]); if (!p) throw new Error('line ' + line + ': there is no part ' + dot[1]); return p.pin(dot[2]); }
      if (parts.has(base)) {
        const p = parts.get(base);
        const outsP = p.pins.filter((q) => q.dir === 'out');
        if (inv) { if (!outsP.some((q) => q.name === 'qn')) throw new Error('line ' + line + ': ' + base + "' needs a flip-flop with a Q' output"); return p.pin('qn'); }
        return p.pin(outsP.some((q) => q.name === 'q') ? 'q' : outsP.some((q) => q.name === 'y') ? 'y' : outsP[0].name);
      }
      const alias = named.get(base);
      if (alias && alias.alias) return driver(alias.alias, alias.line);
      if (inv) throw new Error('line ' + line + ': write NOT(' + base + ') for the complement of an input');
      if (!inputs.has(base)) inputs.set(base, c.input(base));
      return inputs.get(base).pin('y');
    };
    for (const d of defs) {
      if (!d.type) continue;
      const p = parts.get(d.name);
      const ins = p.pins.filter((q) => q.dir === 'in' && !q.clock);
      d.args.forEach((a, i) => {
        const kv = /^(\w+)\s*=\s*(.+)$/.exec(a);
        const pinName = kv ? kv[1] : (ins[i] || {}).name;
        if (!pinName) throw new Error('line ' + d.line + ': ' + d.name + ' has only ' + ins.length + ' inputs');
        c.connect(driver(kv ? kv[2] : a, d.line), p.pin(pinName));
      });
    }
    for (const o of outs) {
      const d = named.get(o);
      if (!d) throw new Error('nothing makes the output ' + o);
      c.connect(d.type ? driver(o, d.line) : driver(d.alias, d.line), c.output(o));
    }
    for (const p of c.parts) for (const q of p.pins) if (q.dir === 'out' && !p.net[q.name]) c.leaveOpen({ part: p, pin: q.name });
    return c;
  };

  /** any circuit form (see the top of this file) as a Netlist.Circuit */
  K.circuitOf = function (spec, opts) {
    opts = opts || {};
    if (!spec) throw new Error('there is no circuit');
    if (typeof spec === 'function') return spec();
    if (typeof spec === 'string') return K.parseNetlist(spec, opts);
    if (spec.byId && spec.nets && spec.parts) return spec;
    if (spec.parts && spec.wires) return S.Doc.toCircuit(spec);
    if (spec.expr || spec.outputs) {
      let outs = spec.outputs;
      if (!outs) { const m = /^\s*([A-Za-z]\w*)\s*=\s*(.*)$/.exec(spec.expr); outs = m ? { [m[1]]: m[2] } : { [(opts.outputs || ['F'])[0]]: spec.expr }; }
      return S.Netlist.fromExpressions(spec.title || 'circuit', outs, spec.style || 'multi', { inputs: spec.inputs || opts.inputs });
    }
    throw new Error('this is not a circuit');
  };
  const portsOf = (c) => ({
    inputs: c.parts.filter((p) => p.type === 'IN' || p.type === 'SWITCH' || p.type === 'BUTTON').map((p) => p.params.name),
    outputs: c.parts.filter((p) => p.type === 'OUT').map((p) => p.params.name),
    widths: Object.fromEntries(c.parts.filter((p) => p.type === 'IN' || p.type === 'OUT').map((p) => [p.params.name, p.params.w || 1])),
  });
  K.portsOf = portsOf;
  K.isSequential = (c) => c.parts.some((p) => SEQ.has(p.type) || p.type === 'CLOCK' || (S.Parts && S.Parts.registry && S.Parts.registry[p.type] && S.Parts.registry[p.type].kind === 'seq'));
  /** gates (every part that is not a port), and the levels of logic from the inputs to the outputs */
  K.circuitCost = function (c, opts) {
    opts = opts || {};
    const gates = c.parts.filter((p) => !PORT.has(p.type));
    const lvl = new Map();
    const level = (p, seen) => {
      if (PORT.has(p.type) || SEQ.has(p.type)) return 0;
      if (lvl.has(p.id)) return lvl.get(p.id);
      if (seen.has(p.id)) return 0;
      seen.add(p.id);
      let m = 0;
      for (const q of p.pins) if (q.dir === 'in' && p.net[q.name]) { const drv = p.net[q.name].pins.find((r) => (r.part.pins.find((x) => x.name === r.pin) || {}).dir === 'out'); if (drv) m = Math.max(m, level(drv.part, seen)); }
      const v = m + (opts.notFree && (p.type === 'NOT' || p.type === 'BUF') ? 0 : 1);
      lvl.set(p.id, v);
      return v;
    };
    let levels = 0;
    for (const p of c.parts) if (p.type === 'OUT' && p.net.a) { const drv = p.net.a.pins.find((r) => (r.part.pins.find((x) => x.name === r.pin) || {}).dir === 'out'); if (drv) levels = Math.max(levels, level(drv.part, new Set())); }
    return { gates: gates.length, levels, types: [...new Set(gates.map((p) => p.type))] };
  };

  // ---- simulating ------------------------------------------------------------------------------------------------
  const show = (v) => (Array.isArray(v) ? v.slice().reverse().join('') : String(v));
  const same = (a, b) => show(a) === show(b);
  /** a zero-time view of a circuit: set inputs, read outputs, clock it; on Sirkit.Sim */
  K.bench = function (c) {
    const sim = S.Sim.create(c, { tech: 'CMOS', powerUp: 0, log: false, meta: 'off' });
    return {
      sim,
      set(env) { for (const [k, v] of Object.entries(env)) sim.set(k, v); sim.settle(); },
      get(name) { const v = sim.get(name); return Array.isArray(v) ? (v.every((b) => b === 0 || b === 1) ? v.reduce((a, b, i) => a + (b << i), 0) : show(v)) : v; },
      clock() { sim.clockEdge(); },
    };
  };
  const envOf = (names, widths, m) => {
    const env = {};
    let shift = names.reduce((a, n) => a + (widths[n] || 1), 0);
    for (const n of names) { const w = widths[n] || 1; shift -= w; env[n] = (m >> shift) & ((1 << w) - 1); }
    return env;
  };
  const envText = (env) => Object.entries(env).map(([k, v]) => k + ' = ' + v).join(', ');
  K.envText = envText;
  /** a deterministic generator for long input sequences */
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  /**
   * The reference as something to evaluate. x.ref: an expression or {F: expr}; x.fn: {vars, ones, dc} (with
   * don't-cares) or x.minterms/x.dc with x.vars; x.refCircuit: any circuit form; x.machine: a state machine.
   */
  K.reference = function (x) {
    const B = S.Bool;
    if (x.refCircuit) { const c = K.circuitOf(x.refCircuit, { outputs: x.outputs }); return { kind: 'circuit', circuit: c, ports: portsOf(c), seq: K.isSequential(c) }; }
    if (x.machine) { const m = K.machineOf(x.machine); return { kind: 'machine', machine: m, ports: { inputs: m.inputs, outputs: m.outputs, widths: {} }, seq: true }; }
    let outs = {};
    if (x.minterms || x.fn) {
      const fn = x.fn ? B.asFn(x.fn) : B.fromMinterms(x.vars, x.minterms, x.dc || []);
      outs[(x.outputs || ['F'])[0]] = { fn };
      const vars = fn.vars;
      return { kind: 'fn', outs, ports: { inputs: x.inputs || vars, outputs: Object.keys(outs), widths: {} }, seq: false };
    }
    const r = x.ref;
    if (typeof r === 'string') { const m = /^\s*([A-Za-z]\w*)\s*=\s*(.*)$/.exec(r); outs[m ? m[1] : (x.outputs || ['F'])[0]] = { e: B.parse(m ? m[2] : r) }; }
    else for (const [k, e] of Object.entries(r || {})) outs[k] = { e: B.parse(e) };
    if (!Object.keys(outs).length) throw new Error('the exercise has no reference (ref, fn, minterms, refCircuit or machine)');
    const vars = x.inputs || [...new Set(Object.values(outs).flatMap((o) => [...B.vars(o.e)]))].sort();
    return { kind: 'expr', outs, ports: { inputs: vars, outputs: Object.keys(outs), widths: {} }, seq: false };
  };
  /** a state machine from text (Fsm.parse), a create() spec, or a machine */
  K.machineOf = (m) => (typeof m === 'string' ? S.Fsm.parse(m) : m.next ? m : S.Fsm.create(m));
  const refValue = (R, name, env) => {
    const o = R.outs[name];
    if (o.e) return S.Bool.evaluate(o.e, env);
    const vs = o.fn.vars, n = vs.length;
    const m = vs.reduce((a, v, i) => a | ((env[v] & 1) << (n - 1 - i)), 0);
    return o.fn.dc.has(m) ? '-' : o.fn.ones.has(m) ? 1 : 0;
  };

  /**
   * Compare a circuit with the reference. Combinational: every input row. Sequential: from all flip-flops at 0,
   * every input sequence up to x.depth clocks (or seeded random ones when there are too many), the outputs
   * compared before each clock edge. -> {ok, rows, detail: {inputs, want, got, step, sequence}} | {ok: false, message}
   */
  K.compareCircuits = function (got, R, x) {
    const ports = R.ports;
    const gp = portsOf(got);
    const missIn = ports.inputs.filter((n) => !gp.inputs.includes(n)), missOut = ports.outputs.filter((n) => !gp.outputs.includes(n));
    if (missIn.length || missOut.length) return { ok: false, message: 'The circuit needs ' + (missIn.length ? 'the input' + (missIn.length > 1 ? 's ' : ' ') + missIn.join(', ') : '') + (missIn.length && missOut.length ? ' and ' : '') + (missOut.length ? 'the output' + (missOut.length > 1 ? 's ' : ' ') + missOut.join(', ') : '') + '.' };
    const extra = gp.inputs.filter((n) => !ports.inputs.includes(n));
    if (extra.length && !x.extraInputs) return { ok: false, message: 'The circuit has the input' + (extra.length > 1 ? 's ' : ' ') + extra.join(', ') + ', which ' + (extra.length > 1 ? 'are' : 'is') + ' not part of this exercise; use only ' + ports.inputs.join(', ') + '.' };
    let A, Rb = null;
    try { A = K.bench(got); } catch (e) { return { ok: false, message: 'The circuit cannot be simulated: ' + e.message + '.' }; }
    if (R.kind === 'circuit') Rb = K.bench(R.circuit);
    const widths = Object.assign({}, R.ports.widths, gp.widths);
    const nbits = ports.inputs.reduce((a, n) => a + (widths[n] || 1), 0);
    const readRef = (env, step) => {
      const want = {};
      for (const o of ports.outputs) want[o] = R.kind === 'circuit' ? Rb.get(o) : refValue(R, o, env);
      return want;
    };
    const diff = (want, have) => ports.outputs.find((o) => want[o] !== '-' && !same(want[o], have[o]));
    if (!R.seq) {
      for (let m = 0; m < 1 << nbits; m++) {
        const env = envOf(ports.inputs, widths, m);
        A.set(env); if (Rb) Rb.set(env);
        const want = readRef(env), have = {};
        for (const o of ports.outputs) have[o] = A.get(o);
        const bad = diff(want, have);
        if (bad) return { ok: false, message: 'At ' + envText(env) + ' the output ' + bad + ' should be ' + show(want[bad]) + ', but your circuit gives ' + show(have[bad]) + (have[bad] === 'X' ? ' (unknown: is an input of a gate left unconnected?)' : have[bad] === 'Z' ? ' (nothing drives it)' : '') + '.', detail: { inputs: env, want, got: have } };
      }
      return { ok: true, rows: 1 << nbits };
    }
    // sequential: per clock
    const depth = x.depth || Math.max(2, Math.min(8, Math.floor(10 / Math.max(1, nbits))));
    const seqs = [];
    const total = Math.pow(2, nbits * depth);
    if (total <= (x.maxSequences || 512)) for (let k = 0; k < total; k++) { const s = []; for (let i = 0; i < depth; i++) s.push(Math.floor(k / Math.pow(2, nbits * (depth - 1 - i))) % (1 << nbits)); seqs.push(s); }
    else { const r = rng(x.seed || 7); for (let k = 0; k < (x.maxSequences || 256); k++) { const s = []; for (let i = 0; i < (x.depth || 12); i++) s.push(Math.floor(r() * (1 << nbits))); seqs.push(s); } }
    for (const s of x.sequences || []) seqs.unshift(s.map((st) => (typeof st === 'number' ? st : ports.inputs.reduce((a, n) => (a << (widths[n] || 1)) | (st[n] || 0), 0))));
    const M = R.kind === 'machine' ? R.machine : null;
    let worst = null;
    for (const s of seqs) {
      let a, b;
      try { a = K.bench(got); } catch (e) { return { ok: false, message: 'The circuit cannot be simulated: ' + e.message + '.' }; }
      if (Rb) b = K.bench(R.circuit);
      let state = M ? M.start : null;
      const done = [];
      for (let i = 0; i < s.length; i++) {
        const env = envOf(ports.inputs, widths, s[i]);
        done.push(env);
        a.set(env); if (b) b.set(env);
        const want = {}, have = {};
        if (M) {
          const sym = M.inputs.map((n) => env[n]).join('');
          const z = M.type === 'moore' ? M.out[state] : (M.out[state] || {})[sym];
          M.outputs.forEach((o, k) => { want[o] = z == null || z[k] === '-' ? '-' : +z[k]; });
          state = M.next[state] ? M.next[state][sym] : null;
          if (state == null) state = M.start;
        } else for (const o of ports.outputs) want[o] = b.get(o);
        for (const o of ports.outputs) have[o] = a.get(o);
        const bad = diff(want, have);
        if (bad) {
          // keep the failure that comes after the fewest clock edges
          if (!worst || i < worst.detail.step) {
            const seqText = done.map((e, j) => 'clock ' + (j + 1) + ': ' + envText(e)).join('; ');
            worst = { ok: false, message: (i ? 'After ' + plural(i, 'clock edge') + ' with the inputs ' + done.slice(0, i).map(envText).join(', then ') + ', and now ' : 'From the start (flip-flops at 0), with ') + envText(env) + ', the output ' + bad + ' should be ' + show(want[bad]) + ', but your circuit gives ' + show(have[bad]) + '.', detail: { inputs: env, want, got: have, step: i, sequence: done, say: seqText } };
          }
          break;
        }
        a.clock(); if (b) b.clock();
      }
      if (worst && worst.detail.step === 0) break;
    }
    if (worst) return worst;
    return { ok: true, sequences: seqs.length, depth };
  };

  // ---- the circuit kind ------------------------------------------------------------------------------------------
  K.kinds.circuit = {
    check(x, a) {
      if (K.blank(a) || (a && a.parts && !a.parts.length)) return { ok: false, message: 'Build the circuit first.' };
      let c;
      try { c = K.circuitOf(a, { outputs: x.outputs }); } catch (e) { return { ok: false, message: 'The circuit cannot be read: ' + e.message + '.' }; }
      const prob = c.parts.filter((p) => !PORT.has(p.type)).flatMap((p) => p.pins.filter((q) => q.dir === 'in' && !p.net[q.name] && !q.clock && !p.open.has(q.name)).map((q) => p.id + '.' + q.name));
      if (prob.length && !x.openInputs) return { ok: false, message: 'Every gate input must be connected: ' + prob.slice(0, 3).join(', ') + (prob.length > 3 ? ' and ' + (prob.length - 3) + ' more are' : prob.length > 1 ? ' are' : ' is') + ' not.' };
      const cost = K.circuitCost(c, { notFree: x.notFree });
      if (x.parts) {
        const allowed = new Set(x.parts.map((t) => t.toUpperCase()));
        const bad = cost.types.filter((t) => !allowed.has(t));
        if (bad.length) return { ok: false, message: 'This exercise allows only ' + x.parts.join(', ') + ' parts; your circuit uses ' + bad.join(', ') + '.' };
      }
      if (x.maxInputs) {
        // at most so many inputs to a gate: a number for every gate type, or {XOR: 2, AND: 3}
        const lim = (t) => (typeof x.maxInputs === 'number' ? x.maxInputs : x.maxInputs[t] !== undefined ? x.maxInputs[t] : x.maxInputs['*']);
        for (const p of c.parts) {
          if (!S.Netlist.GATES.has(p.type) || p.type === 'NOT' || p.type === 'BUF') continue;
          const n = p.pins.filter((q) => q.dir === 'in').length, m = lim(p.type);
          if (m && n > m) return { ok: false, message: 'The gate ' + p.id.replace(/^p_/, '') + ' is ' + (/^(8|11|18)/.test(String(n)) ? 'an ' : 'a ') + n + '-input ' + p.type + '; this exercise allows gates of at most ' + m + ' inputs' + (typeof x.maxInputs === 'number' ? '' : ' for ' + p.type) + '.' };
        }
      }
      if (x.maxFanout) {
        // each gate output or input port may drive at most so many gate inputs (output ports do not load it)
        const load = new Map();
        for (const p of c.parts) if (!PORT.has(p.type)) for (const q of p.pins) if (q.dir === 'in' && p.net[q.name] != null) load.set(p.net[q.name], (load.get(p.net[q.name]) || 0) + 1);
        for (const p of c.parts) {
          if (p.type === 'OUT') continue;
          for (const q of p.pins) {
            const n = q.dir === 'out' && p.net[q.name] != null ? load.get(p.net[q.name]) || 0 : 0;
            if (n > x.maxFanout) return { ok: false, message: (PORT.has(p.type) ? 'The input ' + p.params.name : 'The output of ' + p.id.replace(/^p_/, '')) + ' drives ' + n + ' gate inputs; this exercise allows a fan-out of at most ' + x.maxFanout + '. Share the load through another gate.' };
          }
        }
      }
      let R;
      try { R = K.reference(x); } catch (e) { return { ok: false, message: 'The exercise cannot be checked: ' + e.message + '.' }; }
      if (x.steps && R.kind === 'circuit') {
        // a circuit with feedback and no clock: both are taken through the input settings in order, from the start
        const gp = portsOf(c);
        if (R.ports.inputs.every((n) => gp.inputs.includes(n)) && R.ports.outputs.every((n) => gp.outputs.includes(n))) {
          let a, b;
          try { a = K.bench(c); b = K.bench(R.circuit); } catch (e) { return { ok: false, message: 'The circuit cannot be simulated: ' + e.message + '.' }; }
          for (let i = 0; i < x.steps.length; i++) {
            a.set(x.steps[i]); b.set(x.steps[i]);
            const bad = R.ports.outputs.find((o) => !same(b.get(o), a.get(o)));
            if (bad) return { ok: false, message: 'Not quite: with the inputs ' + x.steps.slice(0, i + 1).map(envText).join(', then ') + ', the output ' + bad + ' should be ' + show(b.get(bad)) + ', but your circuit gives ' + show(a.get(bad)) + '.', detail: { circuit: c } };
          }
        }
      }
      const r = K.compareCircuits(c, R, x);
      if (!r.ok) return { ok: false, message: 'Not quite: ' + r.message.replace(/^./, (ch) => ch.toLowerCase()), detail: Object.assign({ circuit: c }, r.detail || {}) };
      if (x.maxGates && cost.gates > x.maxGates) return { ok: false, message: 'It works, with ' + plural(cost.gates, 'gate') + '; this exercise asks for at most ' + x.maxGates + '.' };
      if (x.maxLevels && cost.levels > x.maxLevels) return { ok: false, message: 'It works, but the longest path passes through ' + plural(cost.levels, 'gate') + '; this exercise allows ' + plural(x.maxLevels, 'level') + (x.notFree ? ' (inverters not counted)' : '') + '.' };
      return { ok: true, message: 'Right: it ' + (R.seq ? 'matches the reference on ' + plural(r.sequences, 'input sequence') + ' of ' + r.depth + ' clocks' : x.steps && R.kind === 'circuit' ? 'follows the reference through ' + plural(x.steps.length, 'input setting') + ' in order' : 'agrees with the function on all ' + plural(r.rows, 'input row')) + ', with ' + plural(cost.gates, 'gate') + ' in ' + plural(cost.levels, 'level') + '.' + (x.why ? ' ' + x.why : '') };
    },
  };

  // ---- timing: numbers read off a circuit by static timing analysis ------------------------------------------------
  /** the value an exercise asks for: critical (ns), tmin (ns), fmax (MHz), slack (ns at x.period), arrival (ns at x.net) */
  K.timingAnswer = function (x) {
    const c = K.circuitOf(x.circuit);
    const r = S.Sim.sta(c, { tech: x.tech || 'CMOS' });
    const ask = x.ask || 'critical';
    const v = ask === 'critical' ? (r.critical ? r.critical.delay : r.comb) : ask === 'tmin' ? r.tmin : ask === 'fmax' ? r.fmax : ask === 'slack' ? Math.round((x.period - r.tmin) * 1000) / 1000 : ask === 'arrival' ? r.arrival(x.net) : null;
    if (v == null) throw new Error('the circuit has no ' + ask + ' to ask for');
    return { value: v, sta: r };
  };
  const UNIT = { critical: 'ns', tmin: 'ns', fmax: 'MHz', slack: 'ns', arrival: 'ns' };
  K.kinds.timing = {
    check(x, a) {
      if (K.blank(a)) return { ok: false, message: 'Type a number first.' };
      const v = typeof a === 'number' ? a : Number(String(a).trim().replace(/\s*(ns|mhz|ghz)$/i, '').replace(/,/g, ''));
      if (!Number.isFinite(v)) return { ok: false, message: String(a).trim() + ' is not a number.' };
      const { value, sta } = K.timingAnswer(x);
      const tol = x.tolerance != null ? x.tolerance : Math.max(0.05, Math.abs(value) * 0.01);
      const unit = UNIT[x.ask || 'critical'];
      if (Math.abs(v - value) <= tol) return { ok: true, message: 'Right: ' + value + ' ' + unit + '.' + (sta.critical && sta.critical.steps ? ' The critical path: ' + sta.critical.steps.map((s, i) => (i ? s.label : s.net)).join(' → ') + '.' : '') + (x.why ? ' ' + x.why : '') };
      const hint = x.ask === 'fmax' ? (v > value ? 'That is faster than the circuit can go: the clock period must cover clock-to-Q, the slowest path and the setup time.' : 'The circuit can run faster than that.') : v < value ? 'It is more than ' + v + ' ' + unit + ': is every gate on the slowest path counted, each at its slower delay?' : 'It is less than ' + v + ' ' + unit + ': only the slowest path counts, not the sum of every gate.';
      return { ok: false, message: 'Not quite. ' + hint };
    },
  };

  // ---- waveform: the output, slot by slot ----------------------------------------------------------------------------
  /**
   * The expected output levels: x.circuit, x.inputs {A: '0011..'} one character per slot, x.clocked (each slot is
   * a clock cycle, the outputs read before its rising edge), or x.slotNs (each slot lasts so many ns of a timed
   * run with x.tech's delays: the inputs change as it starts, the outputs are read as it ends). -> {name: '0101..'}
   */
  K.waveExpected = function (x) {
    const c = K.circuitOf(x.circuit, { outputs: x.outputs });
    const ports = portsOf(c);
    const outs = x.outputs || ports.outputs;
    const n = Math.max(...Object.values(x.inputs).map((s) => s.length));
    if (x.slotNs) {
      // with real delays: the inputs change at the start of each slot, the outputs are read at its end
      const sim = S.Sim.create(c, { tech: x.tech || 'CMOS', powerUp: 0, log: false, meta: 'off' });
      const at = (i) => Object.fromEntries(Object.entries(x.inputs).map(([k, s]) => [k, +(s[Math.min(i, s.length - 1)])]));
      for (const [k, v] of Object.entries(at(0))) sim.set(k, v);
      sim.settle();
      const t0 = sim.time, want = Object.fromEntries(outs.map((o) => [o, '']));
      for (let i = 0; i < n; i++) {
        sim.stepTo(t0 + i * x.slotNs);
        if (i) { const prev = at(i - 1); for (const [k, v] of Object.entries(at(i))) if (v !== prev[k]) sim.set(k, v); }
        sim.stepTo(t0 + (i + 1) * x.slotNs - 0.001);
        for (const o of outs) want[o] += show(sim.get(o));
      }
      return want;
    }
    const b = K.bench(c), want = Object.fromEntries(outs.map((o) => [o, '']));
    for (let i = 0; i < n; i++) {
      const env = {};
      for (const [k, s] of Object.entries(x.inputs)) env[k] = +(s[Math.min(i, s.length - 1)]);
      b.set(env);
      for (const o of outs) want[o] += show(b.get(o));
      if (x.clocked) b.clock();
    }
    return want;
  };
  K.kinds.waveform = {
    check(x, a) {
      if (!a || typeof a !== 'object') return { ok: false, message: 'Draw the waveform first: click each time slot to set the level.' };
      const want = K.waveExpected(x);
      for (const [o, w] of Object.entries(want)) {
        const g = String(a[o] || '');
        const blanks = [...w].filter((_, i) => !/[01]/.test(g[i] || '')).length;
        if (blanks) return { ok: false, message: o + ' still has ' + plural(blanks, 'slot') + ' with no level set.' };
        const i = [...w].findIndex((v, k) => v !== g[k]);
        if (i >= 0) {
          const env = Object.entries(x.inputs).map(([k, s]) => k + ' = ' + s[Math.min(i, s.length - 1)]).join(', ');
          return { ok: false, message: 'Not quite: in slot ' + (i + 1) + ' (' + env + ')' + (x.clocked ? ', after ' + plural(i, 'clock edge') + ',' : x.slotNs ? ', ' + i * x.slotNs + ' to ' + (i + 1) * x.slotNs + ' ns,' : '') + ' ' + o + ' is ' + w[i] + (x.slotNs ? ' at the end of the slot' : '') + ', not ' + g[i] + '.', detail: { slot: i, output: o } };
        }
      }
      return { ok: true, message: 'Right: every slot of ' + Object.keys(want).join(', ') + ' matches the simulation.' + (x.why ? ' ' + x.why : '') };
    },
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
