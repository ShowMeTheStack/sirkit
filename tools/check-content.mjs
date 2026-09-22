// Check the content: node tools/check-content.mjs [id or chapter prefix] [--verbose]
// Every exercise: its kind exists, its solution passes its own checker, every one of its wrong answers fails (with
// the message shown under --verbose; a table with none listed gets its solution with one cell changed), and it has three hints (the last a worked answer). Every lesson block names
// things that exist (topics, exercises, lessons, labs), its circuits and expressions read, its predictions have an
// answer among their options. Every lab's checks pass on its reference wiring, and its observation table can be
// built. Every course step and tour step is complete. Nothing is marked sample: true (placeholder content).
import { files } from '../tests/load.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ console, performance, setTimeout, clearTimeout, TextEncoder, TextDecoder });
// every file on its own, so a topic being written elsewhere that does not load yet only costs its topics
for (const f of files(['core', 'schematic', 'stage', 'demo', 'topics', 'app', 'content'])) {
  try { vm.runInContext(readFileSync(join(root, 'src', f), 'utf8'), ctx, { filename: f }); }
  catch (e) { if (/^(topics|demo)\//.test(f)) console.log('WARN ' + f + ' does not load: ' + e.message); else throw e; }
}
const S = vm.runInContext('globalThis.Sirkit', ctx);
const C = S.Content, K = S.Check;
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0];
const verbose = process.argv.includes('--verbose');
const want = (x) => !only || x.id.startsWith(only) || String(x.chapter || '').startsWith(only);
let ok = 0, bad = 0, warn = 0, answers = 0, nx = 0, nl = 0, nlab = 0;
const report = (what, id, why, isWarn) => {
  if (!why.length) { ok++; if (verbose) console.log('ok   ' + what + ' ' + id); return; }
  if (isWarn) { warn++; console.log('WARN ' + what + ' ' + id + '\n    ' + why.join('\n    ')); return; }
  bad++; console.log('FAIL ' + what + ' ' + id + '\n    ' + why.join('\n    '));
};
for (const e of C.errors) { if (only && !e.includes(only)) continue; bad++; console.log('FAIL registry: ' + e); }
for (const x of [...C.chapters, ...C.lessons.values(), ...C.exercises.values(), ...C.courses.values(), ...(C.labs || new Map()).values(), ...(S.topics || []), ...(S.families || [])]) {
  if (x.sample && want(x)) { bad++; console.log('FAIL ' + x.id + ' is marked sample: true; placeholder content does not ship'); }
}
const short = (v) => (typeof v === 'string' ? v : JSON.stringify(v)).replace(/\s+/g, ' ').slice(0, 100);

// ---- exercises ----------------------------------------------------------------------------------------------
const t0 = Date.now();
for (const x of C.exercises.values()) {
  if (!want(x)) continue;
  nx++;
  const why = [];
  if (!K.kinds[x.kind]) why.push('unknown kind ' + x.kind + ' (the kinds: ' + (K.kindNames || Object.keys(K.kinds)).join(', ') + ')');
  else {
    if (x.solution === undefined) why.push('no solution');
    else {
      answers++;
      const r = K.answer(x, x.solution);
      if (!r.ok) why.push('the solution fails: ' + r.message);
      else if (verbose) console.log('     ' + x.id + ' solution: ' + r.message);
    }
    // a table needs no listed wrong answer: its solution with one cell changed must fail
    let wrongs = x.wrong || [];
    if (!wrongs.length && (x.kind === 'table' || x.kind === 'truthtable') && x.solution && typeof x.solution === 'object') {
      const k = Object.keys(x.solution)[0], v = String(x.solution[k]);
      wrongs = [Object.assign({}, x.solution, { [k]: v === '0' ? '1' : v === '1' ? '0' : v + 'x' })];
    }
    if (!wrongs.length) why.push('no wrong answers to try');
    for (const w of wrongs) {
      answers++;
      const r = K.answer(x, w);
      if (r.ok) why.push('a wrong answer passes: ' + short(w));
      else if (!r.message || /could not be checked|cannot be checked/.test(r.message)) why.push('a wrong answer breaks the checker: ' + short(w) + ': ' + r.message);
      else if (verbose) console.log('     ' + x.id + ' wrong ' + short(w) + '\n       → ' + r.message);
    }
    if (x.kind === 'table' || x.kind === 'truthtable' || (x.kind === 'qm' && x.ask === 'chart')) { try { K.tableSpec(Object.assign({}, x, { table: x.kind === 'qm' ? 'qmchart' : x.table || (x.kind === 'truthtable' ? 'truth' : undefined) })); } catch (e) { why.push('the table cannot be built: ' + e.message); } }
    if (x.kind === 'choice' && [].concat(x.answer).some((i) => !(i >= 0 && i < (x.options || []).length))) why.push('the answer is not one of the options');
    if (x.kind === 'circuit' && x.start) { try { K.circuitOf(x.start, { outputs: x.outputs }); } catch (e) { why.push('the starting circuit cannot be read: ' + e.message); } }
    if (x.kind === 'lab' && !(C.labs && C.labs.has(x.lab))) why.push('no lab ' + x.lab);
  }
  if (!x.text || (Array.isArray(x.text) && !x.text.length)) why.push('no text');
  if (!x.hints || x.hints.length !== 3) why.push('three hints are needed, the last a worked answer (it has ' + ((x.hints || []).length) + ')');
  report('exercise', x.id, why);
}

// ---- lessons -------------------------------------------------------------------------------------------------
const B = S.Bool;
for (const l of C.lessons.values()) {
  if (!want(l)) continue;
  nl++;
  const why = [];
  if (!l.blocks || !l.blocks.length) why.push('no blocks');
  (l.blocks || []).forEach((b, i) => {
    const at = 'block ' + (i + 1) + ': ';
    if (typeof b === 'string') return;
    if (b.topic && !S.byId(b.topic)) why.push(at + 'no topic ' + b.topic);
    if (b.topic && S.byId(b.topic) && b.input) { const t = S.byId(b.topic); const e = S.checkInput(t, S.inputOf(t, Object.assign(S.inputOf(t), b.input))); if (e) why.push(at + 'the input is refused: ' + e); }
    if (b.topic && S.byId(b.topic) && b.frame) { try { const t = S.byId(b.topic); const r = t.run(S.inputOf(t, Object.assign(S.inputOf(t), b.input || {}))); if (b.frame >= r.frames.length) why.push(at + 'frame ' + b.frame + ' is past the last frame (' + (r.frames.length - 1) + ')'); } catch (e) { why.push(at + 'the topic does not run: ' + e.message); } }
    if (b.exercise && !C.exercises.has(b.exercise)) why.push(at + 'no exercise ' + b.exercise);
    if (b.lesson && !C.lessons.has(b.lesson)) why.push(at + 'no lesson ' + b.lesson);
    if (b.lab && !(C.labs && C.labs.has(b.lab))) why.push(at + 'no lab ' + b.lab);
    if (b.predict && !(b.predict.answer >= 0 && b.predict.answer < (b.predict.options || []).length)) why.push(at + 'the prediction\'s answer is not an option');
    if (b.circuit) { try { const c = K.circuitOf(b.circuit, { outputs: b.outputs }); for (const k of Object.keys(b.inputs || {})) if (!K.portsOf(c).inputs.includes(k)) why.push(at + 'the circuit has no input ' + k); } catch (e) { why.push(at + 'the circuit cannot be read: ' + e.message); } }
    if (b.schematic && b.schematic.expr) { try { B.parse(String(b.schematic.expr).replace(/^\s*\w+\s*=/, '')); } catch (e) { why.push(at + 'the expression cannot be read: ' + e.message); } }
    for (const k of ['func', 'kmap']) if (b[k]) { try { K.fnOf(b[k]); } catch (e) { why.push(at + 'the function cannot be read: ' + e.message); } }
    if (b.waveform) { try { K.waveExpected(b.waveform); } catch (e) { why.push(at + 'the waveform cannot be simulated: ' + e.message); } }
    if (b.verilog) { const c = S.Verilog.compile(String(b.verilog.src || b.verilog), {}); if (c.errors.length) why.push(at + 'the Verilog does not compile: line ' + c.errors[0].line + ': ' + c.errors[0].msg); }
    if (b.fsm) { try { K.machineOf(b.fsm.machine || b.fsm); } catch (e) { why.push(at + 'the state machine cannot be read: ' + e.message); } }
  });
  report('lesson', l.id, why);
}

// ---- labs ----------------------------------------------------------------------------------------------------------
for (const lab of (C.labs || new Map()).values()) {
  if (!want(lab)) continue;
  nlab++;
  const why = [];
  for (const n of lab.parts || []) if (!S.LabChips.get(n)) why.push('there is no chip ' + n + ' on the bench');
  if (!lab.reference) why.push('no reference wiring');
  else {
    const st = S.Labs.state(lab.reference);
    for (const ch of st.chips) if (!S.LabChips.get(ch.num)) why.push('the reference uses an unknown chip ' + ch.num);
    if (!why.length) {
      const r = S.Labs.check(lab, st);
      r.results.forEach((res, i) => { if (!res.ok) why.push('check ' + (i + 1) + ' (' + lab.checks[i].kind + ') fails on the reference wiring: ' + res.say); else if (verbose) console.log('     ' + lab.id + ' check ' + (i + 1) + ': ' + res.say); });
      if (lab.observe) { try { const sp = K.tableSpec({ table: 'labobs', lab }); const blank = Object.entries(sp.expected).filter(([, v]) => !/^[01]$/.test(v)); if (blank.length) why.push('the reference board gives ' + blank[0][1] + ' in the observation table at ' + blank[0][0]); } catch (e) { why.push('the observation table cannot be built: ' + e.message); } }
    }
  }
  if (!lab.checks || !lab.checks.length) why.push('no checks');
  if (!lab.steps || !lab.steps.length) why.push('no steps');
  report('lab', lab.id, why);
}

// ---- courses and tours ------------------------------------------------------------------------------------------
let ncourse = 0, ntour = 0;
for (const c of C.courses.values()) {
  if (!want(c)) continue;
  ncourse++;
  const why = [];
  for (const s of c.steps) { const st = C.stepOf(s); if (!C.stepExists(st)) why.push('no ' + st.type + ' ' + st.id); }
  report('course', c.id, why);
}
for (const t of C.tours.values()) {
  if (!want(t)) continue;
  ntour++;
  const why = [];
  t.steps.forEach((s, i) => { if (!s.text) why.push('step ' + (i + 1) + ' has no text'); });
  if (t.steps[0] && t.steps[0].route === undefined) why.push('the first step needs a route, so the tour starts in the right place');
  report('tour', t.id, why);
}
console.log(ok + ' ok, ' + bad + ' with problems, ' + warn + ' warnings (' + nx + ' exercises, ' + answers + ' answers checked in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's; ' + nl + ' lessons, ' + nlab + ' labs, ' + ncourse + ' courses, ' + ntour + ' tours)');
if (bad) process.exitCode = 1;
