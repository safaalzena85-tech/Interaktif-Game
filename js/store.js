/* ============================================================
   store.js — State permainan, aturan skor, riwayat, persistensi
   ============================================================ */

const STORAGE_KEY = 'quizshowpro_v1';

function newParticipant(name) {
  return {
    id: uid('p'),
    name: name,
    score: 0,
    correct: 0,
    wrong: 0,
    thrown: 0,          // jumlah soal yang dilempar ke peserta lain
    received: 0,        // jumlah soal yang diterima dari lemparan
    receivedCorrect: 0, // jawaban benar dari lemparan yang diterima
    penalties: 0        // total poin yang hilang karena penalti
  };
}

const Store = {
  state: null,

  /* ---------------- Inisialisasi / Persistensi ---------------- */

  defaults() {
    return {
      bank: getDefaultBank(),
      bankLabel: 'Bank Soal Bawaan',
      boxes: [],
      boxOrder: [],
      participants: [],
      activeId: null,
      current: null,
      settings: {
        timerEnabled: true,
        duration: 30,
        sound: true,
        judgeSound: true,
        tickSound: true,
        toolsMin: false,
        miniMin: false
      },
      history: [],   // riwayat permainan
      throwLog: [],  // riwayat lemparan
      bonusLog: [],  // riwayat bonus waktu
      timerLog: []   // riwayat timer per soal
    };
  },

  load() {
    let saved = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (e) { saved = null; }

    const base = this.defaults();
    this.state = Object.assign(base, saved || {});
    this.state.settings = Object.assign(base.settings, (saved && saved.settings) || {});

    if (!this.state.bank || !this.state.bank.length) {
      this.state.bank = getDefaultBank();
      this.state.bankLabel = 'Bank Soal Bawaan';
    }
    if (!this.state.boxes || this.state.boxes.length !== (this.state.bank || []).length) {
      this.resetBoard();
    }
    if (!this.state.participants) this.state.participants = [];
    if (!this.state.history) this.state.history = [];
    if (!this.state.throwLog) this.state.throwLog = [];
    if (!this.state.bonusLog) this.state.bonusLog = [];
    if (!this.state.timerLog) this.state.timerLog = [];
    // Timer tidak dipulihkan dalam keadaan berjalan
    this.state.current = null;
    return this.state;
  },

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) { /* storage penuh / private mode */ }
  },

  /* ---------------- Peserta ---------------- */

  addParticipant(name) {
    name = String(name || '').trim();
    if (!name) return { ok: false, error: 'Nama peserta tidak boleh kosong.' };
    if (this.nameExists(name)) return { ok: false, error: 'Nama peserta sudah dipakai.' };
    const p = newParticipant(name);
    this.state.participants.push(p);
    if (!this.state.activeId) this.state.activeId = p.id;
    this.save();
    return { ok: true, participant: p };
  },

  nameExists(name, exceptId) {
    const lc = String(name).trim().toLowerCase();
    return this.state.participants.some(p => p.id !== exceptId && p.name.toLowerCase() === lc);
  },

  renameParticipant(id, newName) {
    newName = String(newName || '').trim();
    const p = this.participant(id);
    if (!p) return { ok: false, error: 'Peserta tidak ditemukan.' };
    if (!newName) return { ok: false, error: 'Nama tidak boleh kosong.' };
    if (newName.length > 24) return { ok: false, error: 'Nama maksimal 24 karakter.' };
    if (this.nameExists(newName, id)) return { ok: false, error: 'Nama sudah dipakai peserta lain.' };

    const oldName = p.name;
    p.name = newName;
    // Perbarui nama pada riwayat, lemparan, dan kotak yang sudah selesai
    this.state.history.forEach(h => {
      if (h.answererId === id) h.answererName = newName;
      if (h.throwerId === id) h.throwerName = newName;
    });
    this.state.throwLog.forEach(t => {
      if (t.fromId === id) t.fromName = newName;
      if (t.toId === id) t.toName = newName;
    });
    this.state.boxes.forEach(b => { if (b.answererId === id) b.answererName = newName; });
    this.save();
    return { ok: true, oldName, newName };
  },

  removeParticipant(id) {
    this.state.participants = this.state.participants.filter(p => p.id !== id);
    if (this.state.activeId === id) this.state.activeId = null;
    if (this.state.current && this.state.current.answererId === id) {
      this.state.current = null;
    }
    this.save();
  },

  resetParticipantScore(id) {
    const p = this.participant(id);
    if (!p) return;
    Object.assign(p, {
      score: 0, correct: 0, wrong: 0, thrown: 0, received: 0, receivedCorrect: 0, penalties: 0
    });
    this.save();
  },

  /** Reset skor seluruh peserta. */
  resetAllScores() {
    this.state.participants.forEach(p => {
      Object.assign(p, {
        score: 0, correct: 0, wrong: 0, thrown: 0, received: 0, receivedCorrect: 0, penalties: 0
      });
    });
    this.save();
  },

  participant(id) {
    return this.state.participants.find(p => p.id === id) || null;
  },

  setActive(id) {
    this.state.activeId = id;
    this.save();
  },

  /** Ranking otomatis: poin desc, lalu jumlah benar desc, lalu nama. */
  ranking() {
    return this.state.participants
      .slice()
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.correct !== a.correct) return b.correct - a.correct;
        return a.name.localeCompare(b.name, 'id');
      })
      .map((p, i) => ({ participant: p, rank: i + 1 }));
  },

  successRate(p) {
    const answered = p.correct + p.wrong;
    return answered === 0 ? 0 : Math.round((p.correct / answered) * 100);
  },

  /* ---------------- Bank soal & kotak ---------------- */

  setBank(questions, label) {
    this.state.bank = questions.slice();
    this.state.bankLabel = label || 'Bank Soal';
    this.save();
  },

  addQuestionToBank(cat, question, answer) {
    const q = String(question || '').trim();
    const a = String(answer || '').trim();
    if (!q) return { ok: false, error: 'Pertanyaan tidak boleh kosong.' };
    if (!a) return { ok: false, error: 'Jawaban tidak boleh kosong.' };
    if (!CATS[cat]) return { ok: false, error: 'Kategori tidak valid.' };
    this.state.bank.push({ category: cat, question: q, answer: a });
    this.state.current = null;
    this.state.boxes = buildBoxes(this.state.bank);
    this.state.boxOrder = this.state.boxes.map(b => b.n);
    this.save();
    return { ok: true };
  },

  removeQuestionFromBank(index) {
    const i = Number(index);
    if (i < 0 || i >= (this.state.bank || []).length) return { ok: false, error: 'Soal tidak ditemukan.' };
    this.state.bank.splice(i, 1);
    this.state.current = null;
    this.state.boxes = buildBoxes(this.state.bank);
    this.state.boxOrder = this.state.boxes.map(b => b.n);
    this.save();
    return { ok: true };
  },

  resetBoard() {
    this.state.boxes = buildBoxes(this.state.bank);
    this.state.boxOrder = this.state.boxes.map(b => b.n);
    this.state.current = null;
    this.save();
  },

  shuffleBoxOrder() {
    this.state.boxOrder = shuffleArray(this.state.boxOrder);
    this.save();
  },

  boxesLeft() {
    return this.state.boxes.filter(b => b.status !== 'done').length;
  },

  currentBox() {
    const c = this.state.current;
    if (!c) return null;
    return this.boxByNumber(c.boxN);
  },

  boxByNumber(n) {
    return this.state.boxes.find(b => b.n === n) || null;
  },

  /* ---------------- Alur permainan ---------------- */

  /** Buka kotak: validasi & set soal aktif (fase: memilih mekanisme). */
  openBox(n) {
    if (!this.state.bank || validateBank(this.state.bank).ok !== true) {
      return { ok: false, error: 'Bank soal belum valid.' };
    }
    const box = this.boxByNumber(n);
    if (!box) return { ok: false, error: 'Kotak tidak ditemukan.' };
    if (box.status === 'done') return { ok: false, error: 'Kotak sudah dimainkan.' };
    if (this.state.current) return { ok: false, error: 'Masih ada soal yang sedang berjalan.' };
    if (!this.state.activeId) return { ok: false, error: 'Pilih peserta aktif terlebih dahulu.' };
    const player = this.participant(this.state.activeId);
    if (!player) return { ok: false, error: 'Peserta aktif tidak valid.' };

    this.state.current = {
      boxN: n,
      category: box.category,
      mode: null,          // self | throw
      throwerId: player.id,
      throwerName: player.name,
      answererId: null,
      answererName: null,
      phase: 'choose',     // choose | target | question
      questionShown: true,
      answerShown: false,
      startedAt: null,
      timeup: false
    };
    this.save();
    return { ok: true, current: this.state.current, box };
  },

  cancelSelection() {
    this.state.current = null;
    this.save();
  },

  chooseSelf() {
    const c = this.state.current;
    if (!c) return { ok: false };
    c.mode = 'self';
    c.answererId = c.throwerId;
    c.answererName = c.throwerName;
    c.phase = 'question';
    this.save();
    return { ok: true, current: c };
  },

  /** Lempar ke peserta lain. Timer baru dimulai setelah ini. */
  throwTo(targetId) {
    const c = this.state.current;
    if (!c) return { ok: false, error: 'Tidak ada soal aktif.' };
    const target = this.participant(targetId);
    if (!target) return { ok: false, error: 'Peserta tujuan tidak valid.' };
    if (target.id === c.throwerId) return { ok: false, error: 'Tidak bisa melempar ke diri sendiri.' };
    c.mode = 'throw';
    c.answererId = target.id;
    c.answererName = target.name;
    c.phase = 'question';
    this.save();
    return { ok: true, current: c, target };
  },

  /**
   * Moderator menentukan hasil jawaban.
   * @param {boolean} correct
   * @param {object} extra { timeup, timeUsedMs, bonusSec }
   */
  judge(correct, extra = {}) {
    const c = this.state.current;
    if (!c || c.phase !== 'question') return { ok: false };
    const box = this.boxByNumber(c.boxN);
    const cat = CATS[c.category];
    const points = cat.points;
    const answerer = this.participant(c.answererId);
    const thrower = c.mode === 'throw' ? this.participant(c.throwerId) : null;

    let earned = 0;
    let penalty = 0;
    const notes = [];

    if (!answerer) {
      // Peserta penjawab sudah dihapus; tutup soal tanpa mengubah skor.
      box.status = 'done';
      box.result = correct ? 'correct' : 'wrong';
      this.state.current = null;
      this.save();
      return { ok: true, entry: null };
    }

    if (c.mode === 'self') {
      if (correct) {
        answerer.score += points;
        answerer.correct += 1;
        earned = points;
        notes.push('Jawab sendiri — benar');
      } else {
        answerer.wrong += 1;
        notes.push('Jawab sendiri — salah (tanpa pengurangan poin)');
      }
    } else {
      if (thrower) thrower.thrown += 1;
      answerer.received += 1;
      if (correct) {
        answerer.score += points;
        answerer.correct += 1;
        answerer.receivedCorrect += 1;
        earned = points;
        if (thrower) {
          penalty = Math.min(THROW_PENALTY, thrower.score);
          thrower.score -= penalty;
          thrower.penalties += penalty;
        }
        notes.push(`Lemparan ke ${answerer.name} — BENAR (+${points} untuk penerima${thrower ? ', pelempar −' + penalty : ''})`);
      } else {
        answerer.wrong += 1;
        notes.push(`Lemparan ke ${answerer.name} — SALAH (penerima tanpa poin, pelempar aman)`);
      }
    }

    const now = new Date();
    const entry = {
      id: uid('h'),
      time: now.toISOString(),
      boxN: c.boxN,
      category: c.category,
      categoryLabel: cat.label,
      points: points,
      earned: earned,
      penalty: penalty,
      result: correct ? 'correct' : 'wrong',
      mode: c.mode,
      answererId: answerer.id,
      answererName: answerer.name,
      throwerId: thrower ? thrower.id : null,
      throwerName: thrower ? thrower.name : null,
      timeUsedMs: extra.timeUsedMs != null ? extra.timeUsedMs : null,
      timeup: !!extra.timeup,
      bonusSec: extra.bonusSec || 0,
      note: notes.join(' · ')
    };
    this.state.history.unshift(entry);

    // Riwayat timer
    this.state.timerLog.unshift({
      id: uid('t'),
      time: now.toISOString(),
      boxN: c.boxN,
      categoryLabel: cat.label,
      startedAt: c.startedAt || null,
      endedAt: now.toISOString(),
      usedMs: extra.timeUsedMs != null ? extra.timeUsedMs : null,
      bonusSec: extra.bonusSec || 0,
      timeup: !!extra.timeup,
      thrown: c.mode === 'throw',
      receiverName: c.mode === 'throw' ? answerer.name : null
    });

    // Riwayat lemparan
    if (c.mode === 'throw') {
      this.state.throwLog.unshift({
        id: uid('x'),
        time: now.toISOString(),
        boxN: c.boxN,
        category: c.category,
        categoryLabel: cat.label,
        fromId: thrower ? thrower.id : null,
        fromName: thrower ? thrower.name : c.throwerName,
        toId: answerer.id,
        toName: answerer.name,
        result: correct ? 'correct' : 'wrong',
        earned: earned,
        penalty: penalty
      });
    }

    // Tandai kotak selesai
    box.status = 'done';
    box.result = correct ? 'correct' : 'wrong';
    box.answererId = answerer.id;
    box.answererName = answerer.name;
    box.mode = c.mode;

    this.state.current = null;
    this.save();
    return { ok: true, entry };
  },

  logBonus(sec, boxN) {
    this.state.bonusLog.unshift({
      id: uid('b'),
      time: new Date().toISOString(),
      boxN: boxN,
      sec: sec
    });
    this.save();
  },

  /* ---------------- Reset & pemeliharaan ---------------- */

  /** Reset permainan: kotak, skor peserta, riwayat. Peserta & bank tetap. */
  resetGame() {
    this.resetBoard();
    this.resetAllScores();
    this.state.history = [];
    this.state.throwLog = [];
    this.state.bonusLog = [];
    this.state.timerLog = [];
    this.state.current = null;
    this.state.activeId = this.state.participants.length ? this.state.participants[0].id : null;
    this.save();
  },

  clearHistory() {
    this.state.history = [];
    this.state.throwLog = [];
    this.state.bonusLog = [];
    this.state.timerLog = [];
    this.save();
  },

  /** Ganti bank soal: peserta tetap, tetapi papan & skor & riwayat direset. */
  applyNewBank(questions, label) {
    this.setBank(questions, label);
    this.resetBoard();
    this.resetAllScores();
    this.state.history = [];
    this.state.throwLog = [];
    this.state.bonusLog = [];
    this.state.timerLog = [];
    this.state.current = null;
    this.state.activeId = null;
    this.save();
  },

  clearBank() {
    this.state.bank = [];
    this.state.bankLabel = 'Kosong';
    this.state.boxes = [];
    this.state.boxOrder = [];
    this.state.current = null;
    this.state.history = [];
    this.state.throwLog = [];
    this.state.bonusLog = [];
    this.state.timerLog = [];
    this.resetAllScores();
    this.save();
  }
};
