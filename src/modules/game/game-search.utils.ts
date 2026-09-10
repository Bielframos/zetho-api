/** Shared by ingestion, backfill and queries. Dots/apostrophes join letters. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[.'’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function extractKeywords(text: string): string[] {
  return [...new Set(normalizeText(text).split(' ').filter(Boolean))];
}

/** Prefixes are materialized once, avoiding substring scans on every request. */
export function buildSearchFields(name: string, aliases: string[] = []) {
  const terms = new Set<string>();
  const add = (word: string) => {
    for (let length = 1; length <= Math.min(word.length, 128); length++) {
      terms.add(word.slice(0, length));
    }
  };
  for (const title of [name, ...aliases].flatMap((title) => [
    title,
    ...title.split(/[:：]/),
  ])) {
    const words = normalizeText(title).split(' ').filter(Boolean);
    words.forEach(add);
    // Franchise initials remain searchable when a subtitle/sequel is appended.
    for (const sequence of [
      words,
      words[0] === 'the' ? words.slice(1) : words,
      words.filter((w) => !['the', 'of', 'a', 'an', 'and'].includes(w)),
    ]) {
      for (let end = 2; end <= sequence.length; end++) {
        const initials = sequence
          .slice(0, end)
          .map((w) => (/^\d+$/.test(w) ? w : w[0]))
          .join('');
        if (initials.length >= 2) terms.add(initials.slice(0, 128));
      }
    }
  }
  return {
    searchName: normalizeText(name),
    searchTerms: [...terms].sort(),
    searchAliases: aliases,
  };
}

export function companySearchFields(game: {
  involved_companies?: {
    developer?: boolean;
    publisher?: boolean;
    company: { id: number };
  }[];
}) {
  if (!game.involved_companies) return {};
  const ids = (role: 'developer' | 'publisher') => [
    ...new Set(
      game
        .involved_companies!.filter((item) => item[role] && item.company?.id)
        .map((item) => `igdb_${item.company.id}`),
    ),
  ];
  return { developerIds: ids('developer'), publisherIds: ids('publisher') };
}

/** Encoded tokens avoid stemming, stop words and the full-text minimum word length. */
export function searchToken(value: string): string {
  return `zt${Buffer.from(value, 'utf8').toString('hex')}`;
}

export function buildSearchDocument(
  name: string,
  aliases: string[] = [],
  developerIds: string[] = [],
  publisherIds: string[] = [],
) {
  const { searchTerms, ...fields } = buildSearchFields(name, aliases);
  return {
    ...fields,
    searchText: [
      ...searchTerms.map(searchToken),
      ...developerIds.map((id) => searchToken(`developer:${id}`)),
      ...publisherIds.map((id) => searchToken(`publisher:${id}`)),
    ].join(' '),
  };
}
