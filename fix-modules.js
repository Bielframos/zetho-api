const fs = require('fs');
const path = require('path');

// 1. Events Module
const eventsModulePath = 'src/common/events/events.module.ts';
const eventsModuleContent = `import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [OutboxService],
  exports: [OutboxService],
})
export class EventsModule {}
`;
fs.writeFileSync(eventsModulePath, eventsModuleContent, 'utf-8');

// 2. Add EventsModule to app.module.ts
const appModulePath = 'src/app.module.ts';
if (fs.existsSync(appModulePath)) {
  let appModule = fs.readFileSync(appModulePath, 'utf-8');
  if (!appModule.includes('EventsModule')) {
    appModule = appModule.replace(
      "import { AppwriteModule } from './common/appwrite/appwrite.module';",
      "import { AppwriteModule } from './common/appwrite/appwrite.module';\nimport { EventsModule } from './common/events/events.module';"
    );
    appModule = appModule.replace(
      "AppwriteModule,",
      "AppwriteModule,\n    EventsModule,"
    );
    fs.writeFileSync(appModulePath, appModule, 'utf-8');
  }
}

// 3. Add TransactionService to AppwriteModule
const appwriteModulePath = 'src/common/appwrite/appwrite.module.ts';
let appwriteModule = fs.readFileSync(appwriteModulePath, 'utf-8');
if (!appwriteModule.includes('TransactionService')) {
  appwriteModule = appwriteModule.replace(
    "import { Appwrite } from './appwrite.provider';",
    "import { Appwrite } from './appwrite.provider';\nimport { TransactionService } from './transaction.service';"
  );
  appwriteModule = appwriteModule.replace(
    "providers: [Appwrite],",
    "providers: [Appwrite, TransactionService],"
  );
  appwriteModule = appwriteModule.replace(
    "exports: [Appwrite],",
    "exports: [Appwrite, TransactionService],"
  );
  fs.writeFileSync(appwriteModulePath, appwriteModule, 'utf-8');
}

// 4. Add new services to IGDBModule
const igdbModulePath = 'src/modules/igdb/igdb.module.ts';
let igdbModule = fs.readFileSync(igdbModulePath, 'utf-8');
if (!igdbModule.includes('IGDBUpsertService')) {
  igdbModule = igdbModule.replace(
    "import { IGDBService } from './igdb.service';",
    "import { IGDBService } from './igdb.service';\nimport { IGDBCoordinationService } from './igdb-coordination.service';\nimport { IGDBUpsertService } from './igdb-upsert.service';"
  );
  igdbModule = igdbModule.replace(
    "providers: [IGDBService, SystemApiKeyGuard],",
    "providers: [IGDBService, IGDBCoordinationService, IGDBUpsertService, SystemApiKeyGuard],"
  );
  igdbModule = igdbModule.replace(
    "exports: [IGDBService],",
    "exports: [IGDBService, IGDBCoordinationService, IGDBUpsertService],"
  );
  fs.writeFileSync(igdbModulePath, igdbModule, 'utf-8');
}

console.log('Fixed modules properly');
