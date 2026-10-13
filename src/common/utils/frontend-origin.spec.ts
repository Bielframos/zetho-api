import { resolveFrontendOrigin } from './frontend-origin';

describe('resolveFrontendOrigin', () => {
  it('uses the first URL in a comma-separated setting and removes path/trailing slash', () => {
    expect(
      resolveFrontendOrigin(
        ' https://preview.example/app///, https://secondary.example/ ',
        'production',
      ),
    ).toBe('https://preview.example');
  });

  it.each(['ftp://frontend.example', 'not-a-url'])(
    'rejects a non-HTTP(S) frontend URL: %s',
    (value) => {
      expect(() => resolveFrontendOrigin(value, 'test')).toThrow(
        'FRONTEND_APP_URL must contain a valid HTTP(S) URL.',
      );
    },
  );

  it('uses localhost outside production when no URL is configured', () => {
    expect(resolveFrontendOrigin(undefined, 'development')).toBe(
      'http://localhost:4200',
    );
  });

  it('requires a frontend URL in production', () => {
    expect(() => resolveFrontendOrigin(undefined, 'production')).toThrow(
      'FRONTEND_APP_URL is required in production.',
    );
  });
});
