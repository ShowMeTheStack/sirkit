// Part 12, structure and dataflow: a module as a box with pins (and the circuit inside it), gate primitives with
// their delays beside the same gates drawn, continuous assignment with Verilog's width and sign rules worked bit
// by bit, and the four values 0, 1, x and z with the way x and z spread.
(function (S) {
  'use strict';
  const K = S.Kit, P = S.P12;
  const show = P.show;

  // ---------------------------------------------------------------------------------------------------
  // Modules and ports
  // ---------------------------------------------------------------------------------------------------
  const MOD = {
    agree: `module agree(input a, b, c,
             output y);
  // 1 when two or more inputs are 1
  assign y = a&b | b&c | a&c;
endmodule

module tb;
  reg a, b, c;
  wire y;
  agree dut(.a(a), .b(b), .c(c),
            .y(y));
  initial begin
    a = 0; b = 0; c = 0;
    #10 a = 1;
    #10 c = 1;
    #10 a = 0; b = 1;
    #10 $finish;
  end
endmodule`,
    half: `module half(input x, y, output s, co);
  assign s  = x ^ y;  // the sum
  assign co = x & y;  // the carry
endmodule

module tb;
  reg x, y;
  wire s, co;
  half dut(.x(x), .y(y),
           .s(s), .co(co));
  initial begin
    x = 0; y = 0;
    #10 x = 1;
    #10 y = 1;
    #10 x = 0;
    #10 $finish;
  end
endmodule`,
    next: `module next2(input [1:0] d,
             output [1:0] q);
  assign q = d + 1;  // wraps at 3
endmodule

module tb;
  reg [1:0] d;
  wire [1:0] q;
  next2 dut(.d(d), .q(q));
  initial begin
    d = 2'b00;
    #10 d = 2'b01;
    #10 d = 2'b10;
    #10 d = 2'b11;
    #10 $finish;
  end
endmodule`,
  };
  /** the design module (the first one) and the testbench's signals that meet its ports */
  function portsOf(src, name) {
    const c = S.Verilog.compile(src, {});
    const m = c.modules.find((x) => x.name === name);
    const dirs = [];
    for (const it of m ? m.items : []) if (it.k === 'decl' && it.dir) for (const n of it.names) dirs.push({ name: n.name, dir: it.dir, line: n.line, width: it.range ? Math.abs(+String(it.range.msb.v ? it.range.msb.v.a : 0) - +String(it.range.lsb.v ? it.range.lsb.v.a : 0)) + 1 : 1 });
    return dirs;
  }
  S.topic({
    id: 'vl-module', family: 'p12-basics', order: 10, title: 'Modules and ports',
    blurb: 'A module is a box with pins: its header names the ports, each one an input or an output of some width, and its body says what is inside. A testbench is another module that holds one inside it and drives its inputs.',
    inputs: [{ id: 'src', kind: 'program', label: 'Verilog (a module, then a testbench called tb)', def: MOD.agree, check: P.compiles('Verilog') }],
    presets: [
      { label: 'Two of three agree', values: { src: MOD.agree } },
      { label: 'Half adder: two outputs', values: { src: MOD.half } },
      { label: 'A 2-bit bus: add one', values: { src: MOD.next } },
    ],
    run(inp) {
      const src = inp.src;
      const comp = S.Verilog.compile(src, {});
      const design = comp.modules.find((m) => m.name !== 'tb');
      if (!design || !comp.modules.some((m) => m.name === 'tb')) throw new Error('write the design module and a testbench module called tb');
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const hw = K.code.hardware(src, { top: design.name, tb: 'tb' });
      const ports = portsOf(src, design.name);
      const ins = ports.filter((p) => p.dir === 'input').map((p) => p.name), outs = ports.filter((p) => p.dir !== 'input').map((p) => p.name);
      const head = design.line, endL = P.findLine(src, /^\s*endmodule/);
      const body = [];
      for (let n = head + 1; n < endL; n++) if (!/^\s*(\/\/.*)?$/.test(K.code.lines(src)[n - 1])) body.push(n);
      const inst = P.findLine(src, new RegExp('^\\s*' + design.name + '\\s+\\w+\\s*\\('));
      const t1 = Math.max(10, run.time);
      const rows = ins.concat(outs).map((n) => 'tb.' + n);
      const still = (hot, notes, focus, parts) => P.scene({ code: { src, hot, notes }, right: [P.built(hw, { hot: parts || [] }), P.waves({ waves: run.waves, rows, t: 0, t1, w: 380 })], focus });
      const F = new S.Frames(['changes']);
      const portNotes = {};
      for (const p of ports) portNotes[p.line] = (portNotes[p.line] ? portNotes[p.line] + ', ' : '') + p.name + (p.width > 1 ? '[' + (p.width - 1) + ':0]' : '');
      F.add(P.frame(still([head], {}, 'right'), 'The header "module ' + design.name + '(…)" names a box with ' + P.plural(ports.length, 'port') + '. On the right is the circuit a synthesis tool draws from this module: the pins are the input and output flags on its edge, and what the body says sits between them.'));
      const inParts = ins.map((n) => 'in_' + n), outParts = outs.map((n) => 'out_' + n);
      const w = (n) => { const p = ports.find((q) => q.name === n); return p.width > 1 ? n + ' (' + p.width + ' bits)' : n; };
      F.add(P.frame(still([...new Set(ports.filter((p) => p.dir === 'input').map((p) => p.line))], {}, 'right', inParts), 'The inputs: ' + ins.map(w).join(', ') + '. "input" means the outside world drives these wires and the module only reads them. ' + (ports.some((p) => p.width > 1) ? 'A range like [1:0] makes a port a bus of that many wires, bit 1 the most significant.' : 'With no range, each port is one wire.')));
      F.add(P.frame(still([...new Set(ports.filter((p) => p.dir !== 'input').map((p) => p.line))], {}, 'right', outParts), 'The output' + (outs.length > 1 ? 's: ' : ': ') + outs.map(w).join(', ') + '. The module drives ' + (outs.length > 1 ? 'these' : 'this') + ' and whoever holds the module reads ' + (outs.length > 1 ? 'them' : 'it') + '.'));
      const bodySay = (hw.trace || []).filter((x) => x.kind === 'assign' || x.kind === 'seq').map((x) => x.say);
      F.add(P.frame(still(body, {}, 'right', (hw.circuit ? hw.circuit.parts : []).filter((p) => !['IN', 'OUT'].includes(p.type)).map((p) => p.id)), 'The body is what is inside the box. ' + (bodySay.length ? 'Here: ' + bodySay.join('; ') + '.' : '') + ' Nothing outside can see the inside; it meets the module only through the ports.'));
      // the connections as the instance writes them
      const instTxt = inst ? P.stmtText(src, inst) : '';
      const instName = (new RegExp('^' + design.name + '\\s+(\\w+)').exec(instTxt) || [])[1] || 'dut';
      const inner = (/\((.*)\)\s*;/.exec(instTxt) || [])[1] || '';
      const named = [...inner.matchAll(/\.(\w+)\s*\(\s*([^()]*?)\s*\)/g)].map((m) => ({ port: m[1], sig: m[2], txt: '.' + m[1] + '(' + m[2] + ')' }));
      const byName = named.length > 0;
      const pos = byName ? [] : inner.split(',').map((x) => x.trim()).filter(Boolean);
      F.add(P.frame(still(inst ? [inst] : [], {}, 'code'), 'The testbench tb has no ports: it is the whole world. Line ' + inst + ' places a copy of ' + design.name + ' inside it, named ' + instName + ', and joins its ports ' + (byName ? 'by name: ' + named.map((c) => c.txt).join(', ') + '. In ' + named[0].txt + ' the port ' + named[0].port + ' of ' + instName + ' meets the testbench\'s own signal ' + named[0].sig + '.' : 'by position: ' + pos.join(', ') + ' go to ' + ports.map((p) => p.name).join(', ') + ' in the order the header declares them.') + ' Inputs are driven from regs the testbench sets; outputs arrive on wires.'));
      const walk = P.stimFrames({ src, run, ins, outs, hw, t1, ask: outs[0], dut: design.name });
      for (const f of walk) { if (!f.meta) F.count('changes'); F.add(f); }
      const fin = P.scene({ code: { src, hot: [P.findLine(src, '$finish')] }, right: [P.built(hw, { values: hw.values ? hw.values(t1) : undefined }), P.waves({ waves: run.waves, rows, t1, w: 380 })], focus: 'right' });
      F.add(P.frame(fin, 'At ' + P.ns(run.time) + ' $finish ends the simulation. The waveforms are the whole story of the ports: ' + F.counts.changes + ' moments when the testbench changed an input, and the module answering each one at once.', { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'math', title: 'A module', text: ['module name(ports);', '  declarations', '  what is inside', 'endmodule', '', 'name inst(.port(signal), ...);  // an instance'].join('\n') }, P.warnSection(run.warnings)]) };
    },
    counters: [{ id: 'changes', label: 'input changes' }],
    predict: P.predict,
    quiz: [
      { q: 'A module header says module m(input [3:0] d, output z). How many wires come in?', options: ['1', '3', '4', '5'], answer: 2, why: '[3:0] is four bits: d[3], d[2], d[1], d[0].' },
      { q: 'In "half u1(.x(p), .y(q), .s(sum), .co(c));", what does .s(sum) do?', options: ['joins port s of the instance to the signal sum', 'copies sum into s once', 'renames the module', 'declares a new wire s'], answer: 0, why: 'A named connection joins the port on the left to the signal in brackets.' },
      { q: 'Why does a testbench usually have no ports?', options: ['It is the whole world: nothing holds it', 'Ports are not allowed in Verilog-2001', 'It cannot be simulated with ports', 'Its ports are added automatically'], answer: 0, why: 'The testbench is the top of the design; it drives and watches the module inside.' },
      { q: 'Inside a module, an input port is…', options: ['read, never driven', 'driven by the module', 'a register', 'a constant'], answer: 0, why: 'The outside drives inputs; the module reads them.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Gate primitives with delays
  // ---------------------------------------------------------------------------------------------------
  const GATE = (d1, d2, d3, d4, stim) => `module vote(input a, b, c,
            output y);
  wire p, q, r;
  and #${d1} g1(p, a, b);
  and #${d2} g2(q, b, c);
  and #${d3} g3(r, a, c);
  or  #${d4} g4(y, p, q, r);
endmodule

module tb;
  reg a, b, c;
  wire y;
  vote dut(.a(a), .b(b), .c(c),
           .y(y));
  initial begin
${stim}
    #10 $finish;
  end
endmodule`;
  const GSTIM = {
    plain: '    a = 0; b = 0; c = 0;\n    #10 a = 1; b = 1;\n    #10 b = 0;\n    #10 c = 1;',
    glitch: '    a = 1; b = 1; c = 0;\n    #10 b = 0; c = 1;',
  };
  /** the gates of a module drawn as written: each instance a gate named as in the code, each wire a net */
  function gateCircuit(src, name) {
    const comp = S.Verilog.compile(src, {});
    const m = comp.modules.find((x) => x.name === name);
    if (!m) throw new Error('there is no module ' + name);
    const c = new S.Netlist.Circuit(name);
    const drv = {}, sinks = [], gates = [];
    for (const it of m.items) if (it.k === 'decl' && it.dir === 'input') for (const n of it.names) drv[n.name] = c.input(n.name);
    let k = 0;
    for (const it of m.items) {
      if (it.k !== 'gate') continue;
      const T = it.type.toUpperCase();
      if (!S.Netlist.GATES.has(T)) continue;
      const d = it.delay && it.delay[0] && it.delay[0].v ? Number(it.delay[0].v.a) : 0;
      for (const g of it.insts) {
        const id = g.name || 'u' + (++k);
        const args = g.args.map((a) => a.name);
        const part = c.add(T, T === 'NOT' || T === 'BUF' ? {} : { n: args.length - 1 }, id);
        drv[args[0]] = part;
        const pins = part.pins.filter((q) => q.dir === 'in');
        args.slice(1).forEach((a, i) => sinks.push([a, part.pin(pins[i].name)]));
        gates.push({ id, type: it.type, line: g.line || it.line, out: args[0], ins: args.slice(1), delay: d });
      }
    }
    for (const it of m.items) if (it.k === 'decl' && it.dir === 'output') for (const n of it.names) sinks.push([n.name, c.output(n.name)]);
    for (const [n, to] of sinks) { if (!drv[n]) throw new Error(n + ' has no driver'); c.connect(drv[n], to); }
    for (const g of gates) c.name(c.byId.get(g.id), g.out, false);
    return { c, gates };
  }
  S.topic({
    id: 'vl-gates', family: 'p12-basics', order: 20, title: 'Gate primitives and their delays',
    blurb: 'Verilog has the basic gates built in: "and #2 g1(p, a, b);" is an AND gate called g1, output first, that answers 2 ns after an input changes. Written one per line, they are the circuit drawn gate for gate, delays and all.',
    inputs: [{ id: 'src', kind: 'program', label: 'Verilog (module vote, then tb)', def: GATE(2, 2, 2, 3, GSTIM.plain), check: P.compiles('Verilog') }],
    presets: [
      { label: 'Delays 2, 2, 2 and 3', values: { src: GATE(2, 2, 2, 3, GSTIM.plain) } },
      { label: 'A glitch from unequal delays', values: { src: GATE(1, 2, 4, 1, GSTIM.glitch) } },
      { label: 'No delays at all', values: { src: GATE(0, 0, 0, 0, GSTIM.plain) } },
    ],
    counters: [{ id: 'events', label: 'gate events' }],
    run(inp) {
      const src = inp.src;
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const { c, gates } = gateCircuit(src, 'vote');
      const res = K.schem.layout(c);
      const values = (t) => { const v = {}; for (const n of c.nets) if (n.name) v[n.name] = show(K.code.at(run.waves, 'tb.dut.' + n.name, t)); return v; };
      const hw = { res, values };
      const rows = ['a', 'b', 'c', 'p', 'q', 'r', 'y'].map((n) => 'tb.dut.' + n);
      const gateOf = (m) => { const g = /(\w+) gate (\w+) at line/.exec((m.updates[0] || {}).cause || ''); return g ? g[2] : null; };
      const t1 = run.time;
      const stimT = [...new Set(P.moments(run).filter((m) => m.kind === 'stmt' && m.scope === 'tb' && m.updates.length).map((m) => m.t))];
      const yCh = K.code.changes(run.waves, 'tb.dut.y');
      const F = new S.Frames(['events']);
      const askedT = new Set();
      const intro = P.scene({ code: { src, hot: gates.map((g) => g.line) }, right: [P.circuit(res, { title: 'The same gates drawn' }), P.waves({ waves: run.waves, rows, t: 0, t1, w: 360 })], focus: 'right' });
      F.add(P.frame(intro, 'Four lines, four gates: ' + gates.map((g) => g.id + ' (' + g.type + ', ' + g.delay + ' ns)').join(', ') + '. The output comes first in the brackets, then the inputs, and #n is the delay from an input changing to the output following. The wires p, q and r join them, exactly as drawn.'));
      const walk = P.walkFrames({
        src, run, hw, rows, t1, w: 360, watch: ['tb.a', 'tb.b', 'tb.c', 'tb.dut.y'],
        keep: (m) => (m.kind === 'stmt' && m.scope === 'tb' && m.updates.length) || (m.kind === 'assign' && /gate/.test((m.updates[0] || {}).cause || '')),
        hot: (m) => (m && gateOf(m) ? [gateOf(m)] : []),
        ask(m) {
          if (!(m.kind === 'stmt' && m.scope === 'tb' && m.updates.length && stimT.includes(m.t)) || askedT.has(m.t)) return null;
          askedT.add(m.t);
          const next = stimT.find((t) => t > m.t);
          const ys = yCh.filter((q) => q[0] >= m.t && q[0] < (next === undefined ? Infinity : next));
          const last = ys.length ? ys[ys.length - 1][0] - m.t : null;
          const ans = last === null ? 'y does not change' : last + ' ns later';
          const ds = gates.map((g) => g.delay), d4 = gates[gates.length - 1].delay;
          const opts = P.opts(ans, 'y does not change', [Math.max(...ds) + d4, d4, Math.min(...ds) + d4, 0].map((x) => x + ' ns later'));
          return { ask: 'The testbench changes inputs at ' + P.ns(m.t) + '. When does y last change before the next change of inputs?', options: opts, answer: ans, before: 'At ' + P.ns(m.t) + ' the testbench is about to change the inputs (line ' + m.line + ').' };
        },
        say(m) {
          const g = gateOf(m);
          if (!g) return 'Every gate with that input waits its delay before answering.';
          F.count('events');
          const gd = gates.find((x) => x.id === g);
          return gd ? 'That is gate ' + g + ' answering ' + gd.delay + ' ns after its input changed.' : '';
        },
      });
      for (const f of walk.frames) F.add(f);
      const glitch = yCh.filter((q, i) => i > 0 && i + 1 < yCh.length && yCh[i + 1][0] - q[0] < 10 && q[1] !== yCh[i + 1][1] && yCh[i - 1][1] === yCh[i + 1][1]);
      const end = P.scene({ code: { src, hot: [] }, right: [P.circuit(res, { title: 'The same gates drawn', values: values(t1) }), P.waves({ waves: run.waves, rows, t1, w: 360 })], focus: 'right' });
      F.add(P.frame(end, (yCh[0] && yCh[0][1] === 'x' ? 'y started as x: until the first gates answered, nothing had driven it. ' : '') + (glitch.length ? 'Look at y around ' + P.ns(glitch[0][0]) + ': it dipped to ' + glitch[0][1] + ' for ' + (yCh[yCh.indexOf(glitch[0]) + 1][0] - glitch[0][0]) + ' ns although it should have stayed ' + yCh[yCh.indexOf(glitch[0]) - 1][1] + '. One AND gate let go before the slower one took over: a glitch, made by unequal delays and seen only because the delays are in the code. ' : '') + 'Gate primitives describe hardware gate by gate; the delays are for simulation only (a synthesis tool ignores #).', { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'math', title: 'A gate primitive', text: ['and #2 g1(p, a, b);', '  type  delay  name (output, inputs...)', '', 'and or nand nor xor xnor: any number of inputs', 'not buf: one input'].join('\n') }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'In "nor #3 u7(z, a, b);", which is the output?', options: ['z', 'a', 'b', 'u7'], answer: 0, why: 'The output comes first in a gate primitive.' },
      { q: 'An AND gate with #2 sees an input change at 10 ns. When does its output change (if it does)?', options: ['10 ns', '12 ns', '2 ns', '8 ns'], answer: 1, why: 'The delay is counted from the input change.' },
      { q: 'What does a synthesis tool do with "#2" on a gate?', options: ['Ignores it: delays are for simulation', 'Adds two buffers', 'Makes the gate slower', 'Refuses the code'], answer: 0, why: 'Real delays come from the cells and wires chosen, not from #.' },
      { q: 'Why is y x at the start of the run?', options: ['Nothing has driven it until the gates in front of it answer', 'x means 0 at time 0', 'The OR gate is broken', 'The testbench sets it to x'], answer: 0, why: 'Every net starts unknown; a gate output stays x until its delay has passed after its inputs became known.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Continuous assignment: widths and signs
  // ---------------------------------------------------------------------------------------------------
  const WCASES = {
    lost: { label: 'A 4-bit sum loses the carry', op: '+', lw: 4, signed: false },
    kept: { label: 'A 5-bit sum keeps it', op: '+', lw: 5, signed: false },
    cat: { label: '{co, s} catches the carry', op: '+', lw: 5, signed: false, cat: true },
    scmp: { label: 'Signed compare', op: '<', signed: true },
    mcmp: { label: 'Signed with unsigned', op: '<', signed: true, mixed: true },
    shift: { label: '>> and >>> on a signed value', op: 'shift', signed: true },
  };
  const bits4 = (v) => (v & 15).toString(2).padStart(4, '0');
  const sval = (v) => ((v & 15) >= 8 ? (v & 15) - 16 : v & 15);
  const sn = (n) => (n < 0 ? '−' + -n : String(n));
  function wcode(k, a, b) {
    const sg = WCASES[k].signed ? 'signed ' : '';
    const L = ['module tb;'];
    if (k === 'mcmp') L.push('  reg signed [3:0] a;', '  reg        [3:0] b;');
    else if (k === 'shift') L.push('  reg signed [3:0] a;');
    else L.push('  reg ' + sg + '[3:0] a, b;');
    if (k === 'lost') L.push('  wire [3:0] s;', '  assign s = a + b;');
    if (k === 'kept') L.push('  wire [4:0] s;', '  assign s = a + b;');
    if (k === 'cat') L.push('  wire [3:0] s;', '  wire co;', '  assign {co, s} = a + b;');
    if (k === 'scmp' || k === 'mcmp') L.push('  wire lt;', '  assign lt = a < b;');
    if (k === 'shift') L.push('  wire [3:0] l, r;', '  assign l = a >> 1;', '  assign r = a >>> 1;');
    L.push('  initial begin');
    L.push(k === 'shift' ? "    a = 4'b" + bits4(a) + ';' : "    a = 4'b" + bits4(a) + "; b = 4'b" + bits4(b) + ';');
    if (k === 'lost' || k === 'kept') L.push('    #1 $display("s = %b", s);');
    if (k === 'cat') L.push('    #1 $display("co s = %b %b",', '                co, s);');
    if (k === 'scmp' || k === 'mcmp') L.push('    #1 $display("lt = %b", lt);');
    if (k === 'shift') L.push('    #1 $display("l=%b r=%b", l, r);');
    L.push('  end', 'endmodule');
    return L.join('\n');
  }
  /** a row of bit cells, most significant first: bits a string; cls(i) per bit */
  function bitRow(key, x, y, label, bits, cls, value) {
    const items = [{ key: key + ':lb', kind: 'text', x: x + 50, y: y + 18, text: label, anchor: 'end', cls: 'strong', size: 14 }];
    [...bits].forEach((b, i) => items.push({ key: key + ':b' + i, kind: 'cell', x: x + 60 + i * 30, y, w: 26, h: 26, rx: 4, text: b, cls: 'vw-bit ' + (cls ? cls(i, b) : '') + (b === 'x' ? ' x' : b === 'z' ? ' z' : ''), size: 14 }));
    if (value !== undefined) items.push({ key: key + ':v', kind: 'text', x: x + 60 + bits.length * 30 + 10, y: y + 18, text: value, cls: 'vc-note', size: 13, mono: true });
    return items;
  }
  S.topic({
    id: 'vl-assign', family: 'p12-basics', order: 30, title: 'Continuous assignment: widths and signs',
    blurb: '"assign" drives a wire with an expression, always. How many bits the arithmetic uses, and whether numbers are signed, follow fixed rules: the widest operand or target sets the width, and signed arithmetic happens only when every operand is signed. Watch the bits.',
    inputs: [
      { id: 'k', kind: 'choice', label: 'Case', def: 'lost', options: Object.keys(WCASES).map((k) => ({ value: k, label: WCASES[k].label })) },
      { id: 'a', kind: 'number', label: 'a (4 bits)', def: 13, min: 0, max: 15 },
      { id: 'b', kind: 'number', label: 'b (4 bits)', def: 6, min: 0, max: 15 },
    ],
    presets: [
      { label: '13 + 6 in 4 bits', values: { k: 'lost', a: 13, b: 6 } },
      { label: '13 + 6 in 5 bits', values: { k: 'kept', a: 13, b: 6 } },
      { label: '{co, s} = 9 + 9', values: { k: 'cat', a: 9, b: 9 } },
      { label: '−3 < 2, signed', values: { k: 'scmp', a: 13, b: 2 } },
      { label: '−3 < 2 with b unsigned', values: { k: 'mcmp', a: 13, b: 2 } },
      { label: 'Shifting −6', values: { k: 'shift', a: 10, b: 0 } },
    ],
    run(inp) {
      const k = inp.k, C = WCASES[k], a = inp.a, b = inp.b;
      const src = wcode(k, a, b);
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const out = run.output.join(' ').trim();
      const asg = K.code.lines(src).map((l, i) => (/assign/.test(l) ? i + 1 : 0)).filter(Boolean);
      const disp = P.findLine(src, '$display');
      const F = new S.Frames();
      const X = 0;
      const scene = (hot, rows, notes) => P.scene({ code: { src, hot, notes }, right: [(x, y) => { const items = [P.heading('bits:h', x, y, 'The bits')]; rows.forEach((r, i) => items.push(...bitRow('r' + i, x, y + 34 + i * 40, r[0], r[1], r[2], r[3]))); return { items, box: { x, y, w: 60 + 6 * 30 + 140, h: 34 + rows.length * 40 } }; }], focus: 'right' });
      if (C.op === '+') {
        const W = C.lw, sum = a + b, kept = sum % (1 << W);
        const pad = (v) => v.toString(2).padStart(W, '0');
        const ext = (v) => pad(v);
        const extCls = (i) => (i < W - 4 ? 'ext' : '');
        F.add(P.frame(scene(asg, [['a', bits4(a), null, '= ' + a], ['b', bits4(b), null, '= ' + b]], {}), 'a = ' + bits4(a) + ' (' + a + ') and b = ' + bits4(b) + ' (' + b + '), both 4 bits and unsigned. Line ' + asg[0] + ' drives ' + (C.cat ? '{co, s}' : 's') + ' with a + b, and keeps doing so whenever a or b changes.'));
        F.add(P.frame(scene(asg, [['a', ext(a), extCls, ''], ['b', ext(b), extCls, '']], {}), 'First the width. An expression is worked out in the width of its widest part, the target included: a and b have 4 bits, ' + (C.cat ? '{co, s} has 1 + 4 = 5' : 's has ' + W) + ', so the sum is done in ' + W + ' bits.' + (W > 4 ? ' a and b are widened with 0s on the left (they are unsigned).' : ' Nothing is widened.')));
        const full = sum.toString(2).padStart(Math.max(W, sum.toString(2).length), '0');
        const lostBits = full.length - W;
        const q = { ask: 'What does ' + (C.cat ? '{co, s}' : 's') + ' hold?', options: P.opts(pad(kept), pad(sum % 16), sum.toString(2).slice(-W).padStart(W, '1'), pad((a ^ b) % (1 << W))), answer: pad(kept) };
        F.add(P.frame(scene(asg, [['a', ext(a), extCls, ''], ['b', ext(b), extCls, ''], ['a+b', full, (i) => (i < lostBits ? 'cut' : 'res'), '= ' + sum]], {}), a + ' + ' + b + ' = ' + sum + ', which is ' + full + ' in binary' + (lostBits ? ': ' + full.length + ' bits, but the sum has only ' + W + '.' : '.'), { meta: { q } }));
        F.add(P.frame(scene(asg.concat([disp]), [['a', ext(a), extCls, ''], ['b', ext(b), extCls, ''], [C.cat ? 'co s' : 's', pad(kept), () => 'res', '= ' + kept]], { [disp]: out }), (lostBits ? 'The bit on the left falls off: the ' + W + '-bit result is ' + pad(kept) + ' = ' + kept + ', not ' + sum + '. ' : 'All ' + W + ' bits fit: ' + pad(kept) + ' = ' + kept + '. ') + (C.cat ? 'The concatenation {co, s} is one 5-bit target: its top bit co = ' + pad(kept)[0] + ' is the carry and s = ' + pad(kept).slice(1) + '. ' : '') + 'The simulation prints "' + out + '".'));
      } else if (C.op === '<') {
        const sa = sval(a), sb = C.mixed ? b : sval(b);
        const signedCmp = !C.mixed;
        const va = signedCmp ? sa : a, vb = signedCmp ? sb : b;
        const res = va < vb ? 1 : 0;
        F.add(P.frame(scene(asg, [['a', bits4(a), null, signedCmp || true ? '= ' + sn(sa) + ' signed' : ''], ['b', bits4(b), null, C.mixed ? '= ' + b + ' unsigned' : '= ' + sn(sb) + ' signed']], {}), 'a = ' + bits4(a) + (C.mixed ? ', declared signed: ' + sn(sa) + '. b = ' + bits4(b) + ', declared without signed: ' + b + '.' : ' and b = ' + bits4(b) + ', both declared signed: ' + sn(sa) + ' and ' + sn(sb) + '.') + ' Line ' + asg[0] + ' drives lt with a < b.'));
        const q = { ask: 'What is lt?', options: ['0', '1'], answer: String(res) };
        F.add(P.frame(scene(asg, [['a', bits4(a), null, '→ ' + sn(va)], ['b', bits4(b), null, '→ ' + sn(vb)]], {}), signedCmp ? 'Every operand is signed, so the comparison is signed: the left bit counts −8, and a is ' + sn(sa) + '.' : 'One operand is unsigned, so the whole comparison is unsigned: Verilog does not mix. a\'s bits 1101 now read as ' + a + ', not ' + sn(sa) + '.', { meta: { q } }));
        F.add(P.frame(scene(asg.concat([disp]), [['a', bits4(a), null, '→ ' + sn(va)], ['b', bits4(b), null, '→ ' + sn(vb)], ['lt', String(res), () => 'res', sn(va) + ' < ' + sn(vb) + ' is ' + (res ? 'true' : 'false')]], { [disp]: out }), sn(va) + ' < ' + sn(vb) + ' is ' + (res ? 'true' : 'false') + ', so lt = ' + res + '. The simulation prints "' + out + '".' + (C.mixed ? ' Write $signed(b), or declare b signed, to compare as numbers with signs.' : '')));
      } else {
        const l = (a & 15) >> 1, r = ((sval(a) >> 1) & 15);
        F.add(P.frame(scene(asg, [['a', bits4(a), null, '= ' + sn(sval(a)) + ' signed']], {}), 'a = ' + bits4(a) + ', declared signed, so it is ' + sn(sval(a)) + '. Line ' + asg[0] + ' shifts it right with >>, line ' + asg[1] + ' with >>>.'));
        F.add(P.frame(scene(asg.slice(0, 1), [['a', bits4(a), null, ''], ['l', bits4(l), (i) => (i === 0 ? 'ext' : 'res'), '= ' + l]], {}), '>> is a logical shift: every bit moves one place right and a 0 comes in on the left. l = ' + bits4(l) + ' = ' + l + '.', { meta: { q: { ask: 'What will r = a >>> 1 hold?', options: P.opts(bits4(r), bits4(l), bits4((a << 1) & 15)), answer: bits4(r) } } }));
        F.add(P.frame(scene(asg.concat([disp]), [['a', bits4(a), null, ''], ['l', bits4(l), (i) => (i === 0 ? 'ext' : 'res'), '= ' + l], ['r', bits4(r), (i) => (i === 0 ? 'ext' : 'res'), '= ' + sn(sval(r))]], { [disp]: out }), '>>> is an arithmetic shift: on a signed value it copies the sign bit in, so ' + sn(sval(a)) + ' becomes ' + sn(sval(r)) + ', half of it rounded down (r = ' + bits4(r) + '). On an unsigned value >>> would bring in 0 like >>. The simulation prints "' + out + '".'));
      }
      return { frames: F.list, def: P.def([{ kind: 'math', title: 'The rules', text: ['width: the widest operand or target', 'unsigned operands widen with 0s', 'signed operands widen with the sign bit', 'one unsigned operand: all unsigned', 'too many bits: the left ones are dropped'].join('\n') }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'wire [3:0] s = 4\'d12 + 4\'d7; What is s?', options: ['19', '3', '15', '4'], answer: 1, why: '19 = 10011 needs 5 bits; the 4 kept are 0011 = 3.' },
      { q: 'How do you keep the carry of a 4-bit add?', options: ['Make the target 5 bits, or write {co, s} = a + b', 'Use a + b + 1', 'Declare a and b signed', 'Use the === operator'], answer: 0, why: 'The target\'s width takes part in sizing the expression.' },
      { q: 'reg signed [3:0] a = 4\'b1110; reg [3:0] b = 4\'b0001; a < b is…', options: ['1, since −2 < 1', '0, since b is unsigned and 14 < 1 is false', 'x', 'an error'], answer: 1, why: 'One unsigned operand makes the comparison unsigned.' },
      { q: 'For reg signed [3:0] a = 4\'b1000, what is a >>> 2?', options: ['0010', '1110', '1000', '0000'], answer: 1, why: 'The sign bit 1 is copied in twice: −8 / 4 = −2 = 1110.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Four values: 0, 1, x, z
  // ---------------------------------------------------------------------------------------------------
  const FOUR = {
    spread: `module tb;
  reg a, b;
  wire y_and, y_or, y_xor;
  assign y_and = a & b;
  assign y_or  = a | b;
  assign y_xor = a ^ b;
  initial begin
    b = 0;      // a is still x
    #10 b = 1;
    #10 a = 0;
    #10 $finish;
  end
endmodule`,
    bus: `module tb;
  reg d1, e1, d2, e2;
  wire bus;
  // two drivers share one wire
  assign bus = e1 ? d1 : 1'bz;
  assign bus = e2 ? d2 : 1'bz;
  initial begin
    e1 = 0; e2 = 0; d1 = 1; d2 = 0;
    #10 e1 = 1;
    #10 e1 = 0; e2 = 1;
    #10 e1 = 1;   // both drive
    #10 $finish;
  end
endmodule`,
    eq: `module tb;
  reg [1:0] r;    // never set: xx
  initial begin
    if (r == 2'b00) $display("== 0");
    else $display("== not sure");
    if (r === 2'bxx)
      $display("=== sees xx");
    r = 2'b1x;
    $display("r+1 = %b", r + 2'd1);
    $display("r[1] = %b", r[1]);
  end
endmodule`,
  };
  S.topic({
    id: 'vl-4state', family: 'p12-basics', order: 40, title: 'Four values: 0, 1, x and z',
    blurb: 'A Verilog bit is 0, 1, x (unknown) or z (not driven). z appears when nobody drives a wire; x when nobody has set a value yet, or two drivers disagree. x spreads through logic only when the answer really depends on it.',
    inputs: [{ id: 'src', kind: 'program', label: 'Verilog (a testbench called tb)', def: FOUR.spread, check: P.compiles('Verilog') }],
    presets: [
      { label: 'How x spreads through gates', values: { src: FOUR.spread } },
      { label: 'A shared bus: z and fights', values: { src: FOUR.bus } },
      { label: '== and === with x', values: { src: FOUR.eq } },
    ],
    counters: [{ id: 'xs', label: 'x or z seen' }],
    run(inp) {
      const src = inp.src;
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const tops = run.compiled.tops;
      const scope = tops[0];
      const sigs = [...run.waves.keys()].filter((k) => k.split('.').length === 2 && k.startsWith(scope + '.'));
      const F = new S.Frames(['xs']);
      let asked = 0;
      const walk = P.walkFrames({
        src, run, watch: sigs, rows: sigs, console: run.output.length > 0, w: 340,
        keep: (m) => m.kind === 'stmt' || m.kind === 'assign' || m.kind === 'print',
        ask(m) {
          if (asked >= 3) return null;
          if (m.kind === 'assign' && m.updates.length === 1 && show(m.updates[0].to).length === 1) {
            asked++;
            return { ask: 'Line ' + m.line + ' reacts. What value does ' + P.short(m.updates[0].net) + ' get?', options: ['0', '1', 'x', 'z'], answer: show(m.updates[0].to), before: 'At ' + P.ns(m.t) + ' an input of line ' + m.line + ' has changed.' };
          }
          const p = m.prints[0];
          if (p && /[xz]/.test(p.split('=').pop())) {
            asked++;
            const tail = p.split('=').pop(), head = p.slice(0, p.length - tail.length);
            return { ask: 'What does line ' + m.line + ' print?', options: P.opts(p, head + tail.replace(/[xz]/g, '0'), head + tail.replace(/[xz]/g, '1')), answer: p };
          }
          return null;
        },
        say(m) {
          const xs = m.updates.filter((u) => /[xz]/.test(show(u.to)));
          if (xs.length) F.count('xs', xs.length);
          const u = m.updates[0];
          if (!u) return m.prints.length && /==/.test(P.lineText(src, m.line)) ? '' : '';
          const v = show(u.to);
          if (m.kind !== 'assign') return '';
          if (/z/.test(v)) return 'z: no driver is on just now. A wire nobody drives floats.';
          if (/x/.test(v)) return /\?/.test(P.lineText(src, m.line)) ? 'x: two drivers disagree, or a choice depends on an unknown.' : 'x: the answer depends on a bit that is unknown.';
          return '';
        },
      });
      for (const f of walk.frames) F.add(f);
      const last = walk.scene(null, []);
      const endSay = /1'bz/.test(src) ? 'A wire with several drivers takes the value of the one driving; with none it is z, and when two drive different values it is x. That is a tristate bus: only one driver may be on at a time.' : /===/.test(src) ? '== with an x in it gives x, which if treats as false, so neither "equal" nor "not equal" can be trusted. === compares all four values exactly; it is for testbenches, since hardware cannot see x. Arithmetic with any x bit gives all x, while a bit select reads just that bit.' : 'The rule behind all of it: x stays x only when the answer depends on it. 0 & x is 0 and 1 | x is 1 (the x cannot matter), but 1 & x, 0 | x and anything ^ x are x.';
      F.add(P.frame(last, endSay, { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'table', title: 'AND with x and z', colHead: ['&', '0', '1', 'x', 'z'], rows: [['0', '0', '0', '0', '0'], ['1', '0', '1', 'x', 'x'], ['x', '0', 'x', 'x', 'x'], ['z', '0', 'x', 'x', 'x']] }, { kind: 'math', title: 'Two drivers on a wire', text: ['z and v gives v', 'v and v gives v', '0 and 1 gives x'].join('\n') }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'a is x and b is 0. What is a & b?', options: ['0', '1', 'x', 'z'], answer: 0, why: '0 AND anything is 0, so the unknown does not matter.' },
      { q: 'a is x and b is 0. What is a | b?', options: ['0', '1', 'x', 'z'], answer: 2, why: 'The answer is a itself, which is unknown.' },
      { q: 'One driver puts 1 on a wire and another puts z. The wire reads…', options: ['1', 'z', 'x', '0'], answer: 0, why: 'z means "not driving", so the other driver wins.' },
      { q: 'r is 2\'bxx. Which branch does "if (r == 2\'b00) A; else B;" take?', options: ['A', 'B', 'neither', 'both'], answer: 1, why: '== gives x, and if treats anything but 1 as false.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
