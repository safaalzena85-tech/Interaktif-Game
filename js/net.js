/* ============================================================
   net.js — Klien sinkronisasi LAN (Server-Sent Events + POST)
   Dipakai bersama oleh halaman KONTROL (index.html) dan
   halaman TAMPILAN (display.html).
   ============================================================ */

const Net = {
  role: null,        // 'controller' | 'display'
  room: null,
  token: null,
  enabled: false,
  status: 'off',     // off | connecting | online | error | local
  presence: { controllers: 0, displays: 0 },
  lastState: null,

  _es: null,
  _pending: null,
  _pushTimer: null,
  _retryTimer: null,

  /* callback yang bisa diisi pemanggil */
  onState: null,     // (snapshot)
  onPresence: null,  // ({controllers, displays})
  onStatus: null,    // (status)

  base() {
    // Bila halaman dibuka dari file:// tidak ada server → nonaktif.
    return (location.protocol === 'http:' || location.protocol === 'https:') ? '' : null;
  },
  available() { return this.base() !== null; },

  _setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    if (this.onStatus) { try { this.onStatus(s); } catch (e) {} }
  },

  async info() {
    if (!this.available()) return null;
    try { const r = await fetch('/api/info', { cache: 'no-store' }); return await r.json(); }
    catch (e) { return null; }
  },

  /** Buat ruang baru (hanya perangkat kontrol). */
  async createRoom() {
    if (!this.available()) throw new Error('Tidak terhubung ke server.');
    const r = await fetch('/api/room', { method: 'POST' });
    if (!r.ok) throw new Error('Gagal membuat ruang.');
    const j = await r.json();
    this.room = j.room;
    this.token = j.token;
    this.enabled = true;
    return j;
  },

  /** Gabung sebagai penonton (hanya lihat) ke ruang yang ada. */
  joinAsDisplay(room) {
    this.room = String(room || '').toUpperCase();
    this.token = null;
    this.enabled = true;
    return this.room;
  },

  connect(role) {
    if (!this.available()) { this._setStatus('local'); return; }
    if (!this.room) { this._setStatus('error'); return; }
    this.role = role;
    this.enabled = true;
    this._setStatus('connecting');

    let url = '/api/events?role=' + role + '&room=' + encodeURIComponent(this.room);
    if (role === 'controller' && this.token) url += '&token=' + encodeURIComponent(this.token);
    if (this.role === 'display') url += '&t=' + Date.now();

    try {
      this._es = new EventSource(url);
    } catch (e) {
      this._setStatus('error');
      return;
    }

    this._es.addEventListener('open', () => this._setStatus('online'));
    this._es.addEventListener('error', () => {
      // EventSource otomatis reconnect; tampilkan status
      this._setStatus(this._es && this._es.readyState === 2 ? 'error' : 'connecting');
    });
    this._es.addEventListener('state', ev => {
      try {
        const snap = JSON.parse(ev.data);
        this.lastState = snap;
        if (this.onState) this.onState(snap);
      } catch (e) {}
    });
    this._es.addEventListener('presence', ev => {
      try {
        this.presence = JSON.parse(ev.data);
        if (this.onPresence) this.onPresence(this.presence);
      } catch (e) {}
    });
  },

  disconnect() {
    if (this._es) { try { this._es.close(); } catch (e) {} this._es = null; }
    this._setStatus('off');
  },

  /**
   * Kontrol mengirim snapshot keadaan.
   * @param {object} snap
   * @param {boolean} immediate kirim segera (jangan ditunda/di-throttle)
   */
  push(snap, immediate) {
    if (!this.enabled || this.role !== 'controller' || !this.room) return;
    this._pending = snap;
    if (immediate) return this._flush();
    if (this._pushTimer) return;           // sudah dijadwalkan → cukup pakai data terbaru
    this._pushTimer = setTimeout(() => { this._pushTimer = null; this._flush(); }, 180);
  },

  _flush() {
    if (!this.room || !this._pending) return;
    const body = JSON.stringify(this._pending);
    const url = '/api/state?room=' + encodeURIComponent(this.room) + '&token=' + encodeURIComponent(this.token || '');
    try {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true
      }).catch(() => {});
    } catch (e) {}
  },

  /** Tautan untuk perangkat tampilan. */
  displayURL(room) {
    const r = room || this.room;
    return location.origin + '/display?room=' + encodeURIComponent(r || '');
  }
};
