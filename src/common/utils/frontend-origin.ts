const LOCAL_FRONTEND_ORIGIN = 'http://localhost:4200';

/** Resolves the public frontend origin from the first configured URL. */
export function resolveFrontendOrigin(
  frontendAppUrl = process.env.FRONTEND_APP_URL,
  nodeEnv = process.env.NODE_ENV,
): string {
  const firstUrl = frontendAppUrl
    ?.split(',')
    .map((value) => value.trim())
    .find(Boolean);

  if (!firstUrl) {
    if (nodeEnv === 'production') {
      throw new Error('FRONTEND_APP_URL is required in production.');
    }
    return LOCAL_FRONTEND_ORIGIN;
  }

  let parsed: URL;
  try {
    parsed = new URL(firstUrl);
  } catch {
    throw new Error('FRONTEND_APP_URL must contain a valid HTTP(S) URL.');
  }

  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error('FRONTEND_APP_URL must contain a valid HTTP(S) URL.');
  }

  return parsed.origin;
}
