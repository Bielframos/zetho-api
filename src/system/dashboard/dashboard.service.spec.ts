import { DashboardService } from './dashboard.service';
import { DashboardListsService } from './dashboard-lists.service';
import { DashboardEntrySocialService } from './dashboard-entry-social.service';
import { DashboardProfilesService } from './dashboard-profiles.service';

describe('DashboardService', () => {
  const makeService = (tablesDB: any) => {
    const appwrite = { tablesDB };
    const outbox = { enqueueImmediate: jest.fn().mockResolvedValue(undefined) };
    const profiles = new DashboardProfilesService(appwrite as any);
    return new DashboardService(
      appwrite as any,
      {} as any,
      outbox as any,
      new DashboardListsService(appwrite as any, outbox as any, profiles),
      new DashboardEntrySocialService(appwrite as any, outbox as any, profiles),
      profiles,
    );
  };

  it('passes viewer identity and cursor to the persisted timeline', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValue({ rows: [{ $id: 'viewer-profile' }] }),
    };
    const page = jest
      .fn()
      .mockResolvedValue({ items: [], hasMore: false, nextCursor: null });
    const appwrite = { tablesDB };
    const outbox = { enqueueImmediate: jest.fn().mockResolvedValue(undefined) };
    const profiles = new DashboardProfilesService(appwrite as any);
    const service = new DashboardService(
      appwrite as any,
      { page } as any,
      outbox as any,
      new DashboardListsService(appwrite as any, outbox as any, profiles),
      new DashboardEntrySocialService(appwrite as any, outbox as any, profiles),
      profiles,
    );
    await expect(
      service.getPersonalFeed('viewer', 3, 12, 'connections', 'event-cursor'),
    ).resolves.toEqual({ items: [], hasMore: false, nextCursor: null });
    expect(page).toHaveBeenCalledWith(
      'viewer',
      'viewer-profile',
      3,
      12,
      'event-cursor',
    );
  });

  it('returns deterministic public-list pagination with covers, authors and viewer state', async () => {
    const latestAdditions = [
      JSON.stringify({
        gameId: 'game-1',
        gameName: 'Hades',
        gameCoverUrl: 'https://cdn.zetho.com.br/hades.jpg',
      }),
    ];
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'list-1',
              $createdAt: '2026-08-02T00:00:00.000Z',
              ownerFingerprint: 'author-one',
              title: 'Favoritos',
              slug: 'favoritos',
              isPublic: true,
              itemCount: 1,
              likeCount: 3,
              saveCount: 2,
              latestAdditions,
            },
            {
              $id: 'list-2',
              $createdAt: '2026-08-01T00:00:00.000Z',
              ownerFingerprint: 'author-two',
              title: 'Indies',
              slug: 'indies',
              isPublic: true,
              itemCount: null,
              likeCount: null,
              saveCount: null,
              latestAdditions: null,
            },
          ],
          total: 5,
        })
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'profile-1',
              userId: 'author-user-1',
              fingerprint: 'author-one',
              gamertag: 'AuthorOne',
              avatarUrl: 'avatar.jpg',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ listId: 'list-1' }] })
        .mockResolvedValueOnce({ rows: [{ listId: 'list-2' }] }),
    };

    const service = makeService(tablesDB);
    const result = await service.getPublicLists('viewer-1', 2, 2);

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          $id: 'list-1',
          latestAdditions,
          author: expect.objectContaining({
            gamertag: 'AuthorOne',
            avatarUrl: 'avatar.jpg',
          }),
          likedByMe: true,
          savedByMe: false,
        }),
        expect.objectContaining({
          $id: 'list-2',
          itemCount: 0,
          likeCount: 0,
          saveCount: 0,
          latestAdditions: [],
          author: null,
          likedByMe: false,
          savedByMe: true,
        }),
      ],
      total: 5,
      page: 2,
      pageSize: 2,
      totalPages: 3,
      hasMore: true,
    });

    const listRequest = tablesDB.listRows.mock.calls[0][0];
    expect(listRequest).toMatchObject({ databaseId: 'app', tableId: 'lists' });
    expect(listRequest.queries[0]).toContain('isPublic');
    expect(listRequest.queries[0]).toContain('true');
    expect(listRequest.queries[2]).toContain('$createdAt');
    expect(listRequest.queries[3]).toContain('$id');
    expect(listRequest.queries[4]).toContain('2');
    expect(listRequest.queries[5]).toContain('2');
  });

  it('bounds public-list pagination and skips hydration for an empty anonymous page', async () => {
    const tablesDB = {
      listRows: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
    };
    const service = makeService(tablesDB);

    await expect(
      service.getPublicLists(undefined, Number.NaN, 999),
    ).resolves.toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 0,
      hasMore: false,
    });
    expect(tablesDB.listRows).toHaveBeenCalledTimes(1);
    const query = tablesDB.listRows.mock.calls[0][0];
    expect(query.queries[0]).toContain('isPublic');
    expect(query.queries[4]).toContain('50');
    expect(query.queries[5]).toContain('0');
  });

  it('returns only the current user status entries for the mine scope', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'profile-1',
              userId: 'user-1',
              fingerprint: 'me',
              gamertag: 'Player',
              avatarUrl: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'entry-2',
              $createdAt: '2026-08-02T00:00:00.000Z',
              ownerFingerprint: 'me',
              gameId: 'game-1',
              status: 'completed',
              likeCount: 3,
              commentCount: 2,
            },
            {
              $id: 'entry-1',
              $createdAt: '2026-08-01T00:00:00.000Z',
              ownerFingerprint: 'me',
              gameId: 'game-1',
              status: 'playing',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'game-1',
              name: 'Hades',
              slug: 'hades',
              coverUrl: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ entryId: 'entry-2', userId: 'user-1' }],
        }),
    };

    const service = makeService(tablesDB);
    const result = await service.getPersonalFeed('user-1', 1, 12, 'mine');

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          $id: 'entry-2',
          type: 'status',
          status: 'completed',
          likeCount: 3,
          commentCount: 2,
          likedByMe: true,
          userProfile: expect.objectContaining({ gamertag: 'Player' }),
          game: expect.objectContaining({ name: 'Hades' }),
        }),
      ],
      hasMore: false,
    });
  });

  it('creates a like relation and increments list like count', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'profile-1', userId: 'user-1', fingerprint: 'me' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'list-1',
              isPublic: true,
              status: 'published',
              likeCount: 2,
              saveCount: 4,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [], total: 0 })
        .mockResolvedValueOnce({ rows: [], total: 0 })
        .mockResolvedValueOnce({ rows: [], total: 0 }),
      createRow: jest.fn().mockResolvedValue({}),
      updateRow: jest.fn().mockResolvedValue({
        $id: 'list-1',
        likeCount: 3,
        saveCount: 4,
      }),
      deleteRow: jest.fn(),
    };

    const service = makeService(tablesDB);

    await expect(service.toggleListLike('user-1', 'list-1')).resolves.toEqual({
      listId: 'list-1',
      likedByMe: true,
      savedByMe: false,
      likeCount: 3,
      saveCount: 4,
    });
    expect(tablesDB.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'list_likes',
        data: {
          listId: 'list-1',
          userId: 'user-1',
          profileId: 'profile-1',
        },
      }),
    );
    expect(tablesDB.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'lists',
        rowId: 'list-1',
        data: { likeCount: 3 },
      }),
    );
  });

  it('removes a like relation and never decrements below zero', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'profile-1', userId: 'user-1', fingerprint: 'me' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'list-1',
              isPublic: true,
              status: 'published',
              likeCount: 0,
              saveCount: 1,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ $id: 'like-1', listId: 'list-1', userId: 'user-1' }],
          total: 1,
        })
        .mockResolvedValueOnce({ rows: [], total: 0 })
        .mockResolvedValueOnce({ rows: [], total: 0 }),
      createRow: jest.fn(),
      updateRow: jest.fn().mockResolvedValue({
        $id: 'list-1',
        likeCount: 0,
        saveCount: 1,
      }),
      deleteRow: jest.fn().mockResolvedValue({}),
    };

    const service = makeService(tablesDB);

    await expect(service.toggleListLike('user-1', 'list-1')).resolves.toEqual({
      listId: 'list-1',
      likedByMe: false,
      savedByMe: false,
      likeCount: 0,
      saveCount: 1,
    });
    expect(tablesDB.deleteRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'list_likes',
        rowId: 'like-1',
      }),
    );
  });

  it('creates a comment downvote without making vote count negative', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'comment-1', voteCount: 0 }],
        })
        .mockResolvedValueOnce({ rows: [], total: 0 })
        .mockResolvedValueOnce({ rows: [{ type: 'down' }], total: 1 }),
      createRow: jest.fn().mockResolvedValue({}),
      updateRow: jest.fn().mockResolvedValue({}),
    };

    const service = makeService(tablesDB);

    await expect(
      service.voteComment('user-1', 'comment-1', 'down'),
    ).resolves.toEqual({
      success: true,
      delta: 0,
      operation: 'down',
      newVoteCount: 0,
      viewerVote: 'down',
    });
    expect(tablesDB.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'game_comment_votes',
        data: {
          type: 'down',
          comment: 'comment-1',
          userId: 'user-1',
        },
      }),
    );
    expect(tablesDB.updateRow).not.toHaveBeenCalled();
  });

  it('removes an existing comment upvote when the same operation is repeated', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'comment-1', voteCount: 4 }],
        })
        .mockResolvedValueOnce({
          rows: [{ $id: 'vote-1', type: 'up' }],
          total: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ type: 'up' }, { type: 'up' }, { type: 'up' }],
          total: 3,
        }),
      deleteRow: jest.fn().mockResolvedValue({}),
      updateRow: jest.fn().mockResolvedValue({}),
    };

    const service = makeService(tablesDB);

    await expect(
      service.voteComment('user-1', 'comment-1', 'up'),
    ).resolves.toEqual({
      success: true,
      delta: -1,
      operation: 'up',
      newVoteCount: 3,
      viewerVote: null,
    });
    expect(tablesDB.deleteRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'game_comment_votes',
        rowId: 'vote-1',
      }),
    );
  });

  it('switches an existing comment vote between directions', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'comment-1', voteCount: 2 }],
        })
        .mockResolvedValueOnce({
          rows: [{ $id: 'vote-1', type: 'down' }],
          total: 1,
        })
        .mockResolvedValueOnce({
          rows: [
            { type: 'up' },
            { type: 'up' },
            { type: 'up' },
            { type: 'up' },
          ],
          total: 4,
        }),
      updateRow: jest.fn().mockResolvedValue({}),
    };

    const service = makeService(tablesDB);

    await expect(
      service.voteComment('user-1', 'comment-1', 'up'),
    ).resolves.toEqual({
      success: true,
      delta: 2,
      operation: 'up',
      newVoteCount: 4,
      viewerVote: 'up',
    });
    expect(tablesDB.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'game_comment_votes',
        rowId: 'vote-1',
        data: { type: 'up' },
      }),
    );
    expect(tablesDB.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'game_comments',
        rowId: 'comment-1',
        data: { voteCount: 4 },
      }),
    );
  });

  it('switches a zero-count downvote to upvote by one point', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'comment-1', voteCount: 0 }],
        })
        .mockResolvedValueOnce({
          rows: [{ $id: 'vote-1', type: 'down' }],
          total: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ type: 'up' }],
          total: 1,
        }),
      updateRow: jest.fn().mockResolvedValue({}),
    };

    const service = makeService(tablesDB);

    await expect(
      service.voteComment('user-1', 'comment-1', 'up'),
    ).resolves.toEqual({
      success: true,
      delta: 1,
      operation: 'up',
      newVoteCount: 1,
      viewerVote: 'up',
    });
    expect(tablesDB.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'game_comments',
        rowId: 'comment-1',
        data: { voteCount: 1 },
      }),
    );
  });

  it('removes an existing zero-count comment downvote without incrementing', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'comment-1', voteCount: 0 }],
        })
        .mockResolvedValueOnce({
          rows: [{ $id: 'vote-1', type: 'down' }],
          total: 1,
        })
        .mockResolvedValueOnce({ rows: [], total: 0 }),
      deleteRow: jest.fn().mockResolvedValue({}),
      updateRow: jest.fn().mockResolvedValue({}),
    };

    const service = makeService(tablesDB);

    await expect(
      service.voteComment('user-1', 'comment-1', 'down'),
    ).resolves.toEqual({
      success: true,
      delta: 0,
      operation: 'down',
      newVoteCount: 0,
      viewerVote: null,
    });
    expect(tablesDB.deleteRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'game_comment_votes',
        rowId: 'vote-1',
      }),
    );
    expect(tablesDB.updateRow).not.toHaveBeenCalled();
  });

  it('suggests unfollowed players who rated the same games', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        // caller profile
        .mockResolvedValueOnce({
          rows: [{ $id: 'profile-1', userId: 'user-1', fingerprint: 'me' }],
        })
        // my ratings → game ids
        .mockResolvedValueOnce({
          rows: [{ gameId: 'game-1' }, { gameId: 'game-2' }],
        })
        // ratings on those games (other users)
        .mockResolvedValueOnce({
          rows: [
            { ownerFingerprint: 'friend' },
            { ownerFingerprint: 'friend' },
            { ownerFingerprint: 'me' },
          ],
        })
        // my following
        .mockResolvedValueOnce({ rows: [] })
        // candidate profiles by fingerprint
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'profile-2',
              userId: 'user-2',
              fingerprint: 'friend',
              gamertag: 'Friend',
              avatarUrl: null,
            },
          ],
        }),
    };

    const service = makeService(tablesDB);
    const result = await service.getSuggestedConnections('user-1');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      $id: 'profile-2',
      gamertag: 'Friend',
      sharedCount: 2,
    });
  });

  it('toggles a like on a feed entry and returns the authoritative counters', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'profile-1', userId: 'user-1', fingerprint: 'me' }],
        })
        .mockResolvedValueOnce({ rows: [], total: 0 }),
      getRow: jest.fn().mockResolvedValue({
        $id: 'entry-1',
        status: 'completed',
        likeCount: 2,
        commentCount: 4,
      }),
      createRow: jest.fn().mockResolvedValue({}),
      incrementRowColumn: jest.fn().mockResolvedValue({
        $id: 'entry-1',
        likeCount: 3,
        commentCount: 4,
      }),
    };
    const service = makeService(tablesDB);

    await expect(service.toggleEntryLike('user-1', 'entry-1')).resolves.toEqual(
      {
        entryId: 'entry-1',
        likeCount: 3,
        commentCount: 4,
        likedByMe: true,
      },
    );
    expect(tablesDB.createRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'z_entry_likes',
        data: {
          entryId: 'entry-1',
          userId: 'user-1',
          profileId: 'profile-1',
        },
      }),
    );
  });

  it('creates an entry comment, increments counters and notifies its owner', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'profile-1',
              userId: 'user-1',
              fingerprint: 'me',
              gamertag: 'Me',
              avatarUrl: null,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'profile-2',
              userId: 'user-2',
              fingerprint: 'friend',
              gamertag: 'Friend',
              avatarUrl: null,
            },
          ],
        }),
      getRow: jest.fn().mockResolvedValue({
        $id: 'entry-1',
        status: 'playing',
        ownerFingerprint: 'friend',
        commentCount: 4,
      }),
      createRow: jest
        .fn()
        .mockResolvedValueOnce({
          $id: 'entry-comment-1',
          entryId: 'entry-1',
          profileId: 'profile-1',
          content: 'Boa jogatina!',
          depth: 0,
          replyCount: 0,
        })
        .mockResolvedValueOnce({}),
      incrementRowColumn: jest.fn().mockResolvedValue({}),
    };
    const service = makeService(tablesDB);

    await expect(
      service.createEntryComment('user-1', 'entry-1', '  Boa jogatina!  '),
    ).resolves.toMatchObject({
      $id: 'entry-comment-1',
      content: 'Boa jogatina!',
      userProfile: { $id: 'profile-1', gamertag: 'Me' },
    });
    expect(tablesDB.incrementRowColumn).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'z_entries',
        rowId: 'entry-1',
        column: 'commentCount',
      }),
    );
    expect(tablesDB.createRow).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tableId: 'notifications',
        data: expect.objectContaining({
          recipientProfileId: 'profile-2',
          senderProfileId: 'profile-1',
          type: 'entry_comment',
          entityId: 'entry-1',
        }),
      }),
    );
  });

  it('writes an absolute like count when the entry counter is still null', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'profile-1', userId: 'user-1', fingerprint: 'me' }],
        })
        .mockResolvedValueOnce({ rows: [], total: 0 }),
      getRow: jest.fn().mockResolvedValue({
        $id: 'entry-1',
        status: 'completed',
        likeCount: null,
        commentCount: null,
      }),
      createRow: jest.fn().mockResolvedValue({}),
      incrementRowColumn: jest.fn().mockResolvedValue({}),
      updateRow: jest.fn().mockResolvedValue({
        $id: 'entry-1',
        likeCount: 1,
        commentCount: null,
      }),
    };
    const service = makeService(tablesDB);

    await expect(service.toggleEntryLike('user-1', 'entry-1')).resolves.toEqual(
      {
        entryId: 'entry-1',
        likeCount: 1,
        commentCount: 0,
        likedByMe: true,
      },
    );
    expect(tablesDB.incrementRowColumn).not.toHaveBeenCalled();
    expect(tablesDB.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'z_entries',
        rowId: 'entry-1',
        data: { likeCount: 1 },
      }),
    );
  });

  it('never writes a negative count when unliking an entry with a null counter', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'profile-1', userId: 'user-1', fingerprint: 'me' }],
        })
        .mockResolvedValueOnce({ rows: [{ $id: 'like-1' }], total: 1 }),
      getRow: jest.fn().mockResolvedValue({
        $id: 'entry-1',
        status: 'completed',
        likeCount: null,
        commentCount: null,
      }),
      deleteRow: jest.fn().mockResolvedValue({}),
      decrementRowColumn: jest.fn().mockResolvedValue({}),
      updateRow: jest.fn().mockResolvedValue({
        $id: 'entry-1',
        likeCount: 0,
        commentCount: null,
      }),
    };
    const service = makeService(tablesDB);

    await expect(service.toggleEntryLike('user-1', 'entry-1')).resolves.toEqual(
      {
        entryId: 'entry-1',
        likeCount: 0,
        commentCount: 0,
        likedByMe: false,
      },
    );
    expect(tablesDB.decrementRowColumn).not.toHaveBeenCalled();
    expect(tablesDB.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'z_entries',
        rowId: 'entry-1',
        data: { likeCount: 0 },
      }),
    );
  });

  it('writes an absolute comment count when the entry counter is still null', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'profile-1',
              userId: 'user-1',
              fingerprint: 'me',
              gamertag: 'Me',
              avatarUrl: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
      getRow: jest.fn().mockResolvedValue({
        $id: 'entry-1',
        status: 'playing',
        ownerFingerprint: 'friend',
        commentCount: null,
      }),
      createRow: jest.fn().mockResolvedValue({
        $id: 'entry-comment-1',
        entryId: 'entry-1',
        profileId: 'profile-1',
        content: 'Boa jogatina!',
        depth: 0,
        replyCount: 0,
      }),
      incrementRowColumn: jest.fn().mockResolvedValue({}),
      updateRow: jest.fn().mockResolvedValue({}),
    };
    const service = makeService(tablesDB);

    await service.createEntryComment('user-1', 'entry-1', 'Boa jogatina!');

    expect(tablesDB.incrementRowColumn).not.toHaveBeenCalled();
    expect(tablesDB.updateRow).toHaveBeenCalledWith(
      expect.objectContaining({
        tableId: 'z_entries',
        rowId: 'entry-1',
        data: { commentCount: 1 },
      }),
    );
  });
});
