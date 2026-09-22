import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { AppwriteHealthIndicator } from './indicators/appwrite-health.indicator';
import { HealthController } from './health.controller';
import { AppwriteModule } from '../../infra/appwrite/appwrite.module';

@Module({
  imports: [TerminusModule, AppwriteModule],
  controllers: [HealthController],
  providers: [AppwriteHealthIndicator],
})
export class HealthModule {}
