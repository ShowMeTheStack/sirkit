// The Verilog page: files and tabs, highlighting and error marks, examples, Run, Synthesise, save and share.
export default function (t) {
  const live = (p, what) => p.ev(`!!(Sirkit.VerilogPageAPI && Sirkit.VerilogPageAPI.VE['can${what}']())`);
  const type = async (p, text) => { await p.ev(`(() => { const ta = document.getElementById('vlCode'); ta.focus(); ta.value = ${JSON.stringify(text)}; ta.dispatchEvent(new Event('input', { bubbles: true })); })()`); await p.sleep(400); };

  t.test('opens with an example, highlighted, with line numbers', async (p) => {
    await p.route('verilog');
    p.assert.ok(await p.exists('#vlCode'));
    p.assert.ok((await p.count('#vlTabs .vl-tab[data-i]')) >= 2, 'two files of the half adder');
    p.assert.ok(await p.exists('.vl-hl .vk-kw'), 'keywords highlighted');
    const lines = await p.ev("document.getElementById('vlCode').value.split('\\n').length");
    p.assert.equal(await p.count('.vl-gut .vl-ln'), lines);
    p.assert.ok(await p.noHScroll(), 'no sideways page scroll');
  });

  t.test('typing keeps the highlight in step and errors are marked', async (p) => {
    await p.route('verilog');
    if (!(await live(p, 'Check'))) return;
    await type(p, 'module half_adder (input a, input b, output sum, output carry);\n  assign sum = a &;\n  assign carry = a & b;\nendmodule\n');
    await p.wait("document.querySelectorAll('#vlProbs .vl-prob').length > 0");
    p.assert.ok(await p.exists('.vl-gut .vl-ln.bad'), 'a gutter mark');
    p.assert.ok(await p.exists('.vl-hl .vk-err'), 'a wavy underline');
    p.assert.match(await p.text('#vlStatus'), /problem/);
    await p.click('#vlProbs .vl-prob');
    const pos = await p.ev("document.getElementById('vlCode').selectionStart");
    p.assert.ok(pos > 20, 'the caret moved to the error');
    await type(p, 'module half_adder (input a, input b, output sum, output carry);\n  assign sum = a ^ b;\n  assign carry = a & b;\nendmodule\n');
    await p.wait("!document.querySelector('#vlProbs .vl-prob')");
    p.assert.match(await p.text('#vlStatus'), /No errors/);
  });

  t.test('files: add, rename, delete, switch', async (p) => {
    await p.route('verilog');
    const n0 = await p.count('#vlTabs .vl-tab[data-i]');
    await p.click('#vlAddFile');
    await p.waitModal();
    await p.modalInput('extra.v');
    await p.modalButton('Create');
    await p.wait(`document.querySelectorAll('#vlTabs .vl-tab[data-i]').length === ${n0 + 1}`);
    p.assert.match(await p.text('#vlTabs .vl-tab.on'), /extra\.v/);
    await p.dblclick('#vlTabs .vl-tab.on .vl-tabname');
    await p.waitModal();
    await p.modalInput('renamed.v');
    await p.modalButton('Rename');
    await p.wait("document.querySelector('#vlTabs .vl-tab.on').innerText.includes('renamed.v')");
    await p.click('#vlTabs .vl-tab.on .vl-tabx');
    await p.waitModal();
    await p.modalButton('Delete');
    await p.wait(`document.querySelectorAll('#vlTabs .vl-tab[data-i]').length === ${n0}`);
    await p.click('#vlTabs .vl-tab[data-i="1"]');
    p.assert.match(await p.ev("document.getElementById('vlCode').value"), /tb_half_adder/);
  });

  t.test('examples load and autosave keeps edits across a reload', async (p) => {
    await p.route('verilog');
    await p.click('#vlExamples');
    await p.click('.menu-pop .menu-item', '4-bit counter');
    if (await p.modalOpen()) await p.modalButton('Open the example');
    await p.wait("document.getElementById('vlCode').value.includes('counter4')");
    await type(p, document_text());
    await p.reload();
    await p.route('verilog');
    p.assert.match(await p.ev("document.getElementById('vlCode').value"), /kept across a reload/);
  });

  t.test('run prints the console and draws the waves', async (p) => {
    await p.route('verilog');
    await p.ev("Sirkit.VerilogPage.loadExample('half-adder')");
    if (!(await live(p, 'Run'))) { p.assert.ok(await p.ev("document.getElementById('vlRun').disabled"), 'Run waits for the engine'); return; }
    await p.click('#vlRun');
    await p.wait("document.querySelectorAll('#vlConsole .vl-line').length >= 5", 10000);
    const out = await p.texts('#vlConsole .vl-line');
    p.assert.ok(out.some((l) => /1 1 \|\s+1\s+0/.test(l)), 'the last row of the truth table: ' + out.join(' / '));
    await p.wait("!!document.querySelector('#vlWave svg')", 5000);
  });

  t.test('synthesise draws the module', async (p) => {
    await p.route('verilog');
    await p.ev("Sirkit.VerilogPage.loadExample('mux3')");
    if (!(await live(p, 'Synth'))) { p.assert.ok(await p.ev("document.getElementById('vlSynth').disabled")); return; }
    await p.ev("(() => { const s = document.getElementById('vlSynthMod'); s.value = 'mux_gates'; })()");
    await p.click('#vlSynth');
    await p.wait("!!document.querySelector('#vlCirc svg[data-schematic]')", 10000);
    p.assert.ok((await p.count('#vlCirc g[data-part]')) >= 4);
  });

  t.test('export of the editor circuit, share link, save', async (p) => {
    await p.route('verilog');
    const v = await p.ev(`(() => { const N = Sirkit.Netlist; const c = N.fromExpression('demo', "AB' + C", 'and-or'); return Sirkit.VerilogPageAPI.VE.fromCircuit(c); })()`);
    p.assert.match(v, /module demo/);
    p.assert.match(v, /input\b[^;]*\bA\b/);
    p.assert.match(v, /endmodule/);
    const code = await p.ev("Sirkit.Share.pack({ kind: 'verilog', data: { files: [{ name: 'shared.v', text: 'module shared; endmodule\\n' }], top: '' } })");
    await p.route('share=' + code);
    await p.wait("!!document.getElementById('vlCode') && document.getElementById('vlCode').value.includes('module shared')");
    p.assert.match(await p.text('#vlTabs'), /shared\.v/);
  });

  t.test('phone: no sideways page scroll, editor scrolls inside', async (p) => {
    await p.fresh({ width: 390, height: 844, mobile: true, touch: true, hash: 'verilog' });
    await p.wait("!!document.getElementById('vlCode')");
    await p.ev("Sirkit.VerilogPage.loadExample('fsm')");
    await p.sleep(200);
    p.assert.ok(await p.noHScroll(), 'the page does not scroll sideways');
    p.assert.ok(await p.ev("document.getElementById('vlEd').dataset.scrollAffordance === 'sideways'"), 'long lines scroll inside the editor, and say so');
  });
}
function document_text() { return '// kept across a reload\nmodule k (input a, output y);\n  assign y = a;\nendmodule\n'; }
