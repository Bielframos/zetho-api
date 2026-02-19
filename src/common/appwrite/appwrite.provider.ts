import { Injectable } from '@nestjs/common';
import { createDatabasesApi, DatabaseHandle } from 'infra/appwrite';
import { API_KEY, ENDPOINT, PROJECT_ID } from 'infra/appwrite/constants';
import { Client, TablesDB, Users } from 'node-appwrite';

@Injectable()
export class Appwrite {
  private client: Client;

  users: Users;
  db: DatabaseHandle<'app'>;

  constructor() {
    this.client = new Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID)
      .setJWT(API_KEY);

    const tablesDB = new TablesDB(this.client);

    this.users = new Users(this.client);
    this.db = createDatabasesApi(tablesDB).use('app');
  }
}
