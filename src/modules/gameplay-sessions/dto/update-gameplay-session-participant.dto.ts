import { IsEnum, IsNotEmpty } from 'class-validator';

export class UpdateGameplaySessionParticipantDto {
  @IsNotEmpty()
  @IsEnum(['approve', 'reject', 'remove', 'cancel_invite'])
  action: 'approve' | 'reject' | 'remove' | 'cancel_invite';
}
