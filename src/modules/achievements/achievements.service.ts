import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Models, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TransactionService } from 'src/infra/appwrite/transaction.service';
import { OutboxService } from 'src/infra/events/outbox.service';
import { JSDOM } from 'jsdom';
type Row = Models.Row & { [key: string]: any };
const DB = 'app';
const BADGES = {
  soulslike_3: { threshold: 3, amount: 30 },
  reviews_5: { threshold: 5, amount: 25 },
  sessions_3: { threshold: 3, amount: 20 },
} as const;
const BADGE_COPY = {
  soulslike_3: {
    name: 'Desbravador de Soulslike',
    description: 'Conclua 3 jogos classificados como Soulslike.',
  },
  reviews_5: {
    name: 'Crítico Ativo',
    description: 'Escreva 5 reviews com mais de 300 caracteres visíveis.',
  },
  sessions_3: {
    name: 'Líder de Esquadrão',
    description: 'Crie e conclua 3 Jogatinas.',
  },
} as const;
type Badge = keyof typeof BADGES;
function visibleReviewLength(content: unknown): number {
  if (typeof content !== 'string') return 0;
  const fragment = JSDOM.fragment(content);
  fragment
    .querySelectorAll('script, style, template')
    .forEach((node) => node.remove());
  return (fragment.textContent ?? '').replace(/\u00a0/g, ' ').trim().length;
}
const stableId = (kind: string, value: string) =>
  createHash('sha256').update(`${kind}:${value}`).digest('hex').slice(0, 32);
@Injectable()
export class AchievementsService implements OnModuleInit {
  constructor(
    private readonly appwrite: Appwrite,
    private readonly tx: TransactionService,
    private readonly outbox: OutboxService,
  ) {}
  onModuleInit() {
    this.outbox.registerHandler(
      'D8_ENTRY_COMPLETED',
      async ({ profileId, gameId, createdAt }) => {
        await this.recordCompletion(profileId, gameId, createdAt);
        await this.reconcile(profileId, 'soulslike_3');
      },
    );
    this.outbox.registerHandler(
      'GAMEPLAY_SESSION_COMPLETED',
      async ({ hostProfileId }) => {
        await this.reconcile(hostProfileId, 'sessions_3');
      },
    );
    this.outbox.registerHandler('D8_RATING_CHANGED', async ({ profileId }) => {
      await this.reconcile(profileId, 'reviews_5');
    });
  }
  private get db() {
    return this.appwrite.tablesDB;
  }
  private async page(tableId: string, queries: string[] = []): Promise<Row[]> {
    const rows: Row[] = [];
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.db.listRows<Row>({
        databaseId: DB,
        tableId,
        queries: [
          ...queries,
          Query.orderAsc('$id'),
          Query.limit(100),
          ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ],
      });
      rows.push(...batch.rows);
      if (batch.rows.length < 100) return rows;
      cursor = batch.rows.at(-1)?.$id;
    }
  }
  private async profile(profileId: string): Promise<Row> {
    try {
      return await this.db.getRow<Row>({
        databaseId: DB,
        tableId: 'user_profiles',
        rowId: profileId,
      });
    } catch {
      throw new NotFoundException('Perfil não encontrado');
    }
  }
  async profileForUser(userId: string) {
    const rows = await this.page('user_profiles', [
      Query.equal('userId', userId),
    ]);
    if (!rows[0]) throw new NotFoundException('Perfil não encontrado');
    return rows[0];
  }
  async getAnnualGoal(profileId: string, year: number) {
    this.validateYear(year);
    const profile = await this.profile(profileId);
    const goals = await this.page('annual_goals', [
      Query.equal('profileId', profileId),
      Query.equal('year', year),
    ]);
    const completed = await this.db.listRows<Row>({
      databaseId: DB,
      tableId: 'completion_events',
      queries: [
        Query.equal('profileId', profileId),
        Query.equal('year', year),
        Query.limit(1),
      ],
    });
    return {
      profileId,
      year,
      target: goals[0]?.target ?? null,
      completed: completed.total,
    };
  }
  async setAnnualGoal(
    userId: string,
    profileId: string,
    year: number,
    target: number,
  ) {
    this.validateYear(year);
    if (!Number.isInteger(target) || target < 1 || target > 1000)
      throw new BadRequestException('Meta deve estar entre 1 e 1000');
    const profile = await this.profile(profileId);
    if (profile.userId !== userId)
      throw new ForbiddenException('Perfil não pertence ao usuário');
    const rowId = stableId('annual_goal', `${profileId}:${year}`);
    try {
      await this.db.createRow({
        databaseId: DB,
        tableId: 'annual_goals',
        rowId,
        data: { profileId, year, target },
      });
    } catch (error) {
      if ((error as any)?.code !== 409) throw error;
      await this.db.updateRow({
        databaseId: DB,
        tableId: 'annual_goals',
        rowId,
        data: { target },
      });
    }
    return this.getAnnualGoal(profileId, year);
  }
  private validateYear(year: number) {
    if (!Number.isInteger(year) || year < 2020 || year > 2100)
      throw new BadRequestException('Ano inválido');
  }
  async recordCompletion(profileId: string, gameId: string, createdAt: string) {
    const year = new Date(createdAt).getUTCFullYear();
    this.validateYear(year);
    const rowId = stableId('completion', `${profileId}:${year}:${gameId}`);
    try {
      await this.db.createRow({
        databaseId: DB,
        tableId: 'completion_events',
        rowId,
        data: { profileId, year, gameId },
      });
    } catch (error) {
      if ((error as any)?.code !== 409) throw error;
    }
  }
  async listBadges(profileId: string) {
    await this.profile(profileId);
    const rows = await this.page('user_badges', [
      Query.equal('profileId', profileId),
    ]);
    return rows.map(({ badgeId, $createdAt }: Row) => ({
      badgeId,
      unlockedAt: $createdAt,
    }));
  }
  async getBadgeCatalog(profileId: string) {
    const profile = await this.profile(profileId);
    const [counts, unlocked] = await Promise.all([
      this.countProgress(profile),
      this.listBadges(profileId),
    ]);
    const unlockedAt = new Map(
      unlocked.map((badge) => [badge.badgeId, badge.unlockedAt]),
    );
    const showcased = new Set<string>(profile.showcaseBadges ?? []);
    return (Object.keys(BADGES) as Badge[]).map((id) => ({
      id,
      ...BADGE_COPY[id],
      threshold: BADGES[id].threshold,
      rewardZCoins: BADGES[id].amount,
      progress: counts[id] ?? 0,
      unlockedAt: unlockedAt.get(id) ?? null,
      showcased: showcased.has(id) && unlockedAt.has(id),
    }));
  }
  async getShowcase(profileId: string) {
    const profile = await this.profile(profileId);
    const unlocked = new Set(
      (await this.listBadges(profileId)).map((x) => x.badgeId),
    );
    return {
      profileId,
      badges: (profile.showcaseBadges ?? []).filter((id: string) =>
        unlocked.has(id),
      ),
    };
  }
  async setShowcase(userId: string, profileId: string, badges: string[]) {
    const profile = await this.profile(profileId);
    if (profile.userId !== userId)
      throw new ForbiddenException('Perfil não pertence ao usuário');
    if (
      !Array.isArray(badges) ||
      badges.length > 3 ||
      new Set(badges).size !== badges.length ||
      badges.some((x) => typeof x !== 'string' || !(x in BADGES))
    )
      throw new BadRequestException('Vitrine inválida');
    const unlocked = new Set(
      (await this.listBadges(profileId)).map((x) => x.badgeId),
    );
    if (badges.some((x) => !unlocked.has(x)))
      throw new BadRequestException('Medalha não desbloqueada');
    await this.db.updateRow({
      databaseId: DB,
      tableId: 'user_profiles',
      rowId: profileId,
      data: { showcaseBadges: badges },
    });
    return { profileId, badges };
  }
  private async countProgress(
    profile: Row,
    only?: Badge,
  ): Promise<Partial<Record<Badge, number>>> {
    const counts: Partial<Record<Badge, number>> = {};
    if (!only || only === 'soulslike_3') {
      const completed = await this.page('completion_events', [
        Query.equal('profileId', profile.$id),
      ]);
      const gameIds = [
        ...new Set(completed.map((x) => x.gameId).filter(Boolean)),
      ];
      let souls = 0;
      for (let i = 0; i < gameIds.length; i += 100) {
        const games = await this.db.listRows<Row>({
          databaseId: DB,
          tableId: 'games',
          queries: [
            Query.equal('$id', gameIds.slice(i, i + 100)),
            Query.limit(100),
          ],
        });
        souls += games.rows.filter((game) =>
          (game.subgenres ?? []).includes('soulslike'),
        ).length;
      }
      counts.soulslike_3 = souls;
    }
    if (!only || only === 'reviews_5') {
      const ratings = await this.page('ratings', [
        Query.equal('ownerFingerprint', profile.fingerprint),
      ]);
      counts.reviews_5 = ratings.filter(
        (x) => visibleReviewLength(x.content) > 300,
      ).length;
    }
    if (!only || only === 'sessions_3') {
      const sessions = await this.page('gameplay_sessions', [
        Query.equal('hostProfileId', profile.$id),
        Query.equal('status', 'completed'),
      ]);
      counts.sessions_3 = sessions.length;
    }
    return counts;
  }
  async reconcile(profileId: string, only?: Badge) {
    const profile = await this.profile(profileId);
    const counts = await this.countProgress(profile, only);
    for (const badgeId of Object.keys(counts) as Badge[])
      if ((counts[badgeId] ?? 0) >= BADGES[badgeId].threshold)
        await this.award(profile, badgeId);
    return { profileId, counts, unlocked: await this.listBadges(profileId) };
  }
  private async award(profile: Row, badgeId: Badge) {
    const id = stableId('badge', `${profile.$id}:${badgeId}`);
    try {
      await this.tx.runInTransaction(async ({ txId }) => {
        await this.db.createRow({
          databaseId: DB,
          tableId: 'user_badges',
          rowId: id,
          data: { profileId: profile.$id, badgeId },
          transactionId: txId,
        });
        await this.db.createRow({
          databaseId: DB,
          tableId: 'zcoin_transactions',
          rowId: stableId('badge_ledger', id),
          data: {
            userId: profile.userId,
            amount: BADGES[badgeId].amount,
            type: 'input',
            reason: `badge:${badgeId}`,
          },
          transactionId: txId,
        });
        await this.db.createOperations({
          transactionId: txId,
          operations: [
            {
              action: 'increment',
              databaseId: DB,
              tableId: 'user_profiles',
              rowId: profile.$id,
              data: { column: 'zcoinBalance', value: BADGES[badgeId].amount },
            },
          ],
        });
      });
    } catch (error) {
      if ((error as any)?.code !== 409) throw error;
    }
  }
}
