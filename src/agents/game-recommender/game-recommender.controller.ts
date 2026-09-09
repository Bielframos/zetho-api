import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Get,
  Query,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Models } from 'node-appwrite';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { Roles } from 'src/common/guards/roles.decorator';
import { CreateGameRecommendationDto } from './dto/create-game-recommendation.dto';
import { GameRecommenderService } from './game-recommender.service';

@Controller('agents/game-recommender')
export class GameRecommenderController {
  constructor(private readonly recommender: GameRecommenderService) {}

  @Get('suggestions')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['user'])
  async history(
    @Req() request: { user: Models.User<Models.Preferences> },
    @Query('limit') rawLimit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = rawLimit === undefined ? 20 : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new BadRequestException('limit deve ser um inteiro entre 1 e 50.');
    }
    if (
      cursor !== undefined &&
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,35}$/.test(cursor)
    ) {
      throw new BadRequestException('Cursor inválido.');
    }
    return this.recommender.history(request.user.$id, limit, cursor);
  }

  @Post('suggestions')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['user'])
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createSuggestion(
    @Req() request: { user: Models.User<Models.Preferences> },
    @Headers('idempotency-key')
    rawIdempotencyKey: string | string[] | undefined,
    @Body() dto: CreateGameRecommendationDto,
  ) {
    const idempotencyKey = this.validateIdempotencyKey(rawIdempotencyKey);
    return this.recommender.suggest(
      request.user.$id,
      dto.scope ?? 'any',
      idempotencyKey,
    );
  }

  private validateIdempotencyKey(value: string | string[] | undefined) {
    if (Array.isArray(value) || typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException('Idempotency-Key é obrigatório.');
    }
    const normalized = value.trim();
    if (
      normalized.length > 128 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)
    ) {
      throw new BadRequestException('Idempotency-Key inválido.');
    }
    return normalized;
  }
}
