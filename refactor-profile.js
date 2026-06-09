const fs = require('fs');

const filePath = 'src/modules/profile/profile.service.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add import
content = content.replace(
  "import { Appwrite } from 'src/common/appwrite/appwrite.provider';",
  "import { Appwrite } from 'src/common/appwrite/appwrite.provider';\nimport { TransactionService } from 'src/common/appwrite/transaction.service';"
);

// 2. Add to constructor
content = content.replace(
  `  constructor(
    private appwrite: Appwrite,
    private readonly zCoinsService: ZCoinsService,
  ) {`,
  `  constructor(
    private appwrite: Appwrite,
    private readonly zCoinsService: ZCoinsService,
    private readonly transactionService: TransactionService,
  ) {`
);

// 3. Replace transaction block
const oldTxBlock = `    const tx = await this.tablesDB.createTransaction();

    try {
      await this.tablesDB.createOperations({
        transactionId: tx.$id,
        operations: [
          {
            action: 'increment',
            databaseId: 'app',
            tableId: 'user_profiles',
            rowId: inviterProfile.$id,
            data: { value: rewardAmount, column: 'zcoinBalance' },
          },
        ],
      });

      await this.tablesDB.createRow({
        transactionId: tx.$id,
        databaseId: 'app',
        tableId: 'zcoin_transactions',
        rowId: crypto.randomUUID(),
        data: {
          userId: inviterProfile.userId,
          amount: rewardAmount,
          type: 'input',
          reason: 'friend_joined',
        },
      });

      await this.tablesDB.createRow({
        transactionId: tx.$id,
        databaseId: 'app',
        tableId: 'app_logs',
        rowId: logRowId,
        data: {
          type: 'invite_applied',
          relatedUserId: inviterProfile.userId,
          metadata: JSON.stringify({
            inviteCode: rawInviteCode,
            invitedUserId: params.invitedUserId,
            invitedProfileId: params.invitedProfileId,
            inviterProfileId: inviterProfile.$id,
            rewardAmount,
          }),
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

const newTxBlock = `    await this.transactionService.runInTransaction(async (ctx) => {
      await this.tablesDB.createOperations({
        transactionId: ctx.txId,
        operations: [
          {
            action: 'increment',
            databaseId: 'app',
            tableId: 'user_profiles',
            rowId: inviterProfile.$id,
            data: { value: rewardAmount, column: 'zcoinBalance' },
          },
        ],
      });

      await this.tablesDB.createRow({
        transactionId: ctx.txId,
        databaseId: 'app',
        tableId: 'zcoin_transactions',
        rowId: crypto.randomUUID(),
        data: {
          userId: inviterProfile.userId,
          amount: rewardAmount,
          type: 'input',
          reason: 'friend_joined',
        },
      });

      await this.tablesDB.createRow({
        transactionId: ctx.txId,
        databaseId: 'app',
        tableId: 'app_logs',
        rowId: logRowId,
        data: {
          type: 'invite_applied',
          relatedUserId: inviterProfile.userId,
          metadata: JSON.stringify({
            inviteCode: rawInviteCode,
            invitedUserId: params.invitedUserId,
            invitedProfileId: params.invitedProfileId,
            inviterProfileId: inviterProfile.$id,
            rewardAmount,
          }),
        },
      });
    });`;

content = content.replace(oldTxBlock, newTxBlock);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Refactored profile.service.ts');
