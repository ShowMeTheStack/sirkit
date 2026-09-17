// Part 8: memory and programmable logic. The narration is read back and checked against our own working-out:
// the memories' starting contents and a word-by-word model of each write and read (with the access time), the
// address split of coincident decoding, Hamming codes encoded and decoded by position arithmetic, PLA and PAL
// programs evaluated term by term against the minterm lists, and LUT and FPGA outputs from the functions
// themselves. Drawn cells (memory contents, output bits, waveforms) are checked where the narration quotes them.

const START = [0x9, 0x4, 0xE, 0x1, 0x7, 0xC, 0x2, 0xB, 0x5, 0xF, 0x0, 0x8, 0x3, 0xA, 0x6, 0xD];
const bin = (v, n) => (v >>> 0).toString(2).padStart(n, '0');
const item = (f, key) => f.items.find((x) => x.key === key);
const eq = (ctx, got, want, what) => { if (String(got) !== String(want)) ctx.fail(what + ': the narration says ' + got + ', it should be ' + want); else ctx.pass(); };
const must = (ctx, m, what, say) => { if (!m) ctx.fail('cannot read ' + what + ' in "' + String(say).slice(0, 140) + '"'); return m; };
const waveAt = (f, key, t) => { const w = item(f, key); if (!w) return undefined; let v; for (const [tt, x] of w.changes) if (tt <= t) v = x; return v; };

// ---- Hamming, by positions ----------------------------------------------------------------------------------------
function hamming(data) {
  const m = data.length;
  let r = 0; while ((1 << r) < m + r + 1) r++;
  const n = m + r, code = Array(n + 1).fill(0);
  const dpos = [...Array(n).keys()].map((i) => i + 1).filter((p) => p & (p - 1));
  dpos.forEach((p, i) => { code[p] = +data[i]; });
  const pars = [...Array(r).keys()].map((i) => 1 << i);
  for (const p of pars) code[p] = dpos.filter((q) => q & p).reduce((s, q) => s ^ code[q], 0);
  return { n, r, code, pars, dpos };
}
const syndromeOf = (code, n, pars) => pars.reduce((s, p) => s | ([...Array(n).keys()].map((i) => i + 1).filter((q) => q & p).reduce((x, q) => x ^ code[q], 0) ? p : 0), 0);

// ---- functions of A, B, C -----------------------------------------------------------------------------------------
/** a product term written like A'BC or AB′ (or 1) as a test on a minterm 0..7 (A the high bit) */
function term(text) {
  const t = String(text).replace(/′/g, "'").replace(/\s+/g, '');
  const lits = [];
  for (let i = 0; i < t.length; i++) { if (!/[ABC]/.test(t[i])) throw new Error('term ' + text); const neg = t[i + 1] === "'"; lits.push([t[i], neg]); if (neg) i++; }
  return (m) => lits.every(([v, neg]) => (((m >> (2 - 'ABC'.indexOf(v))) & 1) === 1) !== neg);
}
const sumOf = (text) => { const ts = String(text).split(' + ').map(term); return (m) => ts.some((f) => f(m)); };
const mlist = (text) => [...new Set(String(text).split(/[\s,]+/).filter(Boolean).map(Number))].filter((x) => x >= 0 && x < 8);

export default {
  family: /^p8-/,
  extra: {
    'ram-organisation': [{ size: '16x4', addr: 0, op: 'read', data: '0000' }, { size: '8x8', addr: 7, op: 'write', data: '10100101' }, { size: '16x4', addr: 15, op: 'write', data: '0001' }],
    'ram-cycles': ['both', 'reads', 'slip'].flatMap((cycle) => ['CMOS', 'TTL'].map((tech) => ({ cycle, tech }))),
    'coincident-decoding': [{ n: '16', addr: 0 }, { n: '16', addr: 15 }, { n: '64', addr: 63 }, { n: '64', addr: 8 }],
    'memory-expansion': [...Array(16).keys()].map((a) => ({ mode: 'depth', addr: a })).concat([...Array(8).keys()].map((a) => ({ mode: 'width', addr: a }))),
    'hamming-sec': [{ data: '1111', flip: 7 }, { data: '0000', flip: 1 }, { data: '10110101101', flip: 15 }, { data: '1100101', flip: 8 }],
    'hamming-secded': [{ data: '1111', flips: '0, 7' }, { data: '0001', flips: '2' }, { data: '10110101101', flips: '15, 1' }],
    'fpga-lut': [{ fn: "A'B'C'", tries: '0, 7' }, { fn: '1', tries: '4' }, { fn: 'A ^ C', tries: '5, 2, 0' }],
    'fpga-fabric': [{ design: 'chain', tries: '00000, 01110, 11111' }, { design: 'fa', tries: '000, 101, 011' }, { design: 'eq', tries: '0000, 0110, 1001' }],
  },
  random: {
    'ram-organisation': (rnd) => { const size = ['8x4', '16x4', '8x8'][Math.floor(rnd() * 3)], [nw, dw] = size.split('x').map(Number); return { size, addr: Math.floor(rnd() * nw), op: rnd() < 0.5 ? 'read' : 'write', data: [...Array(dw)].map(() => (rnd() < 0.5 ? '0' : '1')).join('') }; },
    'coincident-decoding': (rnd) => { const n = rnd() < 0.5 ? 16 : 64; return { n: String(n), addr: Math.floor(rnd() * n) }; },
    'rom-truth-table': (rnd) => ({ table: ['square', 'gray', 'seg'][Math.floor(rnd() * 3)], reads: [...Array(1 + Math.floor(rnd() * 4))].map(() => Math.floor(rnd() * 8)).join(', ') }),
    'hamming-sec': (rnd) => { const m = 4 + Math.floor(rnd() * 8); let r = 0; while ((1 << r) < m + r + 1) r++; return { data: [...Array(m)].map(() => (rnd() < 0.5 ? '0' : '1')).join(''), flip: Math.floor(rnd() * (m + r + 1)) }; },
    'hamming-secded': (rnd) => { const m = 4 + Math.floor(rnd() * 8); let r = 0; while ((1 << r) < m + r + 1) r++; const k = Math.floor(rnd() * 3), a = Math.floor(rnd() * (m + r + 1)); let b = Math.floor(rnd() * (m + r + 1)); if (b === a) b = (a + 1) % (m + r + 1); return { data: [...Array(m)].map(() => (rnd() < 0.5 ? '0' : '1')).join(''), flips: k === 0 ? '' : k === 1 ? String(a) : a + ', ' + b }; },
    pla: (rnd) => { const pick = () => [...Array(8).keys()].filter(() => rnd() < 0.45); let f1 = pick(), f2 = pick(); if (!f1.length || f1.length === 8) f1 = [1, 6]; if (!f2.length || f2.length === 8) f2 = [0, 3, 5]; const f3 = rnd() < 0.4 ? pick().slice(0, 7) : []; return { f1: f1.join(', '), f2: f2.join(', '), f3: f3.join(', '), tries: [...Array(1 + Math.floor(rnd() * 4))].map(() => Math.floor(rnd() * 8)).join(', ') }; },
    pal: (rnd) => { const pick = () => [...Array(8).keys()].filter(() => rnd() < 0.45); let f1 = pick(), f2 = pick(); if (!f1.length || f1.length === 8) f1 = [2, 5]; if (!f2.length || f2.length === 8) f2 = [1, 7]; const f3 = rnd() < 0.4 ? pick().slice(0, 7) : []; return { f1: f1.join(', '), f2: f2.join(', '), f3: f3.join(', '), per: String(2 + Math.floor(rnd() * 3)), tries: [...Array(1 + Math.floor(rnd() * 4))].map(() => Math.floor(rnd() * 8)).join(', ') }; },
    'fpga-lut': (rnd) => ({ fn: ["AB + A'C", 'A ^ B ^ C', 'AB + AC + BC', "A'B + C", "(A + B)'C", "AB'C + A'BC'"][Math.floor(rnd() * 6)], tries: [...Array(1 + Math.floor(rnd() * 4))].map(() => Math.floor(rnd() * 8)).join(', ') }),
  },
  check(ctx) {
    const fn = CHECKS[ctx.tp.id];
    if (fn) fn(ctx); else ctx.fail('no claim check for ' + ctx.tp.id);
  },
};

const CHECKS = {
  'ram-organisation'(ctx) {
    const { input, r } = ctx, F = r.frames, [nw, dw] = input.size.split('x').map(Number), aw = Math.log2(nw), a = input.addr;
    const init = [...Array(nw).keys()].map((i) => (dw === 8 ? (START[i] << 4) | START[(i + 5) % 16] : START[i]));
    const f0 = F[0].say;
    eq(ctx, (f0.match(/^(An?) (\d+) × (\d+) RAM: (\d+) words of (\d+) bits, (\d+) bits in all\. Each row is a word; (\d+) address bits are enough to name (\d+) rows \(2\^(\d+) = (\d+)\)/) || []).slice(1).join('/'), [/^8/.test(String(nw)) ? 'An' : 'A', nw, dw, nw, dw, nw * dw, aw, nw, aw, nw].join('/'), 'the size');
    for (let w = 0; w < nw; w++) eq(ctx, [...Array(dw).keys()].map((k) => item(F[0], 'm:' + w + ',' + k).text).join(''), bin(init[w], dw), 'drawn word ' + w);
    eq(ctx, (F[1].say.match(/^The address ([01]+) = (\d+) goes to the decoder, which raises word line (\d+) alone/) || []).slice(1).join('/'), [bin(a, aw), a, a].join('/'), 'the address');
    const out = (f) => [...Array(dw).keys()].map((k) => item(f, 'do' + k).text).join('');
    if (input.op === 'write') {
      eq(ctx, (F[2].say.match(/the data ([01]+) is put on/) || [])[1], input.data, 'the data written');
      eq(ctx, (F[3].say.match(/^Word (\d+) was ([01]+) and now holds ([01]+)\./) || []).slice(1).join('/'), [a, bin(init[a], dw), input.data].join('/'), 'the write');
      for (let w = 0; w < nw; w++) eq(ctx, [...Array(dw).keys()].map((k) => item(F[3], 'm:' + w + ',' + k).text).join(''), w === a ? input.data : bin(init[w], dw), 'drawn word ' + w + ' after the write');
      eq(ctx, (F[4].say.match(/drives the data outputs, ([01]+)\./) || [])[1], input.data, 'the read back');
      eq(ctx, out(F[4]), input.data, 'drawn data out');
    } else {
      const mm = F[2].say.match(/the data outputs show ([01]+) \(([0-9A-F]+) in hex\)\. It takes the access time, (\d+) ns here/);
      eq(ctx, mm && mm.slice(1, 3).join('/'), bin(init[a], dw) + '/' + init[a].toString(16).toUpperCase(), 'the word read');
      eq(ctx, mm && mm[3], ctx.S.Tech.get('CMOS').mem.taa, 'the access time');
      eq(ctx, out(F[2]), bin(init[a], dw), 'drawn data out');
    }
  },

  'ram-cycles'(ctx) {
    const { S, input, r } = ctx, F = r.frames, taa = S.Tech.get(input.tech).mem.taa;
    const STEPS = {
      both: [[10, 'A', 2], [10, 'DIN', 0xA], [20, 'CS', 1], [30, 'WE', 1], [60, 'WE', 0], [70, 'CS', 0], [90, 'A', 2], [100, 'CS', 1], [100, 'OE', 1], [160, 'CS', 0], [160, 'OE', 0]],
      reads: [[10, 'A', 1], [10, 'CS', 1], [10, 'OE', 1], [80, 'A', 6], [150, 'CS', 0], [150, 'OE', 0]],
      slip: [[10, 'A', 3], [10, 'DIN', 0xF], [20, 'CS', 1], [30, 'WE', 1], [45, 'A', 4], [60, 'WE', 0], [70, 'CS', 0], [90, 'A', 3], [90, 'CS', 1], [90, 'OE', 1], [130, 'A', 4], [175, 'CS', 0], [175, 'OE', 0]],
    }[input.cycle];
    // our own model: levels over time; a write lands in every word addressed while CS and WE are 1
    const levelAt = (nm, t) => { let v = 0; for (const [tt, n, x] of STEPS) if (n === nm && tt <= t) v = x; return v; };
    const memAt = (t) => { const mem = START.slice(0, 8); for (let u = 0; u <= t; u++) if (levelAt('CS', u) && levelAt('WE', u)) mem[levelAt('A', u)] = levelAt('DIN', u); return mem; };
    // the output: the word at the address once A, CS and OE have been steady for an access time; Z once CS or OE
    // have been low for an access time (the part releases its outputs after the same delay)
    const lastChange = (t) => Math.max(0, ...STEPS.filter(([tt, n]) => tt <= t && ['A', 'CS', 'OE', 'WE'].includes(n)).map(([tt]) => tt));
    for (const f of F) {
      const t = f.meta.t;
      const mm = f.say.match(/^At (\d+) ns/);
      if (t && must(ctx, mm, 'a time', f.say)) eq(ctx, mm[1], t, 'the frame time');
      const mem = memAt(t);
      for (let w = 0; w < 8; w++) eq(ctx, [...Array(4).keys()].map((k) => item(f, 'm:' + w + ',' + k).text).join(''), bin(mem[w], 4), 'drawn word ' + w + ' at ' + t + ' ns');
      let g = f.say.match(/word (\d+) = ([01]+)\./);
      if (g) eq(ctx, g[2], bin(mem[+g[1]], 4), 'word ' + g[1] + ' at ' + t + ' ns');
      g = f.say.match(/the access time \((\d+) ns\)/);
      if (g) eq(ctx, g[1], taa, 'the access time');
      g = f.say.match(/the data is valid: DOUT = ([01]+), the word at address (\d+)\./);
      if (g) {
        const A = levelAt('A', t), reading = levelAt('CS', t) && levelAt('OE', t) && !levelAt('WE', t);
        eq(ctx, g[2], A, 'the address at ' + t + ' ns');
        eq(ctx, reading && t - lastChange(t) >= taa, true, 'one access time of steady inputs before ' + t + ' ns');
        eq(ctx, g[1], bin(mem[A], 4), 'the word read at ' + t + ' ns');
        eq(ctx, waveAt(f, 'w:w:DOUT', t), g[1], 'drawn DOUT at ' + t + ' ns');
      }
      if (/the outputs let go: DOUT = Z/.test(f.say)) {
        eq(ctx, !levelAt('CS', t) || !levelAt('OE', t), true, 'deselected at ' + t + ' ns');
        eq(ctx, t - lastChange(t) >= taa, true, 'an access time since the deselect at ' + t + ' ns');
        eq(ctx, waveAt(f, 'w:w:DOUT', t), 'zzzz', 'drawn DOUT at ' + t + ' ns');
      }
      if (/its outputs stay released|data outputs are released \(Z\)/.test(f.say)) eq(ctx, waveAt(f, 'w:w:DOUT', t), 'zzzz', 'drawn DOUT at ' + t + ' ns');
      if (/the outputs keep the old word/.test(f.say)) eq(ctx, /^[01]+$/.test(waveAt(f, 'w:w:DOUT', t)), true, 'an old word on DOUT at ' + t + ' ns');
      if (/the write now goes into word (\d+) as well/.test(f.say)) eq(ctx, f.say.match(/word (\d+) as well/)[1], levelAt('A', t), 'the new address under WE');
    }
    // every release the waveform shows is narrated
    const last = F[F.length - 1], dz = item(last, 'w:w:DOUT').changes;
    for (const [tt, v] of dz.slice(1)) if (v === 'zzzz') eq(ctx, F.some((f) => f.meta.t === tt + 1 && /let go/.test(f.say)), true, 'the release at ' + tt + ' ns narrated');
  },

  'coincident-decoding'(ctx) {
    const { input, r } = ctx, F = r.frames, n = +input.n, k = Math.log2(n), h = k / 2, side = 1 << h, a = input.addr;
    eq(ctx, (F[0].say.match(/^(\d+) cells need (\d+) address bits\. A one-dimensional decoder would need (\d+) AND gates of (\d+) inputs each, one per cell\. Arranged as (an?) (\d+) × (\d+) square, two (\d+)-to-(\d+) decoders/) || []).slice(1).join('/'), [n, k, n, k, side === 8 ? 'an' : 'a', side, side, h, side].join('/'), 'the arithmetic');
    eq(ctx, (F[1].say.match(/^Split the address ([01]+): the high (\d+) bits ([01]+) name the row \((\d+)\), the low (\d+) bits ([01]+) name the column \((\d+)\)\./) || []).slice(1).join('/'), [bin(a, k), h, bin(a >> h, h), a >> h, h, bin(a & (side - 1), h), a & (side - 1)].join('/'), 'the split');
    eq(ctx, (F[2].say.match(/row line (\d+): all (\d+) cells/) || []).slice(1).join('/'), (a >> h) + '/' + side, 'the row');
    eq(ctx, (F[3].say.match(/column line (\d+)\. Only the cell where row (\d+) and column (\d+) cross, cell (\d+),/) || []).slice(1).join('/'), [a & (side - 1), a >> h, a & (side - 1), a].join('/'), 'the cell');
    const hot = F[3].items.filter((x) => /^c\d+,\d+$/.test(x.key) && / hot/.test(x.cls)).map((x) => x.key);
    eq(ctx, hot.join(' '), 'c' + (a >> h) + ',' + (a & (side - 1)), 'the cell lit');
    eq(ctx, /for 4096 cells, 4096 gates of 12 inputs against 2 × 64 gates of 6 inputs/.test(F[4].say), true, 'the 4096 example');
  },

  'memory-expansion'(ctx) {
    const { input, r } = ctx, F = r.frames, a = input.addr, low = a & 7, hi = (a >> 3) & 1;
    if (input.mode === 'depth') {
      eq(ctx, (F[1].say.match(/^Address ([01]+): A3 = (\d), so only the (upper|lower) chip/) || []).slice(1).join('/'), [bin(a, 4), hi, hi ? 'upper' : 'lower'].join('/'), 'the chip chosen');
      const v = START[a];
      eq(ctx, (F[2].say.match(/reads its word (\d+) onto the shared bus: D = ([01]+)\. That is word (\d+)/) || []).slice(1).join('/'), [low, bin(v, 4), a].join('/'), 'the word');
      eq(ctx, [0, 1, 2, 3].map((k) => item(F[2], 'out:' + k).text).join(''), bin(v, 4), 'drawn data');
      if (F[0].predict) eq(ctx, F[0].predict.answer, hi ? 'the upper chip' : 'the lower chip', 'the chip asked');
    } else {
      const v = (START[low] << 4) | START[8 + low];
      eq(ctx, (F[2].say.match(/half of word (\d+): ([01]+) and ([01]+), together the 8-bit word ([01]+) \(([0-9A-F]+) in hex\)/) || []).slice(1).join('/'), [low, bin(v >> 4, 4), bin(v & 15, 4), bin(v, 8), v.toString(16).toUpperCase()].join('/'), 'the word');
    }
  },

  'rom-truth-table'(ctx) {
    const { input, r } = ctx, F = r.frames;
    const ROM = { square: [6, (m) => m * m], gray: [3, (m) => m ^ (m >> 1)], seg: [2, (m) => ((m >> 2) & 1) + ((m >> 1) & 1) + (m & 1)] }[input.table];
    const [w, word] = ROM;
    eq(ctx, (F[0].say.match(/Eight rows of (\d+) bits, 8 × (\d+) = (\d+) bits/) || []).slice(1).join('/'), [w, w, 8 * w].join('/'), 'the size');
    for (const f of F) {
      for (const g of f.say.matchAll(/word (\d+) = ([01]+)/g)) eq(ctx, g[2], bin(word(+g[1]), w), 'word ' + g[1]);
      const g = f.say.match(/^Read address ([01]+): the decoder raises word line m(\d+) only, .* returns ([01]+) = (\d+)\.$/);
      if (g) {
        eq(ctx, parseInt(g[1], 2), +g[2], 'the word line');
        eq(ctx, g[3] + '/' + g[4], bin(word(+g[2]), w) + '/' + word(+g[2]), 'the word read at ' + g[2]);
        eq(ctx, [...Array(w).keys()].map((k) => item(f, 'rom:ov:' + k).text).join(''), bin(word(+g[2]), w), 'drawn outputs at ' + g[2]);
      }
    }
    const reads = String(input.reads).split(/[\s,]+/).filter(Boolean).map(Number);
    eq(ctx, F.filter((f) => /^Read address/.test(f.say)).map((f) => parseInt(f.say.match(/address ([01]+)/)[1], 2)).join(','), reads.join(','), 'the reads');
  },

  'rom-types'(ctx) {
    const { input, r } = ctx, F = r.frames;
    for (const f of F) {
      const g = f.say.match(/^Programmed with ([01]+)\./);
      if (g) { eq(ctx, g[1], input.word, 'the word programmed'); eq(ctx, [0, 1, 2, 3].map((i) => item(f, 'sp' + i).text).join(''), input.word, 'the drawn word'); }
      if (/^Erased: every bit returns to 1/.test(f.say)) eq(ctx, [0, 1, 2, 3].map((i) => item(f, 'sp' + i).text).join(''), '1111', 'the erased word');
    }
  },

  'hamming-sec'(ctx) {
    const { input, r } = ctx, F = r.frames, data = String(input.data).replace(/\s+/g, ''), H = hamming(data), { n, r: rr, code, pars, dpos } = H;
    eq(ctx, (F[0].say.match(/^(\d+) data bits need (\d+) parity bits \(2\^(\d+) ≥ (\d+) \+ (\d+) \+ 1\), at positions ([\d, ]+); the data fills the other positions of 1 to (\d+)\. The data bits fill positions ([\d, ]+) in order\./) || []).slice(1).join('/'), [data.length, rr, rr, data.length, rr, pars.join(', '), n, dpos.join(', ')].join('/'), 'the layout');
    for (const f of F) {
      const g = f.say.match(/^P(\d+) checks positions ([\d, ]+): the data bits there are ([01]+), so P\d+ = ([01]) for even parity\.$/);
      if (!g) continue;
      const p = +g[1], cov = [...Array(n).keys()].map((i) => i + 1).filter((q) => q & p);
      eq(ctx, g[2], cov.join(', '), 'P' + p + ' covers');
      eq(ctx, g[3], cov.filter((q) => q !== p).map((q) => code[q]).join(''), 'P' + p + ' data bits');
      eq(ctx, g[4], code[p], 'P' + p);
    }
    const stored = code.slice(1).join('');
    eq(ctx, (F.find((f) => /-bit word [01]+ is stored/.test(f.say)).say.match(/The (\d+)-bit word ([01]+) is stored/) || []).slice(1).join('/'), n + '/' + stored, 'the stored word');
    const got = code.slice(), flip = input.flip;
    if (flip) got[flip] ^= 1;
    const read = got.slice(1).join('');
    const fr = F.find((f) => /read back is/.test(f.say));
    eq(ctx, (fr.say.match(/read back is ([01]+)\./) || [])[1], read, 'the word read');
    if (flip) eq(ctx, (fr.say.match(/flips the bit at position (\d+) \((a check bit|a data bit)\): (\d) becomes (\d)/) || []).slice(1).join('/'), [flip, flip & (flip - 1) ? 'a data bit' : 'a check bit', code[flip], got[flip]].join('/'), 'the flip');
    for (let pos = 1; pos <= n; pos++) eq(ctx, item(fr, 'b' + pos).text, got[pos], 'drawn bit ' + pos + ' read');
    for (const f of F) {
      const g = f.say.match(/^Check (\d+) over positions ([\d, ]+): ([01]+) has (even|odd) parity, so syndrome bit \d+ is ([01])\.$/);
      if (!g) continue;
      const p = +g[1], cov = [...Array(n).keys()].map((i) => i + 1).filter((q) => q & p), bits = cov.map((q) => got[q]), par = bits.reduce((a, b) => a ^ b, 0);
      eq(ctx, g[2] + '/' + g[3] + '/' + g[4] + '/' + g[5], cov.join(', ') + '/' + bits.join('') + '/' + (par ? 'odd' : 'even') + '/' + par, 'check ' + p);
    }
    const syn = syndromeOf(got, n, pars);
    const end = F[F.length - 1].say;
    eq(ctx, (end.match(/the syndrome is ([01]+) = (\d+)\./) || []).slice(1).join('/'), bin(syn, rr) + '/' + syn, 'the syndrome');
    eq(ctx, (end.match(/syndrome is [01]+ = \d+\. The syndrome is/) || []).length, 0, 'the syndrome said once');
    eq(ctx, syn, flip, 'the syndrome points at the flip');
    if (syn) eq(ctx, (end.match(/The bit at position (\d+) is wrong; flip it\. The corrected word is ([01]+), and the data is ([01]+)\./) || []).slice(1).join('/'), [syn, stored, data].join('/'), 'the correction');
    else eq(ctx, /No error\. The data is ([01]+)\./.exec(end) && /No error\. The data is ([01]+)\./.exec(end)[1], data, 'no error');
  },

  'hamming-secded'(ctx) {
    const { input, r } = ctx, F = r.frames, data = String(input.data).replace(/\s+/g, ''), { n, r: rr, code, pars } = hamming(data);
    code[0] = code.slice(1).reduce((a, b) => a ^ b, 0);
    eq(ctx, (F[1].say.match(/P0 = ([01])\. The stored word is ([01]+) \(P0 first\)/) || []).slice(1).join('/'), code[0] + '/' + code.join(''), 'P0 and the stored word');
    const flips = String(input.flips).split(/[\s,]+/).filter(Boolean).map(Number), got = code.slice();
    for (const p of flips) got[p] ^= 1;
    const f2 = F[2].say;
    eq(ctx, (f2.match(/read back is ([01]+)\./) || [])[1], got.join(''), 'the word read');
    eq(ctx, flips.length === 1 ? /^A fault flips position \d+\./.test(f2) : flips.length === 2 ? /^Faults flip positions \d+ and \d+\./.test(f2) : /^Nothing flips/.test(f2), true, 'the flips sentence');
    const fails = pars.map((p) => [...Array(n).keys()].map((i) => i + 1).filter((q) => q & p).reduce((x, q) => x ^ got[q], 0));
    const syn = pars.reduce((s, p, i) => s | (fails[i] ? p : 0), 0), overall = got.reduce((a, b) => a ^ b, 0);
    eq(ctx, (F[3].say.match(/^The Hamming checks: (.+)\. Syndrome = ([01]+) = (\d+)\.$/) || []).slice(1).join('/'), [pars.map((p, i) => 'check ' + p + ' ' + (fails[i] ? 'fails' : 'passes')).join(', '), bin(syn, rr), syn].join('/'), 'the checks');
    eq(ctx, (F[4].say.match(/over all (\d+) bits is (even|odd)/) || []).slice(1).join('/'), (n + 1) + '/' + (overall ? 'odd' : 'even'), 'the overall parity');
    const status = !syn && !overall ? 'ok' : syn && overall ? 'corrected' : !syn && overall ? 'p0' : 'double';
    eq(ctx, status, flips.length === 0 ? 'ok' : flips.length === 2 ? 'double' : flips[0] === 0 ? 'p0' : 'corrected', 'the verdict by the number of flips');
    const end = F[F.length - 1].say;
    if (status === 'corrected') eq(ctx, (end.match(/the bit at position (\d+) is wrong/) || [])[1], syn, 'the bit corrected');
    if (status !== 'double') eq(ctx, (end.match(/Data: ([01]+)\./) || [])[1], data, 'the data');
    else eq(ctx, /two bits are wrong/.test(end), true, 'two errors reported');
    if (F[4].predict) eq(ctx, F[4].predict.answer, { ok: 'no error', corrected: 'one error, corrected', p0: 'one error (in P0), corrected', double: 'two errors, detected only' }[status], 'the verdict asked');
  },

  pla(ctx) {
    const { S, input, r } = ctx, F = r.frames, B = S.Bool;
    const fns = { F1: mlist(input.f1), F2: mlist(input.f2) };
    if (mlist(input.f3).length) fns.F3 = mlist(input.f3);
    const names = Object.keys(fns);
    const terms = [];
    for (const f of F) {
      const g = f.say.match(/^T(\d+) = ([^:]+): dots on the ([^ ]+(?:, [^ ]+)*) columns of the AND plane, and on the ([\w ]+?) columns? of the OR plane/);
      if (!g) continue;
      const lits = g[2].replace(/′/g, "'").match(/[ABC]'?/g).map((l) => l.replace("'", '′'));
      eq(ctx, g[3], lits.join(', '), 'the AND dots of T' + g[1]);
      terms.push({ test: term(g[2]), used: g[4].split(' and '), label: 'T' + g[1] });
    }
    // the program: each output is exactly the OR of its terms
    for (const nm of names) for (let m = 0; m < 8; m++) eq(ctx, terms.some((t) => t.used.includes(nm) && t.test(m)), fns[nm].includes(m), nm + ' at ' + m + ' from the program');
    const sep = new Set(names.flatMap((nm) => B.minimise(B.fromMinterms(['A', 'B', 'C'], fns[nm])).cover.map((c) => c.str)));
    eq(ctx, (F[0].say.match(/Separately they need (\d+) terms; together (\d+)\./) || []).slice(1).join('/'), sep.size + '/' + terms.length, 'term counts');
    eq(ctx, /A term with two 1s on the right is shared/.test(F[1].say), terms.some((t) => t.used.length > 1), 'shared terms');
    for (const f of F) {
      const g = f.say.match(/^ABC = ([01]{3}): the lit columns are the literals that are 1\. (?:Product terms? ([T\d, ]+) (?:is|are) 1|No product term is 1)[^,]*, so (.+?)\. The same/);
      if (!g) continue;
      const m = parseInt(g[1], 2);
      eq(ctx, g[2] || '', terms.filter((t) => t.test(m)).map((t) => t.label).join(', '), 'live terms at ' + g[1]);
      eq(ctx, g[3], names.map((nm) => nm + ' = ' + (fns[nm].includes(m) ? 1 : 0)).join(', '), 'outputs at ' + g[1]);
      for (let k = 0; k < names.length; k++) { const ov = item(f, 'pla:ov:' + k); if (ov) eq(ctx, ov.text, fns[names[k]].includes(m) ? 1 : 0, 'drawn ' + names[k] + ' at ' + g[1]); }
    }
  },

  pal(ctx) {
    const { S, input, r } = ctx, F = r.frames, B = S.Bool, per = +input.per;
    const fns = { F1: mlist(input.f1), F2: mlist(input.f2) };
    if (mlist(input.f3).length) fns.F3 = mlist(input.f3);
    const names = Object.keys(fns);
    eq(ctx, (F[0].say.match(/the outputs ([\w, ]+) each own (\d+) product rows/) || []).slice(1).join('/'), names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + '/' + per, 'the outputs and rows');
    const sums = {}, fits = {};
    let used = 0;
    for (const nm of names) {
      const f = F.find((g) => g.say.startsWith(nm + ' = '));
      const g = must(ctx, f && f.say.match(/^(\w+) = ([^:]+): (?:(\d+) terms? in its (\d+) rows|it needs (\d+) terms but has only (\d+) rows: it does not fit)/), nm, f ? f.say : '');
      if (!g) continue;
      const ts = g[2].split(' + ');
      sums[nm] = sumOf(g[2]);
      for (let m = 0; m < 8; m++) eq(ctx, sums[nm](m), fns[nm].includes(m), nm + ' = ' + g[2] + ' at ' + m);
      fits[nm] = ts.length <= per;
      eq(ctx, !!g[3], fits[nm], 'whether ' + nm + ' fits');
      eq(ctx, g[3] || g[5], ts.length, 'terms of ' + nm);
      eq(ctx, g[4] || g[6], per, 'rows of ' + nm);
      eq(ctx, /the spare row/.test(f.say), ts.length < per, 'the spare row remark for ' + nm);
      eq(ctx, ts.length, B.minimise(B.fromMinterms(['A', 'B', 'C'], fns[nm])).cover.length, 'a minimal sum for ' + nm);
      used += ts.length;
    }
    for (const f of F) {
      const g = f.say.match(/^ABC = ([01]{3}): the lit columns are the literals that are 1\. (?:Product terms? ([\w., ]+?) (?:is|are) 1|No product term is 1)[^,]*, so (.+?)\. The same/);
      if (!g) continue;
      const m = parseInt(g[1], 2);
      const live = [];
      for (const nm of names) { const txt = F.find((h) => h.say.startsWith(nm + ' = ')).say.match(/^\w+ = ([^:]+):/)[1]; txt.split(' + ').forEach((t, j) => { if (term(t)(m)) live.push(nm + '.' + (j + 1)); }); }
      eq(ctx, g[2] || '', live.join(', '), 'live rows at ' + g[1]);
      eq(ctx, g[3], names.map((nm) => nm + ' = ' + (fns[nm].includes(m) ? 1 : 0)).join(', '), 'outputs at ' + g[1]);
    }
    const end = F[F.length - 1].say, pla = B.minimiseMulti(Object.fromEntries(names.map((nm) => [nm, B.fromMinterms(['A', 'B', 'C'], fns[nm])]))).cost.terms;
    if (names.every((nm) => fits[nm])) eq(ctx, (end.match(/^This PAL uses (\d+) of its (\d+) product rows; a PLA, sharing terms, would need (\d+)\./) || []).slice(1).join('/'), [used, names.length * per, pla].join('/'), 'the rows used');
    else eq(ctx, (end.match(/^These outputs need (\d+) product terms, but ([\w ]+?) (?:does|do) not fit in (\d+) rows; a PLA, sharing terms, would need (\d+)\./) || []).slice(1).join('/'), [used, names.filter((nm) => !fits[nm]).join(' and '), per, pla].join('/'), 'the terms needed');
  },

  'fpga-lut'(ctx) {
    const { S, input, r } = ctx, F = r.frames, B = S.Bool;
    const e = B.parse(input.fn);
    const bits = [...Array(8).keys()].map((m) => (B.evaluate(e, { A: (m >> 2) & 1, B: (m >> 1) & 1, C: m & 1 }) ? 1 : 0));
    eq(ctx, (F[0].say.match(/read top to bottom, is ([01]{8})/) || [])[1], bits.join(''), 'the truth table');
    eq(ctx, (F[1].say.match(/the eight bits ([01 ]+) sit/) || [])[1], bits.join(' '), 'the configuration');
    const tries = String(input.tries).split(/[\s,]+/).filter(Boolean).map(Number).filter((m) => m >= 0 && m < 8).slice(0, 4);
    const settled = F.filter((f) => /is an address:/.test(f.say));
    eq(ctx, settled.length, tries.length, 'rows tried');
    settled.forEach((f, i) => {
      const g = f.say.match(/ABC = ([01]{3}) is an address: .* bit (\d) of the configuration \(([01])\) comes out\. F = ([01])\./);
      if (!must(ctx, g, 'a settled row', f.say)) return;
      const m = tries[i];
      eq(ctx, g.slice(1).join('/'), [bin(m, 3), m, bits[m], bits[m]].join('/'), 'row ' + m);
      const tEnd = Math.max(...item(f, 'w:w:F').changes.map((c) => c[0]), ...['A', 'B', 'C'].map((v) => Math.max(...item(f, 'w:w:' + v).changes.map((c) => c[0]))));
      eq(ctx, waveAt(f, 'w:w:F', tEnd + 1000), bits[m], 'drawn F after row ' + m);
    });
    for (const f of F) {
      const g = f.say.match(/^At (\d+) ns the inputs change to A = ([01]), B = ([01]), C = ([01])\./);
      if (g) for (const [k, v] of [['A', g[2]], ['B', g[3]], ['C', g[4]]]) eq(ctx, waveAt(f, 'w:w:' + k, +g[1]), v, 'drawn ' + k + ' at ' + g[1] + ' ns');
      for (const h of f.say.matchAll(/\bF (rises to 1|falls to 0) at (\d+) ns/g)) eq(ctx, waveAt(f, 'w:w:F', +h[2]), h[1] === 'rises to 1' ? 1 : 0, 'drawn F at ' + h[2] + ' ns');
    }
  },

  'fpga-fabric'(ctx) {
    const { S, input, r } = ctx, F = r.frames, B = S.Bool;
    const DES = {
      fa: { ins: ['A', 'B', 'C'], outs: { S: (e) => e.A ^ e.B ^ e.C, K: (e) => (e.A & e.B) | (e.A & e.C) | (e.B & e.C) } },
      chain: { ins: ['A', 'B', 'C', 'D', 'E'], outs: { F: (e) => ((e.A ^ e.B) & (e.C | e.D)) | e.E } },
      eq: { ins: ['A1', 'B1', 'A0', 'B0'], outs: { E: (e) => (e.A1 === e.B1 && e.A0 === e.B0 ? 1 : 0) } },
    }[input.design];
    const map = F[1].say.match(/cut into pieces of at most three inputs: (.+)\.$/)[1].split('; ').map((p) => p.match(/^(\w+) = (.+) \((\d) inputs\)$/));
    eq(ctx, F.find((f) => /^Configured/.test(f.say)).say.match(/(\d+) LUTs × 8 bits = (\d+) LUT bits/).slice(1).join('/'), map.length + '/' + map.length * 8, 'LUT bits');
    const tries = String(input.tries).split(/[\s,]+/).filter(Boolean);
    const runs = F.filter((f) => /^Run it: /.test(f.say));
    eq(ctx, runs.length, tries.length, 'runs');
    runs.forEach((f, i) => {
      const env = Object.fromEntries(DES.ins.map((nm, k) => [nm, +tries[i][k]]));
      const g = f.say.match(/^Run it: (.+?)\. Each LUT looks up its output: (.+?)\. Routes carrying 1 are lit\. Out: (.+)\.$/);
      if (!must(ctx, g, 'a run', f.say)) return;
      eq(ctx, g[1], DES.ins.map((nm) => nm + ' = ' + env[nm]).join(', '), 'run inputs');
      // each LUT from its own expression, in order (the later ones read the earlier ones)
      const vals = Object.assign({}, env);
      for (const [, name, expr] of map) vals[name] = B.evaluate(B.parse(expr.replace(/′/g, "'")), vals) ? 1 : 0;
      eq(ctx, g[2], map.map(([, name]) => name + ' = ' + vals[name]).join(', '), 'LUT outputs');
      eq(ctx, g[3], Object.entries(DES.outs).map(([nm, fn]) => nm + ' = ' + fn(env)).join(', '), 'the design outputs');
      for (const [nm, fn] of Object.entries(DES.outs)) eq(ctx, item(f, 'op' + nm).text, nm + '=' + fn(env), 'drawn pad ' + nm);
    });
  },
};
