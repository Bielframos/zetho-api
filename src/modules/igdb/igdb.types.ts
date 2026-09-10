type IGDBStatusValue =
  | string
  | number
  | {
      id?: number | string;
      name?: string;
    };

export type IGDBGame = {
  id: number;
  name: string;
  alternative_names?: { name: string }[];
  slug?: string;
  status?: IGDBStatusValue;
  game_status?: IGDBStatusValue;
  cover?: {
    image_id: string;
  };
  first_release_date?: number;
  hypes?: number;
  follows?: number;
  involved_companies?: {
    id: number;
    company: {
      id: number;
      name: string;
      slug: string;
      checksum: string;
    };
    developer: boolean;
    publisher?: boolean;
  }[];
  genres?: number[];
  summary?: string;
  similar_games?: number[];
  checksum?: string;
  game_type?: number;
  version_parent?: number;
};

export type IGDBGenre = {
  id: number;
  name: string;
  slug: string;
  checksum: string;
};

export type IGDBGameMedia = {
  id: number;
  artworks?: { image_id: string; artwork_type: number }[];
  screenshots?: { image_id: string }[];
  videos?: { name: string; video_id: string }[];
};

/** Webhooks contain references, not expanded entities. */
export type IGDBGameWebhook = Omit<
  IGDBGame,
  'cover' | 'alternative_names' | 'involved_companies'
> & {
  cover?: number;
  alternative_names?: number[];
  involved_companies?: number[];
};
