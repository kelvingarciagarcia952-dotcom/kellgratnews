import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import RSSParser from 'rss-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const SOURCES_FILE = path.join(rootDir, 'sources.json');
const OUTPUT_FILE = path.join(rootDir, 'web', 'news.json');
const MAX_SENTENCES = 4;
const DELAY_MS = 500;

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function generateId(url) {
  return crypto.createHash('md5').update(url).digest('hex').substring(0, 12);
}

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchArticleText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const paragraphs = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const text = stripHtml(m[1]);
    if (text.length > 60) paragraphs.push(text);
    if (paragraphs.length >= 4) break;
  }
  if (paragraphs.length === 0) throw new Error('sin parrafos');
  return paragraphs.join(' ');
}

async function translate(text, from, to) {
  if (from === to) return text;
  if (!text || !text.trim()) return text;
  try {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' + from + '&tl=' + to + '&dt=t&q=' + encodeURIComponent(text);
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (Array.isArray(data) && Array.isArray(data[0])) {
      return data[0].map(function (x) { return x[0]; }).join('');
    }
    throw new Error('formato');
  } catch (e) {
    console.warn('  traduccion falló, usando original: ' + e.message);
    return text;
  }
}

// ------------------------------------------------------------
// DOBLE PUERTA: rss2json primero, RSS directo como respaldo
// ------------------------------------------------------------

async function fetchItems(source) {
  // Puerta 1: rss2json
  if (source.rss2json_url) {
    try {
      const res = await fetch(source.rss2json_url);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' && (data.items || []).length > 0) {
          console.log('  entrada via rss2json');
          return data.items;
        }
      }
    } catch (e) {
      console.warn('  rss2json falló: ' + e.message);
    }
  }

  // Puerta 2: RSS directo con User-Agent de navegador
  const parser = new RSSParser({
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*'
    }
  });
  const feed = await parser.parseURL(source.url);
  console.log('  entrada via RSS directo');
  return feed.items || [];
}

async function processItem(item, source, targetLang) {
  const title = stripHtml(item.title || '');
  const description = stripHtml(item.description || item.contentSnippet || item.content || '');
  const link = item.link || '';
  const pubDate = item.isoDate || item.pubDate || new Date().toISOString();
  const from = source.idioma || 'en';

  let titulo = await translate(title, from, targetLang);

  const suffix = ' - ' + source.nombre;
  if (titulo.endsWith(suffix)) {
    titulo = titulo.slice(0, -suffix.length);
  }

  await sleep(DELAY_MS);
  let sentences = splitSentences(description);

  if (sentences.length < 2 && link) {
    try {
      console.log('  feed tacaño: leyendo el artículo completo');
      const articleText = await fetchArticleText(link);
      const more = splitSentences(articleText);
      if (more.length > sentences.length) sentences = more;
    } catch (e) {
      console.warn('  artículo bloqueado, usando fragmento: ' + e.message);
    }
  }

  const toTranslate = sentences.slice(0, MAX_SENTENCES);
  const translated = [];
  for (const s of toTranslate) {
    translated.push(await translate(s, from, targetLang));
    await sleep(DELAY_MS);
  }

  return {
    id: generateId(link),
    fuente_id: source.id,
    fuente_nombre: source.nombre,
    tipo: source.tipo || 'web',
    titulo: titulo,
    enlace: link,
    fecha: pubDate,
    resumen_corto: translated[0] || titulo,
    resumen_largo: translated.join(' ') || titulo
  };
}

async function processSource(source, targetLang) {
  console.log('Procesando: ' + source.nombre);
  try {
    const items = await fetchItems(source);
    console.log('  descargados: ' + items.length);
    const limited = items.slice(0, source.limite || 10);
    const out = [];
    for (const item of limited) {
      try {
        out.push(await processItem(item, source, targetLang));
      } catch (e) {
        console.error('  error item: ' + e.message);
      }
    }
    console.log('  procesados: ' + out.length);
    return out;
  } catch (e) {
    console.error('  error fuente ' + source.nombre + ': ' + e.message);
    return [];
  }
}

async function main() {
  console.log('=== KellgreatNews v2.2 doble puerta ===');
  const config = JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf-8'));
  const targetLang = (config.configuracion && config.configuracion.idioma_destino) || 'es';
  const all = [];

  for (const source of config.sources) {
    if (!source.activo) continue;
    const items = await processSource(source, targetLang);
    for (const i of items) all.push(i);
  }

  const MAX_AGE_DAYS = 14;
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  const seen = new Set();
  const unique = all.filter(function (it) {
    const t = new Date(it.fecha).getTime();
    if (isNaN(t) || t < cutoff) return false;
    const key = it.titulo.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });
  const limit = (config.configuracion && config.configuracion.limite_global) || 30;
  const finalItems = unique.slice(0, limit);
  // BLINDAJE: nunca sobrescribir con feed vacío
  if (finalItems.length === 0) {
    console.log('sin noticias nuevas: se conserva el news.json anterior');
    return;
  }

  const output = {
    updated_at: new Date().toISOString(),
    items: finalItems
  };

  const webDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(webDir)) fs.mkdirSync(webDir, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log('guardadas: ' + finalItems.length + ' noticias');
}

main().catch(function (e) {
  console.error('error fatal: ' + e);
  process.exit(1);
});
