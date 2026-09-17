// The part 5 and part 7 topics, run with every preset (and a spread of other inputs) with the narration's
// self-check on: every value a frame's text quotes must be what the simulation (and so the drawing) shows at
// that frame. Prints "topics-timing N passed, M failed".
import { load, harness } from './load.mjs';
const S = load(['core', 'schematic', 'stage', 'topics']);
const t = harness('topics-timing');
S.Kit.timing.strict = true;
const extra = {
  'clock-skew': [0, 1, 2, 3, 4, 5, 6].flatMap((skew) => [1, 2, 3, 5, 8].map((depth) => ({ skew, depth }))),
  'min-period': [40, 50, 60, 66, 74, 90].flatMap((period) => [1, 3, 6, 9].map((depth) => ({ period, depth }))),
  'setup-hold': [-30, -12, -11, -5, -1, 0, 1, 2, 3, 4, 6, 20].map((off) => ({ off })),
  'counter-lockout': ['mod6', 'jlock', 'jfix'].flatMap((design) => [0, 1, 2, 3, 4, 5, 6, 7].map((start) => ({ design, start }))),
  'sr-race': [[9, 9, 0], [12, 9, 0], [9, 12, 0], [9, 9, 3], [9, 9, -3], [5, 20, 10]].map(([d1, d2, gap]) => ({ d1, d2, gap })),
};
for (const tp of S.topics) {
  if (!/^p[57]-/.test(tp.family)) continue;
  const inputs = [{}].concat((tp.presets || []).map((p) => p.values), extra[tp.id] || []);
  for (const v of inputs) {
    const inp = S.inputOf(tp, Object.assign(S.inputOf(tp), v));
    if (S.checkInput(tp, inp)) continue;
    const r = S.run(tp, inp);
    t.ok(r.ok, tp.id + ' ' + JSON.stringify(v) + ': ' + (r.error || ''));
  }
}
t.done();
