import { Injectable } from '@nestjs/common';
import { EditorService } from 'src/common/ai/editor.service';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';

@Injectable()
export class SandboxService {
  private databases: Appwrite['tablesDB'];

  constructor(
    private readonly appwrite: Appwrite,
    private readonly editorService: EditorService,
  ) {
    this.databases = this.appwrite.databases.api;
  }

  async runEditor() {
    return this.editorService.run();
  }
}
