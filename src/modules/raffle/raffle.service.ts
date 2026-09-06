import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { ID, Models, Query } from 'node-appwrite';
import { Appwrite } from 'src/infra/appwrite/appwrite.provider';
import { TransactionService } from 'src/infra/appwrite/transaction.service';
import { LoggerContextService } from 'src/common/observability/logger-context.service';
import type {
  CreateRaffleDto,
  CreateRaffleWithKeysDto,
  PurchaseTicketsDto,
  RegisterKeysDto,
} from './raffle.dto';

type RewardPolicy = 'one_key' | 'all_keys';
type GameKeyStatus = 'available' | 'delivered';
type GameKeyPlatform = 'steam' | 'xbox';

type Raffle = Models.Row & {
  game?: string;
  rewardPolicy?: RewardPolicy;
  basicProbability?: number;
  ticketPrice?: number;
  active?: boolean;
  activatedAt?: string | null;
  closedAt?: string | null;
};

type RaffleEntry = Models.Row & {
  raffleId: string;
  userId: string;
  ticketCount: number;
  totalCost: number;
  luckyNumbers?: string[] | null;
  won?: boolean;
  drawNumber: string;
};

type GameKey = Models.Row & {
  gameId: string;
  raffleId: string;
  key: string;
  status?: GameKeyStatus;
  platform?: GameKeyPlatform;
  userWinnerId?: string | null;
};

type RaffleWithAvailableKeys = Raffle & {
  availableKeysCount: number;
  availableKeyPlatforms: GameKeyPlatform[];
};

@Injectable()
export class RaffleService {
  private static readonly DAILY_TICKET_LIMIT = 10;
  private static readonly MONTHLY_BONUS_PER_INVITE = 5;
  private static readonly MONTHLY_BONUS_MAX_INVITES = 3;
  private static readonly DB_ID = 'app';
  private readonly logger = new Logger(RaffleService.name);

  private readonly tablesDB: Appwrite['tablesDB'];

  constructor(
    private readonly appwrite: Appwrite,
    private readonly loggerContext: LoggerContextService,
    private readonly transactionService: TransactionService,
  ) {
    this.tablesDB = this.appwrite.tablesDB;
  }

  async createRaffle(dto: CreateRaffleDto) {
    return this.loggerContext.trackLifecycle(
      this.logger,
      {
        component: RaffleService.name,
        operation: 'raffle.create',
        metadata: {
          gameId: dto.gameId,
          rewardPolicy: dto.rewardPolicy,
        },
      },
      async () =>
        this.tablesDB.createRow<Raffle>({
          databaseId: RaffleService.DB_ID,
          tableId: 'raffles',
          rowId: ID.unique(),
          data: {
            game: dto.gameId,
            rewardPolicy: dto.rewardPolicy,
            basicProbability: dto.basicProbability,
            ticketPrice: dto.ticketPrice,
            active: false,
          },
        }),
    );
  }

  async createRaffleWithKeys(dto: CreateRaffleWithKeysDto) {
    return this.loggerContext.trackLifecycle(
      this.logger,
      {
        component: RaffleService.name,
        operation: 'raffle.create-with-keys',
        metadata: {
          gameId: dto.gameId,
          keyCount: dto.keys.length,
        },
      },
      async () => {
        const raffle = await this.tablesDB.createRow<Raffle>({
          databaseId: RaffleService.DB_ID,
          tableId: 'raffles',
          rowId: ID.unique(),
          data: {
            game: dto.gameId,
            rewardPolicy: dto.rewardPolicy,
            basicProbability: dto.basicProbability,
            ticketPrice: dto.ticketPrice,
            active: false,
          },
        });

        await this.insertKeys(raffle.$id, dto.gameId, dto.keys);

        return {
          raffle,
          keysRegistered: dto.keys.length,
        };
      },
    );
  }

  async registerKeys(raffleId: string, dto: RegisterKeysDto) {
    return this.loggerContext.trackLifecycle(
      this.logger,
      {
        component: RaffleService.name,
        operation: 'raffle.register-keys',
        metadata: {
          raffleId,
          keyCount: dto.keys.length,
        },
      },
      async () => {
        const raffle = await this.getRaffleOrThrow(raffleId);

        await this.insertKeys(raffle.$id, raffle.game as string, dto.keys);

        return {
          raffleId,
          keysRegistered: dto.keys.length,
        };
      },
    );
  }

  async activateRaffle(raffleId: string) {
    return this.loggerContext.trackLifecycle(
      this.logger,
      {
        component: RaffleService.name,
        operation: 'raffle.activate',
        metadata: {
          raffleId,
        },
      },
      async () => {
        const raffle = await this.getRaffleOrThrow(raffleId);

        if (raffle.active) {
          throw new ConflictException('Sorteio já está ativo');
        }

        const availableKeys = await this.countAvailableKeys(raffleId);
        if (availableKeys === 0) {
          throw new UnprocessableEntityException(
            'Não é possível ativar um sorteio sem chaves disponíveis',
          );
        }

        return this.tablesDB.updateRow<Raffle>({
          databaseId: RaffleService.DB_ID,
          tableId: 'raffles',
          rowId: raffleId,
          data: {
            active: true,
            activatedAt: new Date().toISOString(),
          },
        });
      },
    );
  }

  async listRaffles(options: {
    active?: boolean;
    limit?: number;
    cursor?: string;
    gameId?: string;
  }) {
    const queries: string[] = [
      Query.select([
        '*',
        'game.$id',
        'game.name',
        'game.slug',
        'game.coverUrl',
      ]),
    ];

    if (options.active !== undefined) {
      queries.push(Query.equal('active', options.active));
    }

    if (options.gameId) {
      queries.push(Query.equal('game', options.gameId));
    }

    queries.push(Query.orderDesc('$createdAt'));
    queries.push(Query.limit(options.limit ?? 20));

    if (options.cursor) {
      queries.push(Query.cursorAfter(options.cursor));
    }

    const result = await this.tablesDB.listRows<Raffle>({
      databaseId: RaffleService.DB_ID,
      tableId: 'raffles',
      queries,
    });

    const raffles = await Promise.all(
      result.rows.map(async (raffle) => ({
        ...raffle,
        ...(await this.getAvailableKeysSummary(raffle.$id)),
      })),
    );

    return {
      total: result.total,
      raffles,
    };
  }

  async getUserEntries(raffleId: string, userId: string) {
    const entries = await this.tablesDB.listRows<RaffleEntry>({
      databaseId: RaffleService.DB_ID,
      tableId: 'raffle_entries',
      queries: [
        Query.equal('raffleId', raffleId),
        Query.equal('userId', userId),
        Query.orderDesc('$createdAt'),
        Query.limit(1000),
      ],
    });

    return {
      total: entries.total,
      entries: entries.rows,
    };
  }

  async purchaseTickets(
    raffleId: string,
    userId: string,
    dto: PurchaseTicketsDto,
  ) {
    return this.loggerContext.trackLifecycle(
      this.logger,
      {
        component: RaffleService.name,
        operation: 'raffle.purchase-tickets',
        metadata: {
          raffleId,
          userId,
          ticketCount: dto.ticketCount,
        },
      },
      async () => {
        const raffle = await this.getRaffleOrThrow(raffleId);

        if (!raffle.active) {
          throw new BadRequestException('Sorteio não está ativo');
        }

        const basicProbability = raffle.basicProbability ?? 1000;
        const ticketPrice = raffle.ticketPrice ?? 30;
        const baseTotalCost = dto.ticketCount * ticketPrice;

        await this.validateDailyTicketLimit(raffleId, userId, dto.ticketCount);

        const profile = await this.getProfileByUserId(userId);
        const currentBalance = Number(profile.zcoinBalance ?? 0);

        const bonus = await this.getMonthlyInviteBonus(userId);
        const discountPercent = bonus.bonusPercent;
        const discountAmount = baseTotalCost * (discountPercent / 100);
        const totalCost = Math.max(
          0,
          Math.floor(baseTotalCost - discountAmount),
        );

        if (currentBalance < totalCost) {
          throw new BadRequestException(
            `Saldo insuficiente. Necessário: ${totalCost} ZCoins, disponível: ${currentBalance}`,
          );
        }

        const luckyNumbers = Array.from({ length: dto.ticketCount }, () =>
          String(randomInt(1, basicProbability + 1)),
        );
        const drawNumber = String(randomInt(1, basicProbability + 1));
        const won = luckyNumbers.includes(drawNumber);

        const entryId = ID.unique();
        const txId = ID.unique();

        await this.transactionService.runInTransaction(async (ctx) => {
          await this.tablesDB.createOperations({
            transactionId: ctx.txId,
            operations: [
              {
                action: 'decrement',
                databaseId: RaffleService.DB_ID,
                tableId: 'user_profiles',
                rowId: profile.$id,
                data: { value: totalCost, column: 'zcoinBalance' },
              },
            ],
          });

          await this.tablesDB.createRow({
            transactionId: ctx.txId,
            databaseId: RaffleService.DB_ID,
            tableId: 'zcoin_transactions',
            rowId: txId,
            data: {
              userId,
              amount: -totalCost,
              type: 'output',
              reason: 'raffle_ticket_purchase',
            },
          });

          await this.tablesDB.createRow<RaffleEntry>({
            transactionId: ctx.txId,
            databaseId: RaffleService.DB_ID,
            tableId: 'raffle_entries',
            rowId: entryId,
            data: {
              raffleId,
              userId,
              ticketCount: dto.ticketCount,
              totalCost,
              luckyNumbers,
              won,
              drawNumber,
            },
          });
        });

        let wonKey: GameKey | null = null;

        if (won) {
          wonKey = await this.deliverKey(raffleId, userId);

          if (wonKey) {
            await this.handleRaffleClose(raffle);
          } else {
            await this.closeRaffle(raffleId);
          }
        }

        const updatedProfile = await this.tablesDB.getRow<
          Models.Row & { zcoinBalance?: number }
        >({
          databaseId: RaffleService.DB_ID,
          tableId: 'user_profiles',
          rowId: profile.$id,
        });

        return {
          entryId,
          raffleId,
          userId,
          ticketCount: dto.ticketCount,
          baseTotalCost,
          discountPercent,
          discountAmount,
          totalCost,
          luckyNumbers,
          drawNumber,
          won,
          wonKey: wonKey
            ? { platform: wonKey.platform, key: wonKey.key }
            : null,
          newBalance: Number(updatedProfile.zcoinBalance ?? 0),
        };
      },
    );
  }

  async getWonKeys(userId: string) {
    const keys = await this.tablesDB.listRows<GameKey>({
      databaseId: RaffleService.DB_ID,
      tableId: 'game_keys',
      queries: [
        Query.equal('userWinnerId', userId),
        Query.equal('status', 'delivered'),
        Query.orderDesc('$createdAt'),
      ],
    });

    return {
      total: keys.total,
      keys: keys.rows.map((k) => ({
        $id: k.$id,
        gameId: k.gameId,
        raffleId: k.raffleId,
        key: k.key,
        platform: k.platform,
        wonAt: k.$createdAt,
      })),
    };
  }

  private async insertKeys(
    raffleId: string,
    gameId: string,
    keys: Array<{ key: string; platform: string }>,
  ) {
    const rows = keys.map((k) => ({
      $id: ID.unique(),
      gameId,
      raffleId,
      key: k.key,
      platform: k.platform,
      status: 'available' as GameKeyStatus,
    }));

    await this.tablesDB.createRows({
      databaseId: RaffleService.DB_ID,
      tableId: 'game_keys',
      rows,
    });
  }

  private async deliverKey(
    raffleId: string,
    userId: string,
  ): Promise<GameKey | null> {
    const result = await this.tablesDB.listRows<GameKey>({
      databaseId: RaffleService.DB_ID,
      tableId: 'game_keys',
      queries: [
        Query.equal('raffleId', raffleId),
        Query.equal('status', 'available'),
        Query.limit(1),
      ],
    });

    const key = result.rows[0];

    if (!key) {
      return null;
    }

    await this.tablesDB.updateRow<GameKey>({
      databaseId: RaffleService.DB_ID,
      tableId: 'game_keys',
      rowId: key.$id,
      data: {
        status: 'delivered',
        userWinnerId: userId,
      },
    });

    return { ...key, status: 'delivered', userWinnerId: userId };
  }

  private async handleRaffleClose(raffle: Raffle) {
    if (raffle.rewardPolicy === 'one_key') {
      await this.closeRaffle(raffle.$id);
      return;
    }

    if (raffle.rewardPolicy === 'all_keys') {
      const remaining = await this.countAvailableKeys(raffle.$id);
      if (remaining === 0) {
        await this.closeRaffle(raffle.$id);
      }
    }
  }

  private async closeRaffle(raffleId: string) {
    await this.tablesDB.updateRow<Raffle>({
      databaseId: RaffleService.DB_ID,
      tableId: 'raffles',
      rowId: raffleId,
      data: {
        active: false,
        closedAt: new Date().toISOString(),
      },
    });
  }

  private async countAvailableKeys(raffleId: string): Promise<number> {
    const result = await this.tablesDB.listRows<GameKey>({
      databaseId: RaffleService.DB_ID,
      tableId: 'game_keys',
      queries: [
        Query.equal('raffleId', raffleId),
        Query.equal('status', 'available'),
        Query.limit(1),
      ],
    });

    return result.total;
  }

  private async getAvailableKeysSummary(raffleId: string): Promise<{
    availableKeysCount: number;
    availableKeyPlatforms: GameKeyPlatform[];
  }> {
    const result = await this.tablesDB.listRows<GameKey>({
      databaseId: RaffleService.DB_ID,
      tableId: 'game_keys',
      queries: [
        Query.equal('raffleId', raffleId),
        Query.equal('status', 'available'),
        Query.select(['platform']),
        Query.limit(100),
      ],
    });

    const platforms = result.rows
      .map((key) => key.platform)
      .filter(
        (platform): platform is GameKeyPlatform => platform !== undefined,
      );

    const availableKeyPlatforms = Array.from(new Set(platforms));

    return {
      availableKeysCount: result.total,
      availableKeyPlatforms,
    };
  }

  private async validateDailyTicketLimit(
    raffleId: string,
    userId: string,
    requested: number,
  ) {
    const now = new Date();
    const brazilDate = now.toLocaleDateString('sv-SE', {
      timeZone: 'America/Sao_Paulo',
    });
    const startOfDay = new Date(`${brazilDate}T00:00:00-03:00`);

    const entries = await this.tablesDB.listRows<RaffleEntry>({
      databaseId: RaffleService.DB_ID,
      tableId: 'raffle_entries',
      queries: [
        Query.equal('raffleId', raffleId),
        Query.equal('userId', userId),
        Query.greaterThanEqual('$createdAt', startOfDay.toISOString()),
        Query.select(['ticketCount']),
        Query.limit(100),
      ],
    });

    const usedToday = entries.rows.reduce(
      (sum, e) => sum + Number(e.ticketCount ?? 0),
      0,
    );

    const remaining = RaffleService.DAILY_TICKET_LIMIT - usedToday;

    if (remaining <= 0) {
      throw new BadRequestException(
        `Limite diário de ${RaffleService.DAILY_TICKET_LIMIT} tickets por sorteio atingido`,
      );
    }

    if (requested > remaining) {
      throw new BadRequestException(
        `Você pode comprar no máximo ${remaining} ticket(s) hoje neste sorteio`,
      );
    }
  }

  private async getRaffleOrThrow(raffleId: string): Promise<Raffle> {
    try {
      return await this.tablesDB.getRow<Raffle>({
        databaseId: RaffleService.DB_ID,
        tableId: 'raffles',
        rowId: raffleId,
      });
    } catch {
      throw new NotFoundException(`Sorteio ${raffleId} não encontrado`);
    }
  }

  private async getProfileByUserId(userId: string) {
    const result = await this.tablesDB.listRows<
      Models.Row & { zcoinBalance?: number; userId?: string }
    >({
      databaseId: RaffleService.DB_ID,
      tableId: 'user_profiles',
      queries: [Query.equal('userId', userId), Query.limit(1)],
    });

    const profile = result.rows[0];

    if (!profile) {
      throw new NotFoundException('Perfil do usuário não encontrado');
    }

    return profile;
  }

  private async getMonthlyInviteBonus(userId: string) {
    const periodStart = this.getCurrentMonthStart();
    const invitedUsers = await this.getInvitedUsersInMonth(userId, periodStart);
    const eligibleInvites = Math.min(
      invitedUsers.size,
      RaffleService.MONTHLY_BONUS_MAX_INVITES,
    );

    return {
      invitedUsersCount: invitedUsers.size,
      eligibleInvites,
      bonusPercent: eligibleInvites * RaffleService.MONTHLY_BONUS_PER_INVITE,
    };
  }

  private getCurrentMonthStart() {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    ).toISOString();
  }

  private async getInvitedUsersInMonth(userId: string, start: string) {
    const invitedUserIds = new Set<string>();
    const pageSize = 100;
    let offset = 0;

    while (true) {
      const page = await this.tablesDB.listRows<
        Models.Row & { metadata?: string }
      >({
        databaseId: RaffleService.DB_ID,
        tableId: 'app_logs',
        queries: [
          Query.equal('type', 'invite_applied'),
          Query.equal('relatedUserId', userId),
          Query.greaterThanEqual('$createdAt', start),
          Query.select(['metadata']),
          Query.limit(pageSize),
          Query.offset(offset),
        ],
      });

      for (const row of page.rows) {
        if (!row.metadata) {
          continue;
        }

        try {
          const parsed = JSON.parse(row.metadata) as { invitedUserId?: string };
          if (parsed.invitedUserId) {
            invitedUserIds.add(parsed.invitedUserId);
          }
        } catch {
          // Ignora logs com metadata inválida.
        }
      }

      offset += page.rows.length;
      if (offset >= page.total || page.rows.length === 0) {
        break;
      }
    }

    return invitedUserIds;
  }
}
