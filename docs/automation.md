# Automation

## 1. Konsep Dasar

**Apa?** Automation Engine adalah fondasi generik untuk menjalankan urutan langkah (workflow) terhadap sebuah session, menggunakan CDP dan/atau Extension Agent sebagai eksekutor.

**Mengapa generik?** Karena tujuan proyek ini adalah *automation/testing tool*, bukan sistem untuk kasus penggunaan spesifik pihak ketiga. Workflow hanya berisi action-level generik (buka URL, klik, ketik, tunggu, assert) — bukan skenario yang ditujukan untuk memanipulasi engagement platform manapun.

## 2. Model: Workflow → Step → Action → Command

```
Workflow ("Login Test")
│
├── Step 1: Open URL
├── Step 2: Wait
├── Step 3: Type Email
├── Step 4: Type Password
├── Step 5: Click Login
├── Step 6: Wait
├── Step 7: Assert Dashboard Visible
└── Step 8: Screenshot
```

Action generik yang didukung MVP: `OPEN_URL`, `CLICK`, `TYPE`, `WAIT`, `SCROLL`, `SCREENSHOT`, `ASSERT`.

Setiap Step diterjemahkan Automation Engine menjadi satu atau lebih **Command** yang dikirim ke CDP Controller (untuk aksi browser-level: navigasi, screenshot) atau ke Extension Agent (untuk aksi page-level tertentu, jika session memilikinya).

## 3. Communication Protocol (Manager ↔ Extension)

Menggunakan message envelope sederhana lewat WebSocket lokal.

**Command (Manager → Extension):**

```json
{
  "type": "COMMAND",
  "id": "cmd-001",
  "session_id": "session-001",
  "action": "CLICK",
  "payload": { "selector": "#submit" },
  "timestamp": 1788160000
}
```

**Result — sukses (Extension → Manager):**

```json
{
  "type": "COMMAND_RESULT",
  "id": "cmd-001",
  "session_id": "session-001",
  "success": true,
  "data": {}
}
```

**Result — error:**

```json
{
  "type": "COMMAND_RESULT",
  "id": "cmd-001",
  "session_id": "session-001",
  "success": false,
  "error": { "code": "ELEMENT_NOT_FOUND", "message": "Element not found" }
}
```

Jenis message minimum: `REGISTER`, `HEARTBEAT`, `COMMAND`, `COMMAND_RESULT`, `EVENT`, `ERROR`, `DISCONNECT`.

**Korelasi & reliability:**
- Setiap `COMMAND` punya `id` unik; `COMMAND_RESULT` wajib membawa `id` yang sama agar Manager bisa mencocokkan request↔response (correlation).
- Setiap command punya **timeout** (dikonfigurasi per action, default beberapa detik); jika tidak ada `COMMAND_RESULT` sebelum timeout, Automation Engine menandai step sebagai gagal (`TIMEOUT`) — tidak menunggu tanpa batas.
- **Retry** hanya dilakukan untuk kegagalan yang secara eksplisit ditandai *retryable* (mis. elemen belum muncul karena halaman masih loading), dengan jumlah percobaan terbatas. Kegagalan seperti `ELEMENT_NOT_FOUND` setelah semua retry habis diteruskan sebagai kegagalan step, bukan kegagalan seluruh workflow secara diam-diam — workflow berhenti dan melaporkan step mana yang gagal.
- **Versioning protokol**: envelope menyertakan field implisit lewat `type`; untuk evolusi ke depan, disarankan menambahkan field `protocol_version` di setiap message begitu ada perubahan struktur yang breaking, agar Extension lama dan Manager baru bisa saling mendeteksi incompatibility alih-alih gagal secara silent.

## 4. Automation via CDP vs via Extension

| Kebutuhan | Jalur |
|---|---|
| Navigasi URL, screenshot, baca cookies, network/console event | CDP langsung (tidak perlu Extension) |
| Klik/ketik pada elemen sederhana yang bisa dijangkau lewat CDP `Input`/`DOM` domain | CDP langsung |
| Interaksi yang butuh konteks halaman lebih dalam (mis. membaca state yang hanya ada di JS context halaman) | Extension Agent |

Automation Engine sebaiknya **mencoba CDP dahulu** untuk action yang bisa dilakukan lewat CDP, dan hanya melibatkan Extension untuk action yang benar-benar membutuhkannya — ini mengurangi ketergantungan workflow pada ada/tidaknya Extension di session tertentu.

## 5. Error Handling

Setiap Step punya hasil: `SUCCESS`, `FAILED`, `TIMEOUT`, `SKIPPED`. Workflow-level status: `RUNNING`, `COMPLETED`, `FAILED`. Kegagalan satu Step (di luar step yang ditandai opsional) menghentikan workflow dan dicatat ke `automation_logs` dengan `session_id`, `run_id`, level, dan pesan — cukup detail agar developer tahu step mana dan kenapa gagal tanpa harus reproduce manual.

## 6. Future Extensibility (Bukan MVP)

- Conditional step / branching sederhana dalam workflow
- Parameterized workflow (mis. jalankan workflow yang sama untuk banyak session dengan input berbeda)
- Workflow scheduling
- Assertion library yang lebih kaya

Semua ini secara sengaja ditunda hingga fondasi single-workflow-per-session stabil.
