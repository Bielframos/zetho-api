import { EditorialImageService } from './editorial-image.service';
import { safeEditorialFetch } from './safe-editorial-fetch';
jest.mock('./safe-editorial-fetch', () => ({ safeEditorialFetch: jest.fn() }));
const download = jest.mocked(safeEditorialFetch);
describe('editorial image experiment', () => {
  const enabled = process.env.EDITOR_IMAGES_ENABLED;
  const approved = process.env.EDITOR_APPROVED_IMAGES;
  afterEach(() => {
    jest.resetAllMocks();
    if (enabled === undefined) delete process.env.EDITOR_IMAGES_ENABLED;
    else process.env.EDITOR_IMAGES_ENABLED = enabled;
    if (approved === undefined) delete process.env.EDITOR_APPROVED_IMAGES;
    else process.env.EDITOR_APPROVED_IMAGES = approved;
  });
  it('does not download or publish unapproved images by default', async () => {
    delete process.env.EDITOR_IMAGES_ENABLED;
    expect(
      await new EditorialImageService().forPublication('https://example.com'),
    ).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });
  it('extracts only source-derived candidates and validates their file signature', async () => {
    download.mockResolvedValueOnce({
      bytes: Buffer.from(
        '<meta property="og:image" content="/real.png"><article><img src="javascript:bad" /></article>',
      ),
      contentType: 'text/html',
      url: 'https://example.com/article',
      elapsedMs: 10,
    });
    const service = new EditorialImageService();
    expect(await service.inspect('https://example.com/article')).toEqual([
      {
        url: 'https://example.com/real.png',
        alt: '',
        sourceUrl: 'https://example.com/article',
      },
    ]);
    download.mockResolvedValueOnce({
      bytes: Buffer.from('<svg>bad</svg>'),
      contentType: 'image/png',
      url: 'https://example.com/real.png',
      elapsedMs: 2,
    });
    await expect(
      service.validateImage('https://example.com/real.png'),
    ).rejects.toThrow('invalid');
  });
  it('requires source-specific rights review, alt and credit, then gracefully falls back on failure', async () => {
    process.env.EDITOR_IMAGES_ENABLED = 'true';
    process.env.EDITOR_APPROVED_IMAGES = JSON.stringify({
      'https://example.com/article': {
        url: 'https://example.com/real.png',
        alt: 'Actual gameplay',
        credit: 'Studio, press kit',
        sourceUrl: 'https://example.com/article',
      },
    });
    download.mockRejectedValue(new Error('unavailable'));
    expect(
      await new EditorialImageService().forPublication(
        'https://example.com/article',
      ),
    ).toBeNull();
  });
});
