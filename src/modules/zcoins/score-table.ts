const SCORE_TABLE = {
  input: {
    welcome_bonus: 100,
    daily_login: 5,
    finished_game: 25,
    playing_game: 15,
    add_game_to_library: 10,
    engaged: 5,
  },
  output: {},
} as const;

export default SCORE_TABLE;
