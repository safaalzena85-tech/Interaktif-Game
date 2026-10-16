/* ============================================================
   ui.js — Rendering, modal, toast, animasi peringkat (FLIP)
   ============================================================ */

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.prototype.slice.call(document.querySelectorAll(sel));

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

const UI = {

  /* ---------------- Toast ---------------- */
  toast(msg, type = 'info', ms = 2800) {
    const wrap = $('#toast-wrap');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = msg;
    wrap.appendChild(el);
    setTimeout(() => el.classList.add('show'), 10);
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, ms);
  },

  /* ---------------- Modal ---------------- */
  openModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('open');
  },
  closeModal(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('open');
  },
  closeAllModals() {
    $$('.modal').forEach(m => m.classList.remove('open'));
  },

  /* ---------------- Render semua ---------------- */
  renderAll() {
    this.renderBoard();
    this.renderChips();
    this.renderModerator();
    // FLIP: posisi lama masih di DOM saat ini, sehingga animasi peringkat terlihat.
    this.renderParticipants(true);
    this.renderMiniBoard(true);
    this.layoutBoard();
  },

  /* ---------------- Tata letak papan dinamis ----------------
     Menghitung jumlah kolom & ukuran kotak agar N kotak selalu
     muat rapi di dalam area papan (mendukung jumlah soal fleksibel). */
  layoutBoard() {
    const grid = $('#board-grid');
    if (!grid) return;
    const n = Store.state.boxes.length;
    if (!n || grid.classList.contains('hidden')) return;

    const W = grid.clientWidth;
    const H = grid.clientHeight;
    if (!W || !H) return;

    const gap = 12;
    let best = { cols: 1, cell: 0 };
    const maxCols = Math.min(n, 12);
    for (let cols = 1; cols <= maxCols; cols++) {
      const rows = Math.ceil(n / cols);
      const cw = (W - (cols - 1) * gap) / cols;
      const ch = (H - (rows - 1) * gap) / rows;
      const cell = Math.min(cw, ch);
      if (cell > best.cell) best = { cols: cols, cell: cell };
    }

    const cell = Math.max(34, Math.min(150, Math.floor(best.cell)));
    grid.style.setProperty('--cols', best.cols);
    grid.style.setProperty('--cell', cell + 'px');
  },

  /* ---------------- Top bar chips ---------------- */
  renderChips() {
    const s = Store.state;
    $('#chip-remaining').textContent = s.boxes.length ? Store.boxesLeft() : 0;
    $('#chip-done').textContent = s.boxes.filter(b => b.status === 'done').length;

    const v = s.bank && s.bank.length ? validateBank(s.bank) : { ok: false, counts: { mudah: 0, sulit: 0, vhard: 0 }, total: 0 };
    const chip = $('#chip-bank');
    if (!s.bank || !s.bank.length) {
      chip.textContent = 'kosong';
      chip.parentElement.classList.remove('gold');
    } else if (v.ok) {
      chip.textContent = `✓ ${v.total} soal`;
      chip.parentElement.classList.add('gold');
    } else {
      chip.textContent = `✕ ${v.total} soal`;
      chip.parentElement.classList.remove('gold');
    }

    const locked = !s.bank || !s.bank.length || !v.ok;
    $('#board-locked').classList.toggle('hidden', !locked);
    $('#board-grid').classList.toggle('hidden', locked);
  },

  /* ---------------- Papan soal ---------------- */
  renderBoard() {
    const grid = $('#board-grid');
    const s = Store.state;
    grid.innerHTML = '';

    s.boxOrder.forEach(n => {
      const box = Store.boxByNumber(n);
      if (!box) return;
      const cat = CATS[box.category];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'box';
      btn.dataset.n = n;
      btn.setAttribute('aria-label', 'Kotak soal ' + n);

      if (box.status === 'done') {
        btn.classList.add('done', cat.css, box.result === 'correct' ? 'r-correct' : 'r-wrong');
        btn.disabled = true;
        btn.innerHTML =
          `<span class="box-num">${n}</span>` +
          `<span class="box-check">${box.result === 'correct' ? '✔' : '✖'}</span>` +
          `<span class="box-pts">${cat.points} poin</span>`;
        btn.title = `${cat.label} · ${box.result === 'correct' ? 'Benar' : 'Salah'} · ${box.answererName || ''}`;
      } else {
        btn.innerHTML = `<span class="box-num">${n}</span><span class="box-secret">?</span>`;
        if (s.current && s.current.boxN === n) btn.classList.add('current');
      }
      grid.appendChild(btn);
    });

    this.layoutBoard();
  },

  /* ---------------- Peserta ---------------- */
  renderParticipants(flipFrom) {
    const list = $('#participant-list');
    const s = Store.state;
    const ranking = Store.ranking();
    const rankMap = {};
    ranking.forEach(r => { rankMap[r.participant.id] = r.rank; });

    $('#p-count').textContent = s.participants.length;

    if (flipFrom) this._flip(list, () => this._paintParticipants(list, rankMap));
    else this._paintParticipants(list, rankMap);
  },

  _paintParticipants(list, rankMap) {
    const s = Store.state;
    list.innerHTML = '';

    if (!s.participants.length) {
      list.innerHTML = `<p class="empty">Belum ada peserta.<br><small>Tambahkan minimal 2 peserta untuk mengaktifkan fitur lempar soal.</small></p>`;
      return;
    }

    s.participants.forEach(p => {
      const rank = rankMap[p.id];
      const active = s.activeId === p.id;
      const isAnswerer = s.current && s.current.answererId === p.id;
      const el = document.createElement('div');
      el.className = 'p-card' + (active ? ' active' : '') + (isAnswerer ? ' answering' : '');
      el.dataset.id = p.id;

      el.innerHTML =
        `<div class="p-rank ${rank <= 3 ? 'medal' : ''}">${rank <= 3 ? MEDALS[rank] : rank}</div>` +
        `<div class="p-info">
           <div class="p-name">
             <span class="p-name-text">${escapeHtml(p.name)}</span>
             ${active ? '<span class="tag-active">AKTIF</span>' : ''}
             ${isAnswerer && !active ? '<span class="tag-answer">PENJAWAB</span>' : ''}
           </div>
           <div class="p-sub">${p.score} poin · ${p.correct} benar · ${p.wrong} salah</div>
         </div>
         <div class="p-actions">
           <button class="icon-btn" data-act="edit" title="Edit nama">✎</button>
           <button class="icon-btn" data-act="reset" title="Reset skor">↺</button>
           <button class="icon-btn danger" data-act="delete" title="Hapus peserta">🗑</button>
         </div>`;
      list.appendChild(el);
    });
  },

  /* ---------------- Mini leaderboard ---------------- */
  renderMiniBoard(flipFrom) {
    const wrap = $('#mini-board');
    const ranking = Store.ranking().slice(0, 5);
    const s = Store.state;

    const paint = () => {
      wrap.innerHTML = '';
      if (!ranking.length) {
        wrap.innerHTML = `<p class="empty">Belum ada data skor.</p>`;
        return;
      }
      ranking.forEach(r => {
        const p = r.participant;
        const row = document.createElement('div');
        row.className = 'mini-row' + (s.activeId === p.id ? ' active' : '');
        row.dataset.id = p.id;
        row.innerHTML =
          `<span class="mini-rank ${r.rank <= 3 ? 'medal' : ''}">${r.rank <= 3 ? MEDALS[r.rank] : r.rank}</span>` +
          `<span class="mini-name">${escapeHtml(p.name)}</span>` +
          `<span class="mini-pts">${p.score}</span>`;
        wrap.appendChild(row);
      });
    };

    if (flipFrom) this._flip(wrap, paint); else paint();
  },

  /* ---------------- Panel moderator ---------------- */
  renderModerator() {
    const s = Store.state;
    const c = s.current;
    const info = $('#turn-info');
    const timerEnabled = s.settings.timerEnabled;

    // Info giliran
    if (!s.participants.length) {
      info.innerHTML = 'Tambahkan peserta terlebih dahulu.';
    } else if (!c) {
      const act = Store.participant(s.activeId);
      info.innerHTML = act
        ? `Peserta aktif: <b>${escapeHtml(act.name)}</b> — silakan pilih nomor kotak soal.`
        : 'Pilih peserta aktif, lalu klik salah satu kotak soal.';
    } else if (c.phase === 'choose') {
      info.innerHTML = `Soal <b>#${c.boxN}</b> dibuka oleh <b>${escapeHtml(c.throwerName)}</b> — menunggu pilihan mekanisme jawaban.`;
    } else if (c.phase === 'target') {
      info.innerHTML = `Soal <b>#${c.boxN}</b> — menunggu peserta tujuan lemparan.`;
    } else {
      const thrown = c.mode === 'throw'
        ? ` <span class="mini-note">(dilempar dari ${escapeHtml(c.throwerName)})</span>` : '';
      info.innerHTML = `Soal <b>#${c.boxN}</b> · penjawab: <b>${escapeHtml(c.answererName)}</b>${thrown} — timer ${timerEnabled ? 'berjalan' : 'nonaktif'}`;
    }

    // Kartu soal — tingkat kesulitan hanya tampil setelah soal benar-benar dibuka (Mode Misteri)
    const revealed = !!(c && c.phase === 'question');
    const cat = revealed ? CATS[c.category] : null;
    $('#q-cat').textContent = cat ? `Kategori: ${cat.label}` : 'Kategori: 🔒 tersembunyi';
    $('#q-cat').className = 'chip cat' + (cat ? ' ' + cat.css : '');
    $('#q-pts').textContent = cat ? `Nilai: ${cat.points} Poin` : 'Nilai: 🔒 tersembunyi';
    $('#q-pts').className = 'chip pts' + (cat ? ' ' + cat.css : '');
    $('#q-num').textContent = c ? `Soal #${c.boxN}` : 'Soal #–';

    const box = c ? Store.boxByNumber(c.boxN) : null;
    const qText = $('#q-text');
    const ansWrap = $('#answer-wrap');
    const cover = $('#q-cover');

    if (!c || c.phase !== 'question') {
      qText.textContent = c ? 'Soal akan ditampilkan setelah mekanisme jawaban dipilih.' : 'Belum ada soal yang dibuka.';
      ansWrap.classList.add('hidden');
      cover.classList.add('hidden');
      qText.classList.remove('hidden');
      qText.classList.add('placeholder');
    } else {
      qText.textContent = box.question;
      qText.classList.toggle('placeholder', false);
      qText.classList.toggle('hidden', !c.questionShown);
      cover.classList.toggle('hidden', c.questionShown);
      $('#q-answer').textContent = box.answer;
      ansWrap.classList.toggle('hidden', !c.answerShown);
    }

    // Status tombol
    const hasQ = !!(c && c.phase === 'question');
    $('#btn-show-q').disabled = !hasQ || c.questionShown;
    $('#btn-hide-q').disabled = !hasQ || !c.questionShown;
    $('#btn-show-a').disabled = !hasQ;
    $('#btn-show-a').textContent = (c && c.answerShown) ? '🙈 Sembunyikan Jawaban' : '💡 Tampilkan Jawaban';
    $('#btn-correct').disabled = !hasQ;
    $('#btn-wrong').disabled = !hasQ;

    // Kontrol timer
    $('#timer-enabled').checked = s.settings.timerEnabled;
    const sel = $('#timer-duration');
    const dur = s.settings.duration;
    if ([15, 30, 45, 60].indexOf(dur) >= 0) {
      sel.value = String(dur);
      $('#timer-custom').classList.add('hidden');
    } else {
      sel.value = 'custom';
      $('#timer-custom').classList.remove('hidden');
      $('#timer-custom').value = dur;
    }
  },

  /* ---------------- Timer ---------------- */
  renderTimer(remainingMs, totalMs, running) {
    const wrap = $('#timer-wrap');
    const num = $('#timer-num');
    const prog = $('#timer-progress');

    const secs = Math.ceil(remainingMs / 1000);
    num.textContent = secs;

    const r = 52;
    const circ = 2 * Math.PI * r;
    const ratio = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
    prog.style.strokeDasharray = circ;
    prog.style.strokeDashoffset = circ * (1 - ratio);

    const warn = remainingMs > 0 && remainingMs <= 10000;
    // Aturan warna: >50% hijau, 20–50% kuning, <20% merah.
    // Khusus 10 detik terakhir selalu merah + berkedip.
    let zone = timerZone(remainingMs, totalMs);
    if (warn) zone = 't-red';
    wrap.classList.remove('t-green', 't-yellow', 't-red');
    wrap.classList.add(zone);

    wrap.classList.toggle('blink', warn);
    wrap.classList.toggle('running', !!running);
    if (remainingMs <= 0) wrap.classList.remove('blink');
  },

  /* ---------------- Scoreboard ---------------- */
  renderScoreboard() {
    const tbody = $('#sb-body');
    const s = Store.state;
    const ranking = Store.ranking();

    const paint = () => {
      tbody.innerHTML = '';
      if (!ranking.length) {
        tbody.innerHTML = `<tr><td colspan="10" class="empty">Belum ada peserta.</td></tr>`;
        return;
      }
      ranking.forEach(r => {
        const p = r.participant;
        const rate = Store.successRate(p);
        const tr = document.createElement('tr');
        tr.dataset.id = p.id;
        tr.className = r.rank <= 3 ? 'top' + r.rank : '';
        if (s.activeId === p.id) tr.classList.add('active');
        tr.innerHTML =
          `<td class="sb-rank">${r.rank <= 3 ? MEDALS[r.rank] : r.rank}</td>` +
          `<td class="sb-name">${escapeHtml(p.name)}${s.activeId === p.id ? ' <span class="tag-active">AKTIF</span>' : ''}</td>` +
          `<td class="sb-pts">${p.score}</td>` +
          `<td>${p.correct}</td>` +
          `<td>${p.wrong}</td>` +
          `<td>${p.correct + p.wrong}</td>` +
          `<td>${p.receivedCorrect} / ${p.received}</td>` +
          `<td>${p.thrown}</td>` +
          `<td>${p.penalties > 0 ? '−' + p.penalties : '0'}</td>` +
          `<td class="sb-rate"><div class="rate-bar"><i style="width:${rate}%"></i></div><span>${rate}%</span></td>`;
        tbody.appendChild(tr);
      });
    };

    this._flip(tbody, paint, 'tr');
    $('#sb-note').textContent = 'Peserta: ' + s.participants.length + ' · Soal selesai: ' + s.boxes.filter(b => b.status === 'done').length;
  },

  /* ---------------- Riwayat ---------------- */
  renderHistory() {
    const s = Store.state;

    // Permainan
    const gh = $('#hist-game');
    if (!s.history.length) {
      gh.innerHTML = `<p class="empty">Belum ada riwayat permainan.</p>`;
    } else {
      gh.innerHTML = `<table class="hist-table"><thead><tr>
        <th>Waktu</th><th>Soal</th><th>Kategori</th><th>Nilai</th><th>Penjawab</th><th>Mekanisme</th>
        <th>Hasil</th><th>Poin</th><th>Waktu Pakai</th><th>Keterangan</th></tr></thead><tbody>` +
        s.history.map(h => `<tr>
          <td>${formatDateTime(h.time)}</td>
          <td>#${h.boxN}</td>
          <td><span class="chip cat ${CATS[h.category].css}">${h.categoryLabel}</span></td>
          <td>${h.points}</td>
          <td>${escapeHtml(h.answererName || '—')}</td>
          <td>${h.mode === 'throw' ? '🔀 Lempar' : '🙋 Sendiri'}</td>
          <td>${h.result === 'correct' ? '<span class="ok">✔ BENAR</span>' : '<span class="no">✘ SALAH</span>'}${h.timeup ? ' <span class="badge-timeup">waktu habis</span>' : ''}</td>
          <td>${h.earned > 0 ? '+' + h.earned : '0'}</td>
          <td>${h.timeUsedMs != null ? formatDuration(h.timeUsedMs) : '—'}</td>
          <td class="note">${escapeHtml(h.note || '')}</td>
        </tr>`).join('') + '</tbody></table>';
    }

    // Lemparan
    const th = $('#hist-throw');
    if (!s.throwLog.length) {
      th.innerHTML = `<p class="empty">Belum ada riwayat lemparan.</p>`;
    } else {
      th.innerHTML = `<table class="hist-table"><thead><tr>
        <th>Waktu</th><th>Soal</th><th>Kategori</th><th>Pelempar</th><th>Penerima</th><th>Hasil Penerima</th>
        <th>Poin Diterima</th><th>Penalti Pelempar</th></tr></thead><tbody>` +
        s.throwLog.map(t => `<tr>
          <td>${formatDateTime(t.time)}</td>
          <td>#${t.boxN}</td>
          <td><span class="chip cat ${CATS[t.category] ? CATS[t.category].css : ''}">${escapeHtml(t.categoryLabel)}</span></td>
          <td>${escapeHtml(t.fromName)}</td>
          <td>${escapeHtml(t.toName)}</td>
          <td>${t.result === 'correct' ? '<span class="ok">✔ BENAR</span>' : '<span class="no">✘ SALAH</span>'}</td>
          <td>${t.earned > 0 ? '+' + t.earned : '0'}</td>
          <td>${t.penalty > 0 ? '−' + t.penalty : '0'}</td>
        </tr>`).join('') + '</tbody></table>';
    }

    // Bonus waktu
    const bh = $('#hist-bonus');
    if (!s.bonusLog.length) {
      bh.innerHTML = `<p class="empty">Belum ada bonus waktu.</p>`;
    } else {
      bh.innerHTML = `<table class="hist-table"><thead><tr>
        <th>Waktu</th><th>Soal</th><th>Tambahan</th></tr></thead><tbody>` +
        s.bonusLog.map(b => `<tr>
          <td>${formatDateTime(b.time)}</td>
          <td>${b.boxN ? '#' + b.boxN : '—'}</td>
          <td>+${b.sec} detik</td>
        </tr>`).join('') + '</tbody></table>';
    }

    // Timer
    const tm = $('#hist-timer');
    if (!s.timerLog.length) {
      tm.innerHTML = `<p class="empty">Belum ada riwayat timer.</p>`;
    } else {
      tm.innerHTML = `<table class="hist-table"><thead><tr>
        <th>Soal</th><th>Kategori</th><th>Waktu Mulai</th><th>Waktu Selesai</th><th>Durasi Digunakan</th>
        <th>Bonus Waktu</th><th>Waktu Habis?</th><th>Dilempar?</th><th>Penerima Lemparan</th></tr></thead><tbody>` +
        s.timerLog.map(t => `<tr>
          <td>#${t.boxN}</td>
          <td>${escapeHtml(t.categoryLabel)}</td>
          <td>${t.startedAt ? formatClock(t.startedAt) : '—'}</td>
          <td>${t.endedAt ? formatClock(t.endedAt) : '—'}</td>
          <td>${t.usedMs != null ? formatDuration(t.usedMs) : '—'}</td>
          <td>${t.bonusSec ? '+' + t.bonusSec + 's' : '—'}</td>
          <td>${t.timeup ? '<span class="no">Ya</span>' : 'Tidak'}</td>
          <td>${t.thrown ? 'Ya' : 'Tidak'}</td>
          <td>${escapeHtml(t.receiverName || '—')}</td>
        </tr>`).join('') + '</tbody></table>';
    }
  },

  /* ---------------- FLIP animation ---------------- */
  _flip(container, paint, rowSel = '.p-card, .mini-row') {
    const prev = {};
    Array.prototype.slice.call(container.children).forEach(ch => {
      if (ch.dataset && ch.dataset.id) prev[ch.dataset.id] = ch.getBoundingClientRect().top;
    });

    paint();

    Array.prototype.slice.call(container.children).forEach(ch => {
      if (!ch.dataset || !ch.dataset.id) return;
      const oldTop = prev[ch.dataset.id];
      if (oldTop == null) return;
      const newTop = ch.getBoundingClientRect().top;
      const dy = oldTop - newTop;
      if (Math.abs(dy) < 2) return;
      ch.style.transition = 'none';
      ch.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        ch.style.transition = 'transform .5s cubic-bezier(.2,.8,.2,1)';
        ch.style.transform = 'translateY(0)';
      });
    });
  },

  /* ---------------- Popup BENAR / SALAH ---------------- */
  showJudgePopup(correct, entry) {
    const pop = $('#judge-popup');
    if (!pop) return;

    pop.classList.remove('correct', 'wrong');
    pop.classList.add(correct ? 'correct' : 'wrong');

    $('#jp-icon').textContent = correct ? '✔' : '✘';
    $('#jp-title').textContent = correct ? 'BENAR!' : 'SALAH';

    if (!entry) {
      $('#jp-sub').textContent = '—';
      $('#jp-pts').textContent = '';
    } else {
      let sub = escapeHtml(entry.answererName || '');
      if (entry.mode === 'throw' && entry.throwerName) {
        sub += ` <span class="muted">(dilempar dari ${escapeHtml(entry.throwerName)})</span>`;
      }
      $('#jp-sub').innerHTML = sub;

      let pts = correct ? `+${entry.earned} poin` : '0 poin';
      if (entry.penalty) pts += ` · Pelempar −${entry.penalty}`;
      $('#jp-pts').textContent = pts;
    }

    // Tampilkan (ulang) popup
    pop.classList.remove('show');
    void pop.offsetWidth;
    pop.classList.add('show');

    if (this._judgeTimer) clearTimeout(this._judgeTimer);
    this._judgeTimer = setTimeout(() => pop.classList.remove('show'), correct ? 1900 : 1700);
  },

  /* ---------------- Editor bank soal ---------------- */
  renderBankEditor() {
    const list = $('#be-list');
    const count = $('#be-count');
    if (!list) return;
    const bank = Store.state.bank || [];

    const counts = { mudah: 0, sulit: 0, vhard: 0 };
    bank.forEach(q => { if (counts[q.category] != null) counts[q.category] += 1; });
    if (count) {
      count.textContent = `${bank.length} soal · ` +
        CAT_LIST.map(c => `${counts[c.key]} ${c.label}`).join(' · ');
    }

    if (!bank.length) {
      list.innerHTML = '<p class="empty">Bank soal kosong. Tambahkan soal di atas atau impor file.</p>';
      return;
    }

    let html = '';
    CAT_LIST.forEach(cat => {
      const items = bank.map((q, i) => ({ q, i })).filter(o => o.q.category === cat.key);
      if (!items.length) return;
      html += `<div class="be-cat-group">`;
      html += `<div class="be-cat-head"><span><span class="pc-dot" style="background:${cat.color}"></span> ${cat.label} · ${cat.points} poin</span><span>${items.length} soal</span></div>`;
      items.forEach(o => {
        html += `<div class="be-item">
          <div class="be-text">
            <div class="be-q">${escapeHtml(o.q.question)}</div>
            <div class="be-a">Jawaban: ${escapeHtml(o.q.answer)}</div>
          </div>
          <div class="be-actions">
            <button class="be-del" data-del="${o.i}" title="Hapus soal" type="button">🗑</button>
          </div>
        </div>`;
      });
      html += `</div>`;
    });
    list.innerHTML = html;
  },

  /* ---------------- Import preview ---------------- */
  renderImportPreview(result, validation) {
    const wrap = $('#import-preview');
    const { questions, warnings, errors } = result;

    let html = '<div class="preview-status ' + (validation.ok ? 'ok' : 'bad') + '">';
    html += validation.ok
      ? `✅ Bank soal valid — ${validation.total} soal siap digunakan.`
      : '❌ Bank soal belum valid.';
    html += '</div>';

    html += '<div class="preview-counts">';
    CAT_LIST.forEach(cat => {
      const c = validation.counts[cat.key];
      html += `<div class="pc ${c > 0 ? 'ok' : 'bad'}">
        <span class="pc-dot" style="background:${cat.color}"></span>
        <b>${cat.label}</b><span>${c} soal</span></div>`;
    });
    html += `<div class="pc"><b>Total</b><span>${validation.total} soal</span></div>`;
    html += '</div>';

    if (errors.length) {
      html += '<div class="preview-list err"><b>Kesalahan:</b><ul>' +
        errors.slice(0, 12).map(e => `<li>${escapeHtml(e)}</li>`).join('') + '</ul></div>';
    }
    if (warnings.length) {
      html += '<div class="preview-list warn"><b>Peringatan:</b><ul>' +
        warnings.slice(0, 8).map(w => `<li>${escapeHtml(w)}</li>`).join('') + '</ul></div>';
    }

    if (questions.length) {
      html += '<div class="preview-questions">';
      CAT_LIST.forEach(cat => {
        const list = questions.filter(q => q.category === cat.key);
        html += `<div class="pq-group"><h4><span class="pc-dot" style="background:${cat.color}"></span> ${cat.label} (${list.length} soal · ${cat.points} poin)</h4>`;
        if (!list.length) html += '<p class="empty">— tidak ada soal —</p>';
        list.slice(0, 12).forEach((q, i) => {
          html += `<div class="pq-item"><div class="pq-q">${i + 1}. ${escapeHtml(q.question)}</div><div class="pq-a">Jawaban: ${escapeHtml(q.answer)}</div></div>`;
        });
        if (list.length > 12) html += `<p class="muted">…dan ${list.length - 12} soal lainnya</p>`;
        html += '</div>';
      });
      html += '</div>';
    }

    wrap.innerHTML = html;
  }
};
