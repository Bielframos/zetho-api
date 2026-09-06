import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProfileThemeType } from 'src/infra/appwrite/appwrite.enums';

export class CreateThemeDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsEnum(ProfileThemeType)
  type: ProfileThemeType;

  @Type(() => Number)
  @IsNumber()
  price: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  backgroundImageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  tertiaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(36)
  gameId?: string;
}
