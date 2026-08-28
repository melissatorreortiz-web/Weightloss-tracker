import crypto from 'crypto';

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

async function kv(path, opts) {
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;
  const r = await fetch(`${KV_URL}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${KV_TOKEN}`, ...(opts?.headers || {}) },
  });
  return r.json();
}

async function getSession(token) {
  if (!token) return null;
  const r = await kv(`/get/${encodeURIComponent('bitacora:__session__:' + token)}`);
  return r.result ? JSON.parse(r.result) : null;
}

async function getUsers() {
  const r = await kv('/get/bitacora:__users__');
  return r.result ? JSON.parse(r.result) : [];
}

async function saveUsers(users) {
  await kv('/set/bitacora:__users__', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(users),
  });
}

export default async function handler(req, res) {
  const token = req.headers['x-session-token'];
  const session = await getSession(token);
  if (!session || session.role !== 'admin') {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  try {
    const users = await getUsers();

    if (req.method === 'GET') {
      const safe = users.map(u => ({
        id: u.id, username: u.username, name: u.name, role: u.role,
        pages: u.pages || ['ejercicio', 'comida', 'medidas', 'taekwondo'],
      }));
      return res.status(200).json({ ok: true, users: safe });
    }

    if (req.method === 'POST') {
      const { username, password, name, role, pages } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ ok: false, error: 'Falta usuario o contraseña' });
      }
      if (users.some(u => u.username.toLowerCase() === String(username).toLowerCase())) {
        return res.status(409).json({ ok: false, error: 'Ese usuario ya existe' });
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPassword(password, salt);
      const id = crypto.randomBytes(8).toString('hex');
      const allowedPages = Array.isArray(pages) ? pages : ['ejercicio', 'comida', 'medidas', 'taekwondo'];
      const newUser = { id, username, name: name || username, role: role === 'admin' ? 'admin' : 'client', salt, hash, pages: allowedPages };
      users.push(newUser);
      await saveUsers(users);
      return res.status(200).json({ ok: true, user: { id, username, name: newUser.name, role: newUser.role, pages: newUser.pages } });
    }

    if (req.method === 'PATCH') {
      const { userId, pages } = req.body || {};
      const user = users.find(u => u.id === userId);
      if (!user) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
      user.pages = Array.isArray(pages) ? pages : user.pages;
      await saveUsers(users);
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { userId } = req.body || {};
      const filtered = users.filter(u => u.id !== userId);
      await saveUsers(filtered);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error de usuarios' });
  }
}
