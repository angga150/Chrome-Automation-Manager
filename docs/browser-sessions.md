# Browser Sessions

## 1. Apa itu Session?

> **Session = satu unit browser environment yang dikelola sistem.**

Setiap session memiliki proses Chrome, profile (data browser), konfigurasi device, dan (opsional) Extension Agent-nya sendiri — sepenuhnya terpisah dari session lain.

```
Session
├── Identity        → id, name
├── Browser          → chrome process, debug port, CDP connection
├── Profile          → user data directory, cookies, storage, cache, history
├── Device Config    → width, height, deviceScaleFactor, mobile mode, user agent
├── Tabs
├── Extension Agent  → opsional
├── Monitoring        → resource usage, health
└── Logs
```

Operasi yang didukung setiap session: `CREATE`, `START`, `STOP`, `RESTART`, `PAUSE`, `RESUME`, `DELETE`.

**Catatan desain — Session vs Profile sebagai entity terpisah:** Session dan Profile secara sengaja dipisah sebagai entity, meskipun 1 session pada MVP hanya memiliki 1 profile aktif. Alasannya: (1) memudahkan fitur "reuse profile di session baru" di masa depan tanpa migrasi skema, (2) profile punya lifecycle-nya sendiri (bisa ada tanpa session yang sedang berjalan). Untuk MVP, relasinya tetap 1:1 dan tidak perlu didesain sebagai many-to-many.

## 2. Session Lifecycle

```
CREATED
   │
   ▼
STARTING
   │
   ▼
RUNNING ──────────────► ERROR
   │                       │
   │                       ▼
   │                   RECOVERING
   │                       │
   │                       ▼
   │                   RUNNING
   ▼
STOPPING
   │
   ▼
STOPPED
```

| State | Arti | Siapa yang mengubah |
|---|---|---|
| `CREATED` | Record session sudah ada, profile disiapkan, Chrome belum jalan | Session Manager |
| `STARTING` | Chrome sedang diluncurkan, CDP belum tersambung | Chrome Manager |
| `RUNNING` | Chrome jalan, CDP tersambung, session siap dipakai | CDP Controller (konfirmasi koneksi) |
| `ERROR` | Chrome crash, CDP terputus tak terduga, atau timeout start | Monitoring / Chrome Manager |
| `RECOVERING` | Sistem sedang mencoba memulihkan (relaunch Chrome, rekoneksi CDP) | Chrome Manager |
| `STOPPING` | Permintaan stop diterima, graceful shutdown berjalan | Session Manager |
| `STOPPED` | Chrome sudah dimatikan, resource dilepas | Chrome Manager |

**Menangani crash:** Chrome Manager memantau proses via process handle (exit code/signal). Jika proses berhenti tanpa perintah `STOP`, state langsung berubah ke `ERROR` dan event `CHROME_CRASHED` dipancarkan. **Recovery** dilakukan dengan: (1) bersihkan koneksi CDP lama, (2) cek profile tidak dalam keadaan locked, (3) relaunch Chrome dengan profile yang sama, (4) sambungkan ulang CDP. Jika recovery gagal N kali (dikonfigurasi), session dibiarkan di `ERROR` dan butuh intervensi manual — sistem tidak retry tanpa batas.

**Heartbeat:** dipakai untuk dua hal berbeda — (1) Chrome Manager memantau proses OS-level (selalu tersedia, tidak tergantung Extension), (2) jika Extension Agent terpasang, ia mengirim heartbeat berkala ke Extension Registry untuk menandakan page-context masih hidup. Kehilangan heartbeat Extension **tidak** otomatis membuat session `ERROR` — itu hanya membuat status Agent menjadi `UNRESPONSIVE` (lihat bagian Health Monitoring), karena Chrome sendiri masih bisa sehat walau Extension bermasalah.

## 3. Profile Isolation

> **Kenapa penting?** Tanpa isolation, semua Chrome instance berbagi cookies/storage/history yang sama — testing multi-akun jadi tidak mungkin, dan satu session yang korup bisa merusak session lain.

```
data/
└── profiles/
    ├── session-001/
    ├── session-002/
    └── session-003/
```

Setiap profile directory berisi data browser standar Chrome: cookies, local storage, cache, history, dan session-specific settings. Relasi `session_id ↔ profile_path` bersifat 1:1 dan disimpan di tabel `sessions`.

**Lifecycle profile:**
1. **Dibuat** saat session dibuat, sebelum Chrome diluncurkan (Profile Manager membuat direktori kosong).
2. **Dipakai** selama session `RUNNING`/`STOPPED` (tetap ada meski Chrome sedang tidak jalan, agar data persisten antar restart).
3. **Dihapus** hanya saat session dihapus secara eksplisit (`DELETE`), bukan otomatis saat `STOP`.

**Mencegah dua Chrome memakai profile yang sama:** Chrome sendiri sudah punya proteksi native (lock file di dalam user-data-directory) yang akan membuat instance kedua gagal start atau membuka window baru di proses yang sama. Profile Manager menambahkan lapisan proteksi aplikasi: sebelum launch, cek apakah `session.status == RUNNING` untuk profile tsb; jika ya, tolak permintaan launch kedua.

**Backup/recovery (masa depan, bukan MVP):** direktori profile bisa di-snapshot (copy) secara periodik atau sebelum operasi berisiko (mis. sebelum automation run besar), disimpan terpisah dari profile aktif, dan bisa di-restore dengan mengganti isi direktori saat session dalam state `STOPPED`.

**Batasan penting — apa yang TIDAK diberikan oleh profile isolation:**

```
Browser Profile Isolation
        ≠
Network Identity Isolation   (semua session tetap berbagi IP/network yang sama)
        ≠
Device Fingerprint Isolation (Canvas/WebGL/hardware fingerprint tetap bisa sama antar session)
```

Profile isolation hanya mengisolasi **data browser** (cookies, storage, history). Ia bukan mekanisme anti-deteksi dan secara sengaja tidak didesain sebagai itu — lihat batasan proyek di README.

## 4. Chrome Process Management

```
ChromeManager
├── launch()
├── stop()          // graceful shutdown (SIGTERM / CDP Browser.close)
├── restart()
├── terminate()
├── forceKill()      // SIGKILL, untuk proses yang tidak merespons
├── isRunning()
└── getProcessInfo() // PID, uptime, resource usage
```

Alur peluncuran:

```
Create Session → Prepare Profile → Allocate Debug Port → Launch Chrome
→ Wait Until Ready → Connect CDP → Detect Extension Agent (opsional) → Session Ready
```

Kondisi yang harus ditangani secara eksplisit:

- **Port conflict** — Chrome Manager memelihara pool port yang sedang dipakai; alokasi port baru selalu cek availability sebelum digunakan.
- **Profile lock** — jika direktori profile terkunci oleh proses lain (mis. sisa proses zombie), launch harus gagal dengan error jelas, bukan diam-diam menunggu.
- **Startup timeout** — jika Chrome tidak merespons debug endpoint dalam waktu tertentu, state pindah ke `ERROR` dan proses yang terlanjur jalan di-kill agar tidak jadi orphan.
- **Orphan process** — saat Application Core dimatikan, semua Chrome child process harus di-terminate (atau, sebagai opsi konfigurasi, dibiarkan hidup untuk "reattach" — ini keputusan desain yang perlu diputuskan sebelum implementasi, tandai sebagai open question di roadmap).
- **Graceful vs force shutdown** — `stop()` selalu mencoba graceful dulu (beri waktu Chrome menutup tab dengan bersih), baru fallback ke `forceKill()` jika tidak merespons dalam batas waktu.

## 5. CDP — Peran dan Kemampuan

CDP Controller adalah satu-satunya jalur kontrol browser-level. Kemampuan konseptual yang dipakai sistem: navigasi, manajemen target/tab, interaksi halaman (klik/ketik via `Input` domain), screenshot, eksekusi runtime terbatas, baca cookies/storage, observasi network & console event, dan device emulation (`Emulation` domain).

CDP Controller **tidak** menyimpan data bisnis (itu tugas database); ia hanya jembatan protokol antara Application Core dan Chrome.

## 6. Extension Agent

Extension memakai Manifest V3, terdiri dari Background Service Worker + Content Script. Perannya: registrasi ke Application Core, kirim heartbeat, terima command tertentu dari Manager, lakukan interaksi/observasi page-level yang memang diizinkan, dan laporkan hasil/error kembali.

> **Extension bukan pengganti CDP.** CDP = kontrol browser-level (proses, tab, network). Extension = agent page-level (DOM interaction dalam konteks halaman, membaca informasi yang memang accessible dari content script).

Extension bersifat **opsional per session** — session tetap bisa `RUNNING` dan dipakai automation dasar tanpa Extension terpasang, jika workflow hanya butuh kemampuan CDP.

## 7. Device Configuration & Mobile Emulation

Sistem mendukung profil device: Desktop, Mobile, Tablet, Custom — semuanya diterapkan lewat CDP `Emulation` domain (viewport, device scale factor, mobile flag, opsional user agent untuk kebutuhan testing).

```json
{
  "device": {
    "name": "Mobile Test",
    "width": 390,
    "height": 844,
    "deviceScaleFactor": 3,
    "mobile": true
  }
}
```

> **Penting: mobile emulation bukan virtualisasi Android.** Ini tetap Chrome desktop yang menyamarkan viewport/UA-nya untuk kebutuhan responsive testing:
>
> `Chrome Desktop + Device Emulation = Mobile Web Testing Environment` — **bukan** `Android Device`.

## 8. Health Monitoring

```
Extension Agent ──HEARTBEAT──► Application Core
```

Status yang dilacak per session: `Chrome: ONLINE/OFFLINE`, `CDP: CONNECTED/DISCONNECTED`, `Extension: ONLINE/OFFLINE/UNRESPONSIVE`, `Session: HEALTHY/DEGRADED/ERROR`.

```
HEALTHY → (heartbeat berhenti) → UNRESPONSIVE → RECOVERING → HEALTHY (jika pulih)
```

`Session: HEALTHY` membutuhkan Chrome online + CDP connected; status Extension memengaruhi kualitas (`DEGRADED` jika Extension dibutuhkan workflow tapi offline), bukan langsung menjatuhkan seluruh session ke `ERROR`.

## 9. Resource Management

Menjalankan banyak session berarti konsumsi RAM/CPU/GPU/disk I/O/network yang signifikan (Chrome tergolong berat per instance).

```
System        CPU 42%   RAM 68%   GPU 21%
Sessions
  001   420 MB
  002   390 MB
  003   510 MB
```

`MAX_CONCURRENT_SESSIONS` **harus dihitung dari kapasitas hardware** (RAM tersedia dibagi rata-rata konsumsi per Chrome + margin aman), bukan angka absolut yang di-hardcode — mesin dengan 8GB RAM dan 64GB RAM punya kapasitas realistis yang sangat berbeda. Monitoring komponen bertugas memberi sinyal (`RESOURCE_WARNING`) sebelum sistem mencoba meluncurkan session baru yang berisiko membuat seluruh mesin tidak responsif.

## 10. Race Condition & Concurrency

Dua area rawan race condition yang harus ditangani secara eksplisit sejak MVP:

- **Dua request launch untuk profile yang sama secara bersamaan** → Profile Manager harus melakukan cek-dan-kunci (lock) secara atomik, bukan cek lalu launch terpisah (time-of-check-to-time-of-use).
- **Alokasi debug port bersamaan** → Chrome Manager perlu reservasi port secara atomik dalam satu operasi, bukan "cari port bebas" lalu "pakai" sebagai dua langkah terpisah.

Pada MVP dengan satu proses Application Core, ini bisa diselesaikan dengan lock in-memory sederhana (mutex per profile/port) — tidak perlu distributed lock.
