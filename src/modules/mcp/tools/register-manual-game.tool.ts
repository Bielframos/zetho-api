import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ManualGameService } from 'src/modules/game/manual-game.service';
import {
  McpToolDefinition,
  McpToolResult,
} from '../interfaces/mcp-tool.interface';

const registerManualGameSchema = {
  name: z
    .string()
    .trim()
    .min(1, 'O nome do jogo é obrigatório.')
    .max(255)
    .describe('Nome oficial do jogo (obrigatório).'),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(295)
    .optional()
    .describe(
      'Slug único para a URL do jogo no Zetho. Se omitido, será gerado automaticamente a partir do nome.',
    ),
  summary: z
    .string()
    .trim()
    .max(1500, 'A sinopse não pode ultrapassar 1500 caracteres.')
    .optional()
    .describe('Sinopse ou descrição detalhada do jogo.'),
  releaseYear: z
    .string()
    .regex(
      /^\d{4}$/,
      'Ano de lançamento deve conter exatamente 4 dígitos (ex: "2024").',
    )
    .optional()
    .describe('Ano de lançamento com 4 dígitos (ex: "2024").'),
  releaseDate: z
    .string()
    .datetime({
      message:
        'Data deve estar no formato ISO 8601 (ex: "2024-11-20T00:00:00.000Z").',
    })
    .optional()
    .describe('Data de lançamento completa em formato ISO 8601.'),
  coverUrl: z
    .string()
    .url('A capa deve ser uma URL pública válida.')
    .optional()
    .describe('URL pública da imagem de capa do jogo.'),
  developer: z
    .string()
    .trim()
    .optional()
    .describe('Nome da desenvolvedora ou estúdio criador.'),
  publisher: z
    .string()
    .trim()
    .optional()
    .describe('Nome da publicadora / publisher.'),
  genres: z
    .array(z.string())
    .optional()
    .describe('Lista de IDs ou nomes dos gêneros do jogo.'),
  aliases: z
    .array(z.string())
    .optional()
    .describe('Nomes alternativos, títulos anteriores ou siglas para busca.'),
};

export type RegisterManualGameInput = z.infer<
  z.ZodObject<typeof registerManualGameSchema>
>;

@Injectable()
export class RegisterManualGameTool implements McpToolDefinition<
  typeof registerManualGameSchema
> {
  readonly name = 'register_manual_game';
  readonly description =
    'Cadastra manualmente um novo jogo no catálogo do Zetho que não possui ficha ou registro no IGDB ' +
    '(ex: jogos indies, protótipos, projetos autorais ou títulos brasileiros sem cadastro internacional).';

  readonly schema = registerManualGameSchema;

  constructor(private readonly manualGameService: ManualGameService) {}

  async execute(args: RegisterManualGameInput): Promise<McpToolResult> {
    try {
      const result = await this.manualGameService.createManualGame(args);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                action: 'created_manually',
                gameId: result.gameId,
                message: `Jogo "${result.game.name}" cadastrado com sucesso no Zetho.`,
                game: result.game,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'MANUAL_CREATION_FAILED',
              message: `Falha ao cadastrar jogo manual: ${message}`,
            }),
          },
        ],
      };
    }
  }
}
