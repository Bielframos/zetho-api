import { Injectable } from '@nestjs/common';
import { createDatabasesApi, DatabaseHandle } from 'infra/appwrite';
import { API_KEY, ENDPOINT, PROJECT_ID } from 'infra/appwrite/constants';
import { Account, Client, TablesDB, Users } from 'node-appwrite';

@Injectable()
export class Appwrite {
  private client: Client;
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
    this.db = createDatabasesApi(tablesDB).use('app');
  }

  get databases() {
    return {
      userProfilese: this.db.use('User Profiles'),
      games: this.db.use('Games'),
      rpgStories: this.db.use('RPG Stories'),
    };
  }
}
