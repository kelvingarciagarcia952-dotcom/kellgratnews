// ============================================================
// KellgreatNews - Descarga, traducción y resumen (v2 con rss2json + multi-fuente)
// ============================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const SOURCES_FILE = path.join(rootDir, 'sources.json');
const OUTPUT_FILE = path.join(rootDir, 'web', 'news.json');

const MAX_SENTENCES_FOR_SUMMARY = 4;
const TRANSLATE_DELAY_MS = 500;

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateId(url) {
  return crypto.createHash('md5').update(url).digest('hex').substring(0, 12);
}

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

function splitSentences(text) {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);
}

// ------------------------------------------------------------
// Descarga: usa rss2json si está configurado, sino RSS directo
// ------------------------------------------------------------

async function fetchItemsFromRSS2JSON(rss2jsonUrl) {
  const response = await fetch(rss2jsonUrl, {
    headers: { "User-Agent": "KellgreatNews/1.0" }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.status !== 'ok') {
    throw new Error(`rss2json: ${data.message || 'error'}`);
  }
  
  return data.items || [];
}

async function fetchItemsFromRSS(url) {
  const { default: RSSParser } = await import('rss-parser');
  const parser = new RSSParser({
    timeout: 15000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Accept": "application/rss+xml, application/xml, text/xml, */*"
    }
  });
  
  const feed = await parser.parseURL(url);
  return feed.items || [];
}

async function fetchItems(source) {
  // Intentar rss2json primero (más robusto)
  if (source.rss2json_url) {
    try {
      return await fetchItemsFromRSS2JSON(source.rss2json_url);
    } catch (error) {
      console.warn(`  ⚠ rss2json falló para ${source.nombre}: ${error.message}`);
    }
  }
  
  // Fallback a RSS directo
  return await fetchItemsFromRSS(source.url);
}

// ------------------------------------------------------------
// Traducción (solo si el idioma no es español)
// ------------------------------------------------------------

async function translateWithGoogle(text, sourceLang, targetLang) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0].map(item => item[0]).join('');
  }
  throw new Error('Formato inesperado');
}

async function translateWithMyMemory(text, sourceLang, targetLang) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.responseStatus === 200 && data.responseData) {
    return data.responseData.translatedText;
  }
  throw new Error('MyMemory falló');
}

async function translateText(text, sourceLang, targetLang) {
  // Si ya está en el idioma destino, no traducir
  if (sourceLang === targetLang) return text;
  if (!text || text.trim().length === 0) return text;

  try {
    return await translateWithGoogle(text, sourceLang, targetLang);
  } catch (error) {
    console.warn(`  ⚠ Google falló: ${error.message}`);
  }

  try {
    return await translateWithMyMemory(text, sourceLang, targetLang);
  } catch (error) {
    console.warn(`  ⚠ MyMemory falló: ${error.message}`);
  }

  return text;
}

// ------------------------------------------------------------
// Procesamiento de noticia
// ------------------------------------------------------------

async function processItem(item, source, targetLang) {
  const title = stripHtml(item.title || '');
  const description = item.contentSnippet || stripHtml(item.content || item.summary || item.description || '');
  const link = item.link || '';
  const pubDate = item.isoDate || item.pubDate || new Date().toISOString();
  
  const sourceLang = source.idioma || 'en';

  const translatedTitle = await translateText(title, sourceLang, targetLang);
  if (sourceLang !== targetLang) await sleep(TRANSLATE_DELAY_MS);

  const sentences = splitSentences(description);
  const toTranslate = sentences.slice(0, MAX_SENTENCES_FOR_SUMMARY);

  const translatedSentences = [];
  for (const sentence of toTranslate) {
    const t = await translateText(sentence, sourceLang, targetLang);
    translatedSentences.push(t);
    if (sourceLang !== targetLang) await sleep(TRANSLATE_DELAY_MS);
  }

  return {
    id: generateId(link),
    fuente_id: source.id,
    fuente_nombre: source.nombre,
    tipo: source.tipo || 'web',
    titulo: translatedTitle,
    enlace: link,
    fecha: pubDate,
    resumen_corto: translatedSentences[0] || translatedTitle,
    resumen_largo: translatedSentences.join(' ') || translatedTitle
  };
}

// ------------------------------------------------------------
// Procesamiento de fuente
// ------------------------------------------------------------

async function processSource(source, targetLang) {
  console.log(`\n→ Procesando: ${source.nombre} (${source.idioma || 'en'})`);

  try {
    const items = await fetchItems(source);
    console.log(`  ✓ ${items.length} artículos descargados`);
    
    const limited = items.slice(0, source.limite || 10);
    const processed = [];
    
    for (const item of limited) {
      try {
        const p = await processItem(item, source, targetLang);
        processed.push(p);
      } catch (error) {
        console.error(`  ✗ Error item: ${error.message}`);
      }
    }
    
    console.log(`  ✓ ${processed.length} noticias procesadas`);
    return processed;
  } catch (error) {
    console.error(`  ✗ Error fuente: ${error.message}`);
    return [];
  }
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('KellgreatNews v2 - Multi-fuente + rss2json');
  console.log(`Hora: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════');

  let config;
  try {
    config = JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf-8'));
  } catch (error) {
    console.error('✗ Error sources.json:', error.message);
    process.exit(1);
  }

  const targetLang = config.configuracion?.idioma_destino || 'es';
  const allItems = [];

  for (const source of config.sources) {
    if (!source.activo) {
      console.log(`⊘ Inactiva: ${source.nombre}`);
      continue;
    }
    const items = await processSource(source, targetLang);
    allItems.push(...items);
  }

  allItems.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  const globalLimit = config.configuracion?.limite_global || 30;
  const finalItems = allItems.slice(0, globalLimit);

  const output = {
    updated_at: new Date().toISOString(),
    items: finalItems
  };

  const webDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(webDir)) {
    fs.mkdirSync(webDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');

  console.log('\n═══════════════════════════════════════════');
  console.log(`✓ ${finalItems.length} noticias guardadas`);
  console.log('═══════════════════════════════════════════');
}

main().catch(error => {
  console.error('✗ Error fatal:', error);
  process.exit(1);
});    return await translateWithGoogle(text, sourceLang, targetLang);
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
