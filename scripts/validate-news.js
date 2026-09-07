import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const INPUT_FILE = path.join(
  rootDir,
  'web',
  'news.json'
);

const DEFAULT_LIMIT = 60;
const MIN_FINAL_SCORE = 25;
const DESTRUCTIVE_CHANGE_RATIO = 0.20;

function safeString(value, fallback = '') {
  return typeof value === 'string'
    ? value
    : fallback;
}

function normalizeText(text) {
  return safeString(text)
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitle(title) {
  return normalizeText(title)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(url) {
  const value = safeString(url).trim();

  if (!value) {
    return '';
  }

  try {
    const parsed = new URL(value);

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

function validDate(value) {
  const date = new Date(value);

  return (
    !Number.isNaN(date.getTime()) &&
    date.getTime() > 0
  );
}

function clamp(value, min, max) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function calculateFinalScore(item) {
  const analysis =
    item.analisis || {};

  const calidad =
    Number.isFinite(
      Number(analysis.calidad)
    )
      ? Number(analysis.calidad)
      : 50;

  const relevancia =
    Number.isFinite(
      Number(analysis.relevancia)
    )
      ? Number(analysis.relevancia)
      : 50;

  const confiabilidad =
    Number.isFinite(
      Number(
        analysis.confiabilidad_fuente
      )
    )
      ? Number(
          analysis.confiabilidad_fuente
        )
      : 50;

  let score =
    calidad * 0.35 +
    relevancia * 0.40 +
    confiabilidad * 0.25;

  const clickbait =
    analysis.clickbait || {};

  const spam =
    analysis.spam || {};

  if (clickbait.detected === true) {
    score -=
      Number(clickbait.penalty) || 10;
  }

  if (spam.detected === true) {
    score -=
      Number(spam.penalty) || 20;
  }

  if (
    analysis.reporte?.detectado === true
  ) {
    score +=
      Number(
        analysis.reporte.bonus
      ) || 5;
  }

  return Math.round(
    clamp(score, 0, 100) * 100
  ) / 100;
}

function validateContainer(data) {
  const errors = [];

  if (
    !data ||
    typeof data !== 'object'
  ) {
    errors.push(
      'El JSON raíz no es un objeto'
    );

    return errors;
  }

  if (
    typeof data.schema_version !==
    'number'
  ) {
    errors.push(
      'Falta schema_version válida'
    );
  }

  if (
    !Array.isArray(data.items)
  ) {
    errors.push(
      'items no es un array'
    );
  }

  return errors;
}

function validateItem(item, index) {
  const errors = [];

  if (
    !item ||
    typeof item !== 'object'
  ) {
    errors.push(
      `item ${index}: no es un objeto`
    );

    return errors;
  }

  if (!safeString(item.id)) {
    errors.push(
      `item ${index}: falta id`
    );
  }

  if (
    !safeString(item.titulo)
  ) {
    errors.push(
      `item ${index}: falta título`
    );
  }

  if (
    normalizeText(item.titulo).length <
    8
  ) {
    errors.push(
      `item ${index}: título demasiado corto`
    );
  }

  if (
    normalizeText(item.titulo).length >
    220
  ) {
    errors.push(
      `item ${index}: título demasiado largo`
    );
  }

  const link =
    normalizeUrl(item.enlace);

  if (!link) {
    errors.push(
      `item ${index}: enlace inválido`
    );
  }

  if (
    !safeString(item.fuente_id)
  ) {
    errors.push(
      `item ${index}: falta fuente_id`
    );
  }

  if (
    !safeString(item.fuente_nombre)
  ) {
    errors.push(
      `item ${index}: falta fuente_nombre`
    );
  }

  if (
    !safeString(item.categoria)
  ) {
    errors.push(
      `item ${index}: falta categoría`
    );
  }

  if (!validDate(item.fecha)) {
    errors.push(
      `item ${index}: fecha inválida`
    );
  }

  if (
    !normalizeText(
      item.resumen_corto
    )
  ) {
    errors.push(
      `item ${index}: falta resumen_corto`
    );
  }

  if (
    !normalizeText(
      item.resumen_largo
    )
  ) {
    errors.push(
      `item ${index}: falta resumen_largo`
    );
  }

  if (
    !item.analisis ||
    typeof item.analisis !==
      'object'
  ) {
    errors.push(
      `item ${index}: falta analisis`
    );

    return errors;
  }

  if (
    !safeString(
      item.analisis.version
    )
  ) {
    errors.push(
      `item ${index}: falta versión del análisis`
    );
  }

  const numericFields = [
    'calidad',
    'relevancia',
    'confiabilidad_fuente'
  ];

  for (const field of numericFields) {
    const value =
      Number(item.analisis[field]);

    if (
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100
    ) {
      errors.push(
        `item ${index}: ${field} inválido`
      );
    }
  }

  return errors;
}

function normalizeItem(item) {
  const normalized = {
    ...item
  };

  normalized.id =
    safeString(item.id);

  normalized.fuente_id =
    safeString(item.fuente_id);

  normalized.fuente_nombre =
    safeString(item.fuente_nombre);

  normalized.tipo =
    safeString(
      item.tipo || 'web'
    );

  normalized.subtipo =
    safeString(
      item.subtipo || ''
    );

  normalized.grupo_fuente =
    safeString(
      item.grupo_fuente || ''
    );

  normalized.nivel_fuente =
    safeString(
      item.nivel_fuente || ''
    );

  normalized.categoria =
    safeString(
      item.categoria || 'tecnologia'
    );

  normalized.idioma_original =
    safeString(
      item.idioma_original || 'es'
    );

  normalized.titulo =
    normalizeText(
      item.titulo
    );

  normalized.titulo_original =
    normalizeText(
      item.titulo_original ||
      item.titulo
    );

  normalized.enlace =
    normalizeUrl(
      item.enlace
    );

  normalized.fecha =
    validDate(item.fecha)
      ? new Date(
          item.fecha
        ).toISOString()
      : '';

  normalized.resumen_corto =
    normalizeText(
      item.resumen_corto
    );

  normalized.resumen_largo =
    normalizeText(
      item.resumen_largo
    );

  normalized.texto_original =
    normalizeText(
      item.texto_original
    );

  normalized.analizar =
    item.analizar !== false;

  normalized.resumir =
    item.resumir !== false;

  normalized.prioridad_fuente =
    Number.isFinite(
      Number(
        item.prioridad_fuente
      )
    )
      ? Number(
          item.prioridad_fuente
        )
      : 3;

  normalized.final_score =
    calculateFinalScore(
      normalized
    );

  return normalized;
}

function shouldReject(item) {
  const analysis =
    item.analisis || {};

  const spam =
    analysis.spam || {};

  const finalScore =
    Number(item.final_score);

  if (
    spam.detected === true &&
    Number(spam.confidence || 0) >= 80
  ) {
    return 'spam de alta confianza';
  }

  if (
    Number.isFinite(finalScore) &&
    finalScore < MIN_FINAL_SCORE
  ) {
    return 'puntuación final demasiado baja';
  }

  return null;
}

function removeAnalyzedDuplicates(items) {
  const duplicateIds =
    new Set();

  for (const item of items) {
    const duplicate =
      item.analisis?.duplicado;

    if (
      duplicate &&
      (
        duplicate === true ||
        duplicate.detected === true
      )
    ) {
      duplicateIds.add(
        item.id
      );
    }
  }

  return items.filter(
    item => !duplicateIds.has(item.id)
  );
}

function removeExactDuplicates(items) {
  const byUrl =
    new Map();

  const byTitle =
    new Map();

  const result = [];

  function better(a, b) {
    const scoreA =
      Number(a.final_score) || 0;

    const scoreB =
      Number(b.final_score) || 0;

    if (scoreA !== scoreB) {
      return scoreA >= scoreB
        ? a
        : b;
    }

    const dateA =
      new Date(a.fecha).getTime();

    const dateB =
      new Date(b.fecha).getTime();

    return dateA >= dateB
      ? a
      : b;
  }

  for (const item of items) {
    const urlKey =
      normalizeUrl(
        item.enlace
      ).toLowerCase();

    const titleKey =
      normalizeTitle(
        item.titulo
      );

    let existing = null;

    if (
      urlKey &&
      byUrl.has(urlKey)
    ) {
      existing =
        byUrl.get(urlKey);
    }

    if (
      !existing &&
      titleKey &&
      byTitle.has(titleKey)
    ) {
      existing =
        byTitle.get(titleKey);
    }

    if (!existing) {
      result.push(item);

      const index =
        result.length - 1;

      if (urlKey) {
        byUrl.set(
          urlKey,
          item
        );
      }

      if (titleKey) {
        byTitle.set(
          titleKey,
          item
        );
      }

      continue;
    }

    const winner =
      better(
        existing,
        item
      );

    const existingIndex =
      result.indexOf(existing);

    result[existingIndex] =
      winner;

    if (urlKey) {
      byUrl.set(
        urlKey,
        winner
      );
    }

    if (titleKey) {
      byTitle.set(
        titleKey,
        winner
      );
    }
  }

  return result;
}

function sortFinalItems(items) {
  return [...items].sort(
    (a, b) => {
      const scoreA =
        Number(a.final_score) || 0;

      const scoreB =
        Number(b.final_score) || 0;

      if (
        scoreA !== scoreB
      ) {
        return scoreB - scoreA;
      }

      const qualityA =
        Number(
          a.analisis?.calidad
        ) || 0;

      const qualityB =
        Number(
          b.analisis?.calidad
        ) || 0;

      if (
        qualityA !== qualityB
      ) {
        return qualityB - qualityA;
      }

      return (
        new Date(b.fecha).getTime() -
        new Date(a.fecha).getTime()
      );
    }
  );
}

function atomicWrite(filePath, data) {
  const tempFile =
    `${filePath}.tmp`;

  fs.writeFileSync(
    tempFile,
    JSON.stringify(
      data,
      null,
      2
    ),
    'utf8'
  );

  fs.renameSync(
    tempFile,
    filePath
  );
}

function main() {
  console.log(
    '=== KellgreatNews — validación final ==='
  );

  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(
      'No existe web/news.json'
    );
  }

  const data =
    JSON.parse(
      fs.readFileSync(
        INPUT_FILE,
        'utf8'
      )
    );

  const containerErrors =
    validateContainer(data);

  if (
    containerErrors.length > 0
  ) {
    for (
      const error of containerErrors
    ) {
      console.error(
        `ERROR: ${error}`
      );
    }

    process.exit(1);
  }

  const originalItems =
    data.items;

  const originalCount =
    originalItems.length;

  const validItems = [];
  const rejected = [];

  originalItems.forEach(
    (item, index) => {
      const errors =
        validateItem(
          item,
          index
        );

      if (
        errors.length > 0
      ) {
        rejected.push({
          index,
          reason:
            errors.join('; ')
        });

        return;
      }

      const normalized =
        normalizeItem(item);

      const rejection =
        shouldReject(
          normalized
        );

      if (rejection) {
        rejected.push({
          index,
          reason: rejection
        });

        return;
      }

      validItems.push(
        normalized
      );
    }
  );

  let finalItems =
    removeAnalyzedDuplicates(
      validItems
    );

  finalItems =
    removeExactDuplicates(
      finalItems
    );

  finalItems =
    sortFinalItems(
      finalItems
    );

  const configuredLimit =
    Number(
      data.configuracion?.limite_global
    );

  const maxItems =
    Number.isFinite(
      configuredLimit
    ) &&
    configuredLimit > 0
      ? Math.floor(
          configuredLimit
        )
      : DEFAULT_LIMIT;

  finalItems =
    finalItems.slice(
      0,
      maxItems
    );

  if (
    finalItems.length === 0
  ) {
    console.error(
      'VALIDACIÓN CANCELADA: el resultado quedó vacío.'
    );

    process.exit(1);
  }

  const minimumAllowed =
    originalCount >= 10
      ? Math.max(
          3,
          Math.floor(
            originalCount *
              DESTRUCTIVE_CHANGE_RATIO
          )
        )
      : 0;

  if (
    originalCount >= 10 &&
    finalItems.length <
      minimumAllowed
  ) {
    console.error(
      'VALIDACIÓN CANCELADA: ' +
      'la limpieza eliminaría una proporción excesiva de noticias.'
    );

    console.error(
      `Originales: ${originalCount} | ` +
      `Finales: ${finalItems.length} | ` +
      `Mínimo permitido: ${minimumAllowed}`
    );

    process.exit(1);
  }

  const output = {
    ...data,

    updated_at:
      new Date().toISOString(),

    validation: {
      version: '1.1',

      executed_at:
        new Date().toISOString(),

      original_items:
        originalCount,

      rejected_items:
        rejected.length,

      final_items:
        finalItems.length,

      limit:
        maxItems,

      status: 'ok'
    },

    items:
      finalItems
  };

  atomicWrite(
    INPUT_FILE,
    output
  );

  console.log(
    `OK: ${finalItems.length} noticias válidas`
  );

  console.log(
    `Descartadas: ${rejected.length}`
  );

  console.log(
    `Límite global: ${maxItems}`
  );
}

try {
  main();
} catch (error) {
  console.error(
    `ERROR FATAL: ${error.message}`
  );

  process.exit(1);
}
