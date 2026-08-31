# Chrome Automation Manager

Sebuah **browser session orchestration platform** untuk menjalankan, mengisolasi, dan mengontrol banyak sesi Chrome dari satu komputer — dirancang untuk kebutuhan automation, QA/testing, dan pengembangan tooling browser.

## Overview

Chrome Automation Manager mengelola banyak proses Chrome secara bersamaan, masing-masing dengan profile (user-data-directory), konfigurasi device, dan siklus hidup yang terisolasi satu sama lain. Sistem berjalan lokal pada satu PC, dikendalikan lewat sebuah dashboard, dan menggunakan Chrome DevTools Protocol (CDP) sebagai fondasi kontrol browser.

## Why This Project?

Menjalankan banyak instance Chrome secara manual untuk keperluan testing lintas-akun, lintas-device, atau automation berulang itu tidak scalable dan rawan kesalahan (profile bentrok, proses menggantung, tidak ada visibilitas status). Proyek ini menyediakan fondasi terstruktur: satu Application Core yang mengelola siklus hidup banyak Chrome session secara aman, terisolasi, dan dapat diamati.

## Core Features (Target MVP)

- Manajemen banyak Chrome session (create/start/stop/restart/delete)
- Profile isolation penuh per session (cookies, cache, storage, history terpisah)
- Kontrol browser via CDP (navigasi, tab, screenshot, eksekusi runtime, dsb.)
- Extension Agent (Manifest V3) sebagai page-level worker, opsional per session
- Emulasi device (desktop/mobile/tablet) melalui CDP, bukan virtualisasi Android
- Dashboard untuk memonitor status, resource, dan log tiap session
- Automation engine generik (workflow berbasis step sederhana)
- Observability: logs, metrics, events

## Architecture

```
Dashboard → Application Core → Session Manager → Chrome Manager → Chrome Process
                                              └──→ CDP Controller → Chrome DevTools Protocol
                                              └──→ Extension Agent (opsional, page-level)
```

Prinsip inti: **CDP adalah lapisan kontrol browser utama. Extension adalah agent opsional untuk tugas page-level, bukan pusat sistem.**

Detail lengkap ada di [`docs/architecture.md`](docs/architecture.md).

## How It Works

1. User membuat session lewat dashboard.
2. Application Core menyiapkan profile directory baru dan mengalokasikan debug port.
3. Chrome Manager meluncurkan proses Chrome dengan profile tersebut.
4. CDP Controller terhubung ke Chrome untuk kontrol browser-level.
5. (Opsional) Extension Agent terpasang dan melakukan registrasi + heartbeat ke Application Core.
6. Session berstatus `RUNNING` dan siap menerima command atau menjalankan automation workflow.

## Project Structure

```
chrome-automation-manager/
├── app/                # Application core: session, chrome, cdp, extension, automation, monitoring, events
├── dashboard/          # UI kontrol panel
├── extension/          # Chrome Extension (Manifest V3) — agent
├── data/                # profiles, logs, screenshots (runtime data, tidak di-commit)
├── tests/
├── docs/                # Dokumentasi arsitektur (sumber kebenaran utama)
└── README.md
```

## Technology Stack (Kandidat, lihat ADR-004)

- Desktop shell: Tauri (kandidat awal, lihat perbandingan di ADR-004)
- Core/backend: Node.js + TypeScript
- Frontend dashboard: React + TypeScript + Tailwind
- Database: SQLite
- Browser control: Chrome DevTools Protocol
- Extension: Manifest V3 + TypeScript

## Current Scope

Single PC, single user, local-only orchestration untuk sejumlah kecil session (target awal 5, didesain agar bisa berkembang ke ±20 tanpa perubahan arsitektur besar).

## Non-Goals (Saat Ini)

- Emulator Android / device fisik
- Deployment cloud / multi-server
- Manajemen proxy, fingerprint spoofing, anti-deteksi, bypass CAPTCHA, rotasi IP
- Account farming atau manipulasi engagement (like/view/follow) pada platform pihak ketiga

Proyek ini adalah **automation/testing/dev tool**, bukan alat untuk menghindari sistem keamanan platform pihak ketiga.

## Development Roadmap

Lihat [`docs/roadmap.md`](docs/roadmap.md).

## Security & Responsible Use

Proyek ini ditujukan untuk automation dan testing yang sah (mengendalikan browser yang dimiliki/dikendalikan pengguna sendiri, mis. untuk QA internal). Lihat [`docs/security.md`](docs/security.md) untuk model ancaman dan batasan penggunaan.

## Documentation

| Dokumen | Isi |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Arsitektur sistem, komponen, data flow, keputusan desain |
| [docs/browser-sessions.md](docs/browser-sessions.md) | Konsep session, profile isolation, lifecycle Chrome, device emulation |
| [docs/automation.md](docs/automation.md) | Automation engine, workflow, command, error handling |
| [docs/security.md](docs/security.md) | Threat model, autentikasi, secrets, batasan automation |
| [docs/roadmap.md](docs/roadmap.md) | Fase development dan acceptance criteria |

## Project Status

**Phase 0 — Documentation & Architecture.** Belum ada implementasi kode; fondasi desain sedang difinalisasi sebelum development dimulai.

## License

Belum ditentukan (TBD).
