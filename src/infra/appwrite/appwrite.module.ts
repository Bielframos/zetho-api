import { Global, Module } from '@nestjs/common';
import { Appwrite } from './appwrite.provider';
import { TransactionService } from './transaction.service';

@Global()
@Module({
  providers: [Appwrite, TransactionService],
  exports: [Appwrite, TransactionService],
})
export class AppwriteModule {}
