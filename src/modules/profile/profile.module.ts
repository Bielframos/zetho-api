import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { ZCoinsModule } from 'src/modules/zcoins/zcoins.module';

@Module({
  imports: [ZCoinsModule],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [],
})
export class ProfileModule {}
