# BioQuest Explorer

Buat aplikasi web responsif bernama "GoBio Explorer" untuk pembelajaran Biologi berbasis lokasi (Location Based Learning) yang terinspirasi dari Pokémon GO.

TUJUAN APLIKASI

Siswa harus bergerak ke lokasi tertentu untuk membuka materi atau soal Biologi. Materi dan soal hanya dapat diakses jika siswa berada dalam radius maksimal 3 meter dari koordinat yang telah ditentukan guru.

FITUR UTAMA

1. LOGIN SISWA

- Login menggunakan Nama dan Kelas.

- Simpan data siswa dalam database.

- Catat waktu login dan aktivitas siswa.

2. DASHBOARD

- Menampilkan:

 - Nama siswa

 - Kelas

 - Jumlah titik yang telah ditemukan

 - Jumlah soal yang telah diselesaikan

 - Poin yang diperoleh

3. PETA INTERAKTIF

- Gunakan Google Maps API.

- Tampilkan posisi siswa real-time menggunakan GPS.

- Tampilkan marker lokasi materi/soal dari spreadsheet.

- Tampilkan rute navigasi menuju lokasi target.

- Tampilkan Google Street View ketika siswa mendekati lokasi.

- Peta dapat diperbesar dan diperkecil.

- Ikon siswa berbentuk avatar.

4. SISTEM KOORDINAT

- Guru memasukkan data melalui spreadsheet.

- Data otomatis dibaca dari spreadsheet.

- Format spreadsheet:

ID | Judul | Latitude | Longitude | Tipe | Materi/Soal | Gambar | Poin

1 | Ekosistem Pantai | -7.12345 | 109.12345 | Materi | isi materi | link gambar | 10

Tipe:

- Materi

- Soal

5. PEMBATASAN BERDASARKAN JARAK

- Gunakan GPS perangkat.

- Hitung jarak siswa dengan koordinat tujuan.

- Jika jarak > 3 meter:

 - Tombol buka materi terkunci.

 - Tampilkan pesan:

 "Dekati lokasi hingga radius 3 meter untuk membuka konten."

- Jika jarak ≤ 3 meter:

 - Tombol otomatis terbuka.

 - Materi atau soal dapat diakses.

6. FITUR MATERI

- Menampilkan:

 - Judul

 - Gambar

 - Materi lengkap

 - Video YouTube jika tersedia

- Setelah selesai membaca:

 - Tombol "Saya Sudah Memahami"

7. FITUR SOAL

- Mendukung:

 - Pilihan ganda

 - Benar salah

 - Isian singkat

- Siswa mengerjakan langsung dalam aplikasi.

- Nilai dihitung otomatis.

- Poin diberikan jika jawaban benar.

8. SISTEM POIN DAN LEVEL

- Jawaban benar mendapatkan poin.

- Menemukan lokasi baru mendapatkan poin.

- Tampilkan:

 - Total poin

 - Level siswa

 - Ranking sederhana

9. RIWAYAT PERJALANAN

- Simpan koordinat yang telah dikunjungi siswa.

- Simpan waktu kunjungan.

- Tampilkan daftar lokasi yang berhasil ditemukan.

10. PANEL ADMIN GURU

- Login admin.

- Mengelola data lokasi.

- Menambah lokasi baru melalui peta.

- Mengedit lokasi.

- Menghapus lokasi.

- Melihat progres siswa.

- Melihat nilai siswa.

- Mengekspor laporan ke Excel.

INTEGRASI GOOGLE SHEET

Spreadsheet menjadi sumber data utama.

Kolom spreadsheet:

ID

Judul

Latitude

Longitude

Tipe

Konten

Link_Gambar

Link_Video

Jawaban

Poin

Perubahan pada spreadsheet harus otomatis memperbarui data aplikasi tanpa perlu deploy ulang.

FITUR EDUKASI

- Tema Biologi SMA.

- Cocok untuk pembelajaran ekosistem, keanekaragaman hayati, klasifikasi makhluk hidup, sistem organ, dan konservasi lingkungan.

- Setiap lokasi dapat berisi fakta menarik Biologi.

- Berikan visual yang menarik seperti aplikasi petualangan.

DESAIN UI

- Gaya modern seperti Pokémon GO.

- Warna dominan hijau, biru, dan putih.

- Peta sebagai tampilan utama.

- Avatar siswa terlihat bergerak mengikuti GPS.

- Responsif untuk Android dan desktop.

- Animasi ketika lokasi berhasil ditemukan.

- Badge pencapaian untuk siswa.

TEKNOLOGI

Frontend:

- React

- TypeScript

- Tailwind CSS

Maps:

- Google Maps API

- Geolocation API

- Google Street View

Database:

- Supabase

Spreadsheet:

- Google Sheets API

Keamanan:

- Validasi GPS.

- Cegah membuka konten tanpa berada dalam radius 3 meter.

- Simpan seluruh aktivitas siswa.

OUTPUT YANG DIINGINKAN

Buat aplikasi siap deploy lengkap dengan:

- Struktur database Supabase

- Integrasi Google Maps

- Integrasi Google Street View

- Integrasi Google Sheets

- Sistem GPS radius 3 meter

- Dashboard siswa

- Dashboard admin

- Sistem poin dan level

- Riwayat aktivitas siswa

- Tampilan modern seperti Pokémon GO

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://biowes.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4a487d5f-b0e9-43d9-8eeb-8da945f06079).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
