# Security

## 1. Threat Model

Sistem berjalan **lokal, single-user, single-PC**. Threat model MVP berfokus pada:

- Proses/aplikasi lain di mesin yang sama mencoba menyambung ke endpoint lokal (CDP debug port, WebSocket Agent Protocol) tanpa otorisasi.
- Extension atau command yang salah/berbahaya (mis. selector yang salah, script arbitrary) dieksekusi tanpa validasi.
- Kebocoran data sensitif (profile browser, token, log) lewat log yang tidak sengaja mencatat credential.

**Di luar threat model saat ini** (karena di luar scope proyek — lihat README Non-Goals): serangan jaringan eksternal, multi-user access control, dan skenario cloud/multi-machine.

## 2. Local Endpoint Security

- **CDP debug port**: secara default hanya bind ke `localhost`, tidak diekspos ke jaringan eksternal. Setiap port dialokasikan dinamis per session, bukan port tetap yang mudah ditebak.
- **Agent Protocol (WebSocket)**: Manager bertindak sebagai server lokal, hanya menerima koneksi dari `localhost`. Koneksi dari Extension **wajib** melalui langkah `REGISTER` yang membawa token (lihat di bawah) sebelum diterima sebagai agent sah untuk sebuah session.

## 3. Identity & Authentication

Tiga identitas dibedakan secara eksplisit — **jangan disamakan**:

```
Session ID              → identitas data/resource, BUKAN untuk autentikasi
Agent ID                 → identitas instance Extension yang terpasang di satu session
Authentication Token     → credential rahasia yang membuktikan Agent/klien sah
```

**Session ID tidak boleh dipakai sebagai token otentikasi** karena ID ini muncul di banyak tempat (log, URL, dashboard) dan tidak dirancang untuk dirahasiakan. Setiap Extension Agent menerima token unik per session saat registrasi (di-generate Application Core, disimpan sementara di memori/DB lokal), dan token inilah yang divalidasi Manager pada setiap message `COMMAND_RESULT`/`EVENT` yang masuk.

## 4. Authorization & Command Validation

- Command yang dikirim ke Extension hanya boleh menyasar `session_id` milik Agent yang mengirim — Manager memvalidasi kecocokan `session_id` ↔ Agent identity pada setiap message, bukan percaya begitu saja isi payload.
- Input command (mis. `selector`, `url`) divalidasi tipe dan format dasar sebelum diteruskan — mencegah command malformed menyebabkan perilaku tak terduga di Extension.
- Automation workflow tidak diperbolehkan mengeksekusi arbitrary script tanpa batas dari sumber yang tidak tepercaya; action tetap dalam himpunan action yang telah didefinisikan (lihat `automation.md`).

## 5. Secrets & Credential Handling

- Sistem **tidak** menyimpan password/credential akun pihak ketiga di dalam database atau dokumentasi contoh — automation workflow yang butuh login memakai input yang disediakan pengguna saat runtime, bukan disimpan permanen dalam plaintext oleh sistem.
- Authentication token antara Manager–Agent disimpan di storage lokal aplikasi (bukan file/log biasa), dan tidak pernah ditulis ke `automation_logs`.
- Log tidak boleh mencantumkan isi field yang berpotensi sensitif (mis. value dari action `TYPE` pada field password) — payload semacam ini harus di-mask sebelum ditulis ke log.

## 6. Profile Data Protection

Profile directory (`data/profiles/session-XXX/`) berisi cookies dan storage yang bisa jadi sensitif tergantung apa yang dites. Perlindungan pada level filesystem (permission direktori terbatas untuk user yang menjalankan aplikasi) sudah cukup untuk MVP single-user; enkripsi at-rest untuk profile bisa dipertimbangkan sebagai fitur lanjutan, bukan kebutuhan MVP.

## 7. Safe Automation Boundaries

Sebagai automation/testing tool, sistem ini secara sengaja **tidak** menyediakan:

- Fingerprint spoofing atau anti-deteksi
- Proxy management / rotasi IP
- Bypass CAPTCHA
- Workflow yang ditujukan untuk memanipulasi engagement (like/view/follow) di platform pihak ketiga

Batasan ini bukan sekadar preferensi produk — ini adalah bagian dari desain keamanan proyek: automation engine hanya menyediakan primitif generik (klik, ketik, navigasi, assert) yang juga dipakai untuk QA testing yang sah, dan tidak dirancang atau didokumentasikan sebagai cara menghindari mekanisme keamanan pihak lain.

## 8. Logging Tanpa Membocorkan Credential

- Log mencatat: `session_id`, `run_id`, level, pesan, timestamp.
- Log **tidak** mencatat: token otentikasi, isi field password/credential, cookies/session storage secara verbatim.
- Screenshot yang diambil automation disimpan terpisah dari log terstruktur dan diberi retensi/pembersihan berkala agar tidak menumpuk tanpa batas.
