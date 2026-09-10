import type { Models } from 'node-appwrite';
import type { IGDBGame } from './igdb.types';
import {
  buildSearchDocument,
  companySearchFields,
} from '../game/game-search.utils';

export const SEARCH_INDEX_VERSION = 1;
export type SearchGameRow = Models.Row & {
  name: string;
  slug: string;
  externalReference: number;
  syncStage?: string | null;
  coverUrl?: string | null;
  releaseYear?: string | null;
  releaseDate?: string | null;
  genres?: string[] | null;
  searchAliases?: string[];
  developerIds?: string[];
  publisherIds?: string[];
  searchIndexVersion?: number;
};

/** Only discovery fields are patched. User content, relationships and full data stay intact. */
export function buildSearchPatch(existing: SearchGameRow, source: IGDBGame) {
  const aliases = [
    ...new Set([
      ...(existing.searchAliases ?? []),
      ...(source.alternative_names ?? [])
        .map((alias) => alias.name)
        .filter(Boolean),
    ]),
  ];
  const patch: Record<string, unknown> = {
    ...buildSearchDocument(
      existing.name,
      aliases,
      source.involved_companies?.some(
        (item) => item.developer && item.company?.id,
      )
        ? companySearchFields(source).developerIds
        : existing.developerIds,
      source.involved_companies?.some(
        (item) => item.publisher && item.company?.id,
      )
        ? companySearchFields(source).publisherIds
        : existing.publisherIds,
    ),
    searchIndexVersion: SEARCH_INDEX_VERSION,
    syncStage: existing.syncStage === 'full' ? 'full' : 'search_ready',
  };
  if (!existing.coverUrl && source.cover?.image_id) {
    patch.coverUrl = `https://images.igdb.com/igdb/image/upload/t_cover_big/${source.cover.image_id}.jpg`;
  }
  if (source.involved_companies?.length) {
    const companies = companySearchFields(source);
    if (companies.developerIds?.length)
      patch.developerIds = companies.developerIds;
    if (companies.publisherIds?.length)
      patch.publisherIds = companies.publisherIds;
  }
  if (!existing.genres?.length && source.genres?.length) {
    patch.genres = source.genres.map((id) => `igdb_${id}`);
  }
  if (source.first_release_date && source.first_release_date > 0) {
    const date = new Date(source.first_release_date * 1000);
    if (!Number.isNaN(date.getTime())) {
      if (!existing.releaseDate) patch.releaseDate = date.toISOString();
      if (!existing.releaseYear)
        patch.releaseYear = String(date.getUTCFullYear());
    }
  }
  return patch;
}
