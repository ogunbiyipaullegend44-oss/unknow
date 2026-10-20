import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addResearchHistoryEntry,
  compactResearchForHistory,
  HISTORY_SOURCE_LIMIT,
  HISTORY_VIDEO_LIMIT,
  HISTORY_WEB_LIMIT,
} from '../src/components/researchHistory.js';

test('browser research history retains more than ten distinct searches', () => {
  const history = Array.from({ length: 10 }, (_, index) => ({
    id: `history-${index}`,
    question: `Question ${index}`,
  }));

  const next = addResearchHistoryEntry(history, { id: 'history-10', question: 'Question 10' });

  assert.equal(next.length, 11);
  assert.equal(next[0].id, 'history-10');
  assert.equal(next.at(-1).id, 'history-9');
});

test('saving the same question replaces its prior entry without capping other searches', () => {
  const history = Array.from({ length: 12 }, (_, index) => ({
    id: `history-${index}`,
    question: `Question ${index}`,
  }));

  const next = addResearchHistoryEntry(
    history,
    { id: 'updated', question: 'Question 4' },
    { replaceMatchingQuestion: true },
  );

  assert.equal(next.length, 12);
  assert.equal(next[0].id, 'updated');
  assert.equal(next.filter((entry) => entry.question === 'Question 4').length, 1);
  assert.ok(next.some((entry) => entry.id === 'history-11'));
});

test('updating a research entry in place replaces its prior history copy after its question changes', () => {
  const history = [
    { id: 'active-search', question: 'Original research question' },
    { id: 'other-search', question: 'Unrelated research question' },
  ];

  const next = addResearchHistoryEntry(history, {
    id: 'active-search',
    question: 'Edited research question',
  }, { replaceMatchingQuestion: true });

  assert.equal(next.length, 2);
  assert.equal(next[0].id, 'active-search');
  assert.equal(next[0].question, 'Edited research question');
  assert.equal(next.some((entry) => entry.question === 'Original research question'), false);
  assert.equal(next[1].id, 'other-search');
});

test('browser history stores bounded, compact result snapshots and preserves original counts', () => {
  const result = {
    question: 'A research question',
    sources: Array.from({ length: HISTORY_SOURCE_LIMIT + 1 }, (_, index) => ({
      id: `source-${index}`,
      abstract: 'a'.repeat(2000),
    })),
    webSources: Array.from({ length: HISTORY_WEB_LIMIT + 1 }, (_, index) => ({
      id: `web-${index}`,
      description: 'b'.repeat(1200),
    })),
    videos: Array.from({ length: HISTORY_VIDEO_LIMIT + 1 }, (_, index) => ({
      id: `video-${index}`,
      description: 'c'.repeat(700),
    })),
    sourceCursors: { openAlex: 'next', crossref: null, semanticScholar: null },
  };

  const saved = compactResearchForHistory(result, 'history-id');

  assert.equal(saved.id, 'history-id');
  assert.equal(saved.sources.length, HISTORY_SOURCE_LIMIT);
  assert.equal(saved.webSources.length, HISTORY_WEB_LIMIT);
  assert.equal(saved.videos.length, HISTORY_VIDEO_LIMIT);
  assert.equal(saved.historyResultsTruncated, true);
  assert.equal(saved.historyResultCounts.sources, HISTORY_SOURCE_LIMIT + 1);
  assert.equal(saved.historyResultCounts.webSources, HISTORY_WEB_LIMIT + 1);
  assert.equal(saved.historyResultCounts.videos, HISTORY_VIDEO_LIMIT + 1);
  assert.equal(saved.sourceCursors, null);
  assert.equal(saved.sources[0].abstract.length, 1501);
  assert.equal(saved.webSources[0].description.length, 1001);
  assert.equal(saved.videos[0].description.length, 501);
  assert.equal(result.sources[0].abstract.length, 2000);
});

test('history snapshots without large result collections are not marked truncated', () => {
  const saved = compactResearchForHistory({
    question: 'Small result',
    sources: [{ id: 'source' }],
    webSources: [],
    videos: [],
  }, 'history-id');

  assert.equal(saved.historyResultsTruncated, false);
  assert.deepEqual(saved.historyResultCounts, { sources: 1, webSources: 0, videos: 0 });
});

test('compacting an existing history copy preserves its original result counts', () => {
  const partial = compactResearchForHistory({
    question: 'Large result',
    sources: Array.from({ length: HISTORY_SOURCE_LIMIT }, () => ({})),
    historyResultsTruncated: true,
    historyResultCounts: { sources: 900, webSources: 4, videos: 2 },
  }, 'first-id');

  const compactedAgain = compactResearchForHistory(partial, 'second-id');

  assert.equal(compactedAgain.historyResultsTruncated, true);
  assert.deepEqual(compactedAgain.historyResultCounts, { sources: 900, webSources: 4, videos: 2 });
});
