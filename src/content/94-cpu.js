// Part 13, a small processor: lessons, exercises, a tour and a course. Three chapters: the machine (datapath,
// instruction formats and the assembler), control (the instruction cycle, micro-operations, hard-wired and
// microprogrammed control), and programs written and run on it. Every program and number here is our own; the
// answers come from Sirkit.Cpu (its assembler, its control units and its machine), and the programs are checked by
// running them on test inputs.
(function (S) {
  'use strict';
  const C = S.Content;
  if (!C || C.lessons.has('p13l-datapath')) return;
  const Cpu = () => S.Cpu;
  const hex = (v) => Cpu().hex(v);

  C.chapter({ id: 'p13-ch-machine', part: 'cpu', n: 1, title: 'The machine and its code', blurb: 'Registers on a common bus, instructions of one or two bytes with three addressing modes, and the assembler that turns lines into bytes.' });
  C.chapter({ id: 'p13-ch-control', part: 'cpu', n: 2, title: 'Control', blurb: 'Fetch, decode, execute: every instruction as a few micro-operations, switched on by hard-wired logic or read from a control memory.' });
  C.chapter({ id: 'p13-ch-programs', part: 'cpu', n: 3, title: 'Programs', blurb: 'Loops, flags, pointers, input and output, and subroutines: short programs written, assembled and checked on test inputs.' });

  const L = (x) => C.lesson(x);
  const ex = (o) => C.exercise(o);

  // ---- small helpers for exercises that read machine code -----------------------------------------------------
  const bytesOf = (t) => String(t).toUpperCase().replace(/0X/g, '').split(/[^0-9A-F]+/).filter(Boolean).map((b) => parseInt(b, 16));
  /** accept(text): the hex bytes the assembler gives for src */
  const bytesAccept = (src) => (text) => {
    const p = Cpu().assemble(src), want = p.mem.slice(p.start, p.start + p.size), got = bytesOf(text);
    if (got.length !== want.length) return 'Not quite: the code is ' + want.length + ' byte' + (want.length > 1 ? 's' : '') + ', and you wrote ' + got.length + '.';
    const k = got.findIndex((b, i) => b !== want[i]);
    if (k < 0) return true;
    return 'Not quite: byte ' + (k + 1) + ' is wrong.' + (k === 0 || (k > 0 && want.length > 1) ? ' The first byte of an instruction is the opcode in the high four bits and the mode in the low two.' : '');
  };
  /** accept(text): the instructions that disassemble from the bytes, compared with operands as numbers */
  const insAccept = (bytes, count) => (text) => {
    const mem = bytes.concat(new Array(256 - bytes.length).fill(0));
    const want = Cpu().disassemble(mem, 0, count).map((d) => d.text);
    const norm = (line) => {
      const m = /^([A-Za-z]+)\s*([@#]?)\s*(\S*)$/.exec(line.trim());
      if (!m) return line.trim().toUpperCase();
      const v = m[3] ? (/^0x/i.test(m[3]) ? parseInt(m[3], 16) : /^[0-9a-f]+h$/i.test(m[3]) ? parseInt(m[3], 16) : Number(m[3])) : null;
      return m[1].toUpperCase() + (m[3] ? ' ' + m[2] + v : '');
    };
    const got = String(text).split(/[;\n]+/).map((s) => s.trim()).filter(Boolean).map(norm);
    const w = want.map(norm);
    if (got.length !== w.length) return 'Not quite: the bytes hold ' + w.length + ' instructions; write them one per line or separated by semicolons.';
    const k = got.findIndex((g, i) => g !== w[i]);
    return k < 0 ? true : 'Not quite: instruction ' + (k + 1) + ' is wrong. Split its first byte into the opcode (high four bits) and the mode (low two bits).';
  };

  // =========================================================================================================
  // Chapter 1: the machine
  // =========================================================================================================
  L({
    id: 'p13l-datapath', chapter: 'p13-ch-machine', title: 'Registers on one bus', minutes: 7,
    summary: 'The processor is a handful of 8-bit registers, a memory and an ALU, joined by one common bus. In each clock cycle one source drives the bus and any registers that need it load from it.',
    blocks: [
      'Everything this processor does comes down to moving bytes between registers. **PC** holds the address of the next instruction, **AR** the address memory is reading or writing, **IR** the instruction being carried out, **AC** the accumulator that arithmetic works on, **DR** a data register that feeds the ALU, and **SP** the stack pointer. Flags Z, C and N record what the last ALU result looked like.',
      'Wiring every register to every other would take a mass of wires. Instead they share one **bus**: a multiplexer picks one source with a select code, and every register that should load does so at the clock edge. Only one source may drive the bus in a cycle; any number of registers may load from it.',
      { topic: 'cpu-datapath', frame: 2, caption: 'Cycle 2 of fetching an instruction: memory at AR drives the bus into IR, while PC counts up on its own, without using the bus.' },
      { def: 'Micro-operation', text: 'one register transfer done in one clock cycle, written in register-transfer notation, such as AR ← PC, or DR ← M[AR] (memory at the address in AR into DR).' },
      { predict: { q: 'Can AR ← PC and DR ← AC happen in the same clock cycle?', options: ['Yes: they write different registers', 'No: both need the bus, with different sources'], answer: 1, explain: 'Both transfers go over the one bus, and the bus can carry only one source per cycle. Two transfers from the same source, or one over the bus and one inside a register (PC ← PC + 1), can share a cycle.' } },
      { h: 'What to take away' },
      { list: ['PC, AR, IR, AC, DR, SP and the flags Z, C, N.', 'One bus, one source per cycle; the select code picks it.', 'A micro-operation is one transfer in one cycle.'] },
      { exercise: 'p13x-bus-conflict' },
    ],
  });

  L({
    id: 'p13l-formats', chapter: 'p13-ch-machine', title: 'Instruction formats and addressing modes', minutes: 8,
    summary: 'An instruction is one byte, or two when it needs an operand. The first byte holds the opcode in its high four bits and the addressing mode in its low two: direct, indirect or immediate.',
    blocks: [
      'The processor has sixteen opcodes, so four bits name the operation. Instructions that work on memory (LDA, STA, ADD, SUB, AND, OR, the jumps and CALL) take a second byte, the operand. The two low bits of the first byte say what the operand means.',
      { table: [['Mode', 'Bits', 'Written', 'The operand is'], ['direct', '00', 'LDA x', 'the address of the data'], ['indirect', '01', 'LDA @p', 'the address of the address'], ['immediate', '10', 'LDA #5', 'the data itself']], caption: 'Three addressing modes. Inherent instructions (NOT, SHL, SHR, IN, OUT, HLT, RET) are a single byte.' },
      { topic: 'cpu-formats', input: { ins: 'LDA @ptr' }, frame: 2, caption: 'LDA @ptr: the operand is the address of a pointer, and the pointer holds the address of the data. One more memory read than direct.' },
      { predict: { q: 'ADD is opcode 3, and immediate mode is 10 in the low bits. What is the first byte of ADD #20?', options: ['30', '32', '23'], answer: 1, explain: 'Opcode 3 in the high four bits gives 3_, and mode 10 in the low two bits gives 2: 32 in hex. The second byte is 20 in hex, 14.' } },
      { tip: 'Immediate mode is the quickest, since the data comes with the instruction; indirect is the slowest, but the pointer can be changed by the program, which is how a loop walks along an array.' },
      { h: 'What to take away' },
      { list: ['First byte: opcode (4 bits), 00, mode (2 bits).', 'Direct: address of the data. Indirect: address of the address. Immediate: the data.', 'Inherent instructions are one byte.'] },
      { exercise: 'p13x-asm-imm' },
      { exercise: 'p13x-asm-ind' },
      { exercise: 'p13x-disasm' },
    ],
  });

  L({
    id: 'p13l-assembler', chapter: 'p13-ch-machine', title: 'The two-pass assembler', minutes: 7,
    summary: 'The assembler reads the source twice. The first pass only counts bytes, to find the address of every label; the second writes the bytes, now that every name has a value.',
    blocks: [
      'Writing machine code by hand means looking up opcodes and counting addresses. An **assembler** does both. A line has an optional label, a mnemonic and an operand: `loop: SUB #1`. Directives reserve data: `DB 5, 7` writes bytes, `DS 3` leaves three zero bytes, `ORG 40` moves the location counter.',
      'A jump can name a label further down the program, whose address is not known yet when the jump is reached. So the assembler makes two passes. **Pass 1** walks the source with a location counter, adding 2 for a memory instruction, 1 for an inherent one, and the size of each directive; every label it meets goes into the symbol table with the counter\'s value. **Pass 2** writes the bytes.',
      { topic: 'cpu-assemble', frame: 7, caption: 'Pass 1 is done: start = 00, loop = 02, done = 09. Step on through pass 2 as each line becomes bytes.' },
      { predict: { q: 'A program starts LDA a (2 bytes), STA b (2), IN (1). At what address does the line after IN start?', options: ['03', '05', '06'], answer: 1, explain: '2 + 2 + 1 = 5 bytes from address 00, so the next line is at 05.' } },
      { h: 'What to take away' },
      { list: ['Pass 1: count bytes, record each label\'s address.', 'Pass 2: write opcode bytes and operands.', 'DB writes bytes, DS reserves zeros, ORG sets the address.'] },
      { exercise: 'p13x-label' },
      { exercise: 'p13x-size' },
      { exercise: 'p13x-asm-prog' },
    ],
  });

  // =========================================================================================================
  // Chapter 2: control
  // =========================================================================================================
  L({
    id: 'p13l-cycle', chapter: 'p13-ch-control', title: 'Fetch, decode, execute', minutes: 8,
    summary: 'A sequence counter gives timing signals T0, T1, T2 …. Every instruction starts with the same three cycles: AR ← PC; IR ← M[AR] and PC ← PC + 1; decode and AR ← PC. What follows T2 depends on the opcode.',
    blocks: [
      'The control unit needs to know two things in every cycle: which instruction it is carrying out, and how far through it is. The first is IR, decoded into D0 … D15. The second is a **sequence counter** SC, decoded into timing signals T0, T1, T2, …; SC counts up each clock and is cleared to start the next instruction.',
      { topic: 'cpu-fetch', frame: 3, caption: 'T2: the opcode in IR drives the decoder (D1, LDA), and AR gets PC so the operand byte can be read in T3.' },
      { math: 'T0: AR ← PC\nT1: IR ← M[AR], PC ← PC + 1\nT2: AR ← PC              (decode IR)\nT3 …: execute, ending with SC ← 0' },
      { predict: { q: 'LDA x (direct) runs T0 to T5. How many clock cycles does LDA @p (indirect) take?', options: ['6', '7', '8'], answer: 1, explain: 'Indirect adds one memory read: T3 AR ← M[AR] (the pointer\'s address), T4 AR ← M[AR] (the pointer), T5 DR ← M[AR], T6 AC ← DR. Seven cycles, T0 to T6.' } },
      'The ASM view of this is a loop: a state for each timing signal, the fetch states shared by every instruction, then a decision box on the opcode that branches to each instruction\'s execute states, all of which lead back to T0.',
      { h: 'What to take away' },
      { list: ['SC gives T0, T1, …; IR gives D0 … D15.', 'Fetch is the same for every instruction: three cycles.', 'Execute runs from T3 and ends with SC ← 0.'] },
      { exercise: 'p13x-cycles-ind' },
      { exercise: 'p13x-cycles-prog' },
      { exercise: 'p13x-trace' },
    ],
  });

  L({
    id: 'p13l-exec', chapter: 'p13-ch-control', title: 'Each instruction, cycle by cycle', minutes: 8,
    summary: 'Memory instructions first fetch their operand\'s address, then read or write. A conditional jump looks at its flag in its last cycle. CALL pushes the return address on the stack; RET pops it.',
    blocks: [
      'After T2, a memory-reference instruction reads its operand byte: in direct mode it goes to AR (it is an address); in immediate mode straight to DR (it is the data). Indirect mode reads once more, replacing AR with the address the pointer holds. Then LDA, ADD and their kind read M[AR] into DR and combine it with AC; STA writes AC to M[AR]; JMP copies AR into PC.',
      { topic: 'cpu-exec', input: { k: 'JZn' }, frame: 5, caption: 'JZ with Z = 0: in T4 the condition fails, so nothing is loaded. PC already points past the instruction, so the program simply carries on.' },
      { predict: { q: 'JZ far, with Z = 1. What happens in T4?', options: ['PC ← AR, then SC ← 0', 'Nothing, then SC ← 0', 'AR ← PC'], answer: 0, explain: 'AR already holds the target from T3, so a taken jump only copies it into PC.' } },
      'CALL is the longest: after reading its target into AR it saves the return address. T4: SP ← SP − 1 and DR ← AR (keep the target). T5: AR ← SP. T6: M[AR] ← PC (push the return address). T7: PC ← DR. RET undoes it in two cycles: AR ← SP, then PC ← M[AR] and SP ← SP + 1.',
      { h: 'What to take away' },
      { list: ['Direct: operand to AR. Immediate: operand to DR. Indirect: one more AR ← M[AR].', 'A conditional jump tests its flag in its last cycle.', 'CALL pushes PC on the stack in four execute cycles; RET pops it in two.'] },
      { exercise: 'p13x-jz' },
      { exercise: 'p13x-call' },
    ],
  });

  L({
    id: 'p13l-hardwired', chapter: 'p13-ch-control', title: 'Hard-wired control', minutes: 7,
    summary: 'Each micro-operation is switched on by an OR of products of the timing signals, the decoded opcode, the mode bits and the flags. Fast, since it is two levels of logic, but every change to the instruction set means new equations.',
    blocks: [
      'Read the table of micro-operations the other way round. For each one, collect every cycle in which it happens. DR ← M[AR] happens at T4 of LDA in direct mode, at T5 in indirect mode, at T3 in immediate mode, and the same for ADD, SUB, AND and OR. Each of those is a product: a timing signal, an opcode line, a mode condition. The micro-operation\'s control line is the OR of the products.',
      { topic: 'cpu-hardwired', frame: 6, caption: 'Cycle 5 of the program: the product T4·D1·I′M′ is 1 (LDA, direct mode), so DR ← M[AR] is switched on.' },
      { predict: { q: 'Which product switches on PC ← AR for JZ in direct mode (opcode B)?', options: ['T4·DB·I′M′·Z', 'T4·DB·I′M′', 'T3·DB·Z'], answer: 0, explain: 'The jump is taken in T4, for opcode B, in direct mode, and only when Z = 1. Without the Z the jump would always be taken.' } },
      { h: 'What to take away' },
      { list: ['Control line = OR of products of T, D, mode bits and flags.', 'Two levels of logic after the decoders: fast.', 'Hard to change: every instruction is wired in.'] },
      { exercise: 'p13x-hw-term' },
    ],
  });

  L({
    id: 'p13l-micro', chapter: 'p13-ch-control', title: 'Microprogrammed control', minutes: 8,
    summary: 'Store the micro-operations of every cycle as words in a control memory. A control address register steps through them; a mapping table jumps from the fetch routine to each instruction\'s routine.',
    blocks: [
      'The same information can be kept in a memory instead of wiring. Each **microinstruction** is a word with fields: F1, F2 and F3 name micro-operations (a code each, so two of one field can never share a word), CD a condition (always, Z, C or N), BR a branch type, and AD a next address.',
      'The control address register **CAR** plays the part of SC. The fetch routine sits at words 0, 1 and 2. Word 2 has BR = MAP: the next address comes from a mapping table indexed by the opcode and mode bits of IR, which sends each instruction to the first word of its own routine. Each routine ends with AD = 0, back to fetch.',
      { topic: 'cpu-micro', frame: 3, caption: 'CAR = 2, the decode word: BR = MAP sends IR = 12 (LDA immediate) to word 11.' },
      { predict: { q: 'The microprogrammed unit and the hard-wired unit run the same program. Do they take the same number of clock cycles?', options: ['Yes: one microinstruction per cycle, the same transfers', 'No: the microprogrammed unit needs an extra cycle per instruction'], answer: 0, explain: 'Each word does what one timing step did, and the topic checks them register for register: ' + (S.Cpu ? S.Cpu.microprogram().words.length : 93) + ' words cover every routine.' } },
      { tip: 'The price of microprogramming is a control-memory read in every cycle; the reward is that a new instruction is a few more words, not new logic.' },
      { h: 'What to take away' },
      { list: ['Microinstruction: F1 F2 F3 CD BR AD.', 'CAR steps through the words; MAP jumps to each routine.', 'Same datapath, same cycles as the hard-wired unit.'] },
      { exercise: 'p13x-micro-words' },
      { exercise: 'p13x-map' },
    ],
  });

  // =========================================================================================================
  // Chapter 3: programs
  // =========================================================================================================
  L({
    id: 'p13l-programs', chapter: 'p13-ch-programs', title: 'Writing programs', minutes: 10,
    summary: 'Loops count down a variable kept in memory and leave with JZ; SUB sets C when there is no borrow, which is how two numbers are compared; IN and OUT talk to the outside; CALL and RET reuse code.',
    blocks: [
      'With one accumulator, every variable lives in memory: load it, change it, store it back. A loop that runs n times keeps a count, subtracts 1, and leaves with JZ when it reaches 0. A loop that reads until a 0 arrives can test straight after IN, since IN sets Z.',
      { topic: 'cpu-programs', input: { p: 'io', detail: 0 }, frame: 7, caption: 'Running totals of the input: IN, JZ to leave on a 0, ADD, STA, OUT, and back. The first total, 3, has just gone out.' },
      'To compare two numbers, subtract. SUB leaves C = 1 when there was no borrow, that is when AC was at least the number subtracted. So `LDA v`, `SUB m`, `JC bigger` jumps when v ≥ m. SUB changes AC, so load v again if you still need it.',
      { predict: { q: 'AC = 7 and the program does SUB #9. What are C and AC afterwards?', options: ['C = 1, AC = 254', 'C = 0, AC = 254', 'C = 0, AC = 2'], answer: 1, explain: '7 − 9 borrows, so C = 0, and the 8-bit result wraps round to 256 − 2 = 254.' } },
      { code: '; send out each input byte doubled, until a 0\nloop:   IN\n        JZ done\n        SHL\n        OUT\n        JMP loop\ndone:   HLT', lang: 'asm' },
      { warn: 'STA does not touch the flags, but LDA does: a JZ after LDA tests the value just loaded. Test a flag before the next instruction that sets it.' },
      'A **subroutine** is code you CALL from several places: CALL pushes the address of the next instruction and jumps; RET pops it back into PC. The stack grows down from the top of memory, so it stays out of the way of a short program.',
      { h: 'What to take away' },
      { list: ['Variables live in memory: load, change, store.', 'Count down and leave with JZ; IN sets Z for a 0.', 'Compare with SUB and JC (C = 1 means no borrow).', 'CALL and RET for code used more than once.'] },
      { exercise: 'p13x-sum3' },
      { exercise: 'p13x-countdown' },
      { exercise: 'p13x-double' },
      { exercise: 'p13x-sum-n' },
      { exercise: 'p13x-count' },
      { exercise: 'p13x-min' },
      { exercise: 'p13x-absdiff' },
      { exercise: 'p13x-store' },
      { exercise: 'p13x-mult' },
      { exercise: 'p13x-parity' },
      { exercise: 'p13x-triple-sub' },
    ],
  });

  // =========================================================================================================
  // Exercises
  // =========================================================================================================
  // ---- chapter 1 -----------------------------------------------------------------------------------------------
  ex({
    id: 'p13x-bus-conflict', chapter: 'p13-ch-machine', title: 'Which pair can share a cycle?', level: 1, kind: 'choice',
    options: ['AR ← PC and DR ← AC', 'IR ← M[AR] and PC ← PC + 1', 'DR ← AR and AR ← M[AR]', 'M[AR] ← AC and OUTR ← PC'], answer: 1,
    whyNot: { 0: 'PC and AC would both have to drive the bus.', 2: 'AR and memory would both have to drive the bus.', 3: 'AC and PC would both have to drive the bus.' },
    text: ['Which pair of micro-operations can happen in the same clock cycle?'],
    hints: ['Only one source can drive the bus in a cycle.', 'PC ← PC + 1 is done inside PC, by its own counter: it needs no bus.', 'IR ← M[AR] with PC ← PC + 1, exactly what fetch does in T1.'],
    solution: 1, wrong: [0, 2, 3],
  });
  ex({
    id: 'p13x-asm-imm', chapter: 'p13-ch-machine', title: 'Assemble ADD #20', level: 1, kind: 'string', placeholder: 'hex bytes, like 12 05',
    accept: bytesAccept('ADD #20'),
    text: ['ADD is opcode 3 and the immediate mode bits are 10. Write the machine code of `ADD #20` as hex bytes (20 is decimal).'],
    hints: ['First byte: opcode in the high four bits, 00, then the mode in the low two.', '0011 00 10 = 32 in hex.', 'The operand 20 is 14 in hex: 32 14.'],
    solution: '32 14', wrong: ['30 14', '32 20', '23 14'],
  });
  ex({
    id: 'p13x-asm-ind', chapter: 'p13-ch-machine', title: 'Assemble an indirect load', level: 1, kind: 'string', placeholder: 'hex bytes',
    accept: bytesAccept('LDA @0x10'),
    text: ['LDA is opcode 1 and the indirect mode bits are 01. Write the machine code of `LDA @0x10` as hex bytes.'],
    hints: ['Indirect: the low two bits are 01.', '0001 00 01 = 11 in hex.', '11 10.'],
    solution: '11 10', wrong: ['10 10', '12 10', '11 16'],
  });
  ex({
    id: 'p13x-disasm', chapter: 'p13-ch-machine', title: 'Read machine code back', level: 2, kind: 'string', placeholder: 'one instruction per line, or separated by ;',
    accept: insAccept([0x31, 0x0C, 0x80, 0xD1, 0x00], 4),
    text: ['Memory from address 00 holds the bytes 31 0C 80 D1 00. Write the four instructions they hold (operands as decimal numbers, with @ or # for the mode).', { table: [['Opcode', 'Instruction', 'Opcode', 'Instruction'], ['0', 'HLT', '8', 'SHL'], ['1', 'LDA', '9', 'SHR'], ['2', 'STA', 'A', 'JMP'], ['3', 'ADD', 'B', 'JZ'], ['4', 'SUB', 'C', 'JC'], ['5', 'AND', 'D', 'IN (D0), OUT (D1)'], ['6', 'OR', 'E', 'CALL'], ['7', 'NOT', 'F', 'RET']], caption: 'The opcodes, the high four bits of the first byte.' }],
    hints: ['31: opcode 3 (ADD), mode 01 (indirect); it takes the next byte, 0C = 12.', '80 is SHL, D1 is OUT, 00 is HLT: one byte each.', 'ADD @12; SHL; OUT; HLT.'],
    solution: 'ADD @12; SHL; OUT; HLT', wrong: ['ADD 12; SHL; OUT; HLT', 'ADD @12; SHR; OUT; HLT', 'ADD @12; SHL; OUT'],
  });
  const P1 = 'start:  IN\n        STA a\n        IN\n        SUB a\n        JC pos\n        NOT\n        ADD #1\npos:    OUT\n        HLT\na:      DB 0';
  ex({
    id: 'p13x-label', chapter: 'p13-ch-machine', title: 'Where does the label land?', level: 2, kind: 'number', answer: Cpu().assemble(P1).symbols.pos, higherLower: true,
    text: ['The program is assembled from address 0. At what address (as a decimal number) does the label `pos` land?', { code: P1, lang: 'asm' }],
    hints: ['Count the bytes before pos: memory instructions take 2, inherent ones 1.', 'IN 1, STA 2, IN 1, SUB 2, JC 2, NOT 1, ADD 2.', '1 + 2 + 1 + 2 + 2 + 1 + 2 = 11.'],
    solution: 11, wrong: [7, 10, 12],
  });
  ex({
    id: 'p13x-size', chapter: 'p13-ch-machine', title: 'How many bytes?', level: 1, kind: 'number', answer: Cpu().assemble(P1).size, higherLower: true,
    text: ['How many bytes does the same program take, its data byte included?', { code: P1, lang: 'asm' }],
    hints: ['pos is at 11.', 'OUT and HLT take 1 byte each, and DB 0 one more.', '11 + 1 + 1 + 1 = 14.'],
    solution: 14, wrong: [10, 13, 18],
  });
  const P2 = '        LDA x\n        SHL\n        STA x\n        HLT\nx:      DB 9';
  ex({
    id: 'p13x-asm-prog', chapter: 'p13-ch-machine', title: 'Assemble a whole program', level: 2, kind: 'string', placeholder: 'every byte in hex, from address 00',
    accept: bytesAccept(P2),
    text: ['Assemble this program from address 00. Write every byte in hex, its data included.', { code: P2, lang: 'asm' }],
    hints: ['Pass 1: LDA x (2 bytes), SHL (1), STA x (2), HLT (1), so x is at 06.', 'LDA direct is 10, SHL 80, STA direct 20, HLT 00; x holds 09.', '10 06 80 20 06 00 09.'],
    solution: '10 06 80 20 06 00 09', wrong: ['10 05 80 20 05 00 09', '10 06 80 20 06 00', '12 06 80 20 06 00 09'],
  });

  // ---- chapter 2 -----------------------------------------------------------------------------------------------
  const cyclesOf = (key) => 3 + Cpu().routines()[key].cycles.length;
  ex({
    id: 'p13x-cycles-ind', chapter: 'p13-ch-control', title: 'The cost of indirection', level: 1, kind: 'number', answer: cyclesOf('LDA.ind'), higherLower: true,
    text: ['How many clock cycles does `LDA @p` take, fetch included?'],
    hints: ['Fetch is T0, T1, T2.', 'Then T3 AR ← M[AR] (and PC ← PC + 1), T4 AR ← M[AR], T5 DR ← M[AR], T6 AC ← DR.', '7 cycles.'],
    solution: 7, wrong: [6, 5, 8],
  });
  const P3 = '        LDA val\n        ADD #9\n        HLT\nval:    DB 0x21';
  ex({
    id: 'p13x-cycles-prog', chapter: 'p13-ch-control', title: 'Cycles for a program', level: 2, kind: 'number', answer: (() => { const m = Cpu().machine(Cpu().assemble(P3)); return m.run(100).cycles; })(), higherLower: true,
    text: ['How many clock cycles does this program take, from the first fetch to HLT?', { code: P3, lang: 'asm' }],
    hints: ['LDA direct: 6 cycles. ADD immediate: 5.', 'HLT: the three fetch cycles and one to stop.', '6 + 5 + 4 = 15.'],
    solution: 15, wrong: [12, 14, 16],
  });
  const TRACE_REGS = ['PC', 'AR', 'DR', 'AC'];
  ex({
    id: 'p13x-trace', chapter: 'p13-ch-control', title: 'Trace LDA, cycle by cycle', level: 3, kind: 'table', rows: ['0', '1', '2', '3', '4', '5'], cols: TRACE_REGS, corner: '',
    cells: (() => { const m = Cpu().machine(Cpu().assemble(P3)); const out = {}; for (let i = 0; i < 6; i++) { const s = m.cycle(); for (const r of TRACE_REGS) out[s.T + '|' + r] = hex(s.regs[r]); } return out; })(),
    text: ['The same program starts with every register 00. Fill in PC, AR, DR and AC, in hex, after each cycle of the first instruction, `LDA val` (val is at 05 and holds 21). The rows are the timing steps T0 to T5.', { code: P3, lang: 'asm' }],
    hints: ['T0: AR ← PC. T1: IR ← M[AR], PC ← PC + 1. T2: AR ← PC.', 'T3: AR ← M[AR] (05), PC ← PC + 1. T4: DR ← M[AR] (21). T5: AC ← DR.', 'PC: 00 01 01 02 02 02. AR: 00 00 01 05 05 05. DR: 00 00 00 00 21 21. AC: 00 00 00 00 00 21.'],
    solution: { '0|PC': '00', '0|AR': '00', '0|DR': '00', '0|AC': '00', '1|PC': '01', '1|AR': '00', '1|DR': '00', '1|AC': '00', '2|PC': '01', '2|AR': '01', '2|DR': '00', '2|AC': '00', '3|PC': '02', '3|AR': '05', '3|DR': '00', '3|AC': '00', '4|PC': '02', '4|AR': '05', '4|DR': '21', '4|AC': '00', '5|PC': '02', '5|AR': '05', '5|DR': '21', '5|AC': '21' },
    wrong: [{ '0|PC': '01', '0|AR': '00', '0|DR': '00', '0|AC': '00', '1|PC': '01', '1|AR': '00', '1|DR': '00', '1|AC': '00', '2|PC': '01', '2|AR': '01', '2|DR': '00', '2|AC': '00', '3|PC': '02', '3|AR': '05', '3|DR': '00', '3|AC': '00', '4|PC': '02', '4|AR': '05', '4|DR': '21', '4|AC': '00', '5|PC': '02', '5|AR': '05', '5|DR': '21', '5|AC': '21' }],
  });
  ex({
    id: 'p13x-jz', chapter: 'p13-ch-control', title: 'A jump not taken', level: 1, kind: 'choice',
    options: ['PC ← AR, then SC ← 0', 'Nothing is loaded; SC ← 0', 'PC ← PC + 1, then SC ← 0', 'AR ← PC'], answer: 1,
    whyNot: { 0: 'That is the jump taken, when Z = 1.', 2: 'PC was already counted past the operand in T3.', 3: 'That is a fetch cycle, not the end of an execute.' },
    text: ['`JZ far` (direct mode) is executing and Z = 0. What happens in its T4?'],
    hints: ['In T3 AR received the target address and PC moved past the operand.', 'The jump is taken only when Z = 1.', 'With Z = 0 nothing is loaded and SC is cleared: the next instruction follows.'],
    solution: 1, wrong: [0, 2, 3],
  });
  ex({
    id: 'p13x-call', chapter: 'p13-ch-control', title: 'Inside CALL', level: 2, kind: 'choice',
    options: ['SP ← SP − 1, DR ← AR', 'M[AR] ← PC', 'PC ← AR', 'AR ← SP'], answer: 0,
    whyNot: { 1: 'That is T6, once AR holds the new stack address.', 2: 'The target is kept in DR and copied into PC in T7.', 3: 'That is T5, after SP has been decremented.' },
    text: ['`CALL sub` (direct mode) has read its target into AR in T3. What does it do in T4?'],
    hints: ['CALL must push PC on the stack, which grows down, and AR is needed for that address.', 'So it first keeps the target somewhere else and makes room on the stack.', 'T4: SP ← SP − 1, DR ← AR. Then T5 AR ← SP, T6 M[AR] ← PC, T7 PC ← DR.'],
    solution: 0, wrong: [1, 2, 3],
  });
  ex({
    id: 'p13x-hw-term', chapter: 'p13-ch-control', title: 'A product in the control logic', level: 2, kind: 'choice',
    options: ['T4·D1·I′M′', 'T3·D1·M', 'T5·D1·I', 'T4·D3·I′M′'], answer: 0,
    whyNot: { 1: 'That is LDA in immediate mode, where the operand byte is the data.', 2: 'That is LDA in indirect mode, one cycle later.', 3: 'D3 is ADD, not LDA.' },
    text: ['In the hard-wired control unit, DR ← M[AR] is the OR of several products. Which product switches it on for `LDA x` in direct mode? (D1 is LDA; I is the indirect bit and M the immediate bit.)'],
    hints: ['LDA direct: T3 reads the address, T4 reads the data.', 'Direct mode is neither indirect nor immediate: I′M′.', 'T4·D1·I′M′.'],
    solution: 0, wrong: [1, 2, 3],
  });
  ex({
    id: 'p13x-micro-words', chapter: 'p13-ch-control', title: 'The size of the control memory', level: 1, kind: 'number', answer: Cpu().microprogram().words.length, higherLower: true,
    text: ['The control memory holds the fetch routine (3 words) and a routine for every instruction in every mode it allows, plus one for an illegal opcode; a conditional jump takes two words for its last cycle, one per outcome. Run the microprogrammed control topic, or count: how many words does it hold?', { topic: 'cpu-micro', frame: 0, caption: 'The first frame states the size of the control memory.' }],
    hints: ['The topic\'s first step says it.', 'The word width is ' + Cpu().microprogram().width + ' bits: F1 4, F2 2, F3 4, CD 2, BR 1, AD 7.', 'AD has 7 bits because there are ' + Cpu().microprogram().words.length + ' words, more than 64.'],
    solution: 93, wrong: [64, 128, 20],
  });
  ex({
    id: 'p13x-map', chapter: 'p13-ch-control', title: 'The mapping table', level: 2, kind: 'number', answer: Cpu().microprogram().start['LDA.imm'], higherLower: true,
    text: ['At the decode word, BR = MAP sends the control address register to the first word of the instruction\'s routine. The program begins `LDA #5`. To which word does CAR go after decode? Step the topic to find out.', { topic: 'cpu-micro', frame: 3, caption: 'The decode word with IR = 12.' }],
    hints: ['IR = 12: opcode 1 (LDA), mode 10 (immediate).', 'The mapping table is indexed by the opcode and the two mode bits.', 'Word 11, where LDA.imm starts.'],
    solution: 11, wrong: [3, 12, 18],
  });

  // ---- chapter 3: programs --------------------------------------------------------------------------------------
  const prog = (o) => ex(Object.assign({ chapter: 'p13-ch-programs', kind: 'cpu' }, o));
  const SUM3 = 'IN\nSTA t\nIN\nADD t\nSTA t\nIN\nADD t\nOUT\nHLT\nt: DB 0';
  prog({
    id: 'p13x-sum3', title: 'Add three numbers', level: 1, tests: [{ input: [1, 2, 3] }, { input: [100, 100, 100] }, { input: [0, 0, 7] }], ref: SUM3, start: '; read three numbers, send out their sum\n',
    text: ['Read three numbers with IN and send their sum (modulo 256) with OUT, then stop.'],
    hints: ['Keep the running sum in memory: IN, STA t.', 'Each further number: IN, ADD t, and store it back if another follows.', 'IN / STA t / IN / ADD t / STA t / IN / ADD t / OUT / HLT, with t: DB 0.'],
    solution: SUM3, wrong: ['IN\nSTA t\nIN\nADD t\nOUT\nHLT\nt: DB 0', 'IN\nSTA t\nIN\nADD t\nIN\nADD t\nOUT\nHLT\nt: DB 0'],
  });
  const DOWN = 'IN\nloop: OUT\nSUB #1\nJZ done\nJMP loop\ndone: HLT';
  prog({
    id: 'p13x-countdown', title: 'Count down', level: 1, tests: [{ input: [3] }, { input: [1] }, { input: [6] }], ref: DOWN, start: '; read n (at least 1), send n, n-1, ..., 1\n',
    text: ['Read a number n (at least 1) and send n, n − 1, …, 1 to the output, then stop.'],
    hints: ['Keep n in AC: OUT does not change it.', 'After each OUT, SUB #1 and leave with JZ when it reaches 0.', 'IN / loop: OUT / SUB #1 / JZ done / JMP loop / done: HLT.'],
    solution: DOWN, wrong: ['IN\nloop: SUB #1\nOUT\nJZ done\nJMP loop\ndone: HLT', 'IN\nloop: OUT\nSUB #1\nJC done\nJMP loop\ndone: HLT'],
  });
  const DBL = 'loop: IN\nJZ done\nSHL\nOUT\nJMP loop\ndone: HLT';
  prog({
    id: 'p13x-double', title: 'Double every input', level: 1, tests: [{ input: [3, 50, 200, 0] }, { input: [0] }, { input: [1, 0] }], ref: DBL, start: '; read bytes until a 0, send each one doubled\n',
    text: ['Read bytes until a 0 arrives; send each one doubled (modulo 256). The 0 itself is not sent.'],
    hints: ['IN sets Z when the byte is 0: test it straight away.', 'SHL doubles AC.', 'loop: IN / JZ done / SHL / OUT / JMP loop / done: HLT.'],
    solution: DBL, wrong: ['loop: IN\nSHL\nOUT\nJZ done\nJMP loop\ndone: HLT', 'loop: IN\nJZ done\nSHR\nOUT\nJMP loop\ndone: HLT'],
  });
  const SUMN = 'IN\nSTA n\nLDA #0\nSTA s\nloop: LDA n\nJZ done\nSUB #1\nSTA n\nIN\nADD s\nSTA s\nJMP loop\ndone: LDA s\nOUT\nHLT\nn: DB 0\ns: DB 0';
  prog({
    id: 'p13x-sum-n', title: 'Sum of n numbers', level: 2, tests: [{ input: [3, 5, 6, 7] }, { input: [0] }, { input: [5, 50, 50, 50, 50, 50] }, { input: [1, 9] }], ref: SUMN, start: '; read n, then n numbers; send their sum\n',
    text: ['Read a count n, then n numbers; send their sum (modulo 256). n may be 0, and then the sum is 0.'],
    hints: ['Keep n and the sum in memory, the sum starting at 0.', 'Loop: LDA n, JZ done, SUB #1, STA n, then IN, ADD s, STA s, JMP loop.', 'done: LDA s / OUT / HLT. Testing n at the top of the loop handles n = 0.'],
    solution: SUMN, wrong: [SUMN.replace('SUB #1\nSTA n', 'SUB #1'), 'IN\nSTA n\nloop: LDA n\nJZ done\nSUB #1\nSTA n\nIN\nADD s\nSTA s\nJMP loop\ndone: OUT\nHLT\nn: DB 0\ns: DB 0'],
  });
  const COUNT = 'LDA #0\nSTA c\nloop: IN\nJZ done\nSUB #10\nJC big\nJMP loop\nbig: LDA c\nADD #1\nSTA c\nJMP loop\ndone: LDA c\nOUT\nHLT\nc: DB 0';
  prog({
    id: 'p13x-count', title: 'Count the big ones', level: 2, tests: [{ input: [3, 10, 25, 9, 100, 0] }, { input: [0] }, { input: [10, 10, 10, 0] }, { input: [9, 1, 0] }], ref: COUNT, start: '; read bytes until a 0; send how many were 10 or more\n',
    text: ['Read bytes until a 0 arrives; send how many of them were 10 or more.'],
    hints: ['SUB #10 leaves C = 1 exactly when the byte was at least 10.', 'JC to a few lines that add 1 to a count in memory, then back to the loop.', 'loop: IN / JZ done / SUB #10 / JC big / JMP loop; big: LDA c / ADD #1 / STA c / JMP loop; done: LDA c / OUT / HLT.'],
    solution: COUNT, wrong: [COUNT.replace('JC big', 'JZ big'), COUNT.replace('SUB #10', 'SUB #9')],
  });
  const MIN = 'LDA #255\nSTA m\nloop: IN\nJZ done\nSTA v\nSUB m\nJC loop\nLDA v\nSTA m\nJMP loop\ndone: LDA m\nOUT\nHLT\nm: DB 0\nv: DB 0';
  prog({
    id: 'p13x-min', title: 'The smallest input', level: 3, tests: [{ input: [40, 12, 77, 12, 30, 0] }, { input: [200, 0] }, { input: [5, 4, 3, 2, 1, 0] }, { input: [255, 0] }], ref: MIN, start: '; read bytes (1 to 255) until a 0; send the smallest\n',
    text: ['Read bytes from 1 to 255 until a 0 arrives (at least one byte comes before it); send the smallest.'],
    hints: ['Start the minimum at 255, so the first byte replaces it or equals it.', 'Keep each byte in v; v − m sets C when v ≥ m, so JC skips the update.', 'loop: IN / JZ done / STA v / SUB m / JC loop / LDA v / STA m / JMP loop; done: LDA m / OUT / HLT.'],
    solution: MIN, wrong: [MIN.replace('LDA #255', 'LDA #0'), MIN.replace('JC loop', 'JZ loop')],
  });
  const ABS = 'IN\nSTA a\nIN\nSTA b\nSUB a\nJC pos\nLDA a\nSUB b\npos: OUT\nHLT\na: DB 0\nb: DB 0';
  prog({
    id: 'p13x-absdiff', title: 'The distance between two numbers', level: 2, tests: [{ input: [9, 4] }, { input: [4, 9] }, { input: [7, 7] }, { input: [0, 255] }], ref: ABS, start: '; read a and b, send |a - b|\n',
    text: ['Read two numbers a and b and send |a − b|, the larger minus the smaller.'],
    hints: ['Compute b − a first; C = 1 means b ≥ a and the result is already right.', 'If C = 0, compute a − b instead.', 'IN / STA a / IN / STA b / SUB a / JC pos / LDA a / SUB b / pos: OUT / HLT.'],
    solution: ABS, wrong: ['IN\nSTA a\nIN\nSUB a\nOUT\nHLT\na: DB 0', ABS.replace('JC pos', 'JZ pos')],
  });
  const STORE = 'LDA #0\nSTA n\nloop: IN\nJZ done\nSTA last\nLDA n\nADD #1\nSTA n\nJMP loop\ndone: HLT\nn: DB 0\nlast: DB 0';
  prog({
    id: 'p13x-store', title: 'Leave the answer in memory', level: 2, check: 'memory', memory: ['n', 'last'], tests: [{ input: [5, 9, 3, 0] }, { input: [0] }, { input: [200, 0] }], ref: STORE, start: '; read bytes until a 0\n; leave the count in n and the last non-zero byte in last\n\nn:    DB 0\nlast: DB 0\n',
    text: ['Read bytes until a 0 arrives. Send nothing; instead, when the program stops, the byte labelled `n` must hold how many non-zero bytes came in, and `last` the last of them (0 if there were none). Keep the labels n and last.'],
    hints: ['STA does not change the flags, so storing each byte in last after JZ is safe.', 'Count with LDA n / ADD #1 / STA n.', 'loop: IN / JZ done / STA last / LDA n / ADD #1 / STA n / JMP loop; done: HLT.'],
    solution: STORE, wrong: ['loop: IN\nJZ done\nSTA last\nJMP loop\ndone: HLT\nn: DB 0\nlast: DB 0', 'loop: IN\nSTA last\nJZ done\nLDA n\nADD #1\nSTA n\nJMP loop\ndone: HLT\nn: DB 0\nlast: DB 0'],
  });
  const MULT = 'IN\nSTA a\nIN\nSTA b\nLDA #0\nSTA p\nloop: LDA b\nJZ done\nSUB #1\nSTA b\nLDA p\nADD a\nSTA p\nJMP loop\ndone: LDA p\nOUT\nHLT\na: DB 0\nb: DB 0\np: DB 0';
  prog({
    id: 'p13x-mult', title: 'Multiply by repeated addition', level: 3, tests: [{ input: [6, 7] }, { input: [13, 0] }, { input: [0, 9] }, { input: [20, 20] }, { input: [255, 2] }], ref: MULT, start: '; read a and b, send a × b (modulo 256)\n',
    text: ['Read a and b and send a × b, modulo 256, by adding a to a total b times.'],
    hints: ['Keep a, the count b and the product p in memory, p starting at 0.', 'Loop: LDA b, JZ done, SUB #1, STA b, then LDA p, ADD a, STA p.', 'done: LDA p / OUT / HLT. Testing b first handles b = 0.'],
    solution: MULT, wrong: [MULT.replace('ADD a', 'ADD b'), MULT.replace('JZ done', 'JC done')],
  });
  const PARITY = 'IN\nSTA v\nLDA #8\nSTA k\nLDA #0\nSTA p\nloop: LDA v\nSHR\nSTA v\nJC one\nJMP next\none: LDA p\nNOT\nAND #1\nSTA p\nnext: LDA k\nSUB #1\nSTA k\nJZ done\nJMP loop\ndone: LDA p\nOUT\nHLT\nv: DB 0\nk: DB 0\np: DB 0';
  prog({
    id: 'p13x-parity', title: 'Odd parity', level: 3, tests: [{ input: [182] }, { input: [0] }, { input: [255] }, { input: [1] }, { input: [96] }], ref: PARITY, start: '; read a byte; send 1 if it has an odd number of 1 bits, else 0\n',
    text: ['Read a byte and send 1 if it has an odd number of 1 bits, 0 if even.'],
    hints: ['Shift the byte right eight times; each SHR puts the next bit in C.', 'Keep a parity bit p and flip it on every 1: LDA p, NOT, AND #1, STA p.', 'Count eight rounds with k; at the end, LDA p / OUT / HLT.'],
    solution: PARITY, wrong: [PARITY.replace('LDA #8', 'LDA #7'), PARITY.replace('JC one', 'JZ one')],
  });
  const TRIPLE = 'loop: IN\nJZ done\nCALL tri\nOUT\nJMP loop\ndone: HLT\ntri: STA t\nADD t\nADD t\nRET\nt: DB 0';
  prog({
    id: 'p13x-triple-sub', title: 'A subroutine that triples', level: 3, tests: [{ input: [1, 2, 50, 100, 0] }, { input: [0] }, { input: [85, 86, 0] }], ref: TRIPLE, start: '; read bytes until a 0; send each one times 3 (modulo 256)\n; do the tripling in a subroutine, called with CALL and left with RET\n',
    text: ['Read bytes until a 0 arrives and send each one multiplied by 3 (modulo 256). Do the multiplying in a subroutine that takes the byte in AC and returns the result in AC.'],
    hints: ['The subroutine: keep AC in memory, then add it twice.', 'tri: STA t / ADD t / ADD t / RET.', 'loop: IN / JZ done / CALL tri / OUT / JMP loop; done: HLT.'],
    solution: TRIPLE, wrong: [TRIPLE.replace('ADD t\nADD t', 'ADD t'), 'loop: IN\nJZ done\nCALL tri\nOUT\nJMP loop\ndone: HLT\ntri: STA t\nADD t\nADD t\nt: DB 0'],
  });

  // =========================================================================================================
  // Tour and course
  // =========================================================================================================
  C.tour({
    id: 'p13-tour', title: 'Tour: a small processor', blurb: 'The datapath, the instruction formats, the assembler, the two control units and programs running.',
    steps: [
      { route: 'part=cpu', text: 'Part 13 builds a whole processor: an 8-bit accumulator machine with sixteen instructions, its datapath, its control and its programs.' },
      { route: 'topic=cpu-datapath', target: '#inputs', text: 'Type register transfers, one cycle per semicolon, and watch them on the bus. Try two sources at once to see the conflict.' },
      { route: 'topic=cpu-formats', target: '#inputs', text: 'Type any instruction and see its bytes, its opcode and mode bits, and where its operand leads in memory.' },
      { route: 'topic=cpu-assemble', target: '#stageWrap', text: 'The assembler\'s two passes, line by line: first the addresses of the labels, then the bytes.' },
      { route: 'topic=cpu-fetch', target: '#stageWrap', text: 'Fetch, decode, execute, one clock cycle at a time, with every bus transfer shown.' },
      { route: 'topic=cpu-micro', target: '#stageWrap', text: 'The same program under microprogrammed control: the control memory word at each step, the mapping, and a check against the hard-wired unit.' },
      { route: 'topic=cpu-programs', target: '#inputs', text: 'Whole programs running: the listing with the current line lit, the registers, and the output.' },
      { route: 'learn', target: '[data-chapter="p13-ch-programs"]', text: 'Your turn: the program exercises are checked by running your code on several test inputs.' },
    ],
  });
  C.course({
    id: 'p13-course', title: 'A small processor, from bus to programs',
    blurb: 'Every topic of Part 13 in order, with the lessons that explain them and exercises to try on the way.',
    steps: [
      { topic: 'cpu-datapath', note: 'Registers on one bus.' },
      { lesson: 'p13l-datapath' },
      { topic: 'cpu-formats', note: 'One byte or two; three modes.' },
      { exercise: 'p13x-asm-imm', note: 'Assemble one instruction by hand.' },
      { topic: 'cpu-assemble', note: 'The two passes.' },
      { exercise: 'p13x-label', note: 'Find a label\'s address.' },
      { topic: 'cpu-fetch', note: 'Fetch, decode, execute.' },
      { lesson: 'p13l-cycle' },
      { topic: 'cpu-exec', note: 'Every kind of instruction, executed.' },
      { exercise: 'p13x-trace', note: 'Trace the registers yourself.' },
      { topic: 'cpu-hardwired', note: 'Control as logic.' },
      { topic: 'cpu-micro', note: 'Control as memory.' },
      { lesson: 'p13l-micro' },
      { topic: 'cpu-programs', note: 'Programs running line by line.' },
      { lesson: 'p13l-programs' },
      { exercise: 'p13x-countdown', note: 'A first loop.' },
      { exercise: 'p13x-min', note: 'Compare with SUB and JC.' },
    ],
  });

  if (S.Checks) {
    const ready = (sel) => "document.querySelector('" + sel + "')";
    for (const l of C.lessons.values()) if (/^p13l-/.test(l.id)) S.Checks.push({ group: 'learn', name: 'p13 lesson ' + l.id, hash: 'lesson=' + l.id, ready: ready('#lessonView'), sel: '#main' });
    for (const id of ['p13x-disasm', 'p13x-trace', 'p13x-min', 'p13x-store', 'p13x-micro-words']) S.Checks.push({ group: 'learn', name: 'p13 exercise ' + id, hash: 'exercise=' + id, ready: ready('#exerciseView'), sel: '#main' });
    S.Checks.push({ group: 'courses', name: 'p13 course', hash: 'course=p13-course', ready: ready('#courseView'), sel: '#main' });
  }
})(globalThis.Sirkit = globalThis.Sirkit || {});
