
# FotoVault — OAuth Edition

Project ini menggunakan Supabase Auth.

## Login
- Email + password
- Google OAuth
- Apple OAuth

## Wajib dikonfigurasi di Supabase

Authentication → Providers:
1. Google → aktifkan dan masukkan OAuth Client ID/Secret.
2. Apple → aktifkan dan masukkan Apple OAuth configuration.

Tambahkan URL website GitHub Pages kamu ke:
Authentication → URL Configuration → Redirect URLs.

Contoh:
https://USERNAME.github.io/REPOSITORY/login.html

Untuk Google/Apple, jangan menaruh client secret/service-role key di HTML atau JavaScript frontend.

## Admin
Role admin tetap dibaca dari:
public.user_roles

Isi role:
admin

Login OAuth tidak otomatis menjadikan user sebagai admin. Setelah user OAuth dibuat, admin harus diberi role admin melalui SQL/backend yang aman.
