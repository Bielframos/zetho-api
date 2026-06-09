const fs = require('fs');

const filePath = 'src/modules/raffle/raffle.service.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add import
content = content.replace(
  "import { Appwrite } from 'src/common/appwrite/appwrite.provider';",
  "import { Appwrite } from 'src/common/appwrite/appwrite.provider';\nimport { TransactionService } from 'src/common/appwrite/transaction.service';"
);

// 2. Add to constructor
content = content.replace(
  `  constructor(
    private readonly appwrite: Appwrite,
    private readonly loggerContext: LoggerContextService,
  ) {`,
  `  constructor(
    private readonly appwrite: Appwrite,
    private readonly loggerContext: LoggerContextService,
    private readonly transactionService: TransactionService,
  ) {`
);

// 3. Replace transaction block
const oldTxBlock = `        const tx = await this.tablesDB.createTransaction();
        const entryId = ID.unique();
        const txId = ID.unique();

        try {
          await this.tablesDB.createOperations({
            transactionId: tx.$id,
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
            transactionId: tx.$id,
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
            transactionId: tx.$id,
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
        }`;

const newTxBlock = `        const entryId = ID.unique();
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
        });`;

content = content.replace(oldTxBlock, newTxBlock);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Refactored raffle.service.ts');
