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

async function getJSON(userId, key, fallback) {
  const r = await kv(`/get/${encodeURIComponent(`bitacora:${userId}:${key}`)}`);
  if (!r.result) return fallback;
  try { return JSON.parse(r.result); } catch (e) { return fallback; }
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  const token = req.headers['x-session-token'];
  const session = await getSession(token);
  if (!session || session.role !== 'admin') {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }

  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ ok: false, error: 'Falta userId' });

  const since = daysAgo(7);

  try {
    const rutinaState = await getJSON(userId, 'ketogains-5x5-state-html', { history: [], weights: {} });
    const otrosLog = await getJSON(userId, 'otros-ejercicios-log', []);
    const macroTarget = await getJSON(userId, 'macro-target', {});
    const macroLog = await getJSON(userId, 'macro-log', []);
    const weightLog = await getJSON(userId, 'weight-log', []);
    const measureLog = await getJSON(userId, 'measure-log', []);
    const tkdLog = await getJSON(userId, 'taekwondo-log', []);

    // Ejercicio
    const rutinaSemana = (rutinaState.history || []).filter(h => h.date >= since);
    const otrosSemana = otrosLog.filter(o => o.date >= since);

    // Comida
    const macrosSemana = macroLog.filter(m => m.date >= since);
    const macroAvg = macrosSemana.length
      ? {
          calories: Math.round(macrosSemana.reduce((a, m) => a + (m.calories || 0), 0) / macrosSemana.length),
          protein: Math.round(macrosSemana.reduce((a, m) => a + (m.protein || 0), 0) / macrosSemana.length),
          fat: Math.round(macrosSemana.reduce((a, m) => a + (m.fat || 0), 0) / macrosSemana.length),
          carbs: Math.round(macrosSemana.reduce((a, m) => a + (m.carbs || 0), 0) / macrosSemana.length),
        }
      : null;

    // Peso y medidas
    const weightSorted = [...weightLog].sort((a, b) => a.date.localeCompare(b.date));
    const weightSemana = weightSorted.filter(w => w.date >= since);
    const weightChange = weightSemana.length >= 2
      ? +(weightSemana[weightSemana.length - 1].weight - weightSemana[0].weight).toFixed(1)
      : null;
    const latestWeight = weightSorted[weightSorted.length - 1] || null;
    const measureSorted = [...measureLog].sort((a, b) => a.date.localeCompare(b.date));
    const latestMeasure = measureSorted[measureSorted.length - 1] || null;

    // Taekwondo
    const tkdSemana = tkdLog.filter(t => t.date >= since);

    return res.status(200).json({
      ok: true,
      report: {
        since,
        ejercicio: {
          sesionesRutina: rutinaSemana.length,
          detalleRutina: rutinaSemana.map(h => ({ date: h.date, day: h.day })),
          otrasActividades: otrosSemana,
        },
        comida: {
          registros: macrosSemana.length,
          promedio: macroAvg,
          meta: macroTarget,
        },
        medidas: {
          cambioPeso: weightChange,
          ultimoPeso: latestWeight,
          ultimasMedidas: latestMeasure,
        },
        taekwondo: {
          registros: tkdSemana.length,
          detalle: tkdSemana,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al generar el reporte' });
  }
}
