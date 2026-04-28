# SafeBite V1.2 — Resultado Pro + Plato Seguro

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


## V1.2 — Mejoras aplicadas

- Banner ajustado para que se vea completo sin recorte.
- Vista previa de la imagen o texto analizado dentro de la pantalla de resultado.
- Nuevo modo `Plato` para fotos de comida preparada.
- Resultado especial `NO VERIFICABLE` cuando la imagen no contiene ingredientes verificables.
- Bloque de confianza del análisis.
- Botón `Corregir / añadir ingredientes` desde el resultado.
- Historial con descripción más clara del tipo de análisis.
- Análisis de platos más prudente: no declara APTO/NO APTO solo por una foto del plato.

## V1.3 — Mejoras funcionales activas

- Lista rápida por perfil con productos guardados como seguros o a evitar.
- Acciones desde el resultado: guardar como seguro, guardar como evitar y copiar resumen.
- Bloque de alternativas sugeridas cuando el resultado no es apto, precaución o no verificable.
- Bloque de próximos pasos según el estado del análisis.
- Historial preparado para mostrar correctamente `NO VERIFICABLE`.
- Mejor UX para no repetir análisis y tomar decisiones más claras después de cada escaneo.

Nota: la lista rápida se guarda localmente en el navegador en esta fase. La persistencia en Supabase queda preparada para una V1.4 con tabla `saved_products`.

## V1.4 — Memoria real + historial + alternativas

Incluye:

- Tabla `saved_products` para productos seguros / evitar / pendientes por perfil.
- Tabla `analysis_history` para guardar cada análisis real en Supabase.
- Pantalla de historial avanzado con filtros.
- Ficha de producto guardado.
- Guardado de producto desde resultado y desde historial.
- Botón de compartir por WhatsApp.
- Resumen copiable mejorado.
- Doble validación para OCR dudoso: corregir ingredientes y reanalizar.
- Tabla `product_alternatives` para alternativas manuales desde admin.
- Panel admin ampliado con alternativas y productos recientes.

### Migración necesaria

Antes de probar la V1.4, ejecuta en Supabase SQL Editor:

```sql
-- contenido de supabase_migration_v1_4.sql
```

Tablas nuevas:

- `analysis_history`
- `saved_products`
- `product_alternatives`

Después ejecuta o confirma:

```sql
NOTIFY pgrst, 'reload schema';
```


## V1.5 — Código de barras + catálogo propio

Añade una opción complementaria a las existentes: `🏷️ Código de barras`.

Flujo:
1. Escanear o escribir EAN.
2. Consultar Open Food Facts.
3. Cachear el producto en `product_catalog`.
4. Analizar ingredientes con SafeBite según el perfil activo.
5. Guardar la decisión en historial y en `product_risk_assessments`.

Migración requerida:
`supabase_migration_v1_5.sql`

Tablas nuevas:
- `product_catalog`
- `product_risk_assessments`

Columnas añadidas:
- `analysis_history.input_barcode`
- `analysis_history.catalog_product_id`
- `saved_products.barcode`
- `saved_products.brand`
- `saved_products.catalog_product_id`
