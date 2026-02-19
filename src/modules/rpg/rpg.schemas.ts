import * as v from 'valibot';

export const CreateRPGStory = v.object({
  gameSlug: v.pipe(
    v.string(),
    v.minLength(1, 'O slug do jogo não pode estar vazio.'),
  ),
});

export type CreateRPGStoryDto = v.InferOutput<typeof CreateRPGStory>;
