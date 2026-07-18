// Verilog tests, in node: node tests/vlog.mjs [filter words...] [-v]
// 1. The corpus tests/vlog/*.v runs on Sirkit.Verilog and must print exactly what Icarus Verilog printed and give
//    the same VCD values (the expected files come from tests/vlog/refresh.mjs; iverilog is not needed here).
// 2. Error and lint messages: line, column and wording for common mistakes.
// 3. Synthesis: each tests/vlog/synth/*.v module (and some inline ones) is synthesised to a netlist, which is
//    simulated (with Sirkit.Sim when present, else a netlist evaluator here) against the behavioural simulation
//    over random stimulus; the netlist is also turned back into structural Verilog, which must agree too.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, harness, rng } from './load.mjs';

const S = load(['core']);
const V = S.Verilog;
const t = harness('vlog');
const dir = join(dirname(fileURLToPath(import.meta.url)), 'vlog');
const args = process.argv.slice(2);
const verbose = args.includes('-v');
const words = args.filter((a) => a !== '-v');
const want = (name) => !words.length || words.some((w) => name.includes(w));

const files = {};
if (existsSync(join(dir, 'data'))) for (const f of readdirSync(join(dir, 'data'))) files[f] = readFileSync(join(dir, 'data', f), 'utf8');

// ---- 1. the corpus ------------------------------------------------------------------------------------------------
let corpus = 0, corpusOk = 0;
const slow = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.v')).sort()) {
  const name = f.slice(0, -2);
  if (!want(name) || words.includes('synth') || words.includes('errors')) continue;
  const expFile = join(dir, name + '.expected.json');
  if (!existsSync(expFile)) { t.ok(false, name + ': no expected file (run node tests/vlog/refresh.mjs)'); continue; }
  const exp = JSON.parse(readFileSync(expFile, 'utf8'));
  corpus++;
  const t0 = performance.now();
  let r;
  try { r = V.run(readFileSync(join(dir, f), 'utf8'), { files, until: Infinity }); } catch (e) { t.ok(false, name + ': crashed: ' + (e.stack || e).toString().split('\n').slice(0, 4).join(' | ')); continue; }
  const ms = performance.now() - t0;
  if (ms > 2000) slow.push(name + ' ' + Math.round(ms) + 'ms');
  if (r.errors.length) { t.ok(false, name + ': errors: ' + r.errors.slice(0, 3).map((e) => e.line + ':' + e.col + ' ' + e.msg).join(' | ')); continue; }
  let ok = true;
  const out = r.output.slice();
  while (out.length && out[out.length - 1] === '') out.pop();
  for (let i = 0; i < Math.max(out.length, exp.out.length); i++) {
    if (out[i] !== exp.out[i]) {
      ok = false;
      t.ok(false, name + ': output line ' + (i + 1) + ': got ' + JSON.stringify(out[i]) + ', want ' + JSON.stringify(exp.out[i]));
      if (verbose) { console.log('  got:  ' + out.slice(Math.max(0, i - 2), i + 3).join('\n        ')); console.log('  want: ' + exp.out.slice(Math.max(0, i - 2), i + 3).join('\n        ')); }
      break;
    }
  }
  if (exp.vcd) {
    const mine = r.dumped() || {};
    let bad = 0;
    for (const [sig, list] of Object.entries(exp.vcd)) {
      const m = mine[sig];
      if (!m) { if (bad++ < 2) t.ok(false, name + ': VCD signal ' + sig + ' is missing'); ok = false; continue; }
      const a = JSON.stringify(m), b = JSON.stringify(list);
      if (a !== b) {
        ok = false;
        if (bad++ < 2) {
          let k = 0; while (k < m.length && k < list.length && m[k][0] === list[k][0] && m[k][1] === list[k][1]) k++;
          t.ok(false, name + ': VCD ' + sig + ' differs at entry ' + k + ': got ' + JSON.stringify(m.slice(k, k + 3)) + ', want ' + JSON.stringify(list.slice(k, k + 3)));
        }
      }
    }
  }
  if (ok) { corpusOk++; t.ok(true); }
}
if (corpus) console.log('corpus     ' + corpusOk + ' of ' + corpus + ' programs match' + (slow.length ? ' (slow: ' + slow.join(', ') + ')' : ''));

const extra = join(dir, 'extra.mjs');
if (existsSync(extra)) (await import('./vlog/extra.mjs')).run({ V, t, files, dir, want, rng, S });
t.done();
