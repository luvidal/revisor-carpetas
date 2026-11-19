/**
 * Lexical search with BM25, the classic ranking behind search engines: a term
 * counts more when it is rare across the policy (IDF) and when it repeats in a
 * chunk, with diminishing returns (k1) and a correction for long chunks (b).
 * Spanish text is folded (no accents, lower case), stopwords are dropped and
 * plurals reduced, so "liquidaciones" matches "liquidación".
 */

const STOPWORDS = new Set(
  (
    'a al algo algun alguna algunas alguno algunos ante antes aun aunque cada como con cual cuales cuando de del desde donde dos el ella ellas ellos en entre era es esa esas ese eso esos esta estan estas este esto estos fue fueron ha han hasta hay la las le les lo los mas me mi mientras muy no nos o otra otras otro otros para pero poco por porque que quien se sea sean segun ser si sin sobre solo son su sus tambien tiene tienen todo todos tu un una unas uno unos y ya yo puede pueden debe deben esa este ese hace hago'
  ).split(' '),
)

/** "Liquidaciones" -> "liquidacion": accents off, lower case, plural stripped. */
export function normalizeToken(word: string): string {
  let w = word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (w.length > 4 && w.endsWith('ces')) w = `${w.slice(0, -3)}z`
  else if (w.length > 5 && /(ion|dad|or|al|il)es$/.test(w)) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  return w
}

export function tokenize(text: string): string[] {
  return (text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter(t => !STOPWORDS.has(t))
    .map(normalizeToken)
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
}

export type Bm25Index = { docs: string[][]; df: Map<string, number>; avgLength: number; k1: number; b: number }

export function buildBm25(texts: string[], k1 = 1.2, b = 0.75): Bm25Index {
  const docs = texts.map(tokenize)
  const df = new Map<string, number>()
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)
  const avgLength = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, docs.length)
  return { docs, df, avgLength, k1, b }
}

/** BM25 score of every document for the query, in document order. */
export function bm25Scores(index: Bm25Index, query: string): number[] {
  const terms = tokenize(query)
  const n = index.docs.length
  return index.docs.map(doc => {
    const tf = new Map<string, number>()
    for (const t of doc) tf.set(t, (tf.get(t) ?? 0) + 1)
    let score = 0
    for (const term of terms) {
      const f = tf.get(term) ?? 0
      if (!f) continue
      const df = index.df.get(term) ?? 0
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5))
      score += (idf * f * (index.k1 + 1)) / (f + index.k1 * (1 - index.b + (index.b * doc.length) / index.avgLength))
    }
    return score
  })
}
