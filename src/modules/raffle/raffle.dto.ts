import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const REWARD_POLICIES = ['one_key', 'all_keys'] as const;
const PLATFORMS = ['steam', 'xbox'] as const;

export type RewardPolicy = (typeof REWARD_POLICIES)[number];
export type Platform = (typeof PLATFORMS)[number];

export class GameKeyDto {
  @IsString()
  @IsNotEmpty({ message: 'key não pode estar vazio' })
  key!: string;

  @IsIn(PLATFORMS, { message: 'platform deve ser steam ou xbox' })
  platform!: Platform;
}

export class CreateRaffleDto {
  @IsString()
  @IsNotEmpty({ message: 'gameId é obrigatório' })
  gameId!: string;

  @IsIn(REWARD_POLICIES, {
    message: 'rewardPolicy deve ser one_key ou all_keys',
  })
  rewardPolicy!: RewardPolicy;

  @IsOptional()
  @IsInt({ message: 'basicProbability deve ser inteiro' })
  @Min(2, { message: 'basicProbability deve ser no mínimo 2' })
  basicProbability?: number = 1000;

  @IsOptional()
  @IsInt({ message: 'ticketPrice deve ser inteiro' })
  @Min(1, { message: 'ticketPrice deve ser no mínimo 1' })
  ticketPrice?: number = 30;
}

export class CreateRaffleWithKeysDto extends CreateRaffleDto {
  @ArrayMinSize(1, { message: 'É necessário pelo menos uma chave' })
  @ValidateNested({ each: true })
  @Type(() => GameKeyDto)
  keys!: GameKeyDto[];
}

export class RegisterKeysDto {
  @ArrayMinSize(1, { message: 'É necessário pelo menos uma chave' })
  @ValidateNested({ each: true })
  @Type(() => GameKeyDto)
  keys!: GameKeyDto[];
}

export class PurchaseTicketsDto {
  @IsInt({ message: 'ticketCount deve ser inteiro' })
  @Min(1, { message: 'ticketCount deve ser no mínimo 1' })
  @Max(10, { message: 'Máximo de 10 tickets por compra' })
  ticketCount!: number;
}
