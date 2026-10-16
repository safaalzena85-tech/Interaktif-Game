/* ============================================================
   parser.js — Parsing & validasi file bank soal (TXT)
   Format:
     [KATEGORI_MUDAH]
     Q: Pertanyaan
     A: Jawaban
   ============================================================ */

const HEADER_MAP = (() => {
  const map = {};
  CAT_LIST.forEach(cat => {
    cat.headers.forEach(h => { map[h] = cat.key; });
  });
  return map;
})();

function normalizeHeader(raw) {
  return String(raw).trim().toUpperCase().replace(/[\s\-]+/g, '_');
}

/**
 * Parse teks bank soal.
 * @returns {{questions: Array<{category,question,answer}>, warnings: string[], errors: string[]}}
 */
function parseBankText(text) {
  const lines = String(text || '').split(/\r?\n/);
  const questions = [];
  const warnings = [];
  const errors = [];

  let cat = null;
  let cur = null;
  let curLine = 0;

  function flush() {
    if (!cur) return;
    const q = (cur.question || '').trim();
    const a = (cur.answer || '').trim();
    if (!q) {
      errors.push(`Baris ${curLine}: soal tanpa teks pertanyaan (Q:) diabaikan.`);
    } else if (!a) {
      warnings.push(`Soal "${q.slice(0, 40)}${q.length > 40 ? '…' : ''}" tidak memiliki jawaban (A:).`);
      questions.push({ category: cat, question: q, answer: '(tanpa jawaban)' });
    } else {
      questions.push({ category: cat, question: q, answer: a });
    }
    cur = null;
  }

  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const line = raw.trim();
    if (!line) return;

    // Header kategori
    if (line.startsWith('[') && line.endsWith(']')) {
      flush();
      const key = normalizeHeader(line.slice(1, -1));
      if (HEADER_MAP[key]) {
        cat = HEADER_MAP[key];
      } else {
        errors.push(`Baris ${lineNo}: header "${line}" tidak dikenali. Gunakan [KATEGORI_MUDAH], [KATEGORI_SULIT], atau [KATEGORI_SANGAT_SULIT].`);
        cat = null;
      }
      return;
    }

    // Baris pertanyaan
    let m = line.match(/^(?:Q|SOAL|PERTANYAAN)\s*[:.\-]\s*(.*)$/i);
    if (m) {
      flush();
      if (!cat) {
        errors.push(`Baris ${lineNo}: soal ditemukan sebelum header kategori.`);
      }
      cur = { question: m[1].trim(), answer: '' };
      curLine = lineNo;
      return;
    }

    // Baris jawaban
    m = line.match(/^(?:A|ANS|JAWABAN)\s*[:.\-]\s*(.*)$/i);
    if (m) {
      if (cur) {
        cur.answer = cur.answer ? cur.answer + ' ' + m[1].trim() : m[1].trim();
      } else {
        errors.push(`Baris ${lineNo}: jawaban tanpa pertanyaan.`);
      }
      return;
    }

    // Baris lanjutan (teks multiline)
    if (cur) {
      if (cur.answer) cur.answer += ' ' + line;
      else cur.question += ' ' + line;
    } else {
      warnings.push(`Baris ${lineNo}: teks di luar blok soal diabaikan ("${line.slice(0, 30)}…").`);
    }
  });

  flush();
  return { questions, warnings, errors };
}

/**
 * Validasi jumlah soal: wajib 10 mudah, 10 sulit, 10 sangat sulit.
 */
function validateBank(questions) {
  const counts = { mudah: 0, sulit: 0, vhard: 0 };
  (questions || []).forEach(q => {
    if (counts[q.category] != null) counts[q.category] += 1;
  });

  const problems = [];
  const total = (questions || []).length;
  if (total < 1) problems.push('Bank soal kosong — minimal 1 soal.');

  return { ok: problems.length === 0, counts, total, problems };
}

/**
 * Bangun 30 kotak dari daftar soal, dengan penempatan acak (mode misteri).
 */
function buildBoxes(questions) {
  const shuffled = shuffleArray(questions);
  return shuffled.map((q, i) => ({
    n: i + 1,
    category: q.category,
    question: q.question,
    answer: q.answer,
    status: 'available', // available | done
    result: null,        // correct | wrong
    answererId: null,
    answererName: null,
    mode: null           // self | throw
  }));
}

/**
 * Template TXT untuk diunduh pengguna.
 */
function buildTemplateText() {
  const lines = [];
  CAT_LIST.forEach(cat => {
    const header = cat.key === 'mudah' ? 'KATEGORI_MUDAH'
      : cat.key === 'sulit' ? 'KATEGORI_SULIT' : 'KATEGORI_SANGAT_SULIT';
    lines.push(`[${header}]`, '');
    for (let i = 1; i <= 10; i++) {
      lines.push(`Q: Pertanyaan ${cat.label.toLowerCase()} ${i}`);
      lines.push(`A: Jawaban ${cat.label.toLowerCase()} ${i}`);
      lines.push('');
    }
  });
  return lines.join('\r\n');
}
