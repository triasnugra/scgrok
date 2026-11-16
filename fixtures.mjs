// Candle sintetik untuk uji dan tombol "contoh" di dashboard. Bukan data pasar.
export const H = 36e5;
const bar = (i, c, o = {}) => ({
  t: (o.t0 ?? 0) + i * H,
  o: o.o ?? c,
  h: o.h ?? c + 0.12,
  l: o.l ?? c - 0.12,
  c,
  v: o.v ?? 1000,
});

export function sineRange(n = 180, mid = 100) {
  const k = [];
  for (let i = 0; i < n; i++) {
    const c = mid + Math.sin(i / 5) * 0.85;
    k.push(bar(i, c, { h: c + 0.14, l: c - 0.14, v: 900 + (i % 5) * 40 }));
  }
  return k;
}

function paint(k, fromEnd, c, extra = {}) {
  const i = k.length - fromEnd;
  const b = k[i];
  k[i] = { ...b, o: extra.o ?? c, h: extra.h ?? c + 0.08, l: extra.l ?? c - 0.08, c, v: extra.v ?? b.v };
  return k;
}

// Harga dekat tepi bawah, lalu sapuan di bawah range yang ditutup kembali di atas level.
export function withLongSweep(k = sineRange()) {
  for (const [from, c] of [[8, 99.55], [7, 99.4], [6, 99.35], [5, 99.3], [4, 99.45], [3, 99.5], [2, 99.55], [1, 99.6]]) paint(k, from, c);
  const i = k.length - 4;
  k[i] = { ...k[i], o: 99.25, h: 99.55, l: 98.15, c: 99.42, v: 2800 };
  return k;
}

export function withShortSweep(k = sineRange()) {
  for (const [from, c] of [[8, 100.45], [7, 100.6], [6, 100.7], [5, 100.65], [4, 100.5], [3, 100.48], [2, 100.42], [1, 100.38]]) paint(k, from, c);
  const i = k.length - 4;
  k[i] = { ...k[i], o: 100.7, h: 101.9, l: 100.4, c: 100.55, v: 2700 };
  return k;
}

export function withBothSweeps(k = sineRange()) {
  withLongSweep(k);
  const i = k.length - 2;
  k[i] = { ...k[i], o: 100.2, h: 102.2, l: 99.5, c: 100.1, v: 2600 };
  return k;
}

export function withDeepSweep(k = sineRange()) {
  withLongSweep(k);
  const i = k.length - 4;
  k[i] = { ...k[i], l: 90, c: 99.4, o: 99.2, h: 99.6, v: 3000 };
  return k;
}

export function contohBars() {
  return withLongSweep();
}
