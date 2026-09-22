import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { ZCoinsModule } from 'src/modules/zcoins/zcoins.module';
import { ProfileEntriesService } from './profile-entries.service';

@Module({
  imports: [ZCoinsModule],
  controllers: [ProfileController],
  providers: [ProfileService, ProfileEntriesService],
  exports: [],
})
export class ProfileModule {}
