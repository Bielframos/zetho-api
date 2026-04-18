import {
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { Roles } from 'src/common/guards/roles.decorator';
import { IGDBService } from './igdb.service';

@Controller('igdb')
@UseGuards(AppwriteSessionGuard)
export class IGDBController {
  constructor(private readonly igdbService: IGDBService) {}

  @Post('games/:id')
  @Roles(['admin'])
  async addGameById(@Param('id', ParseIntPipe) id: number) {
    return await this.igdbService.importGameById(id);
  }
}
