import { slugify } from './slugify';

describe('slugify', () => {
  it('should convert accents and special characters properly', () => {
    expect(slugify('Hollow Knight: Silksong!')).toBe('hollow-knight-silksong');
    expect(slugify('Pokémon Edição Especial #1')).toBe(
      'pokemon-edicao-especial-1',
    );
    expect(slugify('  Jogo   do   Ano --- 2024  ')).toBe('jogo-do-ano-2024');
  });

  it('should handle empty or whitespace-only inputs', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
  });

  it('should truncate to maxLength', () => {
    const long = 'a'.repeat(250);
    expect(slugify(long, 50).length).toBe(50);
  });
});
