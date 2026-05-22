import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Models } from 'node-appwrite';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import {
  CreateRaffleDto,
  CreateRaffleWithKeysDto,
  PurchaseTicketsDto,
  RegisterKeysDto,
} from './raffle.dto';
import { RaffleService } from './raffle.service';
import { Roles } from 'src/common/guards/roles.decorator';

@Controller('raffles')
export class RaffleController {
  constructor(private readonly raffleService: RaffleService) {}

  /**
   * Cria um sorteio vazio (sem chaves).
   */
  @Post()
  @UseGuards(AppwriteSessionGuard)
  @Roles(['admin'])
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createRaffle(@Body() dto: CreateRaffleDto) {
    return await this.raffleService.createRaffle(dto);
  }

  /**
   * Cria um sorteio com chaves já registradas.
   */
  @Post('with-keys')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['admin'])
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async createRaffleWithKeys(@Body() dto: CreateRaffleWithKeysDto) {
    return await this.raffleService.createRaffleWithKeys(dto);
  }

  /**
   * Lista sorteios com filtro opcional por status ativo.
   */
  @Get()
  async listRaffles(
    @Query('active') active?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('gameId') gameId?: string,
  ) {
    return await this.raffleService.listRaffles({
      active: active !== undefined ? active === 'true' : undefined,
      limit: this.parsePositiveInt(limit, 20),
      cursor,
      gameId,
    });
  }

  /**
   * Retorna as entradas do usuário autenticado para um sorteio específico.
   */
  @Get(':raffleId/entries')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['user'])
  async getMyEntries(@Param('raffleId') raffleId: string, @Req() req: any) {
    const user = req.user as Models.User;
    return await this.raffleService.getUserEntries(raffleId, user.$id);
  }

  /**
   * Ativa um sorteio. Requer autenticação via sessão e papel de admin.
   */
  @Patch(':raffleId/activate')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['admin'])
  async activateRaffle(@Param('raffleId') raffleId: string) {
    return await this.raffleService.activateRaffle(raffleId);
  }

  /**
   * Registra chaves para um sorteio existente.
   * Requer autenticação via sessão e papel de admin.
   */
  @Post(':raffleId/keys')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['admin'])
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async registerKeys(
    @Param('raffleId') raffleId: string,
    @Body() dto: RegisterKeysDto,
  ) {
    return await this.raffleService.registerKeys(raffleId, dto);
  }

  /**
   * Compra tickets para um sorteio.
   * Requer autenticação via sessão.
   */
  @Post(':raffleId/tickets')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['user'])
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async purchaseTickets(
    @Param('raffleId') raffleId: string,
    @Req() req: any,
    @Body() dto: PurchaseTicketsDto,
  ) {
    const user = req.user as Models.User;
    return await this.raffleService.purchaseTickets(raffleId, user.$id, dto);
  }

  /**
   * Retorna as chaves ganhas pelo usuário autenticado.
   */
  @Get('my-keys')
  @UseGuards(AppwriteSessionGuard)
  @Roles(['user'])
  async getMyKeys(@Req() req: any) {
    const user = req.user as Models.User;
    return await this.raffleService.getWonKeys(user.$id);
  }

  private parsePositiveInt(value: string | undefined, fallback: number) {
    if (!value) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
