import { JSDOM } from 'jsdom';

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
    [
      'guide',
      /^(everything you need to know|tudo (?:o )?que voce precisa saber)\b/,
    ],
    ['podcast', /\bpodcast\s+(?:episode|episodio|#)\s*\d/],
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

export function normalizeEditorialDecision(value: unknown): EditorialDecision {
  const decision = value as Partial<EditorialDecision> | null;
  if (
    !decision ||
    typeof decision.eligible !== 'boolean' ||
    typeof decision.category !== 'string' ||
    typeof decision.reason !== 'string' ||
    !decision.reason.trim()
  ) {
    return {
      eligible: false,
      category: 'invalid',
      reason: 'Insufficient editorial classification.',
    };
  }
  return {
    ...decision,
    eligible:
      decision.eligible &&
      [
        'announcement',
        'release_date',
        'trailer',
        'gameplay',
        'expansion',
        'update',
      ].includes(decision.category),
  } as EditorialDecision;
}

/** Conservative final gate: source eligibility does not authorize promotional copy. */
export function generatedEditorialIssues(article: {
  title?: string;
  subtitle?: string;
  body?: string;
  seo?: { title?: string; description?: string };
}): string[] {
  const markup = [
    article.title,
    article.subtitle,
    article.body,
    article.seo?.title,
    article.seo?.description,
  ]
    .filter(Boolean)
    .join(' ');
  const document = new JSDOM(markup).window.document;
  const text = (document.body.textContent ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const promotional =
    /\b(descontos?|promocao|promocoes|ofertas?|cupons?|cupom|cashback|discounts?|deals?|precos?)\b|(?:us\$|r\$|\$|€|£)\s*\d/;
  return promotional.test(text)
    ? [
        'O texto gerado contém preço ou promoção; requer revisão editorial antes de publicar.',
      ]
    : [];
}
