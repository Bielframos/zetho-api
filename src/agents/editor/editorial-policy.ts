export type EditorialCandidate = {
  title: string;
  description?: string;
  content?: string;
  link: string;
};
export type EditorialDecision = {
  eligible: boolean;
  category: string;
  reason: string;
};

/** Cheap, auditable rejection before model calls; semantic decisions still use the policy prompt. */
export function obviousEditorialRejection(
  post: EditorialCandidate,
): EditorialDecision | null {
  const title = post.title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const rules: [string, RegExp][] = [
    ['review', /\b(review|reviews|reviewed|analise|veredito)\b/],
    [
      'prices_promotions',
      /\b(deals?|discounts?|sale|sales event|black friday|prime day|lowest price|price cut|price hike|price increase|preco|precos|promocao|promocoes|desconto|descontos|ofertas?)\b|\$\d/,
    ],
    [
      'market',
      /\b(revenue|earnings|stock price|shareholders?|acquisition|layoffs?|market share|financial|lucro|receita financeira|acoes|demissoes|aquisicao)\b/,
    ],
  ];
  for (const [category, pattern] of rules) {
    if (pattern.test(title))
      return {
        eligible: false,
        category,
        reason: `Primary title subject matches excluded category: ${category}`,
      };
  }
  return null;
}
