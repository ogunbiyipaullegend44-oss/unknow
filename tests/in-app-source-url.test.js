import test from 'node:test';
import assert from 'node:assert/strict';
import { isPdfSourceUrl } from '../src/components/inAppSourceUrl.js';

test('direct PDF URLs remain eligible for the device PDF handler', () => {
  assert.equal(isPdfSourceUrl('https://example.org/reports/study.PDF'), true);
  assert.equal(isPdfSourceUrl('https://example.org/download?filename=study.pdf'), true);
  assert.equal(isPdfSourceUrl('https://example.org/file?format=application%2Fpdf'), true);
});

test('ordinary web pages use the in-app source viewer', () => {
  assert.equal(isPdfSourceUrl('https://example.org/research/article'), false);
  assert.equal(isPdfSourceUrl('https://example.org/research/article?format=html'), false);
  assert.equal(isPdfSourceUrl('not a url'), false);
});
