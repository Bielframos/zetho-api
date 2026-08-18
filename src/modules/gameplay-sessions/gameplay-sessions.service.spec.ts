import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EmailTemplateService } from '../notifications/email-template.service';
import { GameplaySessionsService } from './gameplay-sessions.service';

type Row = Record<string, any> & { $id: string };

class MemoryTablesDB {
  tables = new Map<string, Row[]>();
  transactionMutations: Array<string | undefined> = [];

  seed(tableId: string, rows: Row[]) {
    this.tables.set(
      tableId,
      rows.map((row) => ({ ...row })),
    );
  }

  async createRow(params: any) {
    this.transactionMutations.push(params.transactionId);
    const row = {
      $createdAt: new Date().toISOString(),
      $updatedAt: new Date().toISOString(),
      ...params.data,
      $id: params.rowId,
    };
    const rows = this.tables.get(params.tableId) ?? [];
    if (
      params.tableId === 'gameplay_session_participants' &&
      rows.some(
        (current) =>
          current.sessionId === row.sessionId &&
          current.profileId === row.profileId,
      )
    ) {
      throw Object.assign(new Error('duplicate'), { code: 409 });
    }
    rows.push(row);
    this.tables.set(params.tableId, rows);
    return { ...row };
  }

  async getRow(params: any) {
    const row = (this.tables.get(params.tableId) ?? []).find(
      (current) => current.$id === params.rowId,
    );
    if (!row) throw new Error('not found');
    return { ...row };
  }

  async updateRow(params: any) {
    this.transactionMutations.push(params.transactionId);
    const rows = this.tables.get(params.tableId) ?? [];
    const index = rows.findIndex((row) => row.$id === params.rowId);
    if (index < 0) throw new Error('not found');
    rows[index] = {
      ...rows[index],
      ...Object.fromEntries(
        Object.entries(params.data ?? {}).filter(
          ([, value]) => value !== undefined,
        ),
      ),
      $updatedAt: new Date().toISOString(),
    };
    return { ...rows[index] };
  }

  async deleteRow(params: any) {
    this.transactionMutations.push(params.transactionId);
    const rows = this.tables.get(params.tableId) ?? [];
    const index = rows.findIndex((row) => row.$id === params.rowId);
    if (index < 0) throw new Error('not found');
    rows.splice(index, 1);
  }

  async listRows(params: any) {
    let rows = [...(this.tables.get(params.tableId) ?? [])];
    let limit = 25;
    let offset = 0;
    for (const raw of params.queries ?? []) {
      const query = JSON.parse(raw);
      if (query.method === 'equal') {
        rows = rows.filter((row) =>
          query.values.includes(row[query.attribute]),
        );
      } else if (query.method === 'notEqual') {
        rows = rows.filter(
          (row) => !query.values.includes(row[query.attribute]),
        );
      } else if (query.method === 'lessThan') {
        rows = rows.filter((row) => row[query.attribute] < query.values[0]);
      } else if (query.method === 'limit') {
        limit = query.values[0];
      } else if (query.method === 'offset') {
        offset = query.values[0];
      } else if (query.method === 'orderDesc') {
        rows.sort((a, b) =>
          String(b[query.attribute]).localeCompare(String(a[query.attribute])),
        );
      }
    }
    const total = rows.length;
    return {
      total,
      rows: rows.slice(offset, offset + limit).map((r) => ({ ...r })),
    };
  }
}

describe('GameplaySessionsService', () => {
  let tablesDB: MemoryTablesDB;
  let service: GameplaySessionsService;
  let outbox: { enqueueImmediate: jest.Mock };
  let transactionChain: Promise<void>;

  const future = new Date(Date.now() + 86_400_000).toISOString();
  const host = {
    $id: 'host-profile',
    userId: 'host-user',
    gamertag: 'Host',
    avatarUrl: 'host.png',
  };
  const guest = {
    $id: 'guest-profile',
    userId: 'guest-user',
    gamertag: 'Guest',
    avatarUrl: 'guest.png',
  };
  const other = {
    $id: 'other-profile',
    userId: 'other-user',
    gamertag: 'Other',
    avatarUrl: null,
  };

  beforeEach(() => {
    tablesDB = new MemoryTablesDB();
    tablesDB.seed('user_profiles', [host, guest, other] as Row[]);
    tablesDB.seed('gameplay_sessions', []);
    tablesDB.seed('gameplay_session_participants', []);
    tablesDB.seed('notifications', []);
    tablesDB.seed('outbox_events', []);
    outbox = { enqueueImmediate: jest.fn().mockResolvedValue(undefined) };
    transactionChain = Promise.resolve();
    const transactions = {
      runInTransaction: jest.fn(async (work: any) => {
        let release!: () => void;
        const previous = transactionChain;
        transactionChain = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await work({ txId: `tx-${Date.now()}-${Math.random()}` });
        } finally {
          release();
        }
      }),
    };
    const appwrite = {
      tablesDB,
      messaging: { createEmail: jest.fn().mockResolvedValue({}) },
    };
    service = new GameplaySessionsService(
      appwrite as never,
      new EmailTemplateService(),
      outbox as never,
      transactions as never,
    );
  });

  async function createSession(
    privacy: 'public' | 'closed' = 'public',
    maxPlayers = 3,
  ) {
    return await service.createSession('host-user', {
      gameId: 'game-1',
      gameName: 'Game',
      title: 'Ranked',
      scheduledAt: future,
      privacy,
      maxPlayers,
    });
  }

  function participants() {
    return tablesDB.tables.get('gameplay_session_participants') ?? [];
  }

  function seedNotification(overrides: Record<string, unknown>) {
    tablesDB.seed('notifications', [
      {
        $id: 'notification-1',
        $createdAt: new Date().toISOString(),
        recipientProfileId: guest.$id,
        senderProfileId: host.$id,
        type: 'system',
        title: 'Notification',
        body: 'Notification body',
        read: false,
        ...overrides,
      },
    ] as Row[]);
  }

  it('creates the Jogatina with one confirmed host and a consistent count', async () => {
    const session = await createSession();
    expect(session.confirmedCount).toBe(1);
    expect(participants()).toEqual([
      expect.objectContaining({
        sessionId: session.$id,
        profileId: host.$id,
        status: 'confirmed',
        isHost: true,
      }),
    ]);
  });

  it('enriches summaries with host and current participant status', async () => {
    const session = await createSession();
    await service.requestToJoin('guest-user', session.$id);
    const result = await service.listSessions('guest-user', { type: 'public' });
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        host: { $id: host.$id, gamertag: 'Host', avatarUrl: 'host.png' },
        myParticipantStatus: 'pending',
      }),
    );
  });

  it('returns enriched participant profiles in detail', async () => {
    const session = await createSession();
    const detail = await service.getSessionById('host-user', session.$id);
    expect(detail.participants[0].profile).toEqual({
      $id: host.$id,
      gamertag: 'Host',
      avatarUrl: 'host.png',
    });
  });

  it('restricts a private detail to host and related participants', async () => {
    const session = await createSession('closed');
    await expect(
      service.getSessionById('guest-user', session.$id),
    ).rejects.toThrow(ForbiddenException);
    await service.inviteParticipants('host-user', session.$id, {
      invitedProfileIds: [guest.$id],
    });
    await expect(
      service.getSessionById('guest-user', session.$id),
    ).resolves.toEqual(expect.objectContaining({ $id: session.$id }));
  });

  it('revokes private detail access after the relationship becomes terminal', async () => {
    const session = await createSession('closed');
    const invitation = await service.inviteParticipants(
      'host-user',
      session.$id,
      { invitedProfileIds: [guest.$id] },
    );
    await service.updateParticipant(
      'host-user',
      session.$id,
      invitation.invited[0].$id,
      'cancel_invite',
    );
    await expect(
      service.getSessionById('guest-user', session.$id),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects sessions scheduled in the past', async () => {
    await expect(
      service.createSession('host-user', {
        gameId: 'game-1',
        gameName: 'Game',
        title: 'Past session',
        scheduledAt: new Date(Date.now() - 60_000).toISOString(),
        privacy: 'public',
        maxPlayers: 4,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates an idempotent pending request without reserving capacity', async () => {
    const session = await createSession();
    const first = await service.requestToJoin('guest-user', session.$id);
    const notificationCount = (tablesDB.tables.get('notifications') ?? [])
      .length;
    const second = await service.requestToJoin('guest-user', session.$id);
    expect(second.$id).toBe(first.$id);
    expect(
      participants().filter((p) => p.profileId === guest.$id),
    ).toHaveLength(1);
    expect(
      (tablesDB.tables.get('gameplay_sessions') ?? [])[0].confirmedCount,
    ).toBe(1);
    expect(tablesDB.tables.get('notifications')).toHaveLength(
      notificationCount,
    );
  });

  it.each(['rejected', 'removed', 'cancelled'])(
    'blocks a new request after %s',
    async (status) => {
      const session = await createSession();
      participants().push({
        $id: `terminal-${status}`,
        sessionId: session.$id,
        profileId: guest.$id,
        status,
        isHost: false,
      });
      await expect(
        service.requestToJoin('guest-user', session.$id),
      ).rejects.toThrow(ForbiddenException);
    },
  );

  it('approves and rejects pending requests through host actions', async () => {
    const session = await createSession();
    const pending = await service.requestToJoin('guest-user', session.$id);
    const approved = await service.updateParticipant(
      'host-user',
      session.$id,
      pending.$id,
      'approve',
    );
    expect(approved.status).toBe('confirmed');
    expect(
      (tablesDB.tables.get('gameplay_sessions') ?? [])[0].confirmedCount,
    ).toBe(2);

    const pendingOther = await service.requestToJoin('other-user', session.$id);
    const rejected = await service.updateParticipant(
      'host-user',
      session.$id,
      pendingOther.$id,
      'reject',
    );
    expect(rejected.status).toBe('rejected');
  });

  it('checks capacity at approval time and prevents concurrent overbooking', async () => {
    const session = await createSession('public', 2);
    const guestPending = await service.requestToJoin('guest-user', session.$id);
    const otherPending = await service.requestToJoin('other-user', session.$id);
    const results = await Promise.allSettled([
      service.updateParticipant(
        'host-user',
        session.$id,
        guestPending.$id,
        'approve',
      ),
      service.updateParticipant(
        'host-user',
        session.$id,
        otherPending.$id,
        'approve',
      ),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(
      participants().filter(
        (participant) => participant.status === 'confirmed',
      ),
    ).toHaveLength(2);
  });

  it('reopens a removed relationship as one invitation and accepts it', async () => {
    const session = await createSession('closed');
    participants().push({
      $id: 'old-relation',
      sessionId: session.$id,
      profileId: guest.$id,
      status: 'removed',
      isHost: false,
    });
    const invitation = await service.inviteParticipants(
      'host-user',
      session.$id,
      { invitedProfileIds: [guest.$id, guest.$id] },
    );
    expect(invitation.invited).toHaveLength(1);
    expect(invitation.invited[0].$id).toBe('old-relation');
    const accepted = await service.respondToInvitation(
      'guest-user',
      session.$id,
      'accept',
    );
    expect(accepted.status).toBe('confirmed');
    expect(
      participants().filter((p) => p.profileId === guest.$id),
    ).toHaveLength(1);
  });

  it('declines and cancels invitations explicitly', async () => {
    const first = await createSession('closed');
    await service.inviteParticipants('host-user', first.$id, {
      invitedProfileIds: [guest.$id],
    });
    await expect(
      service.respondToInvitation('guest-user', first.$id, 'decline'),
    ).resolves.toEqual(expect.objectContaining({ status: 'declined' }));

    const second = await createSession('closed');
    const invitation = await service.inviteParticipants(
      'host-user',
      second.$id,
      { invitedProfileIds: [other.$id] },
    );
    await expect(
      service.updateParticipant(
        'host-user',
        second.$id,
        invitation.invited[0].$id,
        'cancel_invite',
      ),
    ).resolves.toEqual(expect.objectContaining({ status: 'cancelled' }));
  });

  it('removes a confirmed participant and lets a confirmed participant leave', async () => {
    const first = await createSession();
    const pending = await service.requestToJoin('guest-user', first.$id);
    await service.updateParticipant(
      'host-user',
      first.$id,
      pending.$id,
      'approve',
    );
    await expect(
      service.updateParticipant('host-user', first.$id, pending.$id, 'remove'),
    ).resolves.toEqual(expect.objectContaining({ status: 'removed' }));

    const second = await createSession();
    const pendingOther = await service.requestToJoin('other-user', second.$id);
    await service.updateParticipant(
      'host-user',
      second.$id,
      pendingOther.$id,
      'approve',
    );
    await expect(service.leave('other-user', second.$id)).resolves.toEqual(
      expect.objectContaining({ status: 'left' }),
    );
  });

  it('cancels active relations and blocks later mutations', async () => {
    const session = await createSession();
    await service.requestToJoin('guest-user', session.$id);
    await service.cancelSession('host-user', session.$id);
    expect(participants().find((p) => p.profileId === guest.$id)?.status).toBe(
      'cancelled',
    );
    await expect(
      service.requestToJoin('other-user', session.$id),
    ).rejects.toThrow(BadRequestException);
  });

  it('hydrates a game comment target URL with an encoded comment id', async () => {
    const commentId = 'comment/with spaces?';
    seedNotification({
      type: 'game_comment',
      entityId: commentId,
    });
    tablesDB.seed('game_comments', [
      { $id: commentId, gameId: 'game-1' },
    ] as Row[]);
    tablesDB.seed('games', [{ $id: 'game-1', slug: 'game-name' }] as Row[]);
    const listRows = jest.spyOn(tablesDB, 'listRows');

    const result = await service.getNotifications('guest-user');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        type: 'game_comment',
        entityId: commentId,
        targetUrl: '/jogo/game-name?commentId=comment%2Fwith%20spaces%3F',
        participantId: undefined,
        actionStatus: undefined,
      }),
    );
    expect(
      listRows.mock.calls.some(
        ([params]) => params.tableId === 'gameplay_session_participants',
      ),
    ).toBe(false);
  });

  it('keeps listing a game comment notification when the comment is missing', async () => {
    seedNotification({
      type: 'game_comment',
      entityId: 'missing-comment',
    });

    const result = await service.getNotifications('guest-user');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        type: 'game_comment',
        targetUrl: undefined,
      }),
    );
  });

  it.each([
    ['game is missing', []],
    ['game has no slug', [{ $id: 'game-1' }]],
  ])(
    'keeps listing a game comment notification when the %s',
    async (_scenario, games) => {
      seedNotification({
        type: 'game_comment',
        entityId: 'comment-1',
      });
      tablesDB.seed('game_comments', [
        { $id: 'comment-1', gameId: 'game-1' },
      ] as Row[]);
      tablesDB.seed('games', games as Row[]);

      const result = await service.getNotifications('guest-user');

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].targetUrl).toBeUndefined();
    },
  );

  it('preserves entry comment behavior without target or participant hydration', async () => {
    seedNotification({
      type: 'entry_comment',
      entityId: 'entry-1',
    });
    const listRows = jest.spyOn(tablesDB, 'listRows');

    const result = await service.getNotifications('guest-user');

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        type: 'entry_comment',
        entityId: 'entry-1',
        targetUrl: undefined,
        participantId: undefined,
        actionStatus: undefined,
      }),
    );
    expect(
      listRows.mock.calls.some(
        ([params]) => params.tableId === 'gameplay_session_participants',
      ),
    ).toBe(false);
  });

  it('returns invitation action status independently from read state', async () => {
    const session = await createSession('closed');
    await service.inviteParticipants('host-user', session.$id, {
      invitedProfileIds: [guest.$id],
    });
    const invitationNotification = (
      tablesDB.tables.get('notifications') ?? []
    ).find((notification) => notification.type === 'session_invite')!;
    expect(invitationNotification.$createdAt).toEqual(expect.any(String));
    expect(invitationNotification.createdAt).toBeUndefined();
    await service.markNotificationAsRead(
      'guest-user',
      invitationNotification.$id,
    );
    const result = await service.getNotifications('guest-user');
    const notification = result.rows.find(
      (row) => row.$id === invitationNotification.$id,
    );
    expect(notification).toEqual(
      expect.objectContaining({
        read: true,
        participantId: expect.any(String),
        actionStatus: 'invited',
      }),
    );
  });

  it('deletes only notifications owned by the authenticated profile', async () => {
    const session = await createSession('closed');
    await service.inviteParticipants('host-user', session.$id, {
      invitedProfileIds: [guest.$id],
    });
    const notification = (tablesDB.tables.get('notifications') ?? [])[0];

    await expect(
      service.deleteNotification('host-user', notification.$id),
    ).rejects.toThrow(ForbiddenException);
    await service.deleteNotification('guest-user', notification.$id);
    expect(tablesDB.tables.get('notifications')).toHaveLength(0);
  });

  it('uses transaction ids for participant and counter mutations', async () => {
    const session = await createSession();
    const pending = await service.requestToJoin('guest-user', session.$id);
    await service.updateParticipant(
      'host-user',
      session.$id,
      pending.$id,
      'approve',
    );
    const participantMutations = tablesDB.transactionMutations.filter(Boolean);
    expect(participantMutations.length).toBeGreaterThan(1);
  });
});
