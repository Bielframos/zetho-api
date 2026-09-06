import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { AppwriteHealthIndicator } from './indicators/appwrite-health.indicator';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [AppwriteHealthIndicator],
})
export class HealthModule {}
