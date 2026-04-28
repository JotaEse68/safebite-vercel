export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const bodySize = JSON.stringify(req.body).length;
    console.log(`[SafeBite] analyze called, body size: ${bodySize} bytes`);
    if (bodySize > 950000) {
      return res.status(413).json({ error: 'Imagen demasiado grande. Fotografía solo la lista de ingredientes con buena luz.' });
    }

    const { imageDataUrl, allergens, childName, mode } = req.body;
    const openaiKey = process.env.OPENAI_KEY;
    const claudeKey = process.env.ANTHROPIC_KEY;

    if (!openaiKey) throw new Error('OPENAI_KEY no configurada');

    const allergenCtx = allergens?.length
      ? `Alérgenos del perfil de ${childName || 'el niño'}: ${allergens.map(a => `${a.label} (${a.severity || 'alta'})`).join(', ')}.`
      : 'Sin alérgenos configurados.';

    const HIDDEN = `caseinato/caseína/caseinato sódico/suero lácteo/proteína láctea=LECHE, albúmina/ovoalbúmina/lisozima=HUEVO, sémola/espelta/cebada/centeno/malta/almidón de trigo=GLUTEN, tahini=SÉSAMO, lecitina de soja=SOJA`;
    const RULES = `REGLAS: 1) Detecta derivados ocultos: ${HIDDEN}. 2) Si gravedad GRAVE y hay trazas → NO APTO. 3) Explica en 2 frases como padre. 4) Ante la duda → NO APTO. Responde SOLO JSON: {"status":"APTO"|"PRECAUCION"|"NO APTO","confidence":"alta"|"media"|"baja","explanation":"...","risks":[],"hidden_allergens":[],"traces_warning":true|false,"ingredients_found":"..."}`;

    let ingredientsText = '';

    if (mode === 'text') {
      ingredientsText = imageDataUrl;
      if (!claudeKey) throw new Error('ANTHROPIC_KEY no configurada');
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 600,
          messages: [{ role: 'user', content: `${allergenCtx}\n\n${RULES}\n\nINGREDIENTES:\n${ingredientsText}` }]
        })
      });
      if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(`Claude: ${e.error?.message || r.status}`); }
      const d = await r.json();
      const txt = d.content?.[0]?.text || '';
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('Sin JSON válido');
      const result = JSON.parse(m[0]);
      result.ingredients_found = ingredientsText.substring(0, 300);
      return res.status(200).json(result);
    }

    if (!imageDataUrl?.startsWith('data:image')) throw new Error('Imagen no válida');

    const ocrRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini', max_tokens: 800,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: mode === 'menu'
              ? 'Eres un lector OCR experto. Transcribe TODO el texto visible en esta imagen de menú: nombres de platos, ingredientes, alérgenos. Devuelve solo el texto, sin análisis.'
              : 'Eres un lector OCR experto en etiquetas alimentarias. Transcribe EXACTAMENTE la lista completa de ingredientes. Incluye porcentajes, aditivos (E-xxx) y alérgenos. Solo el texto, sin análisis.' },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }
          ]
        }]
      })
    });

    if (!ocrRes.ok) { const e = await ocrRes.json().catch(()=>({})); throw new Error(`OCR: ${e.error?.message || ocrRes.status}`); }
    const ocrData = await ocrRes.json();
    ingredientsText = ocrData.choices?.[0]?.message?.content || '';

    if (!ingredientsText || ingredientsText.length < 5) {
      return res.status(200).json({
        status: 'PRECAUCION', confidence: 'baja',
        explanation: 'No pude leer el texto. Consejos: fotografía solo la etiqueta de ingredientes con buena luz, o usa el modo Texto para pegar los ingredientes manualmente.',
        risks: ['Imagen ilegible — no se pueden verificar alérgenos'], hidden_allergens: [], traces_warning: false, ingredients_found: ''
      });
    }

    if (claudeKey) {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 600,
          messages: [{ role: 'user', content: `${allergenCtx}\n\n${RULES}\n\nINGREDIENTES EXTRAÍDOS:\n${ingredientsText}` }]
        })
      });
      if (!claudeRes.ok) { const e = await claudeRes.json().catch(()=>({})); throw new Error(`Claude: ${e.error?.message || claudeRes.status}`); }
      const cd = await claudeRes.json();
      const txt2 = cd.content?.[0]?.text || '';
      const m2 = txt2.match(/\{[\s\S]*\}/);
      if (!m2) throw new Error('Sin JSON válido de Claude');
      const result2 = JSON.parse(m2[0]);
      result2.ingredients_found = ingredientsText.substring(0, 300);
      return res.status(200).json(result2);
    }

    // Fallback GPT análisis
    const r2 = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini', max_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${allergenCtx}\n\n${RULES}` },
          { role: 'user', content: `INGREDIENTES:\n${ingredientsText}` }
        ]
      })
    });
    const d2 = await r2.json();
    const result = JSON.parse(d2.choices?.[0]?.message?.content || '{}');
    result.ingredients_found = ingredientsText.substring(0, 300);
    return res.status(200).json(result);

  } catch (err) {
    console.error('[SafeBite] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
