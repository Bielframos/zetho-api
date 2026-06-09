import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Appwrite } from '../appwrite/appwrite.provider';
import { ID, Query, Models } from 'node-appwrite';
import Redis from 'ioredis';

export interface OutboxEvent {
  type: string;
  payload: any;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private static readonly DB_ID = 'app';
  private static readonly TABLE_ID = 'outbox_events';

  private readonly redis = new Redis(
    process.env.REDIS_URL || 'redis://localhost:6379',
  );

  // Map of event types to handlers
  private handlers = new Map<string, (payload: any) => Promise<void>>();

  constructor(private readonly appwrite: Appwrite) {}

  /**
   * Registers a handler for a specific event type.
   */
  registerHandler(type: string, handler: (payload: any) => Promise<void>) {
    this.handlers.set(type, handler);
  }

  /**
   * Enqueues an event within the context of a transaction.
   * This ensures the event is only committed if the parent transaction succeeds.
   *
   * @param txId The Appwrite transaction ID.
   * @param event The event details.
   */
  async enqueue(txId: string, event: OutboxEvent): Promise<void> {
    try {
      await this.appwrite.tablesDB.createRow({
        databaseId: OutboxService.DB_ID,
        tableId: OutboxService.TABLE_ID,
        rowId: ID.unique(),
        data: {
          type: event.type,
          payload: JSON.stringify(event.payload),
          status: 'PENDING',
        },
        transactionId: txId,
      });
      this.logger.debug(`Enqueued outbox event: ${event.type} in tx ${txId}`);
    } catch (error) {
      this.logger.error(
        `Failed to enqueue outbox event ${event.type}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Enqueues an event immediately without a transaction.
   */
  async enqueueImmediate(event: OutboxEvent): Promise<void> {
    try {
      await this.appwrite.tablesDB.createRow({
        databaseId: OutboxService.DB_ID,
        tableId: OutboxService.TABLE_ID,
        rowId: ID.unique(),
        data: {
          type: event.type,
          payload: JSON.stringify(event.payload),
          status: 'PENDING',
        },
      });
      this.logger.debug(`Enqueued immediate outbox event: ${event.type}`);
      // Trigger processing asynchronously for low latency
      this.processOutbox().catch((err) =>
        this.logger.error('Error in immediate outbox processing', err),
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue immediate outbox event ${event.type}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Background worker to process pending events.
   * Runs every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processOutbox() {
    const lockKey = 'outbox:processing:lock';
    // Try to acquire lock for 55 seconds (so it expires before the next cron run)
    const acquired = await this.redis.set(lockKey, 'locked', 'EX', 55, 'NX');

    if (!acquired) {
      this.logger.debug('Another instance is currently processing the outbox. Skipping.');
      return;
    }

    this.logger.debug('Polling for pending outbox events...');
    try {
      const response = await this.appwrite.tablesDB.listRows<
        Models.Row & {
          type: string;
          payload: string;
          status: string;
          retries: number;
        }
      >({
        databaseId: OutboxService.DB_ID,
        tableId: OutboxService.TABLE_ID,
        queries: [
          Query.equal('status', 'PENDING'),
          Query.orderAsc('$createdAt'),
          Query.limit(50),
        ],
      });

      if (response.rows.length === 0) {
        return;
      }

      this.logger.debug(
        `Found ${response.rows.length} pending events to process.`,
      );

      for (const row of response.rows) {
        await this.processEvent(row);
      }
    } catch (error) {
      this.logger.error(
        'Failed to list outbox events',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async processEvent(
    row: Models.Row & {
      type: string;
      payload: string;
      status: string;
      retries: number;
    },
  ) {
    const handler = this.handlers.get(row.type);
    if (!handler) {
      this.logger.warn(`No handler registered for event type: ${row.type}`);
      return;
    }

    try {
      const payload = JSON.parse(row.payload);
      await handler(payload);

      // Mark as completed
      await this.appwrite.tablesDB.updateRow({
        databaseId: OutboxService.DB_ID,
        tableId: OutboxService.TABLE_ID,
        rowId: row.$id,
        data: { status: 'COMPLETED' },
      });
      this.logger.debug(
        `Successfully processed event ${row.$id} of type ${row.type}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process event ${row.$id} of type ${row.type}`,
        error instanceof Error ? error.stack : String(error),
      );

      const newRetries = (row.retries || 0) + 1;
      const newStatus = newRetries >= 5 ? 'FAILED' : 'PENDING';

      try {
        await this.appwrite.tablesDB.updateRow({
          databaseId: OutboxService.DB_ID,
          tableId: OutboxService.TABLE_ID,
          rowId: row.$id,
          data: { status: newStatus, retries: newRetries },
        });
      } catch (updateError) {
        this.logger.error(
          `Failed to update retry status for event ${row.$id}`,
          updateError instanceof Error
            ? updateError.stack
            : String(updateError),
        );
      }
    }
  }
}
