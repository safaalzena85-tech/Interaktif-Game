/* ============================================================
   app.js — Orkestrasi alur permainan, event & kontrol moderator
   ============================================================ */

/* ---------------- Timer engine ---------------- */
let _lastWholeSec = null;

const timer = new TimerEngine({
  onTick(remainingMs, totalMs, running) {
    UI.renderTimer(remainingMs, totalMs, running);
    handleBeep(remainingMs, running);
  },
  onDone() {
    UI.renderTimer(0, timer.totalMs, false);
    onTimeUp();
  }
});

/* ---------------- Suara ---------------- */
let _audioCtx = null;

function getAudioCtx() {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) { _audioCtx = null; }
  if (_audioCtx && _audioCtx.state === 'suspended') {
    try { _audioCtx.resume(); } catch (e) { /* abaikan */ }
  }
  return _audioCtx;
}

function scheduleTone(ctx, freq, startAt, durMs, gain, type) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, startAt);
  osc.connect(g);
  g.connect(ctx.destination);
  const dur = (durMs || 90) / 1000;
  g.gain.setValueAtTime(0.0001, startAt);
  g.gain.exponentialRampToValueAtTime(gain || 0.2, startAt + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.03);
}

function beep(freq, durMs, gain) {
  if (!Store.state.settings.sound) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  scheduleTone(ctx, freq, ctx.currentTime + 0.005, durMs || 90, gain || 0.22, 'sine');
}

/** Efek suara khas saat jawaban dinilai BENAR / SALAH. */
function playJudgeSound(correct) {
  const st = Store.state.settings;
  if (!st.sound || st.judgeSound === false) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.01;
  if (correct) {
    // Arpeggio naik yang ceria
    [[523.25, 0], [659.25, 0.12], [783.99, 0.24], [1046.50, 0.36]].forEach((n, i) => {
      scheduleTone(ctx, n[0], t0 + n[1], i === 3 ? 0.34 : 0.14, 0.22, 'triangle');
    });
  } else {
    // Buzz turun
    [[311.13, 0, 0.18], [233.08, 0.16, 0.20], [155.56, 0.34, 0.38]].forEach(n => {
      scheduleTone(ctx, n[0], t0 + n[1], n[2], 0.2, 'sawtooth');
    });
  }
}

/* Suara "detik" (tick-tock) yang menegangkan di detik-detik akhir. */
let _tickHigh = false;
function tickBeep(sec) {
  const st = Store.state.settings;
  if (!st.sound || st.tickSound === false) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  _tickHigh = !_tickHigh;
  const urgent = sec <= 3;                 // 3 detik terakhir → lebih tinggi & tegas
  const freq = urgent ? 1500 : (_tickHigh ? 1180 : 900);
  const gain = urgent ? 0.34 : 0.26;
  const t0 = ctx.currentTime + 0.003;
  // "tik" pendek bergaya jam
  scheduleTone(ctx, freq, t0, 42, gain, 'square');
  scheduleTone(ctx, freq / 2, t0, 26, gain * 0.5, 'sine');
}

function handleBeep(remainingMs, running) {
  if (!running) { _lastWholeSec = null; return; }
  const sec = Math.ceil(remainingMs / 1000);
  if (sec === _lastWholeSec) return;
  _lastWholeSec = sec;
  if (sec <= 10 && sec > 0) tickBeep(sec);
}

/* ============================================================
   MULTI-PERANGKAT — membangun snapshot & mengirim ke layar tampilan
   ============================================================ */
let lastPopup = null;       // { correct, entry, at }
let introActive = false;    // sedang memutar efek loading bar?
let introPct = 0;
let introLabel = 'Bersiap memulai…';

/** Bangun "snapshot" ringkas dari keadaan permainan untuk layar tampilan. */
function buildSnapshot() {
  const s = Store.state;
  const boxes = {};
  (s.boxes || []).forEach(b => {
    boxes[b.n] = { n: b.n, status: b.status, category: b.category, result: b.result || null };
  });

  const ranking = Store.ranking().map(r => ({
    id: r.participant.id,
    name: r.participant.name,
    score: r.participant.score,
    correct: r.participant.correct,
    wrong: r.participant.wrong,
    rank: r.rank
  }));

  let current = null;
  if (s.current) {
    const c = s.current;
    const box = Store.boxByNumber(c.boxN);
    const cat = CATS[c.category];
    current = {
      boxN: c.boxN,
      category: c.category,
      points: cat ? cat.points : 0,
      phase: c.phase,
      mode: c.mode,
      throwerName: c.throwerName,
      answererName: c.answererName,
      questionShown: !!c.questionShown,
      answerShown: !!c.answerShown,
      question: box ? box.question : '',
      answer: box ? box.answer : ''
    };
  }

  let phase = 'idle';
  if (introActive) phase = 'intro';
  else if (s.current) phase = s.current.phase;

  const done = (s.boxes || []).filter(b => b.status === 'done').length;
  const total = (s.boxes || []).length;

  return {
    v: 1,
    ts: Date.now(),
    room: Net.room || null,
    phase: phase,
    intro: introActive ? { pct: Math.round(introPct), label: introLabel } : null,
    bankLabel: s.bankLabel,
    counts: { total: total, done: done, left: Math.max(0, total - done) },
    boxOrder: (s.boxOrder || []).slice(),
    boxes: boxes,
    ranking: ranking,
    activeId: s.activeId,
    current: current,
    timer: {
      totalMs: timer.totalMs,
      remainingMs: Math.round(timer.remainingMs),
      running: timer.running,
      enabled: !!s.settings.timerEnabled,
      tick: s.settings.tickSound !== false
    },
    popup: lastPopup
  };
}

/** Kirim keadaan terbaru ke layar tampilan (bila mode kontrol aktif). */
function pushState(immediate) {
  if (typeof Net === 'undefined' || !Net.enabled || Net.role !== 'controller') return;
  try { Net.push(buildSnapshot(), !!immediate); } catch (e) { /* abaikan */ }
}

/* Setiap render => sinkronkan. Dibungkus agar tidak perlu mengubah banyak tempat. */
(function hookRenderers() {
  if (typeof UI === 'undefined') return;
  const _renderAll = UI.renderAll.bind(UI);
  UI.renderAll = function () { _renderAll(); pushState(false); };
  const _renderMod = UI.renderModerator.bind(UI);
  UI.renderModerator = function () { _renderMod(); pushState(false); };
  const _renderTimer = UI.renderTimer.bind(UI);
  UI.renderTimer = function (a, b, c) { _renderTimer(a, b, c); pushState(false); };
})();

/* ---------------- Mode ringkas (semua ukuran layar) ----------------
   Bila panggung 16:9 (1920×1080) akan tampil terlalu kecil untuk
   dibaca — di ponsel/tablet/layar pendek — pindah ke tata letak
   1 kolom yang bisa digulir. */
function isCompact() { return document.documentElement.classList.contains('compact'); }

function applyCompactMode() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const scale = Math.min(w / STAGE_W, h / STAGE_H);
  const narrow = scale < 0.56 || w < 720 || h < 480;
  document.documentElement.classList.toggle('compact', narrow);
  document.body.classList.toggle('compact', narrow);
  fitStage();
}

/* ---------------- Efek loading bar "Mulai Quiz" ---------------- */
let _introTimer = null;
function startQuizIntro() {
  if (introActive) return;
  introActive = true;
  introPct = 0;
  introLabel = 'Mempersiapkan papan soal…';

  const ov = $('#intro-overlay');
  if (ov) ov.classList.remove('hidden');

  Store.state.current = null;
  Store.save();
  UI.renderAll();
  pushState(true);

  const t0 = performance.now();
  const DUR = 2600;

  const step = () => {
    const t = Math.min(1, (performance.now() - t0) / DUR);
    introPct = t * 100;
    if (t > 0.55) introLabel = 'Mengacak posisi…';
    if (t > 0.85) introLabel = 'Siap!';
    const fill = $('#intro-fill'); const pct = $('#intro-pct'); const sub = $('#intro-sub');
    if (fill) fill.style.width = Math.round(introPct) + '%';
    if (pct) pct.textContent = Math.round(introPct) + '%';
    if (sub) sub.textContent = introLabel;
    pushState(false);
    if (t >= 1) {
      clearInterval(_introTimer); _introTimer = null;
      introActive = false;
      if (ov) ov.classList.add('hidden');
      pushState(true);
      UI.toast('▶ Quiz dimulai! Pilih kotak soal.', 'success', 2600);
    }
  };
  step();
  _introTimer = setInterval(step, 80);
}

/* ---------------- Panel & status multi-perangkat ---------------- */
function setNetStatus(status) {
  const row = $('#net-status-row');
  const txt = $('#net-status-text');
  const dot = $('#net-dot');
  if (!row) return;
  row.classList.remove('online', 'connecting', 'error');
  const map = {
    off: ['', 'Nonaktif'],
    local: ['error', 'Butuh server (buka lewat http://…)'],
    connecting: ['connecting', 'Menyambung ke server…'],
    online: ['online', 'Terhubung — siap menerima layar tampilan'],
    error: ['error', 'Koneksi terputus — mencoba lagi…']
  };
  const [cls, text] = map[status] || map.off;
  if (cls) row.classList.add(cls);
  if (txt) txt.textContent = text;
  if (dot) dot.style.display = '';
}

function refreshNetUI() {
  const room = Net.room;
  if ($('#net-room')) $('#net-room').textContent = room || '—';
  if ($('#net-url')) $('#net-url').value = room ? Net.displayURL(room) : '';
  if ($('#net-start')) $('#net-start').disabled = !!Net.enabled;
  if ($('#net-stop')) $('#net-stop').disabled = !Net.enabled;
  const chip = $('#chip-net');
  if (chip) chip.classList.toggle('hidden', !Net.enabled);
}

function refreshPresence(p) {
  if ($('#net-displays')) $('#net-displays').textContent = (p && p.displays) || 0;
  if ($('#net-controllers')) $('#net-controllers').textContent = (p && p.controllers) || 0;
  const chipVal = $('#chip-net-val');
  if (chipVal) chipVal.textContent = (p && p.displays) || 0;
}

/** Buat (atau pakai ulang) ruang lalu sambung sebagai perangkat kontrol. */
async function enableNetAsController(opts) {
  opts = opts || {};
  if (!Net.available()) {
    UI.toast('Mode multi-perangkat butuh dibuka lewat server (node server.js).', 'error', 3600);
    return false;
  }
  try {
    let reuse = null;
    try { reuse = JSON.parse(localStorage.getItem('quizshowpro_room') || 'null'); } catch (e) { reuse = null; }

    let room = null, token = null;
    if (reuse && reuse.room && reuse.token) {
      try {
        const r = await fetch('/api/health?room=' + encodeURIComponent(reuse.room), { cache: 'no-store' });
        const j = await r.json();
        if (j.ok) { room = reuse.room; token = reuse.token; }
      } catch (e) { /* buat ruang baru */ }
    }
    if (!room) {
      const j = await Net.createRoom();
      room = j.room; token = j.token;
    } else {
      Net.room = room; Net.token = token; Net.enabled = true;
    }
    localStorage.setItem('quizshowpro_room', JSON.stringify({ room, token }));

    Net.onStatus = st => { setNetStatus(st); refreshNetUI(); };
    Net.onPresence = p => { refreshPresence(p); };
    Net.connect('controller');
    refreshNetUI();
    setNetStatus(Net.status);
    pushState(true);
    if (!opts.silent) UI.toast('📡 Layar tampilan aktif · Kode ruang <b>' + room + '</b>', 'success', 3600);
    return true;
  } catch (e) {
    UI.toast('Gagal mengaktifkan mode multi-perangkat.', 'error', 3200);
    return false;
  }
}

function disableNet() {
  Net.disconnect();
  localStorage.removeItem('quizshowpro_room');
  setNetStatus('off');
  refreshNetUI();
  refreshPresence({ controllers: 0, displays: 0 });
  UI.toast('⏹ Mode multi-perangkat diputuskan.', 'info');
}

function openNetModal() {
  refreshNetUI();
  setNetStatus(Net.enabled ? Net.status : 'off');
  UI.openModal('modal-net');
}

/* ---------------- Pilihan peran di awal (setup) ---------------- */
function showSetupOverlay() {
  const ov = $('#setup-overlay');
  if (!ov) return;
  ov.classList.remove('hidden');

  const available = Net.available();
  const note = $('#setup-note');
  const lastRole = localStorage.getItem('quizshowpro_role');

  ov.querySelectorAll('.setup-role').forEach(btn => {
    const role = btn.dataset.role;
    btn.classList.toggle('selected', lastRole === role);
    if (!available && role !== 'local') {
      btn.disabled = true;
    }
  });

  if (note) {
    note.classList.toggle('warn', !available);
    note.innerHTML = available
      ? 'Semua perangkat harus berada di <b>WiFi yang sama</b>. Perangkat kontrol membuat kode ruang untuk layar tampilan.'
      : '⚠️ Mode multi-perangkat hanya bisa dipakai bila halaman dibuka lewat server: jalankan <b>node server.js</b> lalu buka <b>http://IP-laptop:8080/</b>. Saat ini hanya mode <b>Lokal</b> yang tersedia.';
  }
}

function chooseRole(role) {
  localStorage.setItem('quizshowpro_role', role);
  const ov = $('#setup-overlay');

  if (role === 'display') {
    const room = new URLSearchParams(location.search).get('room') || (Net.room || '');
    const target = 'display.html' + (room ? '?room=' + encodeURIComponent(room) : '');
    location.href = target;
    return;
  }

  if (ov) ov.classList.add('hidden');

  if (role === 'controller') {
    enableNetAsController().then(ok => {
      if (!ok) setNetStatus(Net.available() ? 'off' : 'local');
    });
  } else {
    Net.disconnect();
    setNetStatus('off');
  }
}

/* ---------------- Panggung 16:9 & Fullscreen ---------------- */
const STAGE_W = 1920;
const STAGE_H = 1080;

/** Skalakan panggung 16:9 agar pas di dalam frame (letterbox). */
function fitStage() {
  const frame = document.getElementById('stage-frame');
  const stage = document.getElementById('stage');
  if (!frame || !stage) return;

  // Mode ringkas (HP): panggung memakai lebar penuh, tanpa transform skala.
  if (isCompact()) {
    stage.style.transform = 'none';
    document.documentElement.style.setProperty('--stage-scale', 1);
    if (typeof UI !== 'undefined' && UI.layoutBoard) UI.layoutBoard();
    return;
  }

  const availW = frame.clientWidth || window.innerWidth;
  const availH = frame.clientHeight || window.innerHeight;
  const scale = Math.min(availW / STAGE_W, availH / STAGE_H);

  stage.style.transform = 'scale(' + scale + ')';
  // Simpan rasio agar elemen fixed/absolute lain bisa menyesuaikan bila perlu
  document.documentElement.style.setProperty('--stage-scale', scale);
  // Ukuran papan dalam satuan panggung tetap, tapi tetap dihitung ulang agar aman.
  if (typeof UI !== 'undefined' && UI.layoutBoard) UI.layoutBoard();
}

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function updateFullscreenUI() {
  const on = isFullscreen();
  const label = on ? '🗗 Keluar Fullscreen' : '⛶ Fullscreen';
  const b1 = $('#btn-fullscreen');
  const b2 = $('#btn-fullscreen2');
  if (b1) b1.textContent = label;
  if (b2) b2.textContent = on ? '🗗 Keluar Fullscreen' : '⛶ Mode Fullscreen';
}

function toggleFullscreen() {
  const target = document.getElementById('stage-frame') || document.documentElement;
  const req = target.requestFullscreen || target.webkitRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  try {
    if (!isFullscreen()) {
      if (!req) { UI.toast('Fullscreen tidak didukung browser ini.', 'error', 2200); return; }
      const p = req.call(target);
      if (p && p.catch) p.catch(() => UI.toast('Fullscreen ditolak browser.', 'error', 2200));
    } else if (exit) {
      exit.call(document);
    }
  } catch (e) {
    UI.toast('Fullscreen tidak didukung browser ini.', 'error', 2200);
  }
}

/* ---------------- Utilitas ---------------- */
function openBoxFlow(n) {
  const s = Store.state;
  if (!s.bank || !s.bank.length) return UI.toast('Bank soal belum tersedia.', 'error');
  if (!validateBank(s.bank).ok) return UI.toast('Bank soal belum valid. Impor bank soal terlebih dahulu.', 'error');
  if (!s.activeId) return UI.toast('Pilih peserta aktif terlebih dahulu.', 'error');
  if (s.current) return UI.toast('Selesaikan soal yang sedang berjalan terlebih dahulu.', 'error');

  const res = Store.openBox(n);
  if (!res.ok) return UI.toast(res.error, 'error');

  UI.renderAll();
  showModeModal();
}

function showModeModal() {
  const c = Store.state.current;
  if (!c) return;
  // Mode Misteri: tingkat kesulitan TIDAK ditampilkan sebelum soal dibuka.
  $('#mode-context').innerHTML =
    `Soal <b>#${c.boxN}</b> dipilih oleh <b>${escapeHtml(c.throwerName)}</b> · ` +
    `<span class="secret-hint">tingkat kesulitan masih tersembunyi 🤫</span>`;

  const enough = Store.state.participants.length >= 2;
  $('#mode-throw').disabled = !enough;
  $('#mode-throw').classList.toggle('disabled', !enough);
  UI.openModal('modal-mode');
}

function showTargetModal() {
  const c = Store.state.current;
  if (!c) return;
  const list = $('#target-list');
  const candidates = Store.state.participants.filter(p => p.id !== c.throwerId);

  if (!candidates.length) {
    UI.toast('Tidak ada peserta lain untuk menerima lemparan.', 'error');
    return;
  }

  $('#target-context').innerHTML = `Soal <b>#${c.boxN}</b> dilempar oleh <b>${escapeHtml(c.throwerName)}</b>. Pilih penerima — timer akan mulai penuh setelah dipilih.`;
  list.innerHTML = '';
  candidates.forEach(p => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'target-item';
    b.dataset.id = p.id;
    b.innerHTML = `<span class="ti-name">${escapeHtml(p.name)}</span><span class="ti-pts">${p.score} poin</span><span class="ti-go">➜</span>`;
    list.appendChild(b);
  });
  UI.openModal('modal-target');
}

/** Mulai timer untuk soal yang sedang ditampilkan (penuh / reset). */
function startQuestionTimer() {
  const s = Store.state;
  const c = s.current;
  if (!c) return;
  _lastWholeSec = null;

  if (s.settings.timerEnabled) {
    c.startedAt = new Date().toISOString();
    timer.beginQuestion(s.settings.duration);
    beep(660, 120, 0.18);
  } else {
    c.startedAt = null;
    timer.reset(s.settings.duration);
  }
  UI.renderTimer(timer.remainingMs, timer.totalMs, timer.running);
}

function stopQuestionTimer() {
  if (timer.running) timer.pause();
  _lastWholeSec = null;
}

/* ---------------- Aksi jawaban ---------------- */
function judge(correct, fromTimeup) {
  const s = Store.state;
  const c = s.current;
  if (!c || c.phase !== 'question') {
    return UI.toast('Tidak ada soal aktif untuk dinilai.', 'error');
  }

  const timeup = !!c.timeupOccurred || !!fromTimeup;
  stopQuestionTimer();
  const usedMs = (s.settings.timerEnabled && c.startedAt) ? timer.usedMs : null;

  const res = Store.judge(correct, {
    timeUsedMs: usedMs,
    timeup: timeup,
    bonusSec: c.bonusSec || 0
  });

  if (!res.ok) return UI.toast('Gagal menyimpan hasil.', 'error');

  UI.closeModal('modal-timeup');
  UI.closeModal('modal-mode');
  UI.closeModal('modal-target');

  const e = res.entry;
  if (!e) {
    UI.toast('Soal ditutup (penjawab tidak lagi tersedia).', 'info');
  } else if (correct) {
    UI.toast(`✔ <b>BENAR</b> — ${escapeHtml(e.answererName)} +${e.earned} poin.${e.penalty ? ' Pelempar −' + e.penalty + ' poin.' : ''}`, 'success');
  } else {
    UI.toast(`✘ <b>SALAH</b> — ${escapeHtml(e.answererName)} tidak mendapat poin.`, 'error');
  }

  // Popup + efek suara khas
  lastPopup = { correct: !!correct, entry: e || null, at: Date.now() };
  UI.showJudgePopup(correct, e);
  playJudgeSound(correct);

  timer.reset(s.settings.duration);
  UI.renderAll();
  if ($('#modal-scoreboard').classList.contains('open')) UI.renderScoreboard();
  pushState(true);
}

function onTimeUp() {
  const c = Store.state.current;
  if (!c || c.phase !== 'question') return;
  c.timeupOccurred = true;
  Store.save();
  beep(180, 500, 0.25);

  $('#timeup-context').innerHTML =
    `Waktu soal <b>#${c.boxN}</b> untuk <b>${escapeHtml(c.answererName)}</b> telah habis. Tentukan tindakan:`;
  UI.openModal('modal-timeup');
}

function addBonusTime(sec, fromPopup) {
  const s = Store.state;
  const c = s.current;
  timer.addTime(sec);
  const boxN = c ? c.boxN : null;
  if (c) c.bonusSec = (c.bonusSec || 0) + sec;
  Store.logBonus(sec, boxN);
  Store.save();

  if (fromPopup) {
    UI.closeModal('modal-timeup');
    timer.resume();
  }
  _lastWholeSec = null;
  UI.toast(`⏱️ Waktu ditambahkan +${sec} detik.`, 'info', 1800);
  UI.renderTimer(timer.remainingMs, timer.totalMs, timer.running);
}

/* ---------------- Moderator: soal ---------------- */
function setQuestionShown(shown) {
  const c = Store.state.current;
  if (!c) return;
  c.questionShown = shown;
  Store.save();
  UI.renderModerator();
}
function toggleAnswer() {
  const c = Store.state.current;
  if (!c) return;
  c.answerShown = !c.answerShown;
  Store.save();
  UI.renderModerator();
}

/* ---------------- Reset & acak ---------------- */
async function doResetGame() {
  const ok = await confirmDialog('Reset permainan? Semua skor, kotak soal, dan riwayat akan dihapus. Daftar peserta & bank soal tetap disimpan.', 'Ya, Reset Permainan', true);
  if (!ok) return;
  Store.resetGame();
  timer.reset(Store.state.settings.duration);
  UI.closeAllModals();
  UI.renderAll();
  UI.toast('🔄 Permainan direset.', 'info');
}

/* ---------------- Minimize panel (Kontrol & Top 5) ---------------- */
function applyPanelState() {
  const st = Store.state.settings;

  const modPanel = document.querySelector('.moderator-panel');
  const toolsCard = $('#tools-card');
  const toolsBtn = $('#toggle-tools');
  if (modPanel) modPanel.classList.toggle('tools-min', !!st.toolsMin);
  if (toolsCard) toolsCard.classList.toggle('min', !!st.toolsMin);
  if (toolsBtn) {
    toolsBtn.textContent = st.toolsMin ? '◂' : '▸';
    toolsBtn.title = st.toolsMin ? 'Perbesar panel Kontrol' : 'Perkecil panel Kontrol';
  }

  const bottom = document.querySelector('.stage-bottom');
  const miniPanel = $('#mini-panel');
  const miniBtn = $('#toggle-mini');
  if (bottom) bottom.classList.toggle('mini-min', !!st.miniMin);
  if (miniPanel) miniPanel.classList.toggle('min', !!st.miniMin);
  if (miniBtn) {
    miniBtn.textContent = st.miniMin ? '◂' : '▸';
    miniBtn.title = st.miniMin ? 'Perbesar panel Top 5' : 'Perkecil panel Top 5';
  }
}

function togglePanel(which) {
  const st = Store.state.settings;
  if (which === 'tools') st.toolsMin = !st.toolsMin;
  else st.miniMin = !st.miniMin;
  Store.save();
  applyPanelState();
  // ukuran area papan bisa berubah setelah panel di-minimize → hitung ulang
  requestAnimationFrame(() => UI.layoutBoard());
}

/* ---------------- Editor bank soal ---------------- */
function applyBankChange() {
  UI.renderAll();
  UI.renderBankEditor();
}

function addQuestionFromEditor() {
  const cat = $('#be-cat').value;
  const q = $('#be-q').value.trim();
  const a = $('#be-a').value.trim();
  if (!q) return UI.toast('Pertanyaan tidak boleh kosong.', 'error');
  if (!a) return UI.toast('Jawaban tidak boleh kosong.', 'error');

  const apply = () => {
    const res = Store.addQuestionToBank(cat, q, a);
    if (!res.ok) return UI.toast(res.error, 'error');
    $('#be-q').value = '';
    $('#be-a').value = '';
    $('#be-q').focus();
    applyBankChange();
    UI.toast('➕ Soal ditambahkan ke bank.', 'success', 1600);
  };

  if (Store.state.current) {
    confirmDialog('Ada soal yang sedang aktif. Menambah soal akan menutup soal itu dan membangun ulang papan soal. Lanjutkan?', 'Ya, Tambah').then(ok => { if (ok) apply(); });
  } else {
    apply();
  }
}

function deleteQuestionFromEditor(index) {
  const item = (Store.state.bank || [])[Number(index)];
  if (!item) return;
  const doDel = () => {
    const res = Store.removeQuestionFromBank(index);
    if (!res.ok) return UI.toast(res.error, 'error');
    applyBankChange();
    UI.toast('🗑️ Soal dihapus dari bank.', 'info', 1600);
  };
  if (Store.state.current) {
    confirmDialog('Ada soal yang sedang aktif. Menghapus soal akan menutup soal itu dan membangun ulang papan soal. Lanjutkan?', 'Ya, Hapus', true).then(ok => { if (ok) doDel(); });
  } else {
    doDel();
  }
}

function doShuffle() {
  Store.shuffleBoxOrder();
  UI.renderBoard();
  const grid = $('#board-grid');
  grid.classList.remove('shake');
  void grid.offsetWidth;
  grid.classList.add('shake');
  UI.toast('🔀 Posisi kotak diacak.', 'info', 1600);
}

/* ---------------- Konfirmasi & prompt ---------------- */
let _confirmResolve = null;
function confirmDialog(msg, okLabel, danger) {
  $('#confirm-msg').innerHTML = msg;
  const ok = $('#confirm-ok');
  ok.textContent = okLabel || 'Ya, Lanjutkan';
  ok.className = 'btn ' + (danger ? 'wrong' : 'gold');
  UI.openModal('modal-confirm');
  return new Promise(res => { _confirmResolve = res; });
}
function resolveConfirm(val) {
  UI.closeModal('modal-confirm');
  if (_confirmResolve) { _confirmResolve(val); _confirmResolve = null; }
}

let _nameResolve = null;
let _nameEditId = null;
function promptName(id, currentName) {
  _nameEditId = id;
  $('#name-input').value = currentName || '';
  $('#name-error').classList.add('hidden');
  UI.openModal('modal-name');
  setTimeout(() => { $('#name-input').focus(); $('#name-input').select(); }, 50);
  return new Promise(res => { _nameResolve = res; });
}
function resolveName(val) {
  UI.closeModal('modal-name');
  _nameEditId = null;
  if (_nameResolve) { _nameResolve(val); _nameResolve = null; }
}

/* ---------------- Peserta ---------------- */
function handleParticipantAction(id, act) {
  const p = Store.participant(id);
  if (!p) return;

  if (act === 'edit') {
    promptName(p.id, p.name).then(async newName => {
      if (newName == null) return;
      newName = String(newName).trim();
      if (newName === p.name) return;
      if (!newName) return UI.toast('Nama tidak boleh kosong.', 'error');
      if (Store.nameExists(newName, id)) return UI.toast('Nama sudah dipakai peserta lain.', 'error');
      const ok = await confirmDialog(`Ubah nama peserta <b>${escapeHtml(p.name)}</b> menjadi <b>${escapeHtml(newName)}</b>? Skor &amp; statistik tidak berubah.`, 'Ya, Simpan Nama');
      if (!ok) return;
      const res = Store.renameParticipant(id, newName);
      if (!res.ok) return UI.toast(res.error, 'error');
      UI.renderAll();
      if ($('#modal-scoreboard').classList.contains('open')) UI.renderScoreboard();
      if ($('#modal-history').classList.contains('open')) UI.renderHistory();
      UI.toast(`✏️ Nama diperbarui: ${escapeHtml(res.oldName)} → ${escapeHtml(res.newName)}`, 'success');
    });
    return;
  }

  if (act === 'reset') {
    confirmDialog(`Reset skor & statistik <b>${escapeHtml(p.name)}</b> ke 0?`, 'Ya, Reset Skor', true).then(ok => {
      if (!ok) return;
      Store.resetParticipantScore(id);
      UI.renderAll();
      UI.toast(`↺ Skor ${escapeHtml(p.name)} direset.`, 'info');
    });
    return;
  }

  if (act === 'delete') {
    confirmDialog(`Hapus peserta <b>${escapeHtml(p.name)}</b>? Tindakan ini tidak dapat dibatalkan.`, 'Ya, Hapus', true).then(ok => {
      if (!ok) return;
      Store.removeParticipant(id);
      UI.renderAll();
      UI.toast(`🗑️ Peserta ${escapeHtml(p.name)} dihapus.`, 'info');
    });
  }
}

/* ---------------- Import bank soal ---------------- */
let pendingBank = null;
let pendingValid = null;

function parseAndPreview(text, label) {
  const result = parseBankText(text);
  const validation = validateBank(result.questions);
  UI.renderImportPreview(result, validation);
  pendingBank = result.questions;
  pendingValid = validation.ok;
  $('#import-apply').disabled = !validation.ok;
  if (validation.ok) UI.toast('✅ Bank soal valid.', 'success', 1800);
  else UI.toast('❌ Bank soal belum valid. Periksa pratinjau.', 'error', 3200);
}

function readFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    $('#import-text').value = ev.target.result;
    parseAndPreview(ev.target.result, file.name);
  };
  reader.readAsText(file, 'UTF-8');
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/* ---------------- Pengaturan ---------------- */
function applyDuration(sec) {
  Store.state.settings.duration = sec;
  Store.save();
  if (!timer.running && !(Store.state.current && Store.state.current.phase === 'question')) {
    timer.reset(sec);
  }
  UI.renderModerator();
  UI.renderTimer(timer.remainingMs, timer.totalMs, timer.running);
}

function syncSettingsUI() {
  const dur = Store.state.settings.duration;
  const radios = $$('#settings-duration input[name="dur"]');
  let matched = false;
  radios.forEach(r => {
    if (r.value === String(dur)) { r.checked = true; matched = true; }
  });
  if (!matched) {
    radios.forEach(r => { if (r.value === 'custom') r.checked = true; });
    $('#settings-custom').value = dur;
  }
  $('#settings-sound').checked = Store.state.settings.sound;
  $('#settings-judge-sound').checked = Store.state.settings.judgeSound !== false;
  $('#settings-tick-sound').checked = Store.state.settings.tickSound !== false;
  $('#settings-timer-enabled').checked = Store.state.settings.timerEnabled;
}

/* ---------------- Event wiring ---------------- */
function wireEvents() {

  /* Papan soal */
  $('#board-grid').addEventListener('click', e => {
    const box = e.target.closest('.box');
    if (!box || box.disabled) return;
    openBoxFlow(Number(box.dataset.n));
  });

  /* Peserta */
  $('#add-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#add-name');
    const res = Store.addParticipant(input.value);
    if (!res.ok) return UI.toast(res.error, 'error');
    input.value = '';
    UI.renderAll();
    UI.toast(`👤 Peserta <b>${escapeHtml(res.participant.name)}</b> ditambahkan.`, 'success');
  });

  $('#participant-list').addEventListener('click', e => {
    const card = e.target.closest('.p-card');
    if (!card) return;
    const id = card.dataset.id;
    const actionBtn = e.target.closest('[data-act]');
    if (actionBtn) {
      handleParticipantAction(id, actionBtn.dataset.act);
      return;
    }
    Store.setActive(id);
    UI.renderAll();
    const p = Store.participant(id);
    UI.toast(`🎯 Peserta aktif: <b>${escapeHtml(p.name)}</b>`, 'info', 1600);
  });

  /* Mode modal */
  $('#mode-self').addEventListener('click', () => {
    const res = Store.chooseSelf();
    if (!res.ok) return;
    UI.closeModal('modal-mode');
    UI.renderAll();
    startQuestionTimer();
    UI.renderModerator();
  });

  $('#mode-throw').addEventListener('click', () => {
    const c = Store.state.current;
    if (!c) return;
    if (Store.state.participants.length < 2) return UI.toast('Butuh minimal 2 peserta untuk melempar soal.', 'error');
    c.phase = 'target';
    Store.save();
    UI.closeModal('modal-mode');
    UI.renderModerator();
    showTargetModal();
  });

  $('#mode-cancel').addEventListener('click', () => {
    Store.cancelSelection();
    UI.closeModal('modal-mode');
    UI.renderAll();
    UI.toast('Kotak soal dikembalikan (tidak dimainkan).', 'info', 1600);
  });

  /* Target modal */
  $('#target-list').addEventListener('click', e => {
    const item = e.target.closest('.target-item');
    if (!item) return;
    const res = Store.throwTo(item.dataset.id);
    if (!res.ok) return UI.toast(res.error, 'error');
    UI.closeModal('modal-target');
    UI.renderAll();
    // Timer di-reset penuh lalu dimulai untuk penerima lemparan
    timer.reset(Store.state.settings.duration);
    startQuestionTimer();
    UI.renderModerator();
    UI.toast(`🔀 Soal dilempar ke <b>${escapeHtml(res.target.name)}</b> — timer mulai penuh.`, 'info');
  });

  $('#target-cancel').addEventListener('click', () => {
    Store.cancelSelection();
    UI.closeModal('modal-target');
    UI.renderAll();
    UI.toast('Lemparan dibatalkan — kotak soal dikembalikan.', 'info', 1600);
  });

  /* Timeup modal */
  $('#tu-wrong').addEventListener('click', () => judge(false, true));
  $('#tu-continue').addEventListener('click', () => {
    UI.closeModal('modal-timeup');
    UI.toast('▶ Lanjutkan menjawab — moderator dapat menilai secara manual.', 'info');
  });
  $$('#modal-timeup [data-tubonus]').forEach(b => {
    b.addEventListener('click', () => addBonusTime(Number(b.dataset.tubonus), true));
  });

  /* Judge */
  $('#btn-correct').addEventListener('click', () => judge(true));
  $('#btn-wrong').addEventListener('click', () => judge(false));

  /* Soal tampil/sembunyi */
  $('#btn-show-q').addEventListener('click', () => setQuestionShown(true));
  $('#btn-hide-q').addEventListener('click', () => setQuestionShown(false));
  $('#btn-show-a').addEventListener('click', toggleAnswer);

  /* Timer controls */
  $('#timer-enabled').addEventListener('change', e => {
    Store.state.settings.timerEnabled = e.target.checked;
    Store.save();
    $('#settings-timer-enabled').checked = e.target.checked;
    UI.renderModerator();
    UI.toast(e.target.checked ? '⏱️ Timer diaktifkan.' : '⏸️ Timer dinonaktifkan.', 'info', 1600);
  });

  $('#timer-duration').addEventListener('change', e => {
    const v = e.target.value;
    if (v === 'custom') {
      $('#timer-custom').classList.remove('hidden');
      $('#timer-custom').focus();
      return;
    }
    $('#timer-custom').classList.add('hidden');
    applyDuration(Number(v));
    syncSettingsUI();
  });

  $('#timer-custom').addEventListener('change', e => {
    const v = Math.max(5, Math.min(600, Number(e.target.value) || 30));
    e.target.value = v;
    applyDuration(v);
    syncSettingsUI();
  });

  $('#t-start').addEventListener('click', () => {
    if (!timer.running) {
      timer.resume();
      if (!timer.running) timer.start();
      UI.toast('▶ Timer dijalankan.', 'info', 1200);
    }
  });
  $('#t-pause').addEventListener('click', () => {
    if (timer.running) { timer.pause(); UI.toast('⏸ Timer dijeda.', 'info', 1200); }
  });
  $('#t-stop').addEventListener('click', () => {
    timer.stop();
    UI.toast('⏹ Timer dihentikan.', 'info', 1200);
  });
  $('#t-reset').addEventListener('click', () => {
    timer.reset(Store.state.settings.duration);
    _lastWholeSec = null;
    UI.toast('↺ Timer direset.', 'info', 1200);
  });
  $$('.bonus-btns [data-bonus]').forEach(b => {
    b.addEventListener('click', () => addBonusTime(Number(b.dataset.bonus), false));
  });

  /* Tools */
  $('#btn-shuffle').addEventListener('click', doShuffle);
  $('#btn-shuffle2').addEventListener('click', doShuffle);
  $('#btn-reset-game').addEventListener('click', doResetGame);
  $('#toggle-tools').addEventListener('click', () => togglePanel('tools'));
  $('#toggle-mini').addEventListener('click', () => togglePanel('mini'));

  /* Scoreboard */
  const openSB = () => { UI.renderScoreboard(); UI.openModal('modal-scoreboard'); };
  $('#btn-scoreboard-top').addEventListener('click', openSB);
  $('#fab-scoreboard').addEventListener('click', openSB);
  $('#sb-close').addEventListener('click', () => UI.closeModal('modal-scoreboard'));

  /* History */
  const openHist = () => { UI.renderHistory(); UI.openModal('modal-history'); };
  $('#btn-history').addEventListener('click', openHist);
  $('#btn-history2').addEventListener('click', openHist);
  $('#history-close').addEventListener('click', () => UI.closeModal('modal-history'));

  $('#history-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    $$('#history-tabs .tab').forEach(t => t.classList.toggle('active', t === tab));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab.dataset.tab));
  });

  $('#btn-clear-history').addEventListener('click', () => {
    confirmDialog('Bersihkan seluruh riwayat permainan, lemparan, bonus waktu, dan timer?', 'Ya, Bersihkan', true).then(ok => {
      if (!ok) return;
      Store.clearHistory();
      UI.renderHistory();
      UI.toast('🗑️ Riwayat dibersihkan.', 'info');
    });
  });

  /* Import */
  const openImport = () => {
    pendingBank = null; pendingValid = null;
    $('#import-apply').disabled = true;
    UI.renderBankEditor();
    UI.openModal('modal-import');
    const t = $('#import-text').value.trim();
    if (t) {
      const r = parseBankText(t);
      UI.renderImportPreview(r, validateBank(r.questions));
      pendingBank = r.questions;
      const v = validateBank(r.questions);
      pendingValid = v.ok;
      $('#import-apply').disabled = !v.ok;
    }
  };
  $('#btn-import').addEventListener('click', openImport);
  $('#btn-import2').addEventListener('click', openImport);
  $('#import-cancel').addEventListener('click', () => UI.closeModal('modal-import'));

  $('#file-input').addEventListener('change', e => readFile(e.target.files[0]));

  /* Editor bank soal (tambah / hapus soal) */
  $('#be-add-form').addEventListener('submit', e => {
    e.preventDefault();
    addQuestionFromEditor();
  });
  $('#be-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    deleteQuestionFromEditor(btn.dataset.del);
  });

  const drop = $('#file-drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
    e.preventDefault(); drop.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
    e.preventDefault(); drop.classList.remove('over');
  }));
  drop.addEventListener('drop', e => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
  });

  $('#btn-validate').addEventListener('click', () => {
    const text = $('#import-text').value;
    if (!text.trim()) return UI.toast('Tempel teks soal atau pilih file terlebih dahulu.', 'error');
    parseAndPreview(text, 'Tempel manual');
  });

  $('#btn-template').addEventListener('click', () => {
    download('template-soal.txt', buildTemplateText());
    UI.toast('⬇️ Template diunduh.', 'success', 1800);
  });

  $('#btn-clear-bank').addEventListener('click', () => {
    confirmDialog('Kosongkan bank soal? Papan soal akan terkunci sampai bank soal baru diimpor. Skor & riwayat akan direset.', 'Ya, Kosongkan', true).then(ok => {
      if (!ok) return;
      Store.clearBank();
      pendingBank = null; pendingValid = null;
      $('#import-apply').disabled = true;
      $('#import-text').value = '';
      UI.renderAll();
      UI.closeModal('modal-import');
      UI.toast('🗑️ Bank soal dikosongkan.', 'info');
    });
  });

  $('#import-apply').addEventListener('click', () => {
    if (!pendingBank || !pendingValid) return UI.toast('Bank soal belum valid.', 'error');
    const pv = validateBank(pendingBank);
    const detail = CAT_LIST.map(c => `${pv.counts[c.key]} ${c.label}`).join(' · ');
    confirmDialog(
      `Gunakan bank soal ini? Papan soal, <b>skor peserta</b>, dan riwayat akan direset. Daftar peserta tetap disimpan.<br><small>${pendingBank.length} soal · ${detail}</small>`,
      'Ya, Gunakan Bank Soal'
    ).then(ok => {
      if (!ok) return;
      Store.applyNewBank(pendingBank, 'Bank Soal Impor');
      timer.reset(Store.state.settings.duration);
      UI.renderAll();
      UI.closeModal('modal-import');
      UI.toast('✅ Bank soal baru diterapkan. Papan soal diacak otomatis.', 'success', 3200);
    });
  });

  /* Settings */
  const openSettings = () => { syncSettingsUI(); UI.openModal('modal-settings'); };
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-settings2').addEventListener('click', openSettings);
  $('#settings-close').addEventListener('click', () => UI.closeModal('modal-settings'));

  $('#settings-duration').addEventListener('change', e => {
    const v = e.target.value;
    if (v === 'custom') { $('#settings-custom').focus(); return; }
    applyDuration(Number(v));
    $('#timer-duration').value = ['15', '30', '45', '60'].indexOf(v) >= 0 ? v : 'custom';
    $('#timer-custom').classList.toggle('hidden', $('#timer-duration').value !== 'custom');
  });
  $('#settings-custom').addEventListener('change', e => {
    const v = Math.max(5, Math.min(600, Number(e.target.value) || 30));
    e.target.value = v;
    applyDuration(v);
  });
  $('#settings-sound').addEventListener('change', e => {
    Store.state.settings.sound = e.target.checked;
    Store.save();
    if (e.target.checked) beep(880, 100, 0.2);
  });
  $('#settings-judge-sound').addEventListener('change', e => {
    Store.state.settings.judgeSound = e.target.checked;
    Store.save();
    if (e.target.checked) playJudgeSound(true);
  });
  $('#settings-tick-sound').addEventListener('change', e => {
    Store.state.settings.tickSound = e.target.checked;
    Store.save();
    if (e.target.checked) tickBeep(5);
    UI.renderModerator();
  });
  $('#settings-timer-enabled').addEventListener('change', e => {
    Store.state.settings.timerEnabled = e.target.checked;
    Store.save();
    $('#timer-enabled').checked = e.target.checked;
    UI.renderModerator();
  });

  $('#btn-export-history').addEventListener('click', () => {
    const s = Store.state;
    const data = { exportedAt: new Date().toISOString(), history: s.history, throwLog: s.throwLog, bonusLog: s.bonusLog, timerLog: s.timerLog, participants: s.participants };
    download('riwayat-quizshow.json', JSON.stringify(data, null, 2));
    UI.toast('💾 Riwayat diekspor.', 'success', 1800);
  });

  /* Confirm & name dialogs */
  $('#confirm-ok').addEventListener('click', () => resolveConfirm(true));
  $('#confirm-cancel').addEventListener('click', () => resolveConfirm(false));
  $('#name-save').addEventListener('click', () => {
    const v = $('#name-input').value.trim();
    const err = $('#name-error');
    if (!v) { err.textContent = 'Nama tidak boleh kosong.'; err.classList.remove('hidden'); return; }
    if (v.length > 24) { err.textContent = 'Nama maksimal 24 karakter.'; err.classList.remove('hidden'); return; }
    if (Store.nameExists(v, _nameEditId)) { err.textContent = 'Nama sudah dipakai peserta lain.'; err.classList.remove('hidden'); return; }
    resolveName(v);
  });
  $('#name-cancel').addEventListener('click', () => resolveName(null));
  $('#name-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('#name-save').click(); });

  /* Backdrop close dengan pembersihan */
  $$('.modal-backdrop').forEach(b => {
    b.addEventListener('click', () => closeWithCleanup(b.dataset.close));
  });

  /* Keyboard shortcuts */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const open = $('.modal.open');
      if (open && open.id !== 'modal-timeup') closeWithCleanup(open.id);
      return;
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    // Fullscreen tersedia kapan saja
    if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen(); return; }
    if ($('.modal.open')) return;
    if (e.key === 'b' || e.key === 'B') { e.preventDefault(); judge(true); }
    if (e.key === 's' || e.key === 'S') { e.preventDefault(); judge(false); }
  });

  /* Fullscreen */
  $('#btn-fullscreen').addEventListener('click', toggleFullscreen);
  $('#btn-fullscreen2').addEventListener('click', toggleFullscreen);

  /* Skalakan panggung saat ukuran berubah / fullscreen / rotasi */
  window.addEventListener('resize', fitStage);
  window.addEventListener('orientationchange', fitStage);
  document.addEventListener('fullscreenchange', () => { updateFullscreenUI(); fitStage(); });
  document.addEventListener('webkitfullscreenchange', () => { updateFullscreenUI(); fitStage(); });
  if (window.ResizeObserver) {
    try { new ResizeObserver(fitStage).observe(document.getElementById('stage-frame')); } catch (e) {}
  }

  /* Simpan posisi timer saat halaman ditutup */
  window.addEventListener('beforeunload', () => Store.save());

  /* ============ Multi-perangkat (layar tampilan) ============ */
  $('#btn-net').addEventListener('click', openNetModal);
  $('#net-start').addEventListener('click', () => enableNetAsController());
  $('#net-stop').addEventListener('click', disableNet);
  $('#net-close').addEventListener('click', () => UI.closeModal('modal-net'));
  $('#net-copy').addEventListener('click', async () => {
    const url = $('#net-url').value;
    if (!url) return;
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (e) {
      try {
        const inp = $('#net-url');
        inp.focus(); inp.select();
        ok = document.execCommand('copy');
      } catch (e2) { ok = false; }
    }
    UI.toast(ok ? '📋 Tautan disalin.' : 'Gagal menyalin — salin manual: ' + url, ok ? 'success' : 'error', 2400);
  });

  /* ============ Intro loading bar ============ */
  $('#btn-quiz-intro').addEventListener('click', async () => {
    if (Store.state.current) {
      const ok = await confirmDialog('Mulai quiz sekarang? Soal yang sedang berjalan akan ditutup tanpa dinilai.', 'Ya, Mulai Quiz', true);
      if (!ok) return;
    }
    startQuizIntro();
  });

  /* ============ Setup peran perangkat ============ */
  $$('#setup-overlay .setup-role').forEach(btn => {
    btn.addEventListener('click', () => chooseRole(btn.dataset.role));
  });

  /* ============ Mode ringkas saat layar sempit ============ */
  applyCompactMode();
  window.addEventListener('resize', applyCompactMode);
  window.addEventListener('orientationchange', () => setTimeout(applyCompactMode, 120));
}

function closeWithCleanup(id) {
  if (!id) return;
  if (id === 'modal-mode' || id === 'modal-target') {
    const c = Store.state.current;
    if (c && (c.phase === 'choose' || c.phase === 'target')) {
      Store.cancelSelection();
      UI.renderAll();
    }
    UI.closeModal('modal-mode');
    UI.closeModal('modal-target');
    return;
  }
  if (id === 'modal-confirm') return resolveConfirm(false);
  if (id === 'modal-name') return resolveName(null);
  UI.closeModal(id);
}

/* ---------------- Boot ---------------- */
function init() {
  /* Tautan tampilan (?room= / ?role=display) → buka halaman layar peserta. */
  const _params = new URLSearchParams(location.search);
  const _urlRoom = _params.get('room') || _params.get('r');
  const _urlRole = _params.get('role');
  if (_urlRoom || _urlRole === 'display') {
    location.replace('display.html' + (_urlRoom ? '?room=' + encodeURIComponent(_urlRoom) : ''));
    return;
  }

  Store.load();

  // Jika jumlah kotak tidak cocok dengan bank tersimpan, bangun ulang (bank kosong tetap terkunci).
  if (!Store.state.boxes || Store.state.boxes.length !== ((Store.state.bank || []).length)) {
    if (Store.state.bank && Store.state.bank.length) Store.resetBoard();
  }

  wireEvents();
  UI.renderAll();
  syncSettingsUI();
  applyPanelState();

  // Panggung 16:9: pas-kan skala ke layar & sinkronkan tombol fullscreen.
  fitStage();
  updateFullscreenUI();
  window.addEventListener('load', () => { fitStage(); UI.layoutBoard(); });

  timer.setTotal(Store.state.settings.duration);
  timer.reset(Store.state.settings.duration);
  UI.renderTimer(timer.remainingMs, timer.totalMs, false);

  if (!Store.state.participants.length) {
    UI.toast('👋 Selamat datang! Tambahkan peserta untuk memulai permainan.', 'info', 4000);
  }

  /* Kesiapan mode multi-perangkat */
  setNetStatus(Net.available() ? 'off' : 'local');
  refreshNetUI();
  refreshPresence({ controllers: 0, displays: 0 });

  /* Pilih peran perangkat di awal */
  showSetupOverlay();
}

document.addEventListener('DOMContentLoaded', init);
