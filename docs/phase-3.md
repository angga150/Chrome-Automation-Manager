# Phase 3 — Automation Engine

## Tujuan
Phase 3 memperkenalkan lapisan automation engine yang memanfaatkan CDP Controller untuk menjalankan aksi tingkat-tinggi (navigate, click, type, evaluate, screenshot) sebagai building block workflow.

## Scope
- Integrasi `CDPController` ke dalam API automation yang mudah dipanggil.
- Implementasi aksi dasar: `navigate`, `click`, `type`, `evaluate`, `screenshot`.
- Runner workflow sederhana (JSON/YAML) untuk mengeksekusi langkah berurutan.
- Robust session recovery: reconnect, restart Chrome jika perlu, bersihkan PID.
- Logging/telemetry dasar untuk observabilitas.

## Automation API (high-level)
AutomationEngine (initial):

- `AutomationEngine.connect(port: number)` — buat koneksi ke endpoint CDP pada `port`.
- `navigate(url: string)` — navigasi halaman dan tunggu load event.
- `click(selector: string)` — klik elemen dengan selector CSS (simple fallback via `Runtime.evaluate`).
- `type(selector: string, text: string)` — set value dan dispatch input events (basic implementation).
- `evaluate(expression: string)` — jalankan JS di context halaman dan kembalikan hasilnya.
- `screenshot(options?)` — ambil screenshot sebagai Buffer (png/webp/jpeg).
- `close()` — tutup koneksi CDP.

## Workflow format (example)
YAML example:

```yaml
session: session1
steps:
  - action: navigate
    url: https://example.com
  - action: click
    selector: '#accept'
  - action: type
    selector: '#search'
    text: 'hello world'
  - action: screenshot
    out: result.png
```

## CLI Integration
- Tambahkan `cli run <workflow.yaml>` yang mem-parse workflow dan mengeksekusi langkah via `AutomationEngine`.

## Acceptance Criteria
- Engine mampu menghubungkan ke CDP dan meng-eksekusi `navigate` + `screenshot` reliably.
- Engine mempunyai reconnect hooks dan lapisan kesalahan terukur.
- CLI `run` dapat menjalankan workflow contoh di atas.

## Next steps
1. Implementasi `AutomationEngine` scaffold dan integrasi dasar `navigate` + `screenshot`.
2. Implement `cli run` untuk file workflow.
3. Tambah recovery: restart Chrome bila koneksi gagal berkali-kali.
4. Add unit + E2E tests for workflows.
