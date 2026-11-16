import { featScalp, statusTeks, konfirmasi } from '../core.mjs';
import { evaluate, selectScan, riskPlan, ALASAN } from '../gate.mjs';
import { sineRange, withLongSweep, withShortSweep, withDeepSweep } from '../fixtures.mjs';

let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { if (c) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  GAGAL', name, extra); } };

const btcFlat = { season: 0, mid: true, ret12: 0, s: 'BTC' };
const stamp = (f, s = 'SOL') => { f.s = s; f.qv = 8e7; f.sumber = 'binance-perp'; return f; };

console.log('\n[1] sapuan long di tepi range');
{
  const f = stamp(featScalp(withLongSweep()));
  const g = evaluate(f, { btc: btcFlat });
  ok(f.side === 1, 'arah long', JSON.stringify({ side: f.side, pos: f.pos, box: f.boxValid, why: f.why, tags: f.tags, H: f.H, L: f.L, px: f.px }));
  ok(f.why.some(w => /deviasi bawah|Monday Low/.test(w)), 'ada pemicu reclaim', f.why.join(' | '));
  ok(g.ok, 'lolos gerbang', g.reasons.join(','));
  ok(f.slp <= 4.5 && f.slp >= 0.4, 'SL di pita scalp', String(f.slp));
  ok(f.rr >= 1.5, 'RR cukup', String(f.rr));
  ok(f.entry < f.px, 'entry limit di bawah harga, bukan kejar', `${f.entry} vs ${f.px}`);
}

console.log('\n[2] sapuan short');
{
  const f = stamp(featScalp(withShortSweep()));
  const g = evaluate(f, { btc: btcFlat });
  ok(f.side === -1, 'arah short', JSON.stringify({ side: f.side, pos: f.pos, why: f.why, px: f.px, H: f.H, L: f.L, box: f.boxValid }));
  ok(g.ok, 'lolos gerbang', g.reasons.join(','));
  ok(f.entry > f.px, 'entry limit di atas harga', `${f.entry} vs ${f.px}`);
}

console.log('\n[3] mid-range tanpa sapuan = diam');
{
  const f = stamp(featScalp(sineRange()));
  ok(f.side === 0, 'tidak ada sisi', statusTeks(f) + ' pos ' + f.pos);
  ok(!evaluate(f, { btc: btcFlat }).ok, 'gerbang menolak kekosongan');
}

console.log('\n[4] stop terlalu lebar ditolak, angka SL tidak dipersempit diam-diam');
{
  const f = stamp(featScalp(withDeepSweep()));
  const g = evaluate(f, { btc: btcFlat });
  ok(f.side === 1, 'setup tetap terlihat supaya bisa diaudit', String(f.side));
  ok(f.slp > 4.5, 'SL memang lebar', String(f.slp));
  ok(!g.ok && g.reasons.includes('SL_TERLALU_LEBAR'), 'ditolak SL lebar', g.reasons.join(','));
}

console.log('\n[5] BTC yang sedang menjatuh mengunci long altcoin');
{
  const f = stamp(featScalp(withLongSweep()), 'PEPE');
  const g = evaluate(f, { btc: { season: -1, mid: false, ret12: -0.03 } });
  ok(!g.ok && g.reasons.includes('BTC_MENYERANG'), 'BTC menyerang', g.reasons.join(','));
  const okMid = evaluate(f, { btc: { season: -1, mid: true, ret12: -0.03 } });
  ok(okMid.ok, 'BTC di mid-range tidak menutup scalp alt', okMid.reasons.join(','));
}

console.log('\n[6] batas jumlah sinyal dan risiko');
{
  const mk = i => ({ f: { s: 'C' + i, side: 1, dist: i / 100 }, g: { ok: true, score: 10 - i } });
  const { keep, drop } = selectScan([0, 1, 2, 3, 4, 5].map(mk));
  ok(keep.length === 3, 'maks 3 long per scan', String(keep.length));
  ok(drop.length === 3, 'sisanya dibuang', String(drop.length));
  const p = riskPlan({ capital: 1000, riskPct: 5, entry: 100, sl: 98, lulus: false });
  ok(p.riskPctEff === 0.25, 'risiko dikunci 0,25% sebelum lulus', String(p.riskPctEff));
  ok(p.leverage < 1, 'leverage tersirat kecil pada SL 2%', String(p.leverage));
}

console.log('\n[7] 15m yang menutup melewati SL membatalkan');
{
  const f = stamp(featScalp(withLongSweep()));
  const bad = konfirmasi([{ t: 1, o: f.sl - 1, h: f.entry, l: f.sl - 1, c: f.sl - 0.1 }], f);
  ok(bad[0] === 'bad', '15m batal', bad.join(' '));
}

console.log('\n[8] peta alasan lengkap');
ok(ALASAN.SL_TERLALU_LEBAR && ALASAN.BTC_MENYERANG && ALASAN.ENTRY_TERLALU_JAUH, 'kode alasan punya teks');

console.log(`\n${fail ? 'GAGAL' : 'LULUS'}: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
