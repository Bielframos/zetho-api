/**
 * Converte uma string arbitrária em um slug padronizado, seguro para URLs:
 * - Converte para minúsculas
 * - Remove acentos e diacríticos
 * - Substitui caracteres especiais, pontuações e espaços por hífen
 * - Remove hífens repetidos ou nas extremidades
 * - Trunca para o tamanho máximo especificado
 */
export function slugify(text: string, maxLength = 200): string {
  if (!text) return '';

  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.slice(0, maxLength).replace(/-+$/, '');
}
