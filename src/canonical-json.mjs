const encoder = new TextEncoder();

export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

async function subtleCrypto() {
  if (globalThis.crypto?.subtle) return globalThis.crypto.subtle;
  const { webcrypto } = await import('node:crypto');
  return webcrypto.subtle;
}

export async function sha256(value) {
  const data = typeof value === 'string' ? encoder.encode(value) : value;
  const digest = await (await subtleCrypto()).digest('SHA-256', data);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
