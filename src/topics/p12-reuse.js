// Part 12, reuse: a parameter sizes a design and a generate loop builds one full adder per bit (drawn as the
// ripple-carry adder it is), functions and tasks (the cursor jumping into the task's body), and hierarchy: a full
// adder made of two half adders, joined by named port connections, with the mistake positional ones invite.
(function (S) {
  'use strict';
  const K = S.Kit, P = S.P12;
  const show = P.show;

  // ---------------------------------------------------------------------------------------------------
  // Parameters and generate
  // ---------------------------------------------------------------------------------------------------
  const GEN = (n, a, b) => `module fa(input a, b, ci,
          output s, co);
  assign s  = a ^ b ^ ci;
  assign co = a&b | ci&(a^b);
endmodule

module add #(parameter N = 4)
  (input [N-1:0] a, b,
   output [N-1:0] s, output co);
  wire [N:0] c;
  assign c[0] = 1'b0;
  genvar k;
  generate
    for (k = 0; k < N; k = k + 1)
    begin : bit
      fa f(.a(a[k]), .b(b[k]),
           .ci(c[k]), .s(s[k]),
           .co(c[k+1]));
    end
  endgenerate
  assign co = c[N];
endmodule

module tb;
  reg  [${n - 1}:0] a, b;
  wire [${n - 1}:0] s;
  wire co;
  add #(.N(${n})) dut(.a(a), .b(b),
                 .s(s), .co(co));
  initial begin
    a = ${n}'d${a}; b = ${n}'d${b};
    #10 $display("%0d+%0d = %0d, co %b",
                 a, b, s, co);
  end
endmodule`;
  const bitsOf = (v, n) => (v >>> 0).toString(2).padStart(n, '0').slice(-n);
  S.topic({
    id: 'vl-generate', family: 'p12-reuse', order: 10, title: 'Parameters and generate',
    blurb: 'A parameter is a number a module is built with; #(.N(4)) sets it per instance. A generate loop runs while the design is being built, not while it simulates: each turn places one more copy of its body. Here it lays down one full adder per bit, and the result is a ripple-carry adder.',
    inputs: [
      { id: 'n', kind: 'number', label: 'N (bits)', def: 4, min: 2, max: 5 },
      { id: 'a', kind: 'number', label: 'a', def: 11, min: 0, max: 31 },
      { id: 'b', kind: 'number', label: 'b', def: 6, min: 0, max: 31 },
    ],
    check: (inp) => (inp.a >= 2 ** inp.n || inp.b >= 2 ** inp.n ? 'a and b must fit in N = ' + inp.n + ' bits (at most ' + (2 ** inp.n - 1) + ')' : null),
    presets: [
      { label: 'N = 4: 11 + 6', values: { n: 4, a: 11, b: 6 } },
      { label: 'N = 2: 3 + 1 overflows', values: { n: 2, a: 3, b: 1 } },
      { label: 'N = 5: 21 + 13', values: { n: 5, a: 21, b: 13 } },
    ],
    counters: [{ id: 'copies', label: 'adders placed' }],
    run(inp) {
      const n = inp.n, a = inp.a, b = inp.b;
      const src = GEN(n, a, b);
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const c = K.live.adder(n);
      const res = K.schem.layout(c);
      const at = (nm) => show(K.code.at(run.waves, nm, run.time));
      const values = (upto) => {
        const v = {};
        for (let k = 0; k < n; k++) {
          if (k > upto) continue;
          v['A' + k] = at('tb.dut.bit[' + k + '].f.a'); v['B' + k] = at('tb.dut.bit[' + k + '].f.b');
          v['C' + k] = at('tb.dut.bit[' + k + '].f.ci');
          const o = c.byId.get('out_S' + k);
          if (o && o.net.a) v[o.net.a.id] = at('tb.dut.bit[' + k + '].f.s');
        }
        const co = c.byId.get('out_C' + n);
        if (co && co.net.a && upto >= n - 1) v[co.net.a.id] = at('tb.co');
        return v;
      };
      const gen = P.findLine(src, /for \(k = 0/), inst = P.findLine(src, /fa f\(/), par = P.findLine(src, /parameter N/), over = P.findLine(src, /add #\(\.N/);
      const F = new S.Frames(['copies']);
      const pic = (hot, parts, vals, notes, focus) => P.scene({ code: { src, hot, notes }, right: [P.circuit(res, { title: 'What generate builds for N = ' + n, hot: parts, values: vals })], layout: 'stack', focus });
      F.add(P.frame(pic([par, over], [], {}, { [over]: 'N = ' + n }, 'code'), 'Line ' + par + ' gives add a parameter N, 4 unless told otherwise. Line ' + over + ' builds this copy with #(.N(' + n + ')), so inside it every N reads ' + n + ': a and b are [' + (n - 1) + ':0], c is [' + n + ':0].'));
      for (let k = 0; k < n; k++) {
        F.count('copies');
        F.add(P.frame(pic([gen, inst, inst + 1, inst + 2], ['fa' + k], {}, { [gen]: 'k = ' + k, [inst]: 'bit[' + k + '].f' }, 'right'), 'Building, k = ' + k + ': one full adder, named bit[' + k + '].f, joined to a[' + k + '], b[' + k + '], carry in c[' + k + ']' + (k ? ' (the carry the adder before it gives out)' : '') + ', sum s[' + k + '] and carry out c[' + (k + 1) + '].' + (k ? '' : ' c[0] is tied to 0 on line ' + P.findLine(src, /assign c\[0\]/) + '.') + (k === n - 1 ? ' k = ' + (k + 1) + ' is not below N, so building stops: ' + n + ' adders.' : '')));
      }
      const sum = (a + b) % 2 ** n, co = (a + b) >= 2 ** n ? 1 : 0;
      F.add(P.frame(pic([P.findLine(src, /a = \d/)], [], {}, {}, 'code'), 'Now the simulation: a = ' + a + ' (' + bitsOf(a, n) + ') and b = ' + b + ' (' + bitsOf(b, n) + ').', { meta: { q: { ask: 'What will s and co be?', options: P.opts('s = ' + sum + ', co = ' + co, 's = ' + ((a + b) % 2 ** n) + ', co = ' + (1 - co), 's = ' + (a + b) + ', co = 0', 's = ' + ((a ^ b) % 2 ** n) + ', co = 0'), answer: 's = ' + sum + ', co = ' + co } } }));
      for (let k = 0; k < n; k++) {
        const ci = at('tb.dut.bit[' + k + '].f.ci'), s = at('tb.dut.bit[' + k + '].f.s'), cout = at('tb.dut.bit[' + k + '].f.co');
        F.add(P.frame(pic([P.findLine(src, /assign s /), P.findLine(src, /assign co = a&b/)], ['fa' + k], values(k), { [P.findLine(src, /assign s /)]: 's = ' + s, [P.findLine(src, /assign co = a&b/)]: 'co = ' + cout }, 'right'), 'bit[' + k + '].f: a = ' + bitsOf(a, n)[n - 1 - k] + ', b = ' + bitsOf(b, n)[n - 1 - k] + ', carry in ' + ci + ' gives s[' + k + '] = ' + s + ' and carry out ' + cout + '. All ' + n + ' copies run the same two lines of fa, each with its own wires.'));
      }
      const disp = P.findLine(src, '$display');
      F.add(P.frame(pic([disp], [], values(n), { [disp]: run.output[0] || '' }, 'right'), 'The testbench prints "' + (run.output[0] || '') + '".' + (co ? ' The sum needs ' + (n + 1) + ' bits, so the last carry comes out on co.' : '') + ' Change N and the same text builds a wider or narrower adder: the generate loop is a recipe for hardware, run once while the design is put together.', { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'math', title: 'Elaborated', text: [...Array(n).keys()].map((k) => 'bit[' + k + '].f: a[' + k + '] b[' + k + '] c[' + k + '] -> s[' + k + '] c[' + (k + 1) + ']').join('\n') }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'When does a generate for loop run?', options: ['While the design is built, before simulation starts', 'At every clock edge', 'Whenever its inputs change', 'Only in synthesis'], answer: 0, why: 'It places hardware; it does not execute at run time.' },
      { q: 'add #(.N(8)) u(...); does what?', options: ['Builds this instance with N = 8', 'Delays u by 8 ns', 'Makes 8 instances', 'Sets a wire to 8'], answer: 0, why: '#( ) overrides parameters of the instance.' },
      { q: 'Why does a generate loop need a genvar?', options: ['Its index must be known while building, so it is a constant for each copy', 'genvars are faster', 'Integers are not allowed in modules', 'To count clock edges'], answer: 0, why: 'Each copy gets its own fixed k.' },
      { q: 'With N = 4, how many full adders does the loop place?', options: ['4', '5', '3', '1'], answer: 0, why: 'k = 0, 1, 2, 3.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Functions and tasks
  // ---------------------------------------------------------------------------------------------------
  const FT = (fn, calls) => `module code4(input [3:0] b,
             output [3:0] g);
${fn}
endmodule

module tb;
  reg  [3:0] b;
  wire [3:0] g;
  code4 dut(.b(b), .g(g));
  task try;        // may wait
    input [3:0] v;
    begin
      b = v;
      #5 $display("%b -> %b", b, g);
    end
  endtask
  initial begin
${calls}
    $finish;
  end
endmodule`;
  const FNS = {
    gray: "  function [3:0] gray;\n    input [3:0] x;\n    gray = x ^ (x >> 1);\n  endfunction\n  assign g = gray(b);",
    swap: "  function [3:0] swap;\n    input [3:0] x;\n    swap = {x[1:0], x[3:2]};\n  endfunction\n  assign g = swap(b);",
    neg: "  function [3:0] neg;\n    input [3:0] x;\n    neg = ~x + 4'd1;\n  endfunction\n  assign g = neg(b);",
  };
  const CALLS = "    try(4'd5);\n    try(4'd6);\n    try(4'd12);";
  S.topic({
    id: 'vl-func', family: 'p12-reuse', order: 20, title: 'Functions and tasks',
    blurb: 'A function computes one value from its inputs in no time, so it can sit in an expression, even in hardware. A task is a named piece of procedure that may wait (#, @), so it belongs in testbenches. Follow the cursor into the task and back.',
    inputs: [{ id: 'src', kind: 'program', label: 'Verilog (module code4, then tb)', def: FT(FNS.gray, CALLS), check: P.compiles('Verilog') }],
    presets: [
      { label: 'Gray code: x ^ (x >> 1)', values: { src: FT(FNS.gray, CALLS) } },
      { label: 'Swap the halves', values: { src: FT(FNS.swap, CALLS) } },
      { label: 'Negate: ~x + 1', values: { src: FT(FNS.neg, CALLS) } },
    ],
    counters: [{ id: 'calls', label: 'task calls' }],
    run(inp) {
      const src = inp.src;
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const hw = K.code.hardware(src, { top: 'code4', tb: 'tb' });
      const fnLine = P.findLine(src, /^\s*function/), asg = P.findLine(src, /assign g/), taskLine = P.findLine(src, /^\s*task/);
      const callLines = K.code.lines(src).map((l, i) => (/^\s*try\(/.test(l) ? i + 1 : 0)).filter(Boolean);
      const F = new S.Frames(['calls']);
      const intro = P.scene({ code: { src, hot: [fnLine, asg] }, right: [P.built(hw, {}), P.waves({ waves: run.waves, rows: ['tb.b', 'tb.g'], t: 0, t1: run.time, w: 320 })], focus: 'right' });
      F.add(P.frame(intro, 'Lines ' + fnLine + ' to ' + (asg - 1) + ' define a function: one input, one result, no waiting. Line ' + asg + ' uses it in a continuous assignment, so g is the function of b at every moment. A synthesis tool pastes the function\'s body in where it is called: ' + ((hw.trace || []).filter((x) => /becomes/.test(x.say)).map((x) => x.say).join('; ') || 'plain logic') + '.'));
      const askedP = new Set();
      const walk = P.walkFrames({
        src, run, hw, console: true, w: 320, watch: ['tb.b', 'tb.g'], rows: ['tb.b', 'tb.g'],
        keep: (m) => m.kind === 'stmt' || (m.kind === 'assign' && m.line === asg),
        hide: (n) => n.split('.').length > 2 && !/^tb\.dut\.[^.]+$/.test(n),
        ask(m) {
          const p = m.prints[0];
          if (!p || askedP.has(p)) return null;
          askedP.add(p);
          const [l, r] = p.split(' -> ');
          return { ask: 'b = ' + l + '. What will line ' + m.line + ' print after the arrow?', options: P.opts(r, l), answer: r, before: 'The task waited 5 ns; now it prints.' };
        },
        say(m) {
          if (callLines.includes(m.line)) { F.count('calls'); return 'The initial block calls the task: the cursor jumps to its body (line ' + (taskLine + 1) + ' on), with v = ' + (/try\((.*)\)/.exec(P.lineText(src, m.line)) || [])[1] + '.'; }
          if (m.kind === 'assign') return 'The function is worked out at once from the new b.';
          if (/#5/.test(P.lineText(src, m.line))) return 'The task waits 5 ns here; the initial block that called it waits with it.';
          return '';
        },
      });
      for (const f of walk.frames) F.add(f);
      F.add(P.frame(walk.scene(null, []), P.cap(P.plural(F.counts.calls, 'call')) + ', each a jump into the task and back after its delay. A function may not contain # or @ and returns one value; a task may wait and gives results through output arguments. Functions are fine in hardware; tasks with delays are for testbenches.', { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'table', title: 'Function or task', colHead: ['', 'function', 'task'], rows: [['waits (#, @)', 'no', 'yes'], ['returns', 'one value', 'outputs'], ['used in', 'expressions', 'statements'], ['synthesisable', 'yes', 'without waits']] }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'Can a function contain #5?', options: ['No: a function takes no time', 'Yes', 'Only in testbenches', 'Only with automatic'], answer: 0, why: 'A function must return at once; use a task to wait.' },
      { q: 'Where may a function be called?', options: ['Anywhere an expression may go, including assign', 'Only in initial blocks', 'Only in tasks', 'Only in always blocks'], answer: 0, why: 'It is an expression with a value.' },
      { q: 'What does synthesis do with a function call?', options: ['Builds the function\'s logic where it is used', 'Builds a processor', 'Ignores it', 'Builds a memory'], answer: 0, why: 'The body is expanded in place.' },
      { q: 'The Gray code of 0110 (x ^ (x >> 1)) is…', options: ['0101', '0110', '0011', '1001'], answer: 0, why: '0110 ^ 0011 = 0101.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Hierarchy: instances and named connections
  // ---------------------------------------------------------------------------------------------------
  const HIER = (h1, h2) => `module half(input x, y,
            output s, c);
  assign s = x ^ y;
  assign c = x & y;
endmodule

module full(input a, b, ci,
            output co, s);
  wire s1, c1, c2;
  ${h1}
  ${h2}
  assign co = c1 | c2;
endmodule

module tb;
  reg a, b, ci;
  wire co, s;
  integer k;
  full dut(.a(a), .b(b), .ci(ci),
           .co(co), .s(s));
  initial
    for (k = 0; k < 8; k = k+1) begin
      {a, b, ci} = k;
      #10 $display("%b%b%b %b%b",
                   a, b, ci, co, s);
    end
endmodule`;
  const HI = {
    named: ['half h1(.x(a), .y(b), .s(s1), .c(c1));', 'half h2(.x(s1), .y(ci), .s(s), .c(c2));'],
    pos: ['half h1(a, b, s1, c1);', 'half h2(s1, ci, s, c2);'],
    bad: ['half h1(a, b, c1, s1);', 'half h2(s1, ci, s, c2);'],
  };
  for (const k of Object.keys(HI)) HI[k] = HI[k].map((l) => l.replace(/half (h\d)\((.{20,})\);/, (m, n, args) => 'half ' + n + '(' + args.replace(/, \.s/, ',\n           .s') + ');'));
  /** the full adder drawn as two half-adder blocks and an OR gate */
  let hierRes = null;
  function hierLayout() {
    if (hierRes) return hierRes;
    const N = S.Netlist;
    const h = new N.Circuit('half');
    const x = h.input('x').pin('y'), y = h.input('y').pin('y'), g1 = h.add('XOR', { n: 2 }), g2 = h.add('AND', { n: 2 });
    h.connect(x, g1.pin('i0'), g2.pin('i0')); h.connect(y, g1.pin('i1'), g2.pin('i1'));
    h.connect(g1.pin('y'), h.output('s')); h.connect(g2.pin('y'), h.output('c'));
    const PINS = { inputs: [{ name: 'x', label: 'x' }, { name: 'y', label: 'y' }], outputs: [{ name: 'c', label: 'c' }, { name: 's', label: 's' }] };
    const f = new N.Circuit('full');
    const a = f.input('a'), b = f.input('b'), ci = f.input('ci');
    const h1 = f.add('BLOCK', Object.assign({ circuit: h, title: 'h1' }, PINS), 'h1');
    const h2 = f.add('BLOCK', Object.assign({ circuit: h, title: 'h2' }, PINS), 'h2');
    const or = f.add('OR', { n: 2 }, 'g1');
    f.connect(a, h1.pin('x')); f.connect(b, h1.pin('y'));
    f.connect(h1.pin('s'), h2.pin('x')); f.connect(ci, h2.pin('y'));
    f.connect(h1.pin('c'), or.pin('i0')); f.connect(h2.pin('c'), or.pin('i1'));
    const co = f.output('co'), s = f.output('s');
    f.connect(h2.pin('s'), s); f.connect(or.pin('y'), co);
    f.name(h1.pin('s'), 's1', true); f.name(h1.pin('c'), 'c1', false); f.name(h2.pin('c'), 'c2', false);
    f.name(h2.pin('s'), 's', false); f.name(or.pin('y'), 'co', false);
    hierRes = K.schem.layout(f);
    return hierRes;
  }
  S.topic({
    id: 'vl-hier', family: 'p12-reuse', order: 30, title: 'Hierarchy: modules inside modules',
    blurb: 'A full adder made of two half adders and an OR gate: each "half h1(…)" places a copy of half and joins its ports to wires. Named connections (.x(a)) say which port gets which wire; positional ones rely on the order, and one slip swaps two signals without a word of warning.',
    inputs: [{ id: 'src', kind: 'program', label: 'Verilog (half, full, then tb)', def: HIER(...HI.named), check: P.compiles('Verilog') }],
    presets: [
      { label: 'Named connections', values: { src: HIER(...HI.named) } },
      { label: 'By position', values: { src: HIER(...HI.pos) } },
      { label: 'By position, two swapped', values: { src: HIER(...HI.bad) } },
    ],
    counters: [{ id: 'wrong', label: 'wrong answers' }],
    run(inp) {
      const src = inp.src;
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const res = hierLayout();
      const vals = (t) => { const v = {}; for (const n of ['a', 'b', 'ci']) v[n] = show(K.code.at(run.waves, 'tb.' + n, t)); for (const n of ['s1', 'c1', 'c2', 's', 'co']) v[n] = show(K.code.at(run.waves, 'tb.dut.' + n, t)); return v; };
      const h1 = P.findLine(src, /half h1/), h2 = P.findLine(src, /half h2/);
      // the hierarchy, from the elaborated design
      const tree = [];
      const walkScope = (sc, d) => { if (!sc || d > 3 || /^\$/.test(sc.name) || sc.kind === 'block') return; tree.push('  '.repeat(d) + sc.path + (sc.module ? '  (' + sc.module + ')' : '')); for (const ch of sc.children) walkScope(ch, d + 1); };
      try { for (const sc of S.Verilog.elaborate(run.compiled).scopes) walkScope(sc, 0); } catch (e) { tree.push('(could not list the instances)'); }
      const F = new S.Frames(['wrong']);
      const pic = (t, hot, parts, notes, focus) => P.scene({ code: { src, hot, notes }, under: [P.lines(tree, { title: 'Instances', key: 'tree', hot: [] })], right: [P.circuit(res, { title: 'full, as its instances', hot: parts, values: t === null ? undefined : vals(t) }), P.waves({ waves: run.waves, rows: ['tb.a', 'tb.b', 'tb.ci', 'tb.dut.s1', 'tb.co', 'tb.s'], t: t === null ? 0 : t, t1: run.time, w: 320, ticks: 4 })], focus });
      const named = /\.x\(/.test(P.stmtText(src, h1));
      const swapped = /c1\s*,\s*s1/.test(P.stmtText(src, h1));
      F.add(P.frame(pic(null, [h1, h2], ['h1', 'h2'], {}, 'right'), 'Lines ' + h1 + ' and ' + h2 + ' each place a half adder inside full: two copies of the same module, h1 and h2, each with its own wires. The tree below the code is the hierarchy the simulator builds: tb holds dut, which holds h1 and h2.'));
      const args = (l) => ((/\((.*)\)/.exec(P.stmtText(src, l)) || [])[1] || '');
      F.add(P.frame(pic(null, [h1], ['h1'], {}, 'code'), named ? 'Named: ' + args(h1) + ' — each port is named, so the order does not matter and a missing or misspelt port is an error the tool reports.' : 'By position: ' + args(h1) + ' — the first wire goes to the first port declared in half (x), the second to y, the third to s, the fourth to c. Nothing checks that the order is the one meant.' + (swapped ? ' Here c1 is third, so it lands on s, and s1 on c: the sum and carry of h1 are swapped.' : '')));
      const ms = P.moments(run).filter((m) => m.prints.length);
      let wrong = 0;
      ms.forEach((m, i) => {
        const p = m.prints[0];
        const [abc, cs] = [p.slice(0, 3), p.slice(-2)];
        const sum = [...abc].reduce((x, y) => x + +y, 0), want = (sum >> 1) + '' + (sum & 1);
        const ok = cs === want;
        if (!ok) { wrong++; F.count('wrong'); }
        if (i === 3) F.add(P.frame(pic(m.t - 1e-6, [], [], {}, 'code'), 'a b ci = ' + abc + '.', { meta: { q: { ask: 'What will this full adder give for co s?', options: ['00', '01', '10', '11'], answer: cs } } }));
        F.add(P.frame(pic(m.t, [m.line], ok ? [] : ['h1'], { [m.line]: p }, ok ? 'code' : 'right'), 'At ' + P.ns(m.t) + ' it prints "' + p + '": a b ci = ' + abc + ', co s = ' + cs + '. ' + (ok ? 'Right: ' + abc + ' has ' + P.plural(sum, 'one') + ', ' + want + ' in binary.' : 'Wrong: ' + abc + ' has ' + P.plural(sum, 'one') + ', which is ' + want + ' in binary.' + (swapped ? ' h1\'s carry went where its sum should be.' : ''))));
      });
      F.add(P.frame(pic(run.time, [], [], {}, 'right'), wrong ? wrong + ' of ' + ms.length + ' answers are wrong, and the code compiled without a complaint' + (swapped ? ': the ports of half are all 1 bit wide, so swapping two of them is legal. Named connections make the mistake visible: .s(c1) reads wrong.' : '.') : 'All ' + ms.length + ' rows are right. The hierarchy is only a way of writing: a synthesis tool flattens it into the gates of both half adders and the OR, the same circuit as if it had been written flat.', { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'math', title: 'Connecting ports', text: ['half h1(.x(a), .y(b), .s(s1), .c(c1));', '  named: any order, checked', 'half h1(a, b, s1, c1);', '  by position: the order of half\'s ports'].join('\n') }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'module m(input p, q, output z); — in "m u(n1, n2, n3);", which wire meets z?', options: ['n3', 'n1', 'n2', 'none'], answer: 0, why: 'By position: p, q, z.' },
      { q: 'Why prefer named connections?', options: ['The order cannot be wrong, and a misnamed port is an error', 'They simulate faster', 'They make fewer gates', 'Positional ones are not allowed'], answer: 0, why: 'Each port is written beside its wire.' },
      { q: 'Two instances of the same module…', options: ['each have their own wires and state', 'share their wires', 'must have different names for their ports', 'cannot be in one module'], answer: 0, why: 'Each instance is a separate copy.' },
      { q: 'What does synthesis do with the hierarchy?', options: ['Usually flattens it into one netlist of gates', 'Builds a processor per module', 'Ignores the inner modules', 'Refuses more than one level'], answer: 0, why: 'The boundaries are for writing, not for the gates.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
