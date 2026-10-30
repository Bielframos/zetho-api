import { z } from 'zod';

const source = z
  .string()
  .url()
  .max(400)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }, 'Use uma fonte HTTPS pública, sem credenciais ou parâmetros.');
export const editorialDraftSchema = z
  .object({
    title: z.string().trim().min(5).max(64),
    description: z.string().trim().min(10).max(128),
    criteria: z.string().trim().min(20).max(800),
    kind: z.enum(['thematic', 'monthly']),
    month: z
      .string()
      .regex(/^20\d{2}-(0[1-9]|1[0-2])$/)
      .optional(),
    items: z
      .array(
        z
          .object({
            gameId: z.string().regex(/^[a-zA-Z0-9_-]{1,36}$/),
            reason: z.string().trim().min(10).max(400),
            sources: z.array(source).min(1).max(3),
            releaseDate: z
              .string()
              .regex(/^20\d{2}-\d{2}-\d{2}$/)
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict()
  .superRefine((draft, context) => {
    if (new Set(draft.items.map((i) => i.gameId)).size !== draft.items.length)
      context.addIssue({ code: 'custom', message: 'Jogos repetidos.' });
    if (
      draft.kind === 'monthly' &&
      (!draft.month ||
        draft.items.some((i) => !i.releaseDate?.startsWith(`${draft.month}-`)))
    )
      context.addIssue({
        code: 'custom',
        message: 'Lista mensal exige mês/ano e datas no mesmo período.',
      });
    if (
      draft.kind === 'thematic' &&
      (draft.month || draft.items.some((i) => i.releaseDate))
    )
      context.addIssue({
        code: 'custom',
        message: 'Use lista mensal para afirmações de lançamento.',
      });
  });
export type EditorialDraft = z.infer<typeof editorialDraftSchema>;
export const escapeText = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );
