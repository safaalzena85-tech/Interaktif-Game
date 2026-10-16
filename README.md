# 🎯 Quiz Show Pro — Cerdas Cermat Interaktif

Aplikasi kuis berbasis web (HTML/CSS/JavaScript murni, tanpa build tool) dengan tampilan
modern bernuansa **game show / cerdas cermat** dan **Mode Misteri**.

## 🚀 Cara Menjalankan

1. Buka file `index.html` langsung di browser (Chrome/Edge/Firefox), **atau**
2. Jalankan server lokal:
   ```powershell
   node "C:\Users\BPMEDIA\AppData\Local\Temp\opencode\qz-server.js" "$PWD" 5173
   ```
   lalu buka `http://localhost:5173`.

Aplikasi sudah membawa **bank soal bawaan (30 soal)** sehingga bisa langsung dimainkan.
Data permainan tersimpan otomatis di `localStorage` browser.

## 🖥️ Tampilan 16:9 & Fullscreen

- Seluruh permainan dirender di atas **panggung tetap berukuran 16:9 (1920×1080)** yang
  secara otomatis **diskalakan (letterbox)** agar pas di layar apa pun — cocok untuk proyektor,
  TV, atau layar presentasi. Rasio tidak pernah berubah, tidak ada scroll halaman.
- Tombol **⛶ Fullscreen** tersedia di bar atas dan di panel Kontrol moderator
  (shortcut keyboard **F**). Tekan lagi untuk keluar.
- Semua modal (Scoreboard, Riwayat, Bank Soal, dll.) ikut berada di dalam panggung sehingga
  tetap rapi di dalam bingkai 16:9.

## 📄 Format File Soal (.txt)

```
[KATEGORI_MUDAH]

Q: Pertanyaan mudah 1
A: Jawaban mudah 1

Q: Pertanyaan mudah 2
A: Jawaban mudah 2

[KATEGORI_SULIT]

Q: Pertanyaan sulit 1
A: Jawaban sulit 1

[KATEGORI_SANGAT_SULIT]

Q: Pertanyaan sangat sulit 1
A: Jawaban sangat sulit 1
```

- **Jumlah soal bebas** (tidak wajib 30). Minimal 1 soal. Bank bawaan berisi 30 soal
  (10 Mudah · 10 Sulit · 10 Sangat Sulit), tetapi Anda bebas menambah atau mengurangi.
- Header yang dikenali: `[KATEGORI_MUDAH]`, `[KATEGORI_SULIT]`, `[KATEGORI_SANGAT_SULIT]`
  (juga menerima `[MUDAH]`, `[SULIT]`, `[SANGAT_SULIT]`).
- Baris `Q:` / `A:` (juga menerima `SOAL:` / `JAWABAN:`). Teks baris berikutnya menyambung baris sebelumnya.
- Contoh siap pakai: **`contoh-soal.txt`**.

Fitur import: **Bank Soal → Unduh Template / Parsing & Validasi / Ganti bank soal kapan saja**.

### ➕➖ Menambah / Mengurangi Jumlah Soal

Di dalam modal **📥 Bank Soal** ada bagian **“Kelola Soal Bank Saat Ini”**:

- Isi **Kategori + Pertanyaan + Jawaban**, lalu klik **＋ Tambah** untuk menambah soal.
- Klik ikon **🗑** pada sebuah soal untuk menghapusnya.
- Papan soal **otomatis menyesuaikan** jumlah kotak, jumlah kolom, dan ukuran kotak
  agar selalu rapi tanpa scroll (mis. 4 soal → 2 kolom, 30 soal → 6 kolom, 60 soal → 9 kolom).
- Mengubah bank saat ada soal aktif akan menutup soal tersebut lalu membangun ulang papan
  (skor peserta & riwayat tetap tersimpan).

## 🎮 Alur Permainan

1. Moderator menambahkan peserta, lalu mengklik kartu peserta untuk menjadikannya **peserta aktif**.
2. Peserta memilih nomor kotak pada **Papan Soal 30 kotak** (semua kotak tampak identik — Mode Misteri).
3. Sistem menanyakan mekanisme: **Jawab Sendiri** atau **Lempar ke Peserta Lain**.
4. Soal ditampilkan, **timer 30 detik (dapat diubah)** berjalan otomatis.
5. Moderator menekan **BENAR** / **SALAH** (shortcut `B` / `S`). Timer berhenti otomatis.
6. Skor diperbarui, kotak ditandai warna sesuai tingkat kesulitan: 🟩 Mudah · 🟧 Sulit · 🟥 Sangat Sulit + ikon centang.
7. Muncul **popup besar BENAR / SALAH** beserta **efek suara** (nada ceria saat benar, buzz saat salah).

## 🎉 Popup & Suara Jawaban

- Menekan **BENAR** / **SALAH** memunculkan popup besar di tengah panggung:
  - 🟩 **BENAR!** — menampilkan nama penjawab dan poin yang didapat
    (mis. `+30 poin · Pelempar −5` bila menjawab benar dari lemparan).
  - 🟥 **SALAH** — menampilkan nama penjawab dan `0 poin`.
- Popup **tidak memblokir** moderator (bisa langsung lanjut) dan menutup otomatis.
- Efek suara dapat dimatikan di **⚙️ Pengaturan → “Efek suara saat BENAR / SALAH”**.

## 🧮 Aturan Skor

| Skenario | Efek |
|---|---|
| Jawab sendiri — benar | +10 / +20 / +30 sesuai kategori |
| Jawab sendiri — salah | +0 (tidak ada pengurangan) |
| Lempar — penerima benar | Penerima dapat poin penuh, **pelempar −5** (skor min. 0) |
| Lempar — penerima salah | Penerima +0, **pelempar tidak kehilangan poin** |

## ⏱️ Timer

- Durasi: 15 / 30 / 45 / 60 detik atau **custom** (ubah sebelum permainan mulai).
- **Circular countdown** dengan warna: 🟩 >50% · 🟨 20–50% · 🟥 <20%, berkedip & beep pada 10 detik terakhir.
- Kontrol moderator: Start · Pause · Resume · Stop · Reset · Tambah waktu (+5/+10/+15/+30) · Aktif/nonaktif timer.
- **Waktu habis** → popup *WAKTU HABIS*: Tandai Salah · Tambah Waktu · Lanjutkan Menjawab.
- Saat soal dilempar: timer **belum** berjalan sampai peserta tujuan dipilih, lalu **di-reset ke durasi penuh**.

## 🪟 Panel yang Dapat Di-minimize

- Panel **🛠️ KONTROL** (moderator) dan **🏅 TOP 5** bisa **di-minimize** dengan tombol **▸**
  di sudut panel, sehingga ruang untuk kartu soal / daftar peserta menjadi lebih luas.
- Klik **◂** untuk membuka kembali. Status minimize tersimpan di `localStorage`.

## 📊 Scoreboard & Riwayat

- Tombol floating **🏆 Scoreboard** selalu tersedia, dapat dibuka kapan saja **tanpa menghentikan timer**.
- Isi: peringkat, nama, poin, benar, salah, soal dijawab, lemparan diterima, lemparan dilakukan, penalti, % keberhasilan.
- Sorot 3 besar + medali 🥇🥈🥉, animasi perubahan peringkat.
- **Mini Leaderboard** Top 5 real-time di sidebar dengan highlight peserta aktif.
- **Riwayat**: Permainan · Lemparan · Bonus Waktu · Timer — bisa diekspor ke JSON.

## ✏️ Manajemen Peserta

- Tambah, edit nama (dengan dialog konfirmasi, nama wajib unik, skor tidak berubah),
  reset skor, hapus peserta.
- Perubahan nama langsung tersinkron ke scoreboard, ranking, dan riwayat.

## 📁 Struktur Proyek

```
index.html          # Markup & seluruh modal
css/styles.css      # Tema game show (dark + gold), panggung 16:9 yang berskala otomatis
js/data.js          # Kategori, poin, bank soal bawaan, utilitas
js/parser.js        # Parsing & validasi file TXT
js/timer.js         # Mesin countdown (setInterval, tetap akurat saat tab di-background)
js/store.js         # State, aturan skor, riwayat, localStorage
js/ui.js            # Rendering, modal, toast, animasi FLIP
js/app.js           # Alur permainan, event, kontrol moderator
contoh-soal.txt     # Contoh bank soal 30 soal
```
