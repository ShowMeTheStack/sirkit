// Part 12, synthesis: what a synthesis tool can build and what it cannot, each case explained by what the tool
// would have to draw; and one function reached two ways, drawn as a schematic (and written out as structural
// Verilog, gate for gate) and written as one line of Verilog (and synthesised), the two netlists compared.
(function (S) {
  'use strict';
  const K = S.Kit, P = S.P12;
  const show = P.show;

  // ---------------------------------------------------------------------------------------------------
  // What can be synthesised
  // ---------------------------------------------------------------------------------------------------
  const CASES = {
    delay: { label: 'A delay in an assign', src: 'module m(input a, b,\n         output y);\n  assign #5 y = a & b;\nendmodule', hot: [3], why: 'A gate has the delay its transistors and wires give it; the tool cannot draw "5 ns". It builds the AND gate and drops the #5, so the simulation and the chip may differ in timing.' },
    init: { label: 'An initial value', src: 'module m(input d, clk,\n         output reg q);\n  initial q = 1\'b1;\n  always @(posedge clk)\n    q <= d;\nendmodule', why: 'A flip-flop powers up in whatever state it likes; there is nothing to draw for "at time 0, q is 1". The initial block is dropped. To start in a known state, build a reset.' },
    disp: { label: '$display in a design', src: 'module m(input d, clk,\n         output reg q);\n  always @(posedge clk) begin\n    q <= d;\n    $display("q = %b", d);\n  end\nendmodule', why: 'There is no screen on a chip. $display is a message to the person running the simulation; the tool drops it and builds the flip-flop.' },
    reset: { label: 'An asynchronous reset', src: 'module m(input d, clk, rst,\n         output reg q);\n  always @(posedge clk or\n           posedge rst)\n    if (rst) q <= 1\'b0;\n    else     q <= d;\nendmodule', hot: [3, 4, 5], why: 'Two edges in the list, and an if that tests rst first: the tool recognises a flip-flop whose reset acts at once, without waiting for the clock, and draws exactly that part.' },
    loop: { label: 'A loop with no fixed count', src: 'module m(input [3:0] v,\n         output reg [2:0] n);\n  reg [3:0] t;\n  always @* begin\n    n = 0; t = v;\n    while (t != 0) begin\n      n = n + 1;\n      t = t & (t - 1);\n    end\n  end\nendmodule', why: 'A loop is built by drawing one copy of its body per turn. Here the number of turns depends on v, so the tool cannot know how many copies to draw. Write a for loop with a fixed count (for i = 0 to 3) instead.' },
    real: { label: 'real numbers', src: 'module m(input [3:0] v,\n         output reg [3:0] y);\n  real r;\n  always @* begin\n    r = v * 1.5;\n    y = r;\n  end\nendmodule', why: 'A real is a floating-point number. There is no gate for it: the tool would have to draw a whole floating-point unit. Scale to whole numbers (v + v/2) and the tool can draw adders.' },
    clocks: { label: 'Two clocks on one register', src: 'module m(input a, b,\n         output reg q);\n  always @(posedge a or\n           posedge b)\n    q <= ~q;\nendmodule', why: 'A flip-flop has one clock input. Two edges can only be drawn when all but one are an asynchronous set or reset, tested first by an if. Here both would clock q: there is no such part to draw.' },
    div: { label: 'Division by a signal', src: 'module m(input [3:0] a, b,\n         output [3:0] q);\n  assign q = a / b;\nendmodule', why: 'Division by a variable needs a divider, a large circuit of its own (or many clock cycles), which this tool does not draw. Dividing by a constant power of two is just wiring: a >> 2 is a / 4.' },
    two: { label: 'Two blocks drive one signal', src: 'module m(input d, clk,\n         output reg q);\n  always @(posedge clk)\n    q <= d;\n  always @(negedge clk)\n    q <= ~d;\nendmodule', why: 'Each always block that assigns q would draw its own flip-flop driving the same wire: two outputs joined, fighting. Hardware has one driver per wire. Put every assignment to q in one block.' },
  };
  S.topic({
    id: 'vl-synth', family: 'p12-synth', order: 10, title: 'What can be synthesised',
    blurb: 'A synthesis tool turns code into parts it can draw: gates, multiplexers, adders, flip-flops, latches. Some code describes something no part does (a delay, a value at power-up, a floating-point number, a loop of unknown length); the tool drops it, or refuses the design. Each case, and why.',
    inputs: [{ id: 'k', kind: 'choice', label: 'Code', def: 'delay', options: Object.keys(CASES).map((k) => ({ value: k, label: CASES[k].label })) }],
    presets: Object.keys(CASES).map((k) => ({ label: CASES[k].label, values: { k } })),
    run(inp) {
      const C = CASES[inp.k];
      const src = C.src;
      const hw = K.code.hardware(src, { top: 'm' });
      const ok = hw.ok;
      const bad = (ok ? (hw.notes || []).map((n) => n.line) : hw.reasons.map((r) => r.line)).filter(Boolean).concat(C.hot || []);
      const marks = {};
      for (const l of bad) if (l) marks[l] = ok ? 'warn' : 'bad';
      const F = new S.Frames();
      const pic = (hot, showHw, focus) => P.scene({ code: { src, hot, marks: showHw ? marks : {} }, right: [showHw ? P.built(hw, { title: ok ? 'What the tool draws' : 'What the tool says' }) : P.lines(['(press on to see)'], { title: 'What the tool draws', key: 'circ:wait' })], focus });
      const all = K.code.lines(src).map((_, i) => i + 1);
      F.add(P.frame(pic(all, false, 'code'), 'The module, as written. A synthesis tool reads it looking for things it can draw.', { meta: { q: { ask: 'Can a synthesis tool build this?', options: ['yes, all of it', 'yes, but it drops something', 'no'], answer: ok ? (hw.notes.length || inp.k === 'delay' ? 'yes, but it drops something' : 'yes, all of it') : 'no' } } }));
      const sum = ok ? (hw.trace || []).find((x) => x.kind === 'summary') : null;
      const what = ok ? (hw.trace || []).filter((x) => x.kind !== 'port' && x.kind !== 'summary').map((x) => x.say.replace(/\.$/, '')).join('; ') + (sum ? '. ' + sum.say.replace(/\.$/, '') : '') : '';
      F.add(P.frame(pic(bad.length ? bad.filter(Boolean) : all, true, 'right'), ok ? 'It builds it: ' + what + '.' + (hw.notes.length ? ' And it notes: ' + hw.notes.map((n) => n.msg).join('; ') + '.' : inp.k === 'delay' ? ' The #5 left no trace.' : '') : 'It refuses: ' + hw.reasons.map((r) => (r.line ? 'line ' + r.line + ': ' : '') + r.msg).join('; ') + '.'));
      F.add(P.frame(pic(bad.length ? bad.filter(Boolean) : all, true, 'code'), C.why, { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'table', title: 'Simulation only', colHead: ['written', 'the tool'], rows: [['#delays', 'drops them'], ['initial', 'drops it'], ['$display, $finish', 'drops them'], ['real', 'refuses'], ['loops of unknown length', 'refuses'], ['one signal, two blocks', 'refuses']] }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'What does a synthesis tool do with "assign #3 y = a | b;"?', options: ['Builds the OR gate and ignores #3', 'Builds an OR gate and a delay line', 'Refuses it', 'Builds a flip-flop'], answer: 0, why: 'Delays are for simulation; real delays come from the parts.' },
      { q: 'Why can\'t "while (x != 0)" with x from an input be built?', options: ['The number of turns is not known when the circuit is drawn', 'while is not Verilog', 'It needs a clock', 'Loops are never synthesisable'], answer: 0, why: 'Each turn is a copy of the body; the tool must know how many.' },
      { q: 'How should a design start in a known state on a chip?', options: ['With a reset input', 'With an initial block', 'With $display', 'It always starts at 0'], answer: 0, why: 'Initial blocks are dropped; a reset is hardware.' },
      { q: 'q is assigned in two different always blocks. The tool…', options: ['refuses: a wire has one driver', 'builds two flip-flops and an OR', 'keeps the last block', 'builds a latch'], answer: 0, why: 'Two drivers on one wire would fight.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // The same circuit from a schematic and from Verilog
  // ---------------------------------------------------------------------------------------------------
  const GATE_RE = /^\s*(and|or|not|nand|nor|xor|xnor|buf)\s+(\w+)\s*\(/;
  const memo = new Map();
  S.topic({
    id: 'vl-roundtrip', family: 'p12-synth', order: 20, title: 'One circuit, drawn and written',
    blurb: 'Draw a function as gates and the tool can write it out as structural Verilog, one line per gate. Write the same function as one line of Verilog and the tool draws its own gates. Compare the two netlists, and check every input to see that they are the same function.',
    inputs: [{ id: 'f', kind: 'expr', label: 'F =', def: "A'B + AC", check: (v) => { const n = S.Bool.vars(S.Bool.parse(String(v))).length; return n > 4 ? 'at most 4 variables, so the drawings stay readable' : null; } }],
    presets: [
      { label: "A'B + AC", values: { f: "A'B + AC" } },
      { label: "AB + A'C + BC", values: { f: "AB + A'C + BC" } },
      { label: "(A + B)(A' + C)", values: { f: "(A + B)(A' + C)" } },
      { label: 'A ⊕ B ⊕ C', values: { f: 'A ^ B ^ C' } },
    ],
    counters: [{ id: 'rows', label: 'inputs checked' }],
    run(inp) {
      const f = String(inp.f);
      const ast = S.Bool.parse(f), vars = S.Bool.vars(ast);
      const key = f;
      if (!memo.has(key)) {
        const drawn = K.schem.fromExpr('F = ' + f, 'multi', { title: 'drawn' });
        const text = S.Verilog.fromCircuit(drawn, { name: 'drawn' }).replace(/^\/\/.*\n/, '');
        const written = 'module written(input ' + vars.join(', ') + ',\n               output F);\n  assign F = ' + S.Bool.toString(ast, 'verilog') + ';\nendmodule';
        const hw = K.code.hardware(written, { top: 'written' });
        // every input, both modules
        const n = vars.length;
        const tb = text + '\n' + written + '\nmodule tb;\n  reg [' + (n - 1) + ':0] v;\n  wire f1, f2;\n  integer k;\n  drawn d1(' + vars.map((x, i) => '.' + x + '(v[' + (n - 1 - i) + '])').join(', ') + ', .F(f1));\n  written d2(' + vars.map((x, i) => '.' + x + '(v[' + (n - 1 - i) + '])').join(', ') + ', .F(f2));\n  initial for (k = 0; k < ' + 2 ** n + '; k = k + 1) begin v = k; #1 $display("%b %b %b", v, f1, f2); end\nendmodule';
        const r = S.Verilog.run(tb, { top: 'tb' });
        memo.set(key, { drawn, res: K.schem.layout(drawn), text, written, hw, rows: (r.output || []).map((l) => l.split(' ')) });
      }
      const D = memo.get(key);
      const F = new S.Frames(['rows']);
      const tl = K.code.lines(D.text);
      const gates = tl.map((l, i) => { const m = GATE_RE.exec(l); return m ? { line: i + 1, id: m[2], type: m[1] } : null; }).filter(Boolean);
      const count = (c) => { const o = {}; for (const p of c.parts) if (!['IN', 'OUT', 'SPLIT', 'MERGE'].includes(p.type)) o[p.type] = (o[p.type] || 0) + 1; return o; };
      const cA = count(D.drawn), cB = D.hw.ok ? count(D.hw.circuit) : {};
      const types = [...new Set(Object.keys(cA).concat(Object.keys(cB)))].sort();
      const totA = Object.values(cA).reduce((a, b) => a + b, 0), totB = Object.values(cB).reduce((a, b) => a + b, 0);
      const cmp = P.table({ title: 'The two netlists', key: 'cmp', head: ['part', 'drawn', 'from Verilog'], rows: types.map((t) => [t, String(cA[t] || 0), String(cB[t] || 0)]).concat([['total', String(totA), String(totB)]]) });
      const agree = D.rows.every((r) => r[1] === r[2]);
      const truth = (upto) => P.table({ title: 'Every input', key: 'tt', head: [vars.join(''), 'drawn', 'written'], rows: D.rows.slice(0, upto).map((r) => [r[0], r[1], r[2]]).concat(upto ? [] : [['', '', '']]), hot: upto ? upto - 1 : null, cls: (rr, c) => (c > 0 && D.rows[rr] && D.rows[rr][1] !== D.rows[rr][2] ? 'bad' : '') });
      const picA = (hot, parts, focus) => P.scene({ code: { src: D.text, hot, title: 'Written out from the drawing' }, right: [P.circuit(D.res, { title: 'Drawn: F = ' + f, hot: parts })], focus });
      F.add(P.frame(picA([], [], 'right'), 'A circuit drawn from F = ' + f + ': ' + Object.entries(cA).map(([t, k]) => k + ' ' + t).join(', ') + '. Written out as Verilog, it becomes a module with one port per pin and one line per gate.'));
      gates.forEach((g, i) => {
        const args = (/\((.*)\)/.exec(tl[g.line - 1]) || [])[1] || '';
        const [out, ...ins] = args.split(',').map((x) => x.trim());
        F.add(P.frame(picA([g.line], [g.id], 'right'), 'Line ' + g.line + ': "' + tl[g.line - 1].trim() + '" is the ' + g.type.toUpperCase() + ' gate ' + g.id + ': output ' + out + ', input' + (ins.length > 1 ? 's ' : ' ') + ins.join(' and ') + '.' + (i === 0 ? ' Wires with no name in the drawing get one made from their id. This is structural Verilog: it says what is connected to what, nothing about behaviour.' : '')));
      });
      const picB = (hot, extra, focus) => P.scene({ code: { src: D.written, hot, title: 'Written by hand' }, right: [P.built(D.hw, { title: 'Drawn by the tool from it', key: 'circB' }), extra && extra.length ? P.row(extra) : null].filter(Boolean), focus });
      F.add(P.frame(picB([3], [], 'code'), 'Now the other way: the same function written as one line, assign F = ' + S.Bool.toString(ast, 'verilog') + '. A synthesis tool has to choose the gates itself.', { meta: { q: { ask: 'Will the tool use the same number of parts as the drawing (' + totA + ')?', options: ['yes', 'no, fewer', 'no, more'], answer: totB === totA ? 'yes' : totB < totA ? 'no, fewer' : 'no, more' } } }));
      F.add(P.frame(picB([3], [cmp], 'right'), 'The tool built ' + totB + ' part' + (totB === 1 ? '' : 's') + ' against ' + totA + ' in the drawing. ' + (totB === totA ? 'The same count; the tool reads the expression much as it was drawn.' : 'The netlists differ: a tool maps expressions onto the parts it has, so two netlists of one function need not match gate for gate.') + ' Same function? Only trying the inputs can say.'));
      for (let k = 1; k <= D.rows.length; k++) {
        F.count('rows');
        if (k === 1 || k === D.rows.length || D.rows[k - 1][1] !== D.rows[k - 1][2]) F.add(P.frame(picB([3], [truth(k)], 'right'), 'Input ' + D.rows[k - 1][0] + ': drawn gives ' + D.rows[k - 1][1] + ', written gives ' + D.rows[k - 1][2] + '.' + (k === D.rows.length ? ' That is all ' + D.rows.length + ' inputs.' : ''), k === 1 ? { meta: { q: { ask: 'Will the two agree on all ' + D.rows.length + ' inputs?', options: ['yes', 'no'], answer: agree ? 'yes' : 'no' } } } : {}));
      }
      F.add(P.frame(picB([3], [cmp, truth(D.rows.length)], 'right'), agree ? 'They agree on every input: one function, two netlists. Drawing and writing are two ways into the same design, and the tool goes both ways: Verilog to gates (synthesis) and gates to Verilog (a netlist written out).' : 'They disagree on some inputs: these are not the same function.', { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'math', title: 'Two kinds of Verilog', text: ['structural: and g1(y, a, b);', '  says what is connected', 'dataflow:   assign y = a & b;', '  says what is computed'].join('\n') }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'Structural Verilog describes…', options: ['which parts there are and how they are wired', 'what a circuit computes, not how', 'only the testbench', 'the timing of a circuit'], answer: 0, why: 'One line per part, with its connections.' },
      { q: 'Two netlists with different gate counts can still be…', options: ['the same function', 'never the same function', 'only equal if they have the same gates', 'equal only for some inputs'], answer: 0, why: 'Different gates can compute the same truth table.' },
      { q: 'How can you be sure two 3-input combinational circuits are equal?', options: ['Compare all 8 input combinations', 'Compare their gate counts', 'Compare a few inputs', 'Look at the drawings'], answer: 0, why: 'Exhaustive comparison settles it.' },
      { q: 'In "and g4 (n6, A, C);", the output is…', options: ['n6', 'A', 'C', 'g4'], answer: 0, why: 'Primitives list the output first.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
