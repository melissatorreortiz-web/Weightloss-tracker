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
  const { masterKey, username, password, name } = req.body || {};
  if (masterKey !== process.env.APP_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'Clave maestra incorrecta' });
  }
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Falta usuario o contraseña' });
  }

  try {
    const existing = await kv('/get/bitacora:__users__');
    const users = existing.result ? JSON.parse(existing.result) : [];

    if (users.length > 0) {
      return res.status(409).json({ ok: false, error: 'Ya existe al menos un administrador. Usa "Agregar usuario" desde el panel.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const id = crypto.randomBytes(8).toString('hex');

    users.push({ id, username, name: name || username, role: 'admin', salt, hash });

    await kv('/set/bitacora:__users__', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(users),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al crear el administrador' });
  }
}
