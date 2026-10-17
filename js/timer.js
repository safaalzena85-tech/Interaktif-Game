/* ============================================================
   timer.js — Mesin hitung mundur (circular countdown)
   ============================================================ */

class TimerEngine {
  constructor({ onTick, onDone } = {}) {
    this.onTick = onTick || function () {};
    this.onDone = onDone || function () {};

    this.totalSec = 30;
    this.remainingMs = 30000;
    this.running = false;
    this.endsAt = 0;
    this.usedMs = 0;      // akumulasi waktu berjalan (untuk riwayat)
    this._interval = null;
    this._lastTick = 0;
  }

  get totalMs() { return this.totalSec * 1000; }

  setTotal(sec) {
    this.totalSec = Math.max(1, Math.round(sec));
    if (!this.running) {
      this.remainingMs = this.totalMs;
      this.emit();
    }
  }

  /** Mulai soal baru: reset akumulasi waktu, isi penuh, lalu jalankan. */
  beginQuestion(sec) {
    if (sec != null) this.totalSec = Math.max(1, Math.round(sec));
    this.usedMs = 0;
    // Pastikan timer lama benar-benar berhenti dulu, agar reset selalu berlaku.
    this.running = false;
    this._cancel();
    this.remainingMs = this.totalMs;
    this.start();
  }

  start() {
    if (this.running) return;
    if (this.remainingMs <= 0) this.remainingMs = this.totalMs;
    const now = performance.now();
    this.endsAt = now + this.remainingMs;
    this._lastTick = now;
    this.running = true;
    this._cancel();
    // setInterval (bukan rAF) agar tetap akurat walau tab di-background/minimize.
    this._interval = setInterval(() => this._loop(), 100);
    this._loop();
  }

  pause() {
    if (!this.running) return;
    const now = performance.now();
    this.usedMs += Math.max(0, now - this._lastTick);
    this.remainingMs = Math.max(0, this.endsAt - now);
    this.running = false;
    this._cancel();
    this.emit();
  }

  resume() {
    if (this.running || this.remainingMs <= 0) return;
    this.start();
  }

  stop() {
    if (this.running) {
      this.usedMs += Math.max(0, performance.now() - this._lastTick);
    }
    this.running = false;
    this._cancel();
    this.remainingMs = 0;
    this.emit();
  }

  reset(sec) {
    this.running = false;
    this._cancel();
    if (sec != null) this.totalSec = Math.max(1, Math.round(sec));
    this.remainingMs = this.totalMs;
    this.emit();
  }

  /** Tambah waktu. Bila timer berjalan, tambahkan ke waktu berakhir. */
  addTime(sec) {
    const ms = Math.max(1, Math.round(sec)) * 1000;
    if (this.running) {
      this.endsAt += ms;
      this.remainingMs = Math.max(0, this.endsAt - performance.now());
    } else {
      this.remainingMs = Math.max(0, this.remainingMs) + ms;
    }
    this.emit();
  }

  /** Perbarui total secara diam-diam (untuk props progress). */
  emit() {
    this.onTick(this.remainingMs, this.totalMs, this.running);
  }

  _cancel() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
  }

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    this.usedMs += Math.max(0, now - this._lastTick);
    this._lastTick = now;
    this.remainingMs = Math.max(0, this.endsAt - now);
    this.emit();

    if (this.remainingMs <= 0) {
      this.running = false;
      this._cancel();
      this.onDone();
    }
  }
}

/** Warna zona: hijau >50%, kuning 20–50%, merah <20%. */
function timerZone(remainingMs, totalMs) {
  if (totalMs <= 0) return 't-red';
  const r = remainingMs / totalMs;
  if (r > 0.5) return 't-green';
  if (r >= 0.2) return 't-yellow';
  return 't-red';
}
