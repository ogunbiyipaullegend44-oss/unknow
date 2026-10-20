import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSourceReviews,
  SOURCE_REVIEW_NOTES_LIMIT,
  updateSourceReview,
} from '../src/components/sourceReview.js';

test('source reviews are saved as independent, immutable per-source entries', () => {
  const original = {};
  const reviewed = updateSourceReview(original, 'academic:one', { reviewed: true }, '2026-10-16T20:00:00.000Z');
  const withNotes = updateSourceReview(
    reviewed,
    'academic:one',
    { notes: 'Reviewed the methods and publication date.' },
    '2026-10-16T20:05:00.000Z',
  );

  assert.deepEqual(original, {});
  assert.equal(reviewed['academic:one'].reviewed, true);
  assert.equal(withNotes['academic:one'].reviewed, true);
  assert.equal(withNotes['academic:one'].notes, 'Reviewed the methods and publication date.');
  assert.equal(withNotes['academic:one'].updatedAt, '2026-10-16T20:05:00.000Z');
});

test('source review storage validates data and accepts an empty store', () => {
  assert.deepEqual(parseSourceReviews(null), {});
  const reviews = { 'web:one': { reviewed: false, notes: '', updatedAt: '2026-10-16T20:00:00.000Z' } };
  assert.deepEqual(parseSourceReviews(JSON.stringify(reviews)), reviews);
  assert.throws(() => parseSourceReviews('{bad json'), /invalid JSON/);
  assert.throws(() => parseSourceReviews('[]'), /unsupported format/);
  assert.throws(
    () => parseSourceReviews(JSON.stringify({ one: { reviewed: 'yes', notes: '', updatedAt: 'invalid' } })),
    /unsupported format/,
  );
});

test('source review notes enforce a bounded length', () => {
  assert.throws(
    () => updateSourceReview({}, 'web:one', { notes: 'n'.repeat(SOURCE_REVIEW_NOTES_LIMIT + 1) }),
    /invalid/,
  );
  assert.equal(
    updateSourceReview({}, 'web:one', { notes: 'n'.repeat(SOURCE_REVIEW_NOTES_LIMIT) })['web:one'].notes.length,
    SOURCE_REVIEW_NOTES_LIMIT,
  );
});
