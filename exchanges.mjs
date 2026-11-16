// Pembacaan pasar publik. Penandatanganan order live ada di scripts/execute.mjs.
const mapBin = a => ({ t: a[0], o: +a[1], h: +a[2], l: +a[3], c: +a[4], v: +a[5] });

async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(url + ' HTTP ' + r.status);
  return r.json();
}

export async function bybitKlines(symbol, interval = '60', limit = 500) {
  const j = await get(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`);
  const rows = (j.result?.list || []).map(a => ({ t: +a[0], o: +a[1], h: +a[2], l: +a[3], c: +a[4], v: +a[5] }));
  rows.sort((a, b) => a.t - b.t);
  return rows;
}

export async function bybitTickers() {
  const j = await get('https://api.bybit.com/v5/market/tickers?category=linear');
  return j.result?.list || [];
}

export async function hlCandles(coin, interval = '1h', start, end = Date.now()) {
  const j = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'candleSnapshot', req: { coin, interval, startTime: start, endTime: end } }),
    signal: AbortSignal.timeout(15000),
  }).then(r => { if (!r.ok) throw new Error('HL HTTP ' + r.status); return r.json(); });
  return (j || []).map(c => ({ t: c.t, o: +c.o, h: +c.h, l: +c.l, c: +c.c, v: +c.v }));
}

export function binanceMap(raw) { return raw.map(mapBin); }

export function roundStep(value, step, mode = 'floor') {
  const s = +step;
  if (!(s > 0)) return String(value);
  const n = mode === 'ceil' ? Math.ceil(value / s) : mode === 'round' ? Math.round(value / s) : Math.floor(value / s);
  const dec = (String(step).split('.')[1] || '').replace(/0+$/, '').length || (String(step).includes('e') ? 8 : (String(step).split('.')[1] || '').length);
  const p = Math.min(8, (String(step).split('.')[1] || '').length);
  return (n * s).toFixed(p || dec);
}
