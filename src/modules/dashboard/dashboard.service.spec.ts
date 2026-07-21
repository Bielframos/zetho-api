import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const makeService = (tablesDB: any) =>
    new DashboardService({ tablesDB } as any);

  it('returns an empty feed when the user follows nobody', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'profile-1', userId: 'user-1', fingerprint: 'me' }],
        })
        .mockResolvedValueOnce({ rows: [], total: 0 }),
    };

    const service = makeService(tablesDB);

    await expect(service.getPersonalFeed('user-1')).resolves.toEqual({
      items: [],
      hasMore: false,
    });
  });

  it('adds direct parent comment context and viewer vote to reply feed items', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'profile-1', userId: 'user-1', fingerprint: 'me' }],
        })
        .mockResolvedValueOnce({
          rows: [{ targetProfileId: 'profile-2' }],
          total: 1,
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
        })
        .mockResolvedValueOnce({ rows: [], total: 0 })
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'comment-3',
              $createdAt: '2026-01-02T00:00:00.000Z',
              gameId: null,
              userProfile: 'profile-2',
              content: 'Resposta final',
              parentId: 'comment-2',
              voteCount: 3,
            },
          ],
          total: 1,
        })
        .mockResolvedValueOnce({ rows: [], total: 0 })
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'comment-2',
              $createdAt: '2026-01-01T00:00:00.000Z',
              content: 'Pai direto',
              parentId: 'comment-1',
              userProfile: 'profile-2',
            },
          ],
          total: 1,
        })
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'vote-1',
              comment: 'comment-3',
              userId: 'user-1',
              type: 'up',
            },
          ],
          total: 1,
        }),
    };

    const service = makeService(tablesDB);

    await expect(service.getPersonalFeed('user-1')).resolves.toMatchObject({
      items: [
        {
          $id: 'comment-3',
          type: 'comment',
          content: 'Resposta final',
          viewerVote: 'up',
          parentComment: {
            $id: 'comment-2',
            content: 'Pai direto',
            userProfile: {
              $id: 'profile-2',
              gamertag: 'Friend',
              avatarUrl: null,
            },
          },
        },
      ],
      hasMore: false,
    });
  });

  it('keeps parent comment null for root feed comments without viewer vote', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'profile-1', userId: 'user-1', fingerprint: 'me' }],
        })
        .mockResolvedValueOnce({
          rows: [{ targetProfileId: 'profile-2' }],
          total: 1,
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
        })
        .mockResolvedValueOnce({ rows: [], total: 0 })
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'comment-1',
              $createdAt: '2026-01-01T00:00:00.000Z',
              gameId: null,
              userProfile: 'profile-2',
              content: 'Comentário original',
              parentId: null,
              voteCount: 0,
            },
          ],
          total: 1,
        })
        .mockResolvedValueOnce({ rows: [], total: 0 })
        .mockResolvedValueOnce({ rows: [], total: 0 }),
    };

    const service = makeService(tablesDB);

    await expect(service.getPersonalFeed('user-1')).resolves.toMatchObject({
      items: [
        {
          $id: 'comment-1',
          type: 'comment',
          parentComment: null,
          viewerVote: null,
        },
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
          rows: [{ $id: 'list-1', likeCount: 2, saveCount: 4 }],
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
          rows: [{ $id: 'list-1', likeCount: 0, saveCount: 1 }],
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

  it('returns empty connections list activity when the user follows nobody', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [{ $id: 'profile-1', userId: 'user-1', fingerprint: 'me' }],
        })
        .mockResolvedValueOnce({ rows: [], total: 0 }),
    };

    const service = makeService(tablesDB);

    await expect(service.getConnectionsListActivity('user-1')).resolves.toEqual(
      { items: [], hasMore: false },
    );
  });

  it('hydrates a game added by a followed user to a public list', async () => {
    const tablesDB = {
      listRows: jest
        .fn()
        // caller profile
        .mockResolvedValueOnce({
          rows: [{ $id: 'profile-1', userId: 'user-1', fingerprint: 'me' }],
        })
        // connections
        .mockResolvedValueOnce({
          rows: [{ targetProfileId: 'profile-2' }],
        })
        // followed profiles
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
        })
        // lists owned by followed users
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'list-1',
              title: 'Top RPGs',
              slug: 'top-rpgs',
              ownerFingerprint: 'friend',
            },
          ],
        })
        // list_items
        .mockResolvedValueOnce({
          rows: [
            {
              $id: 'item-1',
              $createdAt: '2026-01-03T00:00:00.000Z',
              list: 'list-1',
              game: {
                $id: 'game-1',
                name: 'Baldur',
                slug: 'baldur',
                coverUrl: 'cover.jpg',
              },
            },
          ],
        }),
    };

    const service = makeService(tablesDB);
    const result = await service.getConnectionsListActivity('user-1');

    expect(result.hasMore).toBe(false);
    expect(result.items).toEqual([
      {
        $id: 'item-1',
        $createdAt: '2026-01-03T00:00:00.000Z',
        author: {
          $id: 'profile-2',
          userId: 'user-2',
          fingerprint: 'friend',
          gamertag: 'Friend',
          avatarUrl: null,
        },
        list: { $id: 'list-1', title: 'Top RPGs', slug: 'top-rpgs' },
        game: {
          $id: 'game-1',
          name: 'Baldur',
          slug: 'baldur',
          coverUrl: 'cover.jpg',
        },
      },
    ]);
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
});
