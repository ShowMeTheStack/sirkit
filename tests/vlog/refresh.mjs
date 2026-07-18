// Regenerate the expected results of the Verilog test corpus with Icarus Verilog (installed locally; used only
// here, never by the app or by tests/vlog.mjs). For every tests/vlog/*.v it compiles and runs the program in a
// scratch folder (holding copies of tests/vlog/data/*, which `include and $readmemh/$readmemb use) and writes
// tests/vlog/<name>.expected.json: { out: [lines printed], vcd: { "tb.q": [[tick, "bits"], ...] } }.
// The VCD values are the last value in each time step, as binary strings, MSB first, times in VCD ticks.
//   node tests/vlog/refresh.mjs            all programs
//   node tests/vlog/refresh.mjs 012 sync   only programs whose name contains one of the words
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const dir = dirname(fileURLToPath(import.meta.url));
const data = join(dir, 'data');
const only = process.argv.slice(2);
const progs = readdirSync(dir).filter((f) => f.endsWith('.v') && (!only.length || only.some((w) => f.includes(w)))).sort();

export function parseVcd(text) {
  const toks = text.split(/\s+/).filter(Boolean);
  const ids = new Map(), scope = [], out = {};
  let i = 0, t = 0;
  for (; i < toks.length; i++) {
    const k = toks[i];
    if (k === '$scope') { scope.push(toks[i + 2]); i += 3; }
    else if (k === '$upscope') { scope.pop(); i += 1; }
    else if (k === '$var') {
      const type = toks[i + 1], w = +toks[i + 2], id = toks[i + 3], name = toks[i + 4];
      let j = i + 5; while (toks[j] !== '$end') j++;
      i = j;
      if (type === 'real' || type === 'event' || type === 'parameter' || type === 'realtime') continue;
      const full = scope.concat(name).join('.');
      if (!ids.has(id)) ids.set(id, { w, names: [] });
      ids.get(id).names.push(full);
      out[full] = [];
    } else if (k === '$enddefinitions') { i += 1; break; }
    else if (k.startsWith('$')) { while (toks[i] !== '$end' && i < toks.length) i++; }
  }
  const set = (id, v) => {
    const s = ids.get(id); if (!s) return;
    if (v.length < s.w) v = (v[0] === '1' ? '0' : v[0]).repeat(s.w - v.length) + v;
    v = v.slice(v.length - s.w);
    for (const n of s.names) {
      const a = out[n];
      if (a.length && a[a.length - 1][0] === t) a.pop();
      if (!a.length || a[a.length - 1][1] !== v) a.push([t, v]);
    }
  };
  for (; i < toks.length; i++) {
    const k = toks[i];
    if (k[0] === '#') t = +k.slice(1);
    else if (k[0] === 'b' || k[0] === 'B') { set(toks[i + 1], k.slice(1).toLowerCase()); i++; }
    else if (k[0] === 'r' || k[0] === 'R') i++;
    else if (/^[01xzXZ]/.test(k)) set(k.slice(1), k[0].toLowerCase());
  }
  return out;
}

let fails = 0;
for (const f of progs) {
  const name = f.slice(0, -2);
  const tmp = mkdtempSync(join(tmpdir(), 'vlog-'));
  try {
    if (existsSync(data)) for (const d of readdirSync(data)) copyFileSync(join(data, d), join(tmp, d));
    execFileSync('iverilog', ['-g2005', '-I', data, '-o', join(tmp, 'a.vvp'), join(dir, f)], { stdio: ['ignore', 'pipe', 'pipe'] });
    const so = execFileSync('vvp', ['-n', 'a.vvp'], { cwd: tmp, stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 }).toString();
    const out = so.split('\n').filter((l) => !/^VCD (info|warning):/.test(l) && !/: \$(finish|stop) called at /.test(l) && !/^\*\* VVP Stop/.test(l) && !/^WARNING: .*\$readmem/.test(l));
    while (out.length && out[out.length - 1] === '') out.pop();
    const vcdFile = readdirSync(tmp).find((x) => x.endsWith('.vcd'));
    const vcd = vcdFile ? parseVcd(readFileSync(join(tmp, vcdFile), 'utf8')) : null;
    writeFileSync(join(dir, name + '.expected.json'), JSON.stringify({ out, vcd }) + '\n');
  } catch (e) {
    fails++;
    console.log('FAILED ' + f + ': ' + ((e.stderr && e.stderr.toString()) || e.message).trim().split('\n').slice(0, 5).join(' | '));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
console.log('refreshed ' + (progs.length - fails) + ' of ' + progs.length + ' programs');
