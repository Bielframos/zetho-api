import { PostsStatus } from 'infra/appwrite';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePostDto {
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  subtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  slug?: string;

  @IsString()
  @MaxLength(8000)
  body!: string;

  @IsString()
  @MaxLength(1024)
  mainImage!: string;

  @IsOptional()
  @IsEnum(PostsStatus)
  status?: PostsStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedGameIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  seo?: string;

  @IsOptional()
  @IsUrl()
  originalSourceUrl?: string;

  @IsString()
  authorId!: string;
}

export class SearchPostsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsEnum(PostsStatus)
  status?: PostsStatus;

  @IsOptional()
  @IsString()
  authorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  tag?: string;

  @IsOptional()
  @IsString()
  gameId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class PopularTagsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class SitemapPostsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  pageSize?: number;
}
