const fs = require('fs');

const filePath = 'src/modules/webhook/handlers/igdb.handler.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// Add import
content = content.replace(
  "import { IGDBGame, IGDBGenre } from '../../igdb/igdb.types';",
  "import { IGDBGame, IGDBGenre } from '../../igdb/igdb.types';\nimport { IGDBUpsertService } from '../../igdb/igdb-upsert.service';"
);

// Add to constructor
content = content.replace(
  `  constructor(
    private appwrite: Appwrite,
    private readonly loggerContext: LoggerContextService,
  ) {`,
  `  constructor(
    private appwrite: Appwrite,
    private readonly loggerContext: LoggerContextService,
    private readonly upsertService: IGDBUpsertService,
  ) {`
);

// Replace upsertGame calls
content = content.replace(
  `          appwriteGameId = await this.upsertGameRow(parsedGame);

          await this.ensureGameZStats(appwriteGameId);`,
  `          appwriteGameId = await this.upsertService.upsertGameRow(parsedGame);

          await this.upsertService.ensureGameZStats(appwriteGameId);`
);

// Replace upsertGenre logic
content = content.replace(
  `          await this.tableDB.upsertRow({
            databaseId: 'app',
            tableId: 'genres',
            rowId: \`igdb_\${genre.id}\`,
            data: {
              name: genre.name,
              slug: genre.slug,
              checksum: genre.checksum,
            },
          });`,
  `          await this.upsertService.upsertGenre(genre);`
);

// Replace deleteGenre logic
content = content.replace(
  `          await this.tableDB.deleteRow({
            databaseId: 'app',
            tableId: 'genres',
            rowId: \`igdb_\${genre.id}\`,
          });`,
  `          await this.upsertService.deleteGenre(genre);`
);

// Fix error swallowing (bug fix)
content = content.replace(
  `        } catch {
          throw new ServiceUnavailableException('Erro ao processar o jogo');
        }`,
  `        } catch (err) {
          this.logger.error('Erro ao processar o jogo', err);
          throw new ServiceUnavailableException('Erro ao processar o jogo');
        }`
);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Refactored igdb.handler.ts');
