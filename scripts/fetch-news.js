import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

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

function splitSentences(text) {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length > 20; });
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

async function fetchItems(source) {
  const res = await fetch(source.rss2json_url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error('rss2json: ' + (data.message || 'error'));
  return data.items || [];
}

async function processItem(item, source, targetLang) {
  const title = stripHtml(item.title || '');
  const description = stripHtml(item.description || item.content || '');
  const link = item.link || '';
  const pubDate = item.pubDate || new Date().toISOString();
  const from = source.idioma || 'en';

  const titulo = await translate(title, from, targetLang);
  await sleep(DELAY_MS);

  const sentences = splitSentences(description).slice(0, MAX_SENTENCES);
  const translated = [];
  for (const s of sentences) {
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
  console.log('=== KellgreatNews v2 ===');
  const config = JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf-8'));
  const targetLang = (config.configuracion && config.configuracion.idioma_destino) || 'es';
  const all = [];

  for (const source of config.sources) {
    if (!source.activo) continue;
    const items = await processSource(source, targetLang);
    for (const i of items) all.push(i);
  }

  all.sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });

  const limit = (config.configuracion && config.configuracion.limite_global) || 30;
  const finalItems = all.slice(0, limit);

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
