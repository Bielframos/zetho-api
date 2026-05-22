import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserProfiles } from 'infra/appwrite';
import { ID, Models } from 'node-appwrite';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';
import SCORE_TABLE from './score-table';

type ZCoinTransactionType = 'input' | 'output';

@Injectable()
export class ZCoinsService {
  private readonly tablesDB: Appwrite['databases']['api'];
  private readonly userProfiles: Appwrite['databases']['userProfiles'];

  constructor(private readonly appwrite: Appwrite) {
    this.tablesDB = this.appwrite.databases.api;
    this.userProfiles = this.appwrite.databases.userProfiles;
  }

  async applyInput(userId: string, reason: string) {
    return this.applyTransaction(userId, 'input', reason);
  }

  async applyOutput(userId: string, reason: string) {
    return this.applyTransaction(userId, 'output', reason);
  }

  private async applyTransaction(
    userId: string,
    type: ZCoinTransactionType,
    reason: string,
  ) {
    const safeUserId = userId?.trim();

    if (!safeUserId) {
      throw new BadRequestException('userId é obrigatório');
    }

    const amount = this.resolveAmount(type, reason);
    const profile = await this.getProfileByUserId(safeUserId);

    if (type === 'output') {
      const current = await this.tablesDB.getRow<
        Models.Row & { zcoinBalance?: number }
      >({
        databaseId: 'app',
        tableId: 'user_profiles',
        rowId: profile.$id,
      });

      const currentBalance = Number(current.zcoinBalance ?? 0);
      if (currentBalance < amount) {
        throw new BadRequestException('Saldo insuficiente para essa ação');
      }
    }

    const tx = await this.tablesDB.createTransaction();
    const now = new Date().toISOString();
    const transactionId = ID.unique();

    try {
      await this.tablesDB.createOperations({
        transactionId: tx.$id,
        operations: [
          {
            action: type === 'input' ? 'increment' : 'decrement',
            databaseId: 'app',
            tableId: 'user_profiles',
            rowId: profile.$id,
            data: { value: amount, column: 'zcoinBalance' },
          },
        ],
      });

      await this.tablesDB.createRow({
        transactionId: tx.$id,
        databaseId: 'app',
        tableId: 'zcoin_transactions',
        rowId: transactionId,
        data: {
          userId: safeUserId,
          amount: type === 'input' ? amount : -amount,
          type,
          reason,
        },
      });

      await this.tablesDB.updateTransaction({
        transactionId: tx.$id,
        commit: true,
      });
    } catch (error) {
      await this.tablesDB.updateTransaction({
        transactionId: tx.$id,
        rollback: true,
      });

      throw error;
    }

    const updated = await this.tablesDB.getRow<
      Models.Row & { zcoinBalance?: number }
    >({
      databaseId: 'app',
      tableId: 'user_profiles',
      rowId: profile.$id,
    });

    return {
      userId: safeUserId,
      type,
      reason,
      amount: type === 'input' ? amount : -amount,
      balance: Number(updated.zcoinBalance ?? 0),
    };
  }

  private resolveAmount(type: ZCoinTransactionType, reason: string) {
    const safeReason = reason?.trim();

    if (!safeReason) {
      throw new BadRequestException('reason é obrigatório');
    }

    const reasonValues =
      type === 'input'
        ? (SCORE_TABLE.input as Record<string, number>)
        : (SCORE_TABLE.output as Record<string, number>);
    const amount = reasonValues[safeReason];

    if (!amount) {
      throw new BadRequestException('reason inválido para o tipo informado');
    }

    return amount;
  }

  private async getProfileByUserId(userId: string): Promise<UserProfiles> {
    const result = await this.userProfiles.list({
      queries: (q) => [q.equal('userId', userId), q.limit(1)],
    });

    const profile = result.rows[0];

    if (!profile) {
      throw new NotFoundException('Perfil do usuário não encontrado');
    }

    return profile;
  }
}
