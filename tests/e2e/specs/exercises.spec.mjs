// The exercise kinds with their embedded editors, on exercises from the course: for each, a right answer passes, a
// wrong one fails with its message, and the editor in the answer area works. Also the lesson blocks that run, and a
// lab beside the bench.
import { assert } from '../lib.mjs';

export default function (t) {
  const A = (p, js) => p.ev(`(() => { const a = Sirkit.app.page.answer; ${js} })()`);
  const check = async (p) => { await p.click('#btnCheck'); await p.sleep(60); return p.text('#exResult'); };
  const live = (p, js) => p.ev(`(() => { const L = Sirkit.app.page.editors[0], e = L.editor; ${js} })()`);
  const fill = (p, vals) => p.fn((v) => { for (const [k, x] of Object.entries(v)) { const i = document.querySelector('#answer input[data-key="' + CSS.escape(k) + '"]'); if (!i) throw new Error('no cell ' + k); i.value = x; i.dispatchEvent(new Event('input', { bubbles: true })); } return 1; }, vals);

  t.test('circuit: the editor embeds with the ports and a NAND-only palette, simulates, and checks', async (p) => {
    await p.route('exercise=alg-ex-nand-or');
    assert.ok(await p.exists('#answer .exc-live .ed-svg[data-schematic]'), 'the editor is in the answer area');
    assert.deepEqual(await p.ev("[...document.querySelectorAll('#answer .exc-part')].map((b) => b.dataset.type).filter((v, i, a) => a.indexOf(v) === i)"), ['NAND']);
    assert.deepEqual(await live(p, "return e.root.parts.map((q) => q.type + ':' + q.params.name).sort()"), ['IN:A', 'IN:B', 'OUT:F']);
    await p.click('#answer .exc-part');
    assert.equal(await live(p, "return e.root.parts.filter((q) => q.type === 'NAND').length"), 1, 'a click on the palette adds a NAND');
    // wire one NAND by name and check: wrong, with the row that differs
    await live(p, "const g = e.root.parts.find((q) => q.type === 'NAND').id; e.connect(['in1', 'y'], [g, 'i0']); e.connect(['in2', 'y'], [g, 'i1']); e.connect([g, 'y'], ['out1', 'a']); return 1");
    let r = await check(p);
    assert.ok(r.includes('Not yet') && r.includes('should be'), r);
    assert.ok(await p.exists('#exOpenRun'), 'the run can be opened');
    await p.click('#exShowRun');
    // the right circuit, put in the editor as a document
    await live(p, "e.setDoc(Sirkit.ExWidgets.docOf('na = NAND(A, A)\\nnb = NAND(B, B)\\nF = NAND(na, nb)', { outputs: ['F'] })); return 1");
    await p.sleep(200);
    r = await check(p);
    assert.ok(r.includes('Correct') && r.includes('3 gates'), r);
    // switches answer clicks while it simulates: flip A and the output wire lights
    await p.ev("Sirkit.app.page.editors[0].set({ A: 1, B: 0 })");
    await p.sleep(200);
    assert.ok(await p.ev("document.querySelectorAll('#answer path[data-wire].v1').length > 0"), 'wires show values');
  });

  t.test('circuit: the run opens in the workbench with its inputs', async (p) => {
    await p.route('exercise=alg-ex-nand-or');
    await live(p, "e.setDoc(Sirkit.ExWidgets.docOf('F = NAND(A, B)', { outputs: ['F'] })); return 1");
    await p.sleep(150);
    await check(p);
    await p.click('#exOpenRun');
    await p.wait("location.hash === '#build' && !!Sirkit.Build.page");
    assert.ok(await p.ev("Sirkit.Build.page.editor.root.parts.some((q) => q.type === 'NAND')"));
  });

  t.test('sequential circuit: a shift register is compared clock by clock', async (p) => {
    await p.route('exercise=p7x-shift-build');
    assert.ok(await p.ev("[...document.querySelectorAll('#answer .exc-part')].some((b) => b.dataset.type === 'DFF')"), 'flip-flops in the palette');
    await live(p, "e.setDoc(Sirkit.ExWidgets.docOf('q0 = DFF(SI)\\nq1 = DFF(SI)\\nq2 = DFF(SI)\\nQ0 = q0\\nQ1 = q1\\nQ2 = q2', { outputs: ['Q0', 'Q1', 'Q2'] })); return 1");
    await p.sleep(150);
    let r = await check(p);
    assert.ok(r.includes('clock edge'), r);
    await live(p, "e.setDoc(Sirkit.ExWidgets.docOf(Sirkit.Content.exercises.get('p7x-shift-build').solution, { outputs: ['Q0', 'Q1', 'Q2'] })); return 1");
    await p.sleep(150);
    r = await check(p);
    assert.ok(r.includes('Correct'), r);
  });

  t.test('kmap: groups circled by dragging, a cover that is not minimal, then a minimal one', async (p) => {
    await p.route('exercise=min-ex-k4-ess');
    assert.ok(await p.exists('#exKmap svg.km'));
    // drag from cell 0 to its neighbour, cell 4: a group of two
    const a = await p.ev("(() => { const r = document.querySelector('#exKmap [data-m=\"0\"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()");
    const b = await p.ev("(() => { const r = document.querySelector('#exKmap [data-m=\"4\"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()");
    await p.drag(a[0], a[1], b[0], b[1], { steps: 8 });
    assert.equal(await p.count('#exGroups li'), 1, 'one group drawn');
    let r = await check(p);
    assert.ok(r.includes('Not yet') && r.includes('no group covers'), r);
    await A(p, "a.set(['0-00', '-10-', '1-00', '11-1']); return 1");
    r = await check(p);
    assert.ok(r.includes('not minimal'), r);
    await A(p, "a.set(['-10-', '--00', '11-1']); return 1");
    r = await check(p);
    assert.ok(r.includes('Correct') && r.includes('minimal'), r);
  });

  t.test('kmap, hazard-free: a minimal cover with a split pair names the consensus term, then a hazard-free one', async (p) => {
    await p.route('exercise=p10x-hf-three');
    assert.ok(await p.exists('#exKmap svg.km'));
    await A(p, "a.set([\"A'B\", 'AC']); return 1");
    let r = await check(p);
    assert.ok(r.includes('static-1 hazard') && r.includes('cells 3 (011) and 7 (111)') && r.includes('consensus term BC'), r);
    await A(p, "a.set([\"A'B\", 'AC', 'BC', \"AB'C\"]); return 1");
    r = await check(p);
    assert.ok(r.includes('bigger than it needs to be'), r);
    await A(p, "a.set([\"A'B\", 'AC', 'BC']); return 1");
    r = await check(p);
    assert.ok(r.includes('Correct') && r.includes('hazard-free'), r);
  });

  t.test('qm: the prime implicant list and the chart', async (p) => {
    await p.route('exercise=min-ex-qm-primes');
    await p.setValue('#ansTerms', "AC'\nA'BC");
    let r = await check(p);
    assert.ok(r.includes('missing'), r);
    await p.setValue('#ansTerms', "AC', A'BC, A'B'D, ABD', A'CD, B'C'D, BCD'");
    r = await check(p);
    assert.ok(r.includes('Correct'), r);
    await p.route('exercise=min-ex-qm-chart');
    const sol = await p.ev("Sirkit.Content.exercises.get('min-ex-qm-chart').solution");
    await fill(p, { "P1: CD'|2": 'X' });
    r = await check(p);
    assert.ok(r.includes('not right'), r);
    await fill(p, sol);
    r = await check(p);
    assert.ok(r.includes('Correct'), r);
  });

  t.test('proof: steps with their laws, a wrong law named, then the whole proof', async (p) => {
    await p.route('exercise=alg-ex-pf-uniting-pos');
    await p.setValue('#exProof li:nth-child(1) input', "A + BB'");
    await p.setValue('#exProof li:nth-child(1) select', 'complement', 'change');
    let r = await check(p);
    assert.ok(r.includes('does not give it in one step'), r);
    assert.ok(await p.exists('#exProof li.bad'), 'the step is marked');
    await p.setValue('#exProof li:nth-child(1) select', 'distributive-or', 'change');
    await p.click('#exAddStep');
    await p.setValue('#exProof li:nth-child(2) input', 'A + 0');
    await p.setValue('#exProof li:nth-child(2) select', 'complement', 'change');
    r = await check(p);
    assert.ok(r.includes('has not reached'), r);
    await p.click('#exAddStep');
    await p.setValue('#exProof li:nth-child(3) input', 'A');
    await p.setValue('#exProof li:nth-child(3) select', 'identity', 'change');
    r = await check(p);
    assert.ok(r.includes('Correct'), r);
  });

  t.test('simplify and convert: typed answers with their reasons', async (p) => {
    await p.route('exercise=alg-ex-simplify-b');
    await p.setValue('#ansText', "A'B + AB");
    let r = await check(p);
    assert.ok(r.includes('can be done with 1'), r);
    await p.setValue('#ansText', 'B');
    assert.ok((await check(p)).includes('Correct'));
    await p.route('exercise=num-ex-dec-bin');
    await p.setValue('#ansText', '11010111');
    r = await check(p);
    assert.ok(r.includes('places from the right'), r);
    await p.click('.exc-work summary');
    await p.setValue('#ansWorking', '213 / 2 = 106 r 1 ...');
    await p.setValue('#ansText', '11010101');
    assert.ok((await check(p)).includes('Correct'));
  });

  t.test('truthtable: cell by cell', async (p) => {
    await p.route('exercise=alg-ex-gate-table');
    await fill(p, { '000|F': '1', '001|F': '1', '010|F': '0', '011|F': '0', '100|F': '0', '101|F': '0', '110|F': '0', '111|F': '0' });
    assert.ok((await check(p)).includes('not right'));
    await fill(p, { '000|F': '0' });
    assert.ok((await check(p)).includes('Correct'));
  });

  t.test('fsm: the state table grid, and the flow from assignment to equations', async (p) => {
    await p.route('exercise=fsm-ex-table-100');
    const rows = { 'S0|0|next': 'S0', 'S0|0|out': '0', 'S0|1|next': 'S1', 'S0|1|out': '0', 'S1|0|next': 'S2', 'S1|0|out': '0', 'S1|1|next': 'S1', 'S1|1|out': '0', 'S2|0|next': 'S0', 'S2|0|out': '0', 'S2|1|next': 'S1', 'S2|1|out': '0' };
    await fill(p, rows);
    let r = await check(p);
    assert.ok(r.includes('Row S2 on input 0 should output 1'), r);
    await fill(p, { 'S2|0|out': '1' });
    assert.ok((await check(p)).includes('Correct'));
    await p.route('exercise=fsm-ex-flow-d');
    assert.ok(await p.exists('#answer .exc-fsm svg'), 'the diagram is shown');
    const sol = await p.ev("Sirkit.Content.exercises.get('fsm-ex-flow-d').solution");
    await fill(p, { 'SN|code': '00', 'WN|code': '01', 'WT|code': '01', 'ST|code': '10' });
    r = await check(p);
    assert.ok(r.includes('share the code'), r);
    await fill(p, Object.assign({ 'WT|code': '11' }, sol.transition, sol.excitation));
    await p.fn((eqs) => { for (const [k, v] of Object.entries(eqs)) document.querySelector('input[data-eq="' + k + '"]').value = v; return 1; }, { D1: "Q1Q0' + Q0X", D0: "Q1'X", Z: 'Q1' });
    r = await check(p);
    assert.ok(r.includes('In the equations'), r);
    await p.fn(() => { document.querySelector('input[data-eq="D0"]').value = "Q1X' + Q1'X"; return 1; });
    assert.ok((await check(p)).includes('Correct'));
  });

  t.test('verilog: compile, a failing case from the hidden testbench, then a pass', async (p) => {
    await p.route('exercise=comb-ex-mux-verilog');
    const [bad, good] = await p.ev("(() => { const x = Sirkit.Content.exercises.get('comb-ex-mux-verilog'); return [x.wrong[0], x.solution]; })()");
    await p.setValue('#ansProgram', bad);
    await p.click('#exCompile');
    assert.ok((await p.text('#exConsole')).includes('Compiles'));
    let r = await check(p);
    assert.ok(r.includes('testbench found a case'), r);
    await p.setValue('#ansProgram', good);
    r = await check(p);
    assert.ok(r.includes('Correct') && r.includes('synthesises'), r);
  });

  t.test('timing and cpu: numbers off a circuit, a program on test inputs', async (p) => {
    await p.route('exercise=comb-ex-mux-time');
    assert.ok(await p.exists('#answer .ls-schem svg'), 'the circuit is drawn');
    await p.setValue('#ansText', '23');
    assert.ok((await check(p)).includes('more than 23'));
    await p.setValue('#ansText', '31');
    assert.ok((await check(p)).includes('Correct'));
    await p.route('exercise=p13x-sum3');
    await p.setValue('#ansProgram', 'IN\nSTA t\nIN\nADD t\nOUT\nHLT\nt: DB 0');
    await p.click('#exRun');
    assert.ok((await p.text('#exConsole')).includes('Output: 3'));
    assert.ok((await check(p)).includes('should be 6'));
    await p.setValue('#ansProgram', 'IN\nSTA t\nIN\nADD t\nSTA t\nIN\nADD t\nOUT\nHLT\nt: DB 0');
    assert.ok((await check(p)).includes('Correct'));
  });

  t.test('waveform: slots clicked to set levels', async (p) => {
    await p.route('exercise=p7x-sync-wave');
    assert.ok(await p.exists('#exWave svg .exc-slot'));
    await p.click('#exWave .exc-slot[data-row="1"][data-slot="1"]');
    assert.equal(await A(p, 'return a.get().Q2[1]'), '1', 'one click sets 1');
    let r = await check(p);
    assert.ok(r.includes('no level set'), r);
    await A(p, "a.set({ Q2: '000011110', Q1: '001100110', Q0: '010101010' }); return 1");
    r = await check(p);
    assert.ok(r.includes('slot 5'), r);
    await A(p, "a.set({ Q2: '000001111', Q1: '001110011', Q0: '010010100' }); return 1");
    assert.ok((await check(p)).includes('Correct'));
  });

  t.test('timed waveform and fan-out: real delays per slot, and a driver that may feed two inputs', async (p) => {
    await p.route('exercise=p11x-nand-wave-ttl');
    assert.ok((await p.text('#answer')).includes('Each slot lasts 5 ns'), 'the slot length is said');
    await A(p, "a.set({ Y: '1000011101111' }); return 1");
    let r = await check(p);
    assert.ok(r.includes('5 to 10 ns') && r.includes('at the end of the slot'), r);
    await A(p, "a.set({ Y: '1100000111111' }); return 1");
    assert.ok((await check(p)).includes('Correct'));
    await p.route('exercise=p11x-fanout-nand');
    await live(p, "e.setDoc(Sirkit.ExWidgets.docOf('n1 = NAND(A, B)\\nn2 = NAND(A, C)\\nn3 = NAND(A, D)\\nF = NAND(n1, n2, n3)', { outputs: ['F'] })); return 1");
    await p.sleep(150);
    r = await check(p);
    assert.ok(r.includes('fan-out of at most 2'), r);
    await p.route('exercise=p10x-latch-build');
    await live(p, "e.setDoc(Sirkit.ExWidgets.docOf(Sirkit.Content.exercises.get('p10x-latch-build').solution, { outputs: ['Q'] })); return 1");
    await p.sleep(150);
    r = await check(p);
    assert.ok(r.includes('Correct') && r.includes('6 input settings'), r);
    assert.deepEqual(p.newExceptions(), []);
  });

  t.test('lab: the experiment beside the bench, checked on the board and from the exercise', async (p) => {
    await p.route('lab=alg-lab-parity');
    assert.ok(await p.exists('#labExp'), 'the experiment panel');
    await p.click('#labExpStart');
    await p.click('#labExpCheck');
    assert.ok((await p.text('#labExpResult')).includes('Not yet'));
    await p.ev("(() => { const L = Sirkit.Lab.page; L.state = Sirkit.Labs.state(Sirkit.Content.labs.get('alg-lab-parity').reference); L.rebuild(); return 1; })()");
    const seen = await p.ev("Sirkit.Content.exercises.get('alg-ex-lab-parity').solution.observe");
    await p.fn((v) => { for (const [k, x] of Object.entries(v)) document.querySelector('#labExp input[data-key="' + k + '"]').value = x; return 1; }, seen);
    await p.click('#labExpCheck');
    const r = await p.text('#labExpResult');
    assert.ok(r.includes('The experiment works'), r);
    await p.route('exercise=alg-ex-lab-parity');
    await fill(p, { '0000|led0': '1' });
    assert.ok((await check(p)).includes('observation table'));
  });

  t.test('lesson blocks: a live circuit, a K-map, the function view, a waveform, Verilog run and a state diagram', async (p) => {
    await p.route('lesson=comb-adders');
    assert.ok(await p.exists('#lessonView .ls-player'), 'the topic at a frame');
    assert.ok(await p.count('#lessonView .exc-live') >= 1, 'a live circuit');
    await p.click('#lessonView [data-act="run"]');
    assert.ok((await p.text('#lessonView .exc-console')).includes('1 + 1 + 1 = 11'));
    await p.route('lesson=min-dc');
    assert.ok(await p.exists('#lessonView .ls-kmap svg.km .km-grp'), 'the K-map with groups');
    assert.ok((await p.text('#lessonView .ls-func')).includes('Minimal SOP'));
    await p.route('lesson=fsm-l-mealy-moore');
    assert.ok(await p.exists('#lessonView .ls-wave svg .exc-lvl'), 'the waveform');
    assert.ok(await p.exists('#lessonView .exc-fsm svg'), 'the state diagram');
    await p.route('lesson=comb-mux');
    await p.click('#lessonView a.ls-link[href="#lab=comb-lab-mux"]');
    await p.wait("!!document.querySelector('#labExp')");
    assert.deepEqual(p.newExceptions(), []);
  });

  t.test('the exercise views fit a phone', async (p) => {
    await p.viewport(390, 844, { mobile: true, touch: true });
    for (const id of ['alg-ex-nand-or', 'alg-ex-pf-uniting-pos', 'fsm-ex-flow-d', 'p7x-sync-wave']) {
      await p.route('exercise=' + id);
      assert.ok(await p.noHScroll(), id + ' scrolls sideways');
    }
    await p.viewport(1400, 900);
  });
}
