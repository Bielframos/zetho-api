/**
 * Normaliza uma string para comparação:
 * - Converte para minúsculas
 * - Remove acentos/diacríticos
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Converte um texto para slug (kebab-case):
 * - Normaliza e substitui espaços/underscores/hífens por um único hífen
 */
export function slugify(text: string): string {
  return normalizeText(text)
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Extrai keywords de um texto:
 * - Normaliza
 * - Faz split por espaços, hífens e underscores
 * - Remove tokens vazios e tokens com menos de 2 caracteres
 */
export function extractKeywords(text: string): string[] {
  return normalizeText(text)
    .split(/[\s\-_]+/)
    .filter((token) => token.length >= 2);
}

export interface ScoreInput {
  gameSlug: string;
  gameName: string;
  query: string;
  keywords: string[];
}

/**
 * Calcula o score de relevância de um resultado de busca.
 * Pontuação:
 *   +100 → nome exato (normalizado)
 *   +60  → todos os keywords presentes no slug
 *   +50  → name.startsWith(query)
 *   +40  → todos os keywords presentes no name (normalizado)
 *   +30  → name.includes(query)
 *   +10  → por cada keyword individualmente presente no name
 *   bônus → max(0, 10 - name.length / 20) para nomes curtos
 */
export function calculateScore(input: ScoreInput): number {
  const { gameSlug, gameName, query, keywords } = input;
  const normName = normalizeText(gameName);
  const normSlug = normalizeText(gameSlug);
  const normQuery = normalizeText(query);

  let score = 0;

  if (normName === normQuery) {
    score += 100;
  }

  if (keywords.length > 0 && keywords.every((kw) => normSlug.includes(kw))) {
    score += 60;
  }

  if (normName.startsWith(normQuery)) {
    score += 50;
  }

  if (keywords.length > 0 && keywords.every((kw) => normName.includes(kw))) {
    score += 40;
  }

  if (normName.includes(normQuery)) {
    score += 30;
  }

  for (const kw of keywords) {
    if (normName.includes(kw)) {
      score += 10;
    }
  }

  // Bônus para nomes curtos
  score += Math.max(0, 10 - gameName.length / 20);

  return score;
}
