import fs from 'node:fs';
const prompt = fs.readFileSync(new URL('../PROMPT.md', import.meta.url), 'utf8');
const dok = fs.readFileSync(new URL('../DOKTRIN.md', import.meta.url), 'utf8');
let fail = 0;
const need = [
  ['prompt melarang swing', /DILARANG[\s\S]{0,400}moonbag|akumulasi spot|SL 15%/i.test(prompt)],
  ['prompt minta GitHub Actions', /GitHub Actions/.test(prompt)],
  ['prompt hanya scalp dari YouTube', /hanya[\s\S]{0,80}scalp/i.test(prompt)],
  ['doktrin menyebut invalidasi pendek', /4,5%|4\.5%/.test(dok)],
  ['doktrin menolak heatmap sendirian', /heatmap bukan strategi|bukan sinyal masuk/i.test(dok)],
  ['doktrin mengizinkan diam', /tidak ada posisi|NO TRADE|diam/.test(dok)],
];
for (const [n, c] of need) {
  if (c) console.log('  ok  ', n);
  else { console.log('  GAGAL', n); fail++; }
}
console.log(fail ? '\nGAGAL' : '\nLULUS');
process.exit(fail ? 1 : 0);
