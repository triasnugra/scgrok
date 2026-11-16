# Doktrin scalp yang dikodekan

Bukan ringkasan seluruh kanal Eliz. Hanya yang dipakai mesin ini. V = disebut di postingan atau di bagian scalp video. I = cara mesin menerjemahkannya ke angka. Angka di kolom I adalah ambang, bukan kutipan harga dari Eliz.

| Aturan | Sumber | Di kode |
|---|---|---|
| Saat chop, yang dikerjakan adalah scalp ber-drawdown kecil. Tidak memaksa arah besar. | V, postingan 2026 | `side = 0` bila tidak ada pemicu |
| BTC di tengah range = bukan tempat trading BTC. Tunggu sapuan di atas high atau di bawah low plus trigger. | V | `mid` mematikan setup tanpa sapuan di tepi |
| Altcoin boleh di-scalp saat BTC di tengah, asal pilihannya ketat dan stopnya pendek. | V | gerbang `BTC_MENYERANG` tidak aktif bila BTC `mid` |
| Jangan kejar harga. Masuk di titik yang sudah direncanakan. | V | entry = level, `ENTRY_TERLALU_JAUH` bila lebih dari 1,6% |
| Trigger wajib. Tanpa trigger semuanya berisiko. | V | pemicu keras: deviasi, Monday sweep, breakout-retest |
| Invalidasi yang mudah lebih penting daripada target. | V | SL 0,4%–4,5% dari harga. Di luar pita itu ditolak, tidak dipaksa muat |
| Scalp long di musim long, scalp short di musim short. | V | musim = EMA20/50 pada 4 jam. I |
| Melawan musim hanya dengan beberapa alasan yang saling menguatkan. | I dari “easy invalidation” + konfluensi | butuh 3 elemen struktur |
| Range H1, kerjakan deviasi dari high dan low. | V | kotak 72 jam, jendela sapuan 6 jam terakhir |
| Stop run: wick mengambil likuiditas lalu harga kembali. | V, video | low menembus level dan close kembali |
| Retest sesudah breakout yang sudah ditutup, bukan antisipasi tembus. | V | `bo` hanya bila ada close di luar lalu sentuhan ulang, searah musim |
| Fib 0.75 zona reaksi, bukan tombol masuk. | V | skor tambahan bila harga sudah ada pemicu dan dekat 0.75 |
| Heatmap / peta likuiditas bukan strategi. | V | equal high/low hanya menambah skor. Bukan sinyal masuk |
| Jangan masuk hanya karena “ada likuiditas di atas/bawah”. | V | tidak ada rule “likuiditas di atas = long” |
| Monday High/Low adalah level mingguan, tetapi Senin masih kotor. | V | pemicu Monday dimatikan saat candle terakhir masih hari Senin |
| Ambil untung. Jangan mengubah scalp menjadi hold. | V | TP sekitar 1,7R atau tepi seberang bila RR-nya masuk akal, horizon 12 jam |
| Saat tidak tahu, diam. | V | NO TRADE / tidak ada kartu lolos |
| Berita dan FOMC bukan alasan masuk. Yang dipakai tetap trigger. | V | banner, bukan sinyal |
| Akhir pekan dan libur: buku tipis. | V | banner |

## Sengaja tidak dipakai

Materi video yang bukan scalp: rencana akumulasi spot, moonbag 20%, stop 10–15%, target tahunan, narasi koin “yang dipegang lama”. Mesin swing `tnv2` yang menemani folder contoh memakai aturan itu. Mesin ini tidak.

Heatmap order-book sungguhan tidak tersedia secara stabil di GitHub Actions. Penggantinya adalah klaster equal high/low. Itu perkiraan, dan kartu menyebutnya begitu.

## Cara mesin boleh diubah

Tulis hipotesis di `gate.mjs` sebelum melihat hasil baru. Hapus `data/forward-protocol.json` bila hash mesin berubah dan kamu menerima bahwa uji dimulai dari nol. Jangan menyetel ambang sampai backtest “bagus”.
