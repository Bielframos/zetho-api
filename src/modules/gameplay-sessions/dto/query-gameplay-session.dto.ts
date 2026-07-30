import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryGameplaySessionDto {
  @IsOptional()
  @IsEnum(['public', 'my_sessions', 'invites'])
  type?: 'public' | 'my_sessions' | 'invites';

  @IsOptional()
  @IsString()
  gameId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
