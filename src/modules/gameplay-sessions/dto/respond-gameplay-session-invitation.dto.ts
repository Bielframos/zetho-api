import { IsEnum, IsNotEmpty } from 'class-validator';

export class RespondGameplaySessionInvitationDto {
  @IsNotEmpty()
  @IsEnum(['accept', 'decline'])
  action: 'accept' | 'decline';
}
