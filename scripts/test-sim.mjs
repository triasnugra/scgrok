import { gradeTrade } from '../trade-sim.mjs';

let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { if (c) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  GAGAL', name, extra); } };
const m = 60e3;
const bar = (i, o, h, l, c) => ({ ot: i * 5 * m, o, h, l, c, ct: i * 5 * m + 5 * m - 1 });

console.log('\n[sim]');
{
  const r = { arah: 'LONG', entry: 100, sl: 99, tp: 102, t: 10 * m, due: 80 * m };
  const g = await gradeTrade(r, { now: 90 * m, bars: async () => [bar(2, 100.4, 100.6, 100.2, 100.5), bar(4, 100.5, 100.8, 99.9, 100.2), bar(6, 100.2, 102.1, 100.1, 101.8)] });
  ok(g.hasil === 'TP' && g.R > 1.5, 'TP setelah terisi', JSON.stringify(g));
}
{
  const r = { arah: 'LONG', entry: 100, sl: 99, tp: 102, t: 10 * m, due: 80 * m };
  const g = await gradeTrade(r, { now: 90 * m, bars: async () => [bar(2, 100.2, 100.4, 98.5, 99.2)] });
  ok(g.hasil === 'SL' && g.R === -1, 'candle pengisi yang menyentuh SL dihitung SL', JSON.stringify(g));
}
{
  const r = { arah: 'SHORT', entry: 100, sl: 101, tp: 97, t: 10 * m, due: 40 * m };
  const g = await gradeTrade(r, { now: 90 * m, bars: async () => [bar(2, 99.2, 99.6, 99.0, 99.3)] });
  ok(g.hasil === 'tidak terisi' && g.R === 0, 'limit yang tidak tersentuh bukan menang', JSON.stringify(g));
}
{
  const r = { arah: 'LONG', entry: 100, sl: 99, tp: 102, t: 10 * m, due: 80 * m };
  const g = await gradeTrade(r, { now: 30 * m, bars: async () => [bar(2, 100.4, 100.5, 100.3, 100.4)] });
  ok(g === null, 'belum jatuh tempo tetap null', JSON.stringify(g));
}
{
  const r = { arah: 'LONG', entry: 100, sl: 99, tp: 102, t: 1, due: 10 * m };
  const amb = { ot: 0, o: 100.5, h: 102, l: 98, c: 100, ct: 5 * m };
  const upFirst = [
    { ot: 1000, o: 100.3, h: 100.4, l: 99.96, c: 100.2, ct: 2000 },
    { ot: 2000, o: 100.2, h: 102.1, l: 100.1, c: 102, ct: 3000 },
  ];
  const g = await gradeTrade(r, { now: 20 * m, bars: async () => [amb], m1: async () => upFirst });
  ok(g.hasil === 'TP', '1 menit memutus urutan: TP sebelum SL', JSON.stringify(g));
}

console.log(`\n${fail ? 'GAGAL' : 'LULUS'}: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
