// Sequential and program exercises: the state-machine design flow (each stage checked by Sirkit.Fsm.check),
// Verilog modules run against a hidden testbench, and programs for the small processor run on test inputs.
// Fields of each kind: src/app/check-index.js.
(function (S) {
  'use strict';
  const K = (S.Check = S.Check || {});
  K.kinds = K.kinds || {};
  const plural = (n, w, ws) => n + ' ' + (n === 1 ? w : ws || w + 's');

  // ---- state machines ---------------------------------------------------------------------------------------------
  const STAGES = ['table', 'reduce', 'implication', 'assign', 'transition', 'excitation', 'equations', 'circuit'];
  const STAGE_NAME = { table: 'state table', reduce: 'reduced table', implication: 'implication table', assign: 'state assignment', transition: 'transition table', excitation: 'excitation table', equations: 'equations', circuit: 'circuit' };
  K.fsmStages = STAGES; K.fsmStageName = STAGE_NAME;
  /** classes of states: [['S0', 'S2'], ['S1']] or text {S0, S2}, {S1} */
  K.classesOf = (a) => {
    if (Array.isArray(a)) return a.map((c) => (Array.isArray(c) ? c : String(c).split(/[\s,]+/).filter(Boolean)));
    const v = K.parseValue(a, { topSet: true, dash: false });
    if (v.error) throw new Error(v.error);
    return v.v.items.map((it) => (it.t === 'atom' ? [it.v] : it.items.map((y) => y.v)));
  };
  /** pairs: [['S0', 'S1']] or text (S0, S1), (S2, S3) */
  K.pairsOf = (a) => {
    if (Array.isArray(a)) return a;
    const v = K.parseValue(a, { topSet: true });
    if (v.error) throw new Error(v.error);
    return v.v.items.map((it) => it.items.map((y) => y.v));
  };
  /** codes: {S0: '00'} or text S0 = 00, S1 = 01 */
  K.codesOf = (a) => (typeof a === 'object' ? a : Object.fromEntries(String(a).split(/[\n,;]+/).map((p) => p.split(/[=:]/).map((t) => t.trim())).filter((p) => p[0] && p[1])));
  /** equations: {D1: 'expr'} or lines D1 = expr */
  K.equationsOf = (a) => (typeof a === 'object' ? a : Object.fromEntries(String(a).split('\n').map((l) => /^\s*(\w+)\s*=\s*(.+)$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].trim()])));
  /** a table answer {"state|input|field": text} as the nested form Fsm.check reads: {state: {input: {field: text}}} */
  K.nestRows = (a) => {
    if (!a || typeof a !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(a)) {
      const p = k.split('|');
      if (p.length !== 3) { out[k] = v; continue; }
      ((out[p[0]] = out[p[0]] || {})[p[1]] = out[p[0]][p[1]] || {})[p[2]] = String(v).trim();
    }
    return out;
  };
  /** the design an exercise works through, with the student's own codes when the assignment is theirs */
  K.fsmDesign = function (x, codes) {
    const m = K.machineOf(x.machine);
    const o = Object.assign({ ff: 'D', assign: 'binary' }, x.design || {});
    if (codes) o.assign = codes;
    return S.Fsm.design(m, o);
  };
  function fsmStage(x, stage, a, d) {
    const F = S.Fsm, m = K.machineOf(x.machine);
    const v = (r) => (r.ok ? { ok: true, message: r.say } : { ok: false, message: r.say, detail: { errors: r.errors } });
    if (K.blank(a) || (typeof a === 'object' && !Array.isArray(a) && !Object.keys(a).length)) return { ok: false, message: 'Fill in the ' + STAGE_NAME[stage] + ' first.' };
    switch (stage) {
      case 'table': {
        let got;
        try { got = typeof a === 'string' ? F.parse(a) : a.next ? a : K.tableMachine(m, K.nestRows(a)); } catch (e) { return { ok: false, message: 'The table cannot be read: ' + e.message + '.' }; }
        return v(F.check.table(m, got));
      }
      case 'reduce': { let c; try { c = K.classesOf(a); } catch (e) { return { ok: false, message: e.message }; } return v(F.check.reduced(m, c)); }
      case 'implication': { let p; try { p = K.pairsOf(a); } catch (e) { return { ok: false, message: e.message }; } return v(F.check.implication(m, p)); }
      case 'assign': {
        const codes = K.codesOf(a);
        const r = F.check.assignment(d.machine, codes);
        if (r.ok && x.design && typeof x.design.assign === 'string' && x.stage === 'assign') {
          const want = F.assign(d.machine, x.design.assign).codes;
          const off = d.machine.states.find((s) => want[s] !== codes[s]);
          if (off) return { ok: false, message: 'Every state has its own code, but this exercise asks for the ' + x.design.assign + ' assignment, where ' + off + ' is ' + want[off] + '.' };
        }
        return v(r);
      }
      case 'transition': return v(F.check.transition(d, K.nestRows(a)));
      case 'excitation': {
        const r = F.check.excitationTable(d, K.nestRows(a));
        const n = d.rows.filter((row) => row.nextCode != null).length;
        const given = Object.values(K.nestRows(a)).reduce((k, row) => k + Object.keys(row).length, 0);
        if (r.ok && given < n) return { ok: false, message: plural(n - given, 'row is', 'rows are') + ' still empty.' };
        return v(r);
      }
      case 'equations': {
        const eqs = K.equationsOf(a);
        for (const f of d.functions) {
          if (!eqs[f.name]) return { ok: false, message: 'Write the equation for ' + f.name + '.' };
          const r = F.check.equation(d, f.name, eqs[f.name]);
          if (!r.ok) return { ok: false, message: r.say };
          if (x.minimal && !r.minimal) return { ok: false, message: r.say };
        }
        return { ok: true, message: 'Every equation is right: ' + d.functions.map((f) => f.name).join(', ') + '.' };
      }
      case 'circuit': {
        let c;
        try { c = K.circuitOf(a, { outputs: d.machine.outputs }); } catch (e) { return { ok: false, message: 'The circuit cannot be read: ' + e.message + '.' }; }
        const r = K.compareCircuits(c, { kind: 'machine', machine: d.machine, ports: { inputs: d.machine.inputs, outputs: d.machine.outputs, widths: {} }, seq: true }, x);
        return r.ok ? { ok: true, message: 'The circuit behaves as the state table says on ' + plural(r.sequences, 'input sequence') + '.' } : { ok: false, message: r.message, detail: r.detail };
      }
    }
    return { ok: false, message: 'There is no stage ' + stage + '.' };
  }
  /** a state table typed into the answer grid ({state: {input: {next, out}}}, Moore out per row as input '-') */
  K.tableMachine = (m, rows) => {
    const table = {};
    for (const s of Object.keys(rows)) {
      const r = rows[s];
      if (m.type === 'moore') table[s] = { out: (r['-'] || {}).out, next: Object.fromEntries(Object.entries(r).filter(([k]) => k !== '-').map(([k, e]) => [k, e.next])) };
      else table[s] = Object.fromEntries(Object.entries(r).map(([k, e]) => [k, [e.next, e.out]]));
    }
    return S.Fsm.create({ type: m.type, inputs: m.inputs, outputs: m.outputs, start: m.start, states: Object.keys(rows), table });
  };
  K.kinds.fsm = {
    check(x, a) {
      const stages = x.stages || [x.stage || 'table'];
      const multi = !!x.stages;
      const ans = multi ? a || {} : { [stages[0]]: a };
      let codes = null;
      if (ans.assign) { try { codes = K.codesOf(ans.assign); } catch (e) { codes = null; } }
      let d;
      try { d = K.fsmDesign(x, codes && S.Fsm.check.assignment(K.fsmDesign(x).machine, codes).ok ? codes : null); } catch (e) { return { ok: false, message: 'The design cannot be worked out: ' + e.message + '.' }; }
      for (const st of stages) {
        const r = fsmStage(x, st, ans[st], d);
        if (!r.ok) return Object.assign(r, { message: (multi ? 'Not quite. In the ' + STAGE_NAME[st] + ': ' : 'Not quite. ') + r.message, stage: st });
      }
      return { ok: true, message: 'Right. ' + (multi ? 'Every stage, from the ' + STAGE_NAME[stages[0]] + ' to the ' + STAGE_NAME[stages[stages.length - 1]] + ', is checked.' : fsmStage(x, stages[0], ans[stages[0]], d).message) + (x.why ? ' ' + x.why : '') };
    },
  };

  // ---- Verilog ------------------------------------------------------------------------------------------------------
  /**
   * The student's source with the hidden testbench after it. The testbench prints a line starting FAIL for each
   * case that goes wrong (with the inputs and the values), and nothing else is needed: no FAIL line means a pass.
   */
  K.kinds.verilog = {
    check(x, a) {
      const V = S.Verilog;
      const src = String(a || '');
      if (!src.trim()) return { ok: false, message: 'Write the module first.' };
      const own = V.compile(src, {});
      const at = (e) => 'line ' + e.line + ': ' + e.msg;
      if (own.errors.length) return { ok: false, message: 'Your code does not compile: ' + at(own.errors[0]) + '.', detail: { line: own.errors[0].line } };
      const mods = own.modules instanceof Map ? [...own.modules.values()] : Array.isArray(own.modules) ? own.modules : Object.values(own.modules || {});
      const mod = mods.find((m) => m.name === x.module);
      if (x.module && !mod) return { ok: false, message: 'There is no module called ' + x.module + '; the testbench needs one.' };
      if (x.lint !== false && own.warnings.length) return { ok: false, message: 'It compiles, but ' + at(own.warnings[0]) + '.', detail: { line: own.warnings[0].line } };
      const n = src.split('\n').length;
      const all = src + '\n' + x.testbench;
      const c = V.compile(all, {});
      if (c.errors.length) { const e = c.errors[0]; return { ok: false, message: e.line > n ? 'Your module does not fit the testbench: ' + e.msg + ' (the ports must be ' + (x.ports || 'as the exercise says') + ').' : 'Your code does not compile with the testbench: ' + at(e) + '.' }; }
      let r;
      try { r = V.simulate(V.elaborate(c, { top: x.top || 'tb' }), { until: x.until || 100000 }); } catch (e) { return { ok: false, message: 'The simulation stopped: ' + e.message + '.' }; }
      if (r.errors && r.errors.length) return { ok: false, message: 'The simulation stopped: ' + (r.errors[0].msg || r.errors[0]) + '.' };
      const lines = r.output || [];
      const fail = lines.find((l) => /^\s*FAIL\b/.test(l));
      if (fail) return { ok: false, message: 'The testbench found a case that fails: ' + fail.trim().replace(/^FAIL[:\s]*/, '') + '.', detail: { output: lines } };
      if (x.pass && !lines.some((l) => l.includes(x.pass))) return { ok: false, message: 'The testbench did not finish: it never printed "' + x.pass + '".', detail: { output: lines } };
      if (x.synth) {
        const sy = V.synthesise(src, { top: x.module });
        if (!sy || sy.ok === false) return { ok: false, message: 'It passes the testbench, but it is not synthesisable: ' + ((sy && sy.reasons && sy.reasons[0]) ? (sy.reasons[0].msg || sy.reasons[0]) : 'the synthesiser refused it') + '.' };
      }
      return { ok: true, message: 'Right: it passes every case of the testbench' + (x.synth ? ' and synthesises to gates' : '') + '.' + (x.why ? ' ' + x.why : '') };
    },
  };

  // ---- programs for the processor -----------------------------------------------------------------------------------
  K.kinds.cpu = {
    check(x, a) {
      const Cp = S.Cpu;
      const src = String(a || '');
      if (!src.trim()) return { ok: false, message: 'Write the program first.' };
      const p = Cp.assemble(src);
      if (p.errors.length) return { ok: false, message: 'The program does not assemble: line ' + p.errors[0].line + ': ' + p.errors[0].msg + '.', detail: { line: p.errors[0].line } };
      if (x.maxBytes && p.size > x.maxBytes) return { ok: false, message: 'The program takes ' + p.size + ' bytes; this exercise allows ' + x.maxBytes + '.' };
      const ref = x.ref ? Cp.assemble(x.ref) : null;
      const addr = (k, prog) => (typeof k === 'number' ? k : /^\d+$|^0x/i.test(k) ? Number(k) : prog.symbols[k]);
      const max = x.maxCycles || 20000;
      const tests = x.tests || [{ input: [] }];
      for (let i = 0; i < tests.length; i++) {
        const t = tests[i], label = tests.length > 1 ? 'With the input ' + (t.input && t.input.length ? t.input.join(', ') : 'empty') + ', ' : '';
        const run = (prog) => { const m = Cp.machine(prog, { input: t.input || [] }); const r = m.run(max); return { r, mem: m.st.mem }; };
        let got, want = null;
        try { got = run(p); } catch (e) { return { ok: false, message: label + 'the processor stopped: ' + e.message + '.' }; }
        if (!got.r.halted) return { ok: false, message: label + 'the program does not reach HLT within ' + max + ' clock cycles: is there a loop that never ends?' };
        if (ref) want = run(ref);
        const wantOut = t.output || (want && want.r.output);
        if (wantOut && (x.check || 'output') === 'output') {
          const go = got.r.output;
          const k = wantOut.findIndex((v, j) => go[j] !== v);
          if (k >= 0 || go.length !== wantOut.length) return { ok: false, message: label + (k >= 0 ? 'output ' + (k + 1) + ' should be ' + wantOut[k] + (go[k] === undefined ? ', but the program sent nothing there' : ', not ' + go[k]) : 'the program sent ' + plural(go.length, 'output') + ' (' + go.join(', ') + '), not ' + wantOut.length) + '.', detail: { test: i, output: go } };
        }
        const mem = t.mem || (x.memory && want ? Object.fromEntries(x.memory.map((k) => [k, want.mem[addr(k, ref)]])) : null);
        for (const [k, v] of Object.entries(mem || {})) {
          const ad = addr(isNaN(+k) ? k : +k, p);
          if (ad == null) return { ok: false, message: 'The program has no label ' + k + ', and the check reads memory there.' };
          if (got.mem[ad] !== v) return { ok: false, message: label + 'memory at ' + k + ' should hold ' + v + ' when the program stops, not ' + got.mem[ad] + '.', detail: { test: i } };
        }
      }
      return { ok: true, message: 'Right: the program gives the right result on ' + plural(tests.length, 'test') + ', in ' + p.size + ' bytes.' + (x.why ? ' ' + x.why : '') };
    },
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
