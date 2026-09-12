// Part 12, state machines in Verilog: one detector written three ways (two blocks, three blocks, one clocked block
// with a registered output), simulated edge by edge with its state diagram lit; then each style synthesised, drawn
// as the state register between its next-state logic and its output logic, with what each part costs.
(function (S) {
  'use strict';
  const K = S.Kit, P = S.P12;
  const show = P.show;

  const HEAD = `module det(input clk, rst, x,
           output reg z);
  localparam A = 2'd0, B = 2'd1,
             C = 2'd2, D = 2'd3;`;
  const NEXT = `    case (st)
      A: nx = x ? B : A;
      B: nx = x ? C : A;
      C: nx = x ? C : D;
      default: nx = x ? B : A;
    endcase`;
  const STYLE = {
    two: HEAD + `
  reg [1:0] st, nx;
  // 1: the state register
  always @(posedge clk)
    if (rst) st <= A;
    else     st <= nx;
  // 2: next state and output
  always @* begin
    z = (st == D);
${NEXT}
  end
endmodule`,
    three: HEAD + `
  reg [1:0] st, nx;
  // 1: the state register
  always @(posedge clk)
    if (rst) st <= A;
    else     st <= nx;
  // 2: the next state
  always @* begin
${NEXT}
  end
  // 3: the output
  always @*
    z = (st == D);
endmodule`,
    one: HEAD + `
  reg [1:0] st;
  // one clocked block
  always @(posedge clk)
    if (rst) begin
      st <= A; z <= 1'b0;
    end else begin
      z <= (st == C) && !x;
      case (st)
        A: st <= x ? B : A;
        B: st <= x ? C : A;
        C: st <= x ? C : D;
        default: st <= x ? B : A;
      endcase
    end
endmodule`,
  };
  const TB = `

module tb;
  reg clk, rst, x;
  wire z;
  det dut(.clk(clk), .rst(rst),
          .x(x), .z(z));
  always #5 clk = ~clk;
  initial begin
    clk = 0; rst = 1; x = 0;
    #10 rst = 0; x = 1;
    #10 x = 1;
    #10 x = 0;
    #10 x = 1;
    #10 x = 1;
    #10 x = 1;
    #10 x = 0;
    #10 $finish;
  end
endmodule`;
  const NAMES = ['A', 'B', 'C', 'D'];
  const MACHINE = { states: NAMES, start: 'A', trans: [{ from: 'A', to: 'A', label: '0' }, { from: 'A', to: 'B', label: '1' }, { from: 'B', to: 'A', label: '0' }, { from: 'B', to: 'C', label: '1' }, { from: 'C', to: 'C', label: '1' }, { from: 'C', to: 'D', label: '0' }, { from: 'D', to: 'A', label: '0' }, { from: 'D', to: 'B', label: '1' }] };
  let fsmPos = null;
  const diagram = (cur, taken) => (x, y) => {
    if (!fsmPos) fsmPos = K.fsm.draw(MACHINE, { x: 0, y: 0, prefix: 'sd', sub: { D: 'z = 1' } }).pos;
    const d = K.fsm.draw(MACHINE, { x: 0, y: 0, pos: fsmPos, prefix: 'sd', active: cur ? [cur] : [], taken: taken ? [taken] : [], sub: { D: 'z = 1' } });
    const b = d.box, dx = x - b.x, dy = y + 30 - b.y;
    const items = [P.heading('sd:h', x, y, 'The state diagram (detects 110)')];
    for (const it of d.items) {
      const c = Object.assign({}, it);
      for (const k of ['x', 'x1', 'x2', 'lx']) if (typeof c[k] === 'number') c[k] += dx;
      for (const k of ['y', 'y1', 'y2', 'ly']) if (typeof c[k] === 'number') c[k] += dy;
      for (const k of ['from', 'to']) if (c[k] && typeof c[k] === 'object') c[k] = { x: c[k].x + dx, y: c[k].y + dy };
      items.push(c);
    }
    return { items, box: { x, y, w: b.w, h: b.h + 30 } };
  };

  S.topic({
    id: 'vl-fsm', family: 'p12-fsm', order: 10, title: 'Writing a state machine',
    blurb: 'A state machine in Verilog is a state register, clocked, and logic that works out the next state and the output. Two always blocks, three, or one: the same detector of 1, 1, 0 written each way, run edge by edge with its state diagram lit.',
    inputs: [{ id: 'src', kind: 'program', label: 'Verilog (module det, then tb)', def: STYLE.two + TB, check: P.compiles('Verilog') }],
    presets: [
      { label: 'Two blocks', values: { src: STYLE.two + TB } },
      { label: 'Three blocks', values: { src: STYLE.three + TB } },
      { label: 'One clocked block', values: { src: STYLE.one + TB } },
    ],
    counters: [{ id: 'edges', label: 'clock edges' }, { id: 'found', label: '110 found' }],
    run(inp) {
      const src = inp.src;
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const stOf = (t) => { const v = K.code.num(K.code.at(run.waves, 'tb.dut.st', t)); return v === null ? '?' : NAMES[v]; };
      const val = (n, t) => show(K.code.at(run.waves, 'tb.' + n, t));
      const ls = K.code.lines(src);
      const armLine = (q) => ls.findIndex((l, i) => i < P.findLine(src, /^endmodule/) && new RegExp('^\\s*' + (q === 'D' ? 'default' : q) + ':').test(l)) + 1;
      const regLine = P.findLine(src, /always @\(posedge clk\)/), outLine = P.findLine(src, /z\s*<?=\s*\(st/);
      const blocks = ls.map((l, i) => (/always/.test(l) && i < P.findLine(src, /^endmodule/) ? i + 1 : 0)).filter(Boolean);
      const t1 = run.time;
      const rows = ['tb.clk', 'tb.rst', 'tb.x', { name: 'tb.dut.st', label: 'st' }, 'tb.z'];
      const pic = (t, cur, taken, hot, notes, focus) => P.scene({ code: { src, hot, notes }, under: [P.badges([{ name: 'x', v: val('x', t) }, { name: 'st', v: cur || '?' }, { name: 'z', v: val('z', t), cls: val('z', t) === '1' ? 'hot' : '' }])], right: [diagram(cur, taken), P.waves({ waves: run.waves, rows, t, t1, w: 330 })], focus });
      const F = new S.Frames(['edges', 'found']);
      F.add(P.frame(pic(0, null, null, blocks, {}, 'right'), 'The detector sets z = 1 after the input has been 1, 1, 0. States: A (nothing yet), B (seen 1), C (seen 1, 1), D (seen 1, 1, 0). ' + (blocks.length === 1 ? 'Here one clocked block does everything, and z is assigned in it too, so z is a flip-flop of its own.' : blocks.length + ' always blocks: line ' + blocks[0] + ' is the state register (<=, clocked); ' + (blocks.length === 3 ? 'line ' + blocks[1] + ' the next state and line ' + blocks[2] + ' the output, both combinational (=, @*).' : 'line ' + blocks[1] + ' works out the next state nx and the output z, combinational (=, @*).'))));
      const edges = K.code.changes(run.waves, 'tb.clk').filter((q) => q[1] === 1 && q[0] > 0).map((q) => q[0]);
      for (const e of edges) {
        F.count('edges');
        const s0 = stOf(e - 1e-6), s1 = stOf(e), x = val('x', e - 1e-6), rst = val('rst', e - 1e-6);
        const zz = val('z', e);
        if (rst !== '1' && s0 !== '?') F.add(P.frame(pic(e - 1e-6, s0, null, [armLine(s0)], {}, 'right'), 'Before the edge at ' + P.ns(e) + ': state ' + s0 + ', x = ' + x + '. Line ' + armLine(s0) + ' is the case arm for ' + s0 + '.', { meta: { q: { ask: 'Which state after the edge?', options: NAMES, answer: s1 } } }));
        if (zz === '1') F.count('found');
        const notes = { [regLine]: 'st = ' + s1 };
        if (outLine) notes[outLine] = 'z = ' + zz;
        F.add(P.frame(pic(e, s1, rst === '1' || s0 === '?' ? null : s0 + '>' + s1, [regLine], notes, 'right'), 'Edge at ' + P.ns(e) + ': ' + (rst === '1' ? 'rst = 1, so the register loads A whatever the logic says.' : 'the register loads the next state the logic had ready: ' + s0 + ' with x = ' + x + ' goes to ' + s1 + '.') + ' z = ' + zz + (zz === '1' ? ': 1, 1, 0 has just been seen.' : '.')));
      }
      F.add(P.frame(pic(t1, stOf(t1), null, [], {}, 'right'), 'z went to 1 ' + P.plural(F.counts.found, 'time') + ', each time in step with the clock. ' + (blocks.length === 1 ? 'With everything in one clocked block, z is computed from the state before the edge and the input, and stored: a registered output, clean of glitches, at the cost of a flip-flop and of writing its condition one step ahead.' : 'All the styles describe the same machine; they differ in how easy they are to read and in what the output is built from.'), { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'table', title: 'The machine', colHead: ['state', 'x = 0', 'x = 1', 'z'], rows: [['A', 'A', 'B', '0'], ['B', 'A', 'C', '0'], ['C', 'D', 'C', '0'], ['D', 'A', 'B', '1']] }, P.warnSection(run.warnings)]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'In the two-block style, which block holds the flip-flops?', options: ['The clocked one, always @(posedge clk)', 'The @* one', 'Both', 'Neither'], answer: 0, why: 'Only the clocked block stores anything.' },
      { q: 'Why give the next-state block a default arm?', options: ['So nx is assigned for every state and no latch is built', 'To make it faster', 'To reset the machine', 'It is required by the syntax'], answer: 0, why: 'A combinational block must assign on every path.' },
      { q: 'In the one-block style, z is assigned with <= in the clocked block. z is then…', options: ['a flip-flop: a registered output', 'a latch', 'a wire', 'combinational'], answer: 0, why: 'Everything assigned in a clocked block is stored.' },
      { q: 'The state is C and x = 0. After the edge the state is…', options: ['D', 'A', 'B', 'C'], answer: 0, why: 'C means 1, 1 has been seen; a 0 completes 110.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // What a state machine becomes
  // ---------------------------------------------------------------------------------------------------
  /** the usual picture of a synchronous machine: x → next-state logic → state register → output logic → z */
  const blockPic = (o) => (x, y) => {
    const items = [P.heading('bk:h', x, y, 'What it becomes')];
    const top = y + 60, h = 74;
    const box = (key, bx, w, lines, hot) => items.push({ key: 'bk:' + key, kind: 'state', x: bx + w / 2, y: top + h / 2, w, h, rx: 10, lines, size: 14, cls: hot ? 'hot' : '' });
    const W1 = 170, W2 = 150, W3 = 150, gap = 70;
    const x1 = x + 60, x2 = x1 + W1 + gap, x3 = x2 + W2 + gap;
    box('ns', x1, W1, ['next-state logic', o.ns], o.hot === 'ns');
    box('reg', x2, W2, ['state register', o.reg], o.hot === 'reg');
    box('out', x3, W3, [o.zReg ? 'output register' : 'output logic', o.out], o.hot === 'out');
    items.push({ key: 'bk:x', kind: 'text', x: x + 8, y: top + h / 2 - 8, text: 'x', cls: 'strong', mono: true });
    items.push({ key: 'bk:ex', kind: 'edge', from: { x: x + 24, y: top + h / 2 }, to: 'bk:ns' });
    items.push({ key: 'bk:e1', kind: 'edge', from: 'bk:ns', to: 'bk:reg' });
    items.push({ key: 'bk:e1l', kind: 'text', x: x1 + W1 + gap / 2, y: top + h / 2 - 10, text: 'nx', anchor: 'middle', cls: 'vc-note', size: 14 });
    items.push({ key: 'bk:e2', kind: 'edge', from: 'bk:reg', to: 'bk:out' });
    items.push({ key: 'bk:e2l', kind: 'text', x: x2 + W2 + gap / 2, y: top + h / 2 - 10, text: 'st', anchor: 'middle', cls: 'vc-note', size: 14 });
    // the state fed back: down from the register, along, and up into the next-state logic
    const fy = top + h + 34;
    items.push({ key: 'bk:fb1', kind: 'line', x1: x2 + W2 / 2, y1: top + h, x2: x2 + W2 / 2, y2: fy, cls: 'vc-wire' });
    items.push({ key: 'bk:fb2', kind: 'line', x1: x2 + W2 / 2, y1: fy, x2: x1 + W1 / 2, y2: fy, cls: 'vc-wire' });
    items.push({ key: 'bk:fb3', kind: 'edge', from: { x: x1 + W1 / 2, y: fy }, to: 'bk:ns' });
    items.push({ key: 'bk:fbl', kind: 'text', x: (x1 + W1 / 2 + x2 + W2 / 2) / 2, y: fy + 18, text: 'st, fed back', anchor: 'middle', cls: 'vc-note', size: 14 });
    items.push({ key: 'bk:ez', kind: 'edge', from: 'bk:out', to: { x: x3 + W3 + 44, y: top + h / 2 } });
    items.push({ key: 'bk:z', kind: 'text', x: x3 + W3 + 50, y: top + h / 2 + 5, text: 'z', cls: 'strong', mono: true });
    items.push({ key: 'bk:clk', kind: 'text', x: x2 + W2 / 2, y: top - 12, text: 'clk', anchor: 'middle', cls: 'vc-note', size: 14 });
    return { items, box: { x, y, w: x3 + W3 + 70 - x, h: top + h + 60 - y } };
  };
  const counts = (say) => { const m = /becomes (.*)$/.exec(say || ''); return m ? m[1] : ''; };
  S.topic({
    id: 'vl-fsm-synth', family: 'p12-fsm', order: 20, title: 'What a state machine becomes',
    blurb: 'Synthesise each style and the same shape comes out: a state register of flip-flops between the logic that works out the next state and the logic that makes the output. Which code becomes which part, and what each costs.',
    inputs: [{ id: 'style', kind: 'choice', label: 'Style', def: 'two', options: [{ value: 'two', label: 'Two blocks' }, { value: 'three', label: 'Three blocks' }, { value: 'one', label: 'One clocked block' }] }],
    presets: [
      { label: 'Two blocks', values: { style: 'two' } },
      { label: 'Three blocks', values: { style: 'three' } },
      { label: 'One clocked block', values: { style: 'one' } },
    ],
    run(inp) {
      const src = STYLE[inp.style];
      const hw = K.code.hardware(src, { top: 'det' });
      if (!hw.ok) throw new Error('the detector could not be synthesised');
      const tr = hw.trace;
      const reg = tr.filter((x) => x.kind === 'register');
      const stReg = reg.find((x) => x.name === 'st'), zReg = reg.find((x) => x.name === 'z');
      const seq = tr.find((x) => x.kind === 'seq'), comb = tr.filter((x) => x.kind === 'comb'), fsm = tr.find((x) => x.kind === 'fsm');
      const sum = tr.find((x) => x.kind === 'summary');
      const all = {};
      for (const s of STYLE.two ? Object.keys(STYLE) : []) { const h = K.code.hardware(STYLE[s], { top: 'det' }); const sm = h.ok && h.trace.find((x) => x.kind === 'summary'); all[s] = sm ? sm.counts : {}; }
      const regLine = P.findLine(src, /always @\(posedge clk\)/);
      const blocks = K.code.lines(src).map((l, i) => (/always/.test(l) ? i + 1 : 0)).filter(Boolean);
      const range = (from) => { const ls = K.code.lines(src); const out = [from]; for (let n = from + 1; n <= ls.length && !/^\s*(\/\/|always|endmodule)/.test(ls[n - 1]); n++) out.push(n); return out; };
      const nsGates = inp.style === 'one' ? counts(seq && seq.say) : counts((comb.find((c) => /nx/.test(c.say)) || {}).say);
      const outGates = inp.style === 'three' ? counts((comb.find((c) => /\(z\)/.test(c.say)) || {}).say) : inp.style === 'two' ? 'in the same block' : '1 flip-flop';
      const parts = (t) => { const ns = (t.match(/\d+/g) || []).map(Number); const tot = ns.reduce((a, b) => a + b, 0); return tot ? tot + ' gates and muxes' : t; };
      const o = { ns: parts(nsGates || ''), reg: '2 flip-flops', out: inp.style === 'two' ? 'with the next state' : inp.style === 'one' ? '1 flip-flop' : parts(outGates), zReg: !!zReg };
      const table = P.table({ title: 'The three styles, synthesised', key: 'cmp', head: ['style', 'flip-flops', 'gates and muxes'], rows: Object.keys(STYLE).map((k) => { const c = all[k] || {}; const ff = c['flip-flops'] || 0; const g = Object.entries(c).filter(([n]) => n !== 'flip-flops').reduce((a, [, v]) => a + v, 0); return [k === 'two' ? 'two blocks' : k === 'three' ? 'three blocks' : 'one block', String(ff), String(g)]; }), hot: Object.keys(STYLE).indexOf(inp.style) });
      const pic = (hot, part, extra) => P.scene({ code: { src, hot }, right: [blockPic(Object.assign({}, o, { hot: part })), extra ? table : null], focus: 'right' });
      const F = new S.Frames();
      F.add(P.frame(pic([], null), 'Every synchronous machine has this shape. The synthesis tool finds it in the code: ' + (fsm ? 'st is the state register, and the case at line ' + fsm.line + ' is its next-state logic.' : 'a register and logic.')));
      F.add(P.frame(pic(range(regLine), 'reg'), 'The clocked block at line ' + regLine + ': ' + (stReg ? stReg.say : 'the state register') + '. Two bits hold the four states A = 00, B = 01, C = 10, D = 11.' + (zReg ? ' z is assigned in it too: ' + zReg.say + '.' : ''), { meta: { q: { ask: 'How many flip-flops does this style need in all?', options: ['1', '2', '3', '4'], answer: String((all[inp.style] || {})['flip-flops'] || 2) } } }));
      F.add(P.frame(pic(inp.style === 'one' ? range(P.findLine(src, /case \(st\)/)) : range(blocks[1]), 'ns'), inp.style === 'one' ? 'The case inside the clocked block is the next-state logic: ' + (seq ? seq.say : '') + '. Only what is stored is a register; the expressions in front of it are gates.' : 'The @* block at line ' + blocks[1] + ' is the next-state logic: ' + ((comb.find((c) => /nx/.test(c.say)) || {}).say || '') + '. nx is never stored: assigned with = in a combinational block, it is just wires.'));
      F.add(P.frame(pic(inp.style === 'three' ? range(blocks[2]) : [P.findLine(src, /z\s*<?=\s*\(st/)], 'out'), inp.style === 'three' ? 'The third block is the output logic: ' + ((comb.find((c) => /\(z\)/.test(c.say)) || {}).say || '') + '. z depends on the state only: a Moore output.' : inp.style === 'one' ? 'z <= … in the clocked block makes z a flip-flop. Its condition is written one step ahead (state C and x = 0, the moment before D), so it rises together with the move into D, glitch-free.' : 'The output z is worked out in the same block as nx: the tool builds its gates side by side with the next-state logic.'));
      F.add(P.frame(pic([], null, true), (sum ? 'The counts above are each block as written; the tool then simplifies the logic of all the blocks together, and ' + sum.say.replace(/^The circuit/, 'the finished circuit') + ' ' : '') + 'The styles cost about the same; the register is always there. Separate blocks keep the register, the next-state logic and the output apart, as in the drawing, which makes the code easy to check against a state diagram.', { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'math', title: 'Synthesis says', text: tr.filter((x) => x.kind !== 'port').map((x) => x.say).join('\n') }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'A machine with 4 states, binary encoded, needs how many flip-flops for its state?', options: ['2', '4', '1', '3'], answer: 0, why: '2 bits give 4 codes.' },
      { q: 'Where is nx stored in the two-block style?', options: ['Nowhere: it is combinational, wires and gates', 'In a flip-flop', 'In a latch', 'In memory'], answer: 0, why: 'Assigned with = in an @* block on every path.' },
      { q: 'The one-block style with z <= … costs…', options: ['one more flip-flop, for z', 'nothing extra', 'two more flip-flops', 'a latch'], answer: 0, why: 'z is stored at each edge.' },
      { q: 'A Moore output depends on…', options: ['the state only', 'the state and the inputs', 'the inputs only', 'the clock'], answer: 0, why: 'In the three-block style z = (st == D).' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
