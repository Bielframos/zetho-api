import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { RpgModule } from './rpg/rpg.module';

@Module({
  imports: [DatabaseModule, RpgModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
