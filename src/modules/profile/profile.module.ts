import { AchievementsModule } from '../achievements/achievements.module';
import { ProfileSharingService } from './profile-sharing.service';
import { ProfileComparisonController } from './profile-comparison.controller';
import {
  ProfileComparisonService,
  ComparisonSessionReader,
} from './profile-comparison.service';
import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { ZCoinsModule } from 'src/modules/zcoins/zcoins.module';
import { ProfileEntriesService } from './profile-entries.service';

@Module({
  imports: [ZCoinsModule, AchievementsModule],
  controllers: [ProfileController, ProfileComparisonController],
  providers: [
    ProfileService,
    ProfileSharingService,
    ProfileEntriesService,
    ProfileComparisonService,
    ComparisonSessionReader,
  ],
  exports: [],
})
export class ProfileModule {}
