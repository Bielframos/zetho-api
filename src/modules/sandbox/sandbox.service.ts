import { Injectable } from '@nestjs/common';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';

@Injectable()
export class SandboxService {
  private databases: Appwrite['tablesDB'];

  constructor(private readonly appwrite: Appwrite) {
    this.databases = this.appwrite.databases.api;
  }
}
