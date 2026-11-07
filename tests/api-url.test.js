import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiUrl } from '../src/utils/apiUrl.js';

test('API URLs remain same-origin when no native API host is configured', () => {
  assert.equal(resolveApiUrl('/api/health', ''), '/api/health');
});

test('API URLs use the configured native API origin', () => {
  assert.equal(
    resolveApiUrl('/api/research', 'https://research.example/'),
    'https://research.example/api/research',
  );
});

test('API URL helper rejects non-API paths', () => {
  assert.throws(() => resolveApiUrl('/other/resource', ''), TypeError);
});
