# ADR-005 — SQLite untuk MVP

## Status
Accepted

## Context
Sistem butuh menyimpan state session, konfigurasi, tab, dan log automation. Berjalan single-PC, single-user.

## Decision
SQLite dipakai sebagai database untuk seluruh entity MVP (`sessions`, `session_configs`, `tabs`, `automation_runs`, `automation_logs`).

## Consequences
- (+) Zero-setup, file tunggal, cocok untuk aplikasi desktop lokal.
- (+) Cukup untuk skala 5–20 session dan volume log yang dihasilkan single-PC.
- (−) Tidak cocok untuk multi-writer/multi-machine — jika Phase 9 (multi-machine) benar-benar dikerjakan, migrasi ke Postgres (atau serupa) perlu direncanakan ulang sebagai keputusan terpisah, bukan asumsi implisit.
