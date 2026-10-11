import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
for (const [ip, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(ip, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
blocked.addSubnet('2002::', 16, 'ipv6');
blocked.addSubnet('2001::', 32, 'ipv6');

export function isPublicAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, 'ipv4')
    : family === 6 &&
        globalV6.check(address, 'ipv6') &&
        !blocked.check(address, 'ipv6');
}

/** Resolve once and pin the public address to the TLS connection, including redirects. */
export async function safeEditorialFetch(
  rawUrl: string,
  maxBytes = 2_000_000,
  redirects = 0,
): Promise<{
  bytes: Buffer;
  contentType: string;
  url: string;
  elapsedMs: number;
}> {
  const start = Date.now();
  const url = new URL(rawUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443')
  )
    throw new Error('Only public HTTPS editorial sources are allowed');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await Promise.race([
        lookup(hostname, { all: true }),
        new Promise<never>((_resolve, reject) => {
          dnsTimer = setTimeout(
            () => reject(new Error('Editorial DNS timeout')),
            5000,
          );
        }),
      ]).finally(() => clearTimeout(dnsTimer));
  if (
    !addresses.length ||
    addresses.some((item) => !isPublicAddress(item.address))
  )
    throw new Error('Private or reserved editorial destination');
  const chosen = addresses[0];
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        family: chosen.family,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ZethoEditorial/1.0)',
          'Accept-Encoding': 'identity',
        },
        lookup: (_host, _options, callback) =>
          callback(null, chosen.address, chosen.family),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          if (redirects >= 3) {
            reject(new Error('Too many editorial redirects'));
            return;
          }
          safeEditorialFetch(
            new URL(response.headers.location, url).href,
            maxBytes,
            redirects + 1,
          ).then(
            (result) => resolve({ ...result, elapsedMs: Date.now() - start }),
            reject,
          );
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(new Error(`Editorial source HTTP ${status}`));
          return;
        }
        if (Number(response.headers['content-length'] ?? 0) > maxBytes) {
          response.destroy();
          reject(new Error('Editorial response too large'));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            response.destroy(new Error('Editorial response too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () =>
          resolve({
            bytes: Buffer.concat(chunks),
            contentType: String(response.headers['content-type'] ?? '').split(
              ';',
            )[0],
            url: url.href,
            elapsedMs: Date.now() - start,
          }),
        );
      },
    );
    const deadline = setTimeout(
      () => req.destroy(new Error('Editorial source timeout')),
      10000,
    );
    req.on('close', () => clearTimeout(deadline));
    req.on('error', reject);
    req.end();
  });
}
