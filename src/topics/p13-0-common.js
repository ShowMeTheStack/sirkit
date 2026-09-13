// Part 13 (a small processor), shared helpers: running a program on the machine and keeping every cycle with the
// registers and memory as they were, grouping the cycles into instructions, and the usual scene of the datapath
// with the cycle's transfers lit, an assembly listing and the timing signals.
(function (S) {
  'use strict';
  const P13 = (S.P13 = S.P13 || {});
  const Cpu = () => S.Cpu, CK = () => S.Kit.cpu;
  const hex = (v) => (v & 0xff).toString(16).toUpperCase().padStart(2, '0');
  P13.hex = hex;

  S.family({ id: 'p13-machine', part: 'cpu', order: 10, title: 'The machine', blurb: 'Registers on a common bus, instruction formats and addressing modes, and the assembler that turns source lines into bytes.' });
  S.family({ id: 'p13-control', part: 'cpu', order: 20, title: 'Control', blurb: 'Fetch, decode and execute one micro-operation at a time; the hard-wired control unit and the microprogrammed one, cycle for cycle the same.' });
  S.family({ id: 'p13-programs', part: 'cpu', order: 30, title: 'Programs', blurb: 'Whole programs running, from the assembly line down to the bus transfers.' });

  /**
   * Run a program (source text or an assembled image) and keep the whole story. opts: {control, input, max
   * (cycles), from (stop after this many instructions)}. Returns {prog, cycles: [{...step, before, after, mem,
   * ins}], instrs: [{addr, text, cycles: [indexes], line}], cpu, halted}.
   */
  P13.run = function (src, opts) {
    opts = opts || {};
    const C = Cpu();
    const prog = typeof src === 'string' ? C.assemble(src) : src;
    if (prog.errors && prog.errors.length) throw new Error('line ' + prog.errors[0].line + ': ' + prog.errors[0].msg);
    const cpu = C.machine(prog, { control: opts.control, input: opts.input });
    const cycles = [], instrs = [];
    let cur = null, mem = cpu.st.mem.slice(), before = cpu.regs();
    const lineOf = (addr) => prog.listing.findIndex((l) => l.addr === addr && l.bytes && l.bytes.length);
    while (cpu.st.S && cycles.length < (opts.max || 4000)) {
      if (!cur) { cur = { addr: cpu.st.PC, cycles: [], line: lineOf(cpu.st.PC) }; instrs.push(cur); }
      const step = cpu.cycle();
      if (!step) break;
      const wrote = step.changes.some((c) => c.reg.startsWith('M['));
      if (wrote) mem = cpu.st.mem.slice();
      cycles.push(Object.assign({}, step, { before, after: step.regs, mem, ins: instrs.length - 1, output: cpu.st.output.slice() }));
      cur.cycles.push(cycles.length - 1);
      before = step.regs;
      const done = cpu.trace[cpu.trace.length - 1];
      if (done.kind === 'instruction') { cur.text = done.text; cur = null; if (opts.from && instrs.length >= opts.from) break; }
    }
    return { prog, cycles, instrs, cpu, halted: !cpu.st.S, output: cpu.st.output.slice() };
  };
  /** names for addresses, for the memory column */
  P13.names = (prog) => { const out = {}; for (const [k, v] of Object.entries(prog.symbols || {})) if (!(v in out)) out[v] = k; return out; };
  /** the datapath drawn for one cycle (after its clock edge, with its transfers lit) */
  P13.dp = function (run, i, o) {
    const c = run.cycles[i];
    const changed = c ? c.changes.map((q) => q.reg) : [];
    return CK().datapath(Object.assign({ regs: c ? c.after : run.cpu.regs(), mem: c ? c.mem : run.prog.mem, ops: c ? c.ops : [], bus: c && c.bus ? { src: c.bus.src, value: c.bus.value } : null, changed, names: P13.names(run.prog) }, o || {}));
  };
  /** the datapath at rest, with given registers and memory */
  P13.dpAt = (regs, mem, prog, o) => CK().datapath(Object.assign({ regs, mem, ops: [], names: P13.names(prog) }, o || {}));
  /** a cycle's narration: "T1: IR ← M[AR], PC ← PC + 1. The bus carries M[AR] = 12 (select 7). IR becomes 12, PC 01." */
  P13.say = function (c) {
    const ch = c.changes.map((q) => (q.reg.length === 1 ? q.reg + ' becomes ' + q.to : q.reg + ' becomes ' + hex(q.to)));
    return 'T' + c.T + ': ' + (c.rtl.join(', ') || 'no operation') + '.' + (c.bus ? ' The bus carries ' + c.bus.src + ' = ' + hex(c.bus.value) + ' (select ' + c.bus.sel + ').' : '') + (ch.length ? ' ' + ch.join(', ') + '.' : '');
  };
  /** micro-operations written as the reader types them: AR<-PC, PC+1 */
  P13.readOps = function (text) {
    const MI = Cpu().MICRO;
    const norm = (t) => t.replace(/\s+/g, '').replace(/<-/g, '←').replace(/M\[AR\]/g, 'M').replace(/^PC←PC\+1$|^PC\+1$/, 'PC+').replace(/^SP←SP-1$|^SP-1$/, 'SP-').replace(/^SP←SP\+1$|^SP\+1$/, 'SP+');
    return String(text).split(';').map((cyc) => cyc.split(',').map((t) => norm(t)).filter(Boolean)).filter((c) => c.length).map((ops) => {
      for (const o of ops) if (!MI[o]) throw new Error('"' + o + '" is not a micro-operation (try AR←PC, IR←M, PC+, DR←M, AC←DR, ADD …)');
      return ops;
    });
  };
  /** on a narrow screen, every frame shows just this box (the datapath); what lies outside it is left out */
  P13.narrow = function (frames, box, pad) {
    const p = pad === undefined ? 16 : pad;
    P13.big(frames);
    for (const f of frames) f.narrowView = { x: box.x - p, y: box.y - p, w: box.w + 2 * p, h: box.h + 2 * p };
    return frames;
  };
  /** every frame's headings at full size */
  P13.big = (frames) => { for (const f of frames) CK().big(f.items); return frames; };
  P13.programOptions = () => Object.entries(Cpu().programs).map(([value, p]) => ({ value, label: p.title }));
})(globalThis.Sirkit = globalThis.Sirkit || {});
