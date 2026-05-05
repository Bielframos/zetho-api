import { Injectable } from '@nestjs/common';
import { createDatabasesApi, DatabaseHandle } from 'infra/appwrite';
import { API_KEY, ENDPOINT, PROJECT_ID } from 'infra/appwrite/constants';
import { Account, Client, TablesDB, Users } from 'node-appwrite';

@Injectable()
export class Appwrite {
  private client: Client;
  private tablesDB: TablesDB;
  private db: DatabaseHandle<'app'>;

  account: Account;
  users: Users;

  constructor() {
    this.client = new Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID)
      .setKey(API_KEY);

    const tablesDB = new TablesDB(this.client);

    this.account = new Account(this.client);
    this.users = new Users(this.client);
    this.tablesDB = tablesDB;
    this.db = createDatabasesApi(tablesDB).use('app');
  }

  get databases() {
    return {
      api: this.tablesDB,
      userProfiles: this.db.use('User Profiles'),
      games: this.db.use('Games'),
      genres: this.db.use('Genres'),
      companies: this.db.use('Companies'),
      zEntries: this.db.use('Z Entries'),
      zEntriesReadonly: this.db.use('Z Entries (Read-only)'),
      zStats: this.db.use('Z Entry Count'),
      igdbTokens: this.db.use('IGDB Tokens'),
      gameMedias: this.db.use('Game Medias'),
      posts: this.db.use('Posts'),
      authors: this.db.use('Authors'),
    };
  }
}
