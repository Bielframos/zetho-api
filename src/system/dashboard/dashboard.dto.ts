import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PublicListsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}

export class VoteCommentDto {
  @IsNotEmpty()
  @IsEnum(['up', 'down'])
  operation: 'up' | 'down';
}

export class CreateEntryCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(350)
  content: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}
