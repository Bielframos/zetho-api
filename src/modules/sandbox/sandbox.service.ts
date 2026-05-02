import { Inject, Injectable } from '@nestjs/common';
import type { Genkit } from 'genkit';
import { GENKIT } from 'src/common/ai/ai.module';
import { Appwrite } from 'src/common/appwrite/appwrite.provider';

@Injectable()
export class SandboxService {
  private databases: Appwrite['tablesDB'];

  constructor(
    private readonly appwrite: Appwrite,
    @Inject(GENKIT) private readonly ai: Genkit,
  ) {
    this.databases = this.appwrite.databases.api;
  }

  async generateText(prompt: string): Promise<string> {
    const response = await this.ai.generate({
      prompt,
    });

    return response.text;
  }
}
