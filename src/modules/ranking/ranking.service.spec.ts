import type { Cache } from 'cache-manager';
import type { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import type { LoggerContextService } from 'src/common/observability/logger-context.service';
import { RankingService } from './ranking.service';

describe('RankingService', () => {
  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
  };

  const mockLoggerContext = {
    trackLifecycle: jest.fn(
      (_logger: unknown, _ctx: unknown, fn: () => Promise<unknown>) => fn(),
    ),
  };

  const createService = (listRows: jest.Mock) => {
    const mockAppwrite = {
      tablesDB: {
        listRows,
      },
    };

    return new RankingService(
      mockCache as unknown as Cache,
      mockAppwrite as unknown as Appwrite,
      mockLoggerContext as unknown as LoggerContextService,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getWeeklyZCoinsLeaderboard', () => {
    it('returns cached leaderboard directly when available', async () => {
      const cachedData = {
        syncedAt: '2026-09-14T12:00:00.000Z',
        resetsIn: '2026-09-20T00:00:00.000Z',
        since: '2026-09-13T00:00:00.000Z',
        leaders: [
          {
            position: 1,
            userId: 'user-1',
            gamertag: 'GamerOne',
            avatarUrl: null,
            zcoins: 100,
          },
          {
            position: 2,
            userId: 'user-2',
            gamertag: 'GamerTwo',
            avatarUrl: null,
            zcoins: 50,
          },
        ],
      };

      mockCache.get.mockResolvedValueOnce(cachedData);
      const listRows = jest.fn();
      const service = createService(listRows);

      const result = await service.getWeeklyZCoinsLeaderboard(1);

      expect(result.leaders).toHaveLength(1);
      expect(result.leaders[0].userId).toBe('user-1');
      expect(result.totalPlayers).toBe(2);
      expect(listRows).not.toHaveBeenCalled();
    });

    it('aggregates transactions and batch hydrates profiles on cache miss', async () => {
      mockCache.get.mockResolvedValueOnce(null);

      const listRows = jest.fn().mockImplementation(({ tableId }) => {
        if (tableId === 'zcoin_transactions') {
          return Promise.resolve({
            rows: [
              { userId: 'user-1', amount: 30 },
              { userId: 'user-2', amount: 50 },
              { userId: 'user-1', amount: 40 },
            ],
            total: 3,
          });
        }
        if (tableId === 'user_profiles') {
          return Promise.resolve({
            rows: [
              {
                userId: 'user-1',
                gamertag: 'UserOne',
                avatarUrl: 'https://img.com/1.png',
              },
              { userId: 'user-2', gamertag: 'UserTwo', avatarUrl: null },
            ],
            total: 2,
          });
        }
        return Promise.resolve({ rows: [], total: 0 });
      });

      const service = createService(listRows);
      const result = await service.getWeeklyZCoinsLeaderboard(10);

      expect(result.period).toBe('weekly');
      expect(result.leaders).toHaveLength(2);
      expect(result.leaders[0]).toEqual({
        position: 1,
        userId: 'user-1',
        gamertag: 'UserOne',
        avatarUrl: 'https://img.com/1.png',
        zcoins: 70,
      });
      expect(result.leaders[1]).toEqual({
        position: 2,
        userId: 'user-2',
        gamertag: 'UserTwo',
        avatarUrl: null,
        zcoins: 50,
      });
      expect(mockCache.set).toHaveBeenCalledTimes(1);
    });
  });

  describe('getConnectionsCompletedGamesLeaderboard', () => {
    it('returns ranked connections with current user highlighted', async () => {
      mockCache.get.mockResolvedValueOnce(null);

      const listRows = jest.fn().mockImplementation(({ tableId, queries }) => {
        const queryStr = JSON.stringify(queries ?? []);

        if (tableId === 'user_profiles') {
          if (queryStr.includes('"userId"') && queryStr.includes('user-me')) {
            return Promise.resolve({
              rows: [
                {
                  $id: 'profile-me',
                  userId: 'user-me',
                  gamertag: 'MePlayer',
                  avatarUrl: null,
                  totalsCompleted: 15,
                },
              ],
              total: 1,
            });
          }

          return Promise.resolve({
            rows: [
              {
                $id: 'profile-me',
                userId: 'user-me',
                gamertag: 'MePlayer',
                avatarUrl: null,
                totalsCompleted: 15,
              },
              {
                $id: 'profile-friend-1',
                userId: 'user-friend-1',
                gamertag: 'TopGamer',
                avatarUrl: 'https://img.com/top.png',
                totalsCompleted: 30,
              },
              {
                $id: 'profile-friend-2',
                userId: 'user-friend-2',
                gamertag: 'BronzeGamer',
                avatarUrl: null,
                totalsCompleted: 5,
              },
            ],
            total: 3,
          });
        }

        if (tableId === 'connections') {
          if (queryStr.includes('requesterProfileId')) {
            return Promise.resolve({
              rows: [{ targetProfileId: 'profile-friend-1' }],
              total: 1,
            });
          }
          return Promise.resolve({
            rows: [{ requesterProfileId: 'profile-friend-2' }],
            total: 1,
          });
        }

        return Promise.resolve({ rows: [], total: 0 });
      });

      const service = createService(listRows);
      const result = await service.getConnectionsCompletedGamesLeaderboard(
        'user-me',
        10,
      );

      expect(result.category).toBe('completed_games');
      expect(result.scope).toBe('connections');
      expect(result.totalConnections).toBe(2);
      expect(result.currentUserPosition).toBe(2);
      expect(result.leaders).toHaveLength(3);

      expect(result.leaders[0]).toEqual({
        position: 1,
        userId: 'user-friend-1',
        profileId: 'profile-friend-1',
        gamertag: 'TopGamer',
        avatarUrl: 'https://img.com/top.png',
        completedGames: 30,
        isCurrentUser: false,
      });

      expect(result.leaders[1]).toEqual({
        position: 2,
        userId: 'user-me',
        profileId: 'profile-me',
        gamertag: 'MePlayer',
        avatarUrl: null,
        completedGames: 15,
        isCurrentUser: true,
      });

      expect(result.leaders[2]).toEqual({
        position: 3,
        userId: 'user-friend-2',
        profileId: 'profile-friend-2',
        gamertag: 'BronzeGamer',
        avatarUrl: null,
        completedGames: 5,
        isCurrentUser: false,
      });
    });

    it('handles user with zero connections gracefully', async () => {
      mockCache.get.mockResolvedValueOnce(null);

      const listRows = jest.fn().mockImplementation(({ tableId }) => {
        if (tableId === 'user_profiles') {
          return Promise.resolve({
            rows: [
              {
                $id: 'profile-solo',
                userId: 'user-solo',
                gamertag: 'SoloPlayer',
                avatarUrl: null,
                totalsCompleted: 10,
              },
            ],
            total: 1,
          });
        }

        if (tableId === 'connections') {
          return Promise.resolve({ rows: [], total: 0 });
        }

        return Promise.resolve({ rows: [], total: 0 });
      });

      const service = createService(listRows);
      const result = await service.getConnectionsCompletedGamesLeaderboard(
        'user-solo',
        10,
      );

      expect(result.totalConnections).toBe(0);
      expect(result.currentUserPosition).toBe(1);
      expect(result.leaders).toHaveLength(1);
      expect(result.leaders[0].isCurrentUser).toBe(true);
      expect(result.leaders[0].completedGames).toBe(10);
    });
  });
});
