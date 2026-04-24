import {
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { Roles } from 'src/common/guards/roles.decorator';
import { SystemApiKeyGuard } from 'src/common/guards/system-api.guard';
import { IGDBService } from './igdb.service';

@Controller('igdb')
export class IGDBController {
  constructor(private readonly igdbService: IGDBService) {}

  @Post('games/:id')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['admin'])
  async addGameById(@Param('id', ParseIntPipe) id: number) {
    return await this.igdbService.importGameById(id);
  }

  @Post('games/popular-sync')
  @UseGuards(SystemApiKeyGuard)
  async syncPopularGames() {
    return await this.igdbService.syncPopularGames();
  }
}
