import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  Matches,
} from 'class-validator';

/** Identificador Appwrite de um jogo usado nos endpoints autenticados. */
export class GameIdParamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  gameId!: string;
}

export class SearchGamesDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  q?: string;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/)
  year?: string;

  @IsOptional()
  @IsString()
  @Matches(/^igdb_\d+$/)
  developer?: string;

  @IsOptional()
  @IsString()
  @Matches(/^igdb_\d+$/)
  publisher?: string;

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
  pageSize?: number = 12;

  @IsOptional()
  @IsString()
  fingerprint?: string;
}

export class HypedUpcomingDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 12;

  @IsOptional()
  @IsString()
  fingerprint?: string;
}
