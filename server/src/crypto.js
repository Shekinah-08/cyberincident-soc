import crypto from 'node:crypto';

export function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function sha256Text(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function canonicalize(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${JSON.stringify(canonicalize(value[k]))}`).join(',')}}`;
}

export function auditHash(previousHash, payload) {
  return sha256Text(`${previousHash}|${canonicalize(payload)}`);
}
