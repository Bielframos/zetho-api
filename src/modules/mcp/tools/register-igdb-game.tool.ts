import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { IGDBService } from 'src/modules/igdb/igdb.service';
import { IGDBGame } from 'src/modules/igdb/igdb.types';
import {
  McpToolDefinition,
  McpToolResult,
} from '../interfaces/mcp-tool.interface';

const registerIgdbGameSchema = {
  igdbId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'ID numérico do jogo no IGDB (ex: 1020). Se conhecido, priorize este identificador exato.',
    ),
  query: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      'Nome ou termo de busca do jogo para pesquisar no IGDB caso o igdbId não seja conhecido.',
    ),
  force: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Força o registro mesmo se a categoria for filtrada (ex: DLCs, expansões, edições secundárias).',
    ),
  searchOnly: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Se true, apenas pesquisa e retorna os candidatos do IGDB com IDs e anos, sem persistir nada no banco.',
    ),
};

export type RegisterIgdbGameInput = z.infer<
  z.ZodObject<typeof registerIgdbGameSchema>
>;

@Injectable()
export class RegisterIgdbGameTool implements McpToolDefinition<
  typeof registerIgdbGameSchema
> {
  readonly name = 'register_igdb_game';
  readonly description =
    'Registra ou atualiza um jogo no catálogo do Zetho importando metadados do IGDB. ' +
    'Permite passar diretamente o ID numérico do IGDB (igdbId) ou um termo de busca (query) para ' +
    'pesquisar e registrar automaticamente o melhor resultado.';

  readonly schema = registerIgdbGameSchema;

  constructor(private readonly igdbService: IGDBService) {}

  async execute(args: RegisterIgdbGameInput): Promise<McpToolResult> {
    const { igdbId, query, force = false, searchOnly = false } = args;

    if (!igdbId && !query) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'MISSING_PARAM',
              message:
                'É necessário informar "igdbId" (número) ou "query" (nome do jogo) para registrar ou pesquisar.',
            }),
          },
        ],
      };
    }

    // Modo 1: Apenas busca / pré-visualização de candidatos
    if (searchOnly) {
      return await this.handleSearchOnly(query, igdbId);
    }

    // Modo 2: Registro direto por IGDB ID
    if (igdbId) {
      return await this.handleImportById(igdbId, force);
    }

    // Modo 3: Busca e registro automático do melhor resultado
    return await this.handleSearchAndRegister(query!, force);
  }

  private async handleSearchOnly(
    query?: string,
    igdbId?: number,
  ): Promise<McpToolResult> {
    try {
      const rawResults: unknown = query
        ? await this.igdbService.searchGames(query, 10)
        : await this.igdbService.getGamesByIds([igdbId!], 1);

      const results = (rawResults ?? []) as IGDBGame[];

      const candidates = results.map((game) => ({
        igdbId: game.id,
        name: game.name,
        slug: game.slug,
        firstReleaseDate: game.first_release_date
          ? new Date(game.first_release_date * 1000).toISOString().split('T')[0]
          : null,
        summary: game.summary ? `${game.summary.slice(0, 200)}...` : null,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                mode: 'search_only',
                query: query || String(igdbId),
                count: candidates.length,
                candidates,
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
              error: 'IGDB_SEARCH_ERROR',
              message: `Falha ao buscar jogos no IGDB: ${message}`,
            }),
          },
        ],
      };
    }
  }

  private async handleImportById(
    igdbId: number,
    force: boolean,
  ): Promise<McpToolResult> {
    try {
      const result = await this.igdbService.importGameById(igdbId, { force });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                action: 'imported',
                igdbId,
                gameId: result.gameId,
                message: result.message,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: unknown) {
      return this.formatError(error, igdbId);
    }
  }

  private async handleSearchAndRegister(
    query: string,
    force: boolean,
  ): Promise<McpToolResult> {
    try {
      const rawResults: unknown = await this.igdbService.searchGames(query, 5);
      const results = (rawResults ?? []) as IGDBGame[];

      if (results.length === 0) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'NO_RESULTS_FOUND',
                message: `Nenhum jogo encontrado no IGDB com a busca "${query}".`,
              }),
            },
          ],
        };
      }

      const topMatch = results[0];
      const otherCandidates = results.slice(1).map((g) => ({
        igdbId: g.id,
        name: g.name,
        slug: g.slug,
        firstReleaseDate: g.first_release_date
          ? new Date(g.first_release_date * 1000).toISOString().split('T')[0]
          : null,
      }));

      const importResult = await this.igdbService.importGameById(topMatch.id, {
        force,
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                action: 'imported_from_search',
                message: importResult.message,
                registeredGame: {
                  igdbId: topMatch.id,
                  gameId: importResult.gameId,
                  name: topMatch.name,
                  slug: topMatch.slug,
                },
                otherCandidates,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error: unknown) {
      return this.formatError(error);
    }
  }

  private formatError(error: unknown, igdbId?: number): McpToolResult {
    if (error instanceof NotFoundException) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'NOT_FOUND',
              igdbId,
              message: 'Jogo não encontrado no IGDB. Verifique o ID informado.',
            }),
          },
        ],
      };
    }

    if (error instanceof ConflictException) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'NOT_ELIGIBLE',
              igdbId,
              message:
                'Jogo não é elegível para ingestão padrão (ex: DLC, expansão, edição secundária ou port). ' +
                'Para forçar o registro, execute a ferramenta novamente informando "force: true".',
            }),
          },
        ],
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'EXECUTION_ERROR',
            message: `Falha ao registrar jogo do IGDB: ${message}`,
          }),
        },
      ],
    };
  }
}
