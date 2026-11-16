// Mesin scalping. Hanya pola yang Eliz pakai untuk SCALP (bukan spot jangka panjang).
// Dipakai dashboard, GitHub Actions, dan uji. Jangan mencampur aturan swing 7 hari / SL 15%.
const H = 36e5;
export const MESIN = 'scalp-1';
export const HOSTS = [
  'https://fapi.binance.com',
  'https://fapi1.binance.com',
  'https://fapi2.binance.com',
];
export const SPOT_HOSTS = [
  'https://data-api.binance.vision',
  'https://api.binance.com',
  'https://api1.binance.com',
];
let hi = 0;

async function getJSON(hosts, path, prefix) {
  let e;
  for (let t = 0; t < hosts.length; t++) {
    const h = hosts[(hi + t) % hosts.length];
    try {
      const r = await fetch(h + prefix + path, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(h + ' HTTP ' + r.status);
      hi = (hi + t) % hosts.length;
      return await r.json();
    } catch (x) { e = x; }
  }
  throw e;
}

const mapK = a => ({ t: a[0], o: +a[1], h: +a[2], l: +a[3], c: +a[4], v: +a[5] });

export async function rawKlines(symbol, interval, extra = '') {
  const q = `klines?symbol=${symbol}&interval=${interval}&limit=1000${extra}`;
  try { return await getJSON(HOSTS, q, '/fapi/v1/'); }
  catch { return await getJSON(SPOT_HOSTS, q, '/api/v3/'); }
}

export async function klines(symbol, interval, limit = 500) {
  const q = `klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  try {
    const raw = await getJSON(HOSTS, q, '/fapi/v1/');
    return { bars: raw.map(mapK), sumber: 'binance-perp' };
  } catch {
    const raw = await getJSON(SPOT_HOSTS, q, '/api/v3/');
    return { bars: raw.map(mapK), sumber: 'binance-spot-fallback' };
  }
}

export async function tickers() {
  try {
    return { rows: await getJSON(HOSTS, 'ticker/24hr', '/fapi/v1/'), sumber: 'binance-perp' };
  } catch {
    return { rows: await getJSON(SPOT_HOSTS, 'ticker/24hr', '/api/v3/'), sumber: 'binance-spot-fallback' };
  }
}

export const NOT = /^(USDC|FDUSD|TUSD|USDP|DAI|BUSD|EUR|AEUR|USD1|XUSD|PAXG|USDE|PYUSD|USDS|USDD|RLUSD|BFUSD|USDG|USTC|FDUSD|BTCDOM|DEFI|ETHBTC)$/;
export function skipSymbol(base) {
  if (!base || NOT.test(base)) return true;
  if (/BULL|BEAR|DOWN/.test(base)) return true;
  if (base.endsWith('UP') && base !== 'JUP' && base !== 'PUMP') return true;
  return false;
}

const FOMC = ['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09'];
const HOL = ['12-24', '12-25', '12-26', '12-31', '01-01'];

export const ema = (a, n) => {
  const k = 2 / (n + 1); let e = a[0];
  return a.map(v => (e = v * k + e * (1 - k)));
};

export function rsi(c, n = 14) {
  let g = 0, l = 0;
  return c.map((v, i) => {
    if (!i) return null;
    const d = v - c[i - 1], u = Math.max(d, 0), w = Math.max(-d, 0);
    if (i <= n) { g += u / n; l += w / n; } else { g = (g * (n - 1) + u) / n; l = (l * (n - 1) + w) / n; }
    return i < n ? null : 100 - 100 / (1 + g / (l || 1e-9));
  });
}

function to4h(h1) {
  const m = new Map();
  for (const q of h1) {
    const b = Math.floor(q.t / (4 * H));
    const o = m.get(b);
    if (!o) m.set(b, { t: b * 4 * H, o: q.o, h: q.h, l: q.l, c: q.c, v: q.v, n: 1 });
    else { o.h = Math.max(o.h, q.h); o.l = Math.min(o.l, q.l); o.c = q.c; o.v += q.v; o.n++; }
  }
  return [...m.values()].filter(x => x.n >= 4).sort((a, b) => a.t - b.t);
}

export function seasonOf(h1) {
  const c4 = to4h(h1);
  if (c4.length >= 55) {
    const c = c4.map(x => x.c), a = ema(c, 20), b = ema(c, 50), px = c.at(-1);
    const season = px > a.at(-1) && a.at(-1) > b.at(-1) ? 1 : px < a.at(-1) && a.at(-1) < b.at(-1) ? -1 : 0;
    return { season, e20: a.at(-1), e50: b.at(-1), tf: '4h' };
  }
  if (h1.length >= 80) {
    const c = h1.map(x => x.c), a = ema(c, 20), b = ema(c, 50), px = c.at(-1);
    const season = px > a.at(-1) && a.at(-1) > b.at(-1) ? 1 : px < a.at(-1) && a.at(-1) < b.at(-1) ? -1 : 0;
    return { season, e20: a.at(-1), e50: b.at(-1), tf: '1h' };
  }
  return { season: 0, e20: null, e50: null, tf: 'n/a' };
}

function rangeBox(k) {
  const n = k.length, end = n - 6, start = Math.max(0, end - 72);
  const w = k.slice(start, end);
  if (w.length < 40) return { valid: false, why: 'range kurang data', H: 0, L: 0, width: 0, flips: 0 };
  const H = Math.max(...w.map(q => q.h)), L = Math.min(...w.map(q => q.l));
  const mid = (H + L) / 2; let flips = 0;
  for (let i = 1; i < w.length; i++) if ((w[i - 1].c >= mid) !== (w[i].c >= mid)) flips++;
  const width = (H - L) / L;
  let why = '';
  if (width < 0.008) why = 'range terlalu sempit';
  else if (width > 0.08) why = 'range terlalu lebar untuk scalp';
  else if (flips < 3) why = 'bukan range, harga tidak bolak-balik';
  return { valid: !why, why, H, L, width, flips, start, end };
}

function sweep(k, level, side) {
  const n = k.length, hits = [];
  const from = Math.max(0, n - 8);
  for (let i = from; i < n; i++) {
    if (side === 1) {
      const pierced = k[i].l < level * 0.9992;
      const reclaim = k[i].c > level || (i + 1 < n && k[i].c <= level && k[i + 1].c > level);
      if (pierced && reclaim) hits.push(i);
    } else {
      const pierced = k[i].h > level * 1.0008;
      const reclaim = k[i].c < level || (i + 1 < n && k[i].c >= level && k[i + 1].c < level);
      if (pierced && reclaim) hits.push(i);
    }
  }
  const fresh = hits.filter(i => i >= n - 6);
  if (!fresh.length) return null;
  const index = fresh.at(-1);
  const wick = side === 1 ? Math.min(...fresh.map(i => k[i].l)) : Math.max(...fresh.map(i => k[i].h));
  return { index, wick, n: fresh.length };
}

function mondayHL(k) {
  const last = k.at(-1);
  if (!last) return null;
  if (new Date(last.t).getUTCDay() === 1) return { forming: true };
  let date = null;
  for (let i = k.length - 1; i >= 0; i--) {
    const d = new Date(k[i].t);
    if (d.getUTCDay() === 1) { date = d.toISOString().slice(0, 10); break; }
  }
  if (!date) return null;
  const bars = k.filter(q => new Date(q.t).toISOString().slice(0, 10) === date);
  if (bars.length < 4) return null;
  return { lo: Math.min(...bars.map(b => b.l)), hi: Math.max(...bars.map(b => b.h)), date, forming: false };
}

function pools(k) {
  const n = k.length, highs = [], lows = [];
  const a = Math.max(0, n - 90);
  for (let i = a + 2; i < n - 2; i++) {
    const hi = k[i].h >= k[i - 1].h && k[i].h >= k[i - 2].h && k[i].h >= k[i + 1].h && k[i].h >= k[i + 2].h;
    const lo = k[i].l <= k[i - 1].l && k[i].l <= k[i - 2].l && k[i].l <= k[i + 1].l && k[i].l <= k[i + 2].l;
    if (hi) highs.push(k[i].h);
    if (lo) lows.push(k[i].l);
  }
  const cluster = (arr, up) => {
    const s = [...arr].sort((x, y) => x - y), out = [];
    for (let i = 0; i < s.length; i++) {
      const g = [s[i]];
      while (i + 1 < s.length && Math.abs(s[i + 1] - s[i]) / s[i] < 0.0015) { i++; g.push(s[i]); }
      if (g.length >= 2) out.push(up ? Math.max(...g) : Math.min(...g));
    }
    return out;
  };
  return { highs: cluster(highs, 1), lows: cluster(lows, 0) };
}

function nearPool(poolsSide, wick, side) {
  const arr = side === 1 ? poolsSide.lows : poolsSide.highs;
  return arr.some(z => side === 1 ? wick <= z * 1.001 && wick >= z * 0.99 : wick >= z * 0.999 && wick <= z * 1.01);
}

function fibZone(k, season) {
  const w = k.slice(-48);
  if (w.length < 20 || !season) return null;
  if (season > 0) {
    let li = 0;
    for (let i = 1; i < w.length; i++) if (w[i].l < w[li].l) li = i;
    const hh = Math.max(...w.slice(li).map(q => q.h)), ll = w[li].l;
    if (!(hh > ll)) return null;
    return { f75: hh - 0.75 * (hh - ll), side: 1 };
  }
  let hi = 0;
  for (let i = 1; i < w.length; i++) if (w[i].h > w[hi].h) hi = i;
  const ll = Math.min(...w.slice(hi).map(q => q.l)), hh = w[hi].h;
  if (!(hh > ll)) return null;
  return { f75: ll + 0.75 * (hh - ll), side: -1 };
}

function rsiDiv(k, side) {
  const c = k.map(q => q.c), R = rsi(c), n = c.length;
  if (n < 30 || R[n - 1] == null) return 0;
  const win = (a, b, f) => { let j = a; for (let i = a; i < b; i++) if (f(c[i], c[j])) j = i; return j; };
  const l1 = win(n - 10, n, (v, m) => v < m), l0 = win(n - 20, n - 10, (v, m) => v < m);
  const h1 = win(n - 10, n, (v, m) => v > m), h0 = win(n - 20, n - 10, (v, m) => v > m);
  if (side === 1 && c[l1] < c[l0] && R[l1] > R[l0]) return 1;
  if (side === -1 && c[h1] > c[h0] && R[h1] < R[h0]) return -1;
  return 0;
}

function build(side, level, wick, px, opposite) {
  const entry = level;
  let sl = side === 1 ? wick * 0.9995 : wick * 1.0005;
  if (side === 1 && !(sl < entry)) sl = entry * 0.995;
  if (side === -1 && !(sl > entry)) sl = entry * 1.005;
  const slp = Math.abs(entry - sl) / entry * 100;
  const risk = Math.abs(entry - sl);
  const edgeR = Math.abs(opposite - entry) / risk;
  const mult = edgeR >= 1.5 && edgeR <= 2.4 ? Math.min(edgeR * 0.96, 2) : 1.7;
  const tp = entry + side * mult * risk;
  const dist = Math.abs(px - entry) / px * 100;
  const rr = Math.abs(tp - entry) / risk;
  return { entry, sl, tp, slp, dist, rr, edgeR };
}

function harder(list) {
  return list.filter(t => t.hard);
}

export function featScalp(k, opt = {}) {
  if (!k || k.length < 120) throw new Error('data H1 kurang dari 120 candle tertutup');
  const n = k.length, px = k[n - 1].c, sea = seasonOf(k), box = rangeBox(k);
  const pos = box.H > box.L ? (px - box.L) / (box.H - box.L) : 0.5;
  const mid = pos > 0.38 && pos < 0.62;
  const ret12 = k[n - 13] ? px / k[n - 13].c - 1 : 0;
  const mon = mondayHL(k);
  const liq = pools(k);
  const fib = fibZone(k, sea.season);
  const medV = (() => { const v = k.slice(n - 48, n - 6).map(q => q.v).sort((a, b) => a - b); return v[v.length >> 1] || 1; })();

  const ideas = [];
  const pushSweep = (side, level, label, id) => {
    const sw = sweep(k, level, side);
    if (!sw) return;
    if (side === 1 && !(px > level && pos < 0.46)) return;
    if (side === -1 && !(px < level && pos > 0.54)) return;
    const opposite = side === 1 ? box.H : box.L;
    ideas.push({ side, id, hard: true, label, level, wick: sw.wick, index: sw.index, n: sw.n, opposite, vol: k[sw.index].v });
  };

  if (box.valid) {
    pushSweep(1, box.L, 'deviasi bawah range H1 lalu reclaim', 'dev');
    pushSweep(-1, box.H, 'deviasi atas range H1 lalu reclaim', 'dev');
  }
  if (mon && !mon.forming) {
    pushSweep(1, mon.lo, 'sapuan Monday Low lalu reclaim', 'mon');
    pushSweep(-1, mon.hi, 'sapuan Monday High lalu reclaim', 'mon');
  }
  if (box.valid && sea.season !== 0) {
    const broke = side => k.slice(n - 8, n - 2).some(q => side === 1 ? q.c > box.H : q.c < box.L);
    const retest = k[n - 1];
    if (sea.season === 1 && broke(1) && retest.l <= box.H * 1.003 && retest.c > box.H && px < box.H * 1.012) {
      ideas.push({ side: 1, id: 'bo', hard: true, label: 'breakout H1 ber-close lalu retest', level: box.H, wick: Math.min(retest.l, k[n - 2].l), index: n - 2, n: 1, opposite: box.H * 1.02, vol: retest.v });
    }
    if (sea.season === -1 && broke(-1) && retest.h >= box.L * 0.997 && retest.c < box.L && px > box.L * 0.988) {
      ideas.push({ side: -1, id: 'bo', hard: true, label: 'breakdown H1 ber-close lalu retest', level: box.L, wick: Math.max(retest.h, k[n - 2].h), index: n - 2, n: 1, opposite: box.L * 0.98, vol: retest.v });
    }
  }

  const bySide = { 1: [], '-1': [] };
  for (const d of ideas) bySide[d.side].push(d);

  const pack = side => {
    const list = bySide[side];
    if (!harder(list).length) return null;
    const primary = [...list].sort((a, b) => a.index - b.index).at(-1);
    const dd = list.filter(x => x.id === 'dev' || x.id === 'mon').some(x => x.n >= 2);
    const why = [...new Set(list.map(x => x.label))];
    if (dd) why.push('lebih dari satu sapuan dalam jendela pemicu');
    const structIds = new Set(list.map(x => x.id));
    if (dd) structIds.add('dd');
    if (nearPool(liq, primary.wick, side)) { structIds.add('liq'); why.push('sapuan menyentuh klaster equal high/low (proxy likuiditas, bukan heatmap)'); }
    if (fib && fib.side === side && Math.abs(px - fib.f75) / px < 0.004) { structIds.add('fib'); why.push('reaksi di fib 0.75 impuls'); }
    if (sea.season === side) why.push(side === 1 ? 'searah musim long' : 'searah musim short');
    const volSpike = primary.vol > medV * 1.35;
    if (volSpike) why.push('volume sapuan di atas median');
    const div = rsiDiv(k, side);
    if (div === side) why.push('RSI divergence searah');
    const g = build(side, primary.level, primary.wick, px, primary.opposite || (side === 1 ? box.H : box.L));
    const age = n - 1 - primary.index;
    return { ...g, why, trig: primary.id, struct: structIds.size, triggerAgeH: age, volSpike, rsiDiv: div, dd };
  };

  const L = pack(1), S = pack(-1);
  let side = 0, chosen = null, conflict = false;
  if (L && !S) { side = 1; chosen = L; }
  else if (S && !L) { side = -1; chosen = S; }
  else if (L && S) conflict = true;

  const stale = !!(chosen && (side === 1
    ? k.slice(-6).some(q => q.h >= chosen.tp)
    : k.slice(-6).some(q => q.l <= chosen.tp)));

  const tags = [];
  if (mid) tags.push('mid-range');
  if (!box.valid && box.why) tags.push(box.why);
  if (conflict) tags.push('konflik dua arah');
  if (L) tags.push('pemicu long');
  if (S) tags.push('pemicu short');

  const r = {
    px, season: sea.season, seasonTf: sea.tf, e20: sea.e20, e50: sea.e50,
    pos, mid, width: box.width, boxValid: box.valid, boxWhy: box.why || '',
    H: box.H, L: box.L, monL: mon && mon.lo, monH: mon && mon.hi, mondayForming: !!(mon && mon.forming),
    ret12, tags, qv: opt.qv ?? null, sumber: opt.sumber || '',
    k: k.slice(-80), tSignal: k[n - 1].t, side: 0, why: [],
  };
  if (chosen && side) {
    Object.assign(r, {
      side, why: chosen.why, trig: chosen.trig, struct: chosen.struct, triggerAgeH: chosen.triggerAgeH,
      volSpike: chosen.volSpike, rsiDiv: chosen.rsiDiv, entry: chosen.entry, sl: chosen.sl, tp: chosen.tp,
      slp: chosen.slp, dist: chosen.dist, rr: chosen.rr, stale, conflict: false,
    });
  } else {
    r.conflict = conflict;
    r.stale = false;
  }
  return r;
}

export function scanInput(kl, now = Date.now()) {
  const closed = kl.filter(q => q.t + H <= now);
  if (closed.length < 120) throw new Error('H1 tertutup kurang dari 120');
  const last = closed.at(-1);
  const qv = closed.slice(-24).reduce((s, q) => s + q.v * q.c, 0);
  return { bars: closed.slice(-500), qv, hour: new Date(last.t).toISOString().slice(0, 13), t: last.t };
}

export function alertList(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const iso = d.toISOString().slice(0, 10), md = iso.slice(5), dw = d.getUTCDay();
  const tm = new Date(+d + 864e5), A = [];
  if (FOMC.includes(iso) || FOMC.includes(tm.toISOString().slice(0, 10))) A.push(['y', 'FOMC hari ini atau besok. Jangan menebak berita. Scalp hanya bila ada pemicu dan invalidasi pendek.', 'Cek tanggal di federalreserve.gov']);
  if (HOL.includes(md)) A.push(['r', 'Libur, buku tipis. Mesin tetap boleh memasang scalp, tetapi ukurannya harus kecil dan banyak yang lebih baik diam.', '']);
  if (dw === 0 || dw === 6) A.push(['y', 'Akhir pekan: likuiditas tipis dan banyak bot. Hanya setup dengan invalidasi mudah.', '']);
  if (dw === 1) A.push(['y', 'Senin: Monday range masih kotor. Jangan pakai Monday High/Low sebelum hari Senin selesai.', '']);
  if (d.getUTCHours() === 13 || d.getUTCHours() === 14) A.push(['y', 'Sekitar buka kas AS. Tunggu candle penutup, jangan kejar spike menit pertama.', '']);
  return A;
}

export function konfirmasi(m15, r) {
  if (!r.side) return ['', 'tidak ada setup'];
  if (!m15?.length) return ['wait', '15m belum ada'];
  const s = r.side, last = m15.at(-1), recent = m15.slice(-8);
  const bust = q => (s === 1 ? q.c < r.sl : q.c > r.sl);
  if (bust(last) || recent.some(bust)) return ['bad', 'BATAL: close 15m melewati SL'];
  const held = recent.some(q => s === 1 ? q.l <= r.entry * 1.0018 && q.c > r.entry : q.h >= r.entry * 0.9982 && q.c < r.entry);
  if (s === 1 ? last.c > r.entry : last.c < r.entry) return held ? ['ok', 'Retest 15m tertahan di level'] : ['wait', 'Di sisi benar, retest 15m belum terlihat'];
  return ['wait', 'Tunggu close 15m ' + (s === 1 ? 'di atas' : 'di bawah') + ' level'];
}

export function statusTeks(r) {
  if (r.side) return r.slp > 4.5 ? 'SL terlalu lebar' : 'SETUP';
  if (r.conflict) return 'dua arah sekaligus, dibuang';
  if (r.mid) return 'mid-range, jangan dipaksa';
  if (!r.boxValid) return r.boxWhy || 'bukan range';
  if (r.pos < 0.2) return 'dekat range low, belum ada reclaim';
  if (r.pos > 0.8) return 'dekat range high, belum ada reclaim';
  return 'belum ada pemicu';
}
