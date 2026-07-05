// Verilog lexer with the preprocessor folded in: `define (with arguments), `undef, `ifdef/`ifndef/`elsif/
// `else/`endif, `include from a map of virtual files, `timescale and `default_nettype (passed on to the
// parser as directive tokens). Every token keeps its file, line and column.
(function (S) {
  'use strict';
  const V = S.Verilog = S.Verilog || {};

  const KEYWORDS = new Set(('always and assign automatic begin buf bufif0 bufif1 case casex casez cell cmos config deassign default ' +
    'defparam design disable edge else end endcase endconfig endfunction endgenerate endmodule endprimitive endspecify endtable ' +
    'endtask event for force forever fork function generate genvar highz0 highz1 if ifnone incdir include initial inout input ' +
    'instance integer join large liblist library localparam macromodule medium module nand negedge nmos nor noshowcancelled not ' +
    'notif0 notif1 or output parameter pmos posedge primitive pull0 pull1 pulldown pullup pulsestyle_onevent pulsestyle_ondetect ' +
    'rcmos real realtime reg release repeat rnmos rpmos rtran rtranif0 rtranif1 scalared showcancelled signed small specify ' +
    'specparam strong0 strong1 supply0 supply1 table task time tran tranif0 tranif1 tri tri0 tri1 triand trior trireg unsigned use ' +
    'uwire vectored wait wand weak0 weak1 while wire wor xnor xor').split(' '));
  V.KEYWORDS = KEYWORDS;
  const OPS = ['<<<', '>>>', '===', '!==', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '~&', '~|', '~^', '^~', '**', '+:', '-:', '->', '*)'];
  const UNITS = { s: 0, ms: -3, us: -6, ns: -9, ps: -12, fs: -15 };

  class VError extends Error { constructor(msg, tok) { super(msg); this.line = tok ? tok.line : 0; this.col = tok ? tok.col : 0; this.file = tok && tok.file; } }
  V.VError = VError;

  /** parse a based or plain number literal into {v: Vec, sized, xfill} */
  function makeNumber(size, signed, base, digits, tok) {
    const V2 = S.Verilog;
    digits = digits.replace(/_/g, '').toLowerCase();
    if (!digits) throw new VError('a number needs digits after its base', tok);
    let bitsStr = '';
    if (base === 'd') {
      if (/^[xz?]$/.test(digits)) { bitsStr = digits === 'x' ? 'x' : 'z'; }
      else {
        if (!/^[0-9]+$/.test(digits)) throw new VError('"' + digits + '" is not a decimal number', tok);
        bitsStr = BigInt(digits).toString(2);
      }
    } else {
      const per = base === 'b' ? 1 : base === 'o' ? 3 : 4, radix = base === 'b' ? 2 : base === 'o' ? 8 : 16;
      for (const ch of digits) {
        if (ch === 'x') bitsStr += 'x'.repeat(per);
        else if (ch === 'z' || ch === '?') bitsStr += 'z'.repeat(per);
        else {
          const d = parseInt(ch, radix);
          if (isNaN(d)) throw new VError('"' + ch + '" is not a digit in base ' + radix, tok);
          bitsStr += d.toString(2).padStart(per, '0');
        }
      }
    }
    const sized = size != null;
    let w = sized ? size : Math.max(32, bitsStr.length + (signed && base === 'd' && bitsStr.length >= 32 ? 1 : 0));
    if (sized && w <= 0) throw new VError('a number cannot have size ' + size, tok);
    let v = V2.fromBits(bitsStr);
    const lead = bitsStr[0];
    const xfill = lead === 'x' || lead === 'z';
    if (w > v.w) v = xfill ? V2.fillExt(new V2.Vec(v.w, v.a, v.b, false), w) : V2.resize(v, w, false);
    else v = V2.resize(v, w, false);
    if (signed) v = new V2.Vec(v.w, v.a, v.b, true);
    return { v, sized, xfill: !sized && xfill };
  }
  V.makeNumber = makeNumber;

  /**
   * tokens of a source text, after preprocessing. opts.files maps include names to texts; opts.defines holds
   * predefined macros. Returns { toks, errors }.
   */
  function lex(src, opts) {
    opts = opts || {};
    const files = opts.files || {};
    const defines = Object.assign(Object.create(null), opts.defines || {});
    const toks = [], errors = [];
    const cond = []; // stack of {active, done, parentActive}
    const active = () => cond.every((c) => c.active);
    let depth = 0;

    function run(text, file, at) {
      if (++depth > 40) throw new VError('`include or macros nest too deeply (is a file including itself?)', at);
      let i = 0, line = 1, col = 1;
      const n = text.length;
      const adv = (k) => { for (let j = 0; j < k; j++) { if (text[i] === '\n') { line++; col = 1; } else col++; i++; } };
      const here = () => ({ line: at ? at.line : line, col: at ? at.col : col, file: at ? at.file : file });
      const push = (t) => { if (active()) toks.push(t); };
      const restOfLine = () => {
        let s = '';
        while (i < n && text[i] !== '\n') {
          if (text[i] === '\\' && text[i + 1] === '\n') { s += '\n'; adv(2); continue; }
          if (text[i] === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') adv(1); break; }
          if (text[i] === '/' && text[i + 1] === '*') { adv(2); while (i < n && !(text[i] === '*' && text[i + 1] === '/')) adv(1); adv(2); continue; }
          s += text[i]; adv(1);
        }
        return s;
      };
      const skipWs = () => { while (i < n && (text[i] === ' ' || text[i] === '\t' || text[i] === '\r')) adv(1); };
      const ident = () => { const m = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(text.slice(i, i + 256)); if (!m) return null; adv(m[0].length); return m[0]; };

      while (i < n) {
        const c = text[i];
        if (c === '\n' || c === ' ' || c === '\t' || c === '\r' || c === '\f') { adv(1); continue; }
        if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') adv(1); continue; }
        if (c === '/' && text[i + 1] === '*') {
          const st = here(); adv(2);
          while (i < n && !(text[i] === '*' && text[i + 1] === '/')) adv(1);
          if (i >= n) { errors.push(Object.assign(st, { msg: 'this /* comment is never closed with */' })); break; }
          adv(2); continue;
        }
        const pos = here();
        if (c === '`') {
          adv(1);
          const name = ident();
          if (!name) { errors.push(Object.assign(pos, { msg: 'a ` must be followed by a directive or macro name' })); continue; }
          try { directive(name, pos); } catch (e) { if (e instanceof VError) errors.push({ line: e.line || pos.line, col: e.col || pos.col, file: pos.file, msg: e.message }); else throw e; }
          continue;
        }
        if (!active()) {
          // skip quickly, but strings may contain `
          if (c === '"') { adv(1); while (i < n && text[i] !== '"' && text[i] !== '\n') { if (text[i] === '\\') adv(1); adv(1); } adv(1); } else adv(1);
          continue;
        }
        if (/[A-Za-z_]/.test(c)) {
          const m = ident();
          push({ t: KEYWORDS.has(m) ? 'kw' : 'id', v: m, line: pos.line, col: pos.col, file: pos.file });
          if (m === 'table') {
            // UDP table rows are read as raw text: 01 and (01) are not numbers there
            const k = text.indexOf('endtable', i), st = here();
            const raw = text.slice(i, k < 0 ? n : k);
            adv(raw.length);
            push({ t: 'table', v: raw, line: st.line, col: st.col, file: st.file });
          }
          continue;
        }
        if (c === '\\') {
          adv(1); let s = '';
          while (i < n && !/\s/.test(text[i])) { s += text[i]; adv(1); }
          push({ t: 'id', v: s, line: pos.line, col: pos.col, file: pos.file, escaped: true });
          continue;
        }
        if (c === '$') {
          adv(1); const m = /^[A-Za-z0-9_$]+/.exec(text.slice(i, i + 64));
          if (!m) { errors.push(Object.assign(pos, { msg: 'a $ must start a system task name such as $display' })); continue; }
          adv(m[0].length);
          push({ t: 'sys', v: '$' + m[0], line: pos.line, col: pos.col, file: pos.file });
          continue;
        }
        if (c === '"') {
          adv(1); let s = '';
          while (i < n && text[i] !== '"') {
            if (text[i] === '\n') break;
            if (text[i] === '\\') {
              const e = text[i + 1];
              if (e === 'n') s += '\n'; else if (e === 't') s += '\t'; else if (e === '\\') s += '\\'; else if (e === '"') s += '"';
              else if (/[0-7]/.test(e)) { const m = /^[0-7]{1,3}/.exec(text.slice(i + 1, i + 4)); s += String.fromCharCode(parseInt(m[0], 8) & 255); adv(m[0].length + 1); continue; }
              else s += e;
              adv(2); continue;
            }
            s += text[i]; adv(1);
          }
          if (text[i] !== '"') { errors.push(Object.assign(pos, { msg: 'this string has no closing " on the same line' })); continue; }
          adv(1);
          push({ t: 'str', v: s, line: pos.line, col: pos.col, file: pos.file });
          continue;
        }
        if (/[0-9]/.test(c) || (c === "'" && /[sSbBoOdDhH]/.test(text[i + 1] || ''))) {
          try { number(pos); } catch (e) { if (e instanceof VError) errors.push({ line: pos.line, col: pos.col, file: pos.file, msg: e.message }); else throw e; }
          continue;
        }
        if (c === '(' && text[i + 1] === '*') {
          // an attribute (* ... *) is skipped; @(*) is an event control
          let j = i + 2; while (j < n && /\s/.test(text[j])) j++;
          if (text[j] !== ')') { adv(2); while (i < n && !(text[i] === '*' && text[i + 1] === ')')) adv(1); adv(2); continue; }
        }
        let op = OPS.find((o) => text.startsWith(o, i));
        if (!op) op = c;
        if (!'+-*/%<>=!&|^~?:;,.()[]{}#@'.includes(op[0])) { errors.push(Object.assign(pos, { msg: 'the character "' + c + '" does not belong in Verilog here' })); adv(1); continue; }
        adv(op.length);
        push({ t: 'op', v: op, line: pos.line, col: pos.col, file: pos.file });
      }
      depth--;

      function number(pos) {
        let size = null;
        if (c0() !== "'") {
          const m = /^[0-9][0-9_]*/.exec(text.slice(i, i + 200));
          adv(m[0].length);
          // a real?
          if (text[i] === '.' && /[0-9]/.test(text[i + 1] || '')) {
            const r = /^\.[0-9_]+([eE][+-]?[0-9_]+)?/.exec(text.slice(i, i + 200));
            adv(r[0].length);
            push({ t: 'real', v: parseFloat((m[0] + r[0]).replace(/_/g, '')), line: pos.line, col: pos.col, file: pos.file });
            return;
          }
          if (/[eE]/.test(text[i] || '') && /^[eE][+-]?[0-9]/.test(text.slice(i, i + 3))) {
            const r = /^[eE][+-]?[0-9_]+/.exec(text.slice(i, i + 200)); adv(r[0].length);
            push({ t: 'real', v: parseFloat((m[0] + r[0]).replace(/_/g, '')), line: pos.line, col: pos.col, file: pos.file });
            return;
          }
          // size followed (perhaps after spaces) by a base
          let j = i; while (j < n && (text[j] === ' ' || text[j] === '\t')) j++;
          if (text[j] === "'" && /[sSbBoOdDhH]/.test(text[j + 1] || '')) { size = parseInt(m[0].replace(/_/g, ''), 10); adv(j - i); }
          else {
            const v = makeNumber(null, true, 'd', m[0], pos);
            push({ t: 'num', v: v.v, sized: false, plain: true, line: pos.line, col: pos.col, file: pos.file });
            return;
          }
        }
        adv(1); // the '
        let signed = false;
        if (/[sS]/.test(text[i])) { signed = true; adv(1); }
        const base = text[i].toLowerCase(); adv(1);
        skipWs();
        const m = /^[0-9a-fA-FxXzZ?_]+/.exec(text.slice(i, i + 100000));
        if (!m) throw new VError(/[A-Za-z]/.test(text[i] || '') ? '"' + text[i] + '" is not a digit in base ' + ({ b: 2, o: 8, d: 10, h: 16 }[base]) : "missing digits after the base '" + base, pos);
        adv(m[0].length);
        const v = makeNumber(size, signed, base, m[0], pos);
        // a size written apart from its base (8 'hff, or `WIDTH'd3 after a macro)
        const prev = toks[toks.length - 1];
        if (size == null && prev && prev.t === 'num' && prev.plain && active() && !prev.v.b) {
          toks.pop();
          const w = Number(prev.v.a);
          if (w <= 0) throw new VError('a number cannot have size ' + w, pos);
          const v2 = makeNumber(w, signed, base, m[0], pos);
          push({ t: 'num', v: v2.v, sized: true, line: prev.line, col: prev.col, file: prev.file });
          return;
        }
        push({ t: 'num', v: v.v, sized: size != null, xfill: v.xfill, line: pos.line, col: pos.col, file: pos.file });
      }
      function c0() { return text[i]; }

      function directive(name, pos) {
        switch (name) {
          case 'ifdef': case 'ifndef': {
            skipWs(); const m = ident();
            if (!m) throw new VError('`' + name + ' needs a macro name', pos);
            const has = m in defines, on = name === 'ifdef' ? has : !has;
            cond.push({ active: on, done: on });
            return;
          }
          case 'elsif': {
            skipWs(); const m = ident();
            const top = cond[cond.length - 1];
            if (!top) throw new VError('`elsif without `ifdef', pos);
            if (top.done) top.active = false; else { top.active = m in defines; top.done = top.active; }
            return;
          }
          case 'else': {
            const top = cond[cond.length - 1];
            if (!top) throw new VError('`else without `ifdef', pos);
            top.active = !top.done; top.done = true;
            return;
          }
          case 'endif':
            if (!cond.length) throw new VError('`endif without `ifdef', pos);
            cond.pop(); return;
        }
        if (!active()) { if (name === 'define') restOfLine(); return; }
        switch (name) {
          case 'define': {
            skipWs(); const m = ident();
            if (!m) throw new VError('`define needs a macro name', pos);
            let args = null;
            if (text[i] === '(') {
              adv(1); args = [];
              let s = '';
              while (i < n && text[i] !== ')') { s += text[i]; adv(1); }
              adv(1);
              args = s.split(',').map((a) => a.trim()).filter(Boolean).map((a) => { const [nm, def] = a.split('='); return { name: nm.trim(), def: def != null ? def.trim() : null }; });
            }
            defines[m] = { args, body: restOfLine().trim() };
            return;
          }
          case 'undef': { skipWs(); const m = ident(); delete defines[m]; return; }
          case 'include': {
            skipWs();
            let fname;
            if (text[i] === '"') { adv(1); fname = ''; while (i < n && text[i] !== '"' && text[i] !== '\n') { fname += text[i]; adv(1); } adv(1); }
            else if (text[i] === '<') { adv(1); fname = ''; while (i < n && text[i] !== '>') { fname += text[i]; adv(1); } adv(1); }
            else throw new VError('`include needs a file name in quotes', pos);
            const base = fname.split('/').pop();
            const body = files[fname] != null ? files[fname] : files[base];
            if (body == null) throw new VError('cannot find the file "' + fname + '" to include; add a buffer with that name', pos);
            run(String(body), fname, null);
            return;
          }
          case 'timescale': {
            const s = restOfLine().trim();
            const m = /^(1|10|100)\s*(s|ms|us|ns|ps|fs)\s*\/\s*(1|10|100)\s*(s|ms|us|ns|ps|fs)$/.exec(s);
            if (!m) throw new VError('`timescale needs the form 1ns/1ps (1, 10 or 100 and s ms us ns ps fs)', pos);
            const unit = Math.log10(+m[1]) + UNITS[m[2]], prec = Math.log10(+m[3]) + UNITS[m[4]];
            if (prec > unit) throw new VError('in `timescale the precision ' + m[3] + m[4] + ' must not be coarser than the unit ' + m[1] + m[2], pos);
            toks.push({ t: 'dir', v: 'timescale', unit, prec, line: pos.line, col: pos.col, file: pos.file });
            return;
          }
          case 'default_nettype': {
            skipWs(); const m = ident();
            toks.push({ t: 'dir', v: 'default_nettype', net: m, line: pos.line, col: pos.col, file: pos.file });
            return;
          }
          case 'resetall':
            toks.push({ t: 'dir', v: 'resetall', line: pos.line, col: pos.col, file: pos.file });
            return;
          case 'celldefine': case 'endcelldefine': case 'nounconnected_drive': case 'line': case 'pragma':
            if (name === 'line' || name === 'pragma') restOfLine();
            return;
          case 'unconnected_drive': skipWs(); ident(); return;
          case '__FILE__': toks.push({ t: 'str', v: file || 'source', line: pos.line, col: pos.col, file: pos.file }); return;
          case '__LINE__': toks.push({ t: 'num', v: S.Verilog.fromInt(pos.line, 32, true), sized: false, plain: true, line: pos.line, col: pos.col, file: pos.file }); return;
        }
        const def = defines[name];
        if (!def) throw new VError('`' + name + ' is not defined (define it with `define ' + name + ' ...)', pos);
        let body = def.body;
        if (def.args) {
          // read the actual arguments, balanced on brackets and quotes
          let j = i; while (j < n && /\s/.test(text[j])) j++;
          if (text[j] !== '(') throw new VError('the macro `' + name + ' needs arguments in ( )', pos);
          adv(j - i + 1);
          const actual = []; let cur = '', lvl = 0;
          while (i < n) {
            const ch = text[i];
            if (ch === '"') { cur += ch; adv(1); while (i < n && text[i] !== '"') { cur += text[i]; adv(1); } cur += '"'; adv(1); continue; }
            if ((ch === ',' || ch === ')') && lvl === 0) { actual.push(cur.trim()); adv(1); cur = ''; if (ch === ')') break; continue; }
            if ('([{'.includes(ch)) lvl++; if (')]}'.includes(ch)) lvl--;
            cur += ch; adv(1);
          }
          if (actual.length === 1 && actual[0] === '' && def.args.length === 0) actual.length = 0;
          if (actual.length > def.args.length) throw new VError('the macro `' + name + ' takes ' + def.args.length + ' arguments, not ' + actual.length, pos);
          const map = {};
          def.args.forEach((a, k) => { const v = actual[k] != null && actual[k] !== '' ? actual[k] : a.def; if (v == null) throw new VError('the macro `' + name + ' is missing its argument ' + a.name, pos); map[a.name] = v; });
          body = body.replace(/"(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_$]*/g, (w) => (w[0] !== '"' && Object.prototype.hasOwnProperty.call(map, w) ? map[w] : w));
        }
        body = body.replace(/``/g, '');
        run(body, file, at || pos);
      }
    }
    try { run(String(src), opts.file || null, null); } catch (e) { if (e instanceof VError) errors.push({ line: e.line, col: e.col, msg: e.message }); else throw e; }
    if (cond.length) errors.push({ line: 0, col: 0, msg: 'an `ifdef has no matching `endif' });
    return { toks, errors, defines };
  }
  V.lex = lex;
})(globalThis.Sirkit = globalThis.Sirkit || {});
