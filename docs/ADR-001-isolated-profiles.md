# ADR-001 — Isolated Chrome User Data Directories per Session

## Status
Accepted

## Context
Sistem menjalankan banyak Chrome instance paralel untuk keperluan testing/automation lintas-akun dan lintas-konfigurasi. Chrome secara default menyimpan cookies, local storage, cache, dan history dalam satu user-data-directory.

## Decision
Setiap session diberi user-data-directory (profile) sendiri di `data/profiles/session-XXX/`, dibuat oleh Profile Manager sebelum Chrome diluncurkan, dan tidak pernah dipakai bersamaan oleh dua proses Chrome.

## Consequences
- (+) Kebocoran data antar session (cookies/storage/history) dicegah di level yang paling andal — ini fitur native Chrome, bukan workaround.
- (+) Mendukung kebutuhan utama proyek: banyak akun/konfigurasi berjalan paralel tanpa saling mengganggu.
- (−) Konsumsi disk bertambah linear dengan jumlah session (masing-masing profile menyimpan cache sendiri) — dapat dimitigasi dengan pembersihan cache berkala di roadmap lanjutan.
- (−) Isolation ini **tidak** mencakup identitas jaringan atau fingerprint perangkat — harus dikomunikasikan jelas ke pengguna agar tidak disalahpahami sebagai anti-deteksi (lihat `docs/security.md`).
