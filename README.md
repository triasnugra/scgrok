# Mesin Scalp Eliz

Analisis scalping crypto yang mengkodifikasi cara kerja publik @eliz883: range H1, sapuan lalu reclaim, retest, invalidasi pendek, dan keberanian untuk tidak masuk.

Ini **bukan** akun resmi Eliz, **bukan** nasihat finansial, dan **bukan** janji untung. Tujuan akhirnya bisa dipakai dengan uang sungguhan di Binance, Bybit, atau (secara manual) Hyperliquid. Sampai forward test lulus, mesin ini adalah jurnal dan mode kertas. Uang yang tidak siap hilang jangan dipakai.

Mesin swing di folder contoh `tnv2` sengaja tidak disalin. Scalp di sini hidup 12 jam, stop harga maksimal 4,5%, dan tidak mengambil rencana spot jangka panjang dari video YouTube.

## Isi

| File | Fungsi |
|---|---|
| `PROMPT.md` | Instruksi untuk AI yang membangun atau mengaudit mesin. Pakai ini bila ingin Gemini/Grok mengubah kode tanpa membawa aturan swing. |
| `DOKTRIN.md` | Aturan scalp yang benar-benar dikodekan, plus yang sengaja dibuang. |
| `core.mjs` | Deteksi setup pada candle H1 yang sudah tutup. |
| `gate.mjs` | Penolak. Tidak pernah menggeser entry, SL, atau TP. |
| `trade-sim.mjs` | Penilaian TP/SL yang sama untuk jurnal dan verifikasi ulang. |
| `scripts/scan.mjs` | Nilai sinyal lama, cari sinyal baru, segel rantai hash. |
| `scripts/forward.mjs` | Laporan uji bersih. Angka kinerja disembunyikan sampai syarat terpenuhi. |
| `scripts/execute.mjs` | Tiket order. Default tidak mengirim apa pun. |
| `index.html` | Dashboard GitHub Pages. |

## Unggah ke GitHub

1. Buat repositori kosong (tanpa README bawaan GitHub, supaya tidak bentrok).
2. Isi repositori ini **adalah** akar repo. Jangan membungkusnya di dalam folder lain saat di-push.
3. Dorong ke cabang `main`.
4. Settings → Pages → Build and deployment → **GitHub Actions**.
5. Settings → Actions → General → izinkan Actions membaca dan menulis.
6. Bila cabang `main` dilindungi, izinkan `github-actions[bot]` untuk push, karena jurnal dicommit balik.

Workflow `Deploy` berjalan pada setiap push, setiap jam di menit ke-17 UTC, dan bila kamu menjalankannya manual. GitHub boleh menunda jadwal. Untuk scalp yang lebih rapat, jalankan `node scripts/scan.mjs` dari VPS tiap 15 menit. Actions tetap jadi jurnal yang disegel.

Halaman akan tampil di `https://<user>.github.io/<repo>/`.

## Rahasia (semua opsional)

Settings → Secrets and variables → Actions.

| Nama | Wajib untuk |
|---|---|
| `GEMINI_API_KEY` | tinjauan Gemini. Tanpa ini mesin aturan tetap jalan |
| `XAI_API_KEY` | tinjauan Grok |
| `BINANCE_API_KEY` / `BINANCE_API_SECRET` | kirim order USD-M, hanya workflow manual |
| `BYBIT_API_KEY` / `BYBIT_API_SECRET` | kirim order linear Bybit, hanya workflow manual |

Variables:

| Nama | Arti |
|---|---|
| `USE_AI` | `1` untuk meminta tinjauan. AI hanya boleh setuju atau menolak, tidak mengubah harga |
| `CAPITAL_USD` | modal untuk hitung ukuran |
| `RISK_PCT` | diabaikan di atas 0,25% sebelum lulus, 0,50% sesudah lulus |
| `LIVE_TRADING` | harus `YES` |
| `I_UNDERSTAND_I_CAN_LOSE_EVERYTHING` | harus `YES` |
| `ALLOW_UNPROVEN` | `YES` hanya bila kamu sengaja mengirim order sebelum uji lulus. Jangan. |

Jangan menaruh kunci di kode, di `index.html`, atau di commit.

## Uang sungguhan

Workflow **Eksekusi** tidak jalan sendiri. Pilihan venue `kertas` hanya menulis `data/paper-orders.json`.

Binance dan Bybit mengirim **limit** di level, plus stop dan target. Syarat akun:

- mode one-way, bukan hedge
- leverage di bursa kamu set sendiri, maksimal 3x (mesin tidak memanggil API ganti leverage)
- sub-akun kecil untuk percobaan pertama
- harga sinyal adalah **Binance USD-M**. Jangan menempelkan angka itu begitu saja ke bursa lain bila selisihnya lebih dari beberapa tick. Untuk Hyperliquid, mesin hanya menulis tiket JSON. Tidak ada penandatangan dompet di repo ini.

Order live tetap ditolak bila forward test belum lulus, kecuali `ALLOW_UNPROVEN=YES`.

## Uji

```bash
npm test
```

Tidak butuh jaringan dan tidak butuh kunci. Uji memastikan sapuan long/short dikenali, tengah range didiamkan, stop lebar ditolak, long altcoin ditolak saat BTC sedang menjatuh, rantai hash mendeteksi edit, dan prompt larangan masih ada.

## Forward test

Syarat, dikunci pada jalan pertama: 120 trade terisi dan 12 minggu berbeda. Lulus bila batas bawah interval kepercayaan 95% dari R/trade, sesudah biaya 0,04% per sisi ditambah slip 0,04%, berada di atas nol.

Mengubah `core.mjs`, `gate.mjs`, `trade-sim.mjs`, atau `CFG` mengubah hash. Baris sesudahnya tidak dihitung pada protokol lama. Untuk hipotesis baru, hapus `data/forward-protocol.json` dan terima bahwa hitungan mulai dari nol.

## Batas yang jujur

- Tidak ada heatmap order book. Yang ada klaster equal high/low.
- Jadwal GitHub tidak seketat terminal.
- Biaya funding futures belum dimodelkan.
- Koin yang dipindai adalah yang volumenya besar **hari ini**. Itu bias survivor bila dipakai untuk riset masa lalu.
- Aturan ini adalah terjemahan. Eliz menggambar level dengan mata. Mesin memakai kotak 72 jam. Keduanya bisa tidak sama, dan keduanya bisa salah.
