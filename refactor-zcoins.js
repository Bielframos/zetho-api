const fs = require('fs');

const filePath = 'src/modules/zcoins/zcoins.service.ts';
let content = fs.readFileSync(filePath, 'utf-8');

content = content.replace(
  "import { Appwrite } from 'src/common/appwrite/appwrite.provider';",
  "import { Appwrite } from 'src/common/appwrite/appwrite.provider';\nimport { TransactionService } from 'src/common/appwrite/transaction.service';"
);

content = content.replace(
  `  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly appwrite: Appwrite,
    private readonly loggerContext: LoggerContextService,
  ) {`,
  `  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly appwrite: Appwrite,
    private readonly loggerContext: LoggerContextService,
    private readonly transactionService: TransactionService,
  ) {`
);

const oldTxBlock = `        const tx = await this.tablesDB.createTransaction();
        const transactionId = ID.unique();

        try {
          await this.tablesDB.createOperations({
            transactionId: tx.$id,
            operations: [
              {
                action: type === 'input' ? 'increment' : 'decrement',
                databaseId: ZCoinsService.DB_ID,
                tableId: 'user_profiles',
                rowId: profile.$id,
                data: { value: amount, column: 'zcoinBalance' },
              },
            ],
          });

          await this.tablesDB.createRow({
            transactionId: tx.$id,
            databaseId: ZCoinsService.DB_ID,
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
        }`;

const newTxBlock = `        const transactionId = ID.unique();

        await this.transactionService.runInTransaction(async (ctx) => {
          await this.tablesDB.createOperations({
            transactionId: ctx.txId,
            operations: [
              {
                action: type === 'input' ? 'increment' : 'decrement',
                databaseId: ZCoinsService.DB_ID,
                tableId: 'user_profiles',
                rowId: profile.$id,
                data: { value: amount, column: 'zcoinBalance' },
              },
            ],
          });

          await this.tablesDB.createRow({
            transactionId: ctx.txId,
            databaseId: ZCoinsService.DB_ID,
            tableId: 'zcoin_transactions',
            rowId: transactionId,
            data: {
              userId: safeUserId,
              amount: type === 'input' ? amount : -amount,
              type,
              reason,
            },
          });
        });`;

content = content.replace(oldTxBlock, newTxBlock);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Refactored zcoins.service.ts');
