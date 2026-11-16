import fs from 'node:fs';
import { rawKlines } from '../core.mjs';
import { gradeTrade, mapK } from '../trade-sim.mjs';
import { analyze, renderForward, PROTOCOL_FILE, verifyChain, RES } from '../forward-lib.mjs';

const F = 'data/journal.json';
const rows = fs.existsSync(F) ? JSON.parse(fs.readFileSync(F, 'utf8')) : [];
const P = fs.existsSync(PROTOCOL_FILE) ? JSON.parse(fs.readFileSync(PROTOCOL_FILE, 'utf8')) : null;
const cmd = process.argv[2] || 'report';
const peek = process.argv.includes('--peek');
const regrade = process.argv.includes('--regrade');

if (cmd === 'verify') {
  const chain = verifyChain(rows);
  console.log(chain.ok ? `rantai OK, ${chain.n} baris, ujung ${chain.head}` : chain.errors.join('\n'));
  if (!chain.ok) process.exit(1);
  if (regrade) {
    if (!P) { console.log('protokol belum ada'); process.exit(1); }
    let bad = 0;
    for (const r of rows.filter(x => x.fwd && x.agen === P.agen && RES(x.hasil) && x.arah !== 'NO_TRADE')) {
      const start = Math.floor(r.t / 300000) * 300000;
      const g = await gradeTrade(r, {
        now: Date.now(),
        bars: async () => (await rawKlines(r.aset + 'USDT', '5m', `&startTime=${start}`)).map(mapK),
        m1: async (a, b) => (await rawKlines(r.aset + 'USDT', '1m', `&startTime=${a}&endTime=${b}`)).map(mapK),
      });
      if (!g) continue;
      const R = +g.R.toFixed(3);
      if (g.hasil !== r.hasil || Math.abs(R - +r.R) > 0.05) {
        bad++;
        console.log('tidak cocok', r.id, 'jurnal', r.hasil, r.R, 'ulang', g.hasil, R);
      }
    }
    if (bad) process.exit(1);
    console.log('nilai ulang cocok');
  }
  process.exit(0);
}

if (!P) {
  console.log('Protokol belum ada. Jalankan scan sekali.');
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/forward-report.md', 'Protokol belum dimulai.\n');
  fs.writeFileSync('data/forward-report.json', JSON.stringify({ ready: false, chain: { ok: true, n: 0, head: null, errors: [] }, progress: { trade_terisi: [0, 120], minggu: [0, 12] }, counts: { menunggu: 0 } }));
  process.exit(0);
}
const a = analyze(rows, P, { peek });
const md = renderForward(a);
fs.writeFileSync('data/forward-report.md', md);
fs.writeFileSync('data/forward-report.json', JSON.stringify(a, null, 1));
console.log(md);
