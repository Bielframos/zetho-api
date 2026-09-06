import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

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
