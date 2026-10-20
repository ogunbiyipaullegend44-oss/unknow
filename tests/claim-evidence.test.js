import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceStatements } from '../src/components/claimEvidenceUtils.js';

function research(overrides = {}) {
  return {
    question: 'How does social media affect sleep?',
    sources: [{
      id: 'paper-1',
      title: 'Social media and sleep',
      url: 'https://example.org/paper',
      authors: ['A. Author'],
      journal: 'Example Journal',
      publicationYear: 2024,
      publicationMonth: 6,
      abstract: 'The study examined social media use among adults. Increased nightly social media use was associated with shorter sleep duration in the surveyed participants.',
      metadataSource: 'OpenAlex',
    }],
    webSources: [{
      id: 'web-1',
      title: 'A page with related reporting',
      url: 'https://example.org/report',
      description: 'Researchers reported that social media use was associated with later bedtimes in the study sample.',
      provider: 'Example Search',
    }],
    videos: [],
    ...overrides,
  };
}

test('evidence statements are exact excerpts and retain source provenance and limitations', () => {
  const statements = buildEvidenceStatements(research());
  assert.equal(statements.length, 2);
  const academic = statements.find((statement) => statement.evidence[0].sourceId === 'paper-1');
  assert.equal(
    academic.text,
    'Increased nightly social media use was associated with shorter sleep duration in the surveyed participants.',
  );
  assert.equal(academic.type, 'Directly supported by retrieved passage');
  assert.equal(academic.evidence[0].location, 'Retrieved abstract');
  assert.equal(academic.evidence[0].publicationDate, '2024-06');
  assert.match(academic.evidence[0].context, /The study examined social media use/);
  assert.match(academic.evidence[0].limitation, /full work was not reviewed/);
});

test('identical passages connect to multiple sources and unrelated sentences are omitted', () => {
  const value = research({
    sources: [
      ...research().sources,
      {
        ...research().sources[0],
        abstract: 'Increased nightly social media use was associated with shorter sleep duration in the surveyed participants.',
        id: 'paper-2',
        title: 'Replicated evidence',
      },
    ],
    webSources: [],
  });
  const statements = buildEvidenceStatements(value);
  const repeated = statements.find((statement) => statement.evidence.some((entry) => entry.sourceId === 'paper-2'));
  assert.ok(repeated);
  assert.equal(repeated.evidence.length, 2);
});

test('does not create factual claims when retrieved text is unavailable or unrelated', () => {
  assert.deepEqual(buildEvidenceStatements(research({
    sources: [{ id: 'metadata-only', title: 'Social media', url: 'https://example.org' }],
    webSources: [],
  })), []);
  assert.deepEqual(buildEvidenceStatements(research({
    sources: [{
      id: 'unrelated',
      title: 'Unrelated',
      url: 'https://example.org',
      abstract: 'This abstract discusses a distant topic without overlap.',
    }],
    webSources: [],
  })), []);
});
