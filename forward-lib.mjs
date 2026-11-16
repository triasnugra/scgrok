// Forward test scalp: sinyal disegel sebelum hasilnya ada.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { summarize, bootCI, FILLED } from './stats.mjs';

export const PROTOCOL_FILE = 'data/forward-protocol.json';
export const MIN_SIGNALS = 120;
export const MIN_WEEKS = 12;
export const RES = h => h === 'TP' || h === 'SL' || h === 'kedaluwarsa' || h === 'tidak terisi';

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
export const engineHash = (...texts) => sha(texts.map(t => String(t).replace(/\r\n/g, '\n')).join('\u0000')).slice(0, 16);

const SEAL = ['id', 't', 'due', 'agen', 'aset', 'arah', 'entry', 'sl', 'tp', 'harga_awal', 'alasan', 'alert', 'engine', 'venue'];
const canon = r => JSON.stringify(SEAL.map(k => (r[k] === undefined ? null : r[k])));
const link = (prev, seq, r) => sha(`${prev}|${seq}|${canon(r)}`).slice(0, 20);

export const lastSealed = rows => {
  let m = null;
  for (const r of rows) if (r.fwd && (!m || r.seq > m.seq)) m = r;
  return m;
};

export function sealRow(row, prev) {
  row.fwd = 1;
  row.seq = (prev ? prev.seq : 0) + 1;
  row.prev = prev ? prev.h : 'GENESIS';
  row.h = link(row.prev, row.seq, row);
  return row;
}

export function verifyChain(rows) {
  const f = rows.filter(r => r.fwd).sort((a, b) => a.seq - b.seq), errors = [];
  let prev = 'GENESIS';
  f.forEach((r, i) => {
    if (r.seq !== i + 1) errors.push(`seq ${r.seq} tidak berurutan`);
    if (r.prev !== prev) errors.push(`baris ${r.id}: tautan putus`);
    if (r.h !== link(r.prev, r.seq, r)) errors.push(`baris ${r.id}: isi sinyal diubah setelah dicatat`);
    if (i && r.t < f[i - 1].t) errors.push(`baris ${r.id}: waktu mundur`);
    prev = r.h;
  });
  return { ok: !errors.length, n: f.length, head: f.length ? f.at(-1).h : null, errors };
}

export function makeProtocol(engine, now = Date.now(), o = {}) {
  return {
    versi: 1,
    mulai: new Date(now).toISOString(),
    mulai_ms: now,
    engine,
    agen: o.agen || 'Eliz Scalp',
    aturan: {
      hold_jam: 12,
      maks_sl_persen: 4.5,
      min_sl_persen: 0.4,
      satu_order_aktif_per_koin: true,
      biaya: { fee_persen_per_sisi: 0.04, slip_persen: 0.04 },
      tp_kelipatan_risiko: 1.7,
    },
    syarat_evaluasi: { min_trade_terisi: MIN_SIGNALS, min_minggu_berbeda: MIN_WEEKS },
    kriteria_lulus: 'Setelah kedua syarat terpenuhi: batas bawah CI 95% (bootstrap per minggu) dari rata-rata R per trade terisi, setelah biaya, harus lebih dari 0.',
    hipotesis: o.hipotesis || [],
    konfigurasi_gerbang: o.cfg || null,
    larangan: [
      'Mengubah core.mjs, gate.mjs, atau trade-sim.mjs. Hash berubah. Hapus data/forward-protocol.json hanya bila kamu sadar uji dimulai dari nol.',
      'Mengubah syarat lulus setelah protokol dimulai.',
      'Mengedit entry, SL, TP, arah, atau waktu pada baris yang sudah disegel.',
      'Membaca angka kinerja sebagai bukti sebelum syarat terpenuhi.',
      'Memakai mesin ini untuk spot jangka panjang, akumulasi, atau target makro dari video YouTube. Itu di luar kontrak scalp.',
    ],
  };
}

export function ensureProtocol(engine, file = PROTOCOL_FILE, now = Date.now(), o = {}) {
  if (fs.existsSync(file)) return { ...JSON.parse(fs.readFileSync(file, 'utf8')), created: false };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const p = makeProtocol(engine, now, o);
  fs.writeFileSync(file, JSON.stringify(p, null, 1));
  return { ...p, created: true };
}

const costPct = P => 2 * P.aturan.biaya.fee_persen_per_sisi + P.aturan.biaya.slip_persen;
const netRow = (r, P) => ({
  hasil: r.hasil,
  R: FILLED(r.hasil) ? r.R - costPct(P) / ((Math.abs(r.entry - r.sl) / r.entry) * 100) : 0,
  exitT: r.tx ?? r.due,
  t: r.t,
});

export function pickSignals(rows, P) {
  const base = rows.filter(r => r.fwd && r.agen === P.agen && r.t >= P.mulai_ms && (r.arah === 'LONG' || r.arah === 'SHORT') && r.hasil !== 'tidak valid' && r.hasil !== 'NO_TRADE');
  const same = base.filter(r => r.engine === P.engine).sort((a, b) => a.t - b.t);
  const other = base.length - same.length;
  const busy = new Map(), kept = []; let skipped = 0;
  for (const r of same) {
    if (r.t < (busy.get(r.aset) ?? 0)) { skipped++; continue; }
    kept.push(r);
    busy.set(r.aset, RES(r.hasil) ? (r.tx ?? r.due) : Infinity);
  }
  return { kept, other, skipped };
}

export function analyze(rows, P, { peek = false, B = 4000, seed = 1 } = {}) {
  const chain = verifyChain(rows);
  const { kept, other, skipped } = pickSignals(rows, P);
  const done = kept.filter(r => RES(r.hasil));
  const pending = kept.length - done.length;
  const net = done.map(r => netRow(r, P));
  const S = summarize(net);
  const C = bootCI(net, { B, seed });
  const need = P.syarat_evaluasi;
  const weeks = C ? C.clusters : new Set(done.map(r => Math.floor((r.t - 4 * 864e5) / (7 * 864e5)))).size;
  const ready = S.filled >= need.min_trade_terisi && weeks >= need.min_minggu_berbeda;
  const out = {
    chain,
    protocol: { mulai: P.mulai, engine: P.engine, agen: P.agen },
    ready,
    locked: !ready && !peek,
    peek: !ready && peek,
    counts: {
      tercatat_sesuai_protokol: kept.length, selesai: done.length, menunggu: pending,
      terisi: S.filled, minggu_berbeda: weeks, diabaikan_mesin_lain: other, dilewati_dedupe: skipped,
    },
    progress: { trade_terisi: [S.filled, need.min_trade_terisi], minggu: [weeks, need.min_minggu_berbeda] },
  };
  if (!ready && !peek) return out;
  out.hasil = { strategi: { ...S, ci: C } };
  out.verdict = ready
    ? { pass: !!(C && C.lo > 0), why: C && C.lo > 0 ? 'batas bawah CI 95% R/trade di atas 0' : 'batas bawah CI 95% R/trade tidak di atas 0' }
    : { pass: null, why: 'INTIP: syarat belum terpenuhi, angka ini bukan bukti' };
  return out;
}

const rr = x => (Number.isFinite(x) ? (x >= 0 ? '+' : '') + x.toFixed(2) : '-');
const ci = c => (c ? `[${rr(c.lo)}, ${rr(c.hi)}]` : 'n/a');

export function renderForward(a) {
  const c = a.counts, p = a.progress;
  let md = `# Forward test scalp\n\n`;
  md += `- Mulai: ${a.protocol.mulai}\n- Agen: ${a.protocol.agen}\n- Mesin: ${a.protocol.engine}\n`;
  md += `- Integritas: ${a.chain.ok ? `OK (${a.chain.n} baris, ujung ${a.chain.head})` : 'RUSAK: ' + a.chain.errors.join('; ')}\n`;
  md += `- Tercatat: ${c.tercatat_sesuai_protokol}, selesai ${c.selesai}, menunggu ${c.menunggu}, terisi ${c.terisi}\n\n`;
  md += `## Kemajuan\n\n- Trade terisi: ${p.trade_terisi[0]} / ${p.trade_terisi[1]}\n- Minggu: ${p.minggu[0]} / ${p.minggu[1]}\n\n`;
  if (a.locked) {
    md += `Angka kinerja disembunyikan sampai syarat terpenuhi. Mengintip lalu mengubah aturan merusak uji.\n`;
    return md;
  }
  const s = a.hasil.strategi;
  if (a.peek) md += `> INTIP. Bukan hasil sah.\n\n`;
  md += `R/trade ${rr(s.mean)} · CI 95% ${ci(s.ci)} · total ${rr(s.total)} · max DD ${s.maxDD.toFixed(1)}R\n\n`;
  md += `**${a.verdict.pass === null ? 'TIDAK SAH' : a.verdict.pass ? 'LULUS' : 'TIDAK LULUS'}.** ${a.verdict.why}\n`;
  if (a.verdict.pass) md += `\nLulus bukan jaminan bulan depan. Naikkan ukuran pelan. Batas sesudah lulus tetap 0,5% risiko akun per trade.\n`;
  return md;
}
