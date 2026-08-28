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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Falta usuario o contraseña' });
  }

  try {
    const usersRes = await kv('/get/bitacora:__users__');
    const users = usersRes.result ? JSON.parse(usersRes.result) : [];

    if (users.length === 0) {
      return res.status(404).json({ ok: false, error: 'NO_USERS' });
    }

    const user = users.find(u => u.username.toLowerCase() === String(username).toLowerCase());
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }

    const testHash = hashPassword(password, user.salt);
    const testBuf = Buffer.from(testHash, 'hex');
    const realBuf = Buffer.from(user.hash, 'hex');
    const match = testBuf.length === realBuf.length && crypto.timingSafeEqual(testBuf, realBuf);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const pages = user.pages || ['ejercicio', 'comida', 'medidas', 'taekwondo'];
    const session = { userId: user.id, username: user.username, name: user.name, role: user.role, pages };

    await kv(`/set/bitacora:__session__:${token}?EX=604800`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(session),
    });

    return res.status(200).json({ ok: true, token, role: user.role, name: user.name, userId: user.id, pages });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al iniciar sesión' });
  }
}
