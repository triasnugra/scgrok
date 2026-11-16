// Gerbang kualitas scalp. Hanya MENOLAK. Tidak mengubah entry, SL, atau TP.
// Ambang ada di CFG. Mengubah CFG mengubah hash mesin dan membatalkan forward test yang sedang berjalan.

export const CFG = Object.freeze({
  versi: 1,
  maxSlPct: 4.5,
  minSlPct: 0.4,
  minRR: 1.5,
  maxTpPct: 8,
  minQuoteVolUsd: 2e7,
  maxDistPct: 1.6,
  maxTriggerAgeH: 6,
  counterSeasonMinStruct: 3,
  maxSignalsPerScan: 4,
  maxSameSidePerScan: 3,
  btcShockPct: 1.8,
  holdJam: 12,
});

export const HIPOTESIS = [
  'H1: setup tanpa pemicu keras (deviasi, Monday sweep, atau breakout-retest), SL di luar 0,4–4,5%, RR di bawah 1,5, atau TP lebih jauh dari 8% bukan scalp dan tidak dicatat.',
  'H2: entry limit yang lebih jauh dari 1,6% harga scan, atau pemicu yang lebih tua dari 6 jam, lebih sering tidak terisi atau terisi di rezim lain.',
  'H3: scalp melawan musim 4H tanpa minimal 3 elemen struktur memberi R/trade lebih buruk daripada scalp searah musim.',
  'H4: altcoin long saat BTC sedang musim short, tidak di mid-range, dan sudah bergerak lebih dari 1,8% dalam 12 jam melawan arah trade, lebih sering kena SL. Saat BTC sendiri di mid-range, altcoin tetap boleh di-scalp di tepi rangenya.',
  'H5: lebih dari 4 sinyal baru per jam saling berkorelasi. Batas ini menurunkan risiko tersembunyi.',
  'Keputusan: mesin ini layak dinaikkan ukurannya hanya bila forward test LULUS (batas bawah CI 95% R/trade setelah biaya > 0, minimal 120 trade terisi dan 12 minggu). Sebelum itu risiko akun dibatasi 0,25% per trade.',
];

const ok = x => Number.isFinite(+x) && x !== '' && x !== null;
export const SYMBOL_RE = /^[A-Z0-9]{2,20}$/;

export function validateSymbol(s) {
  if (s === undefined || s === null || String(s).trim() === '') return 'SYMBOL_KOSONG';
  if (!SYMBOL_RE.test(String(s))) return 'SYMBOL_ANEH';
  return null;
}

export function validateSetup(f, cfg = CFG) {
  const R = [], sy = validateSymbol(f.s);
  if (sy) R.push(sy);
  if (!f.side) { R.push('TIDAK_ADA_SETUP'); return R; }
  if (![f.px, f.entry, f.sl, f.tp].every(ok) || !(f.px > 0) || !(f.entry > 0)) { R.push('DATA_TIDAK_VALID'); return R; }
  const s = f.side;
  if (s !== 1 && s !== -1) { R.push('ARAH_TIDAK_VALID'); return R; }
  if (!(s * (f.entry - f.sl) > 0 && s * (f.tp - f.entry) > 0)) { R.push('URUTAN_HARGA_SALAH'); return R; }
  const slp = (Math.abs(f.entry - f.sl) / f.entry) * 100;
  const rr = Math.abs(f.tp - f.entry) / Math.abs(f.entry - f.sl);
  const tpPct = Math.abs(f.tp - f.entry) / f.entry * 100;
  if (slp > cfg.maxSlPct) R.push('SL_TERLALU_LEBAR');
  if (slp < cfg.minSlPct) R.push('SL_TERLALU_TIPIS');
  if (rr < cfg.minRR) R.push('RR_KURANG');
  if (tpPct > cfg.maxTpPct) R.push('TP_BUKAN_SCALP');
  if (ok(f.qv) && f.qv < cfg.minQuoteVolUsd) R.push('VOLUME_TIPIS');
  if (f.sumber === 'binance-spot-fallback') R.push('SUMBER_BUKAN_PERP');
  return R;
}

export function score(f) {
  return (f.struct || 0) + (f.season === f.side ? 1 : 0) + (f.rsiDiv === f.side ? 1 : 0) + (f.volSpike ? 1 : 0);
}

export function evaluate(f, ctx = {}, cfg = CFG) {
  const reasons = validateSetup(f, cfg);
  if (reasons.some(r => ['SYMBOL_KOSONG', 'SYMBOL_ANEH', 'TIDAK_ADA_SETUP', 'DATA_TIDAK_VALID', 'ARAH_TIDAK_VALID', 'URUTAN_HARGA_SALAH'].includes(r)))
    return { ok: false, reasons, score: 0 };
  const sc = score(f);
  const dist = ok(f.dist) ? f.dist : Math.abs(f.px - f.entry) / f.px * 100;
  if (dist > cfg.maxDistPct) reasons.push('ENTRY_TERLALU_JAUH');
  if (f.stale) reasons.push('SETUP_BASI_TP_SUDAH_TERSENTUH');
  if (ok(f.triggerAgeH) && f.triggerAgeH > cfg.maxTriggerAgeH) reasons.push('TRIGGER_BASI');
  if (f.season && f.season !== f.side && (f.struct || 0) < cfg.counterSeasonMinStruct) reasons.push('MELAWAN_MUSIM_TANPA_STRUKTUR');
  if (f.s !== 'BTC') {
    if (!ctx.btc) reasons.push('BTC_TIDAK_TERSEDIA');
    else if (ctx.btc.season === -f.side && !ctx.btc.mid && ctx.btc.ret12 * -f.side >= cfg.btcShockPct / 100) reasons.push('BTC_MENYERANG');
  }
  if (f.mondayForming && (f.trig === 'mon')) reasons.push('MONDAY_MASIH_KOTOR');
  return { ok: !reasons.length, reasons, score: sc };
}

export function selectScan(items, already = {}, cfg = CFG) {
  const sorted = [...items].sort((a, b) => b.g.score - a.g.score || (a.f.dist || 0) - (b.f.dist || 0) || String(a.f.s).localeCompare(String(b.f.s)));
  let tot = already.total || 0, lg = already.long || 0, sh = already.short || 0;
  const keep = [], drop = [];
  for (const it of sorted) {
    const isL = it.f.side === 1;
    if (tot >= cfg.maxSignalsPerScan || (isL ? lg : sh) >= cfg.maxSameSidePerScan) { drop.push({ item: it, reason: 'DI_LUAR_BATAS_SCAN' }); continue; }
    keep.push(it); tot++; if (isL) lg++; else sh++;
  }
  return { keep, drop };
}

export const RISK_CAP = Object.freeze({ belumLulus: 0.25, lulus: 0.5, risikoTerbukaMaks: 1.5, leverageMaks: 3 });

export function riskPlan({ capital, riskPct, entry, sl, lulus = false }) {
  const cap = lulus ? RISK_CAP.lulus : RISK_CAP.belumLulus;
  const req = +riskPct || 0, eff = Math.min(Math.max(req, 0), cap), notes = [];
  if (!(capital > 0) || !(entry > 0) || !(sl > 0) || entry === sl) return { riskPctEff: 0, riskUsd: 0, qty: 0, notional: 0, leverage: 0, notes: ['data posisi tidak lengkap'] };
  if (req > cap) notes.push(`risiko dibatasi ${cap}% (diminta ${req}%)${lulus ? '' : ': forward test belum lulus'}`);
  const riskUsd = capital * eff / 100;
  const qty = riskUsd / Math.abs(entry - sl);
  const notional = qty * entry;
  const leverage = notional / capital;
  const slp = Math.abs(entry - sl) / entry * 100;
  if (leverage > RISK_CAP.leverageMaks) notes.push(`leverage tersirat ${leverage.toFixed(2)}x melebihi batas ${RISK_CAP.leverageMaks}x. Kurangi risiko atau lebarkan hanya jika SL memang seketat itu dan akun mengizinkan. Order live akan ditolak.`);
  notes.push(`jarak SL harga ${slp.toFixed(2)}%`);
  return { riskPctEff: eff, riskUsd, qty, notional, leverage, notes };
}

export function readiness(a) {
  if (!a) return { lulus: false, items: [{ ok: false, t: 'Forward test belum berjalan' }] };
  const p = a.progress || {}, items = [
    { ok: !!(a.chain && a.chain.ok), t: 'Rantai hash jurnal utuh' },
    { ok: !!p.trade_terisi && p.trade_terisi[0] >= p.trade_terisi[1], t: `Trade terisi ${p.trade_terisi ? p.trade_terisi[0] + '/' + p.trade_terisi[1] : '-'}` },
    { ok: !!p.minggu && p.minggu[0] >= p.minggu[1], t: `Minggu berbeda ${p.minggu ? p.minggu[0] + '/' + p.minggu[1] : '-'}` },
    { ok: !!(a.ready && a.verdict && a.verdict.pass === true), t: a.ready ? (a.verdict?.pass ? 'CI 95% bawah R/trade > 0: LULUS' : 'CI 95% tidak di atas 0: TIDAK LULUS') : 'Keputusan dikunci sampai syarat terpenuhi' },
  ];
  return { lulus: items.every(i => i.ok), items };
}

export const ALASAN = {
  SYMBOL_KOSONG: 'symbol kosong',
  SYMBOL_ANEH: 'symbol aneh',
  TIDAK_ADA_SETUP: 'tidak ada setup',
  DATA_TIDAK_VALID: 'angka tidak valid',
  ARAH_TIDAK_VALID: 'arah tidak valid',
  URUTAN_HARGA_SALAH: 'urutan entry/SL/TP salah',
  SL_TERLALU_LEBAR: 'SL lebih dari 4,5% (bukan scalp)',
  SL_TERLALU_TIPIS: 'SL lebih tipis dari 0,4% (habis di noise dan biaya)',
  RR_KURANG: 'RR di bawah 1,5',
  TP_BUKAN_SCALP: 'TP lebih jauh dari 8%',
  VOLUME_TIPIS: 'volume 24 jam di bawah $20 juta',
  SUMBER_BUKAN_PERP: 'harga dari spot karena perp gagal dijangkau',
  ENTRY_TERLALU_JAUH: 'entry lebih dari 1,6% dari harga (menggantung / mengejar)',
  SETUP_BASI_TP_SUDAH_TERSENTUH: 'basi: harga sudah menyentuh TP',
  TRIGGER_BASI: 'pemicu lebih tua dari 6 jam',
  MELAWAN_MUSIM_TANPA_STRUKTUR: 'melawan musim 4H tanpa 3 elemen struktur',
  BTC_TIDAK_TERSEDIA: 'data BTC tidak ada',
  BTC_MENYERANG: 'BTC sedang bergerak keras melawan arah altcoin ini',
  MONDAY_MASIH_KOTOR: 'Monday range belum selesai',
  DI_LUAR_BATAS_SCAN: 'di luar batas 4 sinyal per scan',
  KONFIRMASI_15M_JELEK: 'close 15m sudah melewati SL',
};
