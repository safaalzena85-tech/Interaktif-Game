#!/usr/bin/env node
/* ============================================================
   Quiz Show Pro — Server LAN (tanpa dependensi / tanpa npm install)
   ------------------------------------------------------------
   Fungsi:
     1. Menyajikan file aplikasi (HTML/CSS/JS) ke seluruh perangkat.
     2. Menjadi jembatan sinkronisasi antara perangkat KONTROL
        (HP/laptop moderator) dan perangkat TAMPILAN (layar peserta).

   Cara pakai:
     node server.js                 -> port 8080
     node server.js 3000            -> port 3000
     node server.js 3000 <folder>   -> tentukan folder akar

   Lalu di perangkat lain (HP/laptop) buka:
     http://<IP-laptop>:<port>/            -> halaman KONTROL
     http://<IP-laptop>:<port>/display     -> halaman TAMPILAN (layar peserta)
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = Number(process.argv[2]) || 8080;
const ROOT = path.resolve(process.argv[3] || __dirname);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

/* ---------------- Ruang (room) ---------------- */
const ROOM_TTL = 10 * 60 * 1000; // bersihkan ruang sepi setelah 10 menit
const rooms = new Map();

function newRoomId() {
  let id;
  do { id = crypto.randomBytes(2).toString('hex').toUpperCase(); } while (rooms.has(id));
  return id;
}
function newToken() { return crypto.randomBytes(16).toString('hex'); }
function roomOf(id) { return rooms.get(String(id || '').toUpperCase()); }
function makeRoom() {
  const id = newRoomId();
  const room = { id, token: newToken(), state: null, clients: new Set(), updatedAt: Date.now() };
  rooms.set(id, room);
  return room;
}
function presenceOf(room) {
  let controllers = 0, displays = 0;
  room.clients.forEach(c => { if (c.role === 'controller') controllers++; else displays++; });
  return { controllers, displays };
}

/* ---------------- SSE helpers ---------------- */
function sseWrite(res, obj, event) {
  try {
    if (event) res.write('event: ' + event + '\n');
    res.write('data: ' + JSON.stringify(obj) + '\n\n');
  } catch (e) { /* klien terputus */ }
}
function broadcast(room, obj, event, except) {
  room.clients.forEach(c => { if (c !== except) sseWrite(c.res, obj, event); });
}

function json(res, obj, code) {
  const buf = Buffer.from(JSON.stringify(obj));
  res.writeHead(code || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store'
  });
  res.end(buf);
}

function readBody(req, cb) {
  let data = '';
  req.on('data', chunk => {
    data += chunk;
    if (data.length > 4 * 1024 * 1024) req.destroy(); // batas 4 MB
  });
  req.on('end', () => cb(data));
}

/* ---------------- Static ---------------- */
function serveStatic(req, res, pathname) {
  let p = decodeURIComponent(pathname);
  if (p === '/' || p === '') p = '/index.html';
  if (p === '/display' || p === '/tampilan') p = '/display.html';
  if (p === '/kontrol') p = '/index.html';

  const rel = p.replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('403 Forbidden');
  }

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found: ' + rel);
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------------- Server ---------------- */
const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) {
    res.writeHead(400); return res.end('Bad Request');
  }
  const pathname = url.pathname;

  /* --- Info server (daftar IP LAN) --- */
  if (pathname === '/api/info') {
    return json(res, { ok: true, port: PORT, ips: lanIPs(), host: os.hostname() });
  }

  /* --- Buat ruang baru (dipanggil perangkat KONTROL) --- */
  if (pathname === '/api/room' && req.method === 'POST') {
    const room = makeRoom();
    return json(res, { ok: true, room: room.id, token: room.token });
  }

  /* --- Kontrol mengirim keadaan terbaru --- */
  if (pathname === '/api/state' && req.method === 'POST') {
    const room = roomOf(url.searchParams.get('room'));
    const token = url.searchParams.get('token');
    if (!room || room.token !== token) return json(res, { ok: false, error: 'room/token tidak valid' }, 403);
    return readBody(req, body => {
      try {
        const obj = JSON.parse(body);
        room.state = obj;
        room.updatedAt = Date.now();
        broadcast(room, obj, 'state');
      } catch (e) { /* abaikan body rusak */ }
      res.writeHead(204);
      res.end();
    });
  }

  /* --- Health/cek ruangan --- */
  if (pathname === '/api/health') {
    const room = roomOf(url.searchParams.get('room'));
    if (!room) return json(res, { ok: false }, 404);
    return json(res, { ok: true, room: room.id, presence: presenceOf(room), hasState: !!room.state });
  }

  /* --- Aliran SSE --- */
  if (pathname === '/api/events') {
    const room = roomOf(url.searchParams.get('room'));
    if (!room) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Ruang tidak ditemukan'); }

    const role = url.searchParams.get('role') === 'display' ? 'display' : 'controller';
    const token = url.searchParams.get('token');
    if (role === 'controller' && room.token !== token) {
      res.writeHead(403, { 'Content-Type': 'text/plain' }); return res.end('Token kontrol salah');
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 2000\n\n');
    if (res.flushHeaders) res.flushHeaders();

    const client = { res, role };
    room.clients.add(client);
    room.updatedAt = Date.now();

    if (room.state) sseWrite(res, room.state, 'state');
    sseWrite(res, presenceOf(room), 'presence');
    broadcast(room, presenceOf(room), 'presence', client);

    const drop = () => {
      if (!room.clients.has(client)) return;
      room.clients.delete(client);
      room.updatedAt = Date.now();
      broadcast(room, presenceOf(room), 'presence');
    };
    req.on('close', drop);
    req.on('error', drop);
    return;
  }

  if (pathname.startsWith('/api/')) return json(res, { ok: false, error: 'Endpoint tidak dikenal' }, 404);

  return serveStatic(req, res, pathname);
});

/* ---------------- Heartbeat & pembersihan ruang ---------------- */
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, id) => {
    if (room.clients.size === 0 && now - room.updatedAt > ROOM_TTL) {
      rooms.delete(id);
      return;
    }
    room.clients.forEach(c => { try { c.res.write(': hb\n\n'); } catch (e) { /* noop */ } });
  });
}, 25000);

/* ---------------- Utilitas ---------------- */
function lanIPs() {
  const out = [];
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach(name => {
    (ifaces[name] || []).forEach(ni => {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    });
  });
  return out;
}

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✖ Port ${PORT} sedang dipakai. Coba:  node server.js ${PORT + 1}\n`);
  } else {
    console.error('\n  ✖ Gagal menjalankan server:', err.message, '\n');
  }
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanIPs();
  console.log('\n  🎯 QUIZ SHOW PRO — server LAN aktif');
  console.log('  ─────────────────────────────────────────────');
  console.log('  Folder   : ' + ROOT);
  console.log('  Lokal    : http://localhost:' + PORT + '/');
  ips.forEach(ip => console.log('  Jaringan : http://' + ip + ':' + PORT + '/'));
  console.log('  ─────────────────────────────────────────────');
  console.log('  KONTROL  : /            (HP / laptop moderator)');
  console.log('  TAMPILAN : /display     (laptop / proyektor peserta)');
  console.log('  ─────────────────────────────────────────────');
  if (!ips.length) console.log('  ⚠ Tidak ada koneksi LAN terdeteksi. Cek WiFi.');
  console.log('  Tekan Ctrl+C untuk berhenti.\n');
});
