# SafeBite V1.1 — Base Experta Laztan

PWA para familias con niños alérgicos. Escanea etiquetas o menús y devuelve una decisión clara: **APTO / PRECAUCIÓN / NO APTO** según el perfil del niño.

## Cambios V1.1

- Admin privado con **Base Experta Laztan**.
- Alta de documentación interna no visible para usuarios.
- Reglas editables de alérgenos y derivados ocultos.
- Motor híbrido: OCR + IA + reglas estructuradas + perfil del niño.
- Evidencia visible en el resultado: reglas/documentos usados.
- Backend limpio para Vercel. Eliminada carpeta Netlify Functions.

## Stack

- Frontend: HTML + CSS + JS vanilla
- Backend: Vercel Serverless Functions (`/api/analyze.js`)
- Base de datos: Supabase
- IA: OpenAI + Claude/Anthropic
- Deploy: Vercel

## Variables de entorno en Vercel

Obligatorias:

```bash
OPENAI_KEY=sk-...
ANTHROPIC_KEY=sk-ant-...
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ey...
```

Opcionales:

```bash
OPENAI_OCR_MODEL=gpt-4o-mini
OPENAI_ANALYSIS_MODEL=gpt-4o-mini
CLAUDE_MODEL=claude-3-5-haiku-20241022
```

## Migración Supabase

1. Abre Supabase > SQL Editor.
2. Ejecuta el archivo:

```bash
supabase_migration_v1_1.sql
```

Esto crea:

- `knowledge_documents`
- `allergen_rules`
- `analysis_evidence`
- bucket privado `expert-documents`
- reglas iniciales de derivados ocultos
- políticas RLS para el admin `jsantospro3@gmail.com`

## Deploy

1. Sube estos archivos al repo `JotaEse68/safebite-vercel`.
2. Vercel detecta el cambio desde GitHub.
3. Añade/valida las variables de entorno.
4. Ejecuta la migración SQL en Supabase.
5. Redeploy.

## Nota operativa

En esta V1.1 los PDF/DOCX pueden adjuntarse, pero para que la IA los use de forma fiable debes pegar también un resumen operativo en el campo de texto del admin. La extracción automática completa de PDF/DOCX queda preparada para V1.2.
