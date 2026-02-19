import { Global, Module } from '@nestjs/common';
import { Appwrite } from './appwrite.provider';

@Global()
@Module({
  providers: [Appwrite],
  exports: [Appwrite],
})
export class AppwriteModule {}
