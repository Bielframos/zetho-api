export type IGDBGame = {
  id: number;
  name: string;
  slug: string;
  cover: {
    image_id: string;
  };
  first_release_date: number;
  involved_companies: {
    id: number;
    company: {
      id: number;
      name: string;
      slug: string;
      checksum: string;
    };
    developer: boolean;
  }[];
  genres: number[];
  summary: string;
  similar_games: number[];
  checksum: string;
  game_type: number;
  version_parent: number;
};

export type IGDBGenre = {
  id: number;
  name: string;
  slug: string;
  checksum: string;
};
