# Roadmap

Setiap fase dirancang agar bisa berdiri sendiri dan menghasilkan sesuatu yang bisa diverifikasi, sebelum fase berikutnya dimulai.

## Phase 0 — Documentation & Architecture
- **Objective**: fondasi desain lengkap sebelum development dimulai.
- **Scope**: README + docs/architecture, browser-sessions, automation, security, roadmap; ADR untuk keputusan besar.
- **Expected output**: dokumen ini.
- **Acceptance criteria**: developer baru bisa menjawab pertanyaan di bagian "Definisi Selesai" hanya dari membaca `/docs`.
- **Dependency**: —

## Phase 1 — Chrome Launcher
- **Objective**: bisa meluncurkan satu proses Chrome dengan profile terisolasi dari kode.
- **Scope**: Chrome Manager dasar (`launch`, `stop`, `isRunning`), Profile Manager dasar (buat direktori profile), alokasi debug port.
- **Expected output**: CLI/script sederhana yang bisa launch & stop 1 Chrome dengan profile custom.
- **Acceptance criteria**: dua profile berbeda terbukti tidak berbagi cookies; proses bisa dimatikan bersih tanpa orphan.
- **Dependency**: Phase 0.

## Phase 2 — CDP Controller
- **Objective**: kontrol browser-level via CDP terhadap Chrome yang diluncurkan Phase 1.
- **Scope**: koneksi CDP, navigasi URL, screenshot, baca judul/tab dasar.
- **Expected output**: automation minimal "buka URL → screenshot" berjalan lewat CDP.
- **Acceptance criteria**: koneksi CDP pulih otomatis setelah Chrome restart (reconnect logic teruji).
- **Dependency**: Phase 1.

## Phase 3 — Automation Engine & Recovery (Completed)
- **Objective**: sediakan engine automation tingkat-tinggi untuk menjalankan workflow dan mekanisme recovery dasar.
- **Scope**: `AutomationEngine` untuk aksi tingkat-tinggi (`navigate`, `click`, `type`, `evaluate`, `screenshot`), `workflow-runner` untuk mengeksekusi file JSON/YAML, dan recovery dasar (restart Chrome untuk `session` ketika CDP tidak merespon).
- **Expected output**: workflow sederhana (buka URL → screenshot) berjalan via CLI `run` dan recovery dapat melakukan restart Chrome untuk session tertentu.
- **Acceptance criteria**: workflow dapat dijalankan end-to-end; jika CDP tidak responsif dan workflow mencantumkan `session`, sistem mencoba restart Chrome dan melanjutkan.
- **Dependency**: Phase 2.

## Phase 4 — Extension Agent
- **Objective**: Extension Manifest V3 bisa terpasang, registrasi, dan menerima command dasar.
- **Scope**: Background Service Worker + Content Script, Agent Protocol (WebSocket + token auth), heartbeat.
- **Expected output**: satu command page-level sederhana (mis. `CLICK`) berhasil dieksekusi lewat Extension.
- **Acceptance criteria**: kehilangan koneksi Extension terdeteksi (status `UNRESPONSIVE`) tanpa membuat seluruh session `ERROR`.
- **Dependency**: Phase 3.

## Phase 5 — Dashboard
- **Objective**: UI untuk melihat dan mengendalikan session tanpa CLI.
- **Scope**: halaman Dashboard, Sessions, Session Detail, Settings; menampilkan status Chrome/CDP/Agent, resource usage dasar.
- **Expected output**: dashboard web yang terhubung ke Application Core lokal.
- **Acceptance criteria**: semua operasi lifecycle (start/stop/restart/delete) bisa dilakukan dari UI.
- **Dependency**: Phase 3 (bisa paralel dengan Phase 4).

## Phase 6 — Mobile Emulation
- **Objective**: device profile (desktop/mobile/tablet/custom) bisa dikonfigurasi per session.
- **Scope**: integrasi CDP `Emulation` domain, preset device umum, custom viewport.
- **Expected output**: session bisa dibuat dengan konfigurasi device tertentu dan terverifikasi lewat screenshot.
- **Acceptance criteria**: viewport/deviceScaleFactor/mobile flag konsisten dengan konfigurasi yang diminta.
- **Dependency**: Phase 2.

## Phase 7 — Automation Engine
- **Objective**: workflow multi-step bisa didefinisikan dan dijalankan.
- **Scope**: model Workflow/Step/Action, eksekusi lewat CDP dan/atau Extension, pencatatan hasil ke `automation_runs`/`automation_logs`.
- **Expected output**: workflow generik (mis. login test) berjalan end-to-end pada satu session.
- **Acceptance criteria**: kegagalan satu step terlaporkan dengan jelas (step mana, kenapa) tanpa harus reproduce manual.
- **Dependency**: Phase 4, Phase 5.

## Phase 8 — Reliability & Monitoring
- **Objective**: sistem tahan terhadap crash dan bisa diamati secara menyeluruh.
- **Scope**: recovery otomatis (Chrome crash → relaunch), resource monitor (CPU/RAM per session), metrics dasar, `MAX_CONCURRENT_SESSIONS` berbasis hardware.
- **Expected output**: session yang crash pulih otomatis dalam batas retry yang ditentukan; dashboard menampilkan resource usage real-time.
- **Acceptance criteria**: uji crash-inject (kill proses Chrome paksa) menghasilkan recovery yang sesuai spesifikasi state machine.
- **Dependency**: Phase 3, Phase 5.

## Phase 9 — Multi-Machine (Eksplorasi, di luar MVP)
- **Objective**: eksplorasi arsitektur untuk menjalankan session di lebih dari satu mesin.
- **Scope**: *belum didefinisikan* — memerlukan pemisahan Session Manager/Chrome Manager menjadi service terpisah dari Application Core. Ini dicatat sebagai arah masa depan, bukan komitmen desain saat ini.
- **Expected output**: dokumen eksplorasi/ADR terpisah jika fase ini dimulai.
- **Acceptance criteria**: —
- **Dependency**: Phase 8 selesai dan stabil di produksi single-PC.

## Open Questions (dicatat, belum diputuskan)
- Apakah Chrome child process di-terminate atau dibiarkan hidup (reattach) saat Application Core dimatikan? (lihat `browser-sessions.md#chrome-process-management`)
- Kapan protocol versioning (`protocol_version` di message envelope) mulai diberlakukan — dari Phase 4 atau ditunda sampai ada perubahan breaking pertama?
