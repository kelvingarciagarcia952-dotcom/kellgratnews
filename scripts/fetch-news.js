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

const MAX_SENTENCES = 3;
const MAX_TITLE_LENGTH = 220;
const MAX_DESCRIPTION_LENGTH = 5000;

const ARTICLE_TIMEOUT_MS = 12000;
const FEED_TIMEOUT_MS = 15000;
const TRANSLATE_TIMEOUT_MS = 9000;

const DELAY_MS = 250;
const MAX_AGE_DAYS = 14;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0.0.0 Safari/537.36 KellgreatNews/3.0';

const parser = new RSSParser({
  timeout: FEED_TIMEOUT_MS,
  headers: {
    'User-Agent': USER_AGENT,
    Accept: 'application/rss+xml, application/xml, text/xml, application/json, */*'
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function safeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function stripHtml(html) {
  if (!html) return '';

  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(x?[0-9a-f]+);/gi, (_, code) => {
      const isHex = code[0]?.toLowerCase() === 'x';
      const raw = isHex ? code.slice(1) : code;
      const value = Number.parseInt(raw, isHex ? 16 : 10);

      return Number.isFinite(value)
        ? String.fromCodePoint(value)
        : ' ';
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(text, maxLength = Infinity) {
  const cleaned = stripHtml(text)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return maxLength === Infinity
    ? cleaned
    : cleaned.slice(0, maxLength).trim();
}

function splitSentences(text) {
  if (!text) return [];

  return normalizeText(text)
    .split(/(?<=[.!?。！？])\s+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 25);
}

function normalizeUrl(url) {
  const value = safeString(url).trim();

  if (!value) return '';

  try {
    const parsed = new URL(value);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }

    parsed.hash = '';

    return parsed.toString();
  } catch {
    return '';
  }
}

function generateId(url, fallback = '') {
  const seed =
    normalizeUrl(url) ||
    normalizeText(fallback).toLowerCase();

  return crypto
    .createHash('sha256')
    .update(seed)
    .digest('hex')
    .slice(0, 16);
}

function getDate(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString();
}

async function fetchJson(url, timeoutMs = FEED_TIMEOUT_MS) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json, text/plain, */*'
    },
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function fetchArticleText(url) {
  const safeUrl = normalizeUrl(url);

  if (!safeUrl) {
    throw new Error('URL inválida');
  }

  const response = await fetch(safeUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(ARTICLE_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();

  const paragraphs = [];
  const paragraphRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;

  let match;

  while ((match = paragraphRegex.exec(html)) !== null) {
    const text = normalizeText(match[1], 1200);

    if (text.length >= 80) {
      paragraphs.push(text);
    }

    if (paragraphs.length >= 6) {
      break;
    }
  }

  if (paragraphs.length === 0) {
    throw new Error('sin párrafos');
  }

  return paragraphs
    .join(' ')
    .slice(0, MAX_DESCRIPTION_LENGTH);
}

async function fetchTelegram(source) {
  const username = safeString(source.telegram_user)
    .replace(/^@+/, '')
    .trim();

  if (!username) {
    throw new Error('telegram_user ausente');
  }

  const url = `https://t.me/s/${encodeURIComponent(username)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(ARTICLE_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();

  const items = [];

  const postRegex =
    /data-post="([^"<>]+)"[\s\S]*?<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>[\s\S]*?<time[^>]*datetime="([^"]+)"/gi;

  let match;

  while ((match = postRegex.exec(html)) !== null) {
    const text = normalizeText(
      match[2],
      MAX_DESCRIPTION_LENGTH
    );

    const pubDate = getDate(match[3]);

    if (text.length < 20) {
      continue;
    }

    const postPath = match[1].split('/');
    const postId = postPath.at(-1) || '';

    const link = postId
      ? `https://t.me/${username}/${postId}`
      : `https://t.me/${username}`;

    items.push({
      title: text.slice(0, MAX_TITLE_LENGTH),
      description: text,
      link,
      pubDate
    });
  }

  return items;
}

async function fetchRssDirect(source) {
  const url = normalizeUrl(source.url);

  if (!url) {
    throw new Error('URL RSS inválida');
  }

  const feed = await parser.parseURL(url);

  return Array.isArray(feed.items)
    ? feed.items
    : [];
}

async function fetchRss2Json(source) {
  const url = normalizeUrl(source.rss2json_url);

  if (!url) {
    throw new Error('rss2json_url inválida');
  }

  const data = await fetchJson(url);

  if (
    data?.status !== 'ok' ||
    !Array.isArray(data.items) ||
    data.items.length === 0
  ) {
    throw new Error('respuesta RSS2JSON sin elementos');
  }

  return data.items;
}

async function fetchItems(source) {
  try {
    const items = await fetchRssDirect(source);

    console.log('  entrada vía RSS directo');

    return items;
  } catch (directError) {
    console.warn(
      `  RSS directo falló: ${directError.message}`
    );
  }

  if (source.rss2json_url) {
    try {
      const items = await fetchRss2Json(source);

      console.log('  entrada vía rss2json (respaldo)');

      return items;
    } catch (fallbackError) {
      console.warn(
        `  rss2json también falló: ${fallbackError.message}`
      );
    }
  }

  throw new Error('todas las puertas RSS fallaron');
}

async function translateWithGoogle(text, from, to) {
  const url =
    'https://translate.googleapis.com/translate_a/single?' +
    'client=gtx' +
    `&sl=${encodeURIComponent(from)}` +
    `&tl=${encodeURIComponent(to)}` +
    '&dt=t&q=' +
    encodeURIComponent(text);

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    },
    signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  if (Array.isArray(data?.[0])) {
    return data[0]
      .map(part => part?.[0] || '')
      .join('')
      .trim();
  }

  throw new Error('formato de traducción no válido');
}

async function translateWithMyMemory(text, from, to) {
  const url =
    'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text) +
    `&langpair=${encodeURIComponent(from)}%7C${encodeURIComponent(to)}`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT
    },
    signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  const translated = data?.responseData?.translatedText;

  if (
    data?.responseStatus === 200 &&
    typeof translated === 'string' &&
    translated.trim()
  ) {
    return translated.trim();
  }

  throw new Error('MyMemory no devolvió traducción');
}

async function translate(text, from, to) {
  const value = normalizeText(text);

  if (!value || from === to) {
    return value;
  }

  try {
    return await translateWithGoogle(value, from, to);
  } catch (googleError) {
    console.warn(
      `  Google Translate falló: ${googleError.message}`
    );
  }

  try {
    return await translateWithMyMemory(value, from, to);
  } catch (memoryError) {
    console.warn(
      `  MyMemory falló: ${memoryError.message}; se conserva original`
    );

    return value;
  }
}

function removeSourceSuffix(title, sourceName) {
  const source = safeString(sourceName).trim();

  if (!source) {
    return title;
  }

  const suffix = ` - ${source}`;

  if (
    suffix.length > 3 &&
    title.toLowerCase().endsWith(suffix.toLowerCase())
  ) {
    return title.slice(0, -suffix.length).trim();
  }

  return title;
}

function buildRawDescription(item) {
  return normalizeText(
    item.description ||
    item.contentSnippet ||
    item.content ||
    item.summary ||
    item['content:encoded'] ||
    ''
  );
}

async function processItem(item, source, targetLang) {
  const originalTitle = normalizeText(
    item.title,
    MAX_TITLE_LENGTH
  );

  if (!originalTitle) {
    throw new Error('noticia sin título');
  }

  const link = normalizeUrl(
    item.link ||
    item.guid ||
    ''
  );

  if (!link && source.tipo !== 'telegram') {
    throw new Error('noticia sin enlace válido');
  }

  const from = safeString(
    source.idioma_original ||
    source.idioma ||
    'en'
  ).toLowerCase();

  const pubDate =
    getDate(
      item.isoDate ||
      item.pubDate ||
      item.published ||
      item.date
    ) ||
    new Date().toISOString();

  let originalDescription = buildRawDescription(item)
    .slice(0, MAX_DESCRIPTION_LENGTH);

  if (
    splitSentences(originalDescription).length < 2 &&
    link
  ) {
    try {
      console.log('  feed tacaño: leyendo artículo');

      const articleText = await fetchArticleText(link);

      if (articleText.length > originalDescription.length) {
        originalDescription = articleText;
      }
    } catch (error) {
      console.warn(
        `  artículo no accesible: ${error.message}`
      );
    }
  }

  const sentences = splitSentences(
    originalDescription
  ).slice(0, MAX_SENTENCES);

  const translatedTitle = removeSourceSuffix(
    await translate(
      originalTitle,
      from,
      targetLang
    ),
    source.nombre
  ).slice(0, MAX_TITLE_LENGTH);

  const translatedSentences = [];

  for (const sentence of sentences) {
    translatedSentences.push(
      await translate(
        sentence,
        from,
        targetLang
      )
    );

    await sleep(DELAY_MS);
  }

  const finalTitle =
    translatedTitle ||
    originalTitle;

  const shortSummary =
    (
      translatedSentences[0] ||
      finalTitle
    )
      .slice(0, 500)
      .trim();

  const longSummary =
    (
      translatedSentences.join(' ') ||
      finalTitle
    )
      .slice(0, 1500)
      .trim();

  return {
    id: generateId(
      link,
      `${source.id}:${originalTitle}`
    ),

    fuente_id: safeString(source.id),
    fuente_nombre: safeString(source.nombre),

    tipo: safeString(
      source.tipo || 'web'
    ),

    subtipo: safeString(
      source.subtipo || ''
    ),

    grupo_fuente: safeString(
      source.grupo_fuente || ''
    ),

    nivel_fuente: safeString(
      source.nivel_fuente || ''
    ),

    categoria: safeString(
      source.categoria || 'tecnologia'
    ),

    idioma_original: from,

    prioridad_fuente:
      Number.isFinite(Number(source.prioridad))
        ? Number(source.prioridad)
        : 3,

    analizar:
      source.analizar !== false,

    resumir:
      source.resumir !== false,

    titulo: finalTitle,

    titulo_original:
      originalTitle,

    enlace:
      link ||
      `https://t.me/${safeString(
        source.telegram_user
      ).replace(/^@+/, '')}`,

    fecha: pubDate,

    resumen_corto:
      shortSummary,

    resumen_largo:
      longSummary,

    texto_original:
      originalDescription.slice(
        0,
        MAX_DESCRIPTION_LENGTH
      ),

    analisis: null
  };
}

async function processSource(source, targetLang) {
  console.log(
    `Procesando: ${source.nombre}`
  );

  try {
    const items =
      source.tipo === 'telegram'
        ? await fetchTelegram(source)
        : await fetchItems(source);

    console.log(
      `  descargados: ${items.length}`
    );

    const limit = Math.max(
      0,
      Number(source.limite) || 10
    );

    const limited = items.slice(
      0,
      limit
    );

    const output = [];

    for (const item of limited) {
      try {
        output.push(
          await processItem(
            item,
            source,
            targetLang
          )
        );
      } catch (error) {
        console.warn(
          `  noticia descartada: ${error.message}`
        );
      }
    }

    console.log(
      `  procesados: ${output.length}`
    );

    return output;
  } catch (error) {
    console.error(
      `  error fuente ${source.nombre}: ${error.message}`
    );

    return [];
  }
}

function dedupeItems(items) {
  const seenUrls = new Set();
  const seenTitles = new Set();

  const cutoff =
    Date.now() -
    MAX_AGE_DAYS *
      24 *
      60 *
      60 *
      1000;

  return items.filter(item => {
    const date =
      new Date(item.fecha).getTime();

    if (
      !Number.isFinite(date) ||
      date < cutoff
    ) {
      return false;
    }

    const urlKey =
      normalizeUrl(item.enlace)
        .toLowerCase();

    const titleKey =
      normalizeText(item.titulo)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    if (
      urlKey &&
      seenUrls.has(urlKey)
    ) {
      return false;
    }

    if (
      titleKey &&
      seenTitles.has(titleKey)
    ) {
      return false;
    }

    if (urlKey) {
      seenUrls.add(urlKey);
    }

    if (titleKey) {
      seenTitles.add(titleKey);
    }

    return true;
  });
}

function readExistingOutput() {
  try {
    if (!fs.existsSync(OUTPUT_FILE)) {
      return null;
    }

    const existing =
      JSON.parse(
        fs.readFileSync(
          OUTPUT_FILE,
          'utf-8'
        )
      );

    return (
      existing &&
      Array.isArray(existing.items)
        ? existing
        : null
    );
  } catch {
    return null;
  }
}

function writeOutputAtomically(output) {
  const webDir =
    path.dirname(OUTPUT_FILE);

  if (!fs.existsSync(webDir)) {
    fs.mkdirSync(
      webDir,
      { recursive: true }
    );
  }

  const tempFile =
    `${OUTPUT_FILE}.tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(
      output,
      null,
      2
    ),
    'utf-8'
  );

  fs.renameSync(
    tempFile,
    OUTPUT_FILE
  );
}

async function main() {
  console.log(
    '=== KellgreatNews v3 — captura robusta ==='
  );

  if (!fs.existsSync(SOURCES_FILE)) {
    throw new Error(
      'No existe sources.json'
    );
  }

  const config =
    JSON.parse(
      fs.readFileSync(
        SOURCES_FILE,
        'utf-8'
      )
    );

  if (!Array.isArray(config.sources)) {
    throw new Error(
      'sources.json no contiene un array sources'
    );
  }

  const configuracion =
    config.configuracion || {};

  const targetLang =
    safeString(
      configuracion.idioma_destino ||
      'es'
    ).toLowerCase();

  const globalLimit =
    Math.max(
      1,
      Number(
        configuracion.limite_global
      ) || 60
    );

  const all = [];

  let activeSources = 0;
  let successfulSources = 0;

  for (const source of config.sources) {
    if (!source?.activo) {
      continue;
    }

    activeSources += 1;

    const items =
      await processSource(
        source,
        targetLang
      );

    if (items.length > 0) {
      successfulSources += 1;
    }

    all.push(...items);
  }

  console.log(
    `Fuentes activas: ${activeSources}; ` +
    `con resultados: ${successfulSources}`
  );

  const unique =
    dedupeItems(all);

  unique.sort(
    (a, b) =>
      new Date(b.fecha).getTime() -
      new Date(a.fecha).getTime()
  );

  const finalItems =
    unique.slice(
      0,
      globalLimit
    );

  const previous =
    readExistingOutput();

  if (finalItems.length === 0) {
    console.warn(
      'Sin noticias válidas: se conserva web/news.json anterior'
    );

    return;
  }

  if (
    activeSources > 0 &&
    successfulSources === 0 &&
    previous?.items?.length > 0
  ) {
    console.warn(
      'Todas las fuentes fallaron: ' +
      'se conserva web/news.json anterior'
    );

    return;
  }

  const output = {
    schema_version: 3,

    updated_at:
      new Date().toISOString(),

    configuracion,

    source_stats: {
      active_sources:
        activeSources,

      successful_sources:
        successfulSources,

      collected_items:
        all.length,

      deduplicated_items:
        unique.length,

      final_items:
        finalItems.length
    },

    items:
      finalItems
  };

  writeOutputAtomically(output);

  console.log(
    `guardadas: ${finalItems.length} noticias en web/news.json`
  );
}

main().catch(error => {
  console.error(
    `error fatal: ${error.message}`
  );

  process.exit(1);
});
