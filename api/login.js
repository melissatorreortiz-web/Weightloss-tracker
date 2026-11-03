import crypto from 'crypto';

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

async function kv(path, opts) {
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;
  if (!KV_URL || !KV_TOKEN) {
    throw new Error('Faltan las variables KV_REST_API_URL / KV_REST_API_TOKEN');
  }
  const r = await fetch(`${KV_URL}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${KV_TOKEN}`, ...(opts?.headers || {}) },
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Upstash respondió ${r.status} sin JSON: ${text.slice(0, 200)}`);
  }
  if (!r.ok || data.error) {
    throw new Error(`Upstash ${r.status}: ${data.error || text.slice(0, 200)}`);
  }
  return data;
}

// Lee la lista de usuarios tolerando datos guardados dos veces como texto.
function parseUsers(raw) {
  if (!raw) return [];
  let users = JSON.parse(raw);
  if (typeof users === 'string') users = JSON.parse(users);
  if (!Array.isArray(users)) {
    throw new Error('bitacora:__users__ no es una lista (tipo: ' + typeof users + ')');
  }
  return users;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Falta usuario o contraseña' });
  }

  let step = 'leer usuarios';
  try {
    const usersRes = await kv('/get/bitacora:__users__');

    step = 'interpretar usuarios';
    const users = parseUsers(usersRes.result);

    if (users.length === 0) {
      return res.status(404).json({ ok: false, error: 'NO_USERS' });
    }

    step = 'buscar usuario';
    const wanted = String(username).trim().toLowerCase();
    const user = users.find(u => u && typeof u.username === 'string' && u.username.toLowerCase() === wanted);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }
    if (!user.salt || !user.hash) {
      console.error('[login] El usuario no tiene salt/hash:', user.username);
      return res.status(500).json({ ok: false, error: 'Esta cuenta no tiene contraseña guardada. Pide al admin que la vuelva a crear.' });
    }

    step = 'verificar contraseña';
    const testBuf = Buffer.from(hashPassword(password, user.salt), 'hex');
    const realBuf = Buffer.from(user.hash, 'hex');
    const match = testBuf.length === realBuf.length && crypto.timingSafeEqual(testBuf, realBuf);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }

    step = 'guardar sesión';
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
    console.error(`[login] Falló al ${step}:`, err);
    return res.status(500).json({
      ok: false,
      error: `Error al iniciar sesión (${step}): ${err && err.message ? err.message : err}`,
    });
  }
}
