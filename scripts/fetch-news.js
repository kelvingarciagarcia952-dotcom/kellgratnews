// ============================================================
// KellgreatNews - Descarga, traducción y resumen de noticias
// ============================================================
// Este script:
// 1. Lee sources.json para saber qué fuentes procesar
// 2. Descarga el RSS de cada fuente activa
// 3. Traduce títulos y descripciones al español
// 4. Genera resúmenes cortos y largos
// 5. Guarda todo en web/news.json
// ============================================================

import RSSParser from 'rss-parser';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// ------------------------------------------------------------
// Configuración de rutas
// ------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const SOURCES_FILE = path.join(rootDir, 'sources.json');
const OUTPUT_FILE = path.join(rootDir, 'web', 'news.json');

// Cantidad máxima de oraciones a incluir en el resumen largo
const MAX_SENTENCES_FOR_SUMMARY = 4;

// Pausa entre peticiones de traducción (para no saturar la API)
const TRANSLATE_DELAY_MS = 500;

// ------------------------------------------------------------
// Utilidades básicas
// ------------------------------------------------------------

// Pausa la ejecución durante los milisegundos indicados
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Genera un ID único y estable a partir de una URL
function generateId(url) {
  return crypto.createHash('md5').update(url).digest('hex').substring(0, 12);
}

// Elimina etiquetas HTML y entidades comunes de un texto
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&hellip;/gi, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

// Divide un texto en oraciones individuales
function splitSentences(text) {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20); // Ignorar fragmentos muy cortos
}

// ------------------------------------------------------------
// Traducción automática (inglés → español)
// ------------------------------------------------------------

// Opción principal: Google Translate (endpoint no oficial, sin API key)
async function translateWithGoogle(text, sourceLang = 'en', targetLang = 'es') {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0].map(item => item[0]).join('');
  }
  throw new Error('Formato de respuesta inesperado');
}

// Opción de respaldo: MyMemory API (gratuita, sin API key)
async function translateWithMyMemory(text, sourceLang = 'en', targetLang = 'es') {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.responseStatus === 200 && data.responseData) {
    return data.responseData.translatedText;
  }
  throw new Error('MyMemory no pudo traducir');
}

// Función principal de traducción con fallback automático
async function translateText(text, sourceLang = 'en', targetLang = 'es') {
  if (!text || text.trim().length === 0) return text;

  // Intento 1: Google Translate
  try {
    return await translateWithGoogle(text, sourceLang, targetLang);
  } catch (error) {
    console.warn(`  ⚠ Google Translate falló, probando MyMemory: ${error.message}`);
  }

  // Intento 2: MyMemory
  try {
    return await translateWithMyMemory(text, sourceLang, targetLang);
  } catch (error) {
    console.warn(`  ⚠ MyMemory falló, devolviendo texto original: ${error.message}`);
  }

  // Si todo falla, devolvemos el texto original en inglés
  return text;
}

// ------------------------------------------------------------
// Procesamiento de cada noticia individual
// ------------------------------------------------------------
async function processItem(item, source) {
  // Extraer campos del RSS
  const title = stripHtml(item.title || '');
  const description = item.contentSnippet || stripHtml(item.content || item.summary || '');
  const link = item.link || '';
  const pubDate = item.isoDate || item.pubDate || new Date().toISOString();

  // Traducir el título
  const translatedTitle = await translateText(title, 'en', 'es');
  await sleep(TRANSLATE_DELAY_MS);

  // Dividir la descripción en oraciones y traducir las primeras N
  const sentences = splitSentences(description);
  const sentencesToTranslate = sentences.slice(0, MAX_SENTENCES_FOR_SUMMARY);

  const translatedSentences = [];
  for (const sentence of sentencesToTranslate) {
    const translated = await translateText(sentence, 'en', 'es');
    translatedSentences.push(translated);
    await sleep(TRANSLATE_DELAY_MS);
  }

  // Construir resúmenes
  const resumen_corto = translatedSentences.length > 0
    ? translatedSentences[0]
    : translatedTitle;

  const resumen_largo = translatedSentences.length > 0
    ? translatedSentences.join(' ')
    : translatedTitle;

  return {
    id: generateId(link),
    fuente_id: source.id,
    fuente_nombre: source.nombre,
    tipo: 'web',
    titulo: translatedTitle,
    enlace: link,
    fecha: pubDate,
    resumen_corto: resumen_corto,
    resumen_largo: resumen_largo
  };
}

// ------------------------------------------------------------
// Procesamiento de una fuente completa
// ------------------------------------------------------------
async function processSource(source, parser) {
  console.log(`→ Procesando fuente: ${source.nombre}`);

  try {
    const feed = await parser.parseURL(source.url);
    const items = feed.items || [];
    const limitedItems = items.slice(0, source.limite || 10);

    const processedItems = [];
    for (const item of limitedItems) {
      try {
        const processed = await processItem(item, source);
        processedItems.push(processed);
      } catch (error) {
        console.error(`  ✗ Error procesando un item de ${source.nombre}: ${error.message}`);
      }
    }

    console.log(`  ✓ ${processedItems.length} noticias procesadas de ${source.nombre}`);
    return processedItems;
  } catch (error) {
    console.error(`  ✗ Error accediendo a la fuente ${source.nombre}: ${error.message}`);
    return [];
  }
}

// ------------------------------------------------------------
// Función principal
// ------------------------------------------------------------
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('KellgreatNews - Iniciando actualización');
  console.log('═══════════════════════════════════════════');

  // 1. Leer la configuración de fuentes
  let config;
  try {
    const rawData = fs.readFileSync(SOURCES_FILE, 'utf-8');
    config = JSON.parse(rawData);
  } catch (error) {
    console.error('✗ Error leyendo sources.json:', error.message);
    process.exit(1);
  }

  const parser = new RSSParser({
    timeout: 15000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Accept": "application/rss+xml, application/xml, text/xml, */*"
    }
  });
  const allItems = [];

  // 2. Procesar cada fuente activa
  for (const source of config.sources) {
    if (!source.activo) {
      console.log(`⊘ Saltando fuente inactiva: ${source.nombre}`);
      continue;
    }
    const items = await processSource(source, parser);
    allItems.push(...items);
  }

  // 3. Ordenar por fecha (más recientes primero)
  allItems.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  // 4. Aplicar límite global
  const globalLimit = config.configuracion?.limite_global || 25;
  const finalItems = allItems.slice(0, globalLimit);

  // 5. Construir el objeto de salida
  const output = {
    updated_at: new Date().toISOString(),
    items: finalItems
  };

  // 6. Asegurar que la carpeta web existe
  const webDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(webDir)) {
    fs.mkdirSync(webDir, { recursive: true });
  }

  // 7. Guardar news.json
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');

  console.log('═══════════════════════════════════════════');
  console.log(`✓ Actualización completada`);
  console.log(`✓ ${finalItems.length} noticias guardadas`);
  console.log('═══════════════════════════════════════════');
}

// Ejecutar
main().catch(error => {
  console.error('✗ Error fatal:', error);
  process.exit(1);
});
