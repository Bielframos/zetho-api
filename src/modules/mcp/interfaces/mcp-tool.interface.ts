import { z } from 'zod';

export interface McpToolTextContent {
  type: 'text';
  text: string;
}

export interface McpToolResult {
  [x: string]: unknown;
  content: McpToolTextContent[];
  isError?: boolean;
}

export interface McpToolDefinition<
  TShape extends z.ZodRawShape = z.ZodRawShape,
> {
  readonly name: string;
  readonly description: string;
  readonly schema: TShape;
  execute(args: z.infer<z.ZodObject<TShape>>): Promise<McpToolResult>;
}
