/**
 * Predicado único de indexabilidade de página de jogo.
 *
 * Precisa ser o mesmo consumido pelo frontend (meta `robots`) e pelo
 * SitemapService. Se divergirem — sitemap dizendo "indexe" e a página dizendo
 * "noindex" — o Google trata como sinal contraditório e penaliza.
 *
 * Regra: uma página de jogo só é indexável quando tem conteúdo original. O
 * único texto de um jogo sem review é o `summary` do IGDB, idêntico ao de
 * IGDB, Steam e Metacritic — indexar isso é publicar conteúdo duplicado em
 * escala.
 */
export const MIN_TEXT_REVIEWS_FOR_INDEX = 1;

export type GameSeoFlags = {
  /** Quantidade de reviews com corpo de texto não vazio. */
  textReviewCount: number;
  /** Se a página deve receber `index,follow` e entrar no sitemap. */
  indexable: boolean;
};

/** Chave de cache da contagem, compartilhada com quem precisa invalidá-la. */
export function textReviewCountCacheKey(gameId: string) {
  return `game:textReviews:${gameId}`;
}

export function buildGameSeoFlags(textReviewCount: number): GameSeoFlags {
  return {
    textReviewCount,
    indexable: textReviewCount >= MIN_TEXT_REVIEWS_FOR_INDEX,
  };
}
