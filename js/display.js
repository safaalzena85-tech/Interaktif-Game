/* ============================================================
   display.js — Logika Layar Tampilan (peserta)
   Menerima snapshot dari perangkat KONTROL lewat Net (SSE) dan
   menampilkannya secara read-only + efek loading bar & suara.
   ============================================================ */

const $ = sel => document.querySelector(sel);

/* ---------------- Suara ---------------- */
let _actx = null;
let soundOn = false;

function getCtx() {
  try { _actx = _actx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { _actx = null; }
  if (_actx && _actx.state === 'suspended') { try { _actx.resume(); } catch (e) {} }
  return _actx;
}
function tone(freq, startAt, durMs, gain, type) {
  const ctx = getCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, startAt);
  osc.connect(g); g.connect(ctx.destination);
  const dur = durMs / 1000;
  g.gain.setValueAtTime(0.0001, startAt);
  g.gain.exponentialRampToValueAtTime(gain || 0.2, startAt + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.start(startAt); osc.stop(startAt + dur + 0.03);
}
function playJudge(correct) {
  if (!soundOn) return;
  const ctx = getCtx(); if (!ctx) return;
  const t0 = ctx.currentTime + 0.01;
  if (correct) {
    [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.50, 0.36]].forEach((n, i) => {
      tone(n[0], t0 + n[1], i === 3 ? 0.34 : 0.14, 0.25, 'triangle');
    });
  } else {
    [[311.13, 0, 0.18], [233.08, 0.16, 0.20], [155.56, 0.34, 0.38]].forEach(n => {
      tone(n[0], t0 + n[1], n[2], 0.22, 'sawtooth');
    });
  }
}
function beepTick() { if (soundOn) { const ctx = getCtx(); if (ctx) tone(880, ctx.currentTime + 0.005, 90, 0.22, 'sine'); } }

/* ---------------- Timer lokal (interpolasi) ---------------- */
const tState = { remainingMs: 30000, totalMs: 30000, running: false, enabled: true, at: performance.now() };
let _lastBeepSec = null;

function setTimer(t) {
  if (!t) return;
  tState.remainingMs = t.remainingMs || 0;
  tState.totalMs = t.totalMs || 0;
  tState.running = !!t.running;
  tState.enabled = t.enabled !== false;
  tState.at = performance.now();
}
function remainNow() {
  if (!tState.running) return tState.remainingMs;
  return Math.max(0, tState.remainingMs - (performance.now() - tState.at));
}
function paintTimer() {
  const rem = remainNow();
  const total = tState.totalMs;
  const wrap = $('#d-timer');
  const secs = Math.ceil(rem / 1000);
  $('#dtr-num').textContent = secs;

  const r = 54, circ = 2 * Math.PI * r;
  const ratio = total > 0 ? Math.max(0, Math.min(1, rem / total)) : 0;
  const prog = $('#dtr-prog');
  prog.style.strokeDasharray = circ;
  prog.style.strokeDashoffset = circ * (1 - ratio);

  const warn = rem > 0 && rem <= 10000 && tState.running;
  let zone = timerZone(rem, total);
  if (warn) zone = 't-red';
  wrap.classList.remove('t-green', 't-yellow', 't-red');
  wrap.classList.add(zone);
  wrap.classList.toggle('blink', warn);

  // beep tiap detik di 10 detik terakhir
  if (tState.running && rem > 0) {
    const s = Math.ceil(rem / 1000);
    if (s !== _lastBeepSec) { _lastBeepSec = s; if (s <= 10) beepTick(); }
  } else {
    _lastBeepSec = null;
  }
}
function timerLoop() { paintTimer(); setInterval(paintTimer, 80); }

/* ---------------- Tata letak papan ---------------- */
let boardBoxes = [];   // [{n, status, category, result}]
function layoutBoard() {
  const grid = $('#d-board');
  if (!grid || grid.classList.contains('hidden')) return;
  const n = boardBoxes.length;
  if (!n) return;
  const W = grid.clientWidth, H = grid.clientHeight;
  if (!W || !H) return;
  const gap = 14;
  let best = { cols: 1, cell: 0 };
  for (let cols = 1; cols <= Math.min(n, 14); cols++) {
    const rows = Math.ceil(n / cols);
    const cw = (W - (cols - 1) * gap) / cols;
    const ch = (H - (rows - 1) * gap) / rows;
    const cell = Math.min(cw, ch);
    if (cell > best.cell) best = { cols, cell };
  }
  const cell = Math.max(40, Math.min(210, Math.floor(best.cell)));
  grid.style.setProperty('--cols', best.cols);
  grid.style.setProperty('--cell', cell + 'px');
}

function renderBoard(snap) {
  const grid = $('#d-board');
  const order = snap.boxOrder || [];
  boardBoxes = order.map(n => snap.boxes[n]).filter(Boolean);
  grid.innerHTML = '';
  boardBoxes.forEach(b => {
    const cat = CATS[b.category];
    const el = document.createElement('div');
    el.className = 'box';
    el.style.cursor = 'default';
    if (b.status === 'done') {
      el.classList.add('done', cat ? cat.css : '', b.result === 'correct' ? 'r-correct' : 'r-wrong');
      el.innerHTML =
        `<span class="box-num">${b.n}</span>` +
        `<span class="box-check">${b.result === 'correct' ? '✔' : '✖'}</span>` +
        `<span class="box-pts">${cat ? cat.points : ''} poin</span>`;
    } else {
      el.innerHTML = `<span class="box-num">${b.n}</span><span class="box-secret">?</span>`;
    }
    grid.appendChild(el);
  });
  layoutBoard();
}

/* ---------------- Pertanyaan ---------------- */
function renderQuestion(snap) {
  const c = snap.current;
  const panel = $('#d-question');
  const boardWrap = $('#d-board-wrap');
  const active = c && c.phase === 'question';

  if (!active) {
    panel.classList.add('hidden');
    boardWrap.classList.remove('hidden');
    // Pastikan papan ter-render saat kembali idle
    layoutBoard();
    return;
  }

  boardWrap.classList.add('hidden');
  panel.classList.remove('hidden');
  panel.classList.toggle('covered', !c.questionShown);

  const cat = CATS[c.category];
  const catChip = $('#dq-cat');
  catChip.textContent = cat ? `${cat.label} · ${c.points} poin` : 'Kategori';
  catChip.className = 'dq-cat' + (cat ? ' ' + cat.css : '');
  $('#dq-num').textContent = 'Soal #' + c.boxN;

  $('#dq-q').textContent = c.question || '';
  const aWrap = $('#dq-a');
  if (c.answerShown) { aWrap.classList.remove('hidden'); $('#dq-answer').textContent = c.answer || ''; }
  else aWrap.classList.add('hidden');

  let foot = '';
  if (c.mode === 'throw') {
    foot = `➡️ Dilempar dari <b>${escapeHtml(c.throwerName || '')}</b> · penjawab <b>${escapeHtml(c.answererName || '')}</b>`;
  } else {
    foot = `🙋 Penjawab: <b>${escapeHtml(c.answererName || c.throwerName || '')}</b>`;
  }
  $('#dq-foot').innerHTML = foot;
}

/* ---------------- Papan skor ---------------- */
function renderRanks(snap) {
  const wrap = $('#d-ranks');
  const ranking = snap.ranking || [];
  $('#d-ranks-sub').textContent = ranking.length ? ranking.length + ' peserta' : 'real-time';
  if (!ranking.length) {
    wrap.innerHTML = '<p class="empty">Belum ada peserta.<br><small>Papan skor akan muncul di sini.</small></p>';
    return;
  }
  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
  wrap.innerHTML = ranking.map(p => {
    const cls = 'd-rank-row' + (p.rank <= 3 ? ' r' + p.rank : '') + (snap.activeId === p.id ? ' active' : '');
    const pos = p.rank <= 3 ? medals[p.rank] : p.rank;
    return `<div class="${cls}">
      <span class="d-rank-pos">${pos}</span>
      <span class="d-rank-name">${escapeHtml(p.name)}${snap.activeId === p.id ? '<span class="d-rank-tag">AKTIF</span>' : ''}</span>
      <span class="d-rank-pts">${p.score}</span>
    </div>`;
  }).join('');
}

/* ---------------- Fase / status ---------------- */
function renderPhase(snap) {
  const el = $('#d-phase');
  const c = snap.current;
  if (snap.phase === 'intro') { el.innerHTML = 'Mempersiapkan…'; return; }
  if (c && c.phase === 'question') {
    el.innerHTML = c.answerShown ? 'Jawaban ditampilkan' : 'Soal sedang dimainkan';
  } else if (c && c.phase === 'choose') {
    el.innerHTML = 'Soal dibuka — menunggu mekanisme jawaban';
  } else if (c && c.phase === 'target') {
    el.innerHTML = 'Menunggu peserta tujuan lemparan';
  } else {
    const left = snap.counts ? snap.counts.left : null;
    el.innerHTML = left == null ? 'Menunggu permainan dimulai…' : `Pilih kotak soal · <b>${left}</b> tersisa`;
  }
}

/* ---------------- Intro (loading bar) ---------------- */
function renderIntro(snap) {
  const el = $('#d-intro');
  if (snap.intro) {
    el.classList.remove('hidden');
    $('#di-sub').textContent = snap.intro.label || 'Bersiap memulai…';
    const pct = Math.max(0, Math.min(100, Math.round(snap.intro.pct || 0)));
    $('#di-fill').style.width = pct + '%';
    $('#di-pct').textContent = pct + '%';
    $('#d-bigfs').classList.add('hidden');
  } else {
    el.classList.add('hidden');
  }
}

/* ---------------- Popup BENAR / SALAH ---------------- */
let _lastPopupAt = null;
let _popupTimer = null;
function renderPopup(snap) {
  const p = snap.popup;
  if (!p || !p.at) return;
  if (p.at === _lastPopupAt) return;
  _lastPopupAt = p.at;

  const el = $('#d-judge');
  el.classList.remove('correct', 'wrong');
  el.classList.add(p.correct ? 'correct' : 'wrong');
  $('#dj-icon').textContent = p.correct ? '✔' : '✘';
  $('#dj-title').textContent = p.correct ? 'BENAR!' : 'SALAH';
  const e = p.entry || {};
  let sub = escapeHtml(e.answererName || '');
  if (e.mode === 'throw' && e.throwerName) sub += ` <span style="opacity:.7">(dilempar dari ${escapeHtml(e.throwerName)})</span>`;
  $('#dj-sub').innerHTML = sub;
  let pts = p.correct ? `+${e.earned || 0} poin` : '0 poin';
  if (e.penalty) pts += ` · Pelempar −${e.penalty}`;
  $('#dj-pts').textContent = sub ? pts : '';

  el.classList.add('show');
  playJudge(p.correct);
  if (_popupTimer) clearTimeout(_popupTimer);
  _popupTimer = setTimeout(() => el.classList.remove('show'), p.correct ? 2200 : 1900);
}

/* ---------------- Status koneksi ---------------- */
function renderStatus(status) {
  const el = $('#d-status');
  const map = {
    offline: ['connecting', 'Menyambung…'],
    connecting: ['connecting', 'Menyambung…'],
    online: ['online', 'Terhubung'],
    error: ['error', 'Terputus'],
    off: ['connecting', 'Menunggu…'],
    local: ['error', 'Butuh server']
  };
  const [cls, text] = map[status] || map.connecting;
  el.className = 'd-status ' + cls;
  el.querySelector('b').textContent = text;
}
function renderPresence(p) {
  // indikator halus pada chip pemain
  const chip = $('#d-count');
  chip.textContent = (chip.dataset.n || '0') + ' pemain';
}

/* ---------------- Render utama dari snapshot ---------------- */
function applySnapshot(snap) {
  if (!snap) return;
  $('#d-room').textContent = 'Ruang ' + (snap.room || '—');
  $('#d-count').dataset.n = (snap.ranking ? snap.ranking.length : 0);
  $('#d-count').textContent = (snap.ranking ? snap.ranking.length : 0) + ' pemain';
  $('#d-bigfs').classList.add('hidden');

  renderBoard(snap);
  renderQuestion(snap);
  renderRanks(snap);
  renderPhase(snap);
  renderIntro(snap);
  setTimer(snap.timer);
  renderPopup(snap);

  // tata ulang papan setelah DOM berubah
  layoutBoard();
}

/* ---------------- Koneksi ---------------- */
function currentRoomFromURL() {
  const p = new URLSearchParams(location.search);
  return (p.get('room') || p.get('r') || '').toUpperCase().trim();
}

function startAsDisplay(room) {
  Net.joinAsDisplay(room);
  $('#d-join').classList.add('hidden');
  bindNet();
  Net.connect('display');
}

function bindNet() {
  Net.onState = applySnapshot;
  Net.onStatus = renderStatus;
  Net.onPresence = renderPresence;
}

function showJoin(prefill) {
  const j = $('#d-join');
  j.classList.remove('hidden');
  if (prefill) $('#join-room').value = prefill;
  setTimeout(() => $('#join-room').focus(), 60);
}

async function tryJoin() {
  const code = $('#join-room').value.trim().toUpperCase();
  const err = $('#join-err');
  err.textContent = '';
  if (!code) { err.textContent = 'Masukkan kode ruang.'; return; }
  if (!Net.available()) { err.textContent = 'Halaman ini harus dibuka dari server (http://…), bukan file://.'; return; }
  try {
    const r = await fetch('/api/health?room=' + encodeURIComponent(code), { cache: 'no-store' });
    const j = await r.json();
    if (!j.ok) { err.textContent = 'Kode ruang tidak ditemukan. Pastikan perangkat kontrol sudah membuat ruang.'; return; }
  } catch (e) {
    err.textContent = 'Tidak bisa menghubungi server.';
    return;
  }
  startAsDisplay(code);
}

/* ---------------- Fullscreen ---------------- */
function isFS() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function toggleFS() {
  const t = document.documentElement;
  const req = t.requestFullscreen || t.webkitRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  try {
    if (!isFS()) { if (req) { const p = req.call(t); if (p && p.catch) p.catch(() => {}); } }
    else if (exit) exit.call(document);
  } catch (e) {}
}

/* ---------------- Init ---------------- */
function init() {
  bindNet();

  $('#join-go').addEventListener('click', tryJoin);
  $('#join-room').addEventListener('keydown', e => { if (e.key === 'Enter') tryJoin(); });
  $('#join-room').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });

  $('#d-fs').addEventListener('click', toggleFS);
  $('#d-bigfs').addEventListener('click', toggleFS);
  document.addEventListener('keydown', e => { if (e.key === 'f' || e.key === 'F') toggleFS(); });

  $('#d-sound').addEventListener('click', () => {
    soundOn = !soundOn;
    if (soundOn) { getCtx(); const c = getCtx(); if (c) tone(880, c.currentTime + 0.01, 120, 0.22, 'triangle'); }
    $('#d-sound').textContent = soundOn ? '🔊' : '🔇';
    $('#d-sound').title = soundOn ? 'Suara aktif' : 'Aktifkan suara';
  });

  window.addEventListener('resize', () => { layoutBoard(); });
  window.addEventListener('orientationchange', () => setTimeout(layoutBoard, 250));

  timerLoop();

  const room = currentRoomFromURL();
  if (!Net.available()) {
    showJoin();
    $('#join-err').textContent = 'Buka halaman ini lewat server (http://IP-laptop:port/display).';
    renderStatus('local');
    return;
  }
  if (room) {
    startAsDisplay(room);
  } else {
    showJoin();
    renderStatus('off');
  }
}

document.addEventListener('DOMContentLoaded', init);
