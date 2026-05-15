import {
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { Roles } from 'src/common/guards/roles.decorator';
import { SystemApiKeyGuard } from 'src/common/guards/system-api.guard';
import { IGDBService } from './igdb.service';
import { RegisterGameDto } from './igdb.dto';

@Controller('igdb')
export class IGDBController {
  constructor(private readonly igdbService: IGDBService) {}

  @Post('games/popular-sync')
  @UseGuards(SystemApiKeyGuard)
  async syncPopularGames() {
    return await this.igdbService.syncPopularGames();
  }

  @Post('games/:id')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['admin'])
  async addGameById(
    @Param('id', ParseIntPipe) id: number,
    @Query() dto?: RegisterGameDto,
  ) {
    return await this.igdbService.importGameById(id, { force: dto?.force });
  }
}
