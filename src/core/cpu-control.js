// The processor's datapath and its two control units. The datapath: registers PC, AR, IR, AC, DR, SP, the
// flags Z, C, N, a common bus driven by one source at a time (AR, PC, DR, AC, IR, SP or memory at AR), an ALU
// between AC and DR, and the memory. Every instruction is fetched in T0..T2 (AR ← PC; IR ← M[AR], PC ← PC + 1;
// decode, AR ← PC) and executed from T3 by a short list of micro-operations, each cycle written in RTL.
// The hard-wired control unit turns that list into control functions of the timing signals T0..Tn, the
// decoded opcode D0..D15, the mode bits and the flags; the microprogrammed one stores it in a control memory
// (fields F1, F2, F3 of micro-operations, a condition CD, a branch BR and an address AD) with a mapping ROM
// and a sequencer. Both run the same datapath and must agree cycle for cycle.
(function (S) {
  'use strict';
  const C = S.Cpu = S.Cpu || {};
  const hex = (v) => v.toString(16).toUpperCase().padStart(2, '0');

  // ---- micro-operations --------------------------------------------------------------------------------
  // f: the microinstruction field that holds it (two operations of one field never share a cycle)
  C.MICRO = {
    'AR←PC': { f: 'F1', src: 'PC', dst: 'AR', rtl: 'AR ← PC' },
    'IR←M': { f: 'F1', src: 'M', dst: 'IR', rtl: 'IR ← M[AR]' },
    'AR←M': { f: 'F1', src: 'M', dst: 'AR', rtl: 'AR ← M[AR]' },
    'DR←M': { f: 'F1', src: 'M', dst: 'DR', rtl: 'DR ← M[AR]' },
    'M←AC': { f: 'F1', src: 'AC', dst: 'M', rtl: 'M[AR] ← AC' },
    'M←PC': { f: 'F1', src: 'PC', dst: 'M', rtl: 'M[AR] ← PC' },
    'PC←AR': { f: 'F1', src: 'AR', dst: 'PC', rtl: 'PC ← AR' },
    'PC←DR': { f: 'F1', src: 'DR', dst: 'PC', rtl: 'PC ← DR' },
    'PC←M': { f: 'F1', src: 'M', dst: 'PC', rtl: 'PC ← M[AR]' },
    'DR←AR': { f: 'F1', src: 'AR', dst: 'DR', rtl: 'DR ← AR' },
    'AR←SP': { f: 'F1', src: 'SP', dst: 'AR', rtl: 'AR ← SP' },
    'DR←IN': { f: 'F1', src: 'INPR', dst: 'DR', rtl: 'DR ← INPR' },
    'OUTR←AC': { f: 'F1', src: 'AC', dst: 'OUTR', rtl: 'OUTR ← AC' },
    'PC+': { f: 'F2', rtl: 'PC ← PC + 1' },
    'SP-': { f: 'F2', rtl: 'SP ← SP − 1' },
    'SP+': { f: 'F2', rtl: 'SP ← SP + 1' },
    'AC←DR': { f: 'F3', rtl: 'AC ← DR' },
    'ADD': { f: 'F3', rtl: 'AC ← AC + DR' },
    'SUB': { f: 'F3', rtl: 'AC ← AC − DR' },
    'AND': { f: 'F3', rtl: 'AC ← AC ∧ DR' },
    'OR': { f: 'F3', rtl: 'AC ← AC ∨ DR' },
    'NOT': { f: 'F3', rtl: 'AC ← AC′' },
    'SHL': { f: 'F3', rtl: '{C, AC} ← AC << 1' },
    'SHR': { f: 'F3', rtl: '{AC, C} ← AC >> 1' },
    'HLT': { f: 'F3', rtl: 'S ← 0' },
  };
  const FETCH = [['AR←PC'], ['IR←M', 'PC+'], ['AR←PC']];
  C.FETCH = FETCH;

  // ---- what each instruction does from T3 ------------------------------------------------------------------
  const ADDRESS = { dir: [['AR←M', 'PC+']], ind: [['AR←M', 'PC+'], ['AR←M']], imm: [['DR←M', 'PC+']] };
  const cyc = (ops, end) => ({ ops, end: !!end });
  /** the cycles from T3 of an instruction in a mode: [{ ops, end }] or a flag test { flag, t: {...}, f: {...} } */
  function routine(ins, mode) {
    if (!ins) return [cyc(['HLT'], true)];
    const m = ins.m;
    if (ins.kind === 'inherent') {
      if (m === 'RET') return [cyc(['AR←SP']), cyc(['PC←M', 'SP+'], true)];
      if (m === 'IN') return [cyc(['DR←IN']), cyc(['AC←DR'], true)];
      if (m === 'OUT') return [cyc(['OUTR←AC'], true)];
      return [cyc([m === 'HLT' ? 'HLT' : m], true)];
    }
    if (!ins.modes.includes(mode)) return [cyc(['HLT'], true)];
    const a = ADDRESS[mode].map((ops) => cyc(ops));
    const read = mode === 'imm' ? [] : [cyc(['DR←M'])];
    switch (m) {
      case 'LDA': return a.concat(read, [cyc(['AC←DR'], true)]);
      case 'ADD': case 'SUB': case 'AND': case 'OR': return a.concat(read, [cyc([m], true)]);
      case 'STA': return a.concat([cyc(['M←AC'], true)]);
      case 'JMP': return a.concat([cyc(['PC←AR'], true)]);
      case 'JZ': case 'JC': return a.concat([{ flag: m[1], t: cyc(['PC←AR'], true), f: cyc([], true) }]);
      case 'CALL': return a.concat([cyc(['SP-', 'DR←AR']), cyc(['AR←SP']), cyc(['M←PC']), cyc(['PC←DR'], true)]);
    }
    throw new Error('no routine for ' + m);
  }
  C.routine = routine;
  /** every routine, keyed 'LDA.dir', 'NOT', 'ILLEGAL' */
  C.routines = function () {
    const out = {};
    for (const ins of C.ISA) {
      if (ins.kind === 'inherent') out[ins.m] = { ins, mode: null, cycles: routine(ins) };
      else for (const md of ins.modes) out[ins.m + '.' + md] = { ins, mode: md, cycles: routine(ins, md) };
    }
    out.ILLEGAL = { ins: null, mode: null, cycles: routine(null) };
    return out;
  };
  /** the routine key of an instruction byte */
  C.keyOf = function (ir) {
    const d = C.decode(ir);
    if (!d.ins) return 'ILLEGAL';
    if (d.ins.kind === 'inherent') return d.ins.m;
    return d.ins.modes.includes(d.mode) ? d.ins.m + '.' + d.mode : 'ILLEGAL';
  };

  // ---- the datapath ------------------------------------------------------------------------------------
  C.REGS = ['PC', 'AR', 'IR', 'AC', 'DR', 'SP'];
  /** the bus multiplexer's select code for each source (as drawn in datapathCircuit) */
  C.BUS_SEL = { INPR: 0, PC: 1, DR: 2, AC: 3, IR: 4, SP: 5, AR: 6, 'M[AR]': 7 };
  /** a fresh processor state for a program ({ mem, start }) or a memory image */
  C.state = function (prog, input) {
    const mem = (prog.mem || prog).slice();
    return { mem, PC: prog.start || 0, AR: 0, IR: 0, AC: 0, DR: 0, SP: 0, F: { Z: 0, C: 0, N: 0 }, S: 1, input: (input || []).slice(), output: [] };
  };
  /**
   * Do the micro-operations of one cycle on the state, all reading the values from before the clock edge.
   * Returns { bus, changes, memWrite }; throws if two operations drive the bus or write one register.
   */
  C.apply = function (st, ops) {
    const o = { PC: st.PC, AR: st.AR, IR: st.IR, AC: st.AC, DR: st.DR, SP: st.SP, F: Object.assign({}, st.F) };
    const w = {}, flags = {};
    let bus = null, memWrite = null;
    const write = (r, v) => { if (r in w) throw new Error('two operations write ' + r + ' in one cycle'); w[r] = v & 0xff; };
    const zn = (v) => { flags.Z = (v & 0xff) === 0 ? 1 : 0; flags.N = (v >> 7) & 1; };
    for (const name of ops) {
      const u = C.MICRO[name];
      if (!u) throw new Error('unknown micro-operation ' + name);
      if (u.src) {
        const src = u.src === 'M' ? 'M[AR]' : u.src;
        if (bus && bus.src !== src) throw new Error('two sources on the bus: ' + bus.src + ' and ' + src);
        const v = bus ? bus.value : u.src === 'M' ? st.mem[o.AR] : u.src === 'INPR' ? (st.input.length ? st.input.shift() & 0xff : 0) : o[u.src];
        bus = { src, sel: C.BUS_SEL[src], value: v };
        if (u.dst === 'M') { if (memWrite) throw new Error('two memory writes in one cycle'); memWrite = { addr: o.AR, from: st.mem[o.AR], to: v }; } else if (u.dst === 'OUTR') { st.output.push(v); st.OUTR = v; } else write(u.dst, v);
        continue;
      }
      switch (name) {
        case 'PC+': write('PC', o.PC + 1); break;
        case 'SP-': write('SP', o.SP - 1); break;
        case 'SP+': write('SP', o.SP + 1); break;
        case 'AC←DR': write('AC', o.DR); zn(o.DR); break;
        case 'ADD': { const r = o.AC + o.DR; write('AC', r); zn(r); flags.C = r > 255 ? 1 : 0; break; }
        case 'SUB': { const r = o.AC - o.DR; write('AC', r); zn(r & 0xff); flags.C = o.AC >= o.DR ? 1 : 0; break; }
        case 'AND': write('AC', o.AC & o.DR); zn(o.AC & o.DR); break;
        case 'OR': write('AC', o.AC | o.DR); zn(o.AC | o.DR); break;
        case 'NOT': write('AC', ~o.AC); zn(~o.AC & 0xff); break;
        case 'SHL': write('AC', o.AC << 1); zn((o.AC << 1) & 0xff); flags.C = (o.AC >> 7) & 1; break;
        case 'SHR': write('AC', o.AC >> 1); zn(o.AC >> 1); flags.C = o.AC & 1; break;
        case 'HLT': st.S = 0; break;
      }
    }
    const changes = [];
    for (const [r, v] of Object.entries(w)) { if (st[r] !== v) changes.push({ reg: r, from: st[r], to: v }); st[r] = v; }
    for (const [f, v] of Object.entries(flags)) { if (st.F[f] !== v) changes.push({ reg: f, from: st.F[f], to: v }); st.F[f] = v; }
    if (memWrite) { st.mem[memWrite.addr] = memWrite.to; changes.push({ reg: 'M[' + hex(memWrite.addr) + ']', from: memWrite.from, to: memWrite.to }); }
    return { bus, changes, memWrite };
  };

  // ---- the hard-wired control unit --------------------------------------------------------------------
  const MODE_SIG = { dir: "I′M′", ind: 'I', imm: 'M' };
  /**
   * The control functions: rows { T, op, sub, modes, flag, value, ops, end, cond, rtl }. cond is the product
   * of signals that enables the row: Tk, the decoded opcode Dk (with IR0 for IN and OUT), the mode bits
   * (I = IR0 indirect, M = IR1 immediate), and a flag.
   */
  C.hardwired = function () {
    const rows = [];
    FETCH.forEach((ops, t) => rows.push({ T: t, ops, end: false, cond: 'T' + t, rtl: ops.map((u) => C.MICRO[u].rtl).join(', ') + (t === 2 ? ' (decode IR)' : '') }));
    const R = C.routines();
    const groups = new Map();
    for (const [key, r] of Object.entries(R)) {
      const t0 = 3;
      r.cycles.forEach((c, k) => {
        const parts = c.flag ? [[c.flag, 1, c.t], [c.flag, 0, c.f]] : [[null, null, c]];
        for (const [flag, value, cc] of parts) {
          const g = (r.ins ? r.ins.m : 'ILLEGAL') + '|' + (t0 + k) + '|' + flag + value + '|' + cc.ops.join(',') + '|' + cc.end;
          if (!groups.has(g)) groups.set(g, { T: t0 + k, ins: r.ins, op: r.ins ? r.ins.op : null, sub: r.ins ? r.ins.sub : null, modes: [], flag, value, ops: cc.ops, end: cc.end, illegal: !r.ins });
          if (r.mode) groups.get(g).modes.push(r.mode);
        }
      });
    }
    for (const g of groups.values()) {
      const all = g.ins && g.ins.modes;
      if (!all || g.modes.length === all.length) g.modes = null;
      const terms = ['T' + g.T];
      if (g.illegal) terms.push('ILL'); else {
        terms.push('D' + g.op.toString(16).toUpperCase());
        if (g.sub != null) terms.push(g.sub ? 'IR0' : 'IR0′');
      }
      if (g.modes) terms.push(g.modes.length === 1 ? MODE_SIG[g.modes[0]] : '(' + g.modes.map((m) => MODE_SIG[m]).join(' + ') + ')');
      if (g.flag) terms.push(g.flag + (g.value ? '' : '′'));
      g.cond = terms.join('·');
      g.rtl = (g.ops.map((u) => C.MICRO[u].rtl).concat(g.end ? ['SC ← 0'] : [])).join(', ') || '(nothing)';
      rows.push(g);
    }
    return rows;
  };
  /** the rows active in a cycle */
  const activeRows = (rows, st, T) => {
    const key = C.keyOf(st.IR), d = C.decode(st.IR);
    return rows.filter((r) => {
      if (r.T !== T) return false;
      if (T < 3) return true;
      if (r.illegal) return key === 'ILLEGAL';
      if (key === 'ILLEGAL' || r.op !== d.op) return false;
      if (r.sub != null && r.sub !== (st.IR & 1)) return false;
      if (r.modes && !r.modes.includes(d.mode)) return false;
      if (r.flag && st.F[r.flag] !== r.value) return false;
      return true;
    });
  };
  /** the timing table: per instruction, the RTL of each of its cycles T0..Tn */
  C.timing = function () {
    const out = [];
    for (const [key, r] of Object.entries(C.routines())) {
      const steps = FETCH.map((ops, t) => ({ T: t, rtl: ops.map((u) => C.MICRO[u].rtl).join(', ') }));
      r.cycles.forEach((c, k) => {
        const txt = (cc) => cc.ops.map((u) => C.MICRO[u].rtl).concat(cc.end ? ['SC ← 0'] : []).join(', ') || 'SC ← 0';
        steps.push({ T: 3 + k, rtl: c.flag ? c.flag + ' = 1: ' + txt(c.t) + '; ' + c.flag + ' = 0: ' + txt(c.f) : txt(c) });
      });
      out.push({ key, steps });
    }
    return out;
  };

  // ---- the microprogrammed control unit -----------------------------------------------------------------
  /**
   * The control memory: words { addr, ops, cd, br, ad, label }, the mapping ROM (opcode and the two low bits
   * of IR → routine address), and the field codes. Format: F1 F2 F3 CD BR AD.
   */
  C.microprogram = function () {
    const words = [];
    const word = (o) => { const w = Object.assign({ addr: words.length, ops: [], cd: 'U', br: 'JMP', ad: 0, label: '' }, o); words.push(w); return w; };
    word({ ops: FETCH[0], ad: 1, label: 'FETCH' });
    word({ ops: FETCH[1], ad: 2 });
    word({ ops: FETCH[2], br: 'MAP', label: 'DECODE' });
    const R = C.routines(), start = {};
    for (const [key, r] of Object.entries(R)) {
      start[key] = words.length;
      r.cycles.forEach((c, k) => {
        if (c.flag) {
          const prev = words[words.length - 1];
          if (k === 0) throw new Error('a flag test cannot be the first cycle of ' + key);
          if (!c.t.end || !c.f.end) throw new Error('a flag test must end the routine of ' + key);
          prev.cd = c.flag; prev.br = 'JMP';
          const f = word({ ops: c.f.ops, ad: 0, label: key + '.' + c.flag + '0' });
          word({ ops: c.t.ops, ad: 0, label: key + '.' + c.flag + '1' });
          prev.ad = f.addr + 1;
        } else {
          const w = word({ ops: c.ops, label: k === 0 ? key : '' });
          w.ad = c.end ? 0 : w.addr + 1;
        }
      });
    }
    // the mapping ROM, indexed by the opcode and IR1 IR0
    const map = new Array(64);
    for (let op = 0; op < 16; op++) for (let low = 0; low < 4; low++) map[(op << 2) | low] = start[C.keyOf((op << 4) | low)];
    // field codes: 0 is no operation
    const fields = { F1: [null], F2: [null], F3: [null] };
    for (const [name, u] of Object.entries(C.MICRO)) fields[u.f].push(name);
    const width = (n) => Math.max(1, Math.ceil(Math.log2(n)));
    const fmt = { F1: width(fields.F1.length), F2: width(fields.F2.length), F3: width(fields.F3.length), CD: 2, BR: 1, AD: width(words.length) };
    const CD = ['U', 'Z', 'C', 'N'], BR = ['JMP', 'MAP'];
    for (const w of words) {
      const code = { F1: 0, F2: 0, F3: 0 };
      for (const u of w.ops) { const f = C.MICRO[u].f; if (code[f]) throw new Error('two ' + f + ' operations in word ' + w.addr); code[f] = fields[f].indexOf(u); }
      w.fields = code;
      const b = (v, n) => v.toString(2).padStart(n, '0');
      w.binary = [b(code.F1, fmt.F1), b(code.F2, fmt.F2), b(code.F3, fmt.F3), b(CD.indexOf(w.cd), 2), b(BR.indexOf(w.br), 1), b(w.ad, fmt.AD)].join(' ');
      w.text = (w.ops.map((u) => C.MICRO[u].rtl).join(', ') || 'no operation') + '; ' + (w.br === 'MAP' ? 'CAR ← map(IR)' : w.cd === 'U' ? 'CAR ← ' + w.ad : 'if ' + w.cd + ' then CAR ← ' + w.ad + ' else CAR ← CAR + 1');
    }
    return { words, map, fields, format: fmt, width: Object.values(fmt).reduce((a, b) => a + b, 0), start, say: 'A control memory of ' + words.length + ' words of ' + Object.values(fmt).reduce((a, b) => a + b, 0) + ' bits: F1 (' + fmt.F1 + ' bits, bus transfers), F2 (' + fmt.F2 + ', counters), F3 (' + fmt.F3 + ', the ALU and halt), CD (2: U, Z, C, N), BR (1: JMP or MAP), AD (' + fmt.AD + ').' };
  };

  // ---- the machine -----------------------------------------------------------------------------------
  /**
   * A processor running a program: opts.control 'hardwired' (default) or 'micro'; opts.input bytes for IN.
   * cpu.cycle() does one clock and returns its trace step; cpu.instruction() runs one whole instruction;
   * cpu.run(max) runs until HLT. The state is in cpu.st (plus SC or CAR).
   */
  C.machine = function (prog, opts) {
    opts = opts || {};
    const control = opts.control || 'hardwired';
    const st = C.state(prog, opts.input);
    const rows = control === 'hardwired' ? C.hardwired() : null;
    const mp = control === 'micro' ? C.microprogram() : null;
    let SC = 0, CAR = 0, cycles = 0, insAddr = st.PC;
    const trace = [];
    const cpu = {
      st, control, trace,
      get SC() { return SC; }, get CAR() { return CAR; }, get cycles() { return cycles; },
      cycle() {
        if (!st.S) return null;
        let ops, end, label, info;
        if (control === 'hardwired') {
          const act = activeRows(rows, st, SC);
          if (act.length !== 1) throw new Error('T' + SC + ': ' + act.length + ' control rows are active');
          ops = act[0].ops; end = act[0].end; label = 'T' + SC; info = { T: SC, cond: act[0].cond };
        } else {
          const w = mp.words[CAR];
          ops = w.ops; label = 'CAR ' + CAR; info = { CAR, word: w.binary, T: SC };
          // the sequencer: the next address, from the values before this clock edge
          const cond = w.cd === 'U' ? true : !!st.F[w.cd];
          const next = w.br === 'MAP' ? null : cond ? w.ad : CAR + 1;
          end = w.br === 'JMP' && next === 0;
          info.next = next;
        }
        if (SC === 0) insAddr = st.PC;
        const r = C.apply(st, ops);
        if (control === 'micro') CAR = info.next == null ? mp.map[st.IR >> 4 << 2 | (st.IR & 3)] : info.next;
        const T = SC;
        SC = end || !st.S ? 0 : SC + 1;
        cycles++;
        const rtl = ops.map((u) => C.MICRO[u].rtl).concat(end ? ['SC ← 0'] : []);
        const step = { kind: 'cycle', n: cycles, T, control, label, info, ops: ops.slice(), rtl, bus: r.bus, changes: r.changes, end, regs: cpu.regs(), say: (control === 'micro' ? 'CAR ' + info.CAR + ', ' : '') + 'T' + T + ': ' + (rtl.join(', ') || 'no operation') + (r.bus ? ' (bus select ' + r.bus.sel + ': ' + r.bus.src + ' = ' + hex(r.bus.value) + ')' : '') + (r.changes.length ? '; ' + r.changes.map((c) => c.reg + ' ' + (c.reg.length === 1 ? c.from + ' → ' + c.to : hex(c.from) + ' → ' + hex(c.to))).join(', ') : '') + '.' };
        trace.push(step);
        if (end || !st.S) {
          const d = C.disassemble(st.mem, insAddr, 1, prog.symbols)[0];
          trace.push({ kind: 'instruction', addr: insAddr, text: d.text, say: 'Done: ' + hex(insAddr) + ' ' + d.text + '.' });
        }
        return step;
      },
      instruction() { const out = []; do { const s = cpu.cycle(); if (!s) break; out.push(s); } while (SC !== 0 && st.S); return out; },
      run(max) { max = max || 100000; while (st.S && cycles < max) cpu.cycle(); return { halted: !st.S, cycles, output: st.output.slice() }; },
      regs: () => ({ PC: st.PC, AR: st.AR, IR: st.IR, AC: st.AC, DR: st.DR, SP: st.SP, Z: st.F.Z, C: st.F.C, N: st.F.N }),
    };
    return cpu;
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
