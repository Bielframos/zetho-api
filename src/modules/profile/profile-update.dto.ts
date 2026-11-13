import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
export class ProfileUpdateDto {
  @IsOptional() @IsString() @MaxLength(128) gamertag?: string;
  @IsOptional() @IsString() @MaxLength(512) bio?: string | null;
  @IsOptional() @IsString() @MaxLength(98) socialXbox?: string | null;
  @IsOptional() @IsString() @MaxLength(98) socialSteam?: string | null;
  @IsOptional() @IsString() @MaxLength(98) socialPsn?: string | null;
  @IsOptional() @IsString() @MaxLength(98) socialNintendo?: string | null;
  @IsOptional() @IsUrl({ require_tld: false }) avatarUrl?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(36, { each: true })
  favoriteGameIds?: string[];
}
