import { Injectable } from '@nestjs/common';
import { databases } from '../../infra/appwrite';

@Injectable()
export class Database {
  private db = databases.use('app');

  constructor() {}
}
