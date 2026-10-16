/* ============================================================
   data.js — Konfigurasi kategori & bank soal bawaan
   ============================================================ */

const CATS = {
  mudah: {
    key: 'mudah',
    label: 'Mudah',
    points: 10,
    css: 'easy',
    color: '#22c55e',
    headers: ['KATEGORI_MUDAH', 'MUDAH']
  },
  sulit: {
    key: 'sulit',
    label: 'Sulit',
    points: 20,
    css: 'hard',
    color: '#f59e0b',
    headers: ['KATEGORI_SULIT', 'SULIT']
  },
  vhard: {
    key: 'vhard',
    label: 'Sangat Sulit',
    points: 30,
    css: 'vhard',
    color: '#ef4444',
    headers: ['KATEGORI_SANGAT_SULIT', 'SANGAT_SULIT', 'SANGATSULIT', 'SANGAT_SULIT_30']
  }
};

const CAT_ORDER = ['mudah', 'sulit', 'vhard'];

const CAT_LIST = CAT_ORDER.map(k => CATS[k]);

const THROW_PENALTY = 5;

/* Bank soal bawaan (10 / 10 / 10) agar aplikasi bisa langsung dipakai. */
const DEFAULT_BANK = {
  mudah: [
    { q: 'Apa ibu kota negara Indonesia?', a: 'Jakarta' },
    { q: 'Berapa hasil dari 7 × 8?', a: '56' },
    { q: 'Hewan apa yang dikenal sebagai raja hutan?', a: 'Singa' },
    { q: 'Apa nama satelit alami Bumi?', a: 'Bulan' },
    { q: 'Apa saja warna bendera negara Indonesia?', a: 'Merah dan Putih' },
    { q: 'Organ apa yang memompa darah ke seluruh tubuh?', a: 'Jantung' },
    { q: 'Berapa jumlah hari dalam satu pekan?', a: '7 (tujuh) hari' },
    { q: 'Siapakah presiden pertama Republik Indonesia?', a: 'Ir. Soekarno' },
    { q: 'Berapa jumlah huruf dalam alfabet (aksara Latin)?', a: '26 huruf' },
    { q: 'Apa nama gunung tertinggi di Pulau Jawa?', a: 'Gunung Semeru' }
  ],
  sulit: [
    { q: 'Apa ibu kota Provinsi Jawa Barat?', a: 'Bandung' },
    { q: 'Berapa hasil dari 12 × 12?', a: '144' },
    { q: 'Planet manakah yang dijuluki raja planet?', a: 'Jupiter' },
    { q: 'Siapa penulis novel "Laskar Pelangi"?', a: 'Andrea Hirata' },
    { q: 'Berapa jumlah pemain inti dalam satu tim sepak bola?', a: '11 pemain' },
    { q: 'Gas apa yang dibutuhkan tumbuhan untuk fotosintesis?', a: 'Karbon dioksida (CO₂)' },
    { q: 'Pada tahun berapa Indonesia memproklamasikan kemerdekaannya?', a: '1945' },
    { q: 'Apa simbol unsur kimia untuk emas?', a: 'Au (Aurum)' },
    { q: 'Siapakah pelukis lukisan "Mona Lisa"?', a: 'Leonardo da Vinci' },
    { q: 'Sungai terpanjang di Pulau Jawa bernama apa?', a: 'Sungai Bengawan Solo' }
  ],
  vhard: [
    { q: 'Siapakah perdana menteri pertama Indonesia?', a: 'Sutan Sjahrir' },
    { q: 'Terusan Suez menghubungkan Laut Mediterania dengan laut apa?', a: 'Laut Merah' },
    { q: 'Pada tahun berapa Peristiwa Sumpah Pemuda terjadi?', a: '1928' },
    { q: 'Apa nomor atom unsur kimia emas (Au)?', a: '79' },
    { q: 'Siapakah presiden ke-7 Republik Indonesia?', a: 'Joko Widodo' },
    { q: 'Apa nama gunung tertinggi di Indonesia?', a: 'Puncak Jaya (Carstensz Pyramid)' },
    { q: 'Berapa jumlah provinsi di Indonesia saat ini?', a: '38 provinsi' },
    { q: 'Apa nama galaksi tempat tata surya kita berada?', a: 'Galaksi Bima Sakti (Milky Way)' },
    { q: 'Siapakah komposer lagu wajib nasional "Gugur Bunga"?', a: 'Ismail Marzuki' },
    { q: 'Terusan Panama menghubungkan Samudra Atlantik dengan samudra apa?', a: 'Samudra Pasifik' }
  ]
};

/** Kembalikan bank soal bawaan sebagai array soal siap pakai. */
function getDefaultBank() {
  const out = [];
  CAT_ORDER.forEach(cat => {
    DEFAULT_BANK[cat].forEach(item => {
      out.push({ category: cat, question: item.q, answer: item.a });
    });
  });
  return out;
}

/* ---------- Utilitas umum ---------- */
let __uidCounter = 0;
function uid(prefix) {
  __uidCounter += 1;
  return prefix + '_' + Date.now().toString(36) + '_' + __uidCounter.toString(36);
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatClock(date) {
  const d = date instanceof Date ? date : new Date(date);
  const p = n => String(n).padStart(2, '0');
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function formatDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  const p = n => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function formatDuration(ms) {
  if (ms == null) return '—';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}
