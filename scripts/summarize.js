// ============================================================
// KellgreatNews - Algoritmo de resumen extractivo
// ============================================================
// Este módulo contiene el algoritmo inteligente de resumen.
// Por ahora, fetch-news.js usa un método simple (primeras
// oraciones). Este módulo está listo para mejorarlo después.
// ============================================================

// Palabras comunes que no aportan significado al resumen
const STOPWORDS = new Set([
  // Inglés
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at',
  'to', 'for', 'of', 'with', 'by', 'and', 'or', 'but', 'that',
  'this', 'it', 'as', 'be', 'has', 'have', 'had', 'from', 'will',
  'would', 'could', 'should', 'may', 'might', 'can', 'not', 'no',
  'so', 'if', 'then', 'than', 'too', 'very', 'just', 'about',
  'up', 'out', 'into', 'over', 'after', 'before', 'between',
  'under', 'again', 'further', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few',
  'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same',
  'also', 'back', 'even', 'still', 'way', 'because', 'through',
  'during', 'above', 'below', 'while', 'until', 'against', 'among',
  // Español
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'es',
  'son', 'era', 'eran', 'en', 'de', 'del', 'al', 'a', 'por',
  'para', 'con', 'sin', 'y', 'o', 'u', 'pero', 'que', 'esto',
  'esta', 'ese', 'esa', 'lo', 'le', 'les', 'se', 'su', 'sus',
  'ha', 'han', 'hay', 'fue', 'ser', 'estar', 'tiene', 'tienen',
  'más', 'menos', 'muy', 'también', 'como', 'cuando', 'donde',
  'porque', 'aunque', 'si', 'no', 'sí', 'ya', 'desde', 'hasta'
]);

// Divide un texto en oraciones individuales
function splitSentences(text) {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20);
}

// Extrae palabras de un texto, ignorando stopwords
function extractWords(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\sáéíóúñü]/gi, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOPWORDS.has(word));
}

// Calcula la frecuencia de palabras en un texto
function calculateWordFrequency(text) {
  const words = extractWords(text);
  const frequency = {};
  for (const word of words) {
    frequency[word] = (frequency[word] || 0) + 1;
  }
  return frequency;
}

// Puntúa cada oración según la frecuencia de sus palabras
function scoreSentences(sentences, wordFrequency) {
  return sentences.map((sentence, index) => {
    const words = extractWords(sentence);
    let score = 0;
    for (const word of words) {
      if (wordFrequency[word]) {
        score += wordFrequency[word];
      }
    }
    // Normalizar por longitud para no favorecer oraciones muy largas
    const normalizedScore = words.length > 0 ? score / words.length : 0;
    return { sentence, index, score: normalizedScore };
  });
}

// Genera un resumen extractivo inteligente
export function generateSummary(text, maxSentences = 3) {
  if (!text || text.trim().length === 0) return '';

  const sentences = splitSentences(text);

  // Si hay pocas oraciones, devolverlas todas
  if (sentences.length <= maxSentences) {
    return sentences.join(' ');
  }

  // Calcular frecuencia de palabras en todo el texto
  const wordFrequency = calculateWordFrequency(text);

  // Puntuar cada oración
  const scoredSentences = scoreSentences(sentences, wordFrequency);

  // Ordenar por puntuación (mayor primero)
  const sorted = [...scoredSentences].sort((a, b) => b.score - a.score);

  // Tomar las mejores N oraciones
  const topSentences = sorted.slice(0, maxSentences);

  // Reordenar por posición original para mantener coherencia
  topSentences.sort((a, b) => a.index - b.index);

  return topSentences.map(item => item.sentence).join(' ');
}

// Genera un resumen corto (1 oración más relevante)
export function generateShortSummary(text) {
  return generateSummary(text, 1);
}

// Genera un resumen largo (3-4 oraciones más relevantes)
export function generateLongSummary(text, maxSentences = 4) {
  return generateSummary(text, maxSentences);
}

// Si se ejecuta directamente como script, muestra información de uso
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Módulo de resumen extractivo - KellgreatNews');
  console.log('Este módulo se usa desde fetch-news.js');
  console.log('Funciones disponibles: generateSummary, generateShortSummary, generateLongSummary');
    }
