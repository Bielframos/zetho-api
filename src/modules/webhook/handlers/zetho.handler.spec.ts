import { ZethoHandler } from './zetho.handler';

const READ_MODEL_COLUMNS = [
  'gameId',
  'ownerFingerprint',
  'status',
  'liked',
  'hyped',
  'likedEver',
  'maxStatusReached',
];

const makeHandler = (tablesDB: any) => {
  const loggerContext = {
    trackLifecycle: jest.fn((_logger, _context, run) => run()),
  };

  return new ZethoHandler({ tablesDB } as any, loggerContext as any, {} as any);
};

const makeTablesDB = (readEntry: any) => ({
  listRows: jest.fn().mockResolvedValue({
    rows: [
      {
        $id: 'profile-1',
        userId: 'user-1',
        zcoinBalance: 100,
        totalsPlaying: 1,
        totalsCompleted: 0,
      },
    ],
    total: 1,
  }),
  getRow: jest.fn(({ tableId }: { tableId: string }) => {
    if (tableId === 'z_entries_read') return Promise.resolve(readEntry);
    if (tableId === 'z_entry_count')
      return Promise.resolve({
        $id: 'zstats_igdb_1',
        playingCount: 5,
        completedCount: 2,
        likes: 3,
        hypedCount: 1,
      });
    return Promise.reject(new Error(`unexpected table ${tableId}`));
  }),
  createTransaction: jest.fn().mockResolvedValue({ $id: 'tx-1' }),
  upsertRow: jest.fn().mockResolvedValue({}),
  createOperations: jest.fn().mockResolvedValue({}),
  createRow: jest.fn().mockResolvedValue({}),
  updateTransaction: jest.fn().mockResolvedValue({}),
});

const makeEntry = (overrides: Record<string, unknown> = {}) => ({
  $id: 'entry-1',
  $sequence: 1,
  $tableId: 'z_entries',
  $databaseId: 'app',
  $createdAt: '2026-08-09T05:43:37.519+00:00',
  $updatedAt: '2026-08-09T05:43:37.519+00:00',
  $permissions: [],
  gameId: 'igdb_1',
  ownerFingerprint: 'fingerprint-1',
  status: 'completed',
  liked: true,
  hyped: false,
  processedAt: null,
  likeCount: 4,
  commentCount: 2,
  ...overrides,
});

const makeCommentHandler = ({
  parentProfile = {
    $id: 'parent-profile',
    userId: 'parent-user',
    gamertag: 'Parent',
  },
  replyProfile = {
    $id: 'reply-profile',
    gamertag: 'Reply author',
  },
  game = {
    $id: 'game-1',
    name: 'Game name',
    slug: 'game-name',
  },
  notificationError,
}: {
  parentProfile?: Record<string, unknown>;
  replyProfile?: Record<string, unknown> | null;
  game?: Record<string, unknown> | null;
  notificationError?: Error;
} = {}) => {
  const tablesDB = {
    getRow: jest.fn(
      ({ tableId, rowId }: { tableId: string; rowId: string }) => {
        if (tableId === 'game_comments') {
          return Promise.resolve({
            $id: rowId,
            userProfile: 'parent-profile',
          });
        }
        if (tableId === 'user_profiles' && rowId === 'parent-profile') {
          return Promise.resolve(parentProfile);
        }
        if (tableId === 'user_profiles' && rowId === 'reply-profile') {
          return Promise.resolve(replyProfile);
        }
        if (tableId === 'games') return Promise.resolve(game);
        return Promise.reject(new Error(`unexpected table ${tableId}`));
      },
    ),
    createRow: notificationError
      ? jest.fn().mockRejectedValue(notificationError)
      : jest.fn().mockResolvedValue({}),
  };
  const messaging = {
    createEmail: jest.fn().mockResolvedValue({}),
  };
  const loggerContext = {
    trackLifecycle: jest.fn((_logger, _context, run) => run()),
  };
  const emailTemplateService = {
    renderCommentReplyEmail: jest.fn().mockReturnValue('<p>reply email</p>'),
  };
  const handler = new ZethoHandler(
    { tablesDB, messaging } as any,
    loggerContext as any,
    emailTemplateService as any,
  );

  return { handler, tablesDB, messaging, emailTemplateService };
};

const makeComment = (overrides: Record<string, unknown> = {}) => ({
  $id: 'comment-1',
  parentId: 'parent-comment',
  userProfile: 'reply-profile',
  gameId: 'game-1',
  content: 'A reply',
  ...overrides,
});

describe('ZethoHandler.syncEntry', () => {
  it('projeta apenas as colunas existentes em z_entries_read', async () => {
    const tablesDB = makeTablesDB({
      $id: 'read-1',
      gameId: 'igdb_1',
      ownerFingerprint: 'fingerprint-1',
      status: 'playing',
      liked: true,
      hyped: false,
      likedEver: true,
      maxStatusReached: 'playing',
    });

    const result = await makeHandler(tablesDB).syncEntry(makeEntry() as any);

    expect(result.success).toBe(true);
    expect(tablesDB.upsertRow).toHaveBeenCalledTimes(1);

    const { data } = tablesDB.upsertRow.mock.calls[0][0];

    // regressão: likeCount/commentCount/processedAt e campos $* derrubavam o
    // commit da transação com `document_invalid_structure`
    expect(Object.keys(data).sort()).toEqual([...READ_MODEL_COLUMNS].sort());
    expect(data).toMatchObject({
      gameId: 'igdb_1',
      ownerFingerprint: 'fingerprint-1',
      status: 'completed',
      liked: true,
      hyped: false,
      likedEver: true,
      maxStatusReached: 'completed',
    });
    expect(tablesDB.updateTransaction).toHaveBeenCalledWith({
      transactionId: 'tx-1',
      commit: true,
    });
  });

  it('não vaza colunas novas de z_entries para o read model', async () => {
    const tablesDB = makeTablesDB({
      $id: 'read-1',
      gameId: 'igdb_1',
      ownerFingerprint: 'fingerprint-1',
      status: 'playing',
      liked: true,
      hyped: false,
      likedEver: true,
      maxStatusReached: 'playing',
    });

    await makeHandler(tablesDB).syncEntry(
      makeEntry({ someFutureColumn: 'x' }) as any,
    );

    const { data } = tablesDB.upsertRow.mock.calls[0][0];
    expect(data).not.toHaveProperty('someFutureColumn');
    expect(data).not.toHaveProperty('processedAt');
    expect(data).not.toHaveProperty('likeCount');
    expect(data).not.toHaveProperty('commentCount');
  });

  it('mantém maxStatusReached quando o novo status é inferior', async () => {
    const tablesDB = makeTablesDB({
      $id: 'read-1',
      gameId: 'igdb_1',
      ownerFingerprint: 'fingerprint-1',
      status: 'completed',
      liked: true,
      hyped: false,
      likedEver: true,
      maxStatusReached: 'completed',
    });

    await makeHandler(tablesDB).syncEntry(
      makeEntry({ status: 'dropped' }) as any,
    );

    const { data } = tablesDB.upsertRow.mock.calls[0][0];
    expect(data.status).toBe('dropped');
    expect(data.maxStatusReached).toBe('completed');
  });
});

describe('ZethoHandler.handleCommentCreate', () => {
  const previousFrontendAppUrl = process.env.FRONTEND_APP_URL;

  beforeEach(() => {
    process.env.FRONTEND_APP_URL = 'https://frontend.example/';
  });

  afterAll(() => {
    if (previousFrontendAppUrl === undefined) {
      delete process.env.FRONTEND_APP_URL;
    } else {
      process.env.FRONTEND_APP_URL = previousFrontendAppUrl;
    }
  });

  it('creates the in-app notification and sends an anchored encoded email URL', async () => {
    const { handler, tablesDB, messaging, emailTemplateService } =
      makeCommentHandler();
    const comment = makeComment({ $id: 'comment/with spaces?' });

    await handler.handleCommentCreate(comment);

    expect(tablesDB.createRow).toHaveBeenCalledWith({
      databaseId: 'app',
      tableId: 'notifications',
      rowId: expect.any(String),
      data: {
        recipientProfileId: 'parent-profile',
        senderProfileId: 'reply-profile',
        type: 'game_comment',
        title: 'Reply author respondeu ao seu comentário',
        body: 'A reply',
        entityId: 'comment/with spaces?',
        read: false,
      },
    });
    expect(emailTemplateService.renderCommentReplyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        gameName: 'Game name',
        gameUrl:
          'https://frontend.example/jogo/game-name?commentId=comment%2Fwith%20spaces%3F',
      }),
    );
    expect(messaging.createEmail).toHaveBeenCalledWith(
      expect.any(String),
      '[Zetho] Nova resposta ao seu comentário em Game name',
      '<p>reply email</p>',
      [],
      ['parent-user'],
      [],
      [],
      [],
      [],
      false,
      true,
    );
  });

  it('does not create a notification or email for self-replies', async () => {
    const { handler, tablesDB, messaging, emailTemplateService } =
      makeCommentHandler();

    const result = await handler.handleCommentCreate(
      makeComment({ userProfile: 'parent-profile' }),
    );

    expect(result).toEqual({
      success: true,
      message: 'Auto-resposta ignorada.',
    });
    expect(tablesDB.createRow).not.toHaveBeenCalled();
    expect(emailTemplateService.renderCommentReplyEmail).not.toHaveBeenCalled();
    expect(messaging.createEmail).not.toHaveBeenCalled();
  });

  it('uses the frontend and generic game fallbacks when the game is missing', async () => {
    const { handler, messaging, emailTemplateService } = makeCommentHandler({
      game: null,
    });

    await handler.handleCommentCreate(makeComment());

    expect(emailTemplateService.renderCommentReplyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        gameName: 'um jogo',
        gameUrl: 'https://frontend.example/',
      }),
    );
    expect(messaging.createEmail.mock.calls[0][1]).toBe(
      '[Zetho] Nova resposta ao seu comentário',
    );
  });

  it('keeps the in-app notification when the parent profile has no email user', async () => {
    const { handler, tablesDB, messaging, emailTemplateService } =
      makeCommentHandler({
        parentProfile: {
          $id: 'parent-profile',
          gamertag: 'Parent',
        },
      });

    await handler.handleCommentCreate(makeComment());

    expect(tablesDB.createRow).toHaveBeenCalledTimes(1);
    expect(emailTemplateService.renderCommentReplyEmail).not.toHaveBeenCalled();
    expect(messaging.createEmail).not.toHaveBeenCalled();
  });

  it('still sends the email when in-app notification creation fails', async () => {
    const { handler, messaging } = makeCommentHandler({
      notificationError: new Error('notification unavailable'),
    });
    const loggerError = jest
      .spyOn((handler as any).logger, 'error')
      .mockImplementation(() => undefined);

    await expect(handler.handleCommentCreate(makeComment())).resolves.toEqual({
      success: true,
      message: 'E-mail de resposta enviado.',
    });

    expect(loggerError).toHaveBeenCalled();
    expect(messaging.createEmail).toHaveBeenCalledTimes(1);
  });
});
