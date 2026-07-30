import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
  MaxLength,
} from 'class-validator';

export class InviteGameplaySessionDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(36, { each: true })
  invitedProfileIds: string[];
}
