// The state-machine workbench: drawing, labelling, undo, running, and the design flow stage by stage.
export default function (t) {
  const open = async (p, sample) => {
    await p.route('fsm');
    await p.wait('!!(Sirkit.FsmPage && Sirkit.FsmPage.page)');
    if (sample) { await p.ev(`Sirkit.FsmPage.loadSample(${JSON.stringify(sample)})`); await p.sleep(80); }
  };
  /** the screen point of a point of the diagram */
  const pt = (p, x, y) => p.ev(`(() => { const s = document.querySelector('.fsm-canvas svg'); const m = s.getScreenCTM(); return [m.a * ${x} + m.e, m.d * ${y} + m.f]; })()`);
  const model = (p) => p.ev('JSON.parse(JSON.stringify(Sirkit.FsmPage.page.model))');
  const dbl = async (p, x, y) => { await p.clickAt(x, y, { double: true, after: 150 }); };

  t.test('double-click places states, a rim drag draws a labelled arrow and a loop', async (p) => {
    await open(p, 'blank');
    const [x1, y1] = await pt(p, 120, 150);
    await dbl(p, x1, y1);
    // the view follows the drawing, so the second place is measured after the first state is there
    const [x2, y2] = await pt(p, 360, 150);
    await dbl(p, x2, y2);
    let m = await model(p);
    p.assert.equal(m.states.length, 2);
    p.assert.equal(m.start, 'S0');
    // from the rim of S0 to S1
    const a = m.states[0], b = m.states[1];
    const [rx, ry] = await pt(p, a.x + 25, a.y), [tx, ty] = await pt(p, b.x, b.y);
    await p.drag(rx, ry, tx, ty);
    await p.waitModal();
    await p.modalInput('1/0');
    await p.modalButton('OK');
    m = await model(p);
    p.assert.deepEqual(m.arrows, [{ from: 'S0', to: 'S1', label: '1/0' }], JSON.stringify(m.arrows));
    // a loop: in arrow mode (a drag from anywhere on the state), out and back onto it
    await p.click('#fsmArrowMode');
    const [cx, cy] = await pt(p, b.x, b.y);
    await p.mouse('mouseMoved', cx, cy);
    await p.b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1 });
    for (const [dx, dy] of [[0, -70], [40, -70], [5, 2]]) { await p.b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + dx, y: cy + dy, button: 'left', buttons: 1 }); await p.sleep(20); }
    await p.b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + 5, y: cy + 2, button: 'left', buttons: 0, clickCount: 1 });
    await p.waitModal();
    await p.modalInput('1/1');
    await p.modalButton('OK');
    m = await model(p);
    p.assert.ok(m.arrows.some((x) => x.from === 'S1' && x.to === 'S1' && x.label === '1/1'), JSON.stringify(m.arrows));
    p.assert.equal(await p.count('.fsm-arrow'), 2);
  });

  t.test('labels are read and their mistakes listed; undo and redo', async (p) => {
    await open(p, 'det1001');
    p.assert.match(await p.text('#fsmProblems'), /4 states.*every transition given/);
    // relabel the arrow S3 → S1 to something unreadable
    const k = await p.ev("Sirkit.FsmPage.page.model.arrows.findIndex((a) => a.from === 'S3' && a.to === 'S1')");
    await p.dblclick(`.fsm-label[data-label="${k}"]`);
    await p.waitModal();
    await p.modalInput('1/11');
    await p.modalButton('OK');
    p.assert.match(await p.text('#fsmProblems'), /has 2 output bits but there is 1 output/);
    p.assert.match(await p.text('#fsmStage'), /Finish the diagram first/);
    await p.key('z', { ctrl: true });
    p.assert.match(await p.text('#fsmProblems'), /every transition given/);
    await p.key('y', { ctrl: true });
    p.assert.match(await p.text('#fsmProblems'), /output bits/);
    await p.key('z', { ctrl: true });
    // a second arrow for one input is a conflict
    await p.ev("(() => { const pg = Sirkit.FsmPage.page; const m = JSON.parse(JSON.stringify(pg.model)); m.arrows.push({ from: 'S0', to: 'S2', label: '1/0' }); pg.change(m); })()");
    p.assert.match(await p.text('#fsmProblems'), /S0 has two arrows for input 1/);
  });

  t.test('rename a state, delete it, and the keyboard adds one', async (p) => {
    await open(p, 'fall');
    await p.ev("(Sirkit.FsmPage.page.editor.editState('FELL'), 1)");
    await p.waitModal();
    await p.modalInput('DROP');
    await p.modalButton('OK');
    let m = await model(p);
    p.assert.ok(m.states.some((s) => s.name === 'DROP'));
    p.assert.ok(m.arrows.some((a) => a.from === 'DROP' && a.to === 'IDLE'));
    await p.ev("Sirkit.FsmPage.page.editor.select({ state: 'DROP' })");
    await p.key('Delete');
    m = await model(p);
    p.assert.equal(m.states.length, 2);
    p.assert.ok(!m.arrows.some((a) => a.from === 'DROP' || a.to === 'DROP'));
    await p.ev('document.activeElement.blur()');
    await p.key('n');
    p.assert.equal((await model(p)).states.length, 3);
  });

  t.test('run a sequence: outputs and the state lit at each step', async (p) => {
    await open(p, 'det1001');
    await p.setValue('#fsmSeq', '1001001');
    await p.click('#fsmRunBtn');
    p.assert.equal(await p.text('#fsmRunOutputs'), '0001001');
    await p.click('#fsmRunNext');
    await p.click('#fsmRunNext');
    p.assert.match(await p.text('#fsmRunSay'), /Clock 2: in S1 with X = 0 the output is Z = 0 and the machine goes to S2/);
    p.assert.ok(await p.exists('.fsm-state.now[data-state="S2"]'));
  });

  t.test('Mealy to Moore and back keeps the behaviour', async (p) => {
    await open(p, 'det1001');
    await p.click('#fsmKind-moore');
    const m = await model(p);
    p.assert.equal(m.type, 'moore');
    p.assert.ok(m.states.length >= 4);
    await p.setValue('#fsmSeq', '1001001');
    await p.click('#fsmRunBtn');
    // a Moore machine shows the output one clock later, after the start state's own
    p.assert.equal(await p.text('#fsmRunOutputs'), '00001001');
  });

  t.test('stage 1: a wrong state table is refused, the revealed one passes', async (p) => {
    await open(p, 'fall');
    await p.ev("document.querySelector('#fsmTableFill select[data-s=\"IDLE\"][data-x=\"0\"]').value = 'HIGH'; document.querySelector('#fsmTableFill select[data-s=\"IDLE\"][data-x=\"0\"]').dispatchEvent(new Event('change'))");
    await p.click('#fsmCheck');
    p.assert.match(await p.text('#fsmVerdict'), /Fill every next state first/);
    // fill everything from the machine, but with one mistake
    await p.click('#fsmReveal');
    await p.ev("(() => { const s = document.querySelector('#fsmTableFill select[data-s=\"HIGH\"][data-x=\"0\"]'); s.value = 'IDLE'; s.dispatchEvent(new Event('change')); })()");
    await p.click('#fsmCheck');
    p.assert.match(await p.text('#fsmVerdict'), /Row HIGH on input 0 should go to FELL, not IDLE/);
    await p.ev("(() => { const s = document.querySelector('#fsmTableFill select[data-s=\"HIGH\"][data-x=\"0\"]'); s.value = 'FELL'; s.dispatchEvent(new Event('change')); })()");
    await p.click('#fsmCheck');
    p.assert.match(await p.text('#fsmVerdict'), /The state table is right/);
    p.assert.ok(await p.exists('#fsmStep-table.done'));
  });

  t.test('stage 2: equivalent states, right and wrong', async (p) => {
    await open(p, 'spare');
    await p.click('#fsmStep-reduce');
    await p.setValue('#fsmClasses', '{A, B} {C, D}');
    await p.click('#fsmCheck');
    p.assert.match(await p.text('#fsmVerdict'), /A and B are not equivalent/);
    await p.setValue('#fsmClasses', '{A, C} {B, D}');
    await p.click('#fsmCheck');
    p.assert.match(await p.text('#fsmVerdict'), /The classes are right/);
    await p.click('#fsmReveal');
    p.assert.ok(await p.exists('#fsmImp td.x'));
    p.assert.match(await p.text('#fsmReduceReveal'), /Reduction leaves 2 states/);
  });

  t.test('stage 3: own codes are checked, the kinds compared by cost', async (p) => {
    await open(p, 'det1001');
    await p.click('#fsmStep-assign');
    p.assert.ok(await p.exists('#fsmCompare tr.best'));
    await p.click('#fsmAssignKind button[data-v="custom"]');
    for (const [s, c] of [['S0', '00'], ['S1', '01'], ['S2', '01'], ['S3', '10']]) await p.setValue(`#fsmCodes input[data-s="${s}"]`, c);
    await p.click('#fsmCheck');
    p.assert.match(await p.text('#fsmVerdict'), /S2 and S1 share the code 01/);
    await p.setValue('#fsmCodes input[data-s="S2"]', '11');
    await p.click('#fsmCheck');
    p.assert.match(await p.text('#fsmVerdict'), /Every state has its own code/);
    p.assert.equal(await p.ev("Sirkit.FsmPage.page.design.codes.S2"), '11');
  });

  t.test('stage 4: the excitation table with JK flip-flops', async (p) => {
    await open(p, 'fall');
    await p.click('#fsmStep-excite');
    await p.click('#fsmFF button[data-v="JK"]');
    await p.click('#fsmReveal');
    await p.click('#fsmCheck');
    p.assert.match(await p.text('#fsmVerdict'), /transition and excitation tables are right/);
    // a J that cannot cause its change
    const row = await p.ev("(() => { const d = Sirkit.FsmPage.page.design; const r = d.rows.find((x) => x.code[0] === '0' && x.nextCode && x.nextCode[0] === '1'); return r.code + '|' + r.input; })()");
    const name = await p.ev("'J' + Sirkit.FsmPage.page.design.vars[0].replace(/^[A-Za-z]+/, '')");
    await p.setValue(`#fsmExcite input[data-k="${row}"][data-f="${name}"]`, '0');
    await p.click('#fsmCheck');
    p.assert.match(await p.text('#fsmVerdict'), /does not cause the 0→1 transition/);
  });

  t.test('stage 5: equations checked against the K-maps', async (p) => {
    await open(p, 'det1001');
    await p.click('#fsmStep-equations');
    p.assert.ok((await p.count('.fsm-kmap svg')) >= 3);
    await p.setValue('.fsm-eq[data-fn="Z"] input', 'Q1');
    await p.click('.fsm-eq[data-fn="Z"] .btn', 'Check');
    p.assert.match(await p.text('.fsm-eq[data-fn="Z"] .fsm-verdict'), /your Z gives 1 but it must be 0/);
    const right = await p.ev("Sirkit.FsmPage.page.design.functions.find((f) => f.name === 'Z').min.text");
    await p.setValue('.fsm-eq[data-fn="Z"] input', right);
    await p.click('.fsm-eq[data-fn="Z"] .btn', 'Check');
    p.assert.match(await p.text('.fsm-eq[data-fn="Z"] .fsm-verdict'), /Z is right and minimal/);
    await p.click('#fsmRevealAll');
    p.assert.ok((await p.count('.km-group')) >= 3);
    p.assert.ok(await p.exists('#fsmStep-equations.done'));
  });

  t.test('stage 6: the circuit, checked, and opened in the editor', async (p) => {
    await open(p, 'fall');
    await p.click('#fsmStep-circuit');
    p.assert.ok(await p.exists('#fsmCircuit svg[data-schematic]'));
    p.assert.match(await p.text('#fsmStage'), /Checked: from every state and input/);
    const has = await p.ev('!!(Sirkit.Build && Sirkit.Build.openCircuit)');
    await p.click('#fsmOpenCircuit');
    await p.sleep(300);
    if (has) p.assert.match(await p.ev('location.hash'), /build/);
    else await p.waitToast(/not available/);
  });

  t.test('kept across a reload, and shared as a link', async (p) => {
    await open(p, 'spare');
    await p.reload();
    await p.wait('!!(Sirkit.FsmPage && Sirkit.FsmPage.page)');
    p.assert.equal((await model(p)).start, 'A');
    const code = await p.ev("Sirkit.Share.pack({ kind: 'fsm', data: { model: Sirkit.FsmPage.SAMPLES.fall.model } })");
    await p.route('share=' + code);
    await p.wait("!!(Sirkit.FsmPage.page && Sirkit.FsmPage.page.model.start === 'IDLE')");
    p.assert.equal((await model(p)).type, 'moore');
  });

  t.test('phone: the page fits 390 pixels and the diagram still edits', async (p) => {
    await p.fresh({ width: 390, height: 844, mobile: true, touch: false });
    await open(p, 'det1001');
    p.assert.ok(await p.noHScroll());
    await p.click('#fsmStep-excite');
    p.assert.ok(await p.noHScroll());
    await p.click('#fsmAddState');
    p.assert.equal((await model(p)).states.length, 5);
  }, { fresh: { width: 390, height: 844, mobile: true } });
}
