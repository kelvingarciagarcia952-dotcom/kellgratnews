import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import {
  generateShortSummary,
  generateLongSummary
} from './summarize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const INPUT_FILE = path.join(
  rootDir,
  'web',
  'news.json'
);

const OUTPUT_FILE = INPUT_FILE;

const MIN_TITLE_LENGTH = 8;
const MIN_TEXT_LENGTH = 20;
const SUMMARY_MAX_LENGTH = 1500;

const CATEGORY_RULES = {
  inteligencia_artificial: [
    'ia',
    'inteligencia artificial',
    'artificial intelligence',
    'ai',
    'machine learning',
    'deep learning',
    'generative ai',
    'generative artificial intelligence',
    'llm',
    'modelo de lenguaje',
    'language model',
    'chatgpt',
    'gpt',
    'gemini',
    'claude',
    'deepseek',
    'qwen',
    'copilot',
    'openai',
    'anthropic',
    'nvidia ai',
    'agentic ai',
    'agente de ia'
  ],

  semiconductores: [
    'semiconductor',
    'semiconductores',
    'chip',
    'chips',
    'soc',
    'cpu',
    'gpu',
    'npu',
    'dram',
    'sram',
    'nand',
    'flash',
    'lpddr',
    'lpddr5',
    'lpddr5x',
    'lpddr6',
    'ddr5',
    'wafer',
    'fab',
    'foundry',
    'tsmc',
    'samsung semiconductor',
    'sk hynix',
    'micron',
    'cxmt',
    'smic',
    'intel foundry',
    'process node',
    'nm process',
    '3nm',
    '2nm',
    '1.4nm'
  ],

  moviles: [
    'smartphone',
    'smartphones',
    'telefono',
    'teléfono',
    'mobile phone',
    'android',
    'ios',
    'iphone',
    'ipad',
    'xiaomi',
    'huawei',
    'honor',
    'samsung galaxy',
    'pixel',
    'oneplus',
    'oppo',
    'vivo',
    'redmi',
    'mate',
    'pura',
    'watch',
    'smartwatch',
    'tablet',
    'tableta'
  ],

  hardware: [
    'hardware',
    'motherboard',
    'placa base',
    'ram',
    'ssd',
    'nvme',
    'hdd',
    'monitor',
    'display',
    'oled',
    'amoled',
    'qled',
    'mini-led',
    'keyboard',
    'teclado',
    'mouse',
    'raton',
    'ratón',
    'laptop',
    'portatil',
    'portátil',
    'desktop',
    'pc',
    'procesador',
    'processor',
    'ryzen',
    'intel core',
    'radeon',
    'geforce'
  ],

  baterias_energia: [
    'battery',
    'batteries',
    'batería',
    'baterias',
    'baterías',
    'lithium',
    'litio',
    'sodium-ion',
    'ion sodio',
    'sodio-ion',
    'solid-state battery',
    'batería de estado sólido',
    'energy density',
    'densidad energética',
    'wh/kg',
    'kwh',
    'megawatt',
    'gigawatt',
    'storage',
    'almacenamiento energético',
    'catl',
    'byd',
    'blade battery',
    'naxtra'
  ],

  vehiculos_energia: [
    'electric vehicle',
    'electric vehicles',
    'vehículo eléctrico',
    'vehiculos electricos',
    'vehículos eléctricos',
    'ev',
    'bev',
    'hybrid',
    'híbrido',
    'hybrid vehicle',
    'car',
    'cars',
    'coche',
    'coches',
    'auto',
    'automóvil',
    'automovil',
    'motorcycle',
    'motocicleta',
    'byd',
    'tesla',
    'xiaomi su7',
    'zeekr',
    'nio',
    'xpeng'
  ],

  software_internet: [
    'software',
    'app',
    'application',
    'aplicación',
    'aplicacion',
    'browser',
    'navegador',
    'chrome',
    'firefox',
    'edge',
    'windows',
    'linux',
    'macos',
    'operating system',
    'sistema operativo',
    'github',
    'cloud',
    'nube',
    'internet',
    'web',
    'cybersecurity',
    'ciberseguridad',
    'security',
    'seguridad',
    'privacy',
    'privacidad',
    'database',
    'base de datos'
  ],

  militar: [
    'militar',
    'military',
    'guerra',
    'war',
    'conflicto',
    'conflict',
    'missile',
    'misil',
    'drone',
    'drones',
    'uav',
    'fighter',
    'caza',
    'tank',
    'tanque',
    'artillery',
    'artillería',
    'navy',
    'armada',
    'army',
    'ejército',
    'defense',
    'defence',
    'defensa',
    'weapon',
    'arma',
    'weapons',
    'otan',
    'nato'
  ],

  tecnologia: [
    'technology',
    'tecnología',
    'tecnologia',
    'tech',
    'innovation',
    'innovación',
    'device',
    'dispositivo',
    'gadget',
    'research',
    'investigación',
    'investigacion',
    'science',
    'ciencia',
    'electronics',
    'electrónica',
    'electronica'
  ],

  actualidad: [
    'news',
    'noticias',
    'actualidad',
    'politics',
    'política',
    'politica',
    'economy',
    'economía',
    'economia',
    'government',
    'gobierno',
    'president',
    'presidente',
    'international',
    'internacional'
  ]
};

const CLICKBAIT_PATTERNS = [
  /\bno podrás creer\b/i,
  /\bno vas a creer\b/i,
  /\bte dejará sin palabras\b/i,
  /\bte va a sorprender\b/i,
  /\bnadie esperaba\b/i,
  /\besto lo cambia todo\b/i,
  /\bcambia todo\b/i,
  /\bse acabó\b/i,
  /\bgame changer\b/i,
  /\bgame-changer\b/i,
  /\bshock\b/i,
  /\bimpresionante\b/i,
  /\bincreíble\b/i,
  /\bincreible\b/i,
  /\bbomba\b/i,
  /\bescándalo\b/i,
  /\bescandalo\b/i,
  /\búltima hora\b/i,
  /\bultima hora\b/i,
  /\bbreaking\b/i,
  /\burgent\b/i,
  /\burgente\b/i,
  /\bsecret[oa]?\b/i,
  /\brevelado\b/i,
  /\brevealed\b/i,
  /\bwhat happens next\b/i,
  /\byou won't believe\b/i,
  /\byou won.?t believe\b/i,
  /\bshocking\b/i
];

const SPAM_PATTERNS = [
  /\bcasino\b/i,
  /\bbetting\b/i,
  /\bapuesta\b/i,
  /\bapostar\b/i,
  /\bbono gratis\b/i,
  /\bganar dinero\b/i,
  /\bearn money\b/i,
  /\bmake money fast\b/i,
  /\bpromo code\b/i,
  /\bcoupon\b/i,
  /\bdescuento exclusivo\b/i,
  /\bclick here\b/i,
  /\bhaz clic aquí\b/i,
  /\bsubscribe now\b/i,
  /\bsuscríbete ahora\b/i,
  /\bfree giveaway\b/i,
  /\bgiveaway\b/i,
  /\bviagra\b/i,
  /\bcrypto giveaway\b/i
];

const FACTUAL_SIGNAL_PATTERNS = [
  /\bsegún\b/i,
  /\baccording to\b/i,
  /\breported by\b/i,
  /\breports?\b/i,
  /\bfuente[s]?\b/i,
  /\bstudy\b/i,
  /\bestudio\b/i,
  /\bresearch\b/i,
  /\binvestigación\b/i,
  /\binvestigacion\b/i,
  /\bdata\b/i,
  /\bdato[s]?\b/i,
  /\bdocuments?\b/i,
  /\bdocumentos?\b/i,
  /\bofficial\b/i,
  /\boficial\b/i,
  /\bannounced\b/i,
  /\banunció\b/i,
  /\banuncio\b/i,
  /\bconfirmed\b/i,
  /\bconfirmó\b/i,
  /\bconfirmado\b/i
];

const OPINION_PATTERNS = [
  /\bi think\b/i,
  /\bcreo que\b/i,
  /\bpienso que\b/i,
  /\bmy opinion\b/i,
  /\ben mi opinión\b/i,
  /\ben mi opinion\b/i,
  /\bwe think\b/i,
  /\bpodría ser\b/i,
  /\bpodria ser\b/i,
  /\bit may be\b/i,
  /\bit could be\b/i,
  /\bperhaps\b/i,
  /\bquizás\b/i,
  /\bquizas\b/i
];

const KNOWN_ENTITIES = [
  'Huawei',
  'Xiaomi',
  'Samsung',
  'Apple',
  'Google',
  'OpenAI',
  'Microsoft',
  'Meta',
  'NVIDIA',
  'AMD',
  'Intel',
  'TSMC',
  'Micron',
  'SK hynix',
  'CXMT',
  'SMIC',
  'BYD',
  'CATL',
  'Tesla',
  'Qualcomm',
  'MediaTek',
  'DeepSeek',
  'Qwen',
  'Gemini',
  'ChatGPT',
  'Claude',
  'GitHub',
  'Android',
  'iPhone',
  'Redmi',
  'Honor',
  'OnePlus',
  'OPPO',
  'Vivo',
  'BBC',
  'Xataka',
  'Genbeta',
  'Wccftech',
  'TechInsights'
];

const COMPANY_PATTERNS = [
  /\b[A-Z][A-Za-z0-9&.-]{1,30}\s+(?:Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|Co\.?|Company)\b/g,
  /\b[A-Z][A-Za-z0-9&.-]{1,30}\s+(?:Technologies|Technology|Semiconductor|Semiconductors)\b/g
];

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(
      file,
      'utf-8'
    )
  );
}

function safeText(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
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

function tokenize(text) {
  return normalizeText(text)
    .split(' ')
    .filter(
      (token) =>
        token.length >= 3
    );
}

function unique(values) {
  return [...new Set(values)];
}

function countMatches(
  text,
  patterns
) {
  let count = 0;

  for (
    const pattern of patterns
  ) {
    if (
      pattern.test(text)
    ) {
      count += 1;
    }
  }

  return count;
}

function detectLanguage(
  text,
  declaredLanguage
) {
  const value =
    normalizeText(text);

  if (!value) {
    return (
      declaredLanguage ||
      'unknown'
    );
  }

  const spanishSignals = [
    ' el ',
    ' la ',
    ' los ',
    ' las ',
    ' de ',
    ' del ',
    ' una ',
    ' un ',
    ' que ',
    ' para ',
    ' con ',
    ' por ',
    ' noticias ',
    ' tecnologia ',
    ' bateria '
  ];

  const englishSignals = [
    ' the ',
    ' and ',
    ' of ',
    ' to ',
    ' in ',
    ' for ',
    ' with ',
    ' from ',
    ' this ',
    ' that ',
    ' technology ',
    ' battery ',
    ' chip '
  ];

  let esScore = 0;
  let enScore = 0;

  const padded =
    ` ${value} `;

  for (
    const signal of
      spanishSignals
  ) {
    if (
      padded.includes(
        signal
      )
    ) {
      esScore += 1;
    }
  }

  for (
    const signal of
      englishSignals
  ) {
    if (
      padded.includes(
        signal
      )
    ) {
      enScore += 1;
    }
  }

  if (
    esScore === 0 &&
    enScore === 0
  ) {
    return (
      declaredLanguage ||
      'unknown'
    );
  }

  return esScore >= enScore
    ? 'es'
    : 'en';
}

function detectCategories(news) {
  const text =
    normalizeText(
      [
        news.titulo,
        news.titulo_original,
        news.resumen_largo,
        news.texto_original
      ]
        .filter(Boolean)
        .join(' ')
    );

  const scores = {};

  for (
    const [
      category,
      terms
    ] of Object.entries(
      CATEGORY_RULES
    )
  ) {
    let score = 0;

    for (
      const term of terms
    ) {
      const normalizedTerm =
        normalizeText(
          term
        );

      if (
        normalizedTerm &&
        text.includes(
          normalizedTerm
        )
      ) {
        score +=
          normalizedTerm.includes(
            ' '
          )
            ? 2
            : 1;
      }
    }

    if (
      score > 0
    ) {
      scores[category] =
        score;
    }
  }

  const ordered =
    Object.entries(
      scores
    ).sort(
      (a, b) =>
        b[1] - a[1]
    );

  if (
    ordered.length === 0
  ) {
    return {
      primary:
        news.categoria ||
        'tecnologia',
      secondary: [],
      scores: {}
    };
  }

  return {
    primary:
      ordered[0][0],

    secondary:
      ordered
        .slice(1, 4)
        .map(
          ([category]) =>
            category
        ),

    scores:
      Object.fromEntries(
        ordered
      )
  };
}

function detectEntities(text) {
  const source =
    safeText(text);

  const found = [];

  for (
    const entity of
      KNOWN_ENTITIES
  ) {
    const escaped =
      entity.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&'
      );

    const regex =
      new RegExp(
        `\\b${escaped}\\b`,
        'i'
      );

    if (
      regex.test(
        source
      )
    ) {
      found.push(
        entity
      );
    }
  }

  for (
    const pattern of
      COMPANY_PATTERNS
  ) {
    const matches =
      source.match(
        pattern
      ) || [];

    for (
      const match of
        matches
    ) {
      found.push(
        match.trim()
      );
    }
  }

  return unique(
    found
  ).slice(
    0,
    20
  );
}

function detectNumbers(text) {
  const value =
    safeText(text);

  const matches =
    value.match(
      /(?:\d+(?:[.,]\d+)?\s?(?:%|GB|TB|MB|GHz|MHz|W|Wh\/kg|mAh|nm|mm|kg|km|M|B|million|billion|millones|mil millones)|\$\s?\d+(?:[.,]\d+)?|€\s?\d+(?:[.,]\d+)?|\d{4})/gi
    ) || [];

  return unique(
    matches.map(
      (item) =>
        item.trim()
    )
  ).slice(
    0,
    20
  );
}

function detectClickbait(
  title,
  text
) {
  const combined =
    `${title} ${text}`;

  const matches =
    CLICKBAIT_PATTERNS.filter(
      (pattern) =>
        pattern.test(
          combined
        )
    );

  let score =
    Math.min(
      100,
      matches.length *
        25
    );

  const uppercaseLetters =
    (
      combined.match(
        /[A-ZÁÉÍÓÚÑ]/g
      ) || []
    ).length;

  const letters =
    (
      combined.match(
        /[A-Za-zÁÉÍÓÚÑáéíóúñ]/g
      ) || []
    ).length;

  if (
    letters >= 30 &&
    uppercaseLetters /
      letters >
      0.45
  ) {
    score += 15;
  }

  if (
    /!{2,}|\?{2,}/.test(
      title
    )
  ) {
    score += 15;
  }

  if (
    title.length < 20 &&
    /[!?]/.test(
      title
    )
  ) {
    score += 10;
  }

  score =
    Math.min(
      100,
      score
    );

  return {
    detected:
      score >= 35,

    score,

    signals:
      matches.map(
        (pattern) =>
          pattern.source
      )
  };
}

function detectSpam(text) {
  const matches =
    SPAM_PATTERNS.filter(
      (pattern) =>
        pattern.test(
          text
        )
    );

  const urlCount =
    (
      text.match(
        /https?:\/\//gi
      ) || []
    ).length;

  let score =
    matches.length *
    30;

  if (
    urlCount >= 4
  ) {
    score += 30;
  }

  if (
    text.length > 0 &&
    (
      text.match(
        /(?:€|\$)\s?\d+/g
      ) || []
    ).length >= 4
  ) {
    score += 25;
  }

  score =
    Math.min(
      100,
      score
    );

  return {
    detected:
      score >= 40,

    score,

    signals:
      matches.map(
        (pattern) =>
          pattern.source
      ),

    url_count:
      urlCount
  };
}

function detectContentType(
  title,
  text
) {
  const combined =
    `${title} ${text}`;

  const opinion =
    countMatches(
      combined,
      OPINION_PATTERNS
    );

  const factual =
    countMatches(
      combined,
      FACTUAL_SIGNAL_PATTERNS
    );

  if (
    opinion >= 2 &&
    opinion > factual
  ) {
    return 'opinion';
  }

  if (
    factual >= 1
  ) {
    return 'report';
  }

  return 'news';
}

function calculateReadability(
  text
) {
  const words =
    tokenize(text);

  const sentences =
    text
      .split(
        /[.!?]+/
      )
      .filter(
        (sentence) =>
          sentence.trim()
            .length > 0
      );

  if (
    words.length === 0 ||
    sentences.length === 0
  ) {
    return {
      words: 0,
      sentences: 0,
      average_words_per_sentence: 0
    };
  }

  return {
    words:
      words.length,

    sentences:
      sentences.length,

    average_words_per_sentence:
      Number(
        (
          words.length /
          sentences.length
        ).toFixed(2)
      )
  };
}

function calculateQuality(
  news,
  analysis,
  text
) {
  let score = 50;

  const title =
    safeText(
      news.titulo
    );

  if (
    title.length >=
      MIN_TITLE_LENGTH &&
    title.length <=
      180
  ) {
    score += 10;
  } else {
    score -= 5;
  }

  if (
    text.length >=
    150
  ) {
    score += 15;
  } else if (
    text.length >=
    60
  ) {
    score += 7;
  } else {
    score -= 10;
  }

  if (
    (analysis.entidades || []).length >=
    1
  ) {
    score += 5;
  }

  if (
    (analysis.cifras_detectadas || []).length >=
    1
  ) {
    score += 5;
  }

  if (
    analysis.content_type ===
    'report'
  ) {
    score += 8;
  }

  if (
    analysis.clickbait
      .detected
  ) {
    score -= Math.round(
      analysis.clickbait
        .score *
        0.25
    );
  }

  if (
    analysis.spam
      .detected
  ) {
    score -= 30;
  }

  const sourcePriority =
    Number(
      news.prioridad_fuente
    );

  if (
    Number.isFinite(
      sourcePriority
    )
  ) {
    score += Math.min(
      10,
      Math.max(
        -5,
        sourcePriority - 3
      ) * 2
    );
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(score)
    )
  );
}

function calculateRelevance(
  news,
  analysis
) {
  let score = 45;

  const title =
    normalizeText(
      news.titulo
    );

  const description =
    normalizeText(
      news.resumen_largo ||
      news.texto_original
    );

  const fullText =
    `${title} ${description}`;

  const importantEntities =
    (analysis.entidades || []).length;

  const categoryScore =
    Object.values(
      analysis.category_scores || {}
    ).reduce(
      (sum, value) =>
        sum + value,
      0
    );

  if (
    categoryScore >= 8
  ) {
    score += 20;
  } else if (
    categoryScore >= 4
  ) {
    score += 12;
  } else if (
    categoryScore >= 1
  ) {
    score += 5;
  }

  if (
    importantEntities >= 4
  ) {
    score += 15;
  } else if (
    importantEntities >= 2
  ) {
    score += 10;
  } else if (
    importantEntities === 1
  ) {
    score += 5;
  }

  if (
    FACTUAL_SIGNAL_PATTERNS.some(
      (pattern) =>
        pattern.test(
          fullText
        )
    )
  ) {
    score += 8;
  }

  if (
    analysis.spam
      .detected
  ) {
    score -= 30;
  }

  if (
    analysis.clickbait
      .score >= 75
  ) {
    score -= 15;
  } else if (
    analysis.clickbait
      .score >= 40
  ) {
    score -= 7;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(score)
    )
  );
}

function calculateReliability(
  news,
  analysis
) {
  let score = 50;

  const sourceLevel =
    safeText(
      news.nivel_fuente
    ).toLowerCase();

  if (
    sourceLevel.includes(
      'oficial'
    )
  ) {
    score += 25;
  } else if (
    sourceLevel.includes(
      'profesional'
    )
  ) {
    score += 20;
  } else if (
    sourceLevel.includes(
      'especializada'
    )
  ) {
    score += 15;
  } else if (
    sourceLevel.includes(
      'agregador'
    )
  ) {
    score += 3;
  } else if (
    sourceLevel.includes(
      'telegram'
    )
  ) {
    score -= 5;
  }

  if (
    analysis.content_type ===
    'report'
  ) {
    score += 10;
  }

  if (
    analysis.spam
      .detected
  ) {
    score -= 35;
  }

  if (
    analysis.clickbait
      .score >= 75
  ) {
    score -= 15;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(score)
    )
  );
}

function buildFingerprint(
  news
) {
  const source =
    normalizeText(
      news.fuente_id ||
      news.fuente_nombre
    );

  const title =
    normalizeText(
      news.titulo
    );

  return crypto
    .createHash(
      'sha256'
    )
    .update(
      `${source}|${title}`
    )
    .digest('hex');
}

function similarity(
  tokensA,
  tokensB
) {
  if (
    tokensA.length === 0 ||
    tokensB.length === 0
  ) {
    return 0;
  }

  const setA =
    new Set(tokensA);

  const setB =
    new Set(tokensB);

  let intersection = 0;

  for (
    const token of setA
  ) {
    if (
      setB.has(token)
    ) {
      intersection += 1;
    }
  }

  const union =
    new Set([
      ...setA,
      ...setB
    ]).size;

  if (
    union === 0
  ) {
    return 0;
  }

  return (
    intersection /
    union
  );
}

function detectDuplicates(
  items
) {
  const fingerprints =
    new Map();

  const tokenCache =
    new Map();

  for (
    let index = 0;
    index < items.length;
    index += 1
  ) {
    const item =
      items[index];

    item.__duplicate =
      null;

    const fingerprint =
      buildFingerprint(
        item
      );

    if (
      fingerprints.has(
        fingerprint
      )
    ) {
      const original =
        fingerprints.get(
          fingerprint
        );

      item.__duplicate = {
        detected: true,
        type: 'exact',
        similar_to:
          original
      };

      continue;
    }

    fingerprints.set(
      fingerprint,
      index
    );

    tokenCache.set(
      index,
      tokenize(
        `${item.titulo} ${
          item.resumen_largo ||
          ''
        }`
      )
    );
  }

  for (
    let index = 0;
    index < items.length;
    index += 1
  ) {
    if (
      items[index]
        .__duplicate
    ) {
      continue;
    }

    const currentTokens =
      tokenCache.get(
        index
      ) || [];

    let bestSimilarity = 0;
    let bestIndex = -1;

    for (
      let previous = 0;
      previous < index;
      previous += 1
    ) {
      if (
        items[previous]
          .__duplicate
      ) {
        continue;
      }

      const previousTokens =
        tokenCache.get(
          previous
        ) || [];

      const score =
        similarity(
          currentTokens,
          previousTokens
        );

      if (
        score >
        bestSimilarity
      ) {
        bestSimilarity =
          score;

        bestIndex =
          previous;
      }
    }

    if (
      bestSimilarity >= 0.78 &&
      bestIndex >= 0
    ) {
      items[index]
        .__duplicate = {
        detected: true,
        type: 'similar',
        similarity:
          Number(
            bestSimilarity.toFixed(
              3
            )
          ),
        similar_to:
          bestIndex
      };
    }
  }
}

function classifyDuplicate(
  duplicate
) {
  if (
    !duplicate ||
    !duplicate.detected
  ) {
    return {
      detected: false,
      type: null,
      similarity: 0,
      similar_to: null
    };
  }

  return {
    detected: true,
    type:
      duplicate.type ||
      'similar',
    similarity:
      Number(
        duplicate.similarity ||
        1
      ),
    similar_to:
      duplicate.similar_to
  };
}

/*
 * ------------------------------------------------------------
 * GENERACIÓN DEL RESUMEN
 * ------------------------------------------------------------
 *
 * fetch-news.js ya produce un resumen inicial traducido.
 * Aquí lo refinamos usando summarize.js.
 *
 * Prioridad:
 *
 * 1. resumen_largo traducido
 * 2. resumen_corto traducido
 * 3. texto_original como último recurso
 *
 * De esta forma no reemplazamos automáticamente
 * el contenido traducido por texto original en inglés.
 */
function regenerateSummaries(
  news
) {
  const translatedText =
    safeText(
      news.resumen_largo ||
      news.resumen_corto
    );

  const originalText =
    safeText(
      news.texto_original
    );

  const sourceText =
    translatedText ||
    originalText;

  if (!sourceText) {
    return {
      short:
        safeText(
          news.titulo
        ),

      long:
        safeText(
          news.titulo
        ),

      generated: false,

      input_language:
        news.idioma_original ||
        'unknown'
    };
  }

  let short =
    generateShortSummary(
      sourceText
    );

  let long =
    generateLongSummary(
      sourceText,
      4
    );

  /*
   * Si el motor no encuentra suficiente
   * información, conservamos el resultado
   * anterior en lugar de degradarlo.
   */
  if (!short) {
    short =
      safeText(
        news.resumen_corto ||
        news.titulo
      );
  }

  if (!long) {
    long =
      safeText(
        news.resumen_largo ||
        short ||
        news.titulo
      );
  }

  return {
    short:
      short.slice(
        0,
        500
      ),

    long:
      long.slice(
        0,
        SUMMARY_MAX_LENGTH
      ),

    generated: true,

    input_language:
      translatedText
        ? 'translated'
        : (
            news.idioma_original ||
            'unknown'
          )
  };
}

function analyzeNews(
  news,
  index
) {
  /*
   * Primero refinamos el resumen.
   */
  const summaries =
    regenerateSummaries(
      news
    );

  news.resumen_corto =
    summaries.short;

  news.resumen_largo =
    summaries.long;

  const title =
    safeText(
      news.titulo
    );

  const originalTitle =
    safeText(
      news.titulo_original
    );

  const shortSummary =
    safeText(
      news.resumen_corto
    );

  const longSummary =
    safeText(
      news.resumen_largo
    );

  const originalText =
    safeText(
      news.texto_original
    );

  const text = [
    title,
    originalTitle,
    shortSummary,
    longSummary,
    originalText
  ]
    .filter(Boolean)
    .join(' ')
    .slice(
      0,
      15000
    );

  const detectedLanguage =
    detectLanguage(
      text,
      news.idioma_original
    );

  const categories =
    detectCategories(
      news
    );

  const entities =
    detectEntities(
      text
    );

  const numbers =
    detectNumbers(
      text
    );

  const clickbait =
    detectClickbait(
      title,
      text
    );

  const spam =
    detectSpam(
      text
    );

  const contentType =
    detectContentType(
      title,
      text
    );

  const readability =
    calculateReadability(
      text
    );

  const analysis = {
    version: 2,

    processed_at:
      new Date().toISOString(),

    index,

    resumen: {
      generado:
        summaries.generated,

      origen:
        summaries.input_language
    },

    idioma_detectado:
      detectedLanguage,

    idioma_original:
      news.idioma_original ||
      detectedLanguage,

    categoria:
      categories.primary,

    categorias_secundarias:
      categories.secondary,

    category_scores:
      categories.scores,

    entidades:
      entities,

    cifras_detectadas:
      numbers,

    content_type:
      contentType,

    clickbait: {
      detected:
        clickbait.detected,

      score:
        clickbait.score,

      signals:
        clickbait.signals
    },

    spam: {
      detected:
        spam.detected,

      score:
        spam.score,

      signals:
        spam.signals,

      url_count:
        spam.url_count
    },

    calidad: 0,

    relevancia: 0,

    confiabilidad_fuente: 0,

    readability,

    duplicate: {
      detected: false,
      type: null,
      similarity: 0,
      similar_to: null
    }
  };

  analysis.calidad =
    calculateQuality(
      news,
      analysis,
      text
    );

  analysis.relevancia =
    calculateRelevance(
      news,
      analysis
    );

  analysis.confiabilidad_fuente =
    calculateReliability(
      news,
      analysis
    );

  return analysis;
}

function validateNewsObject(
  news,
  index
) {
  if (
    !news ||
    typeof news !== 'object'
  ) {
    return {
      valid: false,

      reason:
        `item ${index} no es un objeto`
    };
  }

  const title =
    safeText(
      news.titulo
    );

  if (
    title.length <
    MIN_TITLE_LENGTH
  ) {
    return {
      valid: false,

      reason:
        `item ${index} tiene título demasiado corto`
    };
  }

  const hasText =
    [
      news.resumen_corto,
      news.resumen_largo,
      news.texto_original
    ].some(
      (value) =>
        safeText(
          value
        ).length >=
        MIN_TEXT_LENGTH
    );

  if (
    !hasText
  ) {
    return {
      valid: false,

      reason:
        `item ${index} no tiene contenido suficiente`
    };
  }

  return {
    valid: true,
    reason: null
  };
}

function readExistingData() {
  if (
    !fs.existsSync(
      INPUT_FILE
    )
  ) {
    throw new Error(
      `No existe ${INPUT_FILE}`
    );
  }

  const data =
    readJson(
      INPUT_FILE
    );

  if (
    !data ||
    !Array.isArray(
      data.items
    )
  ) {
    throw new Error(
      'web/news.json no contiene un array items válido'
    );
  }

  return data;
}

function writeAtomically(
  file,
  data
) {
  const temporary =
    `${file}.tmp`;

  fs.writeFileSync(
    temporary,
    JSON.stringify(
      data,
      null,
      2
    ),
    'utf-8'
  );

  fs.renameSync(
    temporary,
    file
  );
}

function main() {
  console.log(
    '=== KellgreatNews — Article Analyzer v2 ==='
  );

  const data =
    readExistingData();

  const validItems = [];

  let rejected = 0;

  for (
    let index = 0;
    index < data.items.length;
    index += 1
  ) {
    const item =
      data.items[index];

    const validation =
      validateNewsObject(
        item,
        index
      );

    if (
      !validation.valid
    ) {
      console.warn(
        `  descartada: ${validation.reason}`
      );

      rejected += 1;

      continue;
    }

    validItems.push({
      ...item
    });
  }

  if (
    validItems.length === 0
  ) {
    console.warn(
      'No existen noticias válidas para analizar.'
    );

    return;
  }

  /*
   * Detectamos duplicados antes del análisis
   * para que el resultado quede registrado
   * en cada noticia.
   */
  detectDuplicates(
    validItems
  );

  for (
    let index = 0;
    index < validItems.length;
    index += 1
  ) {
    const item =
      validItems[index];

    const analysis =
      analyzeNews(
        item,
        index
      );

    analysis.duplicate =
      classifyDuplicate(
        item.__duplicate
      );

    delete item.__duplicate;

    item.analisis =
      analysis;
  }

  const duplicateCount =
    validItems.filter(
      (item) =>
        item.analisis
          ?.duplicate
          ?.detected
    ).length;

  const clickbaitCount =
    validItems.filter(
      (item) =>
        item.analisis
          ?.clickbait
          ?.detected
    ).length;

  const spamCount =
    validItems.filter(
      (item) =>
        item.analisis
          ?.spam
          ?.detected
    ).length;

  const generatedSummaryCount =
    validItems.filter(
      (item) =>
        item.analisis
          ?.resumen
          ?.generado
    ).length;

  const averageQuality =
    Math.round(
      validItems.reduce(
        (sum, item) =>
          sum +
          Number(
            item.analisis
              ?.calidad || 0
          ),
        0
      ) /
        validItems.length
    );

  const averageRelevance =
    Math.round(
      validItems.reduce(
        (sum, item) =>
          sum +
          Number(
            item.analisis
              ?.relevancia || 0
          ),
        0
      ) /
        validItems.length
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

    analyzed_at:
      new Date().toISOString(),

    analysis_stats: {
      input_items:
        data.items.length,

      valid_items:
        validItems.length,

      rejected_items:
        rejected,

      duplicate_items:
        duplicateCount,

      clickbait_items:
        clickbaitCount,

      spam_items:
        spamCount,

      summaries_generated:
        generatedSummaryCount,

      average_quality:
        averageQuality,

      average_relevance:
        averageRelevance
    },

    items:
      validItems
  };

  writeAtomically(
    OUTPUT_FILE,
    output
  );

  console.log(
    `Noticias analizadas: ${validItems.length}`
  );

  console.log(
    `Descartadas: ${rejected}`
  );

  console.log(
    `Duplicados detectados: ${duplicateCount}`
  );

  console.log(
    `Clickbait detectado: ${clickbaitCount}`
  );

  console.log(
    `Spam detectado: ${spamCount}`
  );

  console.log(
    `Resúmenes regenerados: ${generatedSummaryCount}`
  );

  console.log(
    `Calidad media: ${averageQuality}/100`
  );

  console.log(
    `Relevancia media: ${averageRelevance}/100`
  );

  console.log(
    'Análisis completado correctamente.'
  );
}

try {
  main();
} catch (error) {
  console.error(
    `Error fatal en analyze-news.js: ${error.message}`
  );
  process.exit(1);
}

