// Verilog-2005 parser: tokens to a syntax tree of modules and primitives. Errors carry a line and column and
// say what to change in plain words; after an error the parser skips to the next endmodule and goes on.
(function (S) {
  'use strict';
  const V = S.Verilog = S.Verilog || {};

  const GATES = new Set(['and', 'nand', 'or', 'nor', 'xor', 'xnor', 'buf', 'not', 'bufif0', 'bufif1', 'notif0', 'notif1', 'pullup', 'pulldown',
    'nmos', 'pmos', 'rnmos', 'rpmos', 'cmos', 'rcmos', 'tran', 'rtran', 'tranif0', 'tranif1', 'rtranif0', 'rtranif1']);
  const NETS = new Set(['wire', 'tri', 'wand', 'wor', 'triand', 'trior', 'supply0', 'supply1', 'tri0', 'tri1', 'trireg', 'uwire']);
  const VARS = new Set(['reg', 'integer', 'time', 'real', 'realtime', 'event']);
  const DIRS = new Set(['input', 'output', 'inout']);
  const STRENGTH = new Set(['supply0', 'supply1', 'strong0', 'strong1', 'pull0', 'pull1', 'weak0', 'weak1', 'highz0', 'highz1', 'small', 'medium', 'large']);
  const BIN = {
    '**': 12, '*': 11, '/': 11, '%': 11, '+': 10, '-': 10, '<<': 9, '>>': 9, '<<<': 9, '>>>': 9,
    '<': 8, '<=': 8, '>': 8, '>=': 8, '==': 7, '!=': 7, '===': 7, '!==': 7, '&': 6, '^': 5, '^~': 5, '~^': 5, '|': 4, '&&': 3, '||': 2,
  };
  V.GATE_TYPES = GATES;
  const VError = () => V.VError;

  function parse(toks, opts) {
    opts = opts || {};
    let k = 0;
    const modules = [], udps = [], errors = [];
    let timescale = null, nettype = 'wire';
    const EOF = { t: 'eof', v: '<end of file>', line: toks.length ? toks[toks.length - 1].line : 1, col: toks.length ? toks[toks.length - 1].col + 1 : 1 };
    const peek = (o) => toks[k + (o || 0)] || EOF;
    const next = () => toks[k++] || EOF;
    const is = (v, o) => { const t = peek(o); return (t.t === 'op' || t.t === 'kw') && t.v === v; };
    const accept = (v) => (is(v) ? next() : null);
    const fail = (msg, t) => { throw new (VError())(msg, t || peek()); };
    const show = (t) => (t.t === 'eof' ? 'the end of the file' : t.t === 'str' ? 'a string' : t.t === 'num' || t.t === 'real' ? 'a number' : '"' + t.v + '"');
    const prevTok = () => toks[k - 1] || peek();
    function expect(v, what) {
      if (is(v)) return next();
      const t = peek(), p = prevTok();
      if (v === ';') {
        if (t.line > p.line) fail("missing ';' at the end of line " + p.line, { line: p.line, col: p.col + String(p.v).length });
        fail("expected ';' before " + show(t) + (what ? ' ' + what : ''), t);
      }
      fail('expected "' + v + '"' + (what ? ' ' + what : '') + ' but found ' + show(t), t);
    }
    function ident(what) {
      const t = peek();
      if (t.t === 'id') return next();
      if (t.t === 'kw') fail('"' + t.v + '" is a reserved word and cannot be used as ' + (what || 'a name'), t);
      fail('expected ' + (what || 'a name') + ' but found ' + show(t), t);
    }
    const at = (t, o) => Object.assign(o, { line: t.line, col: t.col });

    // ---- expressions --------------------------------------------------------------------------------------------
    function expr() {
      const c = binary(1);
      if (is('?')) {
        const t = next();
        const a = expr();
        expect(':', 'in a ? : conditional');
        const b = expr();
        return at(t, { k: 'cond', c, a, b });
      }
      return c;
    }
    function binary(minPrec) {
      let left = unary();
      for (;;) {
        const t = peek();
        if (t.t !== 'op') break;
        const p = BIN[t.v];
        if (!p || p < minPrec) break;
        next();
        const right = binary(p + 1);
        left = at(t, { k: 'bin', op: t.v, a: left, b: right });
      }
      return left;
    }
    const UNARY = new Set(['+', '-', '!', '~', '&', '~&', '|', '~|', '^', '~^', '^~']);
    function unary() {
      const t = peek();
      if (t.t === 'op' && UNARY.has(t.v)) { next(); return at(t, { k: 'un', op: t.v, a: unary() }); }
      return primary();
    }
    function mintypmax() {
      const e = expr();
      if (accept(':')) { const typ = expr(); expect(':', 'in a min:typ:max delay'); expr(); return typ; }
      return e;
    }
    function primary() {
      const t = peek();
      if (t.t === 'num') { next(); return at(t, { k: 'num', v: t.v, sized: t.sized, xfill: t.xfill, plain: t.plain }); }
      if (t.t === 'real') { next(); return at(t, { k: 'real', v: t.v }); }
      if (t.t === 'str') { next(); return at(t, { k: 'str', s: t.v }); }
      if (t.t === 'sys') {
        next();
        const args = [];
        if (accept('(')) {
          if (!is(')')) do { if (is(',') || is(')')) args.push(null); else args.push(expr()); } while (accept(','));
          expect(')', 'after the arguments of ' + t.v);
        }
        return at(t, { k: 'call', name: t.v, sys: true, args });
      }
      if (is('(')) { next(); const e = mintypmax(); expect(')', 'to close the bracket'); return Object.assign(e, { paren: true }); }
      if (is('{')) {
        next();
        const first = expr();
        if (is('{')) {
          // replication {n{...}}
          next();
          const parts = [expr()];
          while (accept(',')) parts.push(expr());
          expect('}', 'to close the replication');
          expect('}', 'to close the replication');
          return selects(at(t, { k: 'repl', n: first, parts }));
        }
        const parts = [first];
        while (accept(',')) parts.push(expr());
        expect('}', 'to close the concatenation');
        return selects(at(t, { k: 'concat', parts }));
      }
      if (t.t === 'id') {
        const name = hierName();
        if (is('(') && name.k === 'id') {
          next();
          const args = [];
          if (!is(')')) do args.push(expr()); while (accept(','));
          expect(')', 'after the arguments of ' + name.name);
          return at(t, { k: 'call', name: name.name, args, sys: false });
        }
        return selects(name);
      }
      if (t.t === 'kw') fail('"' + t.v + '" cannot start an expression' + (t.v === 'begin' || t.v === 'end' ? ' (check the begin/end pairs above)' : ''), t);
      if (t.t === 'eof') fail('the file ends in the middle of an expression', t);
      if (t.t === 'op' && t.v === ';') fail('an expression is missing before ";"', t);
      fail('expected a value but found ' + show(t), t);
    }
    /** a name, perhaps hierarchical: a, top.u1.q, gen[2].x */
    function hierName() {
      const t = next();
      const parts = [{ name: t.v, idx: null }];
      while (is('.') && peek(1).t === 'id') { next(); parts.push({ name: next().v, idx: null }); }
      // gen[i].x : an index followed by a dot belongs to the name
      while (is('[')) {
        const save = k;
        next();
        let e;
        try { e = expr(); } catch (er) { k = save; break; }
        if (accept(']') && is('.') && peek(1).t === 'id') {
          parts[parts.length - 1].idx = e;
          next(); parts.push({ name: next().v, idx: null });
          while (is('.') && peek(1).t === 'id') { next(); parts.push({ name: next().v, idx: null }); }
        } else { k = save; break; }
      }
      if (parts.length === 1) return at(t, { k: 'id', name: t.v });
      return at(t, { k: 'id', name: parts.map((p) => p.name).join('.'), path: parts });
    }
    function selects(base) {
      while (is('[')) {
        const t = next();
        const a = expr();
        if (accept(':')) { const b = expr(); expect(']', 'to close the part-select'); base = at(t, { k: 'range', base, msb: a, lsb: b }); }
        else if (is('+:') || is('-:')) { const d = next().v[0]; const b = expr(); expect(']', 'to close the part-select'); base = at(t, { k: 'ipart', base, start: a, width: b, dir: d }); }
        else { expect(']', 'to close the index'); base = at(t, { k: 'index', base, index: a }); }
      }
      return base;
    }
    function lvalue() {
      const t = peek();
      if (is('{')) {
        next();
        const parts = [lvalue()];
        while (accept(',')) parts.push(lvalue());
        expect('}', 'to close the concatenation');
        return at(t, { k: 'concat', parts });
      }
      if (t.t !== 'id') {
        if (t.t === 'kw') fail('"' + t.v + '" cannot start a statement here' + (t.v === 'else' ? ' (this else has no matching if; check for a stray ";" or a missing begin/end)' : ''), t);
        fail('expected a name to assign to but found ' + show(t), t);
      }
      return selects(hierName());
    }

    // ---- delays and events ----------------------------------------------------------------------------------------
    function delayValue() {
      const t = peek();
      if (t.t === 'num') { next(); return at(t, { k: 'num', v: t.v, sized: t.sized }); }
      if (t.t === 'real') { next(); return at(t, { k: 'real', v: t.v }); }
      if (t.t === 'id') return hierName();
      if (is('(')) { next(); const d = [mintypmax()]; while (accept(',')) d.push(mintypmax()); expect(')', 'to close the delay'); return d.length === 1 ? d[0] : { k: 'delays', list: d, line: t.line, col: t.col }; }
      fail('expected a delay after # but found ' + show(t), t);
    }
    function delay3() { if (!accept('#')) return null; const d = delayValue(); return d.k === 'delays' ? d.list : [d]; }
    function eventControl() {
      const t = next(); // @
      if (accept('*')) return at(t, { k: 'star' });
      if (is('(') && peek(1).t === 'op' && peek(1).v === '*' && peek(2).v === ')') { next(); next(); next(); return at(t, { k: 'star' }); }
      if (is('(') && peek(1).t === 'op' && peek(1).v === '*)') { next(); next(); return at(t, { k: 'star' }); }
      if (peek().t === 'id') return at(t, { k: 'events', list: [{ edge: null, expr: hierName() }] });
      expect('(', 'after @');
      const list = [];
      do {
        let edge = null;
        if (is('posedge') || is('negedge') || is('edge')) edge = next().v;
        list.push({ edge, expr: expr() });
      } while (accept('or') || accept(','));
      expect(')', 'to close the event list');
      return at(t, { k: 'events', list });
    }

    // ---- statements -------------------------------------------------------------------------------------------------
    function stmtOrNull() { if (is(';')) { const t = next(); return at(t, { k: 'null' }); } return stmt(); }
    function stmt() {
      const t = peek();
      if (t.t === 'kw') {
        switch (t.v) {
          case 'begin': case 'fork': return block();
          case 'if': {
            next(); expect('(', 'after if');
            const c = expr();
            if (is('=')) fail('use == to compare; a single = assigns', peek());
            expect(')', 'to close the if condition');
            const th = stmtOrNull();
            let el = null;
            if (accept('else')) el = stmtOrNull();
            return at(t, { k: 'if', cond: c, then: th, else: el });
          }
          case 'case': case 'casez': case 'casex': {
            next(); expect('(', 'after ' + t.v);
            const e = expr(); expect(')', 'to close the ' + t.v + ' expression');
            const arms = [];
            while (!is('endcase')) {
              if (peek().t === 'eof' || is('endmodule') || is('end') || is('join')) fail('the ' + t.v + ' at line ' + t.line + ' has no endcase', peek().t === 'eof' ? t : peek());
              if (accept('default')) { accept(':'); arms.push({ exprs: null, stmt: stmtOrNull() }); continue; }
              const exprs = [expr()];
              while (accept(',')) exprs.push(expr());
              expect(':', 'after the case item');
              arms.push({ exprs, stmt: stmtOrNull() });
            }
            next();
            return at(t, { k: 'case', type: t.v, expr: e, arms });
          }
          case 'for': {
            next(); expect('(', 'after for');
            const init = assignment(true); expect(';', 'after the for loop start');
            const cond = expr(); expect(';', 'after the for loop condition');
            const step = assignment(true); expect(')', 'to close the for header');
            return at(t, { k: 'for', init, cond, step, body: stmtOrNull() });
          }
          case 'while': { next(); expect('(', 'after while'); const c = expr(); expect(')', 'to close the while condition'); return at(t, { k: 'while', cond: c, body: stmtOrNull() }); }
          case 'repeat': { next(); expect('(', 'after repeat'); const c = expr(); expect(')', 'to close the repeat count'); return at(t, { k: 'repeat', count: c, body: stmtOrNull() }); }
          case 'forever': next(); return at(t, { k: 'forever', body: stmtOrNull() });
          case 'wait': { next(); expect('(', 'after wait'); const c = expr(); expect(')', 'to close the wait condition'); return at(t, { k: 'wait', cond: c, stmt: stmtOrNull() }); }
          case 'disable': { next(); const n = hierName(); expect(';', 'after disable'); return at(t, { k: 'disable', target: n }); }
          case 'assign': case 'force': { next(); const a = assignment(true); expect(';'); return at(t, { k: t.v === 'assign' ? 'passign' : 'force', lhs: a.lhs, rhs: a.rhs }); }
          case 'deassign': case 'release': { next(); const l = lvalue(); expect(';'); return at(t, { k: t.v, lhs: l }); }
          case 'end': fail('"end" without a matching "begin"', t); break;
          case 'else': fail('this else has no matching if (check for a stray ";" after the if, or a missing begin/end)', t); break;
          case 'endmodule': fail('a statement is missing before endmodule (check the begin/end pairs)', t); break;
        }
        if (/^(always|initial|assign|module|wire|reg|integer|input|output)$/.test(t.v)) fail('"' + t.v + '" cannot appear inside a block of statements (is an "end" missing above?)', t);
        fail('"' + t.v + '" cannot start a statement', t);
      }
      if (is('#')) { next(); const d = delayValue(); return at(t, { k: 'delay', d, stmt: stmtOrNull() }); }
      if (is('@')) { const ev = eventControl(); return at(t, { k: 'event', ev, stmt: stmtOrNull() }); }
      if (is('->')) { next(); const n = hierName(); expect(';', 'after the event trigger'); return at(t, { k: 'trigger', target: n }); }
      if (t.t === 'sys') {
        next();
        const args = [];
        if (accept('(')) {
          if (!is(')')) do { if (is(',') || is(')')) args.push(null); else args.push(expr()); } while (accept(','));
          expect(')', 'after the arguments of ' + t.v);
        }
        expect(';', 'after ' + t.v + '(...)');
        return at(t, { k: 'call', name: t.v, args, sys: true });
      }
      if (t.t === 'id' || is('{')) {
        // assignment or task call
        if (t.t === 'id') {
          const save = k;
          const n = hierName();
          if (is('(') || is(';')) {
            const args = [];
            if (accept('(')) { if (!is(')')) do args.push(expr()); while (accept(',')); expect(')', 'after the task arguments'); }
            expect(';', 'after the task call');
            return at(t, { k: 'call', name: n.name, args, sys: false });
          }
          k = save;
        }
        const a = assignment(false);
        expect(';', 'after the assignment');
        return a;
      }
      if (t.t === 'eof') fail('the file ends inside a block (a matching "end" or "endmodule" is missing)', t);
      fail('expected a statement but found ' + show(t), t);
    }
    function assignment(plainOnly) {
      const t = peek();
      const lhs = lvalue();
      let nb = false;
      if (is('<=') && !plainOnly) { next(); nb = true; }
      else if (is('=')) next();
      else if (is('==')) fail('use = to assign; == compares', peek());
      else if ((is('+') && peek(1).v === '+') || (is('-') && peek(1).v === '-') || is('+=') || (is('+') && peek(1).v === '=')) fail(lhs.name + peek().v + peek(1).v + ' is not Verilog-2005; write ' + lhs.name + ' = ' + lhs.name + ' ' + peek().v + ' 1', peek());
      else fail('expected = or <= after ' + (lhs.name || 'the target') + ' but found ' + show(peek()), peek());
      let ctl = null;
      if (is('#')) { next(); ctl = { k: 'delay', d: delayValue() }; }
      else if (is('@')) ctl = { k: 'event', ev: eventControl() };
      else if (is('repeat')) { next(); expect('('); const c = expr(); expect(')'); ctl = { k: 'event', ev: eventControl(), repeat: c }; }
      const rhs = expr();
      return at(t, { k: nb ? 'nba' : 'ba', lhs, rhs, ctl });
    }
    function block() {
      const t = next();
      const fork = t.v === 'fork';
      let name = null;
      if (accept(':')) name = ident('a block name').v;
      const decls = [], stmts = [];
      while (isDeclStart()) decls.push(...declaration(false));
      const closer = fork ? 'join' : 'end';
      while (!is(closer)) {
        if (peek().t === 'eof' || is('endmodule') || is('endfunction') || is('endtask')) fail('"' + t.v + '" at line ' + t.line + ' has no matching "' + closer + '"', peek().t === 'eof' ? t : peek());
        if (fork ? is('end') : is('join')) fail('"' + peek().v + '" does not match "' + t.v + '" at line ' + t.line, peek());
        stmts.push(stmtOrNull());
      }
      next();
      if (accept(':')) { const n2 = ident('a block name'); if (name && n2.v !== name) fail('the block is named ' + name + ' but its end says ' + n2.v, n2); }
      return at(t, { k: 'block', name, fork, decls, stmts });
    }
    function isDeclStart() {
      const t = peek();
      return t.t === 'kw' && (VARS.has(t.v) || t.v === 'parameter' || t.v === 'localparam' || NETS.has(t.v) || DIRS.has(t.v) || t.v === 'genvar');
    }

    // ---- declarations ---------------------------------------------------------------------------------------------
    function range() {
      const t = expect('[');
      const a = expr();
      expect(':', 'in the range [msb:lsb]');
      const b = expr();
      expect(']', 'to close the range');
      return at(t, { k: 'rng', msb: a, lsb: b });
    }
    function skipStrength() {
      if (is('(') && peek(1).t === 'kw' && STRENGTH.has(peek(1).v)) { next(); while (!is(')')) next(); next(); }
    }
    /** a declaration; in a port list only one direction group is read (ANSI) */
    function declaration(inModule, ansi) {
      const t = peek();
      if (is('parameter') || is('localparam')) return [paramDecl(next().v === 'localparam', ansi)];
      let dir = null, kind = null;
      if (DIRS.has(t.v)) dir = next().v;
      if (peek().t === 'kw' && (NETS.has(peek().v) || VARS.has(peek().v) || peek().v === 'genvar')) kind = next().v;
      skipStrength();
      if (accept('vectored') || accept('scalared')) { /* ignored */ }
      let signed = false;
      if (accept('signed')) signed = true;
      else accept('unsigned');
      let rng = null;
      if (is('[')) rng = range();
      const delay = (kind && NETS.has(kind)) ? delay3() : null;
      const names = [];
      for (;;) {
        const n = ident('a name for the ' + (kind || dir || 'declaration'));
        const item = at(n, { name: n.v, dims: [], init: null });
        while (is('[')) item.dims.push(range());
        if (accept('=')) item.init = expr();
        names.push(item);
        if (ansi) {
          // in an ANSI port list a comma followed by a direction starts a new group
          if (is(',') && !(peek(1).t === 'kw' && (DIRS.has(peek(1).v)))) { next(); continue; }
          break;
        }
        if (!accept(',')) break;
      }
      if (!ansi) expect(';', 'after the declaration of ' + names[names.length - 1].name);
      return [at(t, { k: 'decl', dir, kind, signed, range: rng, delay, names })];
    }
    function paramDecl(local, ansi) {
      const t = prevTok();
      let signed = false, rng = null, type = null;
      if (is('integer') || is('real') || is('realtime') || is('time')) type = next().v;
      if (accept('signed')) signed = true;
      if (is('[')) rng = range();
      const list = [];
      for (;;) {
        const n = ident('a parameter name');
        expect('=', 'after the parameter name ' + n.v + ' (a parameter needs a value)');
        list.push(at(n, { name: n.v, expr: mintypmax() }));
        if (ansi) {
          if (is(',') && peek(1).t === 'id' && peek(2).v === '=') { next(); continue; }
          break;
        }
        if (!accept(',')) break;
      }
      if (!ansi) expect(';', 'after the parameter declaration');
      return at(t, { k: 'param', local, signed, range: rng, type, list });
    }

    // ---- module items ---------------------------------------------------------------------------------------------
    function moduleItems(endWords) {
      const items = [];
      while (!endWords.some((w) => is(w))) {
        if (peek().t === 'eof') fail('the file ends before ' + endWords[0] + ' (is an "end" or "' + endWords[0] + '" missing?)', peek());
        if (is('module') || is('macromodule')) fail('a module cannot be declared inside another; is endmodule missing above?', peek());
        if (is('endmodule') && !endWords.includes('endmodule')) fail('"' + endWords[0] + '" is missing before endmodule (a generate begin has no matching end)', peek());
        if (is('endgenerate') && !endWords.includes('endgenerate')) fail('"' + endWords[0] + '" is missing before endgenerate', peek());
        items.push(...moduleItem());
      }
      return items;
    }
    function moduleItem() {
      const t = peek();
      if (t.t === 'dir') { next(); applyDirective(t); return []; }
      if (accept(';')) return [];
      if (t.t === 'kw') {
        if (DIRS.has(t.v) || NETS.has(t.v) || VARS.has(t.v) || t.v === 'genvar' || t.v === 'parameter' || t.v === 'localparam') return declaration(true);
        switch (t.v) {
          case 'defparam': {
            next(); const list = [];
            do { const n = hierName(); expect('=', 'in defparam'); list.push(at(n, { path: n, expr: mintypmax() })); } while (accept(','));
            expect(';', 'after defparam');
            return [at(t, { k: 'defparam', list })];
          }
          case 'assign': {
            next(); skipStrength();
            const delay = delay3(), list = [];
            do { const l = lvalue(); if (is('<=')) fail('a continuous assign uses =, not <=', peek()); expect('=', 'in the assign'); list.push({ lhs: l, rhs: expr(), line: l.line, col: l.col }); } while (accept(','));
            expect(';', 'after the assign');
            return [at(t, { k: 'assign', delay, list })];
          }
          case 'initial': next(); return [at(t, { k: 'initial', body: stmtOrNull() })];
          case 'always': next(); return [at(t, { k: 'always', body: stmtOrNull() })];
          case 'function': return [funcDecl()];
          case 'task': return [taskDecl()];
          case 'generate': { next(); const items = moduleItems(['endgenerate']); next(); return items; }
          case 'for': return [genFor()];
          case 'if': return [genIf()];
          case 'case': return [genCase()];
          case 'begin': return [genBlock()];
          case 'specify': { while (!is('endspecify') && peek().t !== 'eof') next(); next(); return []; }
          case 'specparam': { while (!is(';')) next(); next(); return []; }
        }
        if (GATES.has(t.v)) return [gateInst()];
        if (t.v === 'endmodule') return [];
        if (/^(if|case|while|repeat|forever|begin|fork)$/.test(t.v)) fail('"' + t.v + '" must be inside an initial or always block', t);
        fail('"' + t.v + '" cannot appear here in a module', t);
      }
      if (t.t === 'id') {
        if (peek(1).v === '=' || peek(1).v === '<=' || (peek(1).v === '[' && !isInstanceAhead())) fail('a statement like "' + t.v + ' = ..." must be inside an initial or always block, or use assign (if it belongs to the block above, wrap that block\'s statements in begin ... end)', t);
        const kw = nearKeyword(t.v);
        if (kw && !(peek(1).t === 'id' && peek(2).v === '(')) fail('"' + t.v + '" is not a keyword; did you mean ' + kw + '?', t);
        return [moduleInst()];
      }
      if (t.t === 'sys') fail(t.v + ' must be called inside an initial or always block', t);
      if (is('#') || is('@')) fail('timing controls like "' + t.v + '" belong inside an initial or always block', t);
      fail('expected a declaration, assign, instance, initial or always but found ' + show(t), t);
    }
    function nearKeyword(w) {
      const words = ['always', 'assign', 'initial', 'module', 'endmodule', 'input', 'output', 'inout', 'wire', 'reg', 'integer', 'parameter', 'localparam', 'begin', 'end', 'generate', 'genvar', 'function', 'task'];
      for (const k of words) if (k !== w && editDistance(k, w.toLowerCase()) <= (k.length > 5 ? 2 : 1)) return k;
      return null;
    }
    function isInstanceAhead() {
      // name [range] name? no: "mod inst [3:0] (...)" has the bracket after the second name
      return false;
    }
    function gateInst() {
      const t = next();
      skipStrength();
      const delay = delay3();
      const insts = [];
      do {
        let name = null, rng = null;
        if (peek().t === 'id') { name = next().v; if (is('[')) rng = range(); }
        const p = expect('(', 'before the connections of the ' + t.v + ' gate');
        const args = [];
        if (!is(')')) do args.push(is(',') ? null : expr()); while (accept(','));
        expect(')', 'to close the gate connections');
        insts.push(at(p, { name, range: rng, args }));
      } while (accept(','));
      expect(';', 'after the ' + t.v + ' gate');
      return at(t, { k: 'gate', type: t.v, delay, insts });
    }
    function moduleInst() {
      const t = next();
      let params = null;
      if (accept('#')) {
        if (!is('(')) { params = { ordered: [delayValue()] }; }
        else {
          next();
          if (is('.')) {
            const named = [];
            do { const d = expect('.'); const n = ident('a parameter name'); expect('('); const e = is(')') ? null : mintypmax(); expect(')'); named.push(at(d, { name: n.v, expr: e })); } while (accept(','));
            params = { named };
          } else {
            const ordered = [];
            do ordered.push(mintypmax()); while (accept(','));
            params = { ordered };
          }
          expect(')', 'to close the parameter list');
        }
      }
      const insts = [];
      do {
        let name = null, rng = null;
        if (peek().t === 'id') { name = next().v; if (is('[')) rng = range(); }
        const p = peek();
        if (!is('(')) {
          if (!name) fail('expected an instance name after ' + t.v, peek());
          fail('expected "(" with the connections of ' + name + ' but found ' + show(peek()), peek());
        }
        next();
        let conns;
        if (is('.')) {
          const named = [];
          do {
            const d = expect('.');
            const n = ident('a port name');
            let e = null, implicit = false;
            if (accept('(')) { if (!is(')')) e = expr(); expect(')', 'to close the connection of port ' + n.v); } else implicit = true;
            named.push(at(d, { port: n.v, expr: implicit ? at(n, { k: 'id', name: n.v }) : e }));
          } while (accept(','));
          conns = { named };
        } else {
          const ordered = [];
          if (!is(')')) do ordered.push(is(',') || is(')') ? null : expr()); while (accept(','));
          conns = { ordered };
        }
        expect(')', 'to close the connections of ' + (name || t.v));
        insts.push(at(p, { name, range: rng, conns }));
      } while (accept(','));
      expect(';', 'after the instance of ' + t.v);
      return at(t, { k: 'inst', module: t.v, params, insts });
    }
    function genItemsOrBlock() {
      // a generate block body: begin [: name] items end, or one item
      if (is('begin')) {
        const t = next(); let name = null;
        if (accept(':')) name = ident('a generate block name').v;
        const items = moduleItems(['end']);
        next();
        if (accept(':')) ident();
        return { name, items, line: t.line, col: t.col };
      }
      return { name: null, items: moduleItem() };
    }
    function genFor() {
      const t = next(); expect('(', 'after for');
      const v = ident('the genvar'); expect('='); const init = expr(); expect(';', 'after the generate loop start');
      const cond = expr(); expect(';', 'after the generate loop condition');
      const v2 = ident('the genvar'); expect('='); const step = expr(); expect(')');
      const body = genItemsOrBlock();
      return at(t, { k: 'genfor', v: v.v, init, cond, v2: v2.v, step, body });
    }
    function genIf() {
      const t = next(); expect('(', 'after if'); const c = expr(); expect(')');
      const th = genItemsOrBlock();
      let el = null;
      if (accept('else')) el = genItemsOrBlock();
      return at(t, { k: 'genif', cond: c, then: th, else: el });
    }
    function genCase() {
      const t = next(); expect('('); const e = expr(); expect(')');
      const arms = [];
      while (!accept('endcase')) {
        if (accept('default')) { accept(':'); arms.push({ exprs: null, body: genItemsOrBlock() }); continue; }
        const exprs = [expr()]; while (accept(',')) exprs.push(expr());
        expect(':');
        arms.push({ exprs, body: genItemsOrBlock() });
      }
      return at(t, { k: 'gencase', expr: e, arms });
    }
    function genBlock() { const t = peek(); const b = genItemsOrBlock(); return at(t, { k: 'genblock', name: b.name, items: b.items }); }

    function subPorts(isTask) {
      // ANSI ports of a function or task: (input [3:0] a, b, output c)
      const decls = [];
      if (accept('(')) {
        if (!is(')')) {
          let last = null;
          do {
            if (peek().t === 'kw' && (DIRS.has(peek().v))) { const d = declaration(false, true)[0]; decls.push(d); last = d; }
            else if (last && peek().t === 'id') { const n = next(); last.names.push(at(n, { name: n.v, dims: [], init: null })); }
            else fail('expected input, output or inout in the ' + (isTask ? 'task' : 'function') + ' ports', peek());
          } while (accept(','));
        }
        expect(')');
      }
      return decls;
    }
    function funcDecl() {
      const t = next();
      const auto = !!accept('automatic');
      let signed = false, rng = null, rtype = null;
      if (is('integer') || is('real') || is('realtime') || is('time')) rtype = next().v;
      if (accept('signed')) signed = true;
      if (is('[')) rng = range();
      const n = ident('a function name');
      const ports = subPorts(false);
      expect(';', 'after the function header');
      const decls = [];
      while (isDeclStart()) decls.push(...declaration(false));
      if (is('endfunction')) fail('the function ' + n.v + ' has no statement', peek());
      const body = stmtOrNull();
      if (!is('endfunction')) fail('a function body is one statement; wrap several in begin ... end (or add the missing endfunction)', peek());
      next();
      return at(t, { k: 'function', name: n.v, auto, signed, range: rng, rtype, decls: ports.concat(decls), body });
    }
    function taskDecl() {
      const t = next();
      const auto = !!accept('automatic');
      const n = ident('a task name');
      const ports = subPorts(true);
      expect(';', 'after the task header');
      const decls = [];
      while (isDeclStart()) decls.push(...declaration(false));
      const body = is('endtask') ? at(peek(), { k: 'null' }) : stmtOrNull();
      if (!is('endtask')) fail('a task body is one statement; wrap several in begin ... end (or add the missing endtask)', peek());
      next();
      return at(t, { k: 'task', name: n.v, auto, decls: ports.concat(decls), body });
    }

    // ---- modules ---------------------------------------------------------------------------------------------------
    function applyDirective(t) {
      if (t.v === 'timescale') timescale = { unit: t.unit, prec: t.prec };
      else if (t.v === 'default_nettype') nettype = t.net;
      else if (t.v === 'resetall') { timescale = null; nettype = 'wire'; }
    }
    function moduleDecl() {
      const t = next();
      const name = ident('a module name');
      const m = at(t, { k: 'module', name: name.v, params: [], ports: [], ansi: false, items: [], timescale, nettype });
      if (accept('#')) {
        expect('(', 'after # in the module header');
        if (!is(')')) do {
          if (accept('parameter')) m.params.push(paramDecl(false, true));
          else if (peek().t === 'id') { const p = paramDecl(false, true); m.params.push(p); }
          else fail('expected a parameter in the module header but found ' + show(peek()), peek());
        } while (accept(','));
        expect(')', 'to close the parameter list');
      }
      if (accept('(')) {
        if (!is(')')) {
          if (peek().t === 'kw' && DIRS.has(peek().v)) {
            m.ansi = true;
            let last = null;
            do {
              if (peek().t === 'kw' && DIRS.has(peek().v)) { last = declaration(false, true)[0]; m.items.push(last); last.names.forEach((x) => m.ports.push({ name: x.name, line: x.line, col: x.col })); }
              else if (last && peek().t === 'id') { const n = next(); const it = at(n, { name: n.v, dims: [], init: null }); last.names.push(it); m.ports.push({ name: n.v, line: n.line, col: n.col }); }
              else fail('expected a port declaration (input, output or inout) but found ' + show(peek()), peek());
            } while (accept(','));
          } else {
            do {
              if (is(',') || is(')')) { m.ports.push({ name: null }); continue; }
              const n = ident('a port name');
              m.ports.push({ name: n.v, line: n.line, col: n.col });
            } while (accept(','));
          }
        }
        expect(')', 'to close the port list');
      }
      expect(';', 'after the module header');
      m.items.push(...moduleItems(['endmodule']));
      const e = next();
      if (is(';') && peek().line === e.line) fail('endmodule takes no semicolon; remove the ";" after it', peek());
      return m;
    }
    function udpDecl() {
      const t = next();
      const name = ident('a primitive name');
      const u = at(t, { k: 'udp', name: name.v, ports: [], out: null, inputs: [], seq: false, init: null, rows: [] });
      expect('('); do u.ports.push(ident('a port name').v); while (accept(',')); expect(')'); expect(';');
      const dirs = {};
      while (!is('table')) {
        const d = peek();
        if (accept('output')) { if (accept('reg')) u.seq = true; do dirs[ident().v] = 'out'; while (accept(',')); expect(';'); }
        else if (accept('input')) { do dirs[ident().v] = 'in'; while (accept(',')); expect(';'); }
        else if (accept('reg')) { ident(); u.seq = true; expect(';'); }
        else if (accept('initial')) { ident(); expect('='); const e = expr(); u.init = e; expect(';'); }
        else fail('expected output, input, reg, initial or table in the primitive but found ' + show(d), d);
      }
      next();
      const raw = next();
      if (raw.t !== 'table') fail('the primitive table is empty', raw);
      expect('endtable'); expect('endprimitive');
      u.out = u.ports[0];
      if (dirs[u.out] !== 'out') fail('the first port of a primitive must be its output', t);
      u.inputs = u.ports.slice(1);
      const text = raw.v.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      let line = raw.line;
      for (const chunk of text.split(';')) {
        const rowLine = line;
        line += (chunk.match(/\n/g) || []).length;
        const s = chunk.replace(/\s+/g, '');
        if (!s) continue;
        const fields = s.split(':');
        const syms = (str) => { const out = []; for (let i = 0; i < str.length; i++) { if (str[i] === '(') { out.push(str.slice(i, i + 4)); i += 3; } else out.push(str[i]); } return out.map((x) => x.toLowerCase()); };
        const pos = { line: rowLine + (chunk.match(/^\s*\n/) ? (chunk.match(/^\s*/)[0].match(/\n/g) || []).length : 0), col: 1 };
        if (fields.length !== (u.seq ? 3 : 2)) fail(u.seq ? 'a row of a sequential table has the form inputs : state : next;' : 'a row of a combinational table has the form inputs : output;', pos);
        const ins = syms(fields[0]);
        if (ins.length !== u.inputs.length) fail('this table row has ' + ins.length + ' input values but the primitive has ' + u.inputs.length + ' inputs', pos);
        u.rows.push({ ins, cur: u.seq ? fields[1].toLowerCase() : null, out: fields[fields.length - 1].toLowerCase(), line: pos.line });
      }
      return u;
    }

    while (k < toks.length) {
      const t = peek();
      try {
        if (t.t === 'dir') { next(); applyDirective(t); continue; }
        if (is('module') || is('macromodule')) modules.push(moduleDecl());
        else if (is('primitive')) udps.push(udpDecl());
        else if (is(';')) fail(k > 0 && toks[k - 1].v === 'endmodule' ? 'endmodule takes no semicolon; remove the ";" after it' : 'a stray ";" outside any module', t);
        else fail('expected module but found ' + show(t) + (t.t === 'kw' ? ' outside any module (is an extra endmodule above?)' : ''), t);
      } catch (e) {
        if (!(e instanceof V.VError)) throw e;
        errors.push({ line: e.line, col: e.col, msg: e.message, file: e.file });
        // skip to after the next endmodule / endprimitive
        let guard = k;
        while (k < toks.length && !is('endmodule') && !is('endprimitive')) k++;
        if (k < toks.length) k++;
        if (k === guard && k < toks.length) k++;
      }
    }
    return { modules, udps, errors };
  }
  V.parse = parse;
  function editDistance(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) { d[i] = [i]; for (let j = 1; j <= b.length; j++) d[i][j] = i === 0 ? j : Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); }
    return d[a.length][b.length];
  }
  V.editDistance = editDistance;
})(globalThis.Sirkit = globalThis.Sirkit || {});
