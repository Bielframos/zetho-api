import { Global, Module } from '@nestjs/common';
import { Database } from './database';

@Global()
@Module({
  providers: [Database],
  exports: [Database],
})
export class DatabaseModule {}
