export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const { password } = req.body || {};
  const correct = process.env.APP_PASSWORD;
  if (!correct) {
    return res.status(500).json({ ok: false, error: 'Servidor no configurado' });
  }
  if (password === correct) {
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Contraseña incorrecta' });
}
