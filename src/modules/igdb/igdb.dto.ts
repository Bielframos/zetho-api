import { IsBoolean } from 'class-validator';

class RegisterGameDto {
  @IsBoolean()
  force?: boolean;
}

export { RegisterGameDto };
