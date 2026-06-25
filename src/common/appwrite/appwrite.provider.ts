import { Injectable } from '@nestjs/common';
import { API_KEY, ENDPOINT, PROJECT_ID } from './constants';
import { Account, Client, Storage, TablesDB, Users } from 'node-appwrite';

@Injectable()
export class Appwrite {
  private client: Client;
  readonly tablesDB: TablesDB;
  readonly storage: Storage;

  account: Account;
  users: Users;

  constructor() {
    this.client = new Client()
      .setEndpoint(ENDPOINT)
      .setProject(PROJECT_ID)
      .setKey(API_KEY);

    this.account = new Account(this.client);
    this.users = new Users(this.client);
    this.tablesDB = new TablesDB(this.client);
    this.storage = new Storage(this.client);
  }
}
