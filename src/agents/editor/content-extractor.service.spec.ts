import { ContentExtractorService } from './content-extractor.service';
import { safeEditorialFetch, isPublicAddress } from './safe-editorial-fetch';
jest.mock('./safe-editorial-fetch', () => ({
  ...jest.requireActual('./safe-editorial-fetch'),
  safeEditorialFetch: jest.fn(),
}));
const fetchSource = jest.mocked(safeEditorialFetch);
describe('ContentExtractorService', () => {
  afterEach(() => jest.resetAllMocks());
  it('extracts article text through the bounded public-source downloader', async () => {
    fetchSource.mockResolvedValue({
      bytes: Buffer.from(
        '<html><head><title>Game revealed</title></head><body><article><p>A new adventure was announced today with a trailer and gameplay details. The studio shared the release date and confirmed platforms for the next chapter.</p></article></body></html>',
      ),
      contentType: 'text/html',
      url: 'https://example.com/news',
      elapsedMs: 2,
    });
    const result = await new ContentExtractorService().extract(
      'https://example.com/news',
    );
    expect(result.text).toContain('adventure');
    expect(result.text).not.toContain('<p>');
  });
  it('rejects non-HTML sources', async () => {
    fetchSource.mockResolvedValue({
      bytes: Buffer.from('abc'),
      contentType: 'application/pdf',
      url: 'https://example.com/a',
      elapsedMs: 1,
    });
    await expect(
      new ContentExtractorService().extract('https://example.com/a'),
    ).rejects.toThrow('not HTML');
  });
  it.each([
    '127.0.0.1',
    '10.1.1.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fd00::1',
    'fe80::1',
    '2001:db8::1',
  ])('rejects reserved address %s', (address) =>
    expect(isPublicAddress(address)).toBe(false),
  );
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'allows public address %s',
    (address) => expect(isPublicAddress(address)).toBe(true),
  );
});
