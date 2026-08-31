# ADR-004 — Tauri vs Electron untuk Desktop Shell

## Status
Accepted (kandidat, dapat direvisi sebelum Phase 1 dimulai)

## Context
Aplikasi ini berjalan lokal, mengendalikan proses Chrome yang sudah berat secara resource. Konsumsi RAM aplikasi orkestrator sendiri penting karena harus berbagi mesin dengan banyak Chrome instance.

## Perbandingan Singkat

| Aspek | Electron | Tauri |
|---|---|---|
| Development speed | Sangat matang, ekosistem besar | Baik, tapi ekosistem lebih kecil |
| Resource usage | Berat (bundle Chromium sendiri) | Ringan (pakai WebView OS) |
| Ekosistem/plugin | Sangat luas | Berkembang, cukup untuk MVP |
| Integrasi proses child (Chrome) | Baik (Node.js child_process matang) | Baik (Rust command API), butuh sedikit lebih banyak boilerplate |
| Cross-platform | Baik | Baik |
| Maintainability | Baik, tapi bundle size besar | Baik, bundle size kecil |
| Learning curve | Rendah untuk tim JS/TS | Sedang (perlu sedikit Rust untuk bagian native) |

## Decision
Tauri direkomendasikan sebagai kandidat awal, dengan catatan: jika tim pengembang tidak nyaman menyentuh Rust sama sekali dan kecepatan development awal jauh lebih diprioritaskan dibanding resource usage, Electron tetap merupakan pilihan yang valid dan lebih rendah risiko untuk MVP.

## Consequences
- (+) Tauri: overhead RAM shell aplikasi jauh lebih kecil dibanding Electron — penting karena Chrome instance yang dikelola sudah memakan banyak RAM.
- (−) Tauri: sebagian logic backend (jika ditulis di Rust) menambah learning curve; mitigasi — bagian TypeScript/Node.js tetap bisa dijalankan sebagai sidecar process jika diperlukan.
- Keputusan ini **tidak mengikat** — boleh dievaluasi ulang di awal Phase 1 berdasarkan kenyamanan tim, sebelum banyak kode ditulis di atasnya.
