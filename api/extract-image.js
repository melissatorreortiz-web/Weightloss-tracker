export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const { image, type } = req.body || {};
  if (!image) {
    return res.status(400).json({ ok: false, error: 'Falta la imagen' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'Servidor no configurado' });
  }

  const prompts = {
    macros: `Analiza esta captura de pantalla de una app de nutrición (como MyFitnessPal). Extrae, si están visibles: calorías totales (number), proteína en gramos (number), grasa en gramos (number), carbohidratos en gramos (number), y la fecha si aparece en formato YYYY-MM-DD (string o null si no aparece). Responde SOLO con un JSON con exactamente estas claves: calories, protein, fat, carbs, date. Usa null en cualquier valor que no puedas leer con certeza. No inventes números.`,
    weight: `Analiza esta captura de pantalla de una báscula inteligente o app de composición corporal (como Conair o Fitbit). Extrae, si están visibles: peso en kilogramos (number; si ves libras, conviértelo a kg), porcentaje de grasa corporal (number), porcentaje de agua corporal (number), e índice de masa corporal BMI (number). Responde SOLO con un JSON con exactamente estas claves: weight, bodyFat, water, bmi. Usa null en cualquier valor que no puedas leer con certeza. No inventes números.`,
    measurements: `Analiza esta captura de pantalla o foto de medidas corporales tomadas con cinta métrica (en centímetros). Extrae, si están visibles: cuello, hombro, cofre (pecho), cintura, abdomen, cadera, bícep izquierdo, bícep derecho, muslo izquierdo, muslo derecho, pantorrilla izquierda, pantorrilla derecha, y muñeca — todos en centímetros (number; si ves pulgadas, conviértelas a cm). Responde SOLO con un JSON con exactamente estas claves: cuello, hombro, cofre, cintura, abdomen, cadera, bicepI, bicepD, musloI, musloD, pantorrillaI, pantorrillaD, muneca. Usa null en cualquier valor que no puedas leer con certeza. No inventes números.`,
    workout: `Analiza esta captura de pantalla de una app de fitness (como Apple Fitness/Salud, Strava, Nike Run Club, etc.). Extrae, si están visibles: tipo de actividad (string, ej. "Correr", "Yoga", "Ciclismo"), duración en minutos (number), calorías quemadas (number), distancia en kilómetros (number; si ves millas, conviértelas a km), y la fecha si aparece en formato YYYY-MM-DD (string o null si no aparece). Responde SOLO con un JSON con exactamente estas claves: tipo, duracion, calorias, distancia, date. Usa null en cualquier valor que no puedas leer con certeza. No inventes números.`,
    fasting: `Analiza esta captura de pantalla de una app de ayuno intermitente (como Zero, Fastic, o similar). Extrae, si están visibles: fecha en formato YYYY-MM-DD (string o null), hora de inicio del ayuno en formato de 24 horas HH:MM (string o null), hora en que terminó o terminará el ayuno en formato de 24 horas HH:MM (string o null). Responde SOLO con un JSON con exactamente estas claves: date, startTime, endTime. Usa null en cualquier valor que no puedas leer con certeza. No inventes horas.`,
  };
  const prompt = prompts[type] || prompts.macros;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: image } },
            ],
          }],
          generationConfig: { response_mime_type: 'application/json' },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return res.status(502).json({ ok: false, error: 'Gemini error (' + geminiRes.status + '): ' + errText.slice(0, 300) });
    }

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return res.status(502).json({ ok: false, error: 'No se pudo leer la captura' });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ ok: false, error: 'Respuesta no interpretable' });
    }

    return res.status(200).json({ ok: true, data: parsed });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'Error al procesar la imagen' });
  }
}
