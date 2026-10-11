import type { Models } from 'node-appwrite';

export type RecommendationScope = 'any' | 'library' | 'new';
export type RecommendationSource = 'library' | 'new';
export type RecommendationState = 'pending' | 'completed' | 'failed';

export type RecommenderGame = {
  id: string;
  name: string;
  slug: string;
  coverUrl: string | null;
  releaseYear: string | null;
  genres: string[];
  ratingAvg: number;
  ratingCount: number;
  hypes: number;
  similarGames: string[];
};

export type PreferenceSignal = {
  game: RecommenderGame;
  status: string | null;
  liked: boolean | null;
  likedEver: boolean | null;
  updatedAt: string;
};

export type RecommendationCandidate = {
  game: RecommenderGame;
  source: RecommendationSource;
  score: number;
  basedOnGameIds: string[];
};

export type RecommendationContext = {
  profile: {
    id: string;
    userId: string;
    fingerprint: string;
    balance: number;
  };
  signals: PreferenceSignal[];
  candidates: RecommendationCandidate[];
};

export type GameRecommendationRow = Models.Row & {
  userId: string;
  ownerFingerprint: string;
  idempotencyKey: string;
  dailyKey: string | null;
  gameId: string | null;
  scope: RecommendationScope;
  source: RecommendationSource | null;
  reason: string | null;
  matchSignals: string[] | null;
  basedOnGameIds: string[] | null;
  state: RecommendationState;
  cost: number;
  refunded: boolean;
  model: string;
  promptVersion: number;
  generatedAt: string | null;
  balance: number | null;
  failureCode: string | null;
};

export type RecommendationQuota = {
  cost: number;
  limit: number;
  remaining: number;
  nextAvailableAt: string;
};

export type GameRecommendationResponse = {
  quota?: RecommendationQuota;
  id: string;
  source: RecommendationSource;
  game: Pick<
    RecommenderGame,
    'id' | 'name' | 'slug' | 'coverUrl' | 'releaseYear' | 'genres' | 'ratingAvg'
  >;
  reason: string;
  matchSignals: string[];
  basedOnGames: Array<{ id: string; name: string }>;
  cost: number;
  balance: number;
  generatedAt: string;
};
