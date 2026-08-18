import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RatingsFeedQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 12;
}

export class VoteRatingDto {
  @IsNotEmpty()
  @IsEnum(['up', 'down'])
  operation: 'up' | 'down';
}

export class CreateRatingDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0.5)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  content?: string;
}
