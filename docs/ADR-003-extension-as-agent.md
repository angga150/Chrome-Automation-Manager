# ADR-003 — Extension sebagai Agent, Bukan Pusat Sistem

## Status
Accepted

## Context
Ada dua desain yang mungkin: (a) Extension bertanggung jawab penuh mengelola Chrome dan komunikasi automation, dengan Manager hanya sebagai UI; (b) CDP Controller di Application Core sebagai kontrol utama, Extension hanya agent opsional untuk kebutuhan page-level.

## Decision
Opsi (b) dipilih. Extension tidak pernah membuat, meluncurkan, atau menghentikan proses Chrome — itu tugas Chrome Manager di Application Core. Extension hanya menjadi agent page-level opsional yang teregistrasi ke Application Core.

## Consequences
- (+) Session tetap bisa dikendalikan (navigasi, screenshot, sebagian besar automation) walau Extension tidak terpasang atau gagal load.
- (+) Menghindari single point of failure di Extension — proses Chrome tidak bergantung pada Extension untuk lifecycle dasarnya.
- (−) Untuk kebutuhan page-level yang benar-benar butuh Extension, sistem harus menangani kasus "Extension belum/ tidak terpasang" secara eksplisit (status `Agent: OFFLINE`, workflow terkait ditandai gagal/skip, bukan hang).
