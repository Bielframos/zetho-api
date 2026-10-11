/** Read-only comparison. No Appwrite client, publication or notifications are initialized. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import openAI from '@genkit-ai/compat-oai/openai';
import { genkit, z } from 'genkit';
import { obviousEditorialRejection } from '../src/agents/editor/editorial-policy';
import { ContentExtractorService } from '../src/agents/editor/content-extractor.service';

config({ path: process.env.EDITOR_EVAL_ENV_FILE ?? '.env', quiet: true });
type Sample = {
  id: number;
  url: string;
  expected: string;
  title?: string;
  excerpt?: string;
  event_group?: string;
};
async function main() {
  if (!process.env.OPENAI_KEY)
    throw new Error(
      'Configure OPENAI_KEY in the local env file; never print credentials.',
    );
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output)
    throw new Error(
      'Usage: ts-node -r tsconfig-paths/register scripts/evaluate-editorial.ts INPUT.json OUTPUT.json',
    );
  const samples = JSON.parse(readFileSync(input, 'utf8')).articles as Sample[];
  const ai = genkit({
    plugins: [openAI({ apiKey: process.env.OPENAI_KEY })],
    promptDir: resolve('src/infra/ai/prompts'),
  });
  const old = genkit({
    plugins: [openAI({ apiKey: process.env.OPENAI_KEY })],
    promptDir: resolve('scripts/editorial-evaluation/prompts'),
  });
  // Evaluation isolates prose grounding; no catalog/video data is fabricated.
  const noGames = ai.defineTool(
    {
      name: 'gameSearchTool',
      description: 'No catalog matches in prose-only evaluation',
      inputSchema: z.object({ query: z.string() }),
      outputSchema: z.array(z.any()),
    },
    async () => [],
  );
  const noVideos = ai.defineTool(
    {
      name: 'youtubeTool',
      description: 'No video matches in prose-only evaluation',
      inputSchema: z.object({ query: z.string() }),
      outputSchema: z.array(z.any()),
    },
    async () => [],
  );
  const results: unknown[] = [];
  const extractor = new ContentExtractorService();
  for (const item of samples) {
    const started = Date.now();
    try {
      const extracted =
        item.title && item.excerpt
          ? { title: item.title, text: item.excerpt }
          : await extractor.extract(item.url);
      const post = {
        id: String(item.id),
        title: extracted.title,
        description: extracted.text.slice(0, 12000),
        content: extracted.text.slice(0, 12000),
        link: item.url,
        pubDate: new Date().toISOString(),
      };
      const previous = item.event_group
        ? samples.find(
            (other) =>
              other.id < item.id && other.event_group === item.event_group,
          )
        : undefined;
      const recentPosts = previous
        ? [
            {
              title: previous.title ?? '',
              pubDate: new Date().toISOString(),
              originalSourceUrl: previous.url,
              tags: [],
            },
          ]
        : [];
      const baseline = await old.prompt('trend_analysis')({
        posts: [post],
        recentPosts,
      });
      const rejection = obviousEditorialRejection(post);
      const classified =
        rejection ?? (await ai.prompt('editor/eligibility')({ post })).output;
      const trend = classified?.eligible
        ? (
            await ai.prompt('editor/trend_analysis')({
              posts: [post],
              recentPosts,
            })
          ).output
        : null;
      let writing: unknown = null;
      if (
        process.env.EDITOR_EVAL_WRITING === 'true' &&
        classified?.eligible &&
        trend?.id !== 'N/A'
      ) {
        const drafted = await ai.prompt('editor/write_article')(
          { post },
          { tools: [noGames, noVideos] },
        );
        const verified = await ai.prompt('editor/verify_article')({
          source: post,
          article: {
            title: drafted.output.post.title,
            subtitle: drafted.output.post.subtitle,
            body: drafted.output.post.body,
          },
        });
        writing = {
          article: drafted.output.post,
          verification: verified.output,
          usage: drafted.usage,
        };
      }
      results.push({
        id: item.id,
        url: item.url,
        expected: item.expected,
        baseline: baseline.output,
        proposed: classified,
        writing,
        trend,
        elapsedMs: Date.now() - started,
        usage: baseline.usage,
      });
    } catch (error) {
      results.push({
        id: item.id,
        url: item.url,
        error: error instanceof Error ? error.message : 'failed',
      });
    }
    writeFileSync(
      output,
      JSON.stringify(
        { evaluatedAt: new Date().toISOString(), results },
        null,
        2,
      ),
    );
    console.log(`Evaluated ${results.length}/${samples.length}`);
  }
}
void main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
