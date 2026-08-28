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
  const token = req.headers['x-session-token'];
  const session = await getSession(token);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;
  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ ok: false, error: 'Almacenamiento no configurado' });
  }

  // Admin can act on behalf of another user via ?asUser=<userId>, but only to read/write
  // that user's own namespace — never the __users__ or __session__ system keys.
  let targetUserId = session.userId;
  const asUser = req.query?.asUser || req.body?.asUser;
  if (asUser && session.role === 'admin') {
    targetUserId = asUser;
  }

  const PREFIX = `bitacora:${targetUserId}:`;

  try {
    if (req.method === 'GET') {
      const { key, list } = req.query;

      if (list !== undefined) {
        const pattern = PREFIX + (list || '') + '*';
        const keysRes = await kv(`/keys/${encodeURIComponent(pattern)}`);
        const keys = keysRes.result || [];
        if (keys.length === 0) return res.status(200).json({ ok: true, data: {} });
        const mgetPath = '/mget/' + keys.map(encodeURIComponent).join('/');
        const mgetRes = await kv(mgetPath);
        const values = mgetRes.result || [];
        const data = {};
        keys.forEach((k, i) => {
          data[k.slice(PREFIX.length)] = values[i];
        });
        return res.status(200).json({ ok: true, data });
      }

      if (!key) return res.status(400).json({ ok: false, error: 'Falta key' });
      const r = await kv(`/get/${encodeURIComponent(PREFIX + key)}`);
      return res.status(200).json({ ok: true, value: r.result });
    }

    if (req.method === 'POST') {
      const { key, value, action } = req.body || {};
      if (!key) return res.status(400).json({ ok: false, error: 'Falta key' });
      const fullKey = PREFIX + key;

      if (action === 'delete') {
        await kv(`/del/${encodeURIComponent(fullKey)}`);
        return res.status(200).json({ ok: true });
      }

      await kv(`/set/${encodeURIComponent(fullKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: value,
      });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error de almacenamiento' });
  }
}
