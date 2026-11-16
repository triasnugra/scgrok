// Tiket order. Default: kering (tidak mengirim apa pun).
// Live hanya bila tiga kunci environment hidup DAN (forward lulus ATAU ALLOW_UNPROVEN=YES).
// Akun harus one-way. Leverage di bursa diset manual, maksimal 3x. Mesin tidak mengubah leverage.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { riskPlan, readiness, RISK_CAP } from '../gate.mjs';

const F = 'data/journal.json';
const rows = fs.existsSync(F) ? JSON.parse(fs.readFileSync(F, 'utf8')) : [];
const report = fs.existsSync('data/forward-report.json') ? JSON.parse(fs.readFileSync('data/forward-report.json', 'utf8')) : null;
const liveArg = process.argv.includes('--live') ? process.argv[process.argv.indexOf('--live') + 1] : '';
const send = process.argv.includes('--send');
const capital = +(process.env.CAPITAL_USD || 0);
const riskPct = +(process.env.RISK_PCT || 0.25);
const lulus = readiness(report).lulus;

function liveAllowed() {
  if (!send) return { ok: false, dry: true, why: 'dry-run (tambahkan --send hanya setelah kunci environment terpasang)' };
  if (process.env.LIVE_TRADING !== 'YES' || process.env.I_UNDERSTAND_I_CAN_LOSE_EVERYTHING !== 'YES')
    return { ok: false, why: 'Butuh LIVE_TRADING=YES dan I_UNDERSTAND_I_CAN_LOSE_EVERYTHING=YES' };
  if (!lulus && process.env.ALLOW_UNPROVEN !== 'YES')
    return { ok: false, why: 'Forward test belum lulus. Mesin menolak kirim order. ALLOW_UNPROVEN=YES adalah pintu yang sengaja menyakitkan.' };
  if (!capital) return { ok: false, why: 'CAPITAL_USD kosong' };
  return { ok: true };
}

const open = rows.filter(r => r.hasil === 'menunggu' && (r.arah === 'LONG' || r.arah === 'SHORT') && Date.now() < r.due);
const plans = open.map(r => {
  const p = riskPlan({ capital: capital || 1000, riskPct, entry: +r.entry, sl: +r.sl, lulus });
  const blocked = p.leverage > RISK_CAP.leverageMaks;
  return {
    id: r.id, aset: r.aset, arah: r.arah, entry: r.entry, sl: r.sl, tp: r.tp, venue: r.venue || 'binance-perp',
    ...p, blocked, ai: r.ai || null,
  };
}).filter(p => !p.blocked);

const aiBlock = p => {
  if (process.env.USE_AI !== '1') return false;
  const g = [p.ai?.gemini?.keputusan, p.ai?.grok?.keputusan].filter(Boolean);
  if (!g.length) return true;
  return g.some(x => x !== 'SETUJU');
};

const gate = liveAllowed();
const stamped = new Date().toISOString();
const out = { stamped, mode: gate.ok ? 'LIVE ' + liveArg : 'KERTAS', why: gate.why || '', proven: lulus, plans: plans.map(p => ({ ...p, ai_blok: aiBlock(p) })) };
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/paper-orders.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));

if (!gate.ok || !send) {
  console.log('\nTidak ada order yang dikirim.');
  process.exit(0);
}

const todo = out.plans.filter(p => !p.ai_blok);
if (!todo.length) { console.log('Semua tiket diblok AI atau kosong.'); process.exit(0); }

if (liveArg === 'hyperliquid') {
  fs.mkdirSync('data/tickets', { recursive: true });
  fs.writeFileSync('data/tickets/hyperliquid.json', JSON.stringify({
    catatan: 'Mesin tidak menandatangani transaksi Hyperliquid. Salah tanda tangan bisa mengosongkan dompet. Pasang order limit ini manual, atau pakai adapter yang kamu audit sendiri.',
    orders: todo,
  }, null, 1));
  console.log('Tiket Hyperliquid ditulis ke data/tickets/hyperliquid.json. Tidak dikirim.');
  process.exit(0);
}

function hmac(secret, s) { return crypto.createHmac('sha256', secret).update(s).digest('hex'); }

async function binanceOrder(p) {
  const key = process.env.BINANCE_API_KEY, sec = process.env.BINANCE_API_SECRET;
  if (!key || !sec) throw new Error('kunci Binance kosong');
  const info = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo').then(r => r.json());
  const sym = info.symbols.find(s => s.symbol === p.aset + 'USDT');
  if (!sym) throw new Error('symbol perp tidak ada ' + p.aset);
  const lot = sym.filters.find(f => f.filterType === 'LOT_SIZE');
  const tick = sym.filters.find(f => f.filterType === 'PRICE_FILTER');
  const minN = sym.filters.find(f => f.filterType === 'MIN_NOTIONAL');
  const step = (v, s, mode) => {
    const n = mode === 'ceil' ? Math.ceil(v / s) : Math.floor(v / s);
    const d = (String(s).split('.')[1] || '').length;
    return (n * +s).toFixed(d);
  };
  const qty = step(p.qty, +lot.stepSize, 'floor');
  const price = step(p.arah === 'LONG' ? p.entry : p.entry, +tick.tickSize, p.arah === 'LONG' ? 'floor' : 'ceil');
  const sl = step(+p.sl, +tick.tickSize, p.arah === 'LONG' ? 'floor' : 'ceil');
  const tp = step(+p.tp, +tick.tickSize, p.arah === 'LONG' ? 'ceil' : 'floor');
  if (+qty <= 0) throw new Error('qty 0');
  if (minN && +qty * +price < +minN.notional) throw new Error('di bawah min notional');
  const post = async (path, params) => {
    params.timestamp = Date.now();
    params.recvWindow = 5000;
    const qs = new URLSearchParams(params).toString();
    const sig = hmac(sec, qs);
    const r = await fetch(`https://fapi.binance.com${path}?${qs}&signature=${sig}`, { method: 'POST', headers: { 'X-MBX-APIKEY': key } });
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 240));
    return j;
  };
  const side = p.arah === 'LONG' ? 'BUY' : 'SELL';
  const exit = p.arah === 'LONG' ? 'SELL' : 'BUY';
  const entry = await post('/fapi/v1/order', { symbol: p.aset + 'USDT', side, type: 'LIMIT', timeInForce: 'GTC', quantity: qty, price, newClientOrderId: ('eliz' + p.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) });
  const stop = await post('/fapi/v1/order', { symbol: p.aset + 'USDT', side: exit, type: 'STOP_MARKET', stopPrice: sl, closePosition: 'true', workingType: 'MARK_PRICE' });
  const take = await post('/fapi/v1/order', { symbol: p.aset + 'USDT', side: exit, type: 'TAKE_PROFIT_MARKET', stopPrice: tp, closePosition: 'true', workingType: 'MARK_PRICE' });
  return { entry: entry.orderId, stop: stop.orderId, take: take.orderId };
}

async function bybitOrder(p) {
  const key = process.env.BYBIT_API_KEY, sec = process.env.BYBIT_API_SECRET;
  if (!key || !sec) throw new Error('kunci Bybit kosong');
  const body = {
    category: 'linear', symbol: p.aset + 'USDT', side: p.arah === 'LONG' ? 'Buy' : 'Sell',
    orderType: 'Limit', qty: String(+p.qty.toPrecision(5)), price: String(+p.entry),
    timeInForce: 'GTC', takeProfit: String(+p.tp), stopLoss: String(+p.sl), tpslMode: 'Full',
    tpTriggerBy: 'LastPrice', slTriggerBy: 'LastPrice', positionIdx: 0,
  };
  const raw = JSON.stringify(body);
  const ts = Date.now().toString(), recv = '5000';
  const sign = hmac(sec, ts + key + recv + raw);
  const r = await fetch('https://api.bybit.com/v5/order/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-BAPI-API-KEY': key, 'X-BAPI-SIGN': sign, 'X-BAPI-TIMESTAMP': ts, 'X-BAPI-RECV-WINDOW': recv },
    body: raw,
  });
  const j = await r.json();
  if (j.retCode) throw new Error(JSON.stringify(j).slice(0, 240));
  return j.result;
}

const log = [];
for (const p of todo) {
  try {
    let res;
    if (liveArg === 'binance') res = await binanceOrder(p);
    else if (liveArg === 'bybit') res = await bybitOrder(p);
    else throw new Error('venue tidak dikenal: ' + liveArg);
    log.push({ id: p.id, ok: true, res });
    console.log('terkirim', p.id);
  } catch (e) {
    log.push({ id: p.id, ok: false, error: e.message });
    console.log('gagal', p.id, e.message);
  }
}
fs.writeFileSync('data/live-log.json', JSON.stringify({ stamped, log }, null, 1));
process.exit(log.some(x => !x.ok) ? 1 : 0);
