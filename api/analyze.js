const DEFAULT_RULES = [
  { ingredient_name: 'caseinato', aliases: ['caseína','caseinato sódico','caseinato calcico','caseinato cálcico','proteína láctea','proteinas lacteas','suero lácteo','lactosuero','lactoglobulina','lactoalbúmina'], allergen: 'leche', risk_level: 'alto', explanation: 'Derivado proteico de la leche.' },
  { ingredient_name: 'albúmina', aliases: ['albumina','ovoalbúmina','ovoalbumina','lisozima','clara de huevo','huevo en polvo'], allergen: 'huevo', risk_level: 'alto', explanation: 'Proteína o derivado del huevo.' },
  { ingredient_name: 'sémola', aliases: ['semola','espelta','cebada','centeno','malta','almidón de trigo','almidon de trigo','trigo','kamut'], allergen: 'gluten', risk_level: 'alto', explanation: 'Cereal con gluten o derivado.' },
  { ingredient_name: 'tahini', aliases: ['tahina','pasta de sésamo','pasta de sesamo','semillas de sésamo','semillas de sesamo'], allergen: 'sesamo', risk_level: 'alto', explanation: 'Derivado directo del sésamo.' },
  { ingredient_name: 'lecitina de soja', aliases: ['soja','proteína de soja','proteina de soja','harina de soja','aceite de soja'], allergen: 'soja', risk_level: 'medio', explanation: 'Derivado de soja.' },
  { ingredient_name: 'cacahuete', aliases: ['maní','mani','arachis hypogaea'], allergen: 'cacahuete', risk_level: 'alto', explanation: 'Cacahuete o derivado.' },
  { ingredient_name: 'frutos secos', aliases: ['almendra','avellana','nuez','pistacho','anacardo','castaña de cajú','pecana','macadamia'], allergen: 'frutos', risk_level: 'alto', explanation: 'Fruto seco o derivado.' },
  { ingredient_name: 'sulfito', aliases: ['sulfitos','dióxido de azufre','dioxido de azufre','e220','e221','e222','e223','e224','e226','e227','e228'], allergen: 'sulfitos', risk_level: 'medio', explanation: 'Sulfito o conservante relacionado.' }
];

const STATUS_SCORE = { 'NO VERIFICABLE': 0, APTO: 1, PRECAUCION: 2, 'NO APTO': 3 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const bodySize = JSON.stringify(req.body || {}).length;
    console.log(`[SafeBite] analyze called, body size: ${bodySize} bytes`);
    if (bodySize > 950000) {
      return res.status(413).json({ error: 'Imagen demasiado grande. Fotografía solo la lista de ingredientes con buena luz.' });
    }

    const { imageDataUrl, allergens = [], childName, mode } = req.body || {};
    const openaiKey = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY;
    const claudeKey = process.env.ANTHROPIC_KEY || process.env.CLAUDE_API_KEY;

    if (!openaiKey && mode !== 'text') throw new Error('OPENAI_KEY no configurada');
    if (!claudeKey && !openaiKey) throw new Error('Configura ANTHROPIC_KEY o OPENAI_KEY');

    const expertBase = await loadExpertBase();
    let ingredientsText = '';

    if (mode === 'text') {
      ingredientsText = String(imageDataUrl || '').trim();
      if (!ingredientsText) throw new Error('No hay texto para analizar');
    } else {
      if (!imageDataUrl?.startsWith('data:image')) throw new Error('Imagen no válida');
      ingredientsText = await extractTextWithOpenAI(openaiKey, imageDataUrl, mode);
    }

    if (!ingredientsText || ingredientsText.length < 5) {
      return res.status(200).json({
        status: mode === 'plate' ? 'NO VERIFICABLE' : 'PRECAUCION',
        confidence: 'baja',
        explanation: mode === 'plate'
          ? 'Una foto del plato no permite confirmar ingredientes, trazas o contaminación cruzada. Sube etiqueta, menú detallado o escribe ingredientes para una decisión fiable.'
          : 'No pude leer el texto con suficiente seguridad. Repite la foto con mejor luz o pega los ingredientes manualmente.',
        risks: mode === 'plate' ? ['Ingredientes no verificables solo por imagen'] : ['Texto ilegible o incompleto'],
        hidden_allergens: [],
        traces_warning: false,
        ingredients_found: '',
        evidence: mode === 'plate' ? ['Criterio SafeBite: foto de plato sin ingredientes → NO VERIFICABLE'] : []
      });
    }

    if (mode === 'plate') {
      return res.status(200).json(buildPlateResult(ingredientsText, childName));
    }

    const deterministic = applySafeBiteRules(ingredientsText, allergens, expertBase.rules);
    const aiResult = await analyzeWithAI({
      claudeKey,
      openaiKey,
      ingredientsText,
      allergens,
      childName,
      mode,
      expertBase,
      deterministic
    });

    const result = mergeResults(aiResult, deterministic, ingredientsText, expertBase);
    return res.status(200).json(result);

  } catch (err) {
    console.error('[SafeBite] error:', err);
    return res.status(500).json({ error: err.message || 'Error interno' });
  }
}

async function extractTextWithOpenAI(openaiKey, imageDataUrl, mode) {
  const ocrPrompt = mode === 'menu'
    ? 'Eres un lector OCR experto. Transcribe TODO el texto visible en esta imagen de menú de restaurante: nombres de platos, ingredientes, alérgenos y descripciones. Devuelve solo el texto, sin análisis.'
    : mode === 'plate'
      ? 'Observa la imagen del plato y describe solo lo visible. No inventes ingredientes ocultos. Indica si parece plato preparado sin etiqueta. Devuelve una descripción breve de lo visible.'
      : 'Eres un lector OCR experto en etiquetas alimentarias. Transcribe EXACTAMENTE la lista completa de ingredientes. Incluye porcentajes, aditivos E-xxx, trazas, alérgenos y advertencias. Devuelve solo el texto, sin análisis.';

  const ocrRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_OCR_MODEL || 'gpt-4o-mini',
      max_tokens: 900,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: ocrPrompt },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }
        ]
      }]
    })
  });

  if (!ocrRes.ok) {
    const e = await ocrRes.json().catch(() => ({}));
    throw new Error(`OCR: ${e.error?.message || ocrRes.status}`);
  }
  const ocrData = await ocrRes.json();
  return ocrData.choices?.[0]?.message?.content || '';
}

async function analyzeWithAI({ claudeKey, openaiKey, ingredientsText, allergens, childName, mode, expertBase, deterministic }) {
  const allergenCtx = allergens?.length
    ? `Perfil de ${childName || 'el niño'}: ${allergens.map(a => `${a.label || a.id} (${a.severity || 'alta'})`).join(', ')}.`
    : 'Sin alérgenos configurados.';

  const rulesSample = expertBase.rules.slice(0, 120).map(r => ({
    ingrediente: r.ingredient_name,
    aliases: normalizeAliases(r.aliases).slice(0, 8),
    alergeno: r.allergen,
    riesgo: r.risk_level,
    explicacion: r.explanation
  }));

  const docsContext = expertBase.documents
    .filter(d => d.content_text)
    .slice(0, 5)
    .map(d => `DOCUMENTO: ${d.title || d.name || 'Documento'}\nCATEGORÍA: ${d.category || 'general'}\nEXTRACTO:\n${String(d.content_text).slice(0, 1800)}`)
    .join('\n\n---\n\n');

  const prompt = `Eres el motor experto de SafeBite para padres con hijos alérgicos.\n\n${allergenCtx}\n\nREGLAS ESTRUCTURADAS ACTIVAS:\n${JSON.stringify(rulesSample, null, 2)}\n\nRESULTADO DETERMINISTA PREVIO:\n${JSON.stringify(deterministic, null, 2)}\n\nBASE EXPERTA INTERNA LAZTAN / SAFEBITE:\n${docsContext || 'Sin documentos activos con texto.'}\n\nCRITERIO:\n1) Prioriza seguridad infantil.\n2) Si hay coincidencia directa o derivado de un alérgeno del perfil, marca NO APTO salvo que el riesgo sea bajo y la gravedad leve.\n3) Si hay trazas y la gravedad es grave, marca NO APTO. Si gravedad leve/moderada, marca PRECAUCION.\n4) Si la lectura es dudosa, marca PRECAUCION o NO APTO, nunca APTO.\n5) Si la entrada es una foto de plato o no hay ingredientes verificables, marca NO VERIFICABLE y pide etiqueta, menú detallado o texto.\n6) Explica en lenguaje claro para padres, sin prometer seguridad absoluta.\n\nINGREDIENTES / TEXTO ANALIZADO:\n${ingredientsText}\n\nDevuelve SOLO JSON válido con esta forma exacta:\n{"status":"APTO|PRECAUCION|NO APTO|NO VERIFICABLE","confidence":"alta|media|baja","explanation":"...","risks":["..."],"hidden_allergens":["..."],"traces_warning":true|false,"ingredients_found":"...","evidence":["..."]}`;

  if (claudeKey) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': claudeKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-haiku-20241022',
        max_tokens: 900,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(`Claude: ${e.error?.message || r.status}`);
    }
    const d = await r.json();
    return parseJsonFromText(d.content?.[0]?.text || '');
  }

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_ANALYSIS_MODEL || 'gpt-4o-mini',
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(`OpenAI análisis: ${e.error?.message || r.status}`);
  }
  const d = await r.json();
  return parseJsonFromText(d.choices?.[0]?.message?.content || '');
}

function parseJsonFromText(txt) {
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('La IA no devolvió JSON válido');
  return JSON.parse(m[0]);
}

async function loadExpertBase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  const fallback = { rules: DEFAULT_RULES, documents: [], source: 'defaults' };
  if (!url || !key) return fallback;

  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  try {
    const [rulesRes, docsRes] = await Promise.all([
      fetch(`${url}/rest/v1/allergen_rules?select=*&status=eq.active&order=allergen.asc`, { headers }),
      fetch(`${url}/rest/v1/knowledge_documents?select=id,title,category,document_type,content_text,status,priority,created_at&status=eq.active&order=priority.desc,created_at.desc&limit=8`, { headers })
    ]);

    const rules = rulesRes.ok ? await rulesRes.json() : [];
    const documents = docsRes.ok ? await docsRes.json() : [];
    return {
      rules: Array.isArray(rules) && rules.length ? rules : DEFAULT_RULES,
      documents: Array.isArray(documents) ? documents : [],
      source: 'supabase'
    };
  } catch (e) {
    console.warn('[SafeBite] expert base fallback:', e.message);
    return fallback;
  }
}

function applySafeBiteRules(text, allergens, rules) {
  const normalizedText = normalizeText(text);
  const profile = (allergens || []).map(a => ({
    id: normalizeText(a.id || a.label || ''),
    label: a.label || a.id || '',
    severity: normalizeText(a.severity || 'alta')
  }));

  const evidence = [];
  const risks = [];
  const hidden = [];
  let status = 'APTO';
  let confidence = 'alta';

  for (const rule of rules || []) {
    const allergen = normalizeText(rule.allergen || '');
    const terms = [rule.ingredient_name, ...normalizeAliases(rule.aliases)].filter(Boolean);
    const match = terms.find(t => normalizedText.includes(normalizeText(t)));
    if (!match) continue;

    const profileMatch = profile.find(p => p.id === allergen || normalizeText(p.label) === allergen || allergen.includes(p.id) || p.id.includes(allergen));
    const label = `${rule.ingredient_name || match} → ${rule.allergen}`;
    hidden.push(label);
    evidence.push(`Regla activa: ${label}${rule.explanation ? ` (${rule.explanation})` : ''}`);

    if (profileMatch) {
      risks.push(`${profileMatch.label}: detectado ${rule.ingredient_name || match}`);
      const severe = ['grave', 'alta', 'anafilaxia'].includes(profileMatch.severity);
      if (severe || normalizeText(rule.risk_level || '').includes('alto')) status = maxStatus(status, 'NO APTO');
      else status = maxStatus(status, 'PRECAUCION');
    }
  }

  const traces = /(puede contener|puede contener trazas|trazas de|contiene trazas|fabricado en.*(linea|línea|instalaciones)|contaminaci[oó]n cruzada)/i.test(text);
  if (traces) {
    const severeProfiles = profile.filter(p => ['grave', 'alta', 'anafilaxia'].includes(p.severity));
    if (severeProfiles.length) {
      status = maxStatus(status, 'NO APTO');
      risks.push(`Trazas/contaminación cruzada relevantes para perfil grave: ${severeProfiles.map(p => p.label).join(', ')}`);
      evidence.push('Criterio SafeBite: trazas + gravedad alta/grave → NO APTO');
    } else if (profile.length) {
      status = maxStatus(status, 'PRECAUCION');
      risks.push('Advertencia de trazas o posible contaminación cruzada');
      evidence.push('Criterio SafeBite: trazas detectadas → PRECAUCIÓN');
    }
  }

  if (status !== 'APTO' && evidence.length === 0) confidence = 'media';
  return { status, confidence, risks: unique(risks), hidden_allergens: unique(hidden), traces_warning: traces, evidence: unique(evidence) };
}

function mergeResults(ai, deterministic, ingredientsText, expertBase) {
  const aiStatus = ['APTO', 'PRECAUCION', 'NO APTO', 'NO VERIFICABLE'].includes(ai.status) ? ai.status : 'PRECAUCION';
  const finalStatus = STATUS_SCORE[deterministic.status] > STATUS_SCORE[aiStatus] ? deterministic.status : aiStatus;
  const evidence = unique([...(deterministic.evidence || []), ...(ai.evidence || [])]).slice(0, 8);
  const risks = unique([...(deterministic.risks || []), ...(ai.risks || [])]).slice(0, 12);
  const hidden = unique([...(deterministic.hidden_allergens || []), ...(ai.hidden_allergens || [])]).slice(0, 12);

  let explanation = ai.explanation || '';
  if (finalStatus !== aiStatus && deterministic.evidence?.length) {
    explanation = `SafeBite prioriza precaución por una regla interna: ${deterministic.evidence[0]}. ${explanation}`.trim();
  }
  if (!explanation) {
    explanation = finalStatus === 'APTO'
      ? 'No he detectado coincidencias claras con los alérgenos configurados en este perfil. Revisa igualmente la etiqueta si hay dudas.'
      : 'He detectado un posible riesgo para el perfil configurado. SafeBite prioriza precaución cuando hay duda.';
  }

  return {
    status: finalStatus,
    confidence: ai.confidence || deterministic.confidence || 'media',
    explanation,
    risks,
    hidden_allergens: hidden,
    traces_warning: Boolean(ai.traces_warning || deterministic.traces_warning),
    ingredients_found: (ai.ingredients_found || ingredientsText || '').slice(0, 1400),
    evidence,
    expert_source: expertBase.source,
    expert_documents_used: (expertBase.documents || []).map(d => d.title || d.name).filter(Boolean).slice(0, 5)
  };
}


function buildPlateResult(visibleDescription, childName) {
  return {
    status: 'NO VERIFICABLE',
    confidence: 'baja',
    explanation: `La imagen parece una comida preparada. Solo con una foto del plato no puedo confirmar ingredientes, trazas ni contaminación cruzada para ${childName || 'este perfil'}. Para una decisión fiable, sube la etiqueta, el menú con ingredientes o escribe la receta completa.`,
    risks: [
      'Ingredientes ocultos no verificables por imagen',
      'Posible contaminación cruzada en cocina no visible'
    ],
    hidden_allergens: [],
    traces_warning: false,
    ingredients_found: visibleDescription || 'Foto de plato sin lista de ingredientes verificable',
    evidence: [
      'Criterio SafeBite: una foto de plato no es suficiente para declarar APTO/NO APTO',
      'Requiere etiqueta, menú detallado o ingredientes escritos'
    ],
    expert_source: 'safebite-rules',
    expert_documents_used: []
  };
}

function normalizeAliases(aliases) {
  if (!aliases) return [];
  if (Array.isArray(aliases)) return aliases;
  if (typeof aliases === 'string') return aliases.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function maxStatus(a, b) {
  return (STATUS_SCORE[b] ?? 0) > (STATUS_SCORE[a] ?? 0) ? b : a;
}

function unique(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}
