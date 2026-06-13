import { IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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
