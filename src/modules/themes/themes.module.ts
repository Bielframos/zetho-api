import { Module } from '@nestjs/common';
import { ThemesService } from './themes.service';
import { ThemesController, AdminThemesController } from './themes.controller';
import { ZCoinsModule } from '../zcoins/zcoins.module';
import { AppwriteModule } from 'src/common/appwrite/appwrite.module';

@Module({
  imports: [AppwriteModule, ZCoinsModule],
  providers: [ThemesService],
  controllers: [ThemesController, AdminThemesController],
})
export class ThemesModule { }
