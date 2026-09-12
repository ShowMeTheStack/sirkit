// Part 12, behavioural code: always blocks and what a missing name in the sensitivity list does (simulation and
// hardware part ways), blocking and non-blocking assignment in the scheduler's regions, the shift register that
// races, if and case, casez, loops, and the latch an incomplete always block builds.
(function (S) {
  'use strict';
  const K = S.Kit, P = S.P12;
  const show = P.show;
  const TM = () => K.timing;

  // ---------------------------------------------------------------------------------------------------
  // Always blocks and sensitivity lists
  // ---------------------------------------------------------------------------------------------------
  const ALW = (list, note) => `module and3(input a, b, c,
            output reg y);
  always @(${list})${note}
    y = a & b & c;
endmodule

module tb;
  reg a, b, c;
  wire y;
  and3 dut(.a(a), .b(b), .c(c),
           .y(y));
  initial begin
    a = 1; b = 1; c = 0;
    #10 c = 1;
    #10 b = 0;
    #10 b = 1;
    #10 c = 0;
    #10 $finish;
  end
endmodule`;
  /** the stretches where two waves differ: [{t0, t1}] */
  function differ(w1, w2, t1) {
    const times = [...new Set(w1.map((q) => q[0]).concat(w2.map((q) => q[0])))].sort((a, b) => a - b);
    const at = (w, t) => { let v = 'x'; for (const q of w) if (q[0] <= t) v = q[1]; return String(v); };
    const out = [];
    times.forEach((t, i) => { const e = i + 1 < times.length ? times[i + 1] : t1; if (e > t && at(w1, t) !== at(w2, t)) { const l = out[out.length - 1]; if (l && l.t1 === t) l.t1 = e; else out.push({ t0: t, t1: e }); } });
    return out;
  }
  P.differ = differ;
  S.topic({
    id: 'vl-always', family: 'p12-behaviour', order: 10, title: 'Always blocks and sensitivity lists',
    blurb: 'An always block runs when something in its list @(…) changes, and then sleeps. Hardware has no list: a gate answers every input. Leave a name out and the simulation stops matching the circuit the code builds.',
    inputs: [{ id: 'src', kind: 'program', label: 'Verilog (module and3, then tb)', def: ALW('a or b', '  // c?'), check: P.compiles('Verilog') }],
    presets: [
      { label: 'c left out of the list', values: { src: ALW('a or b', '  // c?') } },
      { label: 'Every input listed', values: { src: ALW('a or b or c', '') } },
      { label: '@* lists them for you', values: { src: ALW('*', '') } },
    ],
    counters: [{ id: 'wakes', label: 'times the block ran' }, { id: 'sleeps', label: 'changes it slept through' }],
    run(inp) {
      const src = inp.src;
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const hw = K.code.hardware(src, { top: 'and3', tb: 'tb' });
      const t1 = run.time;
      const ySim = K.code.changes(run.waves, 'tb.y');
      const yHw = hw.ok ? K.code.changes(hw.sim.waves, 'tb.y') : [];
      const bad = differ(ySim, yHw, t1);
      const alw = P.findLine(src, /always\s*@/), body = alw + 1;
      const listTxt = (/@\s*\(([^)]*)\)/.exec(P.lineText(src, alw)) || [])[1] || '';
      const listed = listTxt.trim() === '*' ? ['a', 'b', 'c'] : listTxt.split(/\s*(?:or|,)\s*/).map((x) => x.trim()).filter(Boolean);
      const warn = {};
      for (const w of run.warnings) warn[w.line] = 'warn';
      const rows = (t) => [{ name: 'tb.a', label: 'a' }, { name: 'tb.b', label: 'b' }, { name: 'tb.c', label: 'c' }, { name: 'tb.y', label: 'y (simulation)', key: 'ysim' }, { name: 'hw', label: 'y (gates)', key: 'yhw', changes: yHw, width: 1 }];
      const spans = (t) => bad.filter((b) => b.t0 <= t).map((b, i) => ({ key: 'd' + i, t0: b.t0, t1: Math.min(b.t1, t), rows: ['ysim', 'yhw'], cls: 'bad' }));
      const pic = (t, hot, notes, focus) => P.scene({ code: { src, hot, notes, marks: warn }, under: [P.badges(['a', 'b', 'c'].map((n) => ({ name: n, v: show(K.code.at(run.waves, 'tb.' + n, t)) })).concat([{ name: 'y sim', v: show(K.code.at(run.waves, 'tb.y', t)), cls: bad.some((b) => b.t0 <= t && t < b.t1) ? 'bad' : '' }, { name: 'y gates', v: hw.ok ? show(hw.at('y', t)) : '?' }]))], right: [P.built(hw, { values: hw.values ? hw.values(t) : undefined, title: 'The circuit it builds' }), P.waves({ waves: run.waves, rows: rows(t), t, t1, w: 360, spans: spans(t) })], focus });
      const F = new S.Frames(['wakes', 'sleeps']);
      F.add(P.frame(pic(0, [alw, body], {}, 'right'), 'Line ' + alw + ' says: run the next statement whenever ' + (listTxt.trim() === '*' ? 'anything it reads changes (@* builds the list from the body: a, b and c)' : listed.join(' or ') + ' changes') + '. The statement works out y = a & b & c. A synthesis tool reads only the statement, so the circuit is one 3-input AND gate, which answers every input, list or no list.' + (run.warnings.length ? ' The checker already warns: ' + run.warnings[0].msg + '.' : '')));
      const ms = P.moments(run);
      const stimT = [...new Set(ms.filter((m) => m.kind === 'stmt' && m.scope === 'tb' && m.updates.length).map((m) => m.t))];
      for (const t of stimT) {
        const stim = ms.filter((m) => m.t === t && m.kind === 'stmt' && m.scope === 'tb' && m.updates.length);
        const ran = ms.some((m) => m.t === t && m.kind === 'stmt' && m.scope === 'tb.dut');
        const names = stim.flatMap((m) => m.updates.map((u) => P.short(u.net)));
        const ch = stim.flatMap((m) => m.updates.map((u) => P.short(u.net) + ' = ' + show(u.to)));
        const ys = show(K.code.at(run.waves, 'tb.y', t)), yh = hw.ok ? show(hw.at('y', t)) : '?';
        const lines = stim.map((m) => m.line);
        if (t > 0) F.add(P.frame(pic(t - 1e-6, lines, {}, 'code'), 'At ' + P.ns(t) + ' the testbench sets ' + ch.join(', ') + '.', { meta: { q: { ask: 'Does the always block wake up and run line ' + body + '?', options: ['yes', 'no'], answer: ran ? 'yes' : 'no', explain: ran ? 'Yes: ' + names.filter((n) => listed.includes(n)).join(' and ') + ' is in its list.' : 'No: ' + names.join(' and ') + (names.length > 1 ? ' are' : ' is') + ' not in its list @(' + listTxt.trim() + ').' } } }));
        F.count(ran ? 'wakes' : 'sleeps');
        const notes = {};
        for (const m of stim) notes[m.line] = m.updates.map((u) => P.short(u.net) + ' = ' + show(u.to)).join(', ');
        if (ran) notes[body] = 'y = ' + ys;
        const mismatch = ys !== yh;
        F.add(P.frame(pic(t, lines.concat(ran ? [body] : []), notes, mismatch ? 'right' : 'code'), 'At ' + P.ns(t) + ', ' + ch.join(', ') + '. ' + (ran ? 'That is in the list, so the block runs line ' + body + ': y = ' + ys + '.' : names.join(' and ') + (names.length > 1 ? ' are' : ' is') + ' not in the list, so the block sleeps and y keeps ' + ys + '.') + ' The gate gives y = ' + yh + '.' + (mismatch ? ' Simulation and hardware disagree from here on, until something in the list changes.' : '')));
      }
      const end = pic(t1, [], {}, 'right');
      F.add(P.frame(end, bad.length ? 'Simulation and the circuit disagreed ' + P.plural(bad.length, 'time') + ' (shaded): ' + bad.map((b) => P.ns(b.t0) + ' to ' + P.ns(b.t1)).join(', ') + '. Every test passed on such a simulation proves nothing about the chip. List every signal the block reads, or write @* and let the tool list them.' : 'Simulation and the circuit agree all the way: the block wakes for every input it reads, just as the gate does. @* is the safe habit: it can never forget a name.', { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'math', title: 'An always block', text: ['always @(a or b or c)  // runs when one changes', '  y = a & b & c;', '', 'always @*              // the list is', '  y = a & b & c;        // everything read'].join('\n') }, P.warnSection(run.warnings)]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'always @(a or b) y = a | c; What happens in simulation when only c changes?', options: ['Nothing: the block does not run', 'y follows c', 'y becomes x', 'An error'], answer: 0, why: 'The block runs only when a or b changes.' },
      { q: 'And in the synthesised circuit, when c changes?', options: ['y follows at once: the OR gate has no list', 'Nothing', 'y becomes x', 'A latch keeps y'], answer: 0, why: 'Synthesis builds the gate from the statement and ignores the list.' },
      { q: 'What does @* do?', options: ['Lists every signal the block reads', 'Runs the block at every time step', 'Runs on every clock edge', 'Waits forever'], answer: 0, why: 'The list is built from the block\'s body.' },
      { q: 'Why is a missing name in a sensitivity list dangerous?', options: ['Simulation passes while the real circuit behaves differently', 'It makes a latch', 'The code will not compile', 'It doubles the delay'], answer: 0, why: 'The two disagree, so the simulation no longer tests the chip.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Blocking and non-blocking: the scheduler's regions
  // ---------------------------------------------------------------------------------------------------
  const SWAP = {
    nb: `module tb;
  reg clk, a, b;
  always @(posedge clk)
    a <= b;
  always @(posedge clk)
    b <= a;
  initial begin
    a = 0; b = 1; clk = 0;
    #5 clk = 1;
    #1 $display("a=%b b=%b", a, b);
    $finish;
  end
endmodule`,
    bl: `module tb;
  reg clk, a, b;
  always @(posedge clk)
    a = b;
  always @(posedge clk)
    b = a;
  initial begin
    a = 0; b = 1; clk = 0;
    #5 clk = 1;
    #1 $display("a=%b b=%b", a, b);
    $finish;
  end
endmodule`,
    one: `module tb;
  reg clk, a, b;
  always @(posedge clk) begin
    a = b;
    b = a;
  end
  initial begin
    a = 0; b = 1; clk = 0;
    #5 clk = 1;
    #1 $display("a=%b b=%b", a, b);
    $finish;
  end
endmodule`,
    strobe: `module tb;
  reg clk, a, b;
  always @(posedge clk) begin
    a <= b;
    $display("display: a=%b", a);
    $strobe("strobe:  a=%b", a);
  end
  initial begin
    a = 0; b = 1; clk = 0;
    #5 clk = 1;
    #1 $finish;
  end
endmodule`,
  };
  const LANES = [['active', 'Active: running now'], ['inactive', 'Inactive: after #0'], ['nba', 'NBA: non-blocking updates'], ['postponed', 'Postponed: $strobe, $monitor']];
  /** the scheduler: one lane per region, the work queued in it as chips: lanes {region: [{text, cls}]} */
  const regions = (lanes, on, t) => (x, y) => {
    const items = [P.heading('rg:h', x, y, 'The scheduler at ' + P.ns(t))];
    const W = 400, H = 62;
    LANES.forEach(([id, title], i) => {
      const ly = y + 30 + i * (H + 10);
      items.push({ key: 'rg:' + id, kind: 'region', x, y: ly, w: W, h: H, rx: 10, text: title, cls: 'vr-lane' + (on === id ? ' on' : ''), audit: 'group' });
      let cx = x + 12;
      for (const [k, c] of (lanes[id] || []).entries()) {
        const w = Math.max(48, S.geom.textWidth(c.text, 13, { mono: true }) + 18);
        if (cx + w > x + W - 8) break;
        items.push({ key: 'rg:' + id + ':' + (c.key || k), kind: 'cell', x: cx, y: ly + 30, w, h: 24, rx: 6, text: c.text, cls: 'vr-chip ' + (c.cls || ''), size: 13 });
        cx += w + 8;
      }
    });
    return { items, box: { x, y, w: W, h: 30 + LANES.length * (H + 10) - 10 } };
  };
  S.topic({
    id: 'vl-nba', family: 'p12-behaviour', order: 20, title: 'Blocking and non-blocking assignment',
    blurb: '"=" changes a variable at once; "<=" writes the change down and makes it at the end of the time step, after everything that was woken has run. Step through the scheduler\'s regions and watch a swap work with one and fail with the other.',
    inputs: [{ id: 'src', kind: 'program', label: 'Verilog (a testbench called tb)', def: SWAP.nb, check: P.compiles('Verilog') }],
    presets: [
      { label: 'Swap with <=', values: { src: SWAP.nb } },
      { label: 'Swap with = in two blocks', values: { src: SWAP.bl } },
      { label: 'Swap with = in one block', values: { src: SWAP.one } },
      { label: '$display and $strobe', values: { src: SWAP.strobe } },
    ],
    counters: [{ id: 'nba', label: 'non-blocking updates' }],
    run(inp) {
      const src = inp.src;
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const top = run.compiled.tops[0];
      const watch = [...run.waves.keys()].filter((k) => k.split('.').length === 2).slice(0, 4);
      const t1 = run.time;
      // which label each non-blocking statement put in the queue: the region step lists them in order
      const steps = run.steps;
      const pend = [];
      const labelOf = new Map();
      steps.forEach((s, i) => {
        if (s.kind === 'stmt' && /<=/.test(P.lineText(src, s.line)) && !/\$/.test(P.lineText(src, s.line))) pend.push(i);
        if (s.kind === 'region' && s.region === 'nba') { (s.updates || []).forEach((l, k) => { if (pend[k] !== undefined) labelOf.set(pend[k], l); }); pend.length = 0; }
      });
      const vals = {};
      const lanes = { active: [], inactive: [], nba: [], postponed: [] };
      const printed = [];
      let t = 0;
      const F = new S.Frames(['nba']);
      const pic = (hot, on, notes, bar) => P.scene({ code: { src, hot, notes, barCls: bar }, under: [P.badges(watch.map((n) => ({ name: P.short(n), v: vals[n] || 'x' }))), P.console(printed, { rows: 3 })], right: [regions(lanes, on, t), P.waves({ waves: run.waves, rows: watch, t, t1, w: 330, ticks: 3 })], focus: on === 'nba' || on === 'postponed' || on === 'inactive' ? 'right' : 'code' });
      const procName = (who) => (who || '').replace(/^(\w+) block at line (\d+).*/, (m, k, n) => k.toLowerCase() + ' @' + n);
      const procSay = (who) => (who || '').replace(/^(\w+) block at line (\d+).*/, (m, k, n) => 'the ' + k.toLowerCase() + ' block at line ' + n);
      F.add(P.frame(pic([], null, {}), 'Every time step is worked through in regions. Active: processes that have been woken run, and blocking (=) assignments change things at once. Inactive: what waits behind #0. NBA: the non-blocking (<=) updates, all made together once nothing active is left. Postponed: $strobe and $monitor print here, when the step has settled.'));
      let notes = {};
      let pendingQ = null;
      for (let i = 0; i < steps.length && F.length < 70; i++) {
        const s = steps[i];
        if (s.kind === 'time') {
          lanes.active = []; lanes.nba = []; lanes.postponed = []; lanes.inactive = [];
          t = s.t; notes = {};
          F.add(P.frame(pic([], null, notes), s.say + '. The queues start empty.'));
          continue;
        }
        if (s.kind === 'run') {
          const nm = procName(s.who);
          lanes.active = lanes.active.filter((c) => c.text !== nm).concat([{ text: nm, cls: 'hot', key: nm }]);
          continue;
        }
        if (s.kind === 'stmt') {
          const txt = P.stmtText(src, s.line);
          const nb = labelOf.get(i);
          // the active updates this statement made, and any print
          const ups = [], prints = [];
          let j = i + 1;
          for (; j < steps.length; j++) {
            const x = steps[j];
            if ((x.kind === 'update' || x.kind === 'print') && x.region !== 'nba' && x.region !== 'postponed') { if (x.kind === 'update') ups.push(x); else prints.push(x.text.replace(/\n$/, '')); continue; }
            // more statements on the same line are the same moment
            if (x.kind === 'stmt' && x.line === s.line && x.t === s.t && !nb && !labelOf.get(j)) continue;
            break;
          }
          if (nb && !pendingQ) {
            // ask what the swap gives before the NBA region applies it
            const rest = steps.slice(i).find((x) => x.kind === 'region' && x.region === 'nba');
            if (rest && t > 0) {
              const after = {};
              for (const n of watch) after[n] = vals[n];
              const idx = steps.indexOf(rest);
              for (let k = idx + 1; k < steps.length && steps[k].kind === 'update' && steps[k].region === 'nba'; k++) after[steps[k].net] = show(steps[k].to);
              const ab = watch.filter((n) => /\.(a|b)$/.test(n));
              if (ab.length === 2) pendingQ = { ask: 'When this time step is over, what will a and b be?', options: ['a=0 b=0', 'a=0 b=1', 'a=1 b=0', 'a=1 b=1'], answer: 'a=' + after[ab[0]] + ' b=' + after[ab[1]] };
            }
          }
          if (nb) { lanes.nba.push({ text: nb, cls: 'nba', key: 'q' + lanes.nba.length }); F.count('nba'); }
          for (const u of ups) vals[u.net] = show(u.to);
          printed.push(...prints);
          if (ups.length || nb || prints.length) notes[s.line] = nb ? 'queued ' + nb : ups.length ? ups.map((u) => P.short(u.net) + ' = ' + show(u.to)).join(', ') : 'prints';
          const say = 'At ' + P.ns(t) + ', ' + (s.who ? procSay(s.who) + ' runs ' : '') + 'line ' + s.line + ' (' + txt + '). ' + (nb ? 'A non-blocking assignment: the right side is worked out now (' + nb.replace(/^.*<=\s*/, '') + ') but the change is only written down in the NBA region.' : ups.length ? 'A blocking assignment: ' + ups.map((u) => P.short(u.net) + ' becomes ' + show(u.to)).join(', ') + ' at once, so the very next statement already sees it.' : prints.length ? 'It prints "' + prints.join('", "') + '" with the values as they are right now.' : /\$(strobe|monitor)/.test(txt) ? 'Nothing is printed yet: it books a print for the postponed region, at the very end of this time step.' : /\$finish/.test(txt) ? 'That ends the simulation.' : /^\w+\s*=[^=]/.test(txt) ? 'A blocking assignment, but ' + txt.split('=')[0].trim() + ' already holds ' + (vals[top + '.' + txt.split('=')[0].trim()] || 'that value') + ', so nothing changes.' : '');
          const f = P.frame(pic([s.line], 'active', Object.assign({}, notes), nb ? 'nba' : ''), say);
          if (pendingQ && !pendingQ.used && nb && steps.slice(i + 1).find((x) => x.kind === 'stmt' || (x.kind === 'region' && x.region === 'nba')).kind === 'region') { f.meta = { q: pendingQ }; pendingQ.used = true; }
          F.add(f);
          i = j - 1;
          continue;
        }
        if (s.kind === 'region' && s.region === 'nba') {
          lanes.active = [];
          F.add(P.frame(pic([], 'nba', notes), 'At ' + P.ns(t) + ' nothing active is left, so the NBA region makes every written-down update now: ' + (s.updates || []).join(', ') + '.'));
          continue;
        }
        if (s.kind === 'update' && s.region === 'nba') {
          vals[s.net] = show(s.to);
          const k = lanes.nba.findIndex((c) => c.cls === 'nba');
          if (k >= 0) lanes.nba[k] = Object.assign({}, lanes.nba[k], { cls: 'done' });
          F.add(P.frame(pic([], 'nba', notes), P.short(s.net) + ' changes from ' + show(s.from) + ' to ' + show(s.to) + '. Its right side was read back when the statement ran, so whatever changed since does not matter.'));
          continue;
        }
        if (s.kind === 'print' && s.region === 'postponed') {
          printed.push(s.text.replace(/\n$/, ''));
          lanes.postponed = [{ text: '$strobe', cls: 'hot' }];
          F.add(P.frame(pic([P.findLine(src, '$strobe') || P.findLine(src, '$monitor')].filter(Boolean), 'postponed', notes), 'Last of all, in the postponed region, ' + s.say.replace(/^At the end of the time step \(the postponed region\) /, '') + ': it sees the values after the NBA updates.'));
          continue;
        }
        if (s.kind === 'region' && s.region === 'inactive') { F.add(P.frame(pic([], 'inactive', notes), s.say + '.')); continue; }
      }
      const out = run.output.map((l) => '"' + l + '"').join(', then ');
      const fin = run.output.find((l) => /a=\d b=\d/.test(l)) || '';
      const swapped = /a=1 b=0/.test(fin);
      F.add(P.frame(pic([], null, {}), (fin ? 'The testbench prints "' + fin + '": ' + (swapped ? 'the values swapped. With <= each block read the old values, and the updates were made together afterwards: exactly two flip-flops sharing a clock.' : 'no swap. With = the first statement to run changed its variable at once, and the second read the new value, so both ended equal.' + ((src.match(/\balways\b/g) || []).length > 1 ? ' Which block runs first is up to the simulator, so two always blocks with = on the same edge are a race.' : ' In one block the order is fixed, so this is no race, but it is not a swap either.')) : 'The output: ' + out + '. $display printed the value before the NBA update; $strobe waited for the end of the time step and printed the value after it.') + ' The rule: <= in clocked blocks, = in combinational ones.', { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'math', title: 'One time step', text: ['1 active: run woken processes;', '  = updates at once', '2 inactive: #0 waits', '3 NBA: all <= updates together', '  (may wake more: back to 1)', '4 postponed: $strobe, $monitor'].join('\n') }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'a = 0 and b = 1. On a clock edge, "a <= b; b <= a;" runs. Afterwards…', options: ['a = 1, b = 0', 'a = 1, b = 1', 'a = 0, b = 0', 'a = 0, b = 1'], answer: 0, why: 'Both right sides are read before either update is made.' },
      { q: 'The same with "a = b; b = a;" in one block. Afterwards…', options: ['a = 1, b = 0', 'a = 1, b = 1', 'a = 0, b = 0', 'a = 0, b = 1'], answer: 1, why: 'a becomes 1 at once, then b reads the new a.' },
      { q: 'When are non-blocking updates made?', options: ['In the NBA region, after the active and inactive regions are empty', 'Immediately', 'At the next clock edge', 'At the end of the simulation'], answer: 0, why: 'They wait until everything woken in the time step has run.' },
      { q: 'Which prints the value after this time step\'s <= updates?', options: ['$strobe', '$display', 'both', 'neither'], answer: 0, why: '$strobe prints in the postponed region, at the end of the step.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // The shift register race
  // ---------------------------------------------------------------------------------------------------
  const SHIFT = (body) => `module shift3(input d, clk,
              output reg q1, q2, q3);
${body}
endmodule

module tb;
  reg d, clk;
  wire q1, q2, q3;
  shift3 dut(.d(d), .clk(clk),
    .q1(q1), .q2(q2), .q3(q3));
  always #5 clk = ~clk;
  initial begin
    clk = 0; d = 1;
    #10 d = 0;
    #10 d = 1;
    #20 $finish;
  end
endmodule`;
  const SBODY = {
    nb: '  always @(posedge clk) begin\n    q1 <= d;\n    q2 <= q1;\n    q3 <= q2;\n  end',
    bl: '  always @(posedge clk) begin\n    q1 = d;\n    q2 = q1;\n    q3 = q2;\n  end',
    rev: '  always @(posedge clk) begin\n    q3 = q2;\n    q2 = q1;\n    q1 = d;\n  end',
    three: '  always @(posedge clk) q1 = d;\n  always @(posedge clk) q2 = q1;\n  always @(posedge clk) q3 = q2;',
  };
  /** three D flip-flops: a chain (each from the one before) or a fan (each from d), drawn in a row */
  function ffRow(kind) {
    const c = new S.Netlist.Circuit(kind === 'fan' ? 'Three copies of d' : 'Shift register');
    const d = c.input('d').pin('y'), clk = c.input('clk').pin('y');
    const fs = [0, 1, 2].map((i) => c.add('DFF', { qn: false }, 'f' + (i + 1)));
    fs.forEach((f, i) => { c.connect(clk, f.pin('clk')); c.connect(kind === 'fan' || i === 0 ? d : fs[i - 1].pin('q'), f.pin('d')); });
    fs.forEach((f, i) => { c.connect(f.pin('q'), c.output('q' + (i + 1))); c.name(f.pin('q'), 'q' + (i + 1), false); });
    const port = (n) => c.byId.get('in_' + n) || c.byId.get('out_' + n);
    c.style = 'slices';
    c.hints = { slices: fs.map((f) => ({ ff: f })), place: { ff: { dx: 0, dy: 0, opts: { sides: { clock: 'bottom' } } } }, pitch: 16, rails: [{ port: port('clk') }].concat(kind === 'fan' ? [{ port: port('d') }] : []), bottom: fs.map((f, i) => port('q' + (i + 1))) };
    if (kind !== 'fan') c.hints.extra = (sh) => { const at = sh.at(fs[0], 'd'), p = port('d'); sh.put(p, at.x - 6 - sh.g(p).w, at.y - 1); };
    return c;
  }
  const rowMemo = {};
  const ffRes = (kind) => (rowMemo[kind] = rowMemo[kind] || K.schem.layout(ffRow(kind)));
  S.topic({
    id: 'vl-race', family: 'p12-behaviour', order: 30, title: 'The shift register that races',
    blurb: 'Three flip-flops in a row should pass a bit along one place per clock. Written with <= they do. Written with = the order of the statements decides, and spread over three always blocks the simulator\'s order decides: the simulation and the hardware stop agreeing.',
    inputs: [{ id: 'src', kind: 'program', label: 'Verilog (module shift3, then tb)', def: SHIFT(SBODY.nb), check: P.compiles('Verilog') }],
    presets: [
      { label: '<= : a shift register', values: { src: SHIFT(SBODY.nb) } },
      { label: '= in order: three copies of d', values: { src: SHIFT(SBODY.bl) } },
      { label: '= in reverse order', values: { src: SHIFT(SBODY.rev) } },
      { label: '= in three blocks: a race', values: { src: SHIFT(SBODY.three) } },
    ],
    counters: [{ id: 'edges', label: 'clock edges' }],
    run(inp) {
      const src = inp.src;
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const hw = K.code.hardware(src, { top: 'shift3', tb: 'tb' });
      // what the tool built: does every flip-flop take d, or each the one before?
      let kind = 'chain';
      if (hw.ok) {
        const ffs = hw.circuit.parts.filter((p) => p.type === 'DFF');
        const dNet = hw.circuit.parts.find((p) => p.type === 'IN' && p.params.name === 'd').net.y;
        if (ffs.filter((f) => f.net.d === dNet).length > 1) kind = 'fan';
      }
      const res = ffRes(kind);
      const t1 = run.time;
      const hwv = (n, t) => (hw.ok ? show(hw.at(n, t)) : 'x');
      const values = (t) => ({ d: show(K.code.at(run.waves, 'tb.d', t)), clk: show(K.code.at(run.waves, 'tb.clk', t)), q1: hwv('q1', t), q2: hwv('q2', t), q3: hwv('q3', t) });
      const rows = ['tb.clk', 'tb.d', 'tb.q1', 'tb.q2', 'tb.q3'];
      const bad = ['q1', 'q2', 'q3'].flatMap((n) => differ(K.code.changes(run.waves, 'tb.' + n), hw.ok ? K.code.changes(hw.sim.waves, 'tb.' + n) : [], t1).map((b) => Object.assign({ row: 'tb.' + n }, b)));
      const marks = {};
      for (const w of run.warnings) marks[w.line] = 'warn';
      const word = (t) => ['q1', 'q2', 'q3'].map((n) => show(K.code.at(run.waves, 'tb.' + n, t))).join('');
      const hwWord = (t) => ['q1', 'q2', 'q3'].map((n) => hwv(n, t)).join('');
      const pic = (t, hot, notes, focus) => P.scene({ code: { src, hot, notes, marks }, under: [P.badges([{ name: 'q1q2q3 sim', v: word(t) }, { name: 'gates', v: hwWord(t), cls: word(t) !== hwWord(t) ? 'bad' : '' }])], right: [P.circuit(res, { title: kind === 'fan' ? 'What it builds: three copies of d' : 'What it builds: a shift register', values: values(t), textScale: 1.15 }), P.waves({ waves: run.waves, rows, t, t1, w: 360, spans: bad.filter((b) => b.t0 <= t).map((b, i) => ({ key: 'b' + i, t0: b.t0, t1: Math.min(t, b.t1), row: b.row, cls: 'bad' })) })], focus });
      const F = new S.Frames(['edges']);
      const blk = K.code.lines(src).map((l, i) => (/always @\(posedge/.test(l) ? i + 1 : 0)).filter(Boolean);
      const body = [];
      for (let n = 3; n < P.findLine(src, /^endmodule/); n++) if (/q\d\s*<?=/.test(P.lineText(src, n))) body.push(n);
      F.add(P.frame(pic(0, body, {}, 'right'), 'At each rising edge of clk the ' + (blk.length > 1 ? 'blocks copy' : 'block copies') + ' d into q1, q1 into q2 and q2 into q3. ' + (kind === 'fan' ? 'But the synthesis tool reads the statements in order with =: q2 gets q1\'s new value, which is d, and q3 gets d too. It builds three flip-flops all fed from d, not a shift register.' : 'The synthesis tool builds three flip-flops in a chain: a shift register.') + (run.warnings.length ? ' The checker warns: ' + run.warnings[0].msg + '.' : '')));
      const edges = K.code.changes(run.waves, 'tb.clk').filter((q) => q[1] === 1 && q[0] > 0).map((q) => q[0]);
      for (const e of edges) {
        const before = word(e - 1e-6), after = word(e), hwA = hwWord(e);
        F.count('edges');
        const ms = P.moments(run).filter((m) => m.t === e && m.kind === 'stmt' && m.scope === 'tb.dut');
        const notes = {};
        for (const m of ms) notes[m.line] = m.updates.map((u) => P.short(u.net).split('.').pop() + ' = ' + show(u.to)).join(', ') || (m.region === 'active' ? 'queued' : '');
        F.add(P.frame(pic(e - 1e-6, [], {}, 'code'), 'Edge at ' + P.ns(e) + ': d = ' + show(K.code.at(run.waves, 'tb.d', e)) + ', q1 q2 q3 = ' + before + '.', { meta: { q: { ask: 'What will the simulation give for q1 q2 q3 after this edge?', options: P.opts(after, before, show(K.code.at(run.waves, 'tb.d', e)).repeat(3), show(K.code.at(run.waves, 'tb.d', e)) + before.slice(0, 2)), answer: after } } }));
        F.add(P.frame(pic(e, ms.map((m) => m.line), notes, after !== hwA ? 'right' : 'code'), 'After the edge the simulation has q1 q2 q3 = ' + after + ' (' + ms.map((m) => 'line ' + m.line).join(', then ') + ' ran, in that order). The gates give ' + hwA + '.' + (after !== hwA ? ' They disagree: the simulator happened to run the blocks in the order written, so each = saw the value another block had just changed, while real flip-flops all sample at the same instant.' : '')));
      }
      F.add(P.frame(pic(t1, [], {}, 'right'), (bad.length ? 'The simulation and the gates disagree (shaded). Three always blocks with = on one edge race: the answer depends on which the simulator runs first, and no order is promised. ' : kind === 'fan' ? 'Simulation and gates agree, but on the wrong design: every q copies d. With = the order of the statements is the order of the wires. ' : 'Simulation and gates agree: a bit moves one place per edge. ') + 'Writing every clocked assignment with <= makes the order of statements and blocks not matter at all.', { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'math', title: 'A shift register', text: ['always @(posedge clk) begin', '  q1 <= d;', '  q2 <= q1;   // the old q1', '  q3 <= q2;   // the old q2', 'end'].join('\n') }, P.warnSection(run.warnings)]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'With "q1 = d; q2 = q1; q3 = q2;" in one clocked block, what does synthesis build?', options: ['Three flip-flops all fed from d', 'A 3-bit shift register', 'One flip-flop', 'Nothing'], answer: 0, why: 'Each = passes the new value straight on, so q2 and q3 get d.' },
      { q: 'Which ordering of = statements gives a shift register?', options: ['q3 = q2; q2 = q1; q1 = d;', 'q1 = d; q2 = q1; q3 = q2;', 'Any order', 'None'], answer: 0, why: 'Each reads a value before it is overwritten. It works, but is fragile.' },
      { q: 'Three always @(posedge clk) blocks each with one = form a…', options: ['race: the result depends on the order the simulator picks', 'correct shift register always', 'latch', 'compile error'], answer: 0, why: 'No order between blocks is promised.' },
      { q: 'The safe rule for clocked always blocks is…', options: ['use <= for every assignment', 'use = for every assignment', 'put each assignment in its own block', 'add #1 delays'], answer: 0, why: 'Non-blocking assignments make every flip-flop sample before any changes.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // if and case
  // ---------------------------------------------------------------------------------------------------
  const PICK = (body) => `module pick(input a, b, s0, c, s1,
            output reg y);
  always @* begin
${body}
  end
endmodule

module tb;
  reg a, b, c, s1, s0;
  wire y;
  pick dut(.a(a), .b(b), .s0(s0),
           .c(c), .s1(s1), .y(y));
  initial begin
    a = 0; b = 1; c = 0;
    s1 = 0; s0 = 0;
    #10 s0 = 1;
    #10 s1 = 1;
    #10 c = 1;
    #10 s1 = 0; s0 = 0;
    #10 $finish;
  end
endmodule`;
  const PBODY = {
    ifs: '    if (s1)      y = c;\n    else if (s0) y = b;\n    else         y = a;',
    cas: '    case ({s1, s0})\n      2\'b00:   y = a;\n      2\'b01:   y = b;\n      default: y = c;\n    endcase',
    nest: '    if (s1) begin\n      if (s0) y = c;\n      else    y = b;\n    end\n    else y = a;',
  };
  S.topic({
    id: 'vl-ifcase', family: 'p12-behaviour', order: 40, title: 'if and case',
    blurb: 'Inside an always block, if and case choose which assignment runs. Follow the cursor as the conditions are tried one after another, and see what each becomes: an if … else if chain is a chain of multiplexers with a priority, a case is one choice among equals.',
    inputs: [{ id: 'src', kind: 'program', label: 'Verilog (module pick, then tb)', def: PICK(PBODY.ifs), check: P.compiles('Verilog') }],
    presets: [
      { label: 'if … else if … else', values: { src: PICK(PBODY.ifs) } },
      { label: 'The same as a case', values: { src: PICK(PBODY.cas) } },
      { label: 'Nested if: a different choice', values: { src: PICK(PBODY.nest) } },
    ],
    counters: [{ id: 'tests', label: 'conditions tested' }],
    run(inp) {
      const src = inp.src;
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const hw = K.code.hardware(src, { top: 'pick', tb: 'tb' });
      const all = P.moments(run);
      const yLines = K.code.lines(src).map((l, i) => (/\by\s*=[^=]/.test(l) && !/assign/.test(l) ? i + 1 : 0)).filter((n) => n && n < P.findLine(src, /^endmodule/));
      const askedT = new Set();
      let prevM = null;
      const F = new S.Frames(['tests']);
      const alw = P.findLine(src, /always @\*/);
      const intro = P.scene({ code: { src, hot: [alw] }, right: [P.built(hw, {}), P.waves({ waves: run.waves, rows: ['tb.s1', 'tb.s0', 'tb.a', 'tb.b', 'tb.c', 'tb.y'], t: 0, t1: run.time, w: 340 })], focus: 'right' });
      const say = (hw.trace || []).filter((x) => x.kind === 'assign' || x.kind === 'seq' || x.kind === 'comb' || /becomes/.test(x.say)).map((x) => x.say);
      F.add(P.frame(intro, 'The block runs whenever anything it reads changes (@*), and then exactly one of the assignments to y runs. ' + (say.length ? 'Built as a circuit: ' + say.join('; ') + '.' : '')));
      const walk = P.walkFrames({
        src, run, hw, w: 340, watch: ['tb.s1', 'tb.s0', 'tb.a', 'tb.b', 'tb.c', 'tb.y'], rows: ['tb.s1', 'tb.s0', 'tb.a', 'tb.b', 'tb.c', 'tb.y'],
        keep: (m) => m.kind === 'stmt' && (m.scope === 'tb.dut' || m.updates.length),
        ask(m) {
          if (!(m.kind === 'stmt' && m.scope === 'tb' && m.updates.length) || askedT.has(m.t) || m.t === 0) return null;
          askedT.add(m.t);
          const runs = all.filter((x) => x.t === m.t && x.kind === 'stmt' && x.scope === 'tb.dut' && yLines.includes(x.line));
          if (!runs.length) return null;
          const ans = 'line ' + runs[runs.length - 1].line;
          return { ask: 'After this change, which line gives y its value?', options: yLines.map((n) => 'line ' + n), answer: ans, before: 'At ' + P.ns(m.t) + ' the testbench is about to change ' + m.updates.map((u) => P.short(u.net)).join(', ') + '.' };
        },
        say(m) {
          // a line like "if (s0) y = b;" runs twice when its branch is taken: the test, then the assignment
          const again = prevM && prevM.line === m.line && prevM.t === m.t && prevM.scope === m.scope;
          prevM = m;
          if (m.scope !== 'tb.dut') return '';
          const txt = P.lineText(src, m.line);
          const asg = /\by\s*=\s*([^;=]+);/.exec(txt);
          if (asg && (again || !/^(else\s+)?if\b/.test(txt))) {
            const rhs = asg[1].trim(), v = show(K.code.at(run.waves, 'tb.dut.' + rhs, m.t));
            return m.updates.length ? 'The assignment y = ' + rhs + ' runs.' : 'The assignment y = ' + rhs + ' runs and gives ' + v + ', which y already holds, so y does not change.';
          }
          if (/^(else\s+)?if\b/.test(txt)) { F.count('tests'); const c = (/if\s*\(([^)]*)\)/.exec(txt) || [])[1]; const v = show(K.code.at(run.waves, 'tb.dut.' + (c || '').trim(), m.t)); return c && /^\w+$/.test(c.trim()) ? 'The condition (' + c + ') is ' + v + (v === '1' ? ': true, so this branch runs.' : ': false, so the else is tried.') : ''; }
          if (/^case\b/.test(txt)) { F.count('tests'); return 'case compares {s1, s0} = ' + show(K.code.at(run.waves, 'tb.dut.s1', m.t)) + show(K.code.at(run.waves, 'tb.dut.s0', m.t)) + ' with each label in turn and runs the first that matches.'; }
          return '';
        },
      });
      for (const f of walk.frames) F.add(f);
      const isCase = /\bcase\b/.test(src.split('module tb')[0]), nested = /\bif\s*\([^)]*\)\s*begin\s*\n\s*if\b/.test(src.split('module tb')[0]);
      F.add(P.frame(walk.scene(null, []), (isCase ? 'A case tests one expression against labels that cannot both match here, so the tool can build one choice among equals: the select picks an input directly. ' : nested ? 'Nested ifs choose in steps: the outer condition first, then the inner one inside its branch, built as multiplexers with one feeding the next. It is not the same choice as the chain: here s0 matters only while s1 = 1. ' : 'An if … else if chain tries its conditions in order; the first true one wins. That order is a priority, built as multiplexers in a chain: the last condition sits nearest the inputs, the first nearest the output. ') + 'Whatever the form, in a combinational block every path must give y a value, or the tool keeps the old one in a latch.', { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'math', title: 'Two ways to choose', text: ['if (s1)      y = c;   // first true wins', 'else if (s0) y = b;', 'else         y = a;', '', 'case ({s1, s0})       // first label', "  2'b00:   y = a;      // that matches", "  2'b01:   y = b;", '  default: y = c;', 'endcase'].join('\n') }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'In "if (p) y = 1; else if (q) y = 2; else y = 3;", p and q are both 1. y is…', options: ['1', '2', '3', 'x'], answer: 0, why: 'The first true condition wins.' },
      { q: 'An if … else if chain is built as…', options: ['multiplexers in a chain: a priority', 'one AND gate', 'a latch', 'flip-flops'], answer: 0, why: 'Each else is the input of the next multiplexer.' },
      { q: 'What does default do in a case?', options: ['Covers every value no label matches', 'Runs first', 'Runs always', 'Resets the block'], answer: 0, why: 'It makes the case complete, so no latch is needed.' },
      { q: 'case ({s1, s0}) with labels 2\'b00 and 2\'b01 and no default, in an always @* block that assigns y: what happens for 2\'b10?', options: ['y keeps its old value: a latch', 'y becomes 0', 'y becomes x', 'a compile error'], answer: 0, why: 'No branch runs, so y must remember: the tool builds a latch.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // casez and casex: don't-care bits
  // ---------------------------------------------------------------------------------------------------
  const PRIO = (kw, stim) => `module prio(input [3:0] r,
            output reg [1:0] n,
            output reg any);
  always @* begin
    any = 1;
    ${kw} (r)
      4'b1???: n = 2'd3;
      4'b01??: n = 2'd2;
      4'b001?: n = 2'd1;
      4'b0001: n = 2'd0;
      default: begin
        n = 2'd0; any = 0;
      end
    endcase
  end
endmodule

module tb;
  reg [3:0] r;
  wire [1:0] n;
  wire any;
  prio dut(.r(r), .n(n), .any(any));
  initial begin
${stim}
    #10 $finish;
  end
endmodule`;
  const PSTIM = {
    plain: "    r = 4'b0110;\n    #10 r = 4'b0001;\n    #10 r = 4'b1011;\n    #10 r = 4'b0000;",
    unk: "    r = 4'b0x10;\n    #10 r = 4'b1x00;",
  };
  /** does a case item pattern match a value (both bit strings, most significant first)? per bit: 'y', 'n', 'w' (a wildcard) */
  function matchBits(kw, pat, val) {
    return [...pat].map((p, i) => {
      const v = val[i];
      // in a plain case ? is z, and every bit must equal exactly
      if (kw === 'case') return (p === '?' ? 'z' : p) === v ? 'y' : 'n';
      if (p === '?' || p === 'z' || v === 'z') return 'w';
      if (kw === 'casex' && (p === 'x' || v === 'x')) return 'w';
      return p === v ? 'y' : 'n';
    });
  }
  S.topic({
    id: 'vl-casez', family: 'p12-behaviour', order: 50, title: 'casez, casex and don\'t-care bits',
    blurb: 'In a casez label, ? (or z) matches any bit, so a few labels cover many values: a priority encoder in five lines. casex also lets x match anything, which hides unknowns in simulation. Watch each label tried bit by bit.',
    inputs: [{ id: 'src', kind: 'program', label: 'Verilog (module prio, then tb)', def: PRIO('casez', PSTIM.plain), check: P.compiles('Verilog') }],
    presets: [
      { label: 'casez: a priority encoder', values: { src: PRIO('casez', PSTIM.plain) } },
      { label: 'casez with an unknown input', values: { src: PRIO('casez', PSTIM.unk) } },
      { label: 'casex with an unknown input', values: { src: PRIO('casex', PSTIM.unk) } },
      { label: 'plain case: ? is not a wildcard', values: { src: PRIO('case', PSTIM.plain) } },
    ],
    counters: [{ id: 'tried', label: 'labels tried' }],
    run(inp) {
      const src = inp.src;
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const kw = (/\b(casez|casex|case)\s*\(/.exec(src) || [])[1] || 'case';
      const ls = K.code.lines(src);
      const arms = ls.map((l, i) => { const m = /^\s*4'b([01xz?]{4})\s*:/.exec(l); return m ? { line: i + 1, pat: m[1] } : null; }).filter(Boolean);
      const defLine = ls.findIndex((l) => /^\s*default\s*:/.test(l)) + 1;
      const caseLine = ls.findIndex((l) => /^\s*(casez|casex|case)\s*\(/.test(l)) + 1;
      const times = [...new Set(P.moments(run).filter((m) => m.kind === 'stmt' && m.scope === 'tb' && m.updates.length).map((m) => m.t))];
      const F = new S.Frames(['tried']);
      const t1 = run.time;
      const rOf = (t) => show(K.code.at(run.waves, 'tb.r', t)).padStart(4, 'x');
      const table = (r, upto, hit) => P.table({
        title: 'r = ' + r + ' against each label (' + kw + ')', key: 'arms',
        head: ['label', 'b3', 'b2', 'b1', 'b0', 'match'],
        rows: arms.map((a, i) => { const mb = matchBits(kw, a.pat, r); const ok = mb.every((x) => x !== 'n'); return ['line ' + a.line].concat(mb.map((x, j) => (i > upto ? a.pat[j] : a.pat[j] + (x === 'w' ? ' any' : x === 'y' ? ' ✓' : ' ✗'))), [i > upto ? '' : ok ? 'yes' : 'no']); }).concat(defLine ? [['default', '', '', '', '', upto >= arms.length ? 'yes' : '']] : []),
        hot: hit, cls: (rr, c) => (rr > upto ? 'blank' : rr === hit ? 'good' : c === 5 && rr < (hit === null ? arms.length : hit) ? 'gone' : ''),
      });
      const pic = (t, upto, hit, hot, notes, focus) => P.scene({ code: { src, hot, notes }, under: [P.badges([{ name: 'r', v: rOf(t) }, { name: 'n', v: show(K.code.at(run.waves, 'tb.n', t)) }, { name: 'any', v: show(K.code.at(run.waves, 'tb.any', t)) }])], right: [table(rOf(t), upto, hit), P.waves({ waves: run.waves, rows: ['tb.r', 'tb.n', 'tb.any'], t, t1, w: 340 })], focus });
      F.add(P.frame(pic(0, -1, null, [caseLine], {}, 'right'), kw + ' compares r with the labels from the top and runs the first that matches. ' + (kw === 'case' ? 'In a plain case, ? is not a wildcard: it means z, and a bit of r only matches the same value exactly.' : 'A ? in a label matches anything in that bit, so 4\'b1??? stands for all eight values with r[3] = 1.') + (kw === 'casex' ? ' casex goes further: an x or z in r itself also matches anything.' : '')));
      // which bits matched anything, and why: ? in the label, or (casex) an unknown in r
      const wildSay = (pat, r, mb) => {
        const lab = mb.filter((x, j) => x === 'w' && /[?z]/.test(pat[j])).length, unk = mb.filter((x, j) => x === 'w' && !/[?z]/.test(pat[j])).length;
        const parts = (lab ? [P.plural(lab, 'wildcard bit') + ' in the label'] : []).concat(unk ? [P.plural(unk, 'unknown bit') + ' in r'] : []);
        return parts.length ? ' (' + parts.join(' and the ') + (lab + unk > 1 ? ' match anything)' : ' matches anything)') : '';
      };
      const seen = [];
      for (const t of times) {
        const r = rOf(t);
        const results = arms.map((a) => matchBits(kw, a.pat, r).every((x) => x !== 'n'));
        const hit = results.indexOf(true);
        const n = show(K.code.at(run.waves, 'tb.n', t)), any = show(K.code.at(run.waves, 'tb.any', t));
        const stimLine = P.moments(run).find((m) => m.t === t && m.kind === 'stmt' && m.scope === 'tb' && m.updates.length).line;
        F.add(P.frame(pic(t, -1, null, [stimLine], {}, 'code'), 'At ' + P.ns(t) + ' r becomes ' + r + '.', { meta: { q: { ask: 'Which label will match r = ' + r + '?', options: arms.map((a) => 'line ' + a.line).concat(defLine ? ['default'] : []), answer: hit >= 0 ? 'line ' + arms[hit].line : 'default' } } }));
        const last = hit >= 0 ? hit : arms.length;
        for (let i = 0; i <= Math.min(last, arms.length - 1); i++) {
          F.count('tried');
          const mb = matchBits(kw, arms[i].pat, r);
          const bad = mb.findIndex((x) => x === 'n');
          F.add(P.frame(pic(t - 1e-6, i, results[i] ? i : null, [arms[i].line], {}, 'right'), 'Line ' + arms[i].line + ': ' + arms[i].pat + ' against ' + r + '. ' + (results[i] ? 'Every bit matches' + wildSay(arms[i].pat, r, mb) + ', so this label wins.' : 'Bit ' + (3 - bad) + ' is ' + arms[i].pat[bad] + ' in the label but ' + r[bad] + ' in r' + (r[bad] === 'x' && kw === 'casez' ? ' (casez does not treat an x in r as a wildcard)' : kw === 'case' && arms[i].pat[bad] === '?' ? ' (in a plain case ? means z, and must match exactly)' : '') + ': no match.')));
        }
        const runLine = hit >= 0 ? arms[hit].line : defLine;
        seen.push({ r, hit, also: results.findIndex((ok, j) => ok && j > hit) });
        F.add(P.frame(pic(t, last, hit >= 0 ? hit : arms.length, [runLine], { [runLine]: 'n = ' + n + ', any = ' + any }, 'code'), (hit >= 0 ? 'Line ' + runLine + ' runs' : 'No label matched, so default runs') + ': n = ' + n + ', any = ' + any + '.' + (/x/.test(r) && kw === 'casex' && hit >= 0 ? ' casex took the x as a wildcard and gave an answer as if r were known: the unknown is hidden, and a real circuit given that input might do something else.' : /x/.test(r) && kw === 'casez' && hit < 0 ? ' The unknown bit kept r from matching its label: an x in, a default out, which a testbench can notice.' : '')));
      }
      // the summary from what this run did
      const fell = seen.filter((x) => x.hit < 0).map((x) => x.r), exact = seen.filter((x) => x.hit >= 0);
      const prio = seen.find((x) => x.hit >= 0 && x.also > x.hit);
      const hidden = seen.filter((x) => /[xz]/.test(x.r) && x.hit >= 0), caught = seen.filter((x) => /[xz]/.test(x.r) && x.hit < 0);
      let endSay;
      if (kw === 'case') endSay = 'With a plain case a label matches only the exact value, and ? stands for z, which r never holds. ' + (fell.length ? 'So r = ' + fell.join(', ') + ' fell through to default' : 'Every value here matched exactly') + (exact.length ? (fell.length ? ', and only ' : ': ') + exact.map((x) => x.r + ' matched line ' + arms[x.hit].line).join(', ') + ', with no ? in its way' : '') + '. Use casez for wildcards.';
      else endSay = (prio ? 'The labels are tried in order, so they act as a priority: r = ' + prio.r + ' matches line ' + arms[prio.hit].line + ' even though line ' + arms[prio.also].line + ' (4\'b' + arms[prio.also].pat + ') would also fit it. ' : 'The labels are tried in order, so they act as a priority: the first that matches wins. ') + (hidden.length && kw === 'casex' ? 'Here casex gave an answer for r = ' + hidden.map((x) => x.r).join(' and ') + ' as if the unknown bits were known. ' : caught.length ? 'Here r = ' + caught.map((x) => x.r).join(' and ') + ' matched no label because of its unknown bit, so the default showed it. ' : '') + 'casez is the usual choice; casex can hide x in simulation.';
      F.add(P.frame(pic(t1, -1, null, [], {}, 'right'), endSay, { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'table', title: 'Which bits match anything', colHead: ['', 'in a label', 'in the value'], rows: [['case', 'nothing', 'nothing'], ['casez', '? and z', 'z'], ['casex', '?, z and x', 'z and x']] }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'In casez, which values does the label 4\'b01?? match?', options: ['0100 to 0111', 'only 0100', '0100 and 1100', 'everything'], answer: 0, why: 'The two ? bits match anything; the top two must be 0 and 1.' },
      { q: 'r = 4\'b1100 in the priority encoder. Which label wins?', options: ['4\'b1???', '4\'b01??', '4\'b001?', 'default'], answer: 0, why: 'The first label that matches wins, and 1??? matches.' },
      { q: 'Why is casex risky in simulation?', options: ['An x in the value matches anything, so unknowns go unnoticed', 'It is slower', 'It cannot be synthesised', 'It ignores default'], answer: 0, why: 'It gives a confident answer from an unknown input.' },
      { q: 'In a plain case, the label 4\'b1??? matches r = 4\'b1010?', options: ['No: ? means z there, and must match exactly', 'Yes', 'Only in synthesis', 'Only if default is missing'], answer: 0, why: 'Only casez and casex treat ? as a wildcard.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Loops
  // ---------------------------------------------------------------------------------------------------
  const LOOP = (decl, body) => `module bits(input [3:0] v,
${decl});
  integer i;
  always @* begin
${body}
  end
endmodule

module tb;
  reg [3:0] v;
${decl.replace(/output reg/, '  wire').replace(/^\s+/, '  ')};
  bits dut(.v(v), ${decl.includes(' n') ? '.n(n)' : decl.includes(' p') ? '.p(p)' : '.w(w)'});
  initial begin
    v = 4'b1011;
    #10 v = 4'b0110;
    #10 $finish;
  end
endmodule`;
  const LOOPS = {
    ones: ['            output reg [2:0] n', '    n = 0;\n    for (i = 0; i < 4; i = i + 1)\n      n = n + v[i];'],
    par: ['            output reg p', '    p = 0;\n    for (i = 0; i < 4; i = i + 1)\n      p = p ^ v[i];'],
    rev: ['            output reg [3:0] w', '    for (i = 0; i < 4; i = i + 1)\n      w[3 - i] = v[i];'],
  };
  S.topic({
    id: 'vl-loops', family: 'p12-behaviour', order: 60, title: 'Loops',
    blurb: 'A for loop in an always block runs all its turns at once, in no time at all. In simulation the cursor goes round; in hardware the loop is unrolled, one copy of the body per turn, laid side by side.',
    inputs: [{ id: 'src', kind: 'program', label: 'Verilog (module bits, then tb)', def: LOOP(...LOOPS.ones), check: P.compiles('Verilog') }],
    presets: [
      { label: 'Count the 1s', values: { src: LOOP(...LOOPS.ones) } },
      { label: 'Parity: XOR them all', values: { src: LOOP(...LOOPS.par) } },
      { label: 'Reverse the bits', values: { src: LOOP(...LOOPS.rev) } },
    ],
    counters: [{ id: 'turns', label: 'turns of the loop' }],
    run(inp) {
      const src = inp.src;
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const hw = K.code.hardware(src, { top: 'bits', tb: 'tb' });
      const forLine = P.findLine(src, /\bfor\s*\(/), body = forLine + 1;
      const out = (/output reg (?:\[\d+:0\] )?(\w+)/.exec(src) || [])[1] || 'n';
      const all = P.moments(run);
      const F = new S.Frames(['turns']);
      let turns = [];
      const askedT = new Set();
      const table = () => P.table({ title: 'The turns so far', key: 'turns', head: ['i', 'v[i]', out + ' after'], rows: turns.length ? turns.map((r) => r) : [['', '', '']], hot: turns.length ? turns.length - 1 : null });
      const walk = P.walkFrames({
        src, run, hw, w: 320, watch: ['tb.v', 'tb.dut.i', 'tb.' + out], rows: ['tb.v', 'tb.' + out],
        keep: (m) => m.kind === 'stmt' && (m.scope === 'tb.dut' || m.updates.length),
        right: () => [table()],
        ask(m) {
          if (m.scope !== 'tb.dut' || m.line !== forLine || askedT.has(m.t)) return null;
          askedT.add(m.t);
          const fin = show(K.code.at(run.waves, 'tb.' + out, m.t));
          const v = show(K.code.at(run.waves, 'tb.v', m.t));
          return { ask: 'v = ' + v + '. What will ' + out + ' be when the loop has finished?', options: P.opts(fin, v, [...v].reverse().join('')), answer: fin, before: 'At ' + P.ns(m.t) + ' v = ' + v + ' and the block starts the loop.' };
        },
        say(m, st) {
          if (m.scope !== 'tb.dut') { turns = []; return ''; }
          if (m.line === body) {
            F.count('turns');
            const iu = m.updates.find((u) => /\.i$/.test(u.net));
            const i = iu ? K.code.num(iu.from) : turns.length;
            const vb = show(K.code.at(run.waves, 'tb.v', m.t));
            turns.push([String(i), vb[3 - i] || '?', st['tb.dut.' + out] || st[out] || '']);
            return 'Turn i = ' + i + ': v[' + i + '] = ' + (vb[3 - i] || '?') + '. Then i = i + 1 = ' + (i + 1) + (i + 1 < 4 ? ', still below 4, so round again.' : ', not below 4, so the loop ends.');
          }
          if (m.line === forLine) { turns = []; return 'i starts at 0.'; }
          return '';
        },
      });
      for (const f of walk.frames) F.add(f);
      const summary = (hw.trace || []).filter((x) => /becomes/.test(x.say)).map((x) => x.say);
      const starts = walk.moments.filter((m) => m.scope === 'tb.dut' && m.line === forLine).length, per = starts ? Math.round(F.counts.turns / starts) : 0;
      F.add(P.frame(walk.scene(null, []), 'In simulation the loop went round ' + per + ' times each time v changed, all within the same instant. A synthesis tool unrolls it: ' + per + ' copies of "' + P.lineText(src, body) + '" with i = ' + [...Array(per).keys()].join(', ') + ' written in, each feeding the next. ' + (summary.length ? P.cap(summary.join('; ')) + '.' : '') + ' So a loop in hardware must have a fixed number of turns.', { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'math', title: 'Unrolled', text: [P.lineText(src, body).replace(/i/g, '0').replace(/v\[0\]/, 'v[0]'), P.lineText(src, body).replace(/\bi\b/g, '1'), P.lineText(src, body).replace(/\bi\b/g, '2'), P.lineText(src, body).replace(/\bi\b/g, '3')].join('\n') }]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'How much simulated time does a for loop with no delays inside take?', options: ['None: all its turns happen at one instant', 'One ns per turn', 'One clock per turn', 'It depends on the simulator'], answer: 0, why: 'Without # or @ inside, time does not move.' },
      { q: 'What does synthesis do with "for (i = 0; i < 8; i = i + 1)"?', options: ['Unrolls it into 8 copies of the body', 'Builds a counter for i', 'Refuses it', 'Builds one copy used 8 times'], answer: 0, why: 'Hardware has no time to go round in; the copies sit side by side.' },
      { q: 'Which loop cannot be synthesised?', options: ['while (x != 0) x = x >> 1; with x an input', 'for (i = 0; i < 4; i = i + 1)', 'a for loop over a parameter', 'a loop that sets bits of a vector'], answer: 0, why: 'The number of turns depends on data, so the tool cannot know how many copies to build.' },
      { q: 'Reversing bits with a loop builds…', options: ['only wires, crossed over', 'four adders', 'a shift register', 'a latch'], answer: 0, why: 'w[3-i] = v[i] just connects bits; no gates are needed.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Latch inference
  // ---------------------------------------------------------------------------------------------------
  const LATCH = (body) => `module hold(input en, d,
            output reg q);
  always @* begin
${body}
  end
endmodule

module tb;
  reg en, d;
  wire q;
  hold dut(.en(en), .d(d), .q(q));
  initial begin
    en = 1; d = 0;
    #10 d = 1;
    #10 en = 0;
    #10 d = 0;
    #10 en = 1;
    #10 $finish;
  end
endmodule`;
  const LBODY = {
    latch: '    if (en) q = d;',
    els: '    if (en) q = d;\n    else    q = 1\'b0;',
    def: '    q = 1\'b0;     // a value first\n    if (en) q = d;',
  };
  S.topic({
    id: 'vl-latch', family: 'p12-behaviour', order: 70, title: 'Latches nobody asked for',
    blurb: 'If some path through a combinational always block leaves a variable unassigned, the variable must keep its old value then, and only memory can do that: the tool builds a latch. Follow q as en drops, and see how an else, or a value given first, removes the latch.',
    inputs: [{ id: 'src', kind: 'program', label: 'Verilog (module hold, then tb)', def: LATCH(LBODY.latch), check: P.compiles('Verilog') }],
    presets: [
      { label: 'if without else: a latch', values: { src: LATCH(LBODY.latch) } },
      { label: 'With an else: a gate', values: { src: LATCH(LBODY.els) } },
      { label: 'A value first: a gate', values: { src: LATCH(LBODY.def) } },
    ],
    counters: [{ id: 'holds', label: 'times q held' }],
    run(inp) {
      const src = inp.src;
      const run = K.code.run(src, {});
      if (!run.ok) return P.errorFrames(src, run);
      const hw = K.code.hardware(src, { top: 'hold', tb: 'tb' });
      const latch = hw.ok && hw.circuit.parts.some((p) => p.type === 'LATCH');
      const marks = {};
      for (const w of run.warnings) marks[w.line] = 'warn';
      const lnote = (hw.trace || []).find((x) => /latch/.test(x.say));
      const F = new S.Frames(['holds']);
      const intro = P.scene({ code: { src, hot: K.code.lines(src).map((l, i) => (/\bq\s*=/.test(l) ? i + 1 : 0)).filter(Boolean), marks }, right: [P.built(hw, {}), P.waves({ waves: run.waves, rows: ['tb.en', 'tb.d', 'tb.q'], t: 0, t1: run.time, w: 340 })], focus: 'right' });
      F.add(P.frame(intro, latch ? 'When en = 0 nothing assigns q, so q must keep the value it had. The synthesis tool says: "' + (lnote ? lnote.say : 'a latch keeps its old value') + '". So it builds a latch: transparent while en = 1, holding while en = 0.' : 'Every path gives q a value, so q never has to remember anything: the tool builds plain gates, q = en & d, and no latch.'));
      const walk = P.stimFrames({ src, run, ins: ['en', 'd'], outs: ['q'], hw, ask: 'q', dut: 'hold' });
      for (const f of walk) F.add(f);
      const held = latch ? K.code.changes(run.waves, 'tb.en').filter((q) => q[1] === 0).length : 0;
      F.set('holds', held);
      const end = P.scene({ code: { src, hot: [], marks }, right: [P.built(hw, { values: hw.values ? hw.values(run.time) : undefined }), P.waves({ waves: run.waves, rows: ['tb.en', 'tb.d', 'tb.q'], t1: run.time, w: 340 })], focus: 'right' });
      // a stretch with en = 0 in this run: what q held and what d did meanwhile
      const at = (n, t) => show(K.code.at(run.waves, 'tb.' + n, t));
      const enCh = K.code.changes(run.waves, 'tb.en');
      const lows = enCh.map((q, i) => ({ t0: q[0], t1: i + 1 < enCh.length ? enCh[i + 1][0] : run.time, v: String(q[1]) })).filter((x) => x.v === '0');
      const dIn = (x) => K.code.changes(run.waves, 'tb.d').filter((q) => q[0] > x.t0 && q[0] < x.t1);
      const lo = lows.find((x) => dIn(x).length) || lows[0];
      const heldSay = lo ? 'From ' + P.ns(lo.t0) + ' to ' + P.ns(lo.t1) + ' en = 0 and q held ' + at('q', lo.t0) + (dIn(lo).length ? ' while d ' + (dIn(lo).length === 1 ? 'went to ' + String(dIn(lo)[0][1]) : 'changed') : '') + ': memory,' : 'Whenever en = 0, q holds: memory,';
      F.add(P.frame(end, latch ? heldSay + ' built from an always block meant to be combinational. Latches are hard to time and usually a mistake. Give the variable a value on every path: an else, a default in a case, or an assignment at the top of the block.' : 'q followed d while en = 1 and was 0 while en = 0: a gate, with nothing remembered. Giving q a value on every path is what kept the latch away.', { mark: 'end' }));
      return { frames: F.list, def: P.def([{ kind: 'math', title: 'No latch', text: ['always @* begin', "  q = 1'b0;      // a value first", '  if (en) q = d;  // then the change', 'end'].join('\n') }, P.warnSection(run.warnings)]) };
    },
    predict: P.predict,
    quiz: [
      { q: 'always @* if (go) z = a; — what does synthesis build for z?', options: ['A latch enabled by go', 'An AND gate', 'A flip-flop', 'A wire'], answer: 0, why: 'When go = 0, z must keep its value.' },
      { q: 'Which change removes the latch?', options: ['Add else z = 0;', 'Use <= instead of =', 'Add go to the sensitivity list', 'Declare z as wire'], answer: 0, why: 'Now every path assigns z.' },
      { q: 'A case without default in an always @* block, with labels for only some values, gives…', options: ['a latch for the variables it assigns', 'a multiplexer', 'a compile error', 'nothing'], answer: 0, why: 'For the missing values nothing assigns, so the old value is kept.' },
      { q: 'Why are unintended latches a problem?', options: ['They are memory where none was meant, and are hard to time', 'They are slower than flip-flops in simulation', 'They cannot hold a 1', 'They need a clock'], answer: 0, why: 'They change while the enable is high, which timing tools handle badly.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
