import fs from 'node:fs';
import { rawKlines, klines, tickers, skipSymbol, featScalp, scanInput, alertList, konfirmasi } from '../core.mjs';
import { gradeTrade, mapK } from '../trade-sim.mjs';
import { CFG, HIPOTESIS, evaluate, selectScan, validateSymbol } from '../gate.mjs';
import { engineHash, sealRow, lastSealed, ensureProtocol, PROTOCOL_FILE } from '../forward-lib.mjs';

const F = 'data/journal.json';
const GL = 'data/gate-log.json';
const AG = 'Eliz Scalp';
const HOLD = CFG.holdJam * 36e5;
const read = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const ENGINE = engineHash(read('../core.mjs'), read('../gate.mjs'), read('../trade-sim.mjs'), JSON.stringify(CFG));

const PROMPT = `Kamu peninjau scalping, bukan pengambil keputusan harga.
Kamu HANYA boleh memakai doktrin scalp: tepi range H1, sapuan likuiditas lalu reclaim, retest, invalidasi pendek, musim 4 jam, BTC sebagai konteks.
DILARANG mengusulkan entry, SL, atau TP yang berbeda dari angka yang diberikan.
DILARANG memakai materi swing dari video: akumulasi spot, target makro, ETF, moonbag, hold berhari-hari, SL 10-15%.
Jika ragu, jawab TOLAK.
Jawab HANYA JSON: {"keputusan":"SETUJU|TOLAK|TUNGGU","alasan":"maks 24 kata"}`;

const rows = fs.existsSync(F) ? JSON.parse(fs.readFileSync(F, 'utf8')) : [];
const ids = new Set(rows.map(r => r.id));
const gateLog = fs.existsSync(GL) ? JSON.parse(fs.readFileSync(GL, 'utf8')) : [];
const glIds = new Set(gateLog.map(x => x.id));
const logGate = e => { if (glIds.has(e.id)) return; glIds.add(e.id); gateLog.push(e); };

const PROTO = ensureProtocol(ENGINE, PROTOCOL_FILE, Date.now(), { agen: AG, hipotesis: HIPOTESIS, cfg: CFG });
if (PROTO.created) console.log('Protokol forward DIMULAI', PROTO.mulai, ENGINE);
else if (PROTO.engine !== ENGINE) console.log('PERINGATAN: mesin berubah. Baris baru tidak masuk uji sampai protokol baru. Hash sekarang', ENGINE, 'protokol', PROTO.engine);

const q = v => +Number(v).toPrecision(6);
function addRow(aset, f, al, eng = ENGINE) {
  const hour = new Date(f.tSignal).toISOString().slice(0, 13);
  const id = `${hour}|${AG}|${aset}`;
  const bad = validateSymbol(aset);
  if (bad) { logGate({ id: `${hour}|${aset}`, d: hour, aset, v: 'TOLAK', alasan: [bad] }); return; }
  if (ids.has(id)) return;
  ids.add(id);
  const t = Date.now();
  const row = {
    id, waktu: new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC', t, due: t + HOLD,
    agen: AG, aset, arah: f.side === 1 ? 'LONG' : 'SHORT',
    entry: q(f.entry), sl: q(f.sl), tp: q(f.tp), harga_awal: q(f.px),
    alasan: f.why.join(', ').slice(0, 180), alert: al, hasil: 'menunggu', R: '',
    engine: eng, venue: 'binance-perp', trig: f.trig, skor: f._score ?? '',
  };
  sealRow(row, lastSealed(rows));
  rows.push(row);
}

async function grade(r) {
  const sym = r.aset + 'USDT';
  const start = Math.floor(r.t / 300000) * 300000;
  const g = await gradeTrade(r, {
    bars: async () => (await rawKlines(sym, '5m', `&startTime=${start}`)).map(mapK),
    m1: async (a, b) => (await rawKlines(sym, '1m', `&startTime=${a}&endTime=${b}`)).map(mapK),
  });
  if (g) { r.hasil = g.hasil; r.R = +g.R.toFixed(3); r.tx = g.t; }
}

for (const r of rows.filter(x => x.hasil === 'menunggu')) {
  try { await grade(r); } catch (e) { console.log('nilai gagal', r.id, e.message); }
}

const alerts = alertList().map(a => a[1]).join(' | ');
let sumber = 'binance-perp';
const { rows: tick, sumber: ts } = await tickers();
sumber = ts;
const top = tick
  .filter(x => x.symbol?.endsWith('USDT') && !skipSymbol(x.symbol.slice(0, -4)))
  .sort((a, b) => +b.quoteVolume - +a.quoteVolume)
  .slice(0, 30);

const feats = [];
for (let i = 0; i < top.length; i += 6) {
  await Promise.all(top.slice(i, i + 6).map(async x => {
    try {
      const kl = await klines(x.symbol, '1h', 500);
      const sc = scanInput(kl.bars);
      const f = featScalp(sc.bars, { qv: +x.quoteVolume || sc.qv, sumber: kl.sumber });
      f.s = x.symbol.slice(0, -4);
      feats.push(f);
    } catch (e) { console.log('scan gagal', x.symbol, e.message); }
  }));
}
const btc = feats.find(f => f.s === 'BTC');
const cands = feats.filter(f => f.side);
const ev = cands.map(f => ({ f, g: evaluate(f, { btc }) }));
for (const x of ev) x.f._score = x.g.score;
const candleHour = feats[0] ? new Date(feats[0].tSignal).toISOString().slice(0, 13) : '';
const have = rows.filter(r => r.agen === AG && String(r.id).startsWith(candleHour + '|'));
const already = {
  total: have.length,
  long: have.filter(r => r.arah === 'LONG').length,
  short: have.filter(r => r.arah === 'SHORT').length,
};
const { keep, drop } = selectScan(ev.filter(x => x.g.ok), already);

for (const x of ev.filter(x => !x.g.ok)) logGate({ id: `${candleHour}|${x.f.s}`, d: candleHour, aset: x.f.s, arah: x.f.side === 1 ? 'LONG' : 'SHORT', v: 'TOLAK', alasan: x.g.reasons, skor: x.g.score });
for (const d of drop) logGate({ id: `${candleHour}|${d.item.f.s}`, d: candleHour, aset: d.item.f.s, v: 'TOLAK', alasan: [d.reason], skor: d.item.g.score });

const accepted = [];
for (const x of keep) {
  let cf = ['wait', ''];
  try {
    const m15 = (await klines(x.f.s + 'USDT', '15m', 40)).bars.filter(b => b.t + 15 * 60e3 <= Date.now());
    cf = konfirmasi(m15, x.f);
  } catch { cf = ['wait', '15m gagal']; }
  if (cf[0] === 'bad') {
    logGate({ id: `${candleHour}|${x.f.s}`, d: candleHour, aset: x.f.s, v: 'TOLAK', alasan: ['KONFIRMASI_15M_JELEK'], skor: x.g.score });
    continue;
  }
  x.f.cf = cf;
  logGate({ id: `${candleHour}|${x.f.s}`, d: candleHour, aset: x.f.s, arah: x.f.side === 1 ? 'LONG' : 'SHORT', v: 'LOLOS', alasan: [], skor: x.g.score, m15: cf[1] });
  addRow(x.f.s, x.f, alerts, PROTO.engine === ENGINE ? ENGINE : ENGINE);
  accepted.push(x.f);
}

async function review(f) {
  const body = PROMPT + '\n' + JSON.stringify({
    aset: f.s, arah: f.side === 1 ? 'LONG' : 'SHORT', entry: f.entry, sl: f.sl, tp: f.tp,
    sl_persen: +f.slp.toFixed(2), jarak_entry_persen: +f.dist.toFixed(2), musim: f.season, alasan: f.why,
  });
  const out = {};
  if (process.env.GEMINI_API_KEY) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-2.5-flash'}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: body }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
        signal: AbortSignal.timeout(40000),
      });
      const j = await r.json();
      const txt = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
      out.gemini = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    } catch (e) { out.gemini = { keputusan: 'TOLAK', alasan: 'panggilan gagal, gagal tertutup' }; console.log('gemini', e.message); }
  }
  if (process.env.XAI_API_KEY) {
    try {
      const r = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.XAI_API_KEY },
        body: JSON.stringify({ model: process.env.XAI_MODEL || 'grok-3-latest', temperature: 0, messages: [{ role: 'user', content: body }] }),
        signal: AbortSignal.timeout(40000),
      });
      const j = await r.json();
      const txt = j.choices?.[0]?.message?.content || '';
      out.grok = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    } catch (e) { out.grok = { keputusan: 'TOLAK', alasan: 'panggilan gagal, gagal tertutup' }; console.log('grok', e.message); }
  }
  return out;
}

if (process.env.USE_AI === '1') {
  for (const f of accepted) {
    const row = rows.find(r => r.aset === f.s && r.hasil === 'menunggu' && !r.ai);
    if (!row) continue;
    row.ai = await review(f);
  }
}

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync(F, JSON.stringify(rows, null, 1));
fs.writeFileSync(GL, JSON.stringify(gateLog.slice(-2000), null, 1));
console.log('kandidat', cands.length, 'lolos', accepted.length, 'sumber', sumber, 'baris', rows.length, 'ujung', rows.filter(r => r.h).at(-1)?.h || '-');
