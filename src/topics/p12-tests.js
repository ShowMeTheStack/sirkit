// Part 12, testbenches: initial blocks and delays with $display, $monitor and $finish (the clock of simulated
// time moving on), a testbench that checks every answer itself, test vectors read from a file with $readmemh,
// and the value change dump a waveform viewer reads.
(function (S) {
  'use strict';
  const K = S.Kit, P = S.P12;
  const show = P.show;

  // ---------------------------------------------------------------------------------------------------
  // initial, delays, $display, $monitor, $finish
  // ---------------------------------------------------------------------------------------------------
  const INIT = {
    delays: `module tb;
  reg [3:0] n;
  reg go;
  initial begin
    n = 0; go = 0;
    #5  go = 1;
    #10 n = n + 3;
    #10 n = n + 3;
    #5  $display("t=%0t n=%0d",
                 $time, n);
    #5  $finish;
  end
  initial
    $monitor("t=%0t go=%b n=%0d",
             $time, go, n);
endmodule`,
    clock: `module tb;
  reg clk;
  integer ticks;
  initial begin
    clk = 0; ticks = 0;
    forever #5 clk = ~clk;
  end
  always @(posedge clk) begin
    ticks = ticks + 1;
    $display("edge %0d at %0t",
             ticks, $time);
  end
  initial #32 $finish;
endmodule`,
    two: `module tb;
  reg a, b;
  initial begin
    a = 0;
    #4 a = 1;
    #4 a = 0;
  end
  initial begin
    b = 0;
    #6 b = 1;
    #6 $finish;
  end
  initial
    $monitor("%0t: a=%b b=%b",
             $time, a, b);
endmodule`,
  };
  S.topic({
    id: 'vl-initial', family: 'p12-tests', order: 10, title: 'initial, delays and printing',
    blurb: 'A testbench is code that runs once: initial blocks, all starting at time 0 side by side, each waiting with #. $display prints when it runs; $monitor prints whenever something it watches changes, at the end of the time step; $finish stops everything. Follow simulated time as it jumps.',
    inputs: [{ id: 'src', kind: 'program', label: 'Verilog (a testbench called tb)', def: INIT.delays, check: P.compiles('Verilog') }],
    presets: [
      { label: 'Delays add up', values: { src: INIT.delays } },
      { label: 'A clock with forever', values: { src: INIT.clock } },
      { label: 'Two initial blocks at once', values: { src: INIT.two } },
    ],
    counters: [{ id: 'jumps', label: 'times time moved' }, { id: 'lines', label: 'lines printed' }],
    run(inp) {
      const src = inp.src;
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const watch = [...run.waves.keys()].filter((k) => k.split('.').length === 2).slice(0, 4);
      const F = new S.Frames(['jumps', 'lines']);
      const delayOf = (l) => { const m = /#(\d+)/.exec(P.lineText(src, l)); return m ? +m[1] : null; };
      let lastT = 0, asked = 0;
      const all = P.moments(run);
      const walk = P.walkFrames({
        src, run, watch, console: true, w: 320, max: 46,
        keep: (m) => m.kind === 'stmt' || m.kind === 'time' || m.kind === 'print',
        ask(m) {
          if (m.kind !== 'stmt' || asked >= 3 || !m.line) return null;
          const d = delayOf(m.line);
          if (d === null || m.t === 0 || /forever/.test(P.lineText(src, m.line))) return null;
          asked++;
          const opts = P.opts(m.t + ' ns', d + ' ns', (m.t + d) + ' ns', Math.max(0, m.t - d) === m.t ? (m.t + 1) + ' ns' : Math.max(0, m.t - d) + ' ns');
          return { ask: 'Line ' + m.line + ' starts with #' + d + '. At what time does its statement run?', options: opts, answer: m.t + ' ns', before: 'The block reaches line ' + m.line + ', which waits ' + d + ' ns from the moment it is reached.' };
        },
        say(m) {
          if (m.kind === 'time') { F.count('jumps'); lastT = m.t; return 'Nothing was due in between, so the simulator skips straight here.'; }
          if (m.prints.length || m.kind === 'print') F.count('lines', Math.max(1, m.prints.length));
          const txt = P.lineText(src, m.line || 0);
          if (/\$monitor/.test(txt)) return '$monitor prints now and again at the end of every time step in which one of its values changed.';
          if (m.kind === 'print') return 'That is $monitor: something it watches changed during this time step, so it prints once the step has settled.';
          if (/\$finish/.test(txt)) return '$finish ends the simulation here.';
          if (/forever/.test(txt)) return 'forever repeats its statement for as long as the simulation runs: wait 5 ns, invert clk, again.';
          const d = delayOf(m.line);
          return d !== null ? '(#' + d + ' meant: wait ' + d + ' ns after the statement before, then run this one.)' : '';
        },
      });
      void all;
      for (const f of walk.frames) F.add(f);
      F.add(P.frame(walk.scene(null, []), 'The simulation ended at ' + P.ns(run.time) + ' with ' + P.plural(run.output.length, 'line') + ' printed. Every initial block started at 0 and ran until it waited; the simulator always moves to the next moment anything is due, never through the time in between.', { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'table', title: 'Printing', colHead: ['task', 'prints'], rows: [['$display', 'when it runs'], ['$write', 'the same, no new line'], ['$strobe', 'at the end of this time step'], ['$monitor', 'whenever a value it shows changes']] }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'initial begin #3 a = 1; #4 b = 1; end — when does b become 1?', options: ['7 ns', '4 ns', '3 ns', '12 ns'], answer: 0, why: 'Delays add up along a block: 3 + 4.' },
      { q: 'Two initial blocks in one module run…', options: ['side by side, both starting at time 0', 'one after the other', 'only the first', 'in a random order, one at a time to the end'], answer: 0, why: 'Every initial block starts at 0 as a process of its own.' },
      { q: 'When does $monitor print?', options: ['At the end of any time step in which a value it shows changed', 'Only when it runs', 'Every ns', 'At $finish'], answer: 0, why: 'It watches its arguments for the rest of the run.' },
      { q: 'What does a synthesis tool do with an initial block in a design?', options: ['Ignores it (it only sets up a simulation)', 'Builds a counter', 'Builds a reset circuit', 'Refuses the design'], answer: 0, why: 'Hardware has no "once at time 0" to run.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Self-checking testbench
  // ---------------------------------------------------------------------------------------------------
  const SELF = (body) => `module add2(input [1:0] a, b,
            output [2:0] s);
  ${body}
endmodule

module tb;
  reg [1:0] a, b;
  wire [2:0] s;
  integer i, bad;
  add2 dut(.a(a), .b(b), .s(s));
  initial begin
    bad = 0;
    for (i = 0; i < 16; i = i+1) begin
      {a, b} = i;
      #1 if (s !== a + b) begin
        bad = bad + 1;
        $display("%0d+%0d gave %0d",
                 a, b, s);
      end
    end
    $display("%0d errors", bad);
    $finish;
  end
endmodule`;
  const SBODY = { ok: 'assign s = a + b;', carry: 'assign s = {1\'b0, a + b};', or: 'assign s = a | b;' };
  S.topic({
    id: 'vl-selfcheck', family: 'p12-tests', order: 20, title: 'A testbench that checks itself',
    blurb: 'Instead of reading waveforms, let the testbench know the right answers: try every input, compare the module\'s output with what it should be, count and report the differences. Here a 2-bit adder is checked on all 16 pairs.',
    inputs: [{ id: 'src', kind: 'program', label: 'Verilog (module add2, then tb)', def: SELF(SBODY.ok), check: P.compiles('Verilog') }],
    presets: [
      { label: 'A correct adder', values: { src: SELF(SBODY.ok) } },
      { label: 'An adder that drops the carry', values: { src: SELF(SBODY.carry) } },
      { label: 'OR instead of add', values: { src: SELF(SBODY.or) } },
    ],
    counters: [{ id: 'tried', label: 'pairs tried' }, { id: 'bad', label: 'errors' }],
    run(inp) {
      const src = inp.src;
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const ifLine = P.findLine(src, /if \(s !== a \+ b\)/), dispLine = ifLine + 2, forLine = P.findLine(src, /for \(i = 0/), sumLine = P.findLine(src, /errors"/);
      const asg = P.findLine(src, /^\s*assign s/);
      const allM = P.moments(run), sts = P.states(allM);
      const ms = allM.map((m, k) => Object.assign({ st: sts[k] }, m)).filter((m) => m.kind === 'stmt' && m.line === ifLine);
      const rows = [];
      const F = new S.Frames(['tried', 'bad']);
      const table = (hot) => P.table({ title: 'The checks so far', key: 'chk', head: ['a', 'b', 's', 'a+b', ''], rows: rows.length ? rows.slice(-8) : [['', '', '', '', '']], hot: hot === undefined ? null : Math.min(hot, 7), cls: (r, c) => (c === 4 && rows.slice(-8)[r] && rows.slice(-8)[r][4] === 'wrong' ? 'bad' : c === 4 && rows.slice(-8)[r] && rows.slice(-8)[r][4] === 'ok' ? 'good' : '') });
      const printed = [];
      const pic = (hot, notes, tHot, t) => P.scene({ code: { src, hot, notes }, under: [P.console(printed, { rows: 4 })], right: [table(tHot), P.waves({ waves: run.waves, rows: ['tb.a', 'tb.b', 'tb.s'], t, t1: run.time, w: 320, ticks: 4 })] });
      F.add(P.frame(pic([forLine, ifLine], {}, undefined, 0), 'The loop runs i from 0 to 15 and splits it into a and b, so every pair of 2-bit numbers is tried. After #1 (time for the module to answer), line ' + ifLine + ' compares s with a + b, worked out by the testbench itself. !== compares all four values, so an x or z in s counts as wrong too.'));
      let asked = 0, bad = 0;
      ms.forEach((m, k) => {
        const a = m.st['tb.a'] || 'x', b = m.st['tb.b'] || 'x', s = m.st['tb.s'] || m.st['tb.dut.s'] || 'x';
        const want = parseInt(a, 2) + parseInt(b, 2), got = parseInt(s, 2);
        const ok = got === want;
        F.count('tried');
        if (!ok) { bad++; F.count('bad'); }
        const showIt = k < 3 || (!ok && bad <= 3) || k === ms.length - 1;
        if (showIt && asked < 3 && (k === 2 || (!ok && asked < 2))) {
          asked++;
          F.add(P.frame(pic([asg, ifLine], { [asg]: 's = ' + s }, rows.length, m.t), 'a = ' + a + ', b = ' + b + ' and the module gives s = ' + s + ' (' + got + ').', { meta: { q: { ask: 'Will the check on line ' + ifLine + ' find an error?', options: ['yes', 'no'], answer: ok ? 'no' : 'yes' } } }));
        }
        rows.push([a, b, s, String(want), ok ? 'ok' : 'wrong']);
        if (!ok) printed.push(m.prints[0] || (parseInt(a, 2) + '+' + parseInt(b, 2) + ' gave ' + got));
        const ps = P.moments(run).filter((x) => x.t === m.t && x.prints.length);
        if (!ok && ps.length) printed[printed.length - 1] = ps[0].prints[0];
        if (showIt) F.add(P.frame(pic(ok ? [ifLine] : [ifLine, dispLine], ok ? { [ifLine]: 'pass' } : { [ifLine]: 'error ' + bad }, rows.length - 1, m.t), 'Pair ' + (k + 1) + ': ' + parseInt(a, 2) + ' + ' + parseInt(b, 2) + ' should be ' + want + '; s = ' + got + '. ' + (ok ? 'They agree.' : 'They differ: bad goes up to ' + bad + ' and the testbench prints the case.')));
      });
      printed.push(run.output[run.output.length - 1] || '');
      F.add(P.frame(pic([sumLine], { [sumLine]: run.output[run.output.length - 1] || '' }, undefined, run.time), 'All 16 pairs tried in ' + P.ns(run.time) + ' of simulated time; the testbench reports "' + (run.output[run.output.length - 1] || '') + '". ' + (bad ? 'The failing cases point straight at the bug: ' + (/1'b0/.test(P.lineText(src, asg)) ? 'every pair whose sum needs 3 bits, so the carry is lost.' : 'pairs with 1s in the same place, where OR differs from adding.') : 'A testbench like this can be run again after every change, and says at once whether anything broke.'), { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'math', title: 'The pattern', text: ['for every input:', '  apply it; wait', '  if (out !== expected)', '    count it, print it', 'report the count'].join('\n') }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'Why wait #1 after setting the inputs before checking?', options: ['So the module\'s outputs have updated', 'To slow the test down', 'Because if needs a delay', 'It is not needed'], answer: 0, why: 'Checking in the same instant can read the old output.' },
      { q: 'Why use !== rather than != in the check?', options: ['!= with an x gives x, which if treats as false, hiding the error', '!== is faster', '!= is not allowed', 'They are the same'], answer: 0, why: '!== compares x and z exactly, so an unknown output fails.' },
      { q: 'How many cases does an exhaustive test of a 3-input module need?', options: ['8', '3', '6', '9'], answer: 0, why: '2 to the power 3.' },
      { q: 'What makes a testbench self-checking?', options: ['It knows the expected outputs and compares them', 'It uses $monitor', 'It has no delays', 'It runs forever'], answer: 0, why: 'No one has to read waveforms to know it passed.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // $readmemh: test vectors from a file
  // ---------------------------------------------------------------------------------------------------
  const MEMTB = `module add4(input [3:0] a, b,
            output [3:0] s);
  assign s = a + b;
endmodule

module tb;
  reg [11:0] v [0:3];   // a b sum
  reg [3:0] a, b, want;
  wire [3:0] s;
  integer k;
  add4 dut(.a(a), .b(b), .s(s));
  initial begin
    $readmemh("vec.hex", v);
    for (k = 0; k < 4; k = k+1) begin
      {a, b, want} = v[k];
      #1 if (s !== want)
        $display("row %0d: %h+%h=%h, not %h",
                 k, a, b, s, want);
    end
    $display("done");
  end
endmodule`;
  const FILES = {
    ok: '// a b sum, one row per line\n358\n2ac\n718\n000\n',
    wrong: '// a b sum: row 2 is wrong\n358\n2ac\n716\n000\n',
    at: '// @n starts at word n\n358\n@2\n718\n@1\n2ac\n@3\n000\n',
  };
  /** what $readmemh puts where: [{addr, text, line}] from a file */
  function readHex(text) {
    const out = [];
    let addr = 0;
    String(text).split('\n').forEach((l, i) => {
      for (const w of l.replace(/\/\/.*$/, '').trim().split(/\s+/).filter(Boolean)) {
        if (w[0] === '@') { addr = parseInt(w.slice(1), 16); continue; }
        out.push({ addr, text: w, line: i + 1 });
        addr++;
      }
    });
    return out;
  }
  S.topic({
    id: 'vl-readmemh', family: 'p12-tests', order: 30, title: '$readmemh: test vectors from a file',
    blurb: 'Test cases can live in a text file of hex numbers, one word per memory location. $readmemh fills a memory with them in one go, and the testbench walks through it, applying each word and checking the answer stored beside it.',
    inputs: [
      { id: 'file', kind: 'program', label: 'vec.hex', def: FILES.ok, check: (v) => { const bad = String(v).replace(/\/\/.*$/gm, '').split(/\s+/).filter(Boolean).find((w) => !/^(@[0-9a-fA-F]+|[0-9a-fA-FxXzZ_]+)$/.test(w)); return bad ? 'vec.hex: "' + bad + '" is not a hex number or @address' : null; } },
    ],
    presets: [
      { label: 'Four good rows', values: { file: FILES.ok } },
      { label: 'A wrong expected sum', values: { file: FILES.wrong } },
      { label: '@ addresses', values: { file: FILES.at } },
    ],
    counters: [{ id: 'rows', label: 'rows checked' }, { id: 'bad', label: 'mismatches' }],
    run(inp) {
      const src = MEMTB, file = String(inp.file);
      const run = K.code.run(src, { files: { 'vec.hex': file } });
      if (!run.ok) return P.errorFrames(src, run);
      const words = readHex(file);
      const mem = [0, 1, 2, 3].map((a) => { const w = words.filter((x) => x.addr === a).pop(); return w ? w.text.padStart(3, '0').slice(-3) : 'xxx'; });
      const rd = P.findLine(src, '$readmemh'), unpack = P.findLine(src, /\{a, b, want\}/), chk = unpack + 1;
      const F = new S.Frames(['rows', 'bad']);
      const printed = [];
      const memTable = (filled, hot) => P.table({ title: 'v after $readmemh', key: 'mem', head: ['address', 'a', 'b', 'sum'], rows: [0, 1, 2, 3].map((a) => [String(a)].concat(a < filled || filled === 4 ? [...mem[a]] : ['', '', ''])), hot });
      const fileBox = (hot) => P.lines(K.code.lines(file).slice(0, 9), { title: 'vec.hex', key: 'file', hot });
      const pic = (hot, notes, filled, mhot, fhot, t, focus) => P.scene({ code: { src, hot, notes }, under: [P.console(printed, { rows: 3 })], right: [fileBox(fhot || []), memTable(filled, mhot), P.waves({ waves: run.waves, rows: ['tb.a', 'tb.b', 'tb.s', 'tb.want'], t, t1: run.time, w: 300, ticks: 4 })], focus });
      F.add(P.frame(pic([P.findLine(src, /reg \[11:0\] v/)], {}, 0, null, [], 0, 'right'), 'v is a memory: four words of 12 bits, v[0] to v[3]. Each word holds three hex digits: a, b and the sum a + b should give. The file vec.hex on the right holds the words as text.'));
      words.forEach((w, i) => {
        if (w.addr > 3) return;
        F.add(P.frame(pic([rd], {}, 4, w.addr, [w.line - 1], 0, 'right'), '$readmemh reads "' + w.text + '" from line ' + w.line + ' of the file into v[' + w.addr + ']' + (i && words[i - 1].addr !== w.addr - 1 ? ' (an @ line moved the address)' : '') + '. Comments and spaces are skipped.'));
      });
      const allM = P.moments(run), sts = P.states(allM);
      const checks = allM.map((m, k) => Object.assign({ st: sts[k] }, m)).filter((m) => m.kind === 'stmt' && m.line === chk);
      checks.forEach((m, k) => {
        const a = m.st['tb.a'] || 'xxxx', b = m.st['tb.b'] || 'xxxx', s = m.st['tb.s'] || m.st['tb.dut.s'] || 'xxxx', want = m.st['tb.want'] || 'xxxx';
        const hx = (x) => parseInt(x, 2).toString(16);
        const ok = s === want;
        F.count('rows');
        if (k === 1) F.add(P.frame(pic([unpack], { [unpack]: 'a=' + hx(a) + ' b=' + hx(b) + ' want=' + hx(want) }, 4, k, [], m.t - 1e-6, 'code'), 'Row ' + k + ': v[' + k + '] = ' + mem[k] + ' splits into a = ' + hx(a) + ', b = ' + hx(b) + ', want = ' + hx(want) + '.', { meta: { q: { ask: 'Will row ' + k + ' pass the check?', options: ['yes', 'no'], answer: ok ? 'yes' : 'no' } } }));
        if (!ok) { F.count('bad'); const p = P.moments(run).find((x) => x.t === m.t && x.prints.length); if (p) printed.push(p.prints[0]); }
        F.add(P.frame(pic([unpack, chk], { [chk]: ok ? 'pass' : 'mismatch' }, 4, k, [], m.t, 'code'), 'Row ' + k + ': ' + hx(a) + ' + ' + hx(b) + ' gives s = ' + hx(s) + '; the file says ' + hx(want) + '. ' + (ok ? 'Pass.' : 'Mismatch: either the module or the vector is wrong, and the message says which row to look at.')));
      });
      printed.push('done');
      F.add(P.frame(pic([P.findLine(src, '"done"')], {}, 4, null, [], run.time, 'right'), F.counts.bad ? F.counts.bad + ' row' + (F.counts.bad > 1 ? 's' : '') + ' did not match. Here the module is right and the vector is wrong (' + mem.find((x, i) => ((parseInt(x[0], 16) + parseInt(x[1], 16)) & 15) !== parseInt(x[2], 16) && i < 4) + '): test data can have bugs too.' : 'All ' + F.counts.rows + ' rows passed. More cases mean only more lines in the file; the testbench stays the same. A program or a spreadsheet can write the vectors.', { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'math', title: 'The file format', text: ['hex words separated by spaces or lines', '// comments are skipped', '@3   continue at address 3', '$readmemb reads binary instead'].join('\n') }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'reg [7:0] m [0:15]; $readmemh("f.hex", m); fills…', options: ['m[0], m[1], … from the words in f.hex', 'one 128-bit register', 'only m[0]', 'the file from m'], answer: 0, why: 'Each word goes to the next address.' },
      { q: 'In a hex file for $readmemh, what does @8 do?', options: ['The next word goes to address 8', 'Writes the value 8', 'Repeats the last word 8 times', 'Is a comment'], answer: 0, why: '@ sets the address.' },
      { q: 'Which task reads a file of binary numbers?', options: ['$readmemb', '$readmemh', '$fread', '$display'], answer: 0, why: 'b for binary, h for hex.' },
      { q: 'A vector row fails. What can be wrong?', options: ['The module, or the expected value in the file', 'Only the module', 'Only the file', 'Nothing: rows cannot fail'], answer: 0, why: 'Test data is written by people too.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // VCD: the value change dump
  // ---------------------------------------------------------------------------------------------------
  const VCDSRC = (body) => `\`timescale 1ns/1ns
module tb;
  reg clk, d, q;
  initial begin
    $dumpfile("run.vcd");
    $dumpvars(0, tb);
${body}
  end
  always #5 clk = ~clk;
  always @(posedge clk) q <= d;
endmodule`;
  const VBODY = {
    plain: '    clk = 0; d = 0;\n    #4 d = 1;\n    #12 d = 0;\n    #12 $finish;',
    late: '    clk = 0; d = 0;\n    #4 d = 1;\n    #12 $dumpoff;\n    #8 d = 0;\n    #2 $dumpon;\n    #6 $finish;',
  };
  S.topic({
    id: 'vl-vcd', family: 'p12-tests', order: 40, title: 'Dumping waveforms: VCD',
    blurb: '$dumpvars writes every change of the signals it is given to a value change dump (a .vcd file), the plain text any waveform viewer reads. Watch the file grow: a header naming each signal by a short code, then each moment as #time followed by the codes that changed.',
    inputs: [{ id: 'src', kind: 'program', label: 'Verilog (a testbench called tb)', def: VCDSRC(VBODY.plain), check: P.compiles('Verilog') }],
    presets: [
      { label: 'A flip-flop', values: { src: VCDSRC(VBODY.plain) } },
      { label: '$dumpoff and $dumpon', values: { src: VCDSRC(VBODY.late) } },
    ],
    counters: [{ id: 'times', label: 'time marks' }, { id: 'changes', label: 'changes written' }],
    run(inp) {
      const src = inp.src;
      const r = S.Verilog.run(src, {});
      if (r.errors && r.errors.length) return P.errorFrames(src, r);
      const run = K.code.run(src, {});
      const vcd = (r.vcd && r.vcd()) || '';
      const ls = vcd.replace(/\n+$/, '').split('\n');
      const ids = {};
      for (const l of ls) { const m = /^\$var \w+ (\d+) (\S+) (\w+)/.exec(l); if (m) ids[m[2]] = m[3]; }
      const endDef = ls.findIndex((l) => /\$enddefinitions/.test(l));
      // the file in sections: the header, then one section per #time
      const secs = [{ t: null, from: 0, to: endDef }];
      ls.forEach((l, i) => { if (/^#\d+/.test(l)) secs.push({ t: +l.slice(1), from: i, to: i }); else if (i > endDef && secs.length > 1) secs[secs.length - 1].to = i; });
      const F = new S.Frames(['times', 'changes']);
      let prevOff = false;
      const view = (upto, hot) => { const from = Math.max(0, upto - 13); return P.lines(ls.slice(from, upto + 1), { title: 'run.vcd (' + (upto + 1) + ' of ' + ls.length + ' lines)', key: 'vcd', hot: hot.map((h) => h - from), w: 300 }); };
      const t1 = r.time;
      const dumpLine = P.findLine(src, '$dumpvars');
      const pic = (hot, upto, vhot, t, focus) => P.scene({ code: { src, hot }, right: [view(upto, vhot), P.waves({ waves: run.waves, rows: ['tb.clk', 'tb.d', 'tb.q'], t, t1, w: 300 })], focus });
      F.add(P.frame(pic([P.findLine(src, '$dumpfile'), dumpLine], endDef, ls.map((l, i) => (/^\$var/.test(l) ? i : -1)).filter((i) => i >= 0), 0, 'right'), '$dumpfile names the file; $dumpvars(0, tb) dumps every signal in tb and below. The header gives each one a short code: ' + Object.entries(ids).map(([k, v]) => k + ' is ' + v).join(', ') + '. The timescale line says what one unit of #time is.'));
      for (const sec of secs.slice(1)) {
        const lines = ls.slice(sec.from + 1, sec.to + 1).filter((l) => /^[01xz]/.test(l) || /^b/.test(l));
        const ch = lines.map((l) => (ids[l.slice(1)] || l.slice(1)) + ' = ' + l[0]);
        F.count('times'); F.count('changes', lines.length);
        if (F.counts.times === 3) F.add(P.frame(pic([], sec.from - 1, [], sec.t - 1e-6, 'right'), 'The next moment anything changes is ' + P.ns(sec.t) + '.', { meta: { q: { ask: 'How many value lines will the dump write under #' + sec.t + '?', options: ['1', '2', '3', '0'], answer: String(lines.length) } } }));
        const off = ls.slice(sec.from, sec.to + 1).some((l) => /\$dumpoff/.test(l)), on = ls.slice(sec.from, sec.to + 1).some((l) => /\$dumpon/.test(l));
        const allX = lines.length === Object.keys(ids).length && lines.every((l) => l[0] === 'x') && sec.t > 0;
        const back = prevOff && !allX;
        prevOff = allX;
        F.add(P.frame(pic([], sec.to, [...Array(sec.to - sec.from + 1).keys()].map((k) => sec.from + k), sec.t, 'right'), '#' + sec.t + ': ' + (sec.t === 0 ? 'the starting values, between $dumpvars and $end. ' : '') + (ch.length ? ch.join(', ') + '.' : 'no values: the simulation ends here, and the last time mark closes the file.') + (allX || off ? ' $dumpoff ran: every signal is written as x, and nothing more until $dumpon.' : '') + (back || on ? ' $dumpon ran: every signal\'s present value is written again, and dumping goes on.' : '') + (ch.length && !allX && !back ? ' Only changes are written; a signal that did not change takes no space.' : '')));
      }
      F.add(P.frame(pic([], ls.length - 1, [], t1, 'right'), 'The whole dump is ' + ls.length + ' lines for ' + P.ns(t1) + ' of simulation: ' + P.plural(F.counts.changes, 'value line') + ' under ' + P.plural(F.counts.times, 'time mark') + '. A viewer redraws the waveforms from it alone; the waves beside the code are drawn from the same changes.', { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'math', title: 'A VCD file', text: ['$timescale 1ns $end', '$var wire 1 ! clk $end   code ! = clk', '$enddefinitions $end', '#5      at 5 ns:', '1!      clk = 1'].join('\n') }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'What does a VCD line "0#" mean?', options: ['The signal with code # became 0', 'Time 0', 'A comment', 'The 0th signal'], answer: 0, why: 'A value followed by the signal\'s code.' },
      { q: 'What does "#25" mean in a VCD file?', options: ['The changes below happened at time 25', 'Signal number 25', 'A delay of 25 to add', 'Line 25'], answer: 0, why: 'Time marks start with #.' },
      { q: '$dumpvars(1, tb) dumps…', options: ['the signals of tb only, not of the modules inside it', 'one signal', 'everything below tb', 'nothing'], answer: 0, why: 'The first argument is how many levels down; 0 means all.' },
      { q: 'Why does a VCD file stay small?', options: ['It records only changes, not every value at every time', 'It is compressed', 'It keeps only outputs', 'It records one value per signal'], answer: 0, why: 'Value change dump: changes only.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
