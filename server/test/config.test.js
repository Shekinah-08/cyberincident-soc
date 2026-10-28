import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveJwtSecret } from '../src/config.js';

test('resolves a development JWT secret when the env is unset or weak', () => {
  const previous = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  process.env.NODE_ENV = 'development';

  try {
    const secret = resolveJwtSecret();
    assert.equal(typeof secret, 'string');
    assert.ok(secret.length >= 32);
  } finally {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  }
});
