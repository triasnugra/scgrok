import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sealRow, lastSealed, verifyChain, ensureProtocol, analyze, makeProtocol } from '../forward-lib.mjs';

let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { if (c) { pass++; console.log('  ok  ', name); } else { fail++; console.log('  GAGAL', name, extra); } };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scalp-'));
const file = path.join(dir, 'protocol.json');
const P0 = ensureProtocol('abc123', file, Date.parse('2026-01-01T00:00:00Z'), { agen: 'Eliz Scalp' });
ok(P0.created && P0.engine === 'abc123', 'protokol dibuat sekali');
ok(ensureProtocol('zzz', file).created === false && ensureProtocol('zzz', file).engine === 'abc123', 'protokol tidak ditimpa');

const rows = [];
const base = { agen: 'Eliz Scalp', engine: 'abc123', alert: '', venue: 'binance-perp', arah: 'LONG', entry: 100, sl: 98, tp: 104, harga_awal: 101, alasan: 'uji' };
for (let i = 0; i < 3; i++) {
  const row = { ...base, id: 'id' + i, t: Date.parse('2026-02-01T00:00:00Z') + i * 864e5, due: Date.parse('2026-02-01T00:00:00Z') + i * 864e5 + 12 * 36e5, aset: 'BTC' };
  sealRow(row, lastSealed(rows));
  rows.push(row);
}
ok(verifyChain(rows).ok, 'rantai utuh', verifyChain(rows).errors.join(';'));
rows[1].entry = 101;
ok(!verifyChain(rows).ok, 'mengubah entry terdeteksi');
rows[1].entry = 100;
ok(verifyChain(rows).ok, 'entry dikembalikan, rantai pulih');

const P = makeProtocol('abc123', Date.parse('2026-01-01T00:00:00Z'), { agen: 'Eliz Scalp' });
rows.forEach(r => { r.hasil = 'TP'; r.R = 1.7; r.tx = r.t + 36e5; });
const hidden = analyze(rows, P);
ok(hidden.locked === true && !hidden.hasil, 'angka disembunyikan sebelum syarat');
const peek = analyze(rows, P, { peek: true });
ok(peek.peek === true && peek.verdict.pass === null, 'intip diberi label tidak sah');

console.log(`\n${fail ? 'GAGAL' : 'LULUS'}: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
