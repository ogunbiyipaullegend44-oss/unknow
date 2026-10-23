import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupRelatedSources,
  normalizeRelatedSources,
  relatedSourceLimit,
} from '../src/components/relatedTopicSources.js';

function source(id) {
  return {
    id,
    title: `Air quality study ${id}`,
    url: `https://example.org/${id}`,
    publicationYear: 2025,
    abstract: 'Retrieved abstract text.',
  };
}

test('related topic searches honor 20, 50, 100, and unlimited source choices', () => {
  const sources = Array.from({ length: 110 }, (_, index) => ({
    ...source(String(index)),
    category: 'Academic Research',
  }));

  assert.equal(relatedSourceLimit(20), 20);
  assert.equal(relatedSourceLimit('50'), 50);
  assert.equal(relatedSourceLimit(100), 100);
  assert.equal(relatedSourceLimit('all'), 'all');
  assert.equal(groupRelatedSources(sources, 50)[0][1].length, 50);
  assert.equal(groupRelatedSources(sources, 100)[0][1].length, 100);
  assert.equal(groupRelatedSources(sources, 'all')[0][1].length, 110);
});

test('related topic source results leave video records for the dedicated video view', () => {
  const sources = normalizeRelatedSources({
    sources: [source('academic')],
    webSources: [{
      id: 'web',
      title: 'Air quality report',
      url: 'https://example.org/report',
    }],
    videos: [{
      id: 'video',
      title: 'Air quality explainer',
      url: 'https://video.example/watch/1',
      platform: 'PeerTube',
      publishedAt: '2025-01-02T00:00:00Z',
    }],
  });
  const groups = groupRelatedSources(sources, 'all');

  assert.equal(sources.some(({ kind }) => kind === 'video'), false);
  assert.equal(groups.some(([category]) => category === 'Videos and YouTube'), false);
  assert.equal(sources.length, 2);
});

test('related results retain source category separation without a video category', () => {
  const groups = groupRelatedSources(normalizeRelatedSources({
    sources: [source('academic')],
    videos: [],
  }));

  assert.ok(groups.some(([category]) => category === 'Academic Research'));
  assert.equal(groups.some(([category]) => category === 'Videos and YouTube'), false);
});
