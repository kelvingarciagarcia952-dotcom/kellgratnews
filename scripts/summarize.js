// ============================================================
// KellgreatNews - Motor de resumen extractivo v2
// ============================================================
//
// Objetivo:
//   Convertir texto largo en resúmenes cortos y coherentes
//   sin depender de servicios externos.
//
// Características:
//   - Español + inglés
//   - Stopwords ampliadas
//   - Normalización Unicode
//   - Frecuencia ponderada
//   - Relevancia por posición
//   - Relevancia de entidades y cifras
//   - Penalización de oraciones demasiado largas
//   - Penalización de redundancia
//   - Preservación del orden original
//   - Límite de longitud
//   - API reutilizable desde otros módulos
//
// ============================================================

const STOPWORDS = new Set([
  // ----------------------------------------------------------
  // Inglés
  // ----------------------------------------------------------
  'the', 'a', 'an', 'is', 'are', 'was', 'were',
  'be', 'been', 'being',
  'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'and', 'or', 'but', 'that',
  'this', 'these', 'those',
  'it', 'its', 'as', 'into', 'over', 'under',
  'after', 'before', 'between', 'through',
  'during', 'while', 'until', 'against',
  'about', 'above', 'below',
  'again', 'further', 'once',
  'here', 'there', 'when', 'where', 'why', 'how',
  'all', 'any', 'both', 'each', 'few',
  'more', 'most', 'other', 'some', 'such',
  'only', 'own', 'same',
  'also', 'back', 'even', 'still',
  'very', 'just', 'too',
  'can', 'could', 'will', 'would',
  'should', 'may', 'might',
  'must', 'do', 'does', 'did',
  'have', 'has', 'had',
  'not', 'no', 'nor',
  'if', 'then', 'than',
  'we', 'you', 'he', 'she', 'they',
  'them', 'their', 'our', 'your',
  'his', 'her', 'its',
  'i', 'me', 'my',

  // ----------------------------------------------------------
  // Español
  // ----------------------------------------------------------
  'el', 'la', 'los', 'las',
  'un', 'una', 'unos', 'unas',
  'y', 'e', 'o', 'u', 'pero',
  'que', 'qué',
  'de', 'del',
  'a', 'al',
  'en',
  'por', 'para',
  'con', 'sin',
  'sobre',
  'entre',
  'desde', 'hasta',
  'hacia',
  'según',
  'contra',
  'durante',
  'mediante',
  'como', 'cómo',
  'cuando', 'cuándo',
  'donde', 'dónde',
  'quien', 'quién',
  'quienes', 'quiénes',
  'cual', 'cuál',
  'cuales', 'cuáles',
  'lo', 'le', 'les',
  'se',
  'su', 'sus',
  'mi', 'mis',
  'tu', 'tus',
  'nuestro', 'nuestra',
  'nuestros', 'nuestras',
  'vuestro', 'vuestra',
  'vosotros', 'vosotras',
  'ellos', 'ellas',
  'nosotros', 'nosotras',
  'yo', 'me',
  'te',
  'ha', 'han',
  'he', 'has',
  'hemos',
  'había', 'habían',
  'fue', 'fueron',
  'era', 'eran',
  'es', 'son',
  'ser', 'estar',
  'está', 'están',
  'sea', 'sean',
  'hay',
  'tiene', 'tienen',
  'tener',
  'más', 'menos',
  'muy', 'mucho', 'mucha',
  'muchos', 'muchas',
  'también',
  'ya', 'aún', 'aun',
  'solo', 'sólo',
  'otra', 'otro', 'otras', 'otros',
  'cada',
  'algún', 'alguna',
  'algunos', 'algunas',
  'ningún', 'ninguna',
  'ninguno',
  'no', 'sí',
  'si',
  'porque', 'porqué',
  'aunque',
  'mientras',
  'después',
  'antes',
  'entonces',
  'así',
  'aquí',
  'ahí',
  'allí'
]);

const SIGNAL_WORDS = new Set([
  // Noticias / hechos
  'anuncio',
  'anunció',
  'anunciado',
  'confirma',
  'confirmó',
  'confirmado',
  'revela',
  'reveló',
  'revelado',
  'presenta',
  'presentó',
  'lanzó',
  'lanzamiento',
  'descubre',
  'descubrió',
  'descubrimiento',
  'informa',
  'informó',
  'según',

  // Tecnología
  'nuevo',
  'nueva',
  'mejora',
  'mejoras',
  'actualización',
  'actualiza',
  'procesador',
  'chip',
  'chips',
  'gpu',
  'cpu',
  'npu',
  'memoria',
  'batería',
  'baterias',
  'baterías',
  'software',
  'hardware',
  'modelo',
  'modelos',
  'tecnología',
  'tecnologia',

  // IA
  'inteligencia',
  'artificial',
  'ai',
  'ia',
  'modelo',
  'llm',
  'agente',
  'agentes',

  // Inglés
  'announced',
  'announces',
  'confirmed',
  'reveals',
  'revealed',
  'launch',
  'launched',
  'unveils',
  'unveiled',
  'reports',
  'reported',
  'according',
  'new',
  'update',
  'upgrade',
  'processor',
  'chip',
  'chips',
  'battery',
  'software',
  'hardware',
  'technology',
  'artificial',
  'intelligence',
  'model',
  'models',
  'agent',
  'agents'
]);

const SENTENCE_CONNECTORS = [
  /^(según|de acuerdo con|sin embargo|además|por otra parte|por ello|por tanto|asimismo)\b/i,
  /^(according to|however|moreover|in addition|therefore|also|meanwhile)\b/i
];

function safeText(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function normalizeText(text) {
  return safeText(text)
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWord(word) {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function extractWords(text) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return [];
  }

  return normalized
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map(normalizeWord)
    .filter(
      (word) =>
        word.length >= 3 &&
        !STOPWORDS.has(word)
    );
}

function splitSentences(text) {
  const normalized = normalizeText(text);

  if (!normalized) {
    return [];
  }

  return normalized
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。！？])\s+/)
    .map((sentence) =>
      sentence.trim()
    )
    .filter(
      (sentence) =>
        sentence.length >= 25
    );
}

function calculateWordFrequency(text) {
  const words =
    extractWords(text);

  const frequency =
    new Map();

  for (const word of words) {
    frequency.set(
      word,
      (frequency.get(word) || 0) + 1
    );
  }

  return frequency;
}

function calculateMaxFrequency(
  frequency
) {
  let max = 0;

  for (
    const value of
      frequency.values()
  ) {
    if (value > max) {
      max = value;
    }
  }

  return max || 1;
}

function calculateKeywordWeight(
  word,
  frequency,
  maxFrequency
) {
  const count =
    frequency.get(word) || 0;

  if (count === 0) {
    return 0;
  }

  /*
   * La raíz cuadrada evita que una palabra repetida
   * 20 veces domine completamente el resumen.
   */
  return (
    Math.sqrt(count) /
    Math.sqrt(maxFrequency)
  );
}

function calculatePositionScore(
  index,
  total
) {
  if (total <= 1) {
    return 1;
  }

  const relative =
    index / (total - 1);

  /*
   * Las primeras frases suelen introducir
   * el hecho principal.
   */
  if (index === 0) {
    return 1;
  }

  if (index === 1) {
    return 0.92;
  }

  if (relative <= 0.35) {
    return 0.80;
  }

  if (relative >= 0.85) {
    return 0.55;
  }

  return 0.65;
}

function calculateLengthScore(
  sentence
) {
  const words =
    extractWords(sentence);

  const count =
    words.length;

  if (count < 5) {
    return 0.35;
  }

  if (count <= 12) {
    return 0.80;
  }

  if (count <= 28) {
    return 1;
  }

  if (count <= 40) {
    return 0.85;
  }

  if (count <= 60) {
    return 0.65;
  }

  return 0.35;
}

function calculateSignalScore(
  sentence
) {
  const words =
    extractWords(sentence);

  if (words.length === 0) {
    return 0;
  }

  let matches = 0;

  for (const word of words) {
    if (
      SIGNAL_WORDS.has(word)
    ) {
      matches += 1;
    }
  }

  return Math.min(
    1,
    matches / 3
  );
}

function calculateNumericScore(
  sentence
) {
  const matches =
    sentence.match(
      /\b\d+(?:[.,]\d+)?%?\b/g
    ) || [];

  return Math.min(
    1,
    matches.length / 3
  );
}

function calculateEntityScore(
  sentence
) {
  /*
   * Detectamos nombres propios, marcas,
   * productos y acrónimos.
   */
  const properNames =
    sentence.match(
      /\b(?:[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñü0-9.-]{2,}|[A-Z]{2,})\b/g
    ) || [];

  const filtered =
    properNames.filter(
      (value) =>
        value.length >= 3 &&
        !STOPWORDS.has(
          normalizeWord(value)
        )
    );

  return Math.min(
    1,
    filtered.length / 4
  );
}

function calculateConnectorScore(
  sentence
) {
  for (
    const pattern of
      SENTENCE_CONNECTORS
  ) {
    if (
      pattern.test(sentence)
    ) {
      return 0.35;
    }
  }

  return 0;
}

function scoreSentence(
  sentence,
  index,
  total,
  frequency,
  maxFrequency
) {
  const words =
    extractWords(sentence);

  if (words.length === 0) {
    return {
      sentence,
      index,
      score: 0,
      details: {}
    };
  }

  let keywordScore = 0;

  for (const word of words) {
    keywordScore +=
      calculateKeywordWeight(
        word,
        frequency,
        maxFrequency
      );
  }

  keywordScore =
    keywordScore /
    words.length;

  const positionScore =
    calculatePositionScore(
      index,
      total
    );

  const lengthScore =
    calculateLengthScore(
      sentence
    );

  const signalScore =
    calculateSignalScore(
      sentence
    );

  const numericScore =
    calculateNumericScore(
      sentence
    );

  const entityScore =
    calculateEntityScore(
      sentence
    );

  const connectorScore =
    calculateConnectorScore(
      sentence
    );

  /*
   * Ponderaciones:
   *
   * frecuencia      35 %
   * posición        20 %
   * señales         15 %
   * entidades       10 %
   * cifras          10 %
   * longitud         7 %
   * conector         3 %
   */
  const score =
    keywordScore * 0.35 +
    positionScore * 0.20 +
    signalScore * 0.15 +
    entityScore * 0.10 +
    numericScore * 0.10 +
    lengthScore * 0.07 +
    connectorScore * 0.03;

  return {
    sentence,
    index,
    score,
    details: {
      keyword: Number(
        keywordScore.toFixed(4)
      ),
      position: Number(
        positionScore.toFixed(4)
      ),
      signals: Number(
        signalScore.toFixed(4)
      ),
      entities: Number(
        entityScore.toFixed(4)
      ),
      numeric: Number(
        numericScore.toFixed(4)
      ),
      length: Number(
        lengthScore.toFixed(4)
      )
    }
  };
}

function sentenceSimilarity(
  sentenceA,
  sentenceB
) {
  const wordsA =
    new Set(
      extractWords(
        sentenceA
      )
    );

  const wordsB =
    new Set(
      extractWords(
        sentenceB
      )
    );

  if (
    wordsA.size === 0 ||
    wordsB.size === 0
  ) {
    return 0;
  }

  let intersection = 0;

  for (const word of wordsA) {
    if (wordsB.has(word)) {
      intersection += 1;
    }
  }

  const union =
    new Set([
      ...wordsA,
      ...wordsB
    ]).size;

  if (union === 0) {
    return 0;
  }

  return (
    intersection /
    union
  );
}

function selectSentences(
  scoredSentences,
  maxSentences
) {
  const selected = [];

  const ordered =
    [...scoredSentences].sort(
      (a, b) =>
        b.score - a.score
    );

  for (
    const candidate of
      ordered
  ) {
    if (
      selected.length >=
      maxSentences
    ) {
      break;
    }

    let redundant = false;

    for (
      const previous of
        selected
    ) {
      const similarity =
        sentenceSimilarity(
          candidate.sentence,
          previous.sentence
        );

      /*
       * 0.72+ significa que las dos
       * oraciones aportan prácticamente
       * el mismo contenido.
       */
      if (
        similarity >= 0.72
      ) {
        redundant = true;
        break;
      }
    }

    if (!redundant) {
      selected.push(
        candidate
      );
    }
  }

  /*
   * Mantener la secuencia narrativa original.
   */
  return selected.sort(
    (a, b) =>
      a.index - b.index
  );
}

function trimToSentenceBoundary(
  text,
  maxLength
) {
  if (
    !text ||
    text.length <= maxLength
  ) {
    return text;
  }

  const shortened =
    text.slice(
      0,
      maxLength
    );

  const lastBoundary =
    Math.max(
      shortened.lastIndexOf('.'),
      shortened.lastIndexOf('!'),
      shortened.lastIndexOf('?')
    );

  if (
    lastBoundary >=
    Math.floor(
      maxLength * 0.55
    )
  ) {
    return shortened
      .slice(
        0,
        lastBoundary + 1
      )
      .trim();
  }

  return `${shortened.trim()}…`;
}

export function generateSummary(
  text,
  maxSentences = 3,
  maxLength = 1500
) {
  const normalized =
    normalizeText(text);

  if (!normalized) {
    return '';
  }

  const sentences =
    splitSentences(
      normalized
    );

  if (
    sentences.length === 0
  ) {
    return trimToSentenceBoundary(
      normalized,
      maxLength
    );
  }

  if (
    sentences.length <=
    maxSentences
  ) {
    return trimToSentenceBoundary(
      sentences.join(' '),
      maxLength
    );
  }

  const frequency =
    calculateWordFrequency(
      normalized
    );

  const maxFrequency =
    calculateMaxFrequency(
      frequency
    );

  const scored =
    sentences.map(
      (
        sentence,
        index
      ) =>
        scoreSentence(
          sentence,
          index,
          sentences.length,
          frequency,
          maxFrequency
        )
    );

  const selected =
    selectSentences(
      scored,
      maxSentences
    );

  return trimToSentenceBoundary(
    selected
      .map(
        (item) =>
          item.sentence
      )
      .join(' '),
    maxLength
  );
}

export function generateShortSummary(
  text
) {
  return generateSummary(
    text,
    1,
    500
  );
}

export function generateLongSummary(
  text,
  maxSentences = 4
) {
  return generateSummary(
    text,
    maxSentences,
    1500
  );
}

export function scoreTextSentences(
  text
) {
  const normalized =
    normalizeText(text);

  if (!normalized) {
    return [];
  }

  const sentences =
    splitSentences(
      normalized
    );

  const frequency =
    calculateWordFrequency(
      normalized
    );

  const maxFrequency =
    calculateMaxFrequency(
      frequency
    );

  return sentences.map(
    (
      sentence,
      index
    ) =>
      scoreSentence(
        sentence,
        index,
        sentences.length,
        frequency,
        maxFrequency
      )
  );
}

export function getSummaryStats(
  text
) {
  const normalized =
    normalizeText(text);

  const sentences =
    splitSentences(
      normalized
    );

  const words =
    extractWords(
      normalized
    );

  return {
    characters:
      normalized.length,

    words:
      words.length,

    sentences:
      sentences.length,

    average_sentence_words:
      sentences.length > 0
        ? Number(
            (
              words.length /
              sentences.length
            ).toFixed(2)
          )
        : 0
  };
  }
