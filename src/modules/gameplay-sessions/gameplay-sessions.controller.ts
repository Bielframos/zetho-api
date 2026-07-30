import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Models } from 'node-appwrite';
import { AppwriteSessionGuard } from 'src/common/guards/session.guard';
import { CreateGameplaySessionDto } from './dto/create-gameplay-session.dto';
import { InviteGameplaySessionDto } from './dto/invite-gameplay-session.dto';
import { QueryGameplaySessionDto } from './dto/query-gameplay-session.dto';
import { RespondGameplaySessionInvitationDto } from './dto/respond-gameplay-session-invitation.dto';
import { UpdateGameplaySessionParticipantDto } from './dto/update-gameplay-session-participant.dto';
import { GameplaySessionsService } from './gameplay-sessions.service';

interface RequestWithUser {
  user: Models.User;
}

@Controller('api/gameplay-sessions')
@UseGuards(AppwriteSessionGuard)
export class GameplaySessionsController {
  constructor(
    private readonly gameplaySessionsService: GameplaySessionsService,
  ) {}

  @Post()
  async create(
    @Req() req: RequestWithUser,
    @Body() dto: CreateGameplaySessionDto,
  ) {
    return await this.gameplaySessionsService.createSession(req.user.$id, dto);
  }

  @Get()
  async list(
    @Req() req: RequestWithUser,
    @Query() query: QueryGameplaySessionDto,
  ) {
    return await this.gameplaySessionsService.listSessions(req.user.$id, query);
  }

  @Get(':id')
  async getOne(@Req() req: RequestWithUser, @Param('id') id: string) {
    return await this.gameplaySessionsService.getSessionById(req.user.$id, id);
  }

  @Post(':id/join-requests')
  async requestToJoin(@Req() req: RequestWithUser, @Param('id') id: string) {
    return await this.gameplaySessionsService.requestToJoin(req.user.$id, id);
  }

  @Post(':id/invitations/respond')
  async respondToInvitation(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: RespondGameplaySessionInvitationDto,
  ) {
    return await this.gameplaySessionsService.respondToInvitation(
      req.user.$id,
      id,
      dto.action,
    );
  }

  @Post(':id/leave')
  async leave(@Req() req: RequestWithUser, @Param('id') id: string) {
    return await this.gameplaySessionsService.leave(req.user.$id, id);
  }

  @Patch(':id/participants/:participantId')
  async updateParticipant(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body() dto: UpdateGameplaySessionParticipantDto,
  ) {
    return await this.gameplaySessionsService.updateParticipant(
      req.user.$id,
      id,
      participantId,
      dto.action,
    );
  }

  @Post(':id/invite')
  async invite(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: InviteGameplaySessionDto,
  ) {
    return await this.gameplaySessionsService.inviteParticipants(
      req.user.$id,
      id,
      dto,
    );
  }

  @Delete(':id/cancel')
  async cancel(@Req() req: RequestWithUser, @Param('id') id: string) {
    return await this.gameplaySessionsService.cancelSession(req.user.$id, id);
  }
}

@Controller('api/notifications')
@UseGuards(AppwriteSessionGuard)
export class NotificationsApiController {
  constructor(
    private readonly gameplaySessionsService: GameplaySessionsService,
  ) {}

  @Get()
  async getNotifications(@Req() req: RequestWithUser) {
    return await this.gameplaySessionsService.getNotifications(req.user.$id);
  }

  @Patch(':id/read')
  async markAsRead(@Req() req: RequestWithUser, @Param('id') id: string) {
    return await this.gameplaySessionsService.markNotificationAsRead(
      req.user.$id,
      id,
    );
  }

  @Delete(':id')
  async delete(@Req() req: RequestWithUser, @Param('id') id: string) {
    await this.gameplaySessionsService.deleteNotification(req.user.$id, id);
    return { deleted: true };
  }
}
