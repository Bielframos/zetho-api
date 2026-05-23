const SCORE_TABLE = {
  input: {
    welcome_bonus: 25,
    daily_login: 5,
    finished_game: 6,
    playing_game: 4,
    add_game_to_library: 2,
    engaged: 1,
    friend_joined: 30,
    create_list: 2,
    add_game_to_list: 1,
  },
  output: {},
} as const;

export default SCORE_TABLE;
