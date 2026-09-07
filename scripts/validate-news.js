// ============================================================
// KellgreatNews - Validador final de noticias v1
// ============================================================
//
// Flujo:
//
//   fetch-news.js
//        ↓
//   web/news.json
//        ↓
//   analyze-news.js
//        ↓
//   summarize.js
//        ↓
//   validate-news.js  ← este módulo
//        ↓
//   web/news.json
//
// Responsabilidades:
//   - Validar estructura general
//   - Validar campos obligatorios
//   - Validar URLs
//   - Validar fechas
//   - Validar títulos y contenido
//   - Revisar análisis generado
//   - Rechazar spam grave
//   - Rechazar contenido excesivamente defectuoso
//   - Eliminar duplicados confirmados
//   - Ordenar por relevancia/calidad/fecha
//   - Limitar resultados
//   - Proteger el archivo existente ante fallos graves
//
// No utiliza servicios externos.
//
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const DATA_FILE = path.join(
  rootDir,
  'web',
  'news.json'
);

const MIN_TITLE_LENGTH = 8;
const MAX_TITLE_LENGTH = 220;

const MIN_SUMMARY_LENGTH = 15;
const MIN_CONTENT_LENGTH = 20;

const MIN_VALID_SCORE = 25;
const MIN_QUALITY_FOR_PRIORITY = 45;

const MAX_AGE_DAYS = 14;
const MAX_FUTURE_DAYS = 2;

const DEFAULT_LIMIT = 60;

function safeText(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function isFiniteNumber(value) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value)
  );
}

function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function normalizeText(text) {
  return safeText(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .replace(
      /[^\p{L}\p{N}\s]/gu,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim();
}

function normalizeUrl(url) {
  const value =
    safeText(url);

  if (!value) {
    return '';
  }

  try {
    const parsed =
      new URL(value);

    if (
      parsed.protocol !== 'http:' &&
      parsed.protocol !== 'https:'
    ) {
      return '';
    }

    parsed.hash = '';

    return parsed.toString();
  } catch {
    return '';
  }
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }

  return date;
}

function isDateAcceptable(date) {
  if (!date) {
    return false;
  }

  const now =
    Date.now();

  const minimum =
    now -
    MAX_AGE_DAYS *
      24 *
      60 *
      60 *
      1000;

  const maximum =
    now +
    MAX_FUTURE_DAYS *
      24 *
      60 *
      60 *
      1000;

  const time =
    date.getTime();

  return (
    time >= minimum &&
    time <= maximum
  );
}

function dedupeStrings(values) {
  return [
    ...new Set(
      values.filter(
        (value) =>
          typeof value ===
          'string' &&
          value.trim()
      )
    )
  ];
}

function readData() {
  if (
    !fs.existsSync(
      DATA_FILE
    )
  ) {
    throw new Error(
      `No existe ${DATA_FILE}`
    );
  }

  let data;

  try {
    data =
      JSON.parse(
        fs.readFileSync(
          DATA_FILE,
          'utf-8'
        )
      );
  } catch (error) {
    throw new Error(
      `JSON inválido: ${error.message}`
    );
  }

  if (
    !data ||
    typeof data !== 'object'
  ) {
    throw new Error(
      'news.json no contiene un objeto válido'
    );
  }

  if (
    !Array.isArray(
      data.items
    )
  ) {
    throw new Error(
      'news.json no contiene un array items'
    );
  }

  return data;
}

function validateContainer(data) {
  const errors = [];

  if (
    typeof data.schema_version !==
    'number'
  ) {
    errors.push(
      'schema_version ausente o inválido'
    );
  }

  if (
    data.items.length === 0
  ) {
    errors.push(
      'el array items está vacío'
    );
  }

  return errors;
}

function validateTitle(title) {
  const value =
    safeText(title);

  if (!value) {
    return {
      valid: false,
      reason:
        'título vacío'
    };
  }

  if (
    value.length <
    MIN_TITLE_LENGTH
  ) {
    return {
      valid: false,
      reason:
        'título demasiado corto'
    };
  }

  if (
    value.length >
    MAX_TITLE_LENGTH
  ) {
    return {
      valid: false,
      reason:
        'título demasiado largo'
    };
  }

  return {
    valid: true,
    reason: null
  };
}

function validateSummary(
  summary
) {
  const value =
    safeText(summary);

  if (!value) {
    return false;
  }

  return (
    value.length >=
    MIN_SUMMARY_LENGTH
  );
}

function validateContent(
  item
) {
  const contentCandidates = [
    item.texto_original,
    item.resumen_largo,
    item.resumen_corto
  ];

  return contentCandidates.some(
    (value) =>
      safeText(value).length >=
      MIN_CONTENT_LENGTH
  );
}

function validateLink(
  item
) {
  const link =
    normalizeUrl(
      item.enlace
    );

  if (link) {
    return {
      valid: true,
      link
    };
  }

  /*
   * Telegram puede tener una URL
   * de respaldo construida por fetch-news.
   */
  if (
    item.tipo ===
    'telegram'
  ) {
    const fallback =
      safeText(
        item.enlace
      );

    if (
      fallback.startsWith(
        'https://t.me/'
      )
    ) {
      return {
        valid: true,
        link: fallback
      };
    }
  }

  return {
    valid: false,
    link: ''
  };
}

function validateSource(
  item
) {
  if (
    !safeText(
      item.fuente_id
    )
  ) {
    return false;
  }

  if (
    !safeText(
      item.fuente_nombre
    )
  ) {
    return false;
  }

  return true;
}

function validateDateField(
  item
) {
  const date =
    parseDate(
      item.fecha
    );

  if (!date) {
    return {
      valid: false,
      date: null,
      reason:
        'fecha inválida'
    };
  }

  if (
    !isDateAcceptable(
      date
    )
  ) {
    return {
      valid: false,
      date,
      reason:
        'fecha fuera del intervalo permitido'
    };
  }

  return {
    valid: true,
    date,
    reason: null
  };
}

function validateAnalysis(
  analysis
) {
  if (
    !analysis ||
    typeof analysis !==
      'object'
  ) {
    return {
      valid: false,
      reason:
        'análisis ausente'
    };
  }

  if (
    !Number.isInteger(
      analysis.version
    )
  ) {
    return {
      valid: false,
      reason:
        'versión del análisis inválida'
    };
  }

  if (
    !safeText(
      analysis.categoria
    )
  ) {
    return {
      valid: false,
      reason:
        'categoría ausente'
    };
  }

  if (
    !safeText(
      analysis.idioma_detectado
    )
  ) {
    return {
      valid: false,
      reason:
        'idioma detectado ausente'
    };
  }

  if (
    !isFiniteNumber(
      analysis.calidad
    )
  ) {
    return {
      valid: false,
      reason:
        'calidad inválida'
    };
  }

  if (
    !isFiniteNumber(
      analysis.relevancia
    )
  ) {
    return {
      valid: false,
      reason:
        'relevancia inválida'
    };
  }

  if (
    !isFiniteNumber(
      analysis.confiabilidad_fuente
    )
  ) {
    return {
      valid: false,
      reason:
        'confiabilidad inválida'
    };
  }

  if (
    analysis.calidad < 0 ||
    analysis.calidad > 100
  ) {
    return {
      valid: false,
      reason:
        'calidad fuera de rango'
    };
  }

  if (
    analysis.relevancia < 0 ||
    analysis.relevancia > 100
  ) {
    return {
      valid: false,
      reason:
        'relevancia fuera de rango'
    };
  }

  if (
    analysis.confiabilidad_fuente <
      0 ||
    analysis.confiabilidad_fuente >
      100
  ) {
    return {
      valid: false,
      reason:
        'confiabilidad fuera de rango'
    };
  }

  return {
    valid: true,
    reason: null
  };
}

function calculateFinalScore(
  item
) {
  const analysis =
    item.analisis;

  if (!analysis) {
    return 0;
  }

  const quality =
    clamp(
      Number(
        analysis.calidad
      ) || 0,
      0,
      100
    );

  const relevance =
    clamp(
      Number(
        analysis.relevancia
      ) || 0,
      0,
      100
    );

  const reliability =
    clamp(
      Number(
        analysis.confiabilidad_fuente
      ) || 0,
      0,
      100
    );

  let score =
    quality * 0.35 +
    relevance * 0.40 +
    reliability * 0.25;

  if (
    analysis.clickbait
      ?.detected
  ) {
    score -=
      Number(
        analysis.clickbait
          ?.score || 0
      ) * 0.15;
  }

  if (
    analysis.spam
      ?.detected
  ) {
    score -= 35;
  }

  if (
    analysis.content_type ===
    'report'
  ) {
    score += 4;
  }

  return clamp(
    Math.round(score),
    0,
    100
  );
}

function normalizeItem(
  item
) {
  const normalized = {
    ...item
  };

  normalized.titulo =
    safeText(
      item.titulo
    ).slice(
      0,
      MAX_TITLE_LENGTH
    );

  normalized.titulo_original =
    safeText(
      item.titulo_original
    ).slice(
      0,
      MAX_TITLE_LENGTH
    );

  normalized.fuente_id =
    safeText(
      item.fuente_id
    );

  normalized.fuente_nombre =
    safeText(
      item.fuente_nombre
    );

  normalized.tipo =
    safeText(
      item.tipo ||
      'web'
    );

  normalized.categoria =
    safeText(
      item.categoria ||
      item.analisis
        ?.categoria ||
      'tecnologia'
    );

  normalized.idioma_original =
    safeText(
      item.idioma_original ||
      'unknown'
    );

  normalized.enlace =
    normalizeUrl(
      item.enlace
    );

  const date =
    parseDate(
      item.fecha
    );

  normalized.fecha =
    date
      ? date.toISOString()
      : '';

  normalized.resumen_corto =
    safeText(
      item.resumen_corto
    ).slice(
      0,
      500
    );

  normalized.resumen_largo =
    safeText(
      item.resumen_largo
    ).slice(
      0,
      1500
    );

  normalized.texto_original =
    safeText(
      item.texto_original
    ).slice(
      0,
      5000
    );

  normalized.tags =
    Array.isArray(
      item.tags
    )
      ? dedupeStrings(
          item.tags
        ).slice(0, 15)
      : [];

  normalized.final_score =
    calculateFinalScore(
      normalized
    );

  return normalized;
}

function shouldReject(
  item
) {
  const title =
    validateTitle(
      item.titulo
    );

  if (!title.valid) {
    return {
      reject: true,
      reason:
        title.reason
    };
  }

  if (
    !validateContent(
      item
    )
  ) {
    return {
      reject: true,
      reason:
        'contenido insuficiente'
    };
  }

  const link =
    validateLink(
      item
    );

  if (!link.valid) {
    return {
      reject: true,
      reason:
        'enlace inválido o ausente'
    };
  }

  if (
    !validateSource(
      item
    )
  ) {
    return {
      reject: true,
      reason:
        'fuente inválida'
    };
  }

  const date =
    validateDateField(
      item
    );

  if (!date.valid) {
    return {
      reject: true,
      reason:
        date.reason
    };
  }

  const analysis =
    validateAnalysis(
      item.analisis
    );

  if (!analysis.valid) {
    return {
      reject: true,
      reason:
        analysis.reason
    };
  }

  if (
    item.analisis.spam
      ?.detected &&
    Number(
      item.analisis.spam
        ?.score || 0
    ) >= 75
  ) {
    return {
      reject: true,
      reason:
        'spam de alta confianza'
    };
  }

  if (
    item.final_score <
    MIN_VALID_SCORE
  ) {
    return {
      reject: true,
      reason:
        `puntuación final demasiado baja (${item.final_score})`
    };
  }

  /*
   * No rechazamos automáticamente una noticia
   * solo por tener clickbait moderado.
   */
  return {
    reject: false,
    reason: null
  };
}

function buildDuplicateKey(
  item
) {
  const url =
    normalizeUrl(
      item.enlace
    );

  if (url) {
    return `url:${url
      .toLowerCase()
      .replace(/\/$/,
        '')}`;
  }

  const title =
    normalizeText(
      item.titulo
    );

  return `title:${title}`;
}

function removeDuplicates(
  items
) {
  const seen =
    new Map();

  const result = [];

  for (
    const item of
      items
  ) {
    const key =
      buildDuplicateKey(
        item
      );

    if (
      !key ||
      !seen.has(key)
    ) {
      if (key) {
        seen.set(
          key,
          item
        );
      }

      result.push(
        item
      );

      continue;
    }

    const existing =
      seen.get(key);

    /*
     * Conservamos la noticia
     * con mejor puntuación final.
     */
    if (
      item.final_score >
      existing.final_score
    ) {
      const index =
        result.indexOf(
          existing
        );

      if (index >= 0) {
        result[index] =
          item;
      }

      seen.set(
        key,
        item
      );
    }
  }

  return result;
}

function removeAnalyzedDuplicates(
  items
) {
  return items.filter(
    (item) =>
      !item.analisis
        ?.duplicate
        ?.detected
  );
}

function sortItems(
  items
) {
  return [...items].sort(
    (a, b) => {
      const scoreDiff =
        (b.final_score || 0) -
        (a.final_score || 0);

      if (
        scoreDiff !== 0
      ) {
        return scoreDiff;
      }

      const qualityDiff =
        (
          b.analisis
            ?.calidad ||
          0
        ) -
        (
          a.analisis
            ?.calidad ||
          0
        );

      if (
        qualityDiff !== 0
      ) {
        return qualityDiff;
      }

      return (
        new Date(
          b.fecha
        ).getTime() -
        new Date(
          a.fecha
        ).getTime()
      );
    }
  );
}

function writeAtomically(
  file,
  data
) {
  const tempFile =
    `${file}.tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(
      data,
      null,
      2
    ),
    'utf-8'
  );

  fs.renameSync(
    tempFile,
    file
  );
}

function buildStats(
  originalCount,
  validItems,
  rejectedCount,
  duplicateCount
) {
  const qualityValues =
    validItems.map(
      (item) =>
        Number(
          item.analisis
            ?.calidad || 0
        )
    );

  const relevanceValues =
    validItems.map(
      (item) =>
        Number(
          item.analisis
            ?.relevancia || 0
        )
    );

  const finalValues =
    validItems.map(
      (item) =>
        Number(
          item.final_score || 0
        )
    );

  const average = (
    values
  ) => {
    if (
      values.length === 0
    ) {
      return 0;
    }

    return Math.round(
      values.reduce(
        (sum, value) =>
          sum +
          value,
        0
      ) /
        values.length
    );
  };

  return {
    input_items:
      originalCount,

    valid_items:
      validItems.length,

    rejected_items:
      rejectedCount,

    duplicate_items:
      duplicateCount,

    average_quality:
      average(
        qualityValues
      ),

    average_relevance:
      average(
        relevanceValues
      ),

    average_final_score:
      average(
        finalValues
      )
  };
}

function main() {
  console.log(
    '=== KellgreatNews — Validator v1 ==='
  );

  const data =
    readData();

  const containerErrors =
    validateContainer(
      data
    );

  if (
    containerErrors.length > 0
  ) {
    throw new Error(
      containerErrors.join(
        '; '
      )
    );
  }

  const validItems = [];
  let rejectedCount = 0;

  for (
    let index = 0;
    index < data.items.length;
    index += 1
  ) {
    const normalized =
      normalizeItem(
        data.items[index]
      );

    const validation =
      shouldReject(
        normalized
      );

    if (
      validation.reject
    ) {
      console.warn(
        `  descartada #${index}: ${validation.reason}`
      );

      rejectedCount += 1;

      continue;
    }

    validItems.push(
      normalized
    );
  }

  /*
   * Primero eliminamos duplicados
   * que el analizador ya detectó.
   */
  const withoutAnalyzedDuplicates =
    removeAnalyzedDuplicates(
      validItems
    );

  const analyzedDuplicateCount =
    validItems.length -
    withoutAnalyzedDuplicates.length;

  /*
   * Después eliminamos duplicados
   * exactos por URL/título.
   */
  const uniqueItems =
    removeDuplicates(
      withoutAnalyzedDuplicates
    );

  const exactDuplicateCount =
    withoutAnalyzedDuplicates.length -
    uniqueItems.length;

  const totalDuplicateCount =
    analyzedDuplicateCount +
    exactDuplicateCount;

  /*
   * Orden:
   * 1. puntuación final
   * 2. calidad
   * 3. fecha
   */
  const sorted =
    sortItems(
      uniqueItems
    );

  const requestedLimit =
    Number(
      data.configuracion
        ?.limite_global
    );

  const limit =
    Number.isFinite(
      requestedLimit
    ) &&
    requestedLimit > 0
      ? Math.floor(
          requestedLimit
        )
      : DEFAULT_LIMIT;

  const finalItems =
    sorted.slice(
      0,
      limit
    );

  /*
   * Protección crítica:
   *
   * Si había noticias válidas antes pero
   * después de validar queda un lote vacío,
   * NO destruimos el archivo.
   */
  if (
    finalItems.length === 0
  ) {
    console.error(
      'No quedaron noticias válidas. Se conserva web/news.json sin modificar.'
    );

    process.exit(1);
  }

  /*
   * Protección adicional contra un desastre
   * de validación:
   *
   * si entra un lote considerable y sale
   * casi completamente destruido, no lo
   * publicamos automáticamente.
   */
  const originalCount =
    data.items.length;

  if (
    originalCount >= 10 &&
    finalItems.length <
      Math.max(
        3,
        Math.floor(
          originalCount *
            0.20
        )
      )
  ) {
    console.error(
      `Validación demasiado destructiva: ${finalItems.length}/${originalCount} noticias sobrevivieron.`
    );

    console.error(
      'Se conserva web/news.json sin modificar.'
    );

    process.exit(1);
  }

  const stats =
    buildStats(
      originalCount,
      finalItems,
      rejectedCount,
      totalDuplicateCount
    );

  const output = {
    ...data,

    schema_version:
      Math.max(
        Number(
          data.schema_version ||
            3
        ),
        3
      ),

    validated_at:
      new Date().toISOString(),

    validation_stats:
      stats,

    items:
      finalItems
  };

  writeAtomically(
    DATA_FILE,
    output
  );

  console.log(
    `Noticias de entrada: ${originalCount}`
  );

  console.log(
    `Noticias válidas: ${finalItems.length}`
  );

  console.log(
    `Descartadas: ${rejectedCount}`
  );

  console.log(
    `Duplicados eliminados: ${totalDuplicateCount}`
  );

  console.log(
    `Calidad media: ${stats.average_quality}/100`
  );

  console.log(
    `Relevancia media: ${stats.average_relevance}/100`
  );

  console.log(
    `Puntuación final media: ${stats.average_final_score}/100`
  );

  console.log(
    'Validación completada correctamente.'
  );
}
  
try {
  main();
} catch (error) {
  console.error(
    `Error fatal en validate-news.js: ${error.message}`
  );

  process.exit(1);
    }
