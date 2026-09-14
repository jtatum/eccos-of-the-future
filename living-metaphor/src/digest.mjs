import { canonicalize } from './canonicalize.mjs';
import { sha256 } from '../../src/canonical-json.mjs';

export async function contentDigest(value) {
  return sha256(canonicalize(value));
}

export async function signEvent(unsignedEvent) {
  return { ...structuredClone(unsignedEvent), digest: await contentDigest(unsignedEvent) };
}

export async function verifyEventDigest(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return false;
  const { digest, ...unsigned } = event;
  return typeof digest === 'string' && digest === await contentDigest(unsigned);
}
