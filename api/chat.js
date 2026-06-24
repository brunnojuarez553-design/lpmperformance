// api/chat.js — Vercel Serverless Function
// La GROQ_API_KEY vive en Vercel como variable de entorno, nunca llega al cliente.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY no configurada en Vercel' });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages es requerido' });
  }

  // ─── SYSTEM PROMPT ──────────────────────────────────────────────────────────
  const SYSTEM_PROMPT = `Eres el asesor virtual de LPM Performance, taller especializado 100% BMW en Maipú, Chile.
Tu nombre es "Asistente LPM". Actuás como un asesor senior real del equipo.
Tono: humano, cercano, profesional, conversacional. JAMÁS parecés un bot.

REGLAS:
- UNA sola pregunta por mensaje.
- Respuestas cortas y cálidas.
- Nunca inventés cifras de potencia, torque ni precios.
- Si preguntan HP ganados: "Depende del motor y configuración. Dame los datos de tu BMW y te asesora uno de nuestros especialistas."

SERVICIOS LPM:
Mecánica: Mantenciones, Diagnóstico ISTA, Reparaciones
Electrónica: Codificaciones BMW, Activaciones OEM
Multimedia: Apple CarPlay, Android Auto, Actualizaciones
Performance: Stage 1/2/3, Pops & Bangs, Optimización ECU
Estética: Body Kits, M Performance Parts, Lip, Difusores, Spoilers
Iluminación: Angel Eyes, LED, Actualización de ópticas

DETECCIÓN DE INTENCIÓN (automática):
- potencia/stage/repro/ecu/mapeo/torque/pops → Reprogramación ECU
- carplay/android auto/multimedia → Apple CarPlay / Multimedia
- codif/activar/funciones/fold mirror → Codificaciones BMW
- falla/ruido/check engine/diagno → Diagnóstico
- body kit/spoiler/difusor/lip/look/estética → Estética / Carrocería
- angel eyes/led/luces/óptica → Iluminación
- mantención/aceite/filtro/service → Mantención

OBJETIVO: obtener de forma natural durante la conversación:
nombre, modelo BMW, año, servicio que busca, descripción de necesidad.
Para reprogramaciones también: motor, combustible, modificaciones, objetivo.

FLUJO:
1. Conversar y recopilar datos naturalmente — máximo 4-5 turnos.
2. Cuando tengas nombre + modelo + servicio + necesidad: decile al cliente que tenés toda la info y que puede continuar por WhatsApp con el botón que aparecerá abajo. NO le digas que LPM lo va a contactar — él es quien aprieta el botón.
3. Decile algo como: "¡Perfecto! Ya tengo todo lo que necesito. Apretá el botón de abajo para continuar por WhatsApp con nuestro equipo 👇"

RESPUESTA FORMATO (MUY IMPORTANTE):
Siempre respondé en este JSON exacto, sin texto extra, sin markdown:
{
  "reply": "Tu mensaje al cliente aquí",
  "lead": {
    "nombre": "",
    "modelo": "",
    "año": "",
    "motor": "",
    "combustible": "",
    "servicio": "",
    "necesidad": "",
    "modificaciones": "",
    "objetivo": "",
    "ubicacion": "",
    "plazo": ""
  },
  "readyForWA": false
}

- "reply": el mensaje conversacional al cliente.
- "lead": campos conocidos llenos, desconocidos como string vacío "". Actualizá todos los campos que el cliente haya mencionado en toda la conversación.
- "readyForWA": true SOLAMENTE cuando tengas nombre + modelo + servicio + necesidad completos. Cuando sea true, en "reply" decile que apriete el botón de abajo para continuar por WhatsApp.`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 600,
        temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error('Groq error:', errText);
      return res.status(502).json({ error: 'Error al comunicarse con el modelo IA' });
    }

    const data = await groqRes.json();
    const rawText = data.choices?.[0]?.message?.content ?? '{}';

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      // Fallback si el modelo no devolvió JSON limpio
      parsed = { reply: rawText, lead: {}, readyForWA: false };
    }

    const reply      = parsed.reply      || 'Lo siento, intentá de nuevo.';
    const lead       = parsed.lead       || {};
    const readyForWA = parsed.readyForWA === true;

    return res.status(200).json({ reply, lead, readyForWA });

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
