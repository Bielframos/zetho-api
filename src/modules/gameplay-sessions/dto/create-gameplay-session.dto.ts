import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateGameplaySessionDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(36)
  gameId: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  gameName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  gameCoverUrl?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsNotEmpty()
  @IsISO8601()
  scheduledAt: string;

  @IsNotEmpty()
  @IsEnum(['closed', 'public'])
  privacy: 'closed' | 'public';

  @IsNotEmpty()
  @IsInt()
  @Min(2)
  @Max(100)
  maxPlayers: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(36, { each: true })
  invitedProfileIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tags?: string[];
}
