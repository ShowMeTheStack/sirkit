// Verilog out of circuits: fromCircuit(circuit) gives a structural module (one gate primitive, assign or small
// always block per part, a submodule per subcircuit), and vcd(waves) writes a value change dump from the
// waves of Sirkit.Sim or of a Verilog simulation.
(function (S) {
  'use strict';
  const V = S.Verilog = S.Verilog || {};

  const ident = (s, used) => {
    let n = String(s == null ? 'n' : s).replace(/\[(\d+)\]/g, '_$1').replace(/[^A-Za-z0-9_]/g, '_');
    if (!/^[A-Za-z_]/.test(n)) n = 'n_' + n;
    if (V.KEYWORDS && V.KEYWORDS.has(n)) n += '_';
    if (used) { let k = n, i = 1; while (used.has(k)) k = n + '_' + (i++); used.add(k); n = k; }
    return n;
  };
  const rng = (w) => (w > 1 ? '[' + (w - 1) + ':0] ' : '');
  const SOURCES = new Set(['IN', 'CLOCK', 'SWITCH', 'BUTTON']);
  const SINKS = new Set(['OUT', 'LED', 'PROBE', 'HEX', 'SEG7']);

  /** structural Verilog for a Netlist.Circuit (subcircuits become modules of their own) */
  function fromCircuit(circuit, opts) {
    opts = opts || {};
    const modules = [], seen = new Map();
    emit(circuit, opts.name || circuit.title || 'circuit', modules, seen);
    return '// Verilog written by Sirkit from the circuit "' + (circuit.title || '') + '"\n' + modules.join('\n');
  }
  V.fromCircuit = fromCircuit;

  function emit(circuit, title, modules, seen) {
    if (seen.has(circuit)) return seen.get(circuit);
    const used = new Set();
    const mname = ident(title, new Set([...seen.values()]));
    seen.set(circuit, mname);
    const netName = new Map(), ports = [], body = [], decls = [], notes = [];
    const pinW = (part, pin) => { const q = part.pins.find((x) => x.name === pin); return q ? q.width : 1; };
    // ports first, so their names win
    for (const p of circuit.parts) {
      if (SOURCES.has(p.type)) {
        const name = ident(p.params.name || p.id, used), w = p.type === 'IN' ? p.params.w || 1 : 1;
        ports.push({ dir: 'input', name, w, part: p });
        const net = p.net.y; if (net) netName.set(net, name);
      }
    }
    for (const p of circuit.parts) {
      if (SINKS.has(p.type)) {
        const name = ident(p.type === 'OUT' ? p.params.name || p.id : p.type.toLowerCase() + '_' + p.id, used);
        if (p.type === 'SEG7') { const segs = p.pins.map((q) => q.name); ports.push({ dir: 'output', name, w: segs.length, part: p, segs }); }
        else ports.push({ dir: 'output', name, w: p.pins[0].width || 1, part: p });
      }
    }
    for (const n of circuit.nets) {
      if (netName.has(n)) continue;
      const name = ident(n.name || n.id, used);
      netName.set(n, name);
      decls.push('  wire ' + rng(n.width) + name + ';');
    }
    const at = (part, pin, w) => {
      const n = part.net[pin];
      if (n) return netName.get(n);
      return (w || pinW(part, pin)) > 1 ? "{" + (w || pinW(part, pin)) + "{1'bz}}" : "1'bz";
    };
    const out = (part, pin) => (part.net[pin] ? netName.get(part.net[pin]) : null);
    const act = (part, pin, low) => (low ? '!' + at(part, pin) : at(part, pin));
    let k = 0;
    const reg = (w) => { const r = ident('q_' + (k++), used); decls.push('  reg ' + rng(w) + r + ';'); return r; };
    const assign = (part, pin, expr) => { const o = out(part, pin); if (o) body.push('  assign ' + o + ' = ' + expr + ';'); };
    const sel = (part, n) => {
      const kk = Math.max(1, Math.ceil(Math.log2(n)));
      if (part.params.selBus) return at(part, 's');
      const bits = []; for (let i = kk - 1; i >= 0; i--) bits.push(at(part, 's' + i));
      return bits.length === 1 ? bits[0] : '{' + bits.join(', ') + '}';
    };
    const edgeOf = (p) => (p.edge === 'fall' ? 'negedge' : 'posedge');
    // a flip-flop of any kind: async set/reset, enable, then the next-state expression
    const flop = (part, nextExpr, w) => {
      const p = part.params, q = reg(w || 1);
      const ev = [edgeOf(p) + ' ' + at(part, 'clk')];
      const lowEdge = p.asyncLow ? 'negedge ' : 'posedge ';
      const conds = [];
      if (p.reset && part.net.rst) { ev.push(lowEdge + at(part, 'rst')); conds.push('if (' + act(part, 'rst', p.asyncLow) + ') ' + q + ' <= 0;'); }
      if (p.set && part.net.set) { ev.push(lowEdge + at(part, 'set')); conds.push('if (' + act(part, 'set', p.asyncLow) + ') ' + q + ' <= ' + (w > 1 ? "{" + w + "{1'b1}}" : "1'b1") + ';'); }
      let main = q + ' <= ' + nextExpr(q) + ';';
      if (p.en && part.net.en) main = 'if (' + act(part, 'en', p.enLow) + ') ' + main;
      body.push('  always @(' + ev.join(' or ') + ')');
      body.push('    ' + conds.concat([main]).join(' else ').replace(/; else /g, '; else '));
      assign(part, 'q', q);
      if (part.pins.some((x) => x.name === 'qn')) assign(part, 'qn', '~' + q);
      return q;
    };
    for (const part of circuit.parts) {
      const p = part.params, t = part.type, id = ident(part.id, used);
      const G = { AND: 'and', OR: 'or', NAND: 'nand', NOR: 'nor', XOR: 'xor', XNOR: 'xnor', NOT: 'not', BUF: 'buf' }[t];
      if (G) {
        const ins = part.pins.filter((x) => x.dir === 'in' && x.name !== 'oe').map((x) => at(part, x.name));
        if (!out(part, 'y')) continue;
        if (p.out === 'tri' || p.out === 'oc') {
          const op = { and: '&', or: '|', xor: '^', nand: '&', nor: '|', xnor: '^', not: '', buf: '' }[G];
          let e = G === 'not' || G === 'buf' ? ins[0] : ins.join(' ' + op + ' ');
          if (/^n|xnor/.test(G) || G === 'not') e = '~(' + e + ')';
          if (p.out === 'tri') assign(part, 'y', '(' + act(part, 'oe', p.oeLow) + ') ? (' + e + ") : 1'bz");
          else assign(part, 'y', '(' + e + ") ? 1'bz : 1'b0");
          continue;
        }
        body.push('  ' + G + ' ' + id + ' (' + [out(part, 'y')].concat(ins).join(', ') + ');');
        continue;
      }
      switch (t) {
        case 'IN': case 'CLOCK': case 'SWITCH': case 'BUTTON': case 'OUT': case 'LED': case 'PROBE': case 'HEX': case 'SEG7': break;
        case 'CONST': { const w = p.w || 1; assign(part, 'y', p.value === 'X' ? w + "'bx" : p.value === 'Z' ? w + "'bz" : w + "'d" + (+p.value >>> 0)); break; }
        case 'VCC': assign(part, 'y', "1'b1"); break;
        case 'GND': assign(part, 'y', "1'b0"); break;
        case 'PULLUP': case 'PULLDOWN': if (out(part, 'y')) body.push('  ' + t.toLowerCase() + ' ' + id + ' (' + out(part, 'y') + ');'); break;
        case 'TRI': {
          const e = p.invert ? '~' + at(part, 'a') : at(part, 'a');
          assign(part, 'y', '(' + act(part, 'en', p.enLow) + ') ? ' + e + ' : ' + ((p.w || 1) > 1 ? '{' + p.w + "{1'bz}}" : "1'bz"));
          break;
        }
        case 'MUX': {
          const n = p.n || 2, s = sel(part, n), w = p.w || 1;
          let e = (w > 1 ? w + "'d0" : "1'b0");
          for (let i = n - 1; i >= 0; i--) e = '(' + s + ' == ' + i + ') ? ' + at(part, 'd' + i) + ' : ' + e;
          if (p.en && part.net.en) e = '(' + act(part, 'en', p.enLow) + ') ? (' + e + ') : ' + (w > 1 ? w + "'d0" : "1'b0");
          assign(part, 'y', n === 2 && !p.en ? s + ' ? ' + at(part, 'd1') + ' : ' + at(part, 'd0') : e);
          break;
        }
        case 'DEMUX': {
          const n = p.n || 2, s = sel(part, n), w = p.w || 1, en = p.en && part.net.en ? act(part, 'en', p.enLow) + ' && ' : '';
          for (let i = 0; i < n; i++) assign(part, 'y' + i, '(' + en + s + ' == ' + i + ') ? ' + at(part, 'd') + ' : ' + (w > 1 ? w + "'d0" : "1'b0"));
          break;
        }
        case 'DECODER': {
          const kk = p.k || 2, a = []; for (let i = kk - 1; i >= 0; i--) a.push(at(part, 'a' + i));
          const en = p.en && part.net.en ? act(part, 'en', p.enLow) + ' && ' : '';
          for (let i = 0; i < 1 << kk; i++) assign(part, 'y' + i, (p.activeLow ? '!' : '') + '(' + en + '{' + a.join(', ') + '} == ' + i + ')');
          break;
        }
        case 'ENCODER': case 'PRIENC': {
          const n = p.n || 4, kk = Math.max(1, Math.ceil(Math.log2(n))), code = reg(kk), any = reg(1), d = [];
          for (let i = 0; i < n; i++) d.push(at(part, 'd' + i));
          body.push('  integer ' + id + '_i;');
          if (t === 'ENCODER') body.push('  always @* begin ' + code + ' = 0; ' + any + ' = 0; for (' + id + '_i = 0; ' + id + '_i < ' + n + '; ' + id + '_i = ' + id + '_i + 1) if ({' + d.slice().reverse().join(', ') + '} >> ' + id + '_i & 1) begin ' + code + ' = ' + code + ' | ' + id + '_i; ' + any + ' = 1; end end');
          else body.push('  always @* begin ' + code + ' = 0; ' + any + ' = 0; for (' + id + '_i = 0; ' + id + '_i < ' + n + '; ' + id + '_i = ' + id + '_i + 1) if ({' + d.slice().reverse().join(', ') + '} >> ' + id + '_i & 1) begin ' + code + ' = ' + id + '_i; ' + any + ' = 1; end end');
          for (let j = 0; j < kk; j++) assign(part, 'y' + j, code + '[' + j + ']');
          if (part.pins.some((x) => x.name === 'v')) assign(part, 'v', any);
          break;
        }
        case 'HA': assign(part, 's', at(part, 'a') + ' ^ ' + at(part, 'b')); assign(part, 'c', at(part, 'a') + ' & ' + at(part, 'b')); break;
        case 'FA': {
          const a = at(part, 'a'), b = at(part, 'b'), c = at(part, 'cin');
          assign(part, 's', a + ' ^ ' + b + ' ^ ' + c);
          assign(part, 'cout', '(' + a + ' & ' + b + ') | (' + c + ' & (' + a + ' ^ ' + b + '))');
          break;
        }
        case 'ADDER': case 'ADDSUB': {
          const w = p.w || 4, sum = ident(id + '_sum', used);
          decls.push('  wire [' + w + ':0] ' + sum + ';');
          const b = t === 'ADDSUB' ? '(' + at(part, 'm') + ' ? ~' + at(part, 'b') + ' : ' + at(part, 'b') + ')' : at(part, 'b');
          const cin = t === 'ADDSUB' ? at(part, 'm') : p.cin !== false && part.net.cin ? at(part, 'cin') : "1'b0";
          body.push('  assign ' + sum + ' = ' + at(part, 'a') + ' + ' + b + ' + ' + cin + ';');
          assign(part, 's', sum + '[' + (w - 1) + ':0]');
          assign(part, 'cout', sum + '[' + w + ']');
          if (part.pins.some((x) => x.name === 'v')) assign(part, 'v', '(' + at(part, 'a') + '[' + (w - 1) + '] == ' + b + '[' + (w - 1) + ']) && (' + sum + '[' + (w - 1) + '] != ' + at(part, 'a') + '[' + (w - 1) + '])');
          break;
        }
        case 'CMP': {
          const a = p.signed ? '$signed(' + at(part, 'a') + ')' : at(part, 'a'), b = p.signed ? '$signed(' + at(part, 'b') + ')' : at(part, 'b');
          assign(part, 'lt', a + ' < ' + b); assign(part, 'eq', a + ' == ' + b); assign(part, 'gt', a + ' > ' + b);
          break;
        }
        case 'MUL': assign(part, 'p', '{' + (p.w || 4) + "'d0, " + at(part, 'a') + '} * ' + at(part, 'b')); break;
        case 'ALU': {
          const w = p.w || 8, ops = S.Parts && S.Parts.aluOps ? S.Parts.aluOps(p) : [], a = at(part, 'a'), b = at(part, 'b'), y = reg(w);
          const E = { ADD: a + ' + ' + b, SUB: a + ' - ' + b, AND: a + ' & ' + b, OR: a + ' | ' + b, XOR: a + ' ^ ' + b, NAND: '~(' + a + ' & ' + b + ')', NOR: '~(' + a + ' | ' + b + ')', XNOR: '~(' + a + ' ^ ' + b + ')', NOT: '~' + a, NEG: '-' + a, INC: a + ' + 1', DEC: a + ' - 1', SHL: a + ' << 1', SHR: a + ' >> 1', ASR: '{' + a + '[' + (w - 1) + '], ' + a + '[' + (w - 1) + ':1]}', PASSA: a, PASSB: b, ZERO: '0', MUL: a + ' * ' + b, SLT: a + ' < ' + b };
          body.push('  always @* case (' + at(part, 'op') + ') ' + ops.map((o, i) => i + ': ' + y + ' = ' + (E[o] || '0') + ';').join(' ') + ' default: ' + y + ' = 0; endcase');
          assign(part, 'y', y);
          if (p.flags) { assign(part, 'z', y + ' == 0'); assign(part, 'n', y + '[' + (w - 1) + ']'); assign(part, 'c', "1'b0"); assign(part, 'v', "1'b0"); notes.push('the ALU ' + part.id + ' carry and overflow flags are written as 0'); }
          break;
        }
        case 'DFF': flop(part, () => at(part, 'd')); break;
        case 'TFF': flop(part, (q) => at(part, 't') + ' ? ~' + q + ' : ' + q); break;
        case 'JKFF': flop(part, (q) => '{' + at(part, 'j') + ', ' + at(part, 'k') + "} == 2'b10 ? 1'b1 : {" + at(part, 'j') + ', ' + at(part, 'k') + "} == 2'b01 ? 1'b0 : {" + at(part, 'j') + ', ' + at(part, 'k') + "} == 2'b11 ? ~" + q + ' : ' + q); break;
        case 'SRFF': flop(part, (q) => at(part, 's') + " && !" + at(part, 'r') + " ? 1'b1 : " + at(part, 'r') + ' && !' + at(part, 's') + " ? 1'b0 : !" + at(part, 's') + ' && !' + at(part, 'r') + ' ? ' + q + " : 1'bx"); break;
        case 'LATCH': {
          const q = reg(1);
          body.push('  always @* if (' + act(part, 'en', p.enLow) + ') ' + q + ' = ' + at(part, 'd') + ';');
          assign(part, 'q', q); if (part.pins.some((x) => x.name === 'qn')) assign(part, 'qn', '~' + q);
          break;
        }
        case 'SRLATCH': {
          const q = reg(1), s = act(part, 's', p.low), r = act(part, 'r', p.low), en = p.en ? at(part, 'en') + ' && ' : '';
          body.push('  always @* if (' + en + s + ' && !' + r + ') ' + q + " = 1'b1; else if (" + en + r + ' && !' + s + ') ' + q + " = 1'b0;");
          assign(part, 'q', q); if (part.pins.some((x) => x.name === 'qn')) assign(part, 'qn', '~' + q);
          break;
        }
        case 'REG': case 'COUNTER': case 'SHIFT': case 'USHIFT': {
          const w = p.w || 4, q = reg(w), ev = [edgeOf(p) + ' ' + at(part, 'clk')], conds = [];
          if (p.clr && part.net.clr) {
            if (!p.clrSync && t !== 'USHIFT' || t === 'USHIFT') { ev.push((p.clrLow ? 'negedge ' : 'posedge ') + at(part, 'clr')); }
            conds.push('if (' + act(part, 'clr', p.clrLow) + ') ' + q + ' <= 0;');
          }
          let main;
          if (t === 'REG') main = (p.ld && part.net.ld ? 'if (' + at(part, 'ld') + ') ' : '') + q + ' <= ' + at(part, 'd') + ';';
          else if (t === 'SHIFT') {
            const sh = p.dir === 'left' ? '{' + at(part, 'si') + ', ' + q + '[' + (w - 1) + ':1]}' : (w > 1 ? '{' + q + '[' + (w - 2) + ':0], ' + at(part, 'si') + '}' : at(part, 'si'));
            main = (p.ld && part.net.ld ? 'if (' + at(part, 'ld') + ') ' + q + ' <= ' + at(part, 'd') + '; else ' : '') + q + ' <= ' + sh + ';';
            assign(part, 'so', q + '[' + (p.dir === 'left' ? 0 : w - 1) + ']');
          } else if (t === 'USHIFT') {
            main = 'case (' + at(part, 's') + ") 2'd1: " + q + ' <= {' + q + '[' + (w - 2) + ':0], ' + at(part, 'sr') + "}; 2'd2: " + q + ' <= {' + at(part, 'sl') + ', ' + q + '[' + (w - 1) + ":1]}; 2'd3: " + q + ' <= ' + at(part, 'd') + '; default: ' + q + ' <= ' + q + '; endcase';
          } else {
            const mod = p.mod || 2 ** w, up = p.dir === 'pin' ? at(part, 'up') : p.dir === 'down' ? "1'b0" : "1'b1";
            const inc = '(' + up + ' ? (' + q + ' == ' + (mod - 1) + ' ? 0 : ' + q + ' + 1) : (' + q + ' == 0 ? ' + (mod - 1) + ' : ' + q + ' - 1))';
            main = (p.ld && part.net.ld ? 'if (' + at(part, 'ld') + ') ' + q + ' <= ' + at(part, 'd') + '; else ' : '') + (p.en && part.net.en ? 'if (' + at(part, 'en') + ') ' : '') + q + ' <= ' + inc + ';';
            if (p.co) assign(part, 'co', (p.en && part.net.en ? at(part, 'en') + ' && ' : '') + '(' + up + ' ? ' + q + ' == ' + (mod - 1) + ' : ' + q + ' == 0)');
          }
          body.push('  always @(' + ev.join(' or ') + ')');
          body.push('    ' + conds.concat([main]).join(' else '));
          assign(part, 'q', q);
          break;
        }
        case 'RAM': case 'ROM': {
          const aw = p.aw || 4, dw = p.dw || 8, n = 1 << aw, mem = ident(id + '_mem', used);
          decls.push('  reg [' + (dw - 1) + ':0] ' + mem + ' [0:' + (n - 1) + '];');
          const data = S.Parts && S.Parts.parseData ? S.Parts.parseData(p.data, n, dw) : [];
          const init = []; for (let i = 0; i < n; i++) if (data[i]) init.push(mem + '[' + i + '] = ' + dw + "'h" + data[i].toString(16) + ';');
          body.push('  integer ' + id + '_i;');
          body.push('  initial begin for (' + id + '_i = 0; ' + id + '_i < ' + n + '; ' + id + '_i = ' + id + '_i + 1) ' + mem + '[' + id + '_i] = 0; ' + init.join(' ') + ' end');
          const cs = p.cs ? act(part, 'cs', false) : null, oe = p.oe ? act(part, 'oe', false) : null;
          const en = [cs, oe].filter(Boolean).join(' && ');
          const rd = mem + '[' + at(part, 'a') + ']';
          if (t === 'RAM') {
            const we = at(part, 'we') + (cs ? ' && ' + cs : '');
            if (p.sync) body.push('  always @(posedge ' + at(part, 'clk') + ') if (' + we + ') ' + mem + '[' + at(part, 'a') + '] <= ' + at(part, 'din') + ';');
            else body.push('  always @* if (' + we + ') ' + mem + '[' + at(part, 'a') + '] = ' + at(part, 'din') + ';');
            assign(part, 'dout', en ? '(' + en + (p.oe ? ' && !' + at(part, 'we') : '') + ') ? ' + rd + " : {" + dw + "{1'bz}}" : rd);
          } else assign(part, 'd', en ? '(' + en + ') ? ' + rd + " : {" + dw + "{1'bz}}" : rd);
          break;
        }
        case 'SPLIT': {
          const sizes = S.Parts && S.Parts.splitSizes ? S.Parts.splitSizes(p) : new Array(p.w || 4).fill(1);
          let lo = 0;
          sizes.forEach((nb, i) => { assign(part, 'y' + i, at(part, 'a') + (pinW(part, 'a') > 1 ? '[' + (nb > 1 ? (lo + nb - 1) + ':' + lo : lo) + ']' : '')); lo += nb; });
          break;
        }
        case 'MERGE': {
          const sizes = S.Parts && S.Parts.splitSizes ? S.Parts.splitSizes(p) : new Array(p.w || 4).fill(1);
          assign(part, 'y', '{' + sizes.map((_, i) => at(part, 'a' + i)).reverse().join(', ') + '}');
          break;
        }
        case 'BLOCK': {
          const sub = p.circuit;
          if (!sub) { notes.push('the block ' + part.id + ' has no circuit inside'); break; }
          const sm = emit(sub, p.title || sub.title || 'block', modules, seen);
          const conns = part.pins.map((q) => '.' + ident(q.name) + '(' + (part.net[q.name] ? netName.get(part.net[q.name]) : '') + ')');
          body.push('  ' + sm + ' ' + id + ' (' + conns.join(', ') + ');');
          break;
        }
        default:
          notes.push('the part ' + part.id + ' (' + t + ') has no Verilog form here');
      }
    }
    for (const pt of ports) {
      if (pt.dir !== 'output') continue;
      const p = pt.part;
      if (pt.segs) body.push('  assign ' + pt.name + ' = {' + pt.segs.slice().reverse().map((s) => at(p, s)).join(', ') + '};');
      else { const pin = p.pins[0].name; body.push('  assign ' + pt.name + ' = ' + at(p, pin, pt.w) + ';'); }
    }
    const head = 'module ' + mname + ' (' + ports.map((p) => '\n  ' + p.dir + ' ' + (p.dir === 'output' ? 'wire ' : '') + rng(p.w) + p.name).join(',') + (ports.length ? '\n' : '') + ');';
    const text = [head].concat(notes.map((n) => '  // ' + n), decls, body, ['endmodule', '']).join('\n');
    modules.push(text);
    return mname;
  }

  // ---- VCD ---------------------------------------------------------------------------------------------------------------
  const idCode = (i) => { let s = ''; do { s += String.fromCharCode(33 + (i % 94)); i = Math.floor(i / 94); } while (i > 0); return s; };
  function vcdText(sigs, timescale, endTime, toggles) {
    // sigs: [{ path: [scopes..., name], width, changes: [[tick, bits]], kind: 'reg' | 'wire' | ... }];
    // toggles: [{t, on}], the times of $dumpoff (every signal x) and $dumpon (every signal's value)
    const lines = ['$date Sirkit $end', '$version Sirkit $end', '$timescale ' + timescale + ' $end'];
    const tree = { kids: new Map(), vars: [] };
    sigs.forEach((s, i) => {
      s.code = idCode(i);
      let node = tree;
      for (const sc of s.path.slice(0, -1)) { if (!node.kids.has(sc)) node.kids.set(sc, { kids: new Map(), vars: [] }); node = node.kids.get(sc); }
      node.vars.push(s);
    });
    const walk = (node, name) => {
      if (name !== null) lines.push('$scope module ' + name + ' $end');
      for (const v of node.vars) lines.push('$var ' + (v.kind || 'wire') + ' ' + v.width + ' ' + v.code + ' ' + v.path[v.path.length - 1] + (v.width > 1 ? ' [' + (v.width - 1) + ':0]' : '') + ' $end');
      for (const [k, kid] of node.kids) walk(kid, k);
      if (name !== null) lines.push('$upscope $end');
    };
    if (tree.vars.length) walk({ kids: new Map([['top', tree]]), vars: [] }, null); else walk(tree, null);
    lines.push('$enddefinitions $end');
    const fmt = (s, bits) => (s.width === 1 ? bits + s.code : 'b' + (bits.replace(/^0+(?=[01])/, '') || '0') + ' ' + s.code);
    const times = new Map();
    for (const s of sigs) for (const [t, b] of s.changes) { if (!times.has(t)) times.set(t, []); times.get(t).push(fmt(s, b)); }
    const tog = new Map();
    for (const g of toggles || []) tog.set(g.t, g.on);
    for (const t of tog.keys()) if (!times.has(t)) times.set(t, []);
    const ts = [...times.keys()].sort((a, b) => a - b);
    const valueAt = (s, t) => { let v = 'x'.repeat(s.width); for (const [ct, b] of s.changes) { if (ct <= t) v = b; else break; } return v; };
    for (const t of ts) {
      lines.push('#' + t);
      if (t === ts[0] && !tog.has(t)) { lines.push('$dumpvars'); lines.push(...times.get(t)); lines.push('$end'); }
      else if (tog.has(t)) {
        // a whole block: every signal x when the dump stops, every signal's value when it starts again
        const on = tog.get(t);
        lines.push(on ? '$dumpon' : '$dumpoff');
        for (const s of sigs) lines.push(fmt(s, on ? valueAt(s, t) : 'x'.repeat(s.width)));
        lines.push('$end');
      } else lines.push(...times.get(t));
    }
    if (endTime != null && (!ts.length || endTime > ts[ts.length - 1])) lines.push('#' + endTime);
    return lines.join('\n') + '\n';
  }
  /** bits (MSB first) of a Sim-style value */
  function bitsOf(v, w) {
    if (Array.isArray(v)) { let s = ''; for (let i = w - 1; i >= 0; i--) { const b = i < v.length ? v[i] : 0; s += b === 'X' || b === 'x' ? 'x' : b === 'Z' || b === 'z' ? 'z' : b ? '1' : '0'; } return s; }
    if (v === 'X' || v === 'x' || v == null) return 'x'.repeat(w);
    if (v === 'Z' || v === 'z') return 'z'.repeat(w);
    if (typeof v === 'string') return v.toLowerCase().padStart(w, '0').slice(-w);
    if (typeof v === 'bigint') return v.toString(2).padStart(w, '0').slice(-w);
    return (Number(v) >>> 0).toString(2).padStart(w, '0').slice(-w);
  }
  const widthOf = (v) => (Array.isArray(v) ? v.length : typeof v === 'string' && v.length > 1 ? v.length : typeof v === 'number' && v > 1 ? Math.floor(Math.log2(v)) + 1 : typeof v === 'bigint' ? v.toString(2).length : 1);
  /**
   * a VCD file from waves (a Map name -> [[t ns, value]], as Sirkit.Sim and simulate() give), or from a
   * Verilog simulation result. opts.widths (Map or object) gives bus widths; otherwise they are read from the values.
   */
  function vcd(waves, opts) {
    opts = opts || {};
    if (waves && waves.world && typeof waves.vcd === 'function') { const t = waves.vcd(); if (t) return t; waves = waves.waves; }
    if (waves && waves.waves instanceof Map) waves = waves.waves;
    const widths = opts.widths instanceof Map ? opts.widths : new Map(Object.entries(opts.widths || {}));
    // a time unit fine enough for every change
    let unit = 1;
    const all = [...waves.values()].flatMap((a) => a.map((e) => e[0]));
    for (const u of [1, 1e3, 1e6]) { unit = u; if (all.every((t) => Math.abs(t * u - Math.round(t * u)) < 1e-6)) break; }
    const ts = unit === 1 ? '1ns' : unit === 1e3 ? '1ps' : '1fs';
    const sigs = [];
    for (const [name, arr] of waves) {
      const w = widths.get(name) || Math.max(1, ...arr.map((e) => widthOf(e[1])));
      const changes = [];
      for (const [t, v] of arr) { const tick = Math.round(t * unit), b = bitsOf(v, w); const l = changes[changes.length - 1]; if (l && l[0] === tick) l[1] = b; else if (!l || l[1] !== b) changes.push([tick, b]); }
      sigs.push({ path: String(name).split('.'), width: w, changes });
    }
    return vcdText(sigs, ts, opts.end != null ? Math.round(opts.end * unit) : null);
  }
  V.vcd = vcd;
  /** the VCD of what $dumpvars selected in a Verilog run */
  V.vcdFromDump = (dumped, W, K, opts) => {
    // with no `timescale anywhere a time unit is 1 ns, as everywhere else in the API
    const P = W.P, units = ['s', 'ms', 'us', 'ns', 'ps', 'fs'], k = Math.ceil(-P / 3);
    const ts = opts && opts.timed === false ? '1ns' : Math.pow(10, P + 3 * k) + units[k];
    const kinds = dumped.kinds || {};
    const sigs = Object.entries(dumped).map(([name, list]) => ({ path: name.split('.'), width: list.length ? list[0][1].length : 1, changes: list, kind: kinds[name] || 'wire' }));
    return vcdText(sigs, ts, K.now, dumped.toggles);
  };
})(globalThis.Sirkit = globalThis.Sirkit || {});
