# FotoVault — Website Penyimpanan Foto

Website storage foto pribadi dengan:
- Login & daftar akun via Supabase Auth
- Upload banyak foto
- Drag & drop
- Galeri responsif
- Search nama foto
- Preview foto
- Download
- Delete
- Album
- Penyimpanan private per user
- RLS database & Storage policy
- Indikator pemakaian storage 1 GB

## 1. Buat project Supabase

Buat project di Supabase, lalu buka SQL Editor.

Jalankan isi `supabase.sql`.

Setelah itu buka Storage → buat bucket baru bernama:

`photos`

Pastikan bucket **PRIVATE**, bukan public.

## 2. Isi konfigurasi website

Buka `app.js` dan ganti:

```js
const SUPABASE_URL = "PASTE_YOUR_SUPABASE_URL";
const SUPABASE_PUBLISHABLE_KEY = "PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY";
```

dengan Project URL dan Publishable Key milik project Anda.

Gunakan publishable/anon key untuk browser. **Jangan masukkan secret/service_role key ke app.js.**

## 3. Jalankan

Untuk testing sederhana, bisa gunakan VS Code + Live Server.

Untuk hosting static:
- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

Supabase tetap menjadi backend Auth, database, dan file storage.

## 4. Batas upload

Versi ini menggunakan standard upload dan membatasi browser ke 6 MB per foto agar upload kecil tetap sederhana dan stabil.

Untuk file lebih besar, gunakan TUS/resumable upload dan ubah fungsi upload.

## 5. Keamanan

File disimpan dengan pola:

`USER_ID/random-file-name.ext`

Bucket private dan policy Storage memastikan user hanya dapat membaca/menghapus file di folder miliknya.

Database `photos` dan `albums` juga menggunakan Row Level Security.

Jangan pernah menaruh secret/service_role key di JavaScript frontend.

## 6. Catatan quota

Angka 1 GB di sidebar adalah quota tampilan aplikasi. Untuk benar-benar memblokir upload setelah mencapai quota, tambahkan validasi server-side/Edge Function atau trigger database.
