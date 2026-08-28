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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const token = req.headers['x-session-token'];
  const session = await getSession(token);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ ok: false, error: 'Faltan datos' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ ok: false, error: 'La nueva contraseña es muy corta' });
  }

  try {
    const usersRes = await kv('/get/bitacora:__users__');
    const users = usersRes.result ? JSON.parse(usersRes.result) : [];
    const user = users.find(u => u.id === session.userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }

    const testHash = hashPassword(currentPassword, user.salt);
    const testBuf = Buffer.from(testHash, 'hex');
    const realBuf = Buffer.from(user.hash, 'hex');
    const match = testBuf.length === realBuf.length && crypto.timingSafeEqual(testBuf, realBuf);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Tu contraseña actual no es correcta' });
    }

    const newSalt = crypto.randomBytes(16).toString('hex');
    user.salt = newSalt;
    user.hash = hashPassword(newPassword, newSalt);

    await kv('/set/bitacora:__users__', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(users),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al cambiar la contraseña' });
  }
}
