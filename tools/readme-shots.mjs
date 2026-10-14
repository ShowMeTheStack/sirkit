// The screenshots in the README: node tools/readme-shots.mjs [name ...] [--no-build] [--base=url]
// Builds first, then drives the built page in headless Chrome and writes docs/images/*.png
// (1600×950 in the light theme, one dark, one phone at 390×844). Prints any console errors per shot.
// With names, only those shots are taken again. By default it uses the driver's own server; --base= points it
// at a page served elsewhere.
import { launch } from './cdp.mjs';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv.includes('--no-build')) execSync('node build.mjs', { cwd: root, stdio: 'ignore' });
mkdirSync(join(root, 'docs/images'), { recursive: true });
const out = (n) => join(root, 'docs/images', n + '.png');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const base = (process.argv.find((a) => a.startsWith('--base=')) || '').slice(7);
const W = [1600, 950], PHONE = [390, 844];

const wait = (ms) => `await new Promise((r) => setTimeout(r, ${ms}));`;
// wait for an expression to come true inside the page
const until = (expr, ms = 15000) => `await new Promise((r, j) => { const t0 = Date.now(); const w = () => { let ok = false; try { ok = (${expr}); } catch (e) { /* not yet */ } if (ok) r(); else if (Date.now() - t0 > ${ms}) j(new Error('timed out: ' + ${JSON.stringify(expr)})); else setTimeout(w, 40); }; w(); });`;
// scroll the page so an element sits just under the top bar, whichever box does the scrolling
const scrollTo = (sel, pad = 12) => `{ const e = document.querySelector(${JSON.stringify(sel)}); if (e) { const bar = document.querySelector('header, #top, .top'); const off = (bar ? bar.getBoundingClientRect().bottom : 56) + ${pad}; const sc = [document.getElementById('main'), document.scrollingElement].find((x) => x && x.scrollHeight > x.clientHeight + 2); if (sc) sc.scrollTop += e.getBoundingClientRect().top - off; } }`;
const P = 'Sirkit.app.page';
// open a topic (with an optional input) and stop on a frame part of the way through
const topic = (id, frac, query, extra) => ({
  hash: 'topic=' + id + (query ? '?' + Object.entries(query).map(([k, v]) => k + '=' + encodeURIComponent(JSON.stringify(v))).join('&') : ''),
  js: until(`${P} && ${P}.player && ${P}.player.frames.length > 1`) + ` const p = ${P}.player; p.pause(); p.go(Math.round(${frac} * (p.frames.length - 1)), true); ${wait(200)} ${scrollTo('#inputs')} ${extra || ''}`,
});
// scroll the page so an element's bottom sits just above the bottom of the screen
const bottomAt = (sel, pad = 16) => `{ const e = document.querySelector(${JSON.stringify(sel)}); const sc = [document.getElementById('main'), document.scrollingElement].find((x) => x && x.scrollHeight > x.clientHeight + 2); if (e && sc) sc.scrollTop += e.getBoundingClientRect().bottom - (innerHeight - ${pad}); }`;
const top0 = `{ const m = document.getElementById('main'); if (m) m.scrollTop = 0; document.scrollingElement.scrollTop = 0; }`;

// name: { hash, pre (before the route), js (after), size, wait ms, theme }
const SHOTS = {
  home: { hash: '', js: wait(1600), wait: 600 },

  // a synchronous counter clocking, its waveform filling in under the canvas
  editor: {
    hash: 'build',
    js: until('Sirkit.Build.page && Sirkit.Build.page.editor') + `const b = Sirkit.Build.page; b.loadSample('sync4'); ${wait(300)} b.editor.sel.clear(); b.editor.fit(); for (let i = 0; i < 11; i++) { b.stepEdge(); ${wait(40)} } b.pause(); b.editor.render(); if (b.wave.fit) b.wave.fit();`,
    wait: 1200,
  },

  // three groups that cover the function, one more than it needs: the checker says so and dashes a smaller cover
  kmap: {
    hash: 'func',
    js: until('Sirkit.Func.page && document.querySelector("#fnView")') + `Sirkit.Func.set({ tab: 'kmap', vars: ['A', 'B', 'C', 'D'], ones: [0, 2, 5, 7, 8, 10, 13], dc: [6, 15], groups: [[0, 2, 8, 10], [5, 13], [6, 7]] }); ${wait(200)} document.getElementById('fnCheck').click();`,
    wait: 900,
  },

  proof: {
    hash: 'func',
    js: until('Sirkit.Func.page && document.querySelector("#fnView")') + `Sirkit.Func.set({ tab: 'proof', vars: ['A', 'B'], ones: [1, 2, 3], dc: [] }); ${wait(200)}
      const p = Sirkit.Func.page; p.newProof("(A' + B')' + A'B + AB'", 'A + B'); for (let i = 0; i < 2; i++) { p.hint(); if (p.st.proof.hint) p.move(p.st.proof.hint.law); } p.hint(); ${wait(100)} ${scrollTo('.pf-goal', 150)}`,
    wait: 900,
  },

  qm: topic('qm-tabulation', 0.55),
  lookahead: topic('carry-lookahead', 0.5),
  masterslave: topic('master-slave', 0.6),

  // the state-machine workbench at its last stage: the circuit of the 1001 detector, checked against its table
  fsm: {
    hash: 'fsm',
    js: until('Sirkit.FsmPage && Sirkit.FsmPage.page') + `Sirkit.FsmPage.loadSample('det1001'); const p = Sirkit.FsmPage.page; p.go(5); ${wait(300)} ${scrollTo('#fsmStage', 8)}`,
    wait: 900,
  },

  // the machine itself, drawn, and run on a sequence: the arrow just taken lit, the trace beside it
  fsmrun: {
    hash: 'fsm',
    js: until('Sirkit.FsmPage && Sirkit.FsmPage.page') + `Sirkit.FsmPage.loadSample('det1001'); ${wait(200)}
      document.getElementById('fsmSeq').value = '0110010011'; document.getElementById('fsmRunBtn').click(); ${wait(100)} for (let i = 0; i < 6; i++) { const n = document.getElementById('fsmRunNext'); if (n) n.click(); ${wait(30)} }`,
    wait: 900,
  },

  asm: topic('asm-multiplier', 0.55, null, scrollTo('#stageWrap', 4)),

  // a counter and its testbench run: the $display console and the waveform
  verilog: {
    hash: 'verilog',
    js: until(`Sirkit.VerilogPage && document.querySelector('#vlCode')`) + `await Sirkit.VerilogPage.loadExample('counter'); await Sirkit.VerilogPage.run(); ${wait(300)}`,
    wait: 1200,
  },

  // a multiplexer written three ways, the first synthesised and drawn at gate level
  synth: {
    hash: 'verilog',
    js: until(`Sirkit.VerilogPage && document.querySelector('#vlCode')`) + `await Sirkit.VerilogPage.loadExample('mux3'); await Sirkit.VerilogPage.synth(); ${wait(200)} Sirkit.VerilogPage.setLevel('gates'); ${wait(300)}`,
    wait: 1200,
  },

  nba: topic('vl-nba', 0.6, null, scrollTo('#stageWrap', 4)),

  lab: {
    hash: 'lab',
    js: until('Sirkit.Lab.page') + `Sirkit.Lab.page.loadSample('counter'); Sirkit.Lab.page.toggle(0); Sirkit.UI.closeAllModals(); ${wait(3000)} Sirkit.Lab.page.updateAnalyser(true); ${wait(200)} ${scrollTo('#labBoard', 8)}`,
    wait: 900,
  },

  cmos: topic('cmos-gates', 0.55),
  cpu: topic('cpu-fetch', 0.45),

  lesson: {
    hash: 'lesson=min-primes',
    js: wait(800) + `for (const p of (${P} && ${P}.players) || []) { p.pause(); p.go(Math.round(0.6 * (p.frames.length - 1)), true); } ${wait(200)} ${top0}`,
    wait: 1200,
  },

  exercise: {
    hash: 'exercise=comb-ex-exactly-two',
    // the answer a student might give: the majority function, which is also 1 when all three fire
    pre: `const x = Sirkit.Content.exercises.get('comb-ex-exactly-two'); const s = Sirkit.UI.storage; const p = s.get('learn', {}); p.drafts = p.drafts || {}; p.drafts[x.id] = Sirkit.ExWidgets.docOf(x.wrong[0], { outputs: x.outputs }); s.set('learn', p);`,
    js: wait(600) + `document.getElementById('btnCheck').click(); ${wait(300)} const s = document.getElementById('exShowRun'); if (s) s.click(); ${wait(300)} ${bottomAt('#exResult')}`,
    wait: 900,
  },

  dark: Object.assign(topic('sync-counter', 0.55), { theme: 'dark' }),
  // on a phone the stage comes first, the narration and controls under it
  phone: Object.assign(topic('kmap-primes', 0.5, null, scrollTo('#stageWrap', 4)), { size: PHONE }),
};

for (const [name, s] of Object.entries(SHOTS)) {
  if (only.length && !only.includes(name)) continue;
  const size = s.size || W;
  const b = await launch({ width: size[0], height: size[1], mobile: size[0] < 600 });
  try {
    await b.send('Page.navigate', { url: (base || b.url) + '#' });
    await b.waitFor('window.__sirkitReady === true', 30000);
    await b.eval(`if (Sirkit.Learner) Sirkit.Learner.settings.predict = false; Sirkit.app.settings.projector = false; Sirkit.app.setTheme(${JSON.stringify(s.theme || 'light')}); ${s.pre || ''} 1`);
    await b.eval(`location.hash = ${JSON.stringify(s.hash)}; 1`);
    await b.sleep(400);
    await b.waitFor('window.__sirkitReady === true', 30000);
    if (s.js) await b.eval('(async () => { ' + s.js + ' })().then(() => 1)');
    await b.sleep(s.wait || 900);
    await b.eval(`for (const t of document.querySelectorAll('.toast')) t.remove(); 1`);
    await b.screenshot(out(name));
    const errs = b.logs.filter((l) => l.type === 'error' || l.type === 'exception');
    console.log(name + (errs.length ? '  (' + errs.length + ' console errors: ' + errs.map((e) => e.text.slice(0, 160)).join(' | ') + ')' : ''));
  } catch (e) {
    console.log(name + '  FAILED: ' + e.message);
  } finally { await b.close(); }
}
