/** Read-only comparison. No Appwrite client, publication or notifications are initialized. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  evaluationFailure,
  selectedByTrend,
  summarize,
  EvaluationResult,
} from './editorial-evaluation/report';
import { config } from 'dotenv';
import openAI from '@genkit-ai/compat-oai/openai';
import { genkit, z } from 'genkit';
import {
  obviousEditorialRejection,
  normalizeEditorialDecision,
} from '../src/agents/editor/editorial-policy';
import { ContentExtractorService } from '../src/agents/editor/content-extractor.service';

config({ path: process.env.EDITOR_EVAL_ENV_FILE ?? '.env', quiet: true });
type Sample = {
  id: number;
  url: string;
  expected: string;
  title?: string;
  excerpt?: string;
  event_group?: string;
  recent_article_ids?: number[];
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
  const results: (EvaluationResult & Record<string, unknown>)[] = [];
  const extractor = new ContentExtractorService();
  for (const item of samples) {
    const started = Date.now();
    let stage = 'source';
    let fatal = false;
    let source: unknown;
    const evidence: Record<string, unknown> & {
      decisions?: EvaluationResult['decisions'];
    } = {};
    try {
      const extracted =
        item.title && item.excerpt
          ? { title: item.title, text: item.excerpt }
          : await extractor.extract(item.url);
      const text = extracted.text.slice(0, 12000);
      source = {
        url: item.url,
        title: extracted.title,
        text,
        capturedAt: new Date().toISOString(),
        sha256: createHash('sha256').update(text).digest('hex'),
      };
      const post = {
        id: String(item.id),
        title: extracted.title,
        description: text,
        content: text,
        link: item.url,
        pubDate: new Date().toISOString(),
      };
      const previous = item.event_group
        ? samples.find(
            (other) =>
              other.id < item.id && other.event_group === item.event_group,
          )
        : undefined;
      const context = item.recent_article_ids
        ? item.recent_article_ids.map((id) => {
            const entry = samples.find((candidate) => candidate.id === id);
            if (!entry) throw new Error(`Unknown context article ${id}`);
            return entry;
          })
        : previous
          ? [previous]
          : [];
      const recentPosts = context.map((entry) => ({
        title: entry.title ?? '',
        pubDate: new Date().toISOString(),
        originalSourceUrl: entry.url,
        tags: [],
      }));
      evidence.recentPosts = recentPosts;
      stage = 'baseline';
      const baseline = await old.prompt('trend_analysis')({
        posts: [post],
        recentPosts,
      });
      evidence.baseline = baseline.output;
      const baselineSelected = selectedByTrend(baseline.output, item.id);
      stage = 'eligibility';
      const rejection = obviousEditorialRejection(post);
      const classified =
        rejection ?? (await ai.prompt('editor/eligibility')({ post })).output;
      const checked = normalizeEditorialDecision(classified);
      evidence.proposed = checked;
      stage = 'proposed_trend';
      const trend = checked.eligible
        ? (
            await ai.prompt('editor/trend_analysis')({
              posts: [post],
              recentPosts,
            })
          ).output
        : null;
      const proposedSelected =
        checked.eligible && selectedByTrend(trend, item.id);
      evidence.trend = trend;
      evidence.decisions = {
        baselineSelected,
        proposedEligible: checked.eligible,
        proposedSelected,
        proposedDraftSupported: null,
      };
      let proposedDraftSupported: boolean | null = null;
      let writing: unknown = null;
      if (process.env.EDITOR_EVAL_WRITING === 'true' && proposedSelected) {
        stage = 'writing';
        const drafted = await ai.prompt('editor/write_article')(
          { post },
          { tools: [noGames, noVideos] },
        );
        evidence.writing = {
          article: drafted.output.post,
          usage: drafted.usage,
        };
        stage = 'verification';
        const verified = await ai.prompt('editor/verify_article')({
          source: post,
          article: {
            title: drafted.output.post.title,
            subtitle: drafted.output.post.subtitle,
            body: drafted.output.post.body,
          },
        });
        proposedDraftSupported = verified.output?.supported === true;
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
        source,
        recentPosts,
        decisions: {
          baselineSelected,
          proposedEligible: checked.eligible,
          proposedSelected,
          proposedDraftSupported,
        },
        baseline: baseline.output,
        proposed: checked,
        writing,
        trend,
        elapsedMs: Date.now() - started,
        usage: baseline.usage,
      });
    } catch (error) {
      const failure = evaluationFailure(error, stage);
      fatal = failure.fatal;
      results.push({
        id: item.id,
        url: item.url,
        expected: item.expected,
        source,
        ...evidence,
        stage,
        error: failure.error,
      });
    }
    writeFileSync(
      output,
      JSON.stringify(
        {
          evaluatedAt: new Date().toISOString(),
          summary: summarize(results),
          results,
        },
        null,
        2,
      ),
    );
    console.log(`Evaluated ${results.length}/${samples.length}`);
    if (fatal) {
      console.error('Evaluation stopped: model credentials were rejected.');
      process.exitCode = 1;
      return;
    }
  }
}
void main().catch((error) => {
  console.error(evaluationFailure(error, 'startup').error);
  process.exitCode = 1;
});
