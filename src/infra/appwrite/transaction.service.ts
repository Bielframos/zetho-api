import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { Appwrite } from './appwrite.provider';

export interface TransactionalContext {
  txId: string;
}

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(private readonly appwrite: Appwrite) {}

  /**
   * Runs the provided work function within an Appwrite transaction.
   * If the work function throws an error, the transaction is rolled back.
   * Otherwise, the transaction is committed.
   *
   * @param work Function to execute within the transaction context.
   * @returns The result of the work function.
   */
  async runInTransaction<T>(
    work: (context: TransactionalContext) => Promise<T>,
  ): Promise<T> {
    const tx = await this.appwrite.tablesDB.createTransaction();
    const context: TransactionalContext = { txId: tx.$id };

    try {
      const result = await work(context);

      await this.appwrite.tablesDB.updateTransaction({
        transactionId: tx.$id,
        commit: true,
      });

      return result;
    } catch (error) {
      this.logger.error(
        `Transaction ${tx.$id} failed, rolling back`,
        error instanceof Error ? error.stack : String(error),
      );

      try {
        await this.appwrite.tablesDB.updateTransaction({
          transactionId: tx.$id,
          rollback: true,
        });
      } catch (rollbackError) {
        this.logger.error(
          `Failed to rollback transaction ${tx.$id}`,
          rollbackError instanceof Error
            ? rollbackError.stack
            : String(rollbackError),
        );
        // We log the rollback error but still throw the original error
      }

      throw error;
    }
  }
}
