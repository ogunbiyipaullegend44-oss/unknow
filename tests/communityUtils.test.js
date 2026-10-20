import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPublicationContent,
  parseSourceReferences,
  rankPublications,
  summarizeRatings,
  validatePublicationDraft,
} from '../src/community/communityUtils.js';

test('recommendation ratings dampen small rating counts with a neutral prior', () => {
  const onePerfectRating = summarizeRatings({ community_ratings: [{ rating: 5 }] });
  const tenPerfectRatings = summarizeRatings({ community_ratings: Array.from({ length: 10 }, () => ({ rating: 5 })) });
  const databaseAggregate = summarizeRatings({ rating_count: 1, average_rating: 5 });

  assert.equal(onePerfectRating.count, 1);
  assert.equal(onePerfectRating.recommendationScore, 3 + 2 / 6);
  assert.equal(tenPerfectRatings.recommendationScore, 4.333333333333333);
  assert.equal(databaseAggregate.recommendationScore, onePerfectRating.recommendationScore);
  assert.ok(tenPerfectRatings.recommendationScore > onePerfectRating.recommendationScore);
});

test('publication search ranking prioritizes a direct text match', () => {
  const rows = [
    { id: 'rated', title: 'Other topic', description: '', keywords: [], published_on: '2026-01-01', community_ratings: Array.from({ length: 8 }, () => ({ rating: 5 })) },
    { id: 'match', title: 'Renewable energy transition', description: '', keywords: ['energy'], published_on: '2025-01-01', community_ratings: [] },
  ];

  assert.equal(rankPublications(rows, 'renewable')[0].id, 'match');
});

test('publication document content includes sections, evidence, and source links', () => {
  const content = buildPublicationContent({
    title: 'Research file',
    topic: 'Research question',
    sections: [{ id: 's1', title: 'Findings', notes: 'Context' }],
    findings: [{ sectionId: 's1', text: 'Evidence excerpt' }],
    sources: [{ title: 'Source', url: 'https://example.com' }],
  });

  assert.match(content, /# Research file/);
  assert.match(content, /Evidence excerpt/);
  assert.match(content, /https:\/\/example\.com/);
});

test('source references accept HTTP(S) links and reject malformed or unsafe schemes', () => {
  assert.deepEqual(parseSourceReferences('Research report | https://example.com/report'), [
    { title: 'Research report', url: 'https://example.com/report' },
  ]);
  assert.throws(() => parseSourceReferences('Invalid | javascript:alert(1)'), /valid HTTP or HTTPS URL/);
  assert.throws(() => parseSourceReferences('Missing separator'), /must use/);
});

test('publishing requires permission, metadata, and a bounded document', () => {
  const valid = {
    title: 'Title',
    description: 'Description',
    category: 'Science',
    permissionConfirmed: true,
    documentContent: 'Document text',
  };
  assert.doesNotThrow(() => validatePublicationDraft(valid));
  assert.throws(() => validatePublicationDraft({ ...valid, permissionConfirmed: false }), /permission/);
  assert.throws(() => validatePublicationDraft({ ...valid, documentContent: 'x'.repeat(100001) }), /too large/);
});
