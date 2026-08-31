# ADR-002 — CDP sebagai Browser Control Layer

## Status
Accepted

## Context
Sistem butuh cara mengontrol Chrome secara programatik: navigasi, tab, screenshot, baca cookies/storage, observasi network. Opsi yang dipertimbangkan: Chrome DevTools Protocol (CDP) langsung, atau driver eksternal seperti WebDriver/Selenium/Playwright (yang pada akhirnya juga membungkus CDP untuk Chrome).

## Decision
CDP dipakai langsung sebagai lapisan kontrol browser utama, bukan lewat driver eksternal.

## Consequences
- (+) Protokol native Chrome — tidak butuh binary/driver tambahan yang harus disinkronkan versinya dengan Chrome.
- (+) Akses ke kemampuan low-level (network events, runtime domain, emulation) tanpa lapisan abstraksi tambahan.
- (−) Automation Engine harus membangun sendiri abstraksi level-tinggi (Playwright/Puppeteer sudah menyediakan ini) — trade-off yang diterima karena scope automation MVP sengaja generik dan sederhana.
- Catatan evaluasi: menggunakan library seperti Puppeteer (yang sendiri berbasis CDP) sebagai lapisan di atas CDP mentah tetap dapat dipertimbangkan saat implementasi untuk mengurangi boilerplate, selama tidak mengubah keputusan arsitektur "CDP sebagai fondasi kontrol browser".
