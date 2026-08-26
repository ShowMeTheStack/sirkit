// Part 4, selecting and routing: decoders (gate level, as function generators with OR gates, and big ones built
// from small ones), encoders and priority encoders, multiplexers (gate level, as trees, and as function
// generators with the n − 1 variable trick), demultiplexers, and tristate buffers sharing a bus.
(function (S) {
  'use strict';
  const K = S.Kit, L = K.live, B = S.Bool, N = S.Netlist;
  const lit = (v, on) => v + (on ? '' : "'");
  const mlist = (text, n) => [...new Set(String(text).split(/[\s,]+/).filter(Boolean).map(Number))].sort((a, b) => a - b).filter((x) => Number.isInteger(x) && x >= 0 && x < 1 << n);
  const listCheck = (n, label) => (v, inp) => { const k = typeof n === 'function' ? n(inp) : n; const xs = String(v).split(/[\s,]+/).filter(Boolean); if (xs.some((x) => !/^\d+$/.test(x) || +x >= 1 << k)) return label + ': numbers from 0 to ' + ((1 << k) - 1) + ', separated by commas'; return null; };
  const binList = (k, label, max) => (v) => { const xs = String(v).split(/[\s,]+/).filter(Boolean); if (!xs.length || xs.length > (max || 8) || xs.some((x) => !new RegExp('^[01]{' + k + '}$').test(x))) return label + ': up to ' + (max || 8) + ' patterns of ' + k + ' bits, separated by commas'; return null; };
  const outOpts = (names) => { const opts = []; const rec = (i, acc) => { if (i === names.length) { opts.push(acc.join(', ')); return; } for (const v of [0, 1]) rec(i + 1, acc.concat(names[i] + ' = ' + v)); }; rec(0, []); return opts; };
  /** the prediction a row walk asks before each new row after the first */
  const nextRow = (outs, ask) => ({
    at: (f, i, fr) => i > 0 && fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.first && fr[i + 1].meta.row !== undefined,
    pick: 'option', ask: ask || 'The inputs are about to change. What will the outputs be?', options: () => outOpts(outs),
    answer: (fr, i) => { const o = fr[i + 1].meta.out; if (outs.some((k) => o[k] !== 0 && o[k] !== 1)) return null; return outs.map((k) => k + ' = ' + o[k]).join(', '); },
    explain: (fr, i) => { const s = fr.slice(i + 1).find((f) => f.meta && f.meta.settled); return s ? s.say : ''; },
  });
  const count = (frames, id) => { let k = 0; for (const f of frames) { if (f.meta && f.meta.settled) k++; f.counters = { [id]: k }; } return frames; };

  S.family({ id: 'p4-decoders', part: 'combinational', order: 40, title: 'Decoders and encoders', blurb: 'From a binary number to one line out of many, and back again: decoders, functions built from them, big decoders from small ones, encoders and priority encoders.' });
  S.family({ id: 'p4-mux', part: 'combinational', order: 50, title: 'Multiplexers, demultiplexers and buses', blurb: 'Choosing one of many inputs, sending one input to one of many outputs, and sharing a wire between several drivers.' });

  // ---------------------------------------------------------------------------------------------------
  // Decoder, gate level
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'decoder', family: 'p4-decoders', order: 10, title: 'Decoder: one output per address',
    blurb: 'An n-to-2ⁿ decoder has one AND gate per output, each matching one address (a minterm of the address bits), and an enable on every gate. Exactly one output is active when enabled; none when not.',
    inputs: [
      { id: 'k', kind: 'choice', label: 'Size', def: '2', options: [{ value: '2', label: '2-to-4' }, { value: '3', label: '3-to-8' }] },
      { id: 'low', kind: 'choice', label: 'Outputs', def: 'high', options: [{ value: 'high', label: 'active high (AND gates)' }, { value: 'low', label: 'active low (NAND gates)' }] },
      { id: 'seq', kind: 'text', label: 'Enable and address, E first', def: '100, 101, 110, 111, 011', check: (v, inp) => binList(+inp.k + 1, 'Sequence')(v) },
    ],
    presets: [
      { label: '2-to-4: every address, then disabled', values: { k: '2', low: 'high', seq: '100, 101, 110, 111, 011' } },
      { label: '2-to-4, active-low outputs', values: { k: '2', low: 'low', seq: '100, 110, 111, 001' } },
      { label: '3-to-8: counting', values: { k: '3', low: 'high', seq: '1000, 1001, 1010, 1011, 1111' } },
      { label: '3-to-8: two bits change at once', values: { k: '3', low: 'high', seq: '1001, 1010, 1101' } },
    ],
    counters: [{ id: 'rows', label: 'addresses' }],
    run(inp) {
      const k = +inp.k, low = inp.low === 'low', A = [...Array(k).keys()].reverse().map((i) => 'A' + i);
      const outs = [...Array(1 << k).keys()].map((m) => 'Y' + m);
      const term = (m) => 'E' + A.map((v, i) => lit(v, (m >> (k - 1 - i)) & 1)).join('');
      const c = N.fromExpressions('dec', Object.fromEntries(outs.map((y, m) => [y, low ? '(' + term(m) + ")'" : term(m)])), low ? 'multi' : 'and-or', { inputs: A.concat(['E']) });
      const ins = ['E'].concat(A);
      const rows = String(inp.seq).split(/[\s,]+/).filter(Boolean).map((b) => parseInt(b, 2));
      const w = L.walk({ c, ins, outs, rows, detail: 2, waves: ins.concat(outs), table: k === 2,
        sayRow: (env, o) => { const a = A.map((v) => env[v]).join(''), act = outs.filter((y) => o[y] === (low ? 0 : 1)); return !env.E ? 'E = 0: every gate is held off, so ' + (low ? 'all outputs stay 1 (inactive)' : 'all outputs are 0') + ', whatever the address.' : 'Address ' + a + ' = ' + parseInt(a, 2) + ': only ' + act.join(', ') + ' is active (' + (low ? '0' : '1') + '); its gate is the one matching ' + term(parseInt(a, 2)) + '.'; } });
      count(w.frames, 'rows');
      const def = { sections: [{ id: 'eq', kind: 'math', title: 'One gate per output', text: outs.map((y, m) => y + ' = ' + (low ? '(' + term(m) + ')′' : term(m))).join('\n') }].concat(k === 2 ? w.def.sections : []) };
      return { frames: w.frames, def };
    },
    predict: [{
      at: (f, i, fr) => i > 0 && fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.first && fr[i + 1].meta.row !== undefined, pick: 'option', ask: 'Which output will be active after this change?',
      options: (fr, i, inp) => ['none'].concat([...Array(1 << +inp.k).keys()].map((m) => 'Y' + m)),
      answer: (fr, i, inp) => { const o = fr[i + 1].meta.out, want = inp.low === 'low' ? 0 : 1; const a = Object.keys(o).filter((y) => o[y] === want); return a.length === 1 ? a[0] : 'none'; },
      explain: (fr, i) => { const s = fr.slice(i + 1).find((f) => f.meta && f.meta.settled); return s ? s.say : ''; },
    }],
    quiz: [
      { q: 'A 3-to-8 decoder\'s output Y5 is active for the address…', options: ['011', '101', '110', '010'], answer: 1, why: '5 = 101.' },
      { q: 'With the enable off, an active-high decoder\'s outputs are…', options: ['all 1', 'all 0', 'the address', 'unknown'], answer: 1, why: 'Every AND gate has E as an input.' },
      { q: 'Each output of a decoder is…', options: ['a maxterm of the address', 'a minterm of the address', 'the OR of the address bits', 'a parity bit'], answer: 1, why: 'Y(m) = 1 exactly when the address is m.' },
      { q: 'An active-low decoder uses…', options: ['NAND gates: the chosen output goes to 0', 'NOR gates: the chosen output goes to 1', 'inverters only', 'XOR gates'], answer: 0, why: 'Its outputs are complemented minterms.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Functions from a decoder and OR gates
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'decoder-functions', family: 'p4-decoders', order: 20, title: 'Any function from a decoder and OR gates',
    blurb: 'A decoder makes every minterm of its inputs. OR together the minterms where a function is 1 and you have the function, in sum-of-minterms form; several functions share the one decoder.',
    inputs: [
      { id: 'f1', kind: 'text', label: 'F1 = Σm(…)', def: '1, 2, 4, 7', check: listCheck(3, 'F1') },
      { id: 'f2', kind: 'text', label: 'F2 = Σm(…)', def: '3, 5, 6, 7', check: listCheck(3, 'F2') },
    ],
    check: (inp) => { for (const k of ['f1', 'f2']) { const m = mlist(inp[k], 3); if (!m.length) return k.toUpperCase() + ': list at least one minterm'; if (m.length > 8) return k.toUpperCase() + ': at most 8 minterms'; } return null; },
    presets: [
      { label: 'A full adder: sum and carry', values: { f1: '1, 2, 4, 7', f2: '3, 5, 6, 7' } },
      { label: 'All equal, and not all equal', values: { f1: '0, 7', f2: '1, 2, 3, 4, 5, 6' } },
      { label: 'Primes, and the rest', values: { f1: '2, 3, 5, 7', f2: '0, 1, 4, 6' } },
    ],
    counters: [{ id: 'rows', label: 'rows' }],
    run(inp) {
      const f = [mlist(inp.f1, 3), mlist(inp.f2, 3)];
      // the decoder drawn as its gates, one AND per minterm (only the minterms used), the ORs after them
      const mt = (m) => ['A', 'B', 'C'].map((v, i) => v + ((m >> (2 - i)) & 1 ? '' : "'")).join('');
      const c = N.fromExpressions('decor', { F1: f[0].map(mt).join(' + '), F2: f[1].map(mt).join(' + ') }, 'and-or', { inputs: ['A', 'B', 'C'] });
      const ors = c.parts.filter((p) => p.type === 'OR');
      const w = L.walk({ c, ins: ['A', 'B', 'C'], outs: ['F1', 'F2'], rows: [0, 1, 2, 3, 4, 5, 6, 7], detail: 2, waves: ['A', 'B', 'C', 'F1', 'F2'],
        sayRow: (env, o) => { const m = env.A * 4 + env.B * 2 + env.C; return 'ABC = ' + m.toString(2).padStart(3, '0') + ': only the decoder gate for minterm ' + m + ' (' + mt(m) + ') can be 1' + (f[0].includes(m) || f[1].includes(m) ? '' : ', and neither function uses it') + '. ' + ['F1', 'F2'].map((nm, j) => nm + (f[j].includes(m) ? ' has ' + m + ' among its minterms, so ' + nm + ' = 1' : ' does not use output ' + m + ', so ' + nm + ' = 0')).join('; ') + '.'; } });
      count(w.frames, 'rows');
      w.frames.push(Object.assign({}, w.frames[w.frames.length - 1], { say: 'F1 = Σm(' + f[0].join(', ') + ') and F2 = Σm(' + f[1].join(', ') + '): one 3-to-8 decoder and one OR gate per function. No minimising is needed, which is why this is a quick way to build several functions of the same few inputs.', meta: { end: true } }));
      return { frames: w.frames, def: { sections: [{ id: 'eq', kind: 'math', title: 'The functions', text: 'F1 = Σm(' + f[0].join(', ') + ')\n   = ' + f[0].map((m) => 'Y' + m).join(' + ') + '\nF2 = Σm(' + f[1].join(', ') + ')\n   = ' + f[1].map((m) => 'Y' + m).join(' + ') }].concat(w.def.sections) } };
    },
    predict: [nextRow(['F1', 'F2'])],
    quiz: [
      { q: 'To build F = Σm(0, 3, 5) from a 3-to-8 decoder you need…', options: ['a 3-input OR of Y0, Y3, Y5', 'a 3-input AND', 'a 5-input OR', 'nothing more'], answer: 0, why: 'OR the decoder outputs of F\'s minterms.' },
      { q: 'Why can one decoder serve several functions?', options: ['It makes every minterm once; each OR picks the ones it needs', 'It has several enables', 'Functions share inputs only', 'It cannot'], answer: 0, why: 'The minterms are shared; only the OR gates differ.' },
      { q: 'A function with 7 of its 8 minterms equal to 1 is cheaper as…', options: ['a 7-input OR of decoder outputs', 'a NOR of the one remaining output', 'an AND gate', 'two decoders'], answer: 1, why: 'F′ has one minterm, so F = (Y of that minterm)′.' },
      { q: 'With an active-low decoder (NAND outputs), the OR gates become…', options: ['AND gates', 'NAND gates', 'NOR gates', 'XOR gates'], answer: 1, why: 'OR of minterms = NAND of their complements (De Morgan).' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Bigger decoders from small ones
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'decoder-tree', family: 'p4-decoders', order: 30, title: 'Big decoders from small ones',
    blurb: 'Split the address: the low bits go to every small decoder, the high bits choose which small decoder is enabled. Two 2-to-4 decoders make a 3-to-8; five make a 4-to-16 as a tree.',
    inputs: [
      { id: 'kind', kind: 'choice', label: 'Build', def: '38', options: [{ value: '38', label: '3-to-8 from two 2-to-4' }, { value: '416', label: '4-to-16 from five 2-to-4' }] },
      { id: 'seq', kind: 'text', label: 'Addresses', def: '1, 5, 6, 3', check: (v, inp) => listCheck(inp.kind === '38' ? 3 : 4, 'Addresses')(v, inp) },
    ],
    check: (inp) => { const n = String(inp.seq).split(/[\s,]+/).filter(Boolean).length; return n < 2 || n > 6 ? 'Addresses: two to six of them' : null; },
    presets: [
      { label: '3-to-8: 1, 5, 6, 3', values: { kind: '38', seq: '1, 5, 6, 3' } },
      { label: '3-to-8: 3 then 4 (A2 flips)', values: { kind: '38', seq: '3, 4, 3' } },
      { label: '4-to-16: 2, 7, 11, 14', values: { kind: '416', seq: '2, 7, 11, 14' } },
    ],
    counters: [{ id: 'rows', label: 'addresses' }],
    run(inp) {
      const big = inp.kind === '416', n = big ? 4 : 3, c = L.decTree(inp.kind);
      const ins = [...Array(n).keys()].reverse().map((i) => 'A' + i);
      const rows = String(inp.seq).split(/[\s,]+/).filter(Boolean).map(Number);
      const outs = [...new Set(rows)].map((m) => 'Y' + m);
      const chip = (m) => (big ? 'd' + (m >> 2) : m >> 2 ? 'dechi' : 'declo');
      const w = L.walk({ c, ins, outs, rows, detail: 2, table: false, waves: ins.concat(outs),
        settledHot: (env) => { const m = ins.reduce((s, v) => s * 2 + env[v], 0); return big ? ['dtop', chip(m)] : [chip(m)]; },
        sayRow: (env, o) => { const m = ins.reduce((s, v) => s * 2 + env[v], 0), hi = m >> 2, lo = m & 3; return 'Address ' + L.bits(m, n) + ' = ' + m + ': the high ' + (big ? 'bits ' + L.bits(hi, 2) + ' go to the first decoder, whose output ' + hi + ' enables decoder d' + hi : 'bit A2 = ' + hi + ' enables the ' + (hi ? 'upper decoder (Y4..Y7)' : 'lower decoder (Y0..Y3), through the inverter') ) + '; the low bits ' + L.bits(lo, 2) + ' pick its output ' + lo + ', which is Y' + m + '. Every other decoder is disabled, so all its outputs are 0.'; } });
      count(w.frames, 'rows');
      return { frames: w.frames, def: { sections: [{ id: 'eq', kind: 'math', title: 'Splitting the address', text: big ? 'A3 A2 → the first 2-to-4: enables one of d0..d3\nA1 A0 → every second-level decoder\nY(4j + i) = output i of d(j)' : 'A2 = 0: the lower decoder (EN = A2′) gives Y0..Y3\nA2 = 1: the upper decoder (EN = A2) gives Y4..Y7\nA1 A0 → both decoders' }] } };
    },
    predict: [{
      at: (f, i, fr) => i > 0 && fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.first && fr[i + 1].meta.row !== undefined, pick: 'option', ask: 'Which small decoder will be enabled for the next address?',
      options: (fr, i, inp) => (inp.kind === '416' ? ['d0', 'd1', 'd2', 'd3'] : ['the lower one (Y0..Y3)', 'the upper one (Y4..Y7)']),
      answer: (fr, i, inp) => { const m = fr[i + 1].meta.row; return inp.kind === '416' ? 'd' + (m >> 2) : m >> 2 ? 'the upper one (Y4..Y7)' : 'the lower one (Y0..Y3)'; },
      explain: (fr, i) => { const s = fr.slice(i + 1).find((f) => f.meta && f.meta.settled); return s ? s.say : ''; },
    }],
    quiz: [
      { q: 'How many 3-to-8 decoders make a 4-to-16 decoder (with an inverter)?', options: ['1', '2', '4', '8'], answer: 1, why: 'A3 enables one and A3′ the other.' },
      { q: 'In a tree of 2-to-4 decoders for 4-to-16, the first decoder is driven by…', options: ['the low address bits', 'the high address bits', 'the enable only', 'the outputs'], answer: 1, why: 'The high bits choose which second-level decoder is enabled.' },
      { q: 'How many 2-to-4 decoders does a 4-to-16 tree need?', options: ['4', '5', '8', '16'], answer: 1, why: 'One to choose, four to decode.' },
      { q: 'For address 1101 in the 4-to-16 tree, which second-level decoder is enabled?', options: ['d1', 'd2', 'd3', 'd0'], answer: 2, why: 'The high bits 11 = 3.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Encoder
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'encoder', family: 'p4-decoders', order: 40, title: 'Encoder: one line in, its number out',
    blurb: 'The reverse of a decoder: four inputs, one of them active, and the outputs give its number. Each output bit is the OR of the inputs whose number has that bit set. It only works if exactly one input is active.',
    inputs: [{ id: 'seq', kind: 'text', label: 'Inputs D3 D2 D1 D0', def: '0001, 0010, 0100, 1000, 0110, 0000', check: binList(4, 'Inputs') }],
    presets: [
      { label: 'One at a time, then two, then none', values: { seq: '0001, 0010, 0100, 1000, 0110, 0000' } },
      { label: 'D1 and D2 together give 3', values: { seq: '0010, 0110, 1000' } },
    ],
    counters: [{ id: 'rows', label: 'inputs tried' }],
    run(inp) {
      const c = N.fromExpressions('enc', { Y1: 'D2 + D3', Y0: 'D1 + D3' }, 'multi', { inputs: ['D2', 'D3', 'D1', 'D0'] });
      c.leaveOpen(c.byId.get('in_D0').pin('y'));
      const ins = ['D3', 'D2', 'D1', 'D0'];
      const rows = String(inp.seq).split(/[\s,]+/).filter(Boolean).map((b) => parseInt(b, 2));
      const w = L.walk({ c, ins, outs: ['Y1', 'Y0'], rows, detail: 2,
        sayRow: (env, o) => { const on = ins.filter((d) => env[d]); const code = o.Y1 * 2 + o.Y0; if (on.length === 1) return on[0] + ' alone is active, and Y1 Y0 = ' + o.Y1 + o.Y0 + ' = ' + code + ', its number.' + (on[0] === 'D0' ? ' D0 needs no gate at all: code 0 is what no input gives too.' : ''); if (!on.length) return 'No input is active, yet Y1 Y0 = 00: the same as D0. Without a valid output the reader cannot tell "D0" from "nothing".'; return on.slice(0, -1).join(', ') + ' and ' + on[on.length - 1] + ' are ' + (on.length === 2 ? 'both' : 'all') + ' active: the ORs mix their numbers and give ' + o.Y1 + o.Y0 + ' = ' + code + (on.includes('D' + code) ? '. That is D' + code + '\'s number, but only by luck: nothing shows that ' + on.filter((d) => d !== 'D' + code).join(' and ') + (on.length === 2 ? ' is' : ' are') + ' active too. A priority encoder makes the choice on purpose.' : ', which is wrong for ' + (on.length === 2 ? 'both' : 'all of them') + '. A priority encoder fixes this.'); } });
      count(w.frames, 'rows');
      return { frames: w.frames, def: { sections: [{ id: 'eq', kind: 'math', title: 'Equations', text: 'Y1 = D2 + D3   (inputs 2 and 3 have bit 1 set)\nY0 = D1 + D3   (inputs 1 and 3 have bit 0 set)' }].concat(w.def.sections) } };
    },
    predict: [nextRow(['Y1', 'Y0'])],
    quiz: [
      { q: 'In a 4-to-2 encoder, Y0 = …', options: ['D0 + D2', 'D1 + D3', 'D2 + D3', 'D0D1'], answer: 1, why: '1 = 01 and 3 = 11 have bit 0 set.' },
      { q: 'If D1 and D2 are both active, the plain encoder outputs…', options: ['01', '10', '11', '00'], answer: 2, why: 'Y1 = D2 = 1 and Y0 = D1 = 1: the code 3, which is wrong.' },
      { q: 'Why is a "valid" output useful?', options: ['To tell "no input" from "D0"', 'To make the encoder faster', 'To decode the outputs', 'It is not'], answer: 0, why: 'Both give code 00.' },
      { q: 'An 8-to-3 encoder has how many OR gates?', options: ['2', '3', '8', '4'], answer: 1, why: 'One per output bit.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Priority encoder
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'priority-encoder', family: 'p4-decoders', order: 50, title: 'Priority encoder',
    blurb: 'When several inputs are active, report the highest-numbered one, and say with V whether any input is active at all. Y1 = D3 + D2, Y0 = D3 + D2′D1, V = D3 + D2 + D1 + D0.',
    inputs: [{ id: 'seq', kind: 'text', label: 'Inputs D3 D2 D1 D0', def: '0000, 0001, 0011, 0111, 0101, 1010', check: binList(4, 'Inputs') }],
    presets: [
      { label: 'Requests piling up', values: { seq: '0000, 0001, 0011, 0111, 0101, 1010' } },
      { label: 'D3 always wins', values: { seq: '1000, 1111, 1001' } },
      { label: 'D2 masks D1', values: { seq: '0010, 0110, 0010' } },
    ],
    counters: [{ id: 'rows', label: 'inputs tried' }],
    run(inp) {
      const c = N.fromExpressions('prio4', { Y1: 'D3 + D2', Y0: "D3 + D2'D1", V: 'D3 + D2 + D1 + D0' }, 'multi', { inputs: ['D3', 'D2', 'D1', 'D0'] });
      const ins = ['D3', 'D2', 'D1', 'D0'];
      const rows = String(inp.seq).split(/[\s,]+/).filter(Boolean).map((b) => parseInt(b, 2));
      const w = L.walk({ c, ins, outs: ['Y1', 'Y0', 'V'], rows, detail: 2,
        sayRow: (env, o) => { const on = ins.filter((d) => env[d]); if (!on.length) return 'Nothing is active: V = 0, and the code is to be ignored.'; return (on.length > 1 ? on.join(', ') + ' are active; the highest, ' + on[0] + ', wins' : on[0] + ' is active') + ': Y1 Y0 = ' + o.Y1 + o.Y0 + ' = ' + (o.Y1 * 2 + o.Y0) + ', V = 1.' + (env.D2 && env.D1 ? ' The term D2′D1 is 0 because D2 is active: D2 blocks D1.' : ''); } });
      count(w.frames, 'rows');
      return { frames: w.frames, def: { sections: [{ id: 'eq', kind: 'math', title: 'Equations', text: "Y1 = D3 + D2\nY0 = D3 + D2'D1\nV  = D3 + D2 + D1 + D0" }].concat(w.def.sections) } };
    },
    predict: [nextRow(['Y1', 'Y0', 'V'])],
    quiz: [
      { q: 'Inputs D3..D0 = 0110 give Y1 Y0 =', options: ['01', '10', '11', '00'], answer: 1, why: 'D2 is the highest active input: 2 = 10.' },
      { q: 'Why does Y0 have the term D2′D1 and not just D1?', options: ['D2 must block D1, since 2 has priority', 'To save a gate', 'D1 is active low', 'It is a mistake'], answer: 0, why: 'With D2 active the code must be 10, so D1 must not set Y0.' },
      { q: 'V = 0 means…', options: ['input D0 is active', 'no input is active', 'two inputs are active', 'the outputs are 11'], answer: 1, why: 'V is the OR of all the inputs.' },
      { q: 'A typical use of a priority encoder is…', options: ['adding numbers', 'choosing which of several interrupt requests to serve', 'storing data', 'generating a clock'], answer: 1, why: 'The highest-priority request is reported first.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Multiplexer, gate level
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'multiplexer', family: 'p4-mux', order: 10, title: 'Multiplexer: a selector switch of gates',
    blurb: 'A 4-to-1 multiplexer passes one of four data inputs to its output; the select lines S1 S0 say which. Each AND gate is a decoder output ANDed with one data input, and the OR collects whichever is let through.',
    inputs: [
      { id: 'data', kind: 'text', label: 'Data I3 I2 I1 I0', def: '1010', check: (v) => (/^[01]{4}$/.test(v) ? null : 'Data: four bits, I3 first') },
      { id: 'sel', kind: 'text', label: 'Selects S1S0', def: '00, 01, 10, 11', check: binList(2, 'Selects') },
    ],
    presets: [
      { label: 'Data 1010, every select', values: { data: '1010', sel: '00, 01, 10, 11' } },
      { label: 'Data 0110, select 1 then 2', values: { data: '0110', sel: '01, 10' } },
      { label: 'Data 1000: only I3 is 1', values: { data: '1000', sel: '00, 11, 10' } },
    ],
    counters: [{ id: 'rows', label: 'selects' }],
    run(inp) {
      const c = N.fromExpressions('mux41', { Y: "S1'S0'I0 + S1'S0I1 + S1S0'I2 + S1S0I3" }, 'and-or', { inputs: ['I0', 'I1', 'I2', 'I3', 'S1', 'S0'] });
      const ins = ['I3', 'I2', 'I1', 'I0', 'S1', 'S0'], data = parseInt(inp.data, 2);
      const rows = String(inp.sel).split(/[\s,]+/).filter(Boolean).map((b) => (data << 2) | parseInt(b, 2));
      const ands = c.parts.filter((p) => p.type === 'AND');
      const andFor = (s) => ands.find((g) => { const names = g.pins.filter((q) => q.dir === 'in').map((q) => { const net = g.net[q.name], d = net.pins[0].part; return d.type === 'IN' ? d.params.name : 'n'; }); return names.includes('I' + s); });
      const w = L.walk({ c, ins, outs: ['Y'], rows, detail: 2, waves: ['S1', 'S0', 'I0', 'I1', 'I2', 'I3', 'Y'], table: false,
        settledHot: (env) => { const g = andFor(env.S1 * 2 + env.S0); return g ? [g.id] : []; },
        sayRow: (env, o) => { const s = env.S1 * 2 + env.S0; return 'S1 S0 = ' + env.S1 + env.S0 + ' selects I' + s + ' = ' + env['I' + s] + ': only its AND gate (lit) has both select terms at 1, so Y = I' + s + ' = ' + o.Y + '.'; } });
      count(w.frames, 'rows');
      return { frames: w.frames, def: { sections: [{ id: 'eq', kind: 'math', title: 'Equation', text: "Y = S1'S0'I0 + S1'S0I1\n  + S1S0'I2 + S1S0I3" }] } };
    },
    predict: [nextRow(['Y'], 'The select lines are about to change. What will Y be?')],
    quiz: [
      { q: 'A multiplexer with 8 data inputs needs how many select lines?', options: ['2', '3', '4', '8'], answer: 1, why: '2³ = 8.' },
      { q: 'With S1 S0 = 10, the 4-to-1 multiplexer outputs…', options: ['I0', 'I1', 'I2', 'I3'], answer: 2, why: '10 = 2.' },
      { q: 'The AND gates of a multiplexer are a decoder\'s gates with…', options: ['the data input added to each', 'an extra select line', 'their outputs inverted', 'nothing added'], answer: 0, why: 'Each decoder minterm is ANDed with one data input.' },
      { q: 'If the selected data input changes while S stays put, Y…', options: ['ignores it', 'follows it', 'goes to X', 'goes to 0'], answer: 1, why: 'The chosen input is wired through to the output.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Multiplexer tree
  // ---------------------------------------------------------------------------------------------------
  const mux81 = () => L.muxTree({ names: [...Array(8).keys()].map((i) => 'D' + i), sel: ['S0', 'S1', 'S2'], title: 'mux81' });
  S.topic({
    id: 'mux-tree', family: 'p4-mux', order: 20, title: 'A multiplexer tree',
    blurb: 'Seven 2-to-1 multiplexers make an 8-to-1. S0 picks within each pair, S1 between pairs of pairs, S2 at the root; the chosen input travels along one path through three levels.',
    inputs: [
      { id: 'data', kind: 'text', label: 'Data D7..D0', def: '10010110', check: (v) => (/^[01]{8}$/.test(v) ? null : 'Data: eight bits, D7 first') },
      { id: 'sel', kind: 'text', label: 'Selects S2S1S0', def: '000, 101, 110', check: binList(3, 'Selects', 6) },
    ],
    presets: [
      { label: 'Data 10010110: selects 0, 5, 6', values: { data: '10010110', sel: '000, 101, 110' } },
      { label: 'Only S2 changes', values: { data: '11110000', sel: '011, 111, 011' } },
      { label: 'Only S0 changes', values: { data: '01010101', sel: '100, 101, 100' } },
    ],
    counters: [{ id: 'rows', label: 'selects' }],
    run(inp) {
      const c = mux81(), data = parseInt(inp.data, 2);
      const ins = ['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0', 'S2', 'S1', 'S0'];
      const rows = String(inp.sel).split(/[\s,]+/).filter(Boolean).map((b) => (data << 3) | parseInt(b, 2));
      const path = (s) => ['mux' + (1 + (s >> 1)), 'mux' + (5 + (s >> 2)), 'mux7'];
      const w = L.walk({ c, ins, outs: ['Y'], rows, detail: 3, waves: ['S2', 'S1', 'S0', 'Y'], table: false,
        settledHot: (env) => path(env.S2 * 4 + env.S1 * 2 + env.S0),
        sayRow: (env, o) => { const s = env.S2 * 4 + env.S1 * 2 + env.S0; return 'S2 S1 S0 = ' + L.bits(s, 3) + ' = ' + s + ': S0 = ' + env.S0 + ' picks D' + s + ' from its pair, S1 = ' + env.S1 + ' passes that pair on, S2 = ' + env.S2 + ' chooses the ' + (env.S2 ? 'upper' : 'lower') + ' half at the root. Y = D' + s + ' = ' + o.Y + '. The path is lit.'; } });
      count(w.frames, 'rows');
      return { frames: w.frames, def: { sections: [{ id: 'eq', kind: 'math', title: 'Levels', text: 'level 1 (S0): 4 muxes, each picks from a pair\nlevel 2 (S1): 2 muxes\nlevel 3 (S2): 1 mux at the root\n7 two-input multiplexers in all' }] } };
    },
    predict: [nextRow(['Y'], 'The selects are about to change. What will Y be?')],
    quiz: [
      { q: 'How many 2-to-1 multiplexers make a 16-to-1 tree?', options: ['8', '15', '16', '4'], answer: 1, why: '8 + 4 + 2 + 1 = 15.' },
      { q: 'In the 8-to-1 tree, which select line drives the first level?', options: ['S0', 'S1', 'S2', 'all three'], answer: 0, why: 'The least significant select picks within each pair.' },
      { q: 'A change of S2 alone affects…', options: ['every multiplexer', 'only the root multiplexer', 'only the first level', 'none'], answer: 1, why: 'S2 is wired to the root only.' },
      { q: 'The delay of an 8-to-1 tree is about…', options: ['one 2-to-1 delay', 'three 2-to-1 delays', 'eight 2-to-1 delays', 'seven'], answer: 1, why: 'A signal passes three levels.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Functions from a multiplexer: the n − 1 variable trick
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'mux-function', family: 'p4-mux', order: 30, title: 'Any function from one multiplexer',
    blurb: 'A function of n variables fits a multiplexer with n − 1 select lines: put the first n − 1 variables on the selects, and feed each data input 0, 1, the last variable or its complement, read off pairs of rows of the truth table.',
    inputs: [
      { id: 'n', kind: 'choice', label: 'Variables', def: '3', options: [{ value: '3', label: '3 (a 4-to-1 multiplexer)' }, { value: '4', label: '4 (an 8-to-1 multiplexer)' }] },
      { id: 'fn', kind: 'text', label: 'F = Σm(…)', def: '1, 2, 6, 7', check: (v, inp) => listCheck(+inp.n, 'F')(v, inp) },
    ],
    check: (inp) => (mlist(inp.fn, +inp.n).length ? null : 'F: list at least one minterm'),
    presets: [
      { label: 'Σm(1, 2, 6, 7)', values: { n: '3', fn: '1, 2, 6, 7' } },
      { label: 'Majority of three', values: { n: '3', fn: '3, 5, 6, 7' } },
      { label: 'Odd parity of three', values: { n: '3', fn: '1, 2, 4, 7' } },
      { label: '4 variables: Σm(0, 3, 4, 9, 10, 15)', values: { n: '4', fn: '0, 3, 4, 9, 10, 15' } },
    ],
    counters: [{ id: 'rows', label: 'rows checked' }],
    run(inp) {
      const n = +inp.n, ones = new Set(mlist(inp.fn, n)), vars = ['A', 'B', 'C', 'D'].slice(0, n), last = vars[n - 1], sel = vars.slice(0, n - 1);
      const F = new S.Frames(['rows']);
      const entry = (j) => { const f0 = ones.has(2 * j) ? 1 : 0, f1 = ones.has(2 * j + 1) ? 1 : 0; return f0 === f1 ? String(f0) : f1 ? last : last + "'"; };
      const entries = [...Array(1 << (n - 1)).keys()].map(entry);
      const tbl = (upto) => K.table.draw({ prefix: 'tt', x: 0, y: 0, mono: true, minW: 32, ch: n > 3 ? 22 : 26, size: n > 3 ? 13 : 14, colHead: vars.concat(['F', 'I = ']), rows: [...Array(1 << n).keys()].map((m) => vars.map((_, i) => String((m >> (n - 1 - i)) & 1)).concat([ones.has(m) ? '1' : '0', m % 2 === 0 && (m >> 1) <= upto ? 'I' + (m >> 1) + ' = ' + entries[m >> 1] : ''])),
        cls: (r, cc) => ((r >> 1) === upto ? 'act' : (r >> 1) % 2 ? 'read' : '') });
      F.add({ items: tbl(-1).items, say: 'F = Σm(' + [...ones].join(', ') + '). Rows come in pairs that agree on ' + sel.join(', ') + ' and differ only in ' + last + '. Each pair will become one data input, chosen by ' + sel.join(', ') + ' on the select lines.', scene: 't' });
      for (let j = 0; j < entries.length; j++) {
        const f0 = ones.has(2 * j) ? 1 : 0, f1 = ones.has(2 * j + 1) ? 1 : 0;
        const why = f0 === f1 ? 'F = ' + f0 + ' in both rows, so I' + j + ' = ' + f0 : f1 ? 'F = 0 when ' + last + ' = 0 and 1 when ' + last + ' = 1, so I' + j + ' = ' + last : 'F = 1 when ' + last + ' = 0 and 0 when ' + last + ' = 1, so I' + j + ' = ' + last + '′';
        F.add({ items: tbl(j).items, say: 'Rows ' + 2 * j + ' and ' + (2 * j + 1) + ' (' + sel.map((v, i) => v + ' = ' + ((j >> (n - 2 - i)) & 1)).join(', ') + '): ' + why + '.', scene: 't', meta: { pair: j, entry: entries[j] } });
      }
      // the circuit: the select lines from the first n − 1 variables, each data input from the table
      const c = L.muxFn(entries, sel, last);
      const rows = [...Array(1 << n).keys()];
      const w = L.walk({ c, ins: vars, outs: ['F'], rows, detail: 1, waves: vars.concat(['F']), table: n === 3,
        sayRow: (env, o) => { const s = sel.reduce((a, v) => a * 2 + env[v], 0); return sel.join('') + ' = ' + L.bits(s, n - 1) + ' selects I' + s + ' = ' + entries[s].replace("'", '′') + (entries[s].length > 1 || entries[s] === last ? ', which is ' + o.F + ' here' : '') + ': F = ' + o.F + (o.F === (ones.has(vars.reduce((a, v) => a * 2 + env[v], 0)) ? 1 : 0) ? ', as the table says.' : '.'); } });
      let k = 0;
      w.frames.forEach((f) => { if (f.meta.settled) k++; F.set('rows', k); f.scene = 'w'; F.add(f); });
      L.views(F.list);
      const def = { sections: [{ id: 'imp', kind: 'table', title: 'Implementation table', colHead: ['data input', 'value'], rows: entries.map((e, j) => ['I' + j + ' (' + sel.join('') + ' = ' + L.bits(j, n - 1) + ')', e]) }] };
      return { frames: F.list, def };
    },
    predict: [
      { at: (f, i, fr) => fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.pair !== undefined, pick: 'option', ask: 'What goes on the next data input?', options: (fr, i, inp) => { const last = ['A', 'B', 'C', 'D'][+inp.n - 1]; return ['0', '1', last, last + "'"]; }, answer: (fr, i) => fr[i + 1].meta.entry, explain: (fr, i) => fr[i + 1].say },
    ],
    quiz: [
      { q: 'A 4-variable function needs a multiplexer with how many data inputs, by this method?', options: ['4', '8', '16', '2'], answer: 1, why: 'Three select lines: 2³ = 8 data inputs.' },
      { q: 'If F = 1 in both rows of a pair, that data input is…', options: ['0', '1', 'C', "C'"], answer: 1, why: 'Whatever the last variable is, F = 1.' },
      { q: 'If F = 1 only when the last variable is 0, the data input is…', options: ['the last variable', 'its complement', '0', '1'], answer: 1, why: 'F equals the complement of the last variable in that pair.' },
      { q: 'Besides the multiplexer, this method needs at most…', options: ['one inverter', 'one AND gate per input', 'a decoder', 'nothing at all, ever'], answer: 0, why: 'Only the complement of the last variable may be needed.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Demultiplexer
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'demultiplexer', family: 'p4-mux', order: 40, title: 'Demultiplexer',
    blurb: 'One data input, four outputs: the select lines choose which output receives D; the rest stay 0. Each output is D ANDed with one decode of the selects, which is exactly a decoder whose enable carries the data.',
    inputs: [{ id: 'seq', kind: 'text', label: 'S1 S0 D', def: '100, 101, 100, 011, 010', check: binList(3, 'Steps') }],
    presets: [
      { label: 'D pulses to output 2, then 1', values: { seq: '100, 101, 100, 011, 010' } },
      { label: 'A 1 sent round all four', values: { seq: '001, 011, 101, 111' } },
    ],
    counters: [{ id: 'rows', label: 'steps' }],
    run(inp) {
      const c = N.fromExpressions('demux', { Y0: "DS1'S0'", Y1: "DS1'S0", Y2: "DS1S0'", Y3: 'DS1S0' }, 'and-or', { inputs: ['S1', 'S0', 'D'] });
      const ins = ['S1', 'S0', 'D'], outs = ['Y0', 'Y1', 'Y2', 'Y3'];
      const rows = String(inp.seq).split(/[\s,]+/).filter(Boolean).map((b) => parseInt(b, 2));
      const w = L.walk({ c, ins, outs, rows, detail: 2, waves: ins.concat(outs),
        sayRow: (env, o) => { const s = env.S1 * 2 + env.S0; return 'S1 S0 = ' + env.S1 + env.S0 + ' routes D to Y' + s + ': Y' + s + ' = D = ' + env.D + ', and the other outputs are 0.'; } });
      count(w.frames, 'rows');
      w.frames.push(Object.assign({}, w.frames[w.frames.length - 1], { say: 'Compare the decoder with enable: Y(i) = E·(minterm i of the address). Rename E as D and the address as S, and it is this demultiplexer. One circuit, two readings: "which output is active" or "where does the data go".', meta: { end: true } }));
      return { frames: w.frames, def: { sections: [{ id: 'eq', kind: 'math', title: 'Equations', text: "Y0 = D·S1'S0'\nY1 = D·S1'S0\nY2 = D·S1S0'\nY3 = D·S1S0" }].concat(w.def.sections) } };
    },
    predict: [nextRow(['Y0', 'Y1', 'Y2', 'Y3'])],
    quiz: [
      { q: 'A 1-to-8 demultiplexer has how many select lines?', options: ['1', '3', '8', '4'], answer: 1, why: '2³ = 8 outputs.' },
      { q: 'With S1 S0 = 11 and D = 1, which outputs are 1?', options: ['Y3 only', 'Y0 only', 'all four', 'none'], answer: 0, why: 'D goes to the selected output only.' },
      { q: 'A decoder with an enable input can serve as a demultiplexer if…', options: ['the data goes to the enable', 'the data goes to an address input', 'its outputs are ORed', 'never'], answer: 0, why: 'Y(i) = E·m(i): the enable becomes the data.' },
      { q: 'The outputs not selected are…', options: ['0', '1', 'equal to D', 'floating'], answer: 0, why: 'Each AND gate has a select term that is 0.' },
    ],
  });

  // ---------------------------------------------------------------------------------------------------
  // Tristate buffers and a shared bus
  // ---------------------------------------------------------------------------------------------------
  S.topic({
    id: 'tristate-bus', family: 'p4-mux', order: 50, title: 'Tristate buffers and a shared bus',
    blurb: 'A tristate buffer either drives its output or lets go of it (Z, high impedance). Several can share one wire, a bus, as long as only one drives at a time. Enable none and the bus floats; enable two that disagree and they fight: the bus is X.',
    inputs: [
      { id: 'seq', kind: 'text', label: 'Steps', def: '001 101, 010 101, 000 101, 011 101, 011 111', check: (v, inp) => { const xs = String(v).split(',').map((x) => x.trim()).filter(Boolean); if (!xs.length || xs.length > 6 || xs.some((x) => !/^[01]{3}\s*[01]{3}$/.test(x))) return 'Steps: up to six of "enables data", each two groups of three bits, e.g. 001 101'; return null; } },
    ],
    presets: [
      { label: 'One, none, two at once', values: { seq: '001 101, 010 101, 000 101, 011 101, 011 111' } },
      { label: 'Taking turns, never two', values: { seq: '001 110, 010 110, 100 110, 000 110' } },
    ],
    counters: [{ id: 'rows', label: 'steps' }],
    run(inp) {
      const c = L.triBus();
      const ctl = ['E2', 'E1', 'E0'];
      const ins = ctl.concat(['D2', 'D1', 'D0']);
      const rows = String(inp.seq).split(',').map((x) => parseInt(x.replace(/\s+/g, ''), 2));
      const w = L.walk({ c, ins, outs: ['BUS'], rows, detail: 2, waves: ins.concat(['BUS']),
        settledHot: (env) => [0, 1, 2].filter((i) => env['E' + i]).map((i) => 't' + i),
        sayRow: (env, o) => {
          const on = [0, 1, 2].filter((i) => env['E' + i]), pre = '';
          if (!on.length) return pre + 'No buffer drives the bus: every output is Z, so the bus floats (Z). A gate reading it would see an unknown level; real buses add a pull-up resistor.';
          if (on.length === 1) return pre + 'Only buffer ' + on[0] + ' is enabled, so it drives the bus with D' + on[0] + ' = ' + env['D' + on[0]] + '; the others are Z and stay out of the way. BUS = ' + o.BUS + '.';
          const vals = on.map((i) => env['D' + i]);
          const two = on.length === 2, both = two ? 'both' : 'all';
          return 'Buffers ' + on.slice(0, -1).join(', ') + ' and ' + on[on.length - 1] + ' are ' + both + ' enabled' + (vals.every((v) => v === vals[0]) ? ' and happen to agree, so the bus reads ' + vals[0] + ', but ' + both + ' still drive it: one change of data and they fight.' : ', ' + (two ? 'one driving 1 and the other 0' : 'some driving 1 and some 0') + ': contention. The bus is X (in a real circuit, a large current flows between the ' + (two ? 'two ' : '') + 'outputs). The simulator reports it as a contention violation.');
        } });
      count(w.frames, 'rows');
      w.frames.push(Object.assign({}, w.frames[w.frames.length - 1], { say: 'The safe way to drive the enables is from a decoder: its outputs are one-hot, so exactly one buffer (or none) is ever enabled and contention cannot happen.', meta: { end: true } }));
      const v = w.sim.violations.filter((x) => x.kind === 'contention');
      return { frames: w.frames, def: { sections: [{ id: 'rules', kind: 'math', title: 'Tristate buffer', text: 'EN = 1: Y = A\nEN = 0: Y = Z (disconnected)\n\nbus rules:\n  exactly one driver → its value\n  no driver → Z (floating)\n  two drivers that differ → X' + (v.length ? '\n\ncontentions seen: ' + v.length : '') }].concat(w.def.sections) } };
    },
    predict: [{
      at: (f, i, fr) => i > 0 && fr[i + 1] && fr[i + 1].meta && fr[i + 1].meta.first && fr[i + 1].meta.row !== undefined, pick: 'option', ask: 'What will the bus carry after this step?', options: ['0', '1', 'Z (floating)', 'X (contention)'],
      answer: (fr, i) => { const b = fr[i + 1].meta.out.BUS; return b === 'Z' ? 'Z (floating)' : b === 'X' ? 'X (contention)' : String(b); },
      explain: (fr, i) => { const s = fr.slice(i + 1).find((f) => f.meta && f.meta.settled); return s ? s.say : ''; },
    }],
    quiz: [
      { q: 'A tristate buffer with its enable off outputs…', options: ['0', '1', 'high impedance (Z)', 'its input inverted'], answer: 2, why: 'It disconnects from the wire.' },
      { q: 'Two enabled buffers drive a bus with 1 and 0. The bus is…', options: ['1', '0', 'Z', 'X, contention'], answer: 3, why: 'The two outputs fight; the level is undefined.' },
      { q: 'Driving the enables from a decoder guarantees…', options: ['at most one driver at a time', 'the bus is never Z', 'faster switching', 'nothing'], answer: 0, why: 'A decoder activates exactly one output (or none).' },
      { q: 'Why might a bus have a pull-up resistor?', options: ['To speed it up', 'So it reads 1 instead of floating when nobody drives it', 'To cause contention', 'To invert it'], answer: 1, why: 'A floating input can read either level, or oscillate.' },
    ],
  });
})(globalThis.Sirkit = globalThis.Sirkit || {});
