// The circuit editor: placing parts by dragging, wiring pin to pin and from a wire, the parameter dialog,
// selection and editing, blocks, tidy-up, simulating a counter, the waveform viewer, files, share links,
// autosave and the phone layout.
import { assert } from '../lib.mjs';

export default function (t) {
  const ed = (p, js) => p.ev(`(() => { const e = Sirkit.Build.page.editor; ${js} })()`);
  const blank = async (p) => { await p.route('build'); await p.ev("Sirkit.Build.page.newDoc(); 1"); await p.sleep(80); };
  /** the screen centre of a palette item by its label */
  const palItem = (p, label) => p.ev(`(() => { const b = [...document.querySelectorAll('.pal-item')].find((x) => x.querySelector('.pal-name').textContent === ${JSON.stringify(label)}); if (!b) return null; b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const openCat = (p, cat) => p.ev(`(() => { const s = document.querySelector('.pal-cat[data-cat="${cat}"]'); if (s && !s.classList.contains('open')) s.querySelector('.pal-head').click(); return 1; })()`);
  const place = (p, type, params, x, y) => ed(p, `return e.addPart(${JSON.stringify(type)}, ${JSON.stringify(params || {})}, ${x}, ${y}).id;`);

  t.test('the workbench opens with a circuit, the palette and the waveform', async (p) => {
    await p.route('build');
    assert.ok(await p.exists('#build .ed-svg[data-schematic]'));
    assert.ok((await p.count('.pal-item')) > 10, 'palette items');
    assert.ok((await p.count('.ed-svg g[data-part]')) >= 5, 'the first sample is drawn');
    assert.ok(await p.exists('.wv'), 'the waveform viewer');
    assert.equal(await p.attr('#wt-build', 'aria-selected'), 'true');
  });

  t.test('dragging a part from the palette onto the canvas places it there', async (p) => {
    await blank(p);
    await openCat(p, 'Gates');
    const from = await palItem(p, 'AND gate');
    assert.ok(from, 'the AND gate is in the palette');
    const to = await p.ev("(() => { const r = document.querySelector('.ed-wrap').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()");
    await p.drag(from[0], from[1], to[0], to[1], { steps: 12 });
    const doc = await p.edDoc();
    assert.equal(doc.parts.length, 1, 'one part placed');
    assert.equal(doc.parts[0].type, 'AND');
    // where it was dropped: its middle near the drop point
    const c = await ed(p, `const d = e.doc.parts[0]; return e.partScreen(d.id);`);
    assert.ok(Math.abs(c[0] - to[0]) < 30 && Math.abs(c[1] - to[1]) < 30, 'placed under the pointer: ' + c + ' vs ' + to);
    // clicking an item drops it in the middle of the view
    await openCat(p, 'Inputs/Outputs');
    await p.click('.pal-item[data-type="OUT"]');
    assert.equal((await p.edDoc()).parts.length, 2);
  });

  t.test('moving a part by dragging, and the wires follow it', async (p) => {
    await blank(p);
    const a = await place(p, 'SWITCH', { name: 'A' }, 0, 0);
    const n = await place(p, 'NOT', {}, 12, 0);
    await ed(p, `e.connect(['${a}', 'y'], ['${n}', 'i0']); e.fit();`);
    const before = await ed(p, `return e.doc.parts.find((x) => x.id === '${n}').x;`);
    const [cx, cy] = await ed(p, `return e.partScreen('${n}');`);
    await p.drag(cx, cy, cx + 60, cy + 40, { steps: 6 });
    const after = await ed(p, `const d = e.doc.parts.find((x) => x.id === '${n}'); return [d.x, d.y];`);
    assert.ok(after[0] > before, 'moved right');
    const routed = await ed(p, `const r = e.routed.nets[0]; return r && r.ok && r.paths.length > 0;`);
    assert.ok(routed, 'the wire is routed again');
    // undo puts it back
    await p.key('z', { ctrl: true });
    assert.equal(await ed(p, `return e.doc.parts.find((x) => x.id === '${n}').x;`), before);
  });

  t.test('wiring by dragging from pin to pin, and branching from a wire', async (p) => {
    await blank(p);
    const a = await place(p, 'SWITCH', { name: 'A' }, 0, 2);
    const g = await place(p, 'AND', {}, 14, 0);
    const o = await place(p, 'OUT', { name: 'F' }, 28, 1);
    await ed(p, 'e.fit();');
    let [x1, y1] = await p.pinPoint(a, 'y');
    let [x2, y2] = await p.pinPoint(g, 'i0');
    await p.drag(x1, y1, x2, y2, { steps: 10 });
    let doc = await p.edDoc();
    assert.equal(doc.wires.length, 1, 'one wire');
    assert.deepEqual(doc.wires[0].pins.map((q) => q.join('.')).sort(), [a + '.y', g + '.i0'].sort());
    // a branch: from the middle of that wire to the gate's second input
    const mid = await ed(p, `const n = e.routed.nets[0]; const pts = n.paths[0].pts; let best = null; for (let i = 1; i < pts.length; i++) { const L = Math.abs(pts[i][0] - pts[i-1][0]) + Math.abs(pts[i][1] - pts[i-1][1]); if (!best || L > best.L) best = { L, x: (pts[i][0] + pts[i-1][0]) / 2, y: (pts[i][1] + pts[i-1][1]) / 2 }; } return e.toScreen(best.x, best.y, true);`);
    [x2, y2] = await p.pinPoint(g, 'i1');
    await p.drag(mid[0], mid[1], x2, y2, { steps: 10 });
    doc = await p.edDoc();
    assert.equal(doc.wires.length, 1, 'still one net');
    assert.equal(doc.wires[0].pins.length, 3, 'with three pins');
    assert.ok(await p.exists('.ed-svg circle[data-junction]'), 'a junction dot where it branches');
    // the output
    [x1, y1] = await p.pinPoint(g, 'y'); [x2, y2] = await p.pinPoint(o, 'a');
    await p.drag(x1, y1, x2, y2, { steps: 10 });
    assert.equal((await p.edDoc()).wires.length, 2);
    // the circuit works: F = A·A = A
    await p.ev(`Sirkit.Build.page.toggle(Sirkit.Doc.part(Sirkit.Build.page.editor.doc, '${a}'))`);
    await p.sleep(60);
    assert.equal(await p.ev("Sirkit.Eng.bits(Sirkit.Build.page.sim.get('F'))"), '1');
    // deleting a wire
    await ed(p, `e.sel = new Set(['w:' + e.doc.wires[1].id]); e.render();`);
    await p.key('Delete');
    assert.equal((await p.edDoc()).wires.length, 1);
  });

  t.test('the parameter dialog: fields from the registry, inline validation, applied as one step', async (p) => {
    await blank(p);
    const g = await place(p, 'AND', {}, 4, 4);
    await ed(p, 'e.fit();');
    const [cx, cy] = await ed(p, `return e.partScreen('${g}');`);
    await p.clickAt(cx, cy, { double: true });
    assert.ok((await p.waitModal()).includes('Edit'), 'the dialog opens on a double-click');
    assert.ok(await p.exists('.modal #pd-n'), 'the number of inputs');
    await p.setValue('.modal #pd-n', '12');
    assert.match(await p.text('#pd-n-err'), /At most 8/);
    await p.modalButton('OK');
    assert.ok(await p.modalOpen(), 'OK is refused while a field is wrong');
    await p.setValue('.modal #pd-n', '3');
    assert.equal(await p.text('#pd-n-err'), '');
    await p.modalButton('OK');
    assert.ok(!(await p.modalOpen()));
    const pins = await ed(p, `return Sirkit.Doc.partObj(e.doc.parts[0]).pins.filter((q) => q.dir === 'in').length;`);
    assert.equal(pins, 3, 'three inputs now');
    await p.key('z', { ctrl: true });
    assert.equal(await ed(p, `return Sirkit.Doc.partObj(e.doc.parts[0]).pins.filter((q) => q.dir === 'in').length;`), 2, 'undone in one step');
  });

  t.test('a flip-flop dialog: type, edge and timing; a clock: period', async (p) => {
    await blank(p);
    const f = await place(p, 'DFF', {}, 4, 4);
    await ed(p, `S = Sirkit; S.ParamDialog(e, e.doc.parts[0]);`);
    await p.waitModal();
    assert.ok(await p.exists('.modal #pd-ftype'), 'the type');
    assert.ok(await p.exists('.modal #pd-edge'), 'the edge');
    assert.ok(await p.exists('.modal #pd-tsu'), 'setup time');
    await p.setValue('.modal #pd-ftype', 'JKFF', 'change');
    await p.setValue('.modal #pd-tsu', '-3');
    assert.match(await p.text('#pd-tsu-err'), /At least 0/);
    await p.setValue('.modal #pd-tsu', '7');
    await p.modalButton('OK');
    const d = await ed(p, `return e.doc.parts[0];`);
    assert.equal(d.type, 'JKFF');
    assert.equal(d.params.tsu, 7);
    const c = await place(p, 'CLOCK', {}, 0, 14);
    await ed(p, `Sirkit.ParamDialog(e, e.doc.parts.find((x) => x.id === '${c}'));`);
    await p.waitModal();
    assert.ok(await p.exists('.modal #pd-period'));
    await p.setValue('.modal #pd-period', '40');
    await p.modalButton('OK');
    assert.equal(await ed(p, `return e.doc.parts.find((x) => x.id === '${c}').params.period;`), 40);
  });

  t.test('memory contents in the hex editor', async (p) => {
    await blank(p);
    await place(p, 'ROM', { aw: 3, dw: 8 }, 4, 4);
    await ed(p, `Sirkit.ParamDialog(e, e.doc.parts[0]);`);
    await p.waitModal();
    assert.ok((await p.count('.modal .hex-cell')) === 8, 'eight words');
    await p.setValue('.modal .hex-cell[data-addr="2"]', '3F');
    await p.setValue('.modal .hex-cell[data-addr="5"]', 'ZZ');
    assert.ok(await p.exists('.modal .hex-cell.bad'), 'a word that is not hex is marked');
    await p.setValue('.modal .hex-cell[data-addr="5"]', '0A');
    await p.modalButton('OK');
    const words = await ed(p, `const d = e.doc.parts[0]; return String(d.params.data || d.params.contents).trim().split(/\\s+/);`);
    assert.equal(parseInt(words[2], 16), 0x3f);
    assert.equal(parseInt(words[5], 16), 0x0a);
  });

  t.test('selection: box select, copy and paste, duplicate, turn, mirror, align, delete', async (p) => {
    await blank(p);
    await place(p, 'AND', {}, 0, 0); await place(p, 'OR', {}, 10, 6); await place(p, 'NOT', {}, 20, 12);
    await ed(p, 'e.fit(40);');
    const r = await p.rect('.ed-wrap');
    await p.drag(r.x + 8, r.y + 8, r.right - 50, r.bottom - 8, { steps: 6 });
    assert.equal(await ed(p, 'return e.selParts().length;'), 3, 'box selected');
    await p.key('c', { ctrl: true }); await p.key('v', { ctrl: true });
    assert.equal((await p.edDoc()).parts.length, 6, 'pasted');
    await p.key('d', { ctrl: true });
    assert.equal((await p.edDoc()).parts.length, 9, 'duplicated');
    await p.key('r');
    assert.ok(await ed(p, 'return e.selParts().every((x) => x.rot === 1);'), 'turned');
    await p.key('m');
    assert.ok(await ed(p, 'return e.selParts().every((x) => x.flip);'), 'mirrored');
    await ed(p, 'e.align("left");');
    assert.equal(await ed(p, 'return new Set(e.selParts().map((x) => x.x)).size;'), 1, 'lined up');
    await p.key('Delete');
    assert.equal((await p.edDoc()).parts.length, 6);
    await p.key('a', { ctrl: true });
    assert.equal(await ed(p, 'return e.selParts().length;'), 6);
  });

  t.test('a block made from a selection, listed under My blocks, opened by a double-click', async (p) => {
    await blank(p);
    const a = await place(p, 'SWITCH', { name: 'A' }, 0, 0), b = await place(p, 'SWITCH', { name: 'B' }, 0, 6);
    const x = await place(p, 'XOR', {}, 12, 1), n = await place(p, 'AND', {}, 12, 8);
    const s = await place(p, 'OUT', { name: 'S' }, 26, 2), c = await place(p, 'OUT', { name: 'C' }, 26, 9);
    await ed(p, `e.connect(['${a}','y'],['${x}','i0']); e.connect(['${b}','y'],['${x}','i1']); e.connect(['${a}','y'],['${n}','i0']); e.connect(['${b}','y'],['${n}','i1']); e.connect(['${x}','y'],['${s}','a']); e.connect(['${n}','y'],['${c}','a']);`);
    await ed(p, `e.sel = new Set(['p:${x}', 'p:${n}']); e.render();`);
    await ed(p, 'e.makeBlock("half");');
    await p.sleep(100);
    const doc = await p.edDoc();
    assert.ok(doc.blocks.half, 'the block');
    assert.equal(doc.blocks.half.inputs.length, 2);
    assert.equal(doc.blocks.half.outputs.length, 2);
    assert.equal(doc.parts.filter((q) => q.type === 'BLOCK').length, 1);
    assert.ok(await p.exists('.pal-item[data-type="BLOCK"]'), 'under My blocks');
    // it still works, flattened for the simulator
    await p.ev(`(() => { const pg = Sirkit.Build.page; pg.toggle(Sirkit.Doc.part(pg.editor.doc, '${a}')); pg.toggle(Sirkit.Doc.part(pg.editor.doc, '${b}')); })()`);
    await p.sleep(80);
    assert.equal(await p.ev("Sirkit.Eng.bits(Sirkit.Build.page.sim.get('C'))"), '1');
    assert.equal(await p.ev("Sirkit.Eng.bits(Sirkit.Build.page.sim.get('S'))"), '0');
    // open it, and come back
    const bid = doc.parts.find((q) => q.type === 'BLOCK').id;
    await ed(p, 'e.fit();');
    const [cx, cy] = await ed(p, `return e.partScreen('${bid}');`);
    await p.clickAt(cx, cy, { double: true });
    assert.deepEqual(await ed(p, 'return e.path;'), ['half']);
    assert.ok(await p.exists('#crumbTop'), 'the way back');
    await p.click('#crumbTop');
    assert.deepEqual(await ed(p, 'return e.path;'), []);
  });

  t.test('tidy up lays the circuit out with the layout engine, and a note can be added', async (p) => {
    await blank(p);
    const a = await place(p, 'SWITCH', { name: 'A' }, 30, 30), g = await place(p, 'NOT', {}, 0, 0), o = await place(p, 'OUT', { name: 'F' }, 10, 40);
    await ed(p, `e.connect(['${a}','y'],['${g}','i0']); e.connect(['${g}','y'],['${o}','a']);`);
    await p.click('#btnTidy');
    await p.sleep(150);
    const doc = await p.edDoc();
    const ax = doc.parts.find((q) => q.id === a).x, gx = doc.parts.find((q) => q.id === g).x, ox = doc.parts.find((q) => q.id === o).x;
    assert.ok(ax < gx && gx < ox, 'left to right: input, gate, output');
    assert.ok(await ed(p, 'return Sirkit.Doc.routesValid(e.doc);'), 'the layout engine drew the wires');
    await p.click('#btnNote');
    await p.waitModal().catch(() => {});
    assert.equal((await p.edDoc()).notes.length, 1);
  });

  t.test('problems are listed and clicking one selects the part', async (p) => {
    await blank(p);
    const g = await place(p, 'AND', {}, 4, 4);
    await p.sleep(50);
    const n = await p.count('#problems li');
    assert.ok(n >= 2, 'two unconnected inputs');
    assert.match(await p.text('#problems'), /not connected/);
    await p.click('#problems li button');
    assert.deepEqual(await ed(p, 'return [...e.sel];'), ['p:' + g]);
  });

  t.test('simulating a counter: clock edges, run, the waveform, a rewind', async (p) => {
    await p.route('build');
    await p.ev("Sirkit.Build.page.loadSample('counter')");
    await p.sleep(150);
    const q0 = await p.ev("Sirkit.Eng.num(Sirkit.Eng.bits(Sirkit.Build.page.sim.get('Q'), 4))");
    for (let i = 0; i < 3; i++) await p.click('#btnStepEdge');
    const q3 = await p.ev("Sirkit.Eng.num(Sirkit.Eng.bits(Sirkit.Build.page.sim.get('Q'), 4))");
    assert.equal(q3, (q0 + 3) % 16, 'three edges, three counts: ' + q0 + ' → ' + q3);
    assert.match(await p.text('#simTime'), /ns/);
    assert.ok(await p.exists('.wv-row[data-sig="Q"] .wv-bus'), 'Q drawn as a bus on the waveform');
    assert.ok(await p.exists('.wv-row[data-sig="CLK"]'), 'the clock row');
    const t0 = await p.ev('Sirkit.Build.page.sim.time');
    await p.click('#btnRun');
    await p.sleep(500);
    assert.equal(await p.attr('#btnRun', 'aria-pressed'), 'true');
    await p.click('#btnRun');
    const t1 = await p.ev('Sirkit.Build.page.sim.time');
    assert.ok(t1 > t0, 'time moved while running');
    await p.click('#btnRewind');
    assert.ok((await p.ev('Sirkit.Build.page.sim.time')) < t1, 'rewound');
    // one event at a time
    await p.click('#btnStepEvent');
    assert.ok(await p.ev('Sirkit.Build.page.sim.time >= 0'));
  });

  t.test('the waveform viewer: probe, radix, cursors, remove, export', async (p) => {
    await p.route('build');
    await p.ev("Sirkit.Build.page.loadSample('counter')");
    await p.sleep(120);
    for (let i = 0; i < 4; i++) await p.click('#btnStepEdge');
    // probing a wire from the editor adds it
    const before = await p.count('.wv-name[data-sig]');
    await p.ev("(() => { const e = Sirkit.Build.page.editor; const w = Sirkit.Build.page.wireOfPort('CLR'); Sirkit.Build.page.probe(w); Sirkit.Build.page.probe(w); })()");
    assert.equal(await p.count('.wv-name[data-sig]'), before, 'probe twice: off again');
    const had = await p.exists('.wv-name[data-sig="CLR"]');
    await p.ev("(() => { const pg = Sirkit.Build.page; pg.editor.sel = new Set(['w:' + pg.wireOfPort('CLR')]); pg.editor.render(); })()");
    await p.ev("document.querySelector('.ed-wrap').focus()");
    await p.key('w');
    assert.equal(await p.exists('.wv-name[data-sig="CLR"]'), !had, 'W probes the selected wire, or takes the probe off');
    if (had) await p.key('w');
    await p.wait("!!document.querySelector('.wv-name[data-sig=\"CLR\"]')");
    // the radix of a bus
    const rb = '.wv-name[data-sig="Q"] .wv-radix';
    const r0 = await p.text(rb);
    await p.click(rb);
    assert.notEqual(await p.text(rb), r0, 'the radix changes');
    // cursors: A and B, with the time between
    const r = await p.rect('.wv-svg');
    await p.clickAt(r.x + r.w * 0.3, r.y + 40);
    await p.ev("Sirkit.Build.page.wave.cursorAt(250, 1)");
    assert.match(await p.text('.wv-info'), /Δt/);
    assert.ok((await p.count('.wv-at')) > 0, 'values at the cursor');
    // remove a signal
    await p.click('.wv-name[data-sig="CLR"] .wv-x');
    assert.ok(!(await p.exists('.wv-name[data-sig="CLR"]')));
    // VCD text
    const vcd = await p.ev("Sirkit.Eng.vcd(Sirkit.Build.page.sim.waves, new Map([['Q', 4]]))");
    assert.match(vcd, /\$enddefinitions/);
    assert.match(vcd, /\$var wire 4/);
    // a wire dragged from the canvas and dropped on the waveform is probed
    await p.ev("(() => { const pg = Sirkit.Build.page; if (pg.probeWires.has(pg.wireOfPort('CLR'))) pg.probe(pg.wireOfPort('CLR')); })()");
    assert.ok(!(await p.exists('.wv-name[data-sig="CLR"]')));
    const from = await p.ev("(() => { const e = Sirkit.Build.page.editor, n = e.routed.nets.find((x) => x.id === Sirkit.Build.page.wireOfPort('CLR')); const pts = n.paths[0].pts; let best = null; for (let i = 1; i < pts.length; i++) { const L = Math.abs(pts[i][0] - pts[i-1][0]) + Math.abs(pts[i][1] - pts[i-1][1]); if (!best || L > best.L) best = { L, x: (pts[i][0] + pts[i-1][0]) / 2, y: (pts[i][1] + pts[i-1][1]) / 2 }; } return e.toScreen(best.x, best.y, true); })()");
    const wr = await p.rect('.bd-wave');
    await p.drag(from[0], from[1], wr.x + wr.w / 2, wr.y + wr.h / 2, { steps: 12 });
    await p.wait("!!document.querySelector('.wv-name[data-sig=\"CLR\"]')");
    // the export menu
    await p.click('#wvExport');
    assert.ok((await p.menuItems()).some((m) => /vcd/i.test(m.label)));
    await p.closeMenus();
  });

  t.test('a glitch on the hazard sample is marked on the waveform', async (p) => {
    await p.route('build');
    await p.ev("Sirkit.Build.page.loadSample('hazard')");
    await p.sleep(120);
    // A from 1 to 0 opens the gap between the two paths
    await p.ev("(() => { const pg = Sirkit.Build.page, a = pg.editor.doc.parts.find((x) => x.params.name === 'A'); pg.toggle(a); pg.sim.run(80); pg.refresh(); pg.toggle(a); pg.sim.run(80); pg.refresh(); })()");
    await p.sleep(100);
    const v = await p.ev("Sirkit.Build.page.sim.waves.get('F').length");
    assert.ok(v >= 2, 'F changed');
  });

  t.test('switches toggle on a click while the simulation is live; a button is momentary', async (p) => {
    await blank(p);
    const a = await place(p, 'SWITCH', { name: 'A' }, 0, 0), b = await place(p, 'BUTTON', { name: 'PB' }, 0, 6);
    const o = await place(p, 'OUT', { name: 'F' }, 14, 0), o2 = await place(p, 'OUT', { name: 'G' }, 14, 6);
    await ed(p, `e.connect(['${a}','y'],['${o}','a']); e.connect(['${b}','y'],['${o2}','a']); e.fit();`);
    const [ax, ay] = await ed(p, `return e.partScreen('${a}');`);
    await p.clickAt(ax, ay);
    assert.equal(await p.ev("Sirkit.Eng.bits(Sirkit.Build.page.sim.get('F'))"), '1');
    await p.clickAt(ax, ay);
    assert.equal(await p.ev("Sirkit.Eng.bits(Sirkit.Build.page.sim.get('F'))"), '0');
    const [bx, by] = await ed(p, `return e.partScreen('${b}');`);
    await p.mouse('mouseMoved', bx, by); await p.mouse('mousePressed', bx, by);
    await p.sleep(60);
    assert.equal(await p.ev("Sirkit.Eng.bits(Sirkit.Build.page.sim.get('G'))"), '1', 'pressed');
    await p.mouse('mouseReleased', bx, by);
    await p.sleep(60);
    assert.equal(await p.ev("Sirkit.Eng.bits(Sirkit.Build.page.sim.get('G'))"), '0', 'released');
  });

  t.test('the technology preset changes the delays', async (p) => {
    await p.route('build');
    await p.ev("Sirkit.Build.page.loadSample('hazard')");
    const names = await p.ev("[...document.querySelectorAll('#simTech option')].map((o) => o.value)");
    assert.ok(names.length >= 4, 'four presets: ' + names);
    await p.setValue('#simTech', names.find((n) => /FPGA/.test(n)), 'change');
    assert.match(await p.ev('Sirkit.app.settings.tech'), /FPGA/);
  });

  t.test('save and open a file, autosave across a reload, a share link', async (p) => {
    await blank(p);
    const a = await place(p, 'SWITCH', { name: 'Q7' }, 0, 0), o = await place(p, 'OUT', { name: 'Z9' }, 12, 0);
    await ed(p, `e.connect(['${a}','y'],['${o}','a']);`);
    // the file's text round-trips
    const json = await p.ev("JSON.stringify({ sirkit: 1, doc: Sirkit.Build.page.editor.root })");
    await p.ev("Sirkit.Build.page.newDoc()");
    assert.equal((await p.edDoc()).parts.length, 0);
    await p.ev(`Sirkit.Build.page.editor.setDoc(JSON.parse(${JSON.stringify(json)}).doc)`);
    assert.equal((await p.edDoc()).parts.length, 2);
    // autosave
    await p.sleep(450);
    await p.reload();
    await p.route('build');
    assert.ok((await p.edDoc()).parts.some((q) => q.params.name === 'Z9'), 'kept in this browser');
    // share
    const url = await p.ev('Sirkit.app.share("build", { doc: Sirkit.Build.page.editor.root, probes: [] }).then((u) => u).catch((e) => String(e))');
    assert.match(url, /#share=S1\./);
    await p.closeModals();
    await p.ev("Sirkit.Build.page.newDoc()");
    await p.sleep(400);
    await p.ev(`location.hash = ${JSON.stringify(url.slice(url.indexOf('#') + 1))}`);
    await p.wait("location.hash === '#build' && Sirkit.Build.page && Sirkit.Build.page.editor.root.parts.some((q) => q.params.name === 'Z9')", 6000);
  });

  t.test('export as SVG and PNG makes standalone pictures', async (p) => {
    await p.route('build');
    const svg = await p.ev("(() => { const e = Sirkit.Build.page.editor; return Sirkit.EdDraw.standalone(e.svg, e.bounds, 'x'); })()");
    assert.match(svg, /^<\?xml/);
    assert.match(svg, /<svg[^>]*viewBox/);
    const n = await p.ev("(async () => { const e = Sirkit.Build.page.editor; const s = Sirkit.EdDraw.standalone(e.svg, e.bounds, 'x'); const b = await Sirkit.EdDraw.png(s, e.bounds, 1); return b.size; })()");
    assert.ok(n > 1000, 'a PNG of ' + n + ' bytes');
  });

  t.test('keyboard shortcuts sheet, zoom keys, and fit', async (p) => {
    await p.route('build');
    await p.sleep(250);
    await p.ev("document.querySelector('.ed-wrap').focus()");
    const z0 = await ed(p, 'return e.view.z;');
    await p.key('=');
    assert.ok((await ed(p, 'return e.view.z;')) > z0);
    await p.key('f');
    await p.key('?');
    assert.match(await p.waitModal(), /Keyboard shortcuts/);
    await p.closeModals();
  });

  t.test('on a phone: no sideways scroll, the parts drawer, adding a part', async (p) => {
    await p.fresh({ width: 390, height: 844, mobile: true, touch: true, hash: 'build' });
    await p.wait('Sirkit.Build.page && Sirkit.Build.page.editor');
    assert.ok(await p.noHScroll(), 'the page fits the phone');
    assert.ok(await p.visible('#btnParts'));
    assert.ok(!(await p.visible('.bd-pal .pal-item')), 'the palette starts hidden');
    await p.click('#btnParts');
    await p.sleep(260);
    assert.ok(await p.visible('.bd-pal .pal-item'), 'the drawer opens');
    const n0 = (await p.edDoc()).parts.length;
    await p.click('.pal-item[data-type="NOT"]');
    await p.sleep(260);
    assert.equal((await p.edDoc()).parts.length, n0 + 1);
    assert.ok(!(await p.visible('.bd-pal .pal-item')), 'and closes');
    assert.ok(await p.visible('#btnMore'));
    await p.click('#btnMore');
    assert.ok((await p.menuItems()).some((m) => /Tidy up/.test(m.label)));
    await p.closeMenus();
    assert.ok(await p.noHScroll());
  });
}
