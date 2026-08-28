export default async function handler(req, res) {
  const pw = req.headers['x-app-password'];
  if (!pw || pw !== process.env.APP_PASSWORD) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;
  if (!KV_URL || !KV_TOKEN) {
    return res.status(500).json({ ok: false, error: 'Almacenamiento no configurado' });
  }

  async function kv(path, opts) {
    const r = await fetch(`${KV_URL}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${KV_TOKEN}`, ...(opts?.headers || {}) },
    });
    return r.json();
  }

  const PREFIX = 'bitacora:';

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
