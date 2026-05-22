const SCORE_TABLE = {
  input: {
    welcome_bonus: 25,
    daily_login: 5,
    finished_game: 8,
    playing_game: 6,
    add_game_to_library: 4,
    engaged: 2,
    friend_joined: 30,
  },
  output: {},
} as const;

export default SCORE_TABLE;
