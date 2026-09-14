export interface WeeklyZCoinsLeaderboardItem {
  position: number;
  userId: string;
  gamertag: string | null;
  avatarUrl: string | null;
  zcoins: number;
}

export interface WeeklyZCoinsLeaderboardResponse {
  period: 'weekly';
  since: string | null;
  limit: number;
  totalPlayers: number;
  leaders: WeeklyZCoinsLeaderboardItem[];
  lastSyncAt: string;
  nextSyncAt: string;
  resetsIn: string;
}

export interface ConnectionCompletedGamesLeaderboardItem {
  position: number;
  userId: string;
  profileId: string;
  gamertag: string;
  avatarUrl: string | null;
  completedGames: number;
  isCurrentUser: boolean;
}

export interface ConnectionCompletedGamesLeaderboardResponse {
  category: 'completed_games';
  scope: 'connections';
  totalConnections: number;
  currentUserPosition: number | null;
  leaders: ConnectionCompletedGamesLeaderboardItem[];
  syncedAt: string;
}
