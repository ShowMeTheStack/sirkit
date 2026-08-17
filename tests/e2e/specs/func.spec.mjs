// The function workbench: the views in step, K-map groups by dragging, the proof game, prove/refute, the circuit.
export default function (t) {
  const load = (p, data) => p.ev(`Sirkit.Func.set(${JSON.stringify(data)}); 1`);
  const cell = (p, m) => p.ev(`Sirkit.Func.page.km.at(${m})`);

  t.test('editing the truth table updates the lists, the expression and the K-map', async (p) => {
    await p.route('func');
    await load(p, { vars: ['A', 'B', 'C'], ones: [], dc: [], tab: 'kmap' });
    p.assert.equal(await p.ev("document.getElementById('fnExpr').value"), '0');
    await p.click('#fnTable td[data-m="5"]');
    await p.click('#fnTable td[data-m="7"]');
    p.assert.match(await p.ev("document.getElementById('fnSigma').value"), /Σm\(5, 7\)/);
    p.assert.equal(await p.ev("document.getElementById('fnExpr').value"), 'AC');
    p.assert.equal(await p.ev("document.querySelector('#fnKmap [data-m=\"5\"] .km-v').textContent"), '1');
    // a third click makes a don't-care
    await p.click('#fnTable td[data-m="6"]');
    await p.click('#fnTable td[data-m="6"]');
    p.assert.match(await p.ev("document.getElementById('fnSigma').value"), /d\(6\)/);
    p.assert.equal(await p.ev("document.querySelector('#fnKmap [data-m=\"6\"] .km-v').textContent"), '×');
  });

  t.test('typing an expression or a list sets the function', async (p) => {
    await p.route('func');
    await p.setValue('#fnExpr', "~a & b | c", 'change');
    p.assert.match(await p.ev("document.getElementById('fnFacts').innerText"), /3 variables \(a, b, c\)/);
    await p.setValue('#fnSigma', 'Σm(0, 3) + d(1)', 'change');
    p.assert.match(await p.ev("document.getElementById('fnPi').value"), /ΠM\(2, 4, 5, 6, 7\)/);
    await p.setValue('#fnExpr', 'A + (B', 'change');
    p.assert.match(await p.text('#fnErr'), /\)|bracket|end/i);
  });

  t.test('circling K-map groups by dragging, each checked, then the cover', async (p) => {
    await p.route('func');
    await load(p, { vars: ['A', 'B', 'C', 'D'], ones: [0, 2, 5, 7, 8, 10, 13], dc: [6, 15], tab: 'kmap' });
    // B D: cells 5, 7, 13, 15 (rows 01, 11; columns 01, 11)
    let [x1, y1] = await cell(p, 5), [x2, y2] = await cell(p, 15);
    await p.drag(x1, y1, x2, y2);
    p.assert.equal(await p.ev('Sirkit.Func.page.st.groups.length'), 1);
    p.assert.match(await p.text('#fnSay'), /prime implicant: BD/);
    // a group of three cells is flagged
    [x1, y1] = await cell(p, 0); [x2, y2] = await cell(p, 3);
    await p.drag(x1, y1, x2, y2);
    p.assert.match(await p.text('#fnSay'), /1, 2, 4, 8/);
    p.assert.equal(await p.count('#fnGroups li.bad'), 1);
    await p.click('#fnGroups li.bad button');
    // the four corners: drag from cell 0 up past the top edge and left past the left edge wraps round
    [x1, y1] = await cell(p, 0);
    await p.drag(x1, y1, x1 - 60, y1 - 60, { steps: 10 });
    p.assert.deepEqual(await p.ev('Sirkit.Func.page.st.groups[1]'), [0, 2, 8, 10]);
    p.assert.match(await p.text('#fnSay'), /prime implicant: B'D'/);
    await p.click('#fnCheck');
    p.assert.equal(await p.attr('#fnVerdict', 'data-verdict'), 'minimal');
    p.assert.match(await p.text('#fnVerdict'), /Correct and minimal/);
    // an extra, redundant group: correct but not minimal
    [x1, y1] = await cell(p, 6); [x2, y2] = await cell(p, 7);
    await p.drag(x2, y2, x1, y1);
    await p.click('#fnCheck');
    p.assert.equal(await p.attr('#fnVerdict', 'data-verdict'), 'not-minimal');
    // leaving a 1 out: wrong
    await p.ev("Sirkit.Func.page.st.groups.splice(0, 1); Sirkit.Func.page.render(); 1");
    await p.click('#fnCheck');
    p.assert.equal(await p.attr('#fnVerdict', 'data-verdict'), 'wrong');
    p.assert.equal(await p.count('#fnKmap .km-cell.miss'), 1);
  });

  t.test('grouping 0s for POS', async (p) => {
    await p.route('func');
    await load(p, { vars: ['A', 'B', 'C'], ones: [3, 5, 6, 7], dc: [], tab: 'kmap' });
    await p.click('#fnForm-pos');
    const [x1, y1] = await cell(p, 0), [x2, y2] = await cell(p, 1);
    await p.drag(x1, y1, x2, y2);
    p.assert.match(await p.text('#fnSay'), /A \+ B/);
  });

  t.test('the proof game: a law refused with its reason, then a proof to the goal, exported', async (p) => {
    await p.route('func');
    await load(p, { vars: ['P', 'Q', 'R'], ones: [3, 4, 5, 6, 7], dc: [], tab: 'proof', proof: { start: "(P + Q)(P + Q') + P'QR", goal: 'P + QR', steps: [], sel: [] } });
    // involution on the whole expression does not fit
    const id = (engine, fallback) => p.ev(`Sirkit.FuncEng.engineLaws() ? ${JSON.stringify(engine)} : ${JSON.stringify(fallback)}`);
    await p.click('#pfLaws [data-law="involution"]');
    p.assert.match(await p.text('#pfMsg'), /Refused: Involution/);
    // select (P + Q)(P + Q') and factor P out
    const pick = (path) => p.ev(`Sirkit.Func.page.st.proof.sel = ${JSON.stringify(path)}; Sirkit.Func.page.render(); 1`);
    await pick([0]);
    await p.click(`#pfLaws [data-law="${await id('distributive-or', 'factor')}"]`);
    p.assert.match(await p.text('#pfMsg'), /becomes P \+ QQ'/);
    // clicking a variable selects it; clicking it again widens to the term around it
    await p.click('#pfExpr [data-path="0.1.0"]');
    p.assert.deepEqual(await p.ev('Sirkit.Func.page.st.proof.sel'), [0, 1, 0]);
    await p.click('#pfExpr [data-path="0.1.0"]');
    p.assert.deepEqual(await p.ev('Sirkit.Func.page.st.proof.sel'), [0, 1]);
    await p.click('#pfLaws [data-law="complement"]');
    await pick([0]);
    await p.click('#pfLaws [data-law="identity"]');
    // a hint selects the next useful part
    await p.click('#pfHint');
    p.assert.match(await p.text('#pfMsg'), /Hint: try Absorption \(second form\)/);
    await p.click(`#pfLaws [data-law="${await p.ev('Sirkit.Func.page.st.proof.hint.law')}"]`);
    await p.wait("!!document.getElementById('pfDone')");
    p.assert.match(await p.text('#pfDone'), /Proved in 4 steps/);
    p.assert.equal(await p.count('#pfSteps li'), 5);
    const txt = await p.ev('Sirkit.Func.page.proofText()');
    p.assert.match(txt, /= P \+ QR\s+\(Absorption \(second form\)/);
    // replay goes back a step
    await p.click('#pfPrev');
    p.assert.equal(await p.count('#pfExpr.replay'), 1);
    p.assert.match(await p.text('.pf-pos'), /step 3 of 4/);
  });

  t.test('prove and refute', async (p) => {
    await p.route('func');
    await load(p, { vars: ['A', 'B'], ones: [1, 2], dc: [], tab: 'prove' });
    await p.setValue('#pvA', "A'B + AB'");
    await p.setValue('#pvB', 'A ^ B');
    await p.click('#pvGo');
    p.assert.equal(await p.attr('#pvRes', 'data-equal'), 'true');
    await p.setValue('#pvB', 'A + B');
    await p.click('#pvGo');
    p.assert.equal(await p.attr('#pvRes', 'data-equal'), 'false');
    p.assert.match(await p.text('#pvRes'), /A = 1, B = 1/);
    p.assert.equal(await p.count('.pv-tt tr.hl'), 1);
  });

  t.test('hazards are found and fixed', async (p) => {
    await p.route('func');
    await p.setValue('#fnExpr', "B'C + AB", 'change');
    await p.click('#fnTab-hazards');
    p.assert.match(await p.text('#hzSay'), /1 static-1 hazard/);
    await p.click('#hzUse');
    await p.click('#fnTab-hazards');
    p.assert.match(await p.text('#hzSay'), /No static-1 hazards/);
  });

  t.test('build circuit hands the circuit to the editor', async (p) => {
    await p.route('func');
    await load(p, { vars: ['A', 'B', 'C'], ones: [3, 5, 6, 7], dc: [], tab: 'circuit' });
    p.assert.ok(await p.exists('#bdPreview svg[data-schematic]'));
    await p.ev("window.__got = null; Sirkit.Build = Sirkit.Build || {}; window.__oldOpen = Sirkit.Build.openCircuit; Sirkit.Build.openCircuit = (c, title) => { window.__got = { parts: c.parts.length, title }; }; 1");
    await p.setValue('#bdStyle', 'nand-nand', 'change');
    await p.click('#bdOpen');
    const got = await p.ev('window.__got');
    p.assert.ok(got && got.parts > 4, 'openCircuit was called with the circuit');
    p.assert.match(got.title, /F = /);
    await p.ev('Sirkit.Build.openCircuit = window.__oldOpen; 1');
  });

  t.test('share link round trip and autosave', async (p) => {
    await p.route('func');
    await load(p, { vars: ['A', 'B', 'C'], ones: [1, 2, 4, 7], dc: [], tab: 'kmap' });
    const code = await p.ev("Sirkit.Share.pack({ kind: 'func', data: Sirkit.Func.page.st })");
    await load(p, { vars: ['A', 'B'], ones: [0], dc: [] });
    await p.route('share=' + code);
    await p.wait("location.hash === '#func' && !!Sirkit.Func.page");
    p.assert.match(await p.ev("document.getElementById('fnSigma').value"), /Σm\(1, 2, 4, 7\)/);
    await p.reload();
    await p.wait('!!Sirkit.Func.page');
    p.assert.match(await p.ev("document.getElementById('fnSigma').value"), /Σm\(1, 2, 4, 7\)/);
  });

  t.test('phone width: no sideways scroll, every tab draws', async (p) => {
    await p.fresh({ width: 390, height: 844, mobile: true, touch: true, hash: 'func' });
    for (const tab of ['kmap', 'qm', 'proof', 'prove', 'convert', 'cost', 'hazards', 'circuit']) {
      await p.ev(`Sirkit.Func.page.setTab('${tab}'); 1`);
      await p.sleep(60);
      p.assert.ok(await p.noHScroll(), 'no sideways scroll on ' + tab);
      p.assert.equal(await p.ev("document.querySelector('.main').scrollWidth <= document.querySelector('.main').clientWidth + 1"), true, tab);
    }
  });
}
