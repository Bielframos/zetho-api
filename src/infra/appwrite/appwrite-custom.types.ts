import type { GamesSyncStage } from './appwrite';

// Payloads de escrita não são emitidos por `appwrite types`.
export type GamesCreate = {
  searchName?: string;
  searchText?: string;
  searchAliases?: string[];
  searchIndexVersion?: number;
  developerIds?: string[];
  publisherIds?: string[];
  name: string;
  slug: string;
  coverUrl?: string | null;
  releaseYear?: string | null;
  summary?: string | null;
  externalReference: number;
  gameType?: string | null;
  similarGames?: string[] | null;
  checksum?: string | null;
  releaseDate?: string | null;
  involvedCompanies?: string[];
  zStats?: string;
  ratingAvg?: number;
  ratingCount?: number;
  ratingSum?: number;
  genres?: string[] | null;
  hypes?: number | null;
  zethoVersion?: number;
  syncStage?: GamesSyncStage | null;
  summaryPt?: string | null;
};

// As tabelas antigas guardam status em varchar, portanto o gerador não conhece
// os valores válidos. Este union mantém as transições do domínio tipadas.
export type GameplaySessionParticipantStatus =
  | 'pending'
  | 'invited'
  | 'confirmed'
  | 'declined'
  | 'rejected'
  | 'removed'
  | 'cancelled'
  | 'left';
