# SafeBite V1.5.3 — Estabilización profesional

Versión enfocada en cerrar la V1.5 antes de pasar a V1.6.

## Qué corrige esta versión

- Si no hay ingredientes verificables, SafeBite nunca muestra APTO.
- Fotos de plato preparado siempre salen como NO VERIFICABLE salvo ingredientes escritos/confirmados.
- Guardar como seguro queda bloqueado si el resultado no es APTO con ingredientes claros.
- Guardar como evitar y revisar luego no dependen de columnas nuevas inestables.
- Si Supabase falla por esquema/RLS, la app guarda temporalmente en navegador para no perder la operación.
- Historial avanzado lee Supabase y también fallback local.
- Compartir por WhatsApp queda rotulado correctamente.
- Copiar resumen conserva fallback si el navegador bloquea el portapapeles.
- El backend también bloquea falsos APTO cuando OpenAI/OCR devuelve texto tipo “no puedo determinar”.

## Estado funcional esperado

- Código de barras: operativo.
- Open Food Facts: operativo.
- Documentos médicos: operativo si el bucket `documents` ya tiene política de subida.
- Guardar como evitar: operativo.
- Revisar luego: operativo.
- Guardar como seguro: solo operativo cuando hay APTO real con ingredientes verificables.
- Historial: operativo con Supabase o fallback local.

## Recomendación operativa

Subir esta versión, probar:
1. Foto de plato: debe salir NO VERIFICABLE.
2. Foto sin ingredientes claros: debe salir NO VERIFICABLE.
3. Código de barras Hacendado probado: debe analizar y permitir guardar como evitar.
4. Producto simple con ingredientes claros: solo entonces puede guardarse como seguro.

No pasar a V1.6 hasta cerrar estas pruebas.
