// The finished parts' topics (4, 6, 8 to 13), run with every preset and a spread of other inputs: every value a
// frame's narration quotes must be what the engine (and the drawing) has at that frame, and what an independent
// working-out gives. The generic checks here look at the wording (a/an, doubled words, stray spaces, a gap where
// a word is missing) and at the drawing (a waveform panel that empties out); tests/claims/<part>.mjs hold the
// per-family claim checks. Prints "topics-claims N passed, M failed".
// Usage: node tests/topics-claims.mjs [topic id or family prefix ...]
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load, harness, rng } from './load.mjs';

const S = load(['core', 'schematic', 'stage', 'topics']);
const t = harness('topics-claims');
if (S.Kit && S.Kit.timing) S.Kit.timing.strict = true;
const only = process.argv.slice(2);
const PARTS = /^p(4|6|8|9|10|11|12|13)-/;

// each claims module: { family: RegExp, extra: {topicId: [values]}, random: {topicId: (rnd) => values},
//   check(ctx) } where ctx = { S, tp, values, input, r (S.run's result), fail(msg) }
const dir = join(dirname(fileURLToPath(import.meta.url)), 'claims');
const mods = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs')).sort()) mods.push((await import(pathToFileURL(join(dir, f)))).default);

// ---- wording ----
// NAND and NOR are said as words (a NAND gate); XOR, AND, OR, 8, 11, 18 and single letters like F, S, X begin with a vowel sound
const VOWEL_SOUND = /^(AND|OR|XOR|XNOR|ALU|FSM|ASM|LED|RTL|HDL|FPGA|SR|SOP|S|R|F|H|L|M|N|X|E|I|O|A|8|11|18|80|8\W.*|11\W.*|18\W.*|80\W.*|(input|output|edge|error|event|instruction|array|extra|example|address|enable|inverter|adder|encoder|assignment|always|initial|unknown|open|operand|opcode|equation|expression|odd|even|empty|answer|order|entry|ideal|accumulator|AND-OR|OR-AND|eight|eleven|hour|honest)s?\b.*)$/;
const CONSONANT = (w) => (/^[bcdfgjkpqtvwz][a-z]/.test(w) || /^(u[ns]i|use|usu|one|once|eu)/.test(w) || /^[2-79]\d*$/.test(w) || /^1\d?\d?$/.test(w) && !/^(11|18)$/.test(w)) && !VOWEL_SOUND.test(w);
// quoted source text (code in quotes or parentheses after "line n") keeps its own spacing
const prose = (s) => s.replace(/"[^"]*"/g, '"…"').replace(/\(([^()]|\([^()]*\))*;\)/g, '(…)');
export function wording(say) {
  const s = prose(say || ''), out = [];
  if (/\S {2,}\S/.test(s)) out.push('a double space');
  if (/\s[,.;:](\s|$)/.test(s)) out.push('a space before punctuation');
  for (const m of s.matchAll(/\b([A-Za-z]{2,}) \1\b/g)) if (!/^(that|had)$/i.test(m[1])) out.push('the word "' + m[1] + '" twice');
  for (const m of s.matchAll(/(^|[^\w'′])(a|an) ([\w′'-]+)/g)) {
    const art = m[2], w = m[3];
    if (art === 'a' && VOWEL_SOUND.test(w)) out.push('"a ' + w + '"');
    if (art === 'an' && CONSONANT(w)) out.push('"an ' + w + '"');
  }
  // a capital A is usually a signal name, so only a number after it is checked
  for (const m of s.matchAll(/(^|[.:;!?] )A (8|11|18|8\d)\b/g)) out.push('"A ' + m[2] + '"');
  if (/\b(the|a|an|of|what|to|is|are) (the|a|an|of|is|are)\b/i.test(s) && /\b(what (are|is) ?,|the the|of of|a a\b|an an\b)/i.test(s)) out.push('a missing word');
  if (/\b(what|that|which|with|of|and|the|a|an)\s{2,}/i.test(say || '')) out.push('a missing word');
  return out;
}

// ---- drawing ----
// a waveform panel that showed traces must not come up empty on a later frame
function waves(frames) {
  const out = [];
  let had = false;
  frames.forEach((f, i) => {
    const w = f.items.filter((x) => x.kind === 'wave');
    if (!w.length) return;
    const shown = w.some((x) => (x.changes || []).length > 0);
    if (had && !shown) out.push('frame ' + i + ': the waveform panel is empty');
    had = had || shown;
  });
  return out;
}

const rnd = rng(20261018);
let runs = 0;
for (const tp of S.topics) {
  if (!PARTS.test(tp.family)) continue;
  if (only.length && !only.some((o) => tp.id.startsWith(o) || tp.family.startsWith(o))) continue;
  const mine = mods.filter((m) => m.family.test(tp.family));
  const inputs = [{}].concat((tp.presets || []).map((p) => p.values));
  for (const m of mine) {
    inputs.push(...((m.extra || {})[tp.id] || []));
    const gen = (m.random || {})[tp.id];
    if (gen) for (let k = 0; k < 12; k++) inputs.push(gen(rnd));
  }
  for (const v of inputs) {
    const input = S.inputOf(tp, Object.assign(S.inputOf(tp), v));
    if (S.checkInput(tp, input)) continue;
    const js = JSON.stringify(v), tag = tp.id + ' ' + (js.length > 70 ? js.slice(0, 67).replace(/\\n/g, ' ') + '…}' : js);
    let r;
    try { r = S.run(tp, input); } catch (e) { t.ok(false, tag + ': ' + e.message); continue; }
    runs++;
    t.ok(r.ok, tag + ': ' + (r.error || ''));
    if (!r.ok) continue;
    r.frames.forEach((f, i) => {
      for (const w of wording(f.say)) t.ok(false, tag + ' frame ' + i + ': ' + w + ': ' + f.say);
      if (f.predict) for (const w of wording(f.predict.ask)) t.ok(false, tag + ' frame ' + i + ' prediction: ' + w + ': ' + f.predict.ask);
      t.ok(true);
    });
    for (const w of waves(r.frames)) t.ok(false, tag + ' ' + w);
    for (const m of mine) {
      try { m.check({ S, tp, values: v, input, r, fail: (msg) => t.ok(false, tag + ': ' + msg), pass: () => t.ok(true) }); }
      catch (e) { t.ok(false, tag + ': the claim check fails: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' ')); }
    }
  }
}
t.done();
