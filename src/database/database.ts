import { Injectable } from '@nestjs/common';
import { databases } from './appwrite';

@Injectable()
export class Database {
  public db = databases;
}
