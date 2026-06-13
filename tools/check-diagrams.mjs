// Checks every drawing: node tools/check-diagrams.mjs [--no-build] [--shots DIR] [--all-shots] [--verbose]
//   [--only gallery|app|<group>,...] [--wide-only] [--dark] [--jobs N] [filter...]
// 1. The layout gallery (index.html#demo): each demo circuit at desktop size (1440×900), in the light and the
//    dark theme with distinctive gate symbols, and in the light theme with rectangular ones. On every drawing
//    tools/diagram-audit.js checks the schematic's rules (parts apart, no wire through a part, no two nets along
//    or touching each other, a dot at every T and nowhere else, every net one tree through its pins, every pin
//    connected or left open on purpose, labels clear of everything and inside the drawing) and counts the wire
//    crossings: those over rails apart, the rest within the circuit's own limit.
// 2. The app: every scene the pages register in Sirkit.Checks (the circuit editor's samples at rest and running,
//    the waveform viewer, the function workbench's K-maps and tables, the Verilog page, the state-machine
//    workbench, the lab bench, topics, lessons and courses), each drawn in its page at 1440×900 and at phone
//    size (390×844) in the light theme (and the dark one with --dark), audited as a whole page: its drawings by
//    the same rules, and the HTML around them for cut text and sideways scrolling.
// Exits 1 on any problem. Warnings (WARN lines, hidden by --no-warn) do not fail it: a picture that leaves much
// of the stage empty, and at phone size text under 10px (the stage there pinches and zooms). At desktop size text
// under 11px is a problem, or under 9px for a secondary label marked data-audit="small-ok".
// Topics: node tools/check-diagrams.mjs --topics [--shots DIR] [--all-shots] [--wide-only] [--light-only] [--jobs N]
// [filter...] draws every topic whose id (or family) holds a filter, with its default input and every preset, at
// its first, last and two middle frames, as the whole player page (the stage and the HTML around it), at 1440×900
// and at phone size (390×844), in the light and the dark theme. It uses /dev.html, so nothing is built (and
// helpers working side by side never race over index.html).
// --jobs N (default 4) shares the work among N headless browsers at once; each line is printed as it is found,
// so with more than one job the lines of different pages interleave.
import { launch } from './cdp.mjs';
import { execSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const shotsAt = val('--shots'), only = val('--only');
const jobs = Math.max(1, Math.floor(+(val('--jobs') || 4)) || 1);
const filters = args.filter((a, i) => !a.startsWith('--') && !['--shots', '--only', '--jobs'].includes(args[i - 1]));
const want = (g) => !only || only.split(',').includes(g) || (g !== 'gallery' && only.split(',').includes('app'));
if (!flag('--no-build') && !flag('--topics')) execSync('node build.mjs', { cwd: root, stdio: 'ignore' });
if (shotsAt) mkdirSync(shotsAt, { recursive: true });
const audit = readFileSync(join(root, 'tools/diagram-audit.js'), 'utf8');
const shotName = (s) => s.replace(/[^\w.-]+/g, '_').slice(0, 140);
const t0 = Date.now();
// warnings (a picture that leaves much of the stage empty, small text on a phone) are printed but do not fail the check
let warnings = 0;
const warnLine = (where, p) => { warnings++; if (!flag('--no-warn')) console.log('WARN ' + where + ': ' + p.kind + ': ' + p.msg); };
const warned = () => (warnings ? ', ' + warnings + ' warnings' : '');

/** run async tasks, at most `jobs` at a time; the results in order */
async function pool(tasks) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, tasks.length) }, async () => { while (next < tasks.length) { const i = next++; out[i] = await tasks[i](); } }));
  return out;
}
/** part k of n of a list, in runs that keep items with the same key together (so a page is not reopened) */
function slice(list, k, n, keyOf) {
  const runs = [];
  for (const x of list) { const key = keyOf(x); if (runs.length && runs[runs.length - 1].key === key) runs[runs.length - 1].items.push(x); else runs.push({ key, items: [x] }); }
  const per = list.length / n, out = [];
  let done = 0;
  for (const r of runs) { const part = Math.min(n - 1, Math.floor((done + r.items.length / 2) / per)); if (part === k) out.push(...r.items); done += r.items.length; }
  return out;
}

if (flag('--topics')) await topics();

let problems = 0, checked = 0;

// ---- 1. the layout gallery ----------------------------------------------------------------------------------
const crossings = new Map();
if (want('gallery')) {
  const runs = [{ theme: 'light', style: 'shape' }, { theme: 'dark', style: 'shape' }, { theme: 'light', style: 'rect' }];
  const ids = filters;
  await pool(runs.map((r) => async () => {
    const b = await launch({ width: 1440, height: 900 });
    try {
      await b.goto('index.html');
      await b.waitFor('window.__sirkitReady === true', 30000);
      await b.eval(`Sirkit.app.settings.theme = '${r.theme}'; Sirkit.app.settings.style = '${r.style}'; Sirkit.app.applyTheme(); window.__sirkitReady = false; location.hash = 'demo${ids.length ? '=' + ids.join(',') : ''}'; Sirkit.app.route(); 1`);
      await b.waitFor('window.__sirkitReady === true', 120000);
      const cards = await b.eval(`[...document.querySelectorAll('.card[data-id]')].map((c) => c.dataset.id)`);
      for (const id of cards) {
        const res = JSON.parse(await b.eval(audit + `
          ;(() => { const card = document.querySelector('.card[data-id="${id}"]'), d = Sirkit.Demo.byId('${id}'), xs = [];
            const list = SirkitAudit.run(card, { html: true, page: false, maxCross: d.maxCross, crossings: xs });
            return JSON.stringify({ list, xs, max: d.maxCross }); })()`));
        res.list = res.list.filter((p) => !p.warn || (warnLine(id + ' [' + r.theme + ', ' + r.style + ']', p), false));
        const errs = b.logs.filter((l) => l.type === 'error' || l.type === 'exception');
        b.logs.length = 0;
        checked++;
        const n = res.xs.reduce((s, x) => s + x.n, 0), nr = res.xs.reduce((s, x) => s + (x.rail || 0), 0);
        if (r.theme === 'light' && r.style === 'shape') crossings.set(id, [n, res.max, nr]);
        const bad = res.list.length + errs.length;
        problems += bad;
        const lines = [];
        if (bad || flag('--verbose')) lines.push((bad ? 'FAIL ' : 'ok   ') + id + ' [' + r.theme + ', ' + r.style + ']' + (bad ? ': ' + res.list.length + ' problems' : '') + ' (' + n + ' crossings, at most ' + res.max + ')');
        for (const p of res.list.slice(0, 10)) lines.push('     ' + p.kind.padEnd(19) + p.msg);
        for (const e of errs.slice(0, 3)) lines.push('     console: ' + e.text.slice(0, 300));
        if (lines.length) console.log(lines.join('\n'));
        if (shotsAt && (bad || flag('--all-shots'))) {
          const box = await b.eval(`(() => { const r = document.querySelector('.card[data-id="${id}"]').getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
          await b.screenshot(join(shotsAt, 'gallery-' + id + '-' + r.theme + '-' + r.style + '.png'), box);
        }
      }
      const wide = await b.eval("(() => { const m = document.querySelector('.main'); return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 || (m && m.scrollWidth > m.clientWidth + 1); })()");
      if (wide) { problems++; console.log('FAIL the gallery page scrolls sideways [' + r.theme + ', ' + r.style + ']'); }
    } finally { await b.close(); }
  }));
  // in the gallery's own order
  const order = [...crossings.keys()];
  console.log('gallery crossings (irregular/limit +rail): ' + order.map((id) => { const [n, m, nr] = crossings.get(id); return id + ' ' + n + '/' + m + ' +' + nr; }).join(', '));
}

// ---- 2. the app's scenes ------------------------------------------------------------------------------------
let appScenes = 0;
const sizes = [[1440, 900]].concat(flag('--wide-only') ? [] : [[390, 844]]);
const themes = ['light'].concat(flag('--dark') ? ['dark'] : []);
if ([...new Set(['app', 'build', 'func', 'verilog', 'fsm', 'lab', 'topics', 'learn', 'courses', 'home'])].some(want)) {
  const combos = [];
  for (const [W, H] of sizes) for (const theme of themes) combos.push([W, H, theme]);
  // each size and theme in as many parts as there are jobs to spare
  const parts = Math.max(1, Math.round(jobs / combos.length));
  const tasks = [];
  for (const [W, H, theme] of combos) for (let k = 0; k < parts; k++) tasks.push(() => appPart(W, H, theme, k, parts));
  await pool(tasks);
}
console.log(checked + ' drawings and pages checked (' + crossings.size + ' gallery circuits, ' + appScenes + ' app scenes): ' + (problems ? problems + ' problems' : 'no problems' + (crossings.size ? ', every circuit within its crossing limit' : '')) + warned() + ' in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
process.exit(problems ? 1 : 0);

async function appPart(W, H, theme, part, parts) {
  const phone = W < 600;
  const b = await launch({ width: W, height: H, mobile: phone });
  try {
    await b.goto('index.html');
    await b.waitFor('window.__sirkitReady === true', 30000);
    await b.eval(`Sirkit.app.settings.theme = '${theme}'; Sirkit.app.settings.animate = false; Sirkit.app.settings.style = 'shape'; Sirkit.app.applyTheme(); 1`);
    const all = (await b.eval('JSON.stringify((Sirkit.Checks || []).map((c, i) => ({ i, group: c.group, name: c.name, hash: c.hash })))').then(JSON.parse))
      .concat([{ i: -1, group: 'home', name: 'home page', hash: '' }])
      .filter((s) => want(s.group) && (!filters.length || filters.some((f) => s.name.includes(f))));
    const scenes = slice(all, part, parts, (s) => s.hash);
    let lastHash = null;
    for (const s of scenes) {
      let err = null;
      try {
        await b.eval(`(async () => {
          const c = ${s.i} >= 0 ? Sirkit.Checks[${s.i}] : { hash: '', sel: '#main' };
          const wait = async (expr, what) => { let n = 0; while (!(await (0, eval)(expr))) { if (++n > 400) throw new Error('timed out waiting for ' + what); await new Promise((r) => setTimeout(r, 25)); } };
          if (${JSON.stringify(lastHash)} !== c.hash || c.fresh) { window.__sirkitReady = false; if (location.hash.replace(/^#/, '') === c.hash) Sirkit.app.route(); else location.hash = c.hash; await wait('window.__sirkitReady === true', 'the page'); }
          // ready may name what the page shows before the setup, or what the setup makes: wait a little, set up, then wait for it
          if (c.ready) { let n = 0; while (!(await (0, eval)(c.ready)) && ++n < 60) await new Promise((r) => setTimeout(r, 25)); }
          if (c.setup) await (0, eval)('(async () => { ' + c.setup + ' })()');
          if (c.ready) await wait(c.ready, 'ready');
          if (c.ready2) await wait(c.ready2, 'ready2');
          await new Promise((r) => setTimeout(r, 220));
          if (Sirkit.app.hero) Sirkit.app.hero.stop();
        })().then(() => 1)`);
      } catch (e) { err = e.message; }
      lastHash = s.hash;
      checked++; appScenes++;
      const label = s.group + ' / ' + s.name + ' @' + W + (theme === 'dark' ? ' dark' : '');
      if (err) { problems++; lastHash = null; console.log('FAIL ' + label + ': setup failed: ' + err.slice(0, 240)); continue; }
      const list = JSON.parse(await b.eval(audit + `\n;(() => { const c = ${s.i} >= 0 ? Sirkit.Checks[${s.i}] : { sel: '#main' }; return JSON.stringify(SirkitAudit.run(document.querySelector(c.sel || '#main') || document.body, { html: true, page: true })); })()`)).filter((p) => !p.warn || (warnLine(label, p), false));
      const errs = b.logs.filter((l) => l.type === 'error' || l.type === 'exception');
      b.logs.length = 0;
      const bad = list.length + errs.length;
      problems += bad;
      const lines = [];
      if (bad || flag('--verbose')) lines.push((bad ? 'FAIL ' : 'ok   ') + label + (bad ? ': ' + list.length + ' problems' + (errs.length ? ', ' + errs.length + ' console errors' : '') : ''));
      for (const p of list.slice(0, flag('--all') ? 1e9 : 10)) lines.push('     ' + p.kind.padEnd(19) + p.msg + (p.a ? '  [' + p.a + (p.b ? ' | ' + p.b : '') + ']' : ''));
      if (list.length > 10 && !flag('--all')) lines.push('     … and ' + (list.length - 10) + ' more (--all)');
      for (const e of errs.slice(0, 3)) lines.push('     console: ' + e.text.slice(0, 300));
      if (lines.length) console.log(lines.join('\n'));
      if (shotsAt && (bad || flag('--all-shots'))) await b.screenshot(join(shotsAt, shotName(label) + '.png'));
    }
  } finally { await b.close(); }
}

async function topics() {
  const sizes = [[1440, 900]].concat(flag('--wide-only') ? [] : [[390, 844]]);
  const themes = flag('--light-only') ? ['light'] : ['light', 'dark'];
  const waitPlayer = (id) => `await new Promise((r, j) => { let n = 0; const w = () => (Sirkit.app.page && Sirkit.app.page.player && Sirkit.app.page.player.t.id === ${JSON.stringify(id)}) ? r() : ++n > 400 ? j(new Error('no player')) : setTimeout(w, 30); w(); });`;
  let bad = 0, n = 0;
  const tasks = [];
  for (const [W, H] of sizes) for (let k = 0; k < jobs; k++) tasks.push(() => part(W, H, k));
  await pool(tasks);
  console.log(n + ' topic pictures checked (' + sizes.map((s) => s.join('×')).join(' and ') + ', ' + themes.join(' and ') + '): ' + (bad ? bad + ' problems' : 'no problems') + warned() + ' in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  process.exit(bad ? 1 : 0);

  // one browser: part k of the pictures at one size, every theme
  async function part(W, H, k) {
    const phone = W < 600;
    const b = await launch({ width: W, height: H, mobile: phone });
    try {
      await b.send('Page.navigate', { url: b.url + 'dev.html#topics' });
      await b.waitFor('window.__sirkitReady === true', 30000);
      const all = JSON.parse(await b.eval(`(() => {
        const T = Sirkit, out = [], f = ${JSON.stringify(filters)};
        for (const t of T.topics) {
          if (f.length && !f.some((x) => t.id.includes(x) || t.family.includes(x))) continue;
          [{ label: 'default', values: {} }].concat(t.presets || []).forEach((p, k) => {
            const r = T.run(t, T.inputOf(t, Object.assign(T.inputOf(t), p.values)));
            const m = r.frames.length;
            for (const i of [...new Set([0, Math.floor(m / 3), Math.floor(2 * m / 3), m - 1])]) out.push({ id: t.id, preset: k, frame: i, name: t.id + ' / ' + p.label + ' / frame ' + i });
          });
        }
        return JSON.stringify(out);
      })()`));
      const plan = slice(all, k, jobs, (s) => s.id);
      if (!plan.length) return;
      for (const theme of themes) {
        await b.eval(`Sirkit.Learner.settings.predict = false; Sirkit.app.settings.theme = '${theme}'; Sirkit.app.applyTheme(); 1`);
        let last = null;
        for (const s of plan) {
          const setup = (last === s.id ? '' : `location.hash = 'topic=${s.id}'; ${waitPlayer(s.id)}`) + `
            const T = Sirkit, t = T.byId('${s.id}'), p = T.app.page.player, pr = [{ values: {} }].concat(t.presets || [])[${s.preset}];
            p.input = T.inputOf(t, Object.assign(T.inputOf(t), pr.values)); p.buildInputs(); p.run(); p.go(${s.frame}, true);`;
          last = s.id;
          let err = null;
          try { await b.eval('(async () => { ' + setup + ' })().then(() => 1)'); } catch (e) { err = e.message; }
          await b.sleep(120);
          n++;
          if (err) { bad++; last = null; console.log('FAIL ' + s.name + ' @' + W + ' ' + theme + ': setup failed: ' + err.slice(0, 200)); continue; }
          const list = JSON.parse(await b.eval(audit + '\n;JSON.stringify(SirkitAudit.run(document.querySelector(".topic") || document.body, { html: true, page: true }))')).filter((p) => !p.warn || (warnLine(s.name + ' @' + W + ' ' + theme, p), false));
          const wide = await b.eval('document.documentElement.scrollWidth > document.documentElement.clientWidth + 1');
          if (wide) list.push({ kind: 'page-wide', msg: 'the page scrolls sideways' });
          const errs = b.logs.filter((l) => l.type === 'error' || l.type === 'exception');
          b.logs.length = 0;
          const q = list.length + errs.length;
          bad += q;
          const file = s.name.replace(/[^\w.-]+/g, '_') + '-' + W + '-' + theme + '.png';
          if (shotsAt && (q || flag('--all-shots'))) await b.screenshot(join(shotsAt, file));
          const lines = [];
          if (q || flag('--verbose')) lines.push((q ? 'FAIL ' : 'ok   ') + s.name + ' @' + W + ' ' + theme + (q ? ': ' + list.length + ' problems' + (errs.length ? ', ' + errs.length + ' console errors' : '') : ''));
          for (const x of list.slice(0, flag('--all') ? 1e9 : 10)) lines.push('     ' + x.kind.padEnd(19) + x.msg + (x.a ? '  [' + x.a + (x.b ? ' | ' + x.b : '') + ']' : ''));
          for (const e of errs.slice(0, 3)) lines.push('     console: ' + e.text.slice(0, 300));
          if (lines.length) console.log(lines.join('\n'));
        }
      }
    } finally { await b.close(); }
  }
}
