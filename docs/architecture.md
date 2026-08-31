# Architecture

Dokumen ini adalah **Single Source of Truth** untuk arsitektur Chrome Automation Manager.

## 1. System Overview

**Apa?** Sistem yang menjalankan dan mengendalikan banyak proses Chrome secara bersamaan di satu PC, masing-masing terisolasi dalam profile-nya sendiri, dikendalikan lewat Chrome DevTools Protocol (CDP), dan dipantau lewat dashboard.

**Mengapa?** Karena kebutuhan testing/automation lintas-akun atau lintas-konfigurasi device membutuhkan banyak browser environment yang berjalan paralel tanpa saling mengganggu satu sama lain, dan tanpa harus dikelola manual satu per satu.

**Bagaimana?** Application Core menjadi orkestrator: ia membuat profile, meluncurkan proses Chrome, membuka koneksi CDP, secara opsional mendeteksi Extension Agent, lalu mengekspos state tersebut ke dashboard dan automation engine.

## 2. Architecture Diagram

```
                    ┌──────────────────────┐
                    │      Dashboard        │
                    │  (Control Panel UI)   │
                    └──────────┬─────────────┘
                                │  (local API / IPC)
                                ▼
                    ┌──────────────────────┐
                    │   Application Core    │
                    │                        │
                    │  Session Manager       │
                    │  Profile Manager       │
                    │  Chrome Manager        │
                    │  CDP Controller        │
                    │  Automation Engine     │
                    │  Extension Registry    │
                    │  Monitoring            │
                    │  Event Bus             │
                    └──────────┬─────────────┘
                                │
               ┌────────────────┼─────────────────┐
               ▼                ▼                  ▼
        ┌────────────┐   ┌────────────┐    ┌────────────┐
        │ Chrome 001 │   │ Chrome 002 │    │ Chrome 003 │
        │ Profile 01 │   │ Profile 02 │    │ Profile 03 │
        └─────┬──────┘   └─────┬──────┘    └─────┬──────┘
              │ CDP            │ CDP             │ CDP
              │ (+ Extension Agent, opsional)     │
              ▼                ▼                  ▼
        session-001       session-002        session-003
```

## 3. Komponen dan Tanggung Jawab

| Komponen | Tanggung Jawab | Tidak Bertanggung Jawab Atas |
|---|---|---|
| **Session Manager** | Memiliki daftar session, mengelola state/lifecycle tingkat tinggi (`CREATED` → `RUNNING` → `STOPPED`, dst.), memvalidasi transisi state | Meluncurkan proses Chrome secara langsung, mengelola isi profile |
| **Profile Manager** | Membuat/menghapus profile directory, mencegah dua proses memakai profile yang sama, opsional backup | Menjalankan Chrome, kontrol browser |
| **Chrome Manager** | `launch/stop/restart/terminate/forceKill`, alokasi debug port, deteksi crash proses | Interaksi halaman (itu tugas CDP/Extension) |
| **CDP Controller** | Koneksi ke Chrome DevTools Protocol, navigasi, tab, screenshot, runtime eval, cookies/storage read, network & console events | Menyimpan data bisnis session |
| **Extension Registry** | Menerima registrasi & heartbeat dari Extension Agent, meneruskan command page-level | Meluncurkan/mematikan Chrome |
| **Automation Engine** | Menjalankan workflow (urutan step) memakai CDP/Extension sebagai eksekutor, mencatat hasil | Mendefinisikan kebijakan keamanan |
| **Monitoring** | Resource usage (CPU/RAM per session), health check, heartbeat aggregation | Mengubah state session secara langsung (hanya melapor ke Session Manager) |
| **Event Bus** | Menyalurkan event antar komponen agar loosely coupled | Menyimpan log permanen (itu tugas storage layer) |

**Prinsip penting:** CDP adalah lapisan kontrol browser utama (browser-level). Extension Agent adalah worker opsional untuk kebutuhan page-level yang tidak bisa dilakukan CDP secara efisien. Extension **tidak pernah** bertanggung jawab membuat atau menghentikan proses Chrome.

## 4. Data Flow — Membuat Session

```
Dashboard: "Create Session"
      │
      ▼
Session Manager: validasi request, generate session_id, state = CREATED
      │
      ▼
Profile Manager: siapkan direktori data/profiles/session-XXX/
      │
      ▼
Chrome Manager: alokasikan debug port, state = STARTING
      │
      ▼
Chrome Manager: luncurkan proses Chrome dengan profile & port tsb.
      │
      ▼
Chrome Manager: tunggu Chrome siap (poll debug endpoint)
      │
      ▼
CDP Controller: buka koneksi CDP
      │
      ▼
Extension Registry: tunggu registrasi Extension Agent (jika session memerlukan)
      │
      ▼
Session Manager: state = RUNNING
      │
      ▼
Event Bus: emit SESSION_STARTED, CHROME_STARTED, CDP_CONNECTED, (AGENT_CONNECTED)
```

## 5. Session Lifecycle

Lihat detail penuh di [`browser-sessions.md`](browser-sessions.md#lifecycle). Ringkasan state:

```
CREATED → STARTING → RUNNING ⇄ ERROR → RECOVERING → RUNNING
                         │
                         ▼
                     STOPPING → STOPPED
```

## 6. Communication Model

Dua jalur komunikasi terpisah dengan tujuan berbeda:

```
Application Core
   │
   ├── CDP (WebSocket ke chrome://remote-debugging port) ──► Chrome (browser-level control)
   │
   └── Agent Protocol (WebSocket lokal, Manager sebagai server) ──► Extension (page-level agent)
```

**Kenapa dua jalur, bukan satu?** CDP adalah protokol standar Chrome untuk kontrol browser; Extension Agent butuh akses ke context halaman (DOM, content script) yang tidak selalu praktis lewat CDP murni. Keduanya saling melengkapi, bukan saling menggantikan. Detail message envelope ada di `browser-sessions.md` dan `automation.md`.

**Kenapa WebSocket, bukan Native Messaging?** Native Messaging mengikat Extension ke satu proses host per Chrome instance dan lebih kompleks untuk dikelola pada skenario banyak session paralel. WebSocket lokal (Manager sebagai server, Extension sebagai client per session) lebih sederhana untuk mapping N-session ke N-connection, dan lebih mudah di-debug. Trade-off: perlu autentikasi/token di level aplikasi karena WebSocket lokal tidak punya sandboxing seketat Native Messaging — lihat `security.md`.

## 7. Event System

Event bus internal (in-process, bukan message queue eksternal) dipakai agar komponen tidak saling tightly-coupled. Event minimum: `SESSION_CREATED`, `SESSION_STARTED`, `SESSION_STOPPED`, `SESSION_ERROR`, `CHROME_STARTED`, `CHROME_CRASHED`, `CDP_CONNECTED`, `CDP_DISCONNECTED`, `AGENT_CONNECTED`, `AGENT_DISCONNECTED`, `TAB_CREATED`, `TAB_CLOSED`, `NAVIGATION_STARTED`, `NAVIGATION_COMPLETED`, `AUTOMATION_STARTED`, `AUTOMATION_COMPLETED`, `AUTOMATION_FAILED`.

Untuk skala MVP (1 proses, in-process), event bus sederhana (mis. Node `EventEmitter`) sudah cukup — **tidak perlu** message broker eksternal (Kafka/Redis) pada tahap ini.

## 8. Monitoring & Observability

Tiga pilar: **Logs** (per-session, terstruktur), **Metrics** (`session_count`, `running_sessions`, `chrome_cpu_usage`, `chrome_memory_usage`, `agent_connected`, `cdp_connected`, `automation_success/failure`), **Events** (lihat di atas). Tujuan: kegagalan session harus bisa didiagnosis dari log + state tanpa menebak. Lihat detail lebih lanjut di `browser-sessions.md`.

## 9. Design Principles

- **System Before Feature** — fondasi orkestrasi harus solid sebelum fitur automation kompleks ditambahkan.
- **Isolation First** — profile isolation adalah syarat dasar, bukan fitur tambahan.
- **Browser Control First** — CDP adalah fondasi; Extension bersifat suplemen.
- **Extension as Agent** — extension hanya untuk tugas yang memang harus dilakukan di page-layer.
- **Observable by Default** — setiap transisi lifecycle penting harus menghasilkan event dan log.
- **Configuration Over Hardcoding** — device/viewport/profile dikonfigurasi, bukan di-hardcode.
- **Recoverable** — crash harus terdeteksi via heartbeat/process-monitor dan bisa direcovery.
- **Modular Monolith** — satu proses aplikasi, tapi dengan boundary modul yang jelas (bukan microservices).
- **MVP First** — fitur yang belum diperlukan untuk 5 session lokal tidak dimasukkan dulu.

## 10. Architectural Decisions (Ringkasan)

Detail penuh ada di `docs/decisions/`. Ringkasan:

- **ADR-001**: Setiap session memakai user-data-directory Chrome yang terpisah — ini satu-satunya cara andal mencegah kebocoran cookies/storage antar session.
- **ADR-002**: CDP dipilih sebagai lapisan kontrol browser karena merupakan protokol native Chrome, tidak butuh dependency tambahan seperti driver eksternal.
- **ADR-003**: Extension diposisikan sebagai agent opsional, bukan komponen wajib — banyak automation dasar (navigasi, screenshot, form-fill sederhana) bisa dilakukan murni lewat CDP.
- **ADR-004**: Tauri direkomendasikan dibanding Electron untuk resource usage yang jauh lebih ringan saat menjalankan banyak Chrome sekaligus (RAM aplikasi orkestrator sendiri harus seminim mungkin karena Chrome instance-nya sudah berat).
- **ADR-005**: SQLite dipilih untuk MVP karena zero-setup, cukup untuk single-PC, dan mudah bermigrasi ke Postgres nanti jika sistem berkembang ke multi-machine.

## 11. Skala dan Batasan yang Diketahui

Arsitektur ini didesain untuk **1 PC, single-user, ~5–20 Chrome session paralel**. Bottleneck utama pada skala ini adalah **RAM** (tiap Chrome process + tab bisa memakai ratusan MB), bukan arsitektur software. `MAX_CONCURRENT_SESSIONS` harus dikalkulasi dari resource hardware yang tersedia (lihat `browser-sessions.md#resource-management`), bukan angka tetap.

Sistem **belum** didesain untuk multi-machine/multi-user; jika kebutuhan itu muncul, Session Manager dan Chrome Manager perlu dipisah menjadi service yang dapat berjalan di node berbeda (lihat catatan di `roadmap.md` Phase 9), namun ini secara sengaja **di luar scope MVP**.
