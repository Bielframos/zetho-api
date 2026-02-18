import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { RpgModule } from './rpg/rpg.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [DatabaseModule, RpgModule, AiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
