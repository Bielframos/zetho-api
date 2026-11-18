import { Module } from '@nestjs/common';
import { ThemesService } from './themes.service';
import { ThemesController, AdminThemesController } from './themes.controller';
import { ZCoinsModule } from '../zcoins/zcoins.module';
import { AppwriteModule } from 'src/infra/appwrite/appwrite.module';
import { SpecialThemesController } from './special-themes.controller';
import { SpecialThemesService } from './special-themes.service';

@Module({
  imports: [AppwriteModule, ZCoinsModule],
  providers: [ThemesService, SpecialThemesService],
  controllers: [ThemesController, AdminThemesController, SpecialThemesController],
})
export class ThemesModule {}
