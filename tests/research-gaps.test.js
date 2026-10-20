import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchGaps } from '../src/components/researchGapUtils.js';

function researchFixture(overrides = {}) {
  return {
    question: 'How does education funding affect students in Kenya?',
    scope: { region: 'Kenya' },
    analysis: {
      mainSubject: 'education funding and student outcomes',
      geographicScope: 'Kenya',
      timePeriod: 'Not specified',
      researchAreas: [
        {
          title: 'Education funding outcomes',
          description: 'Effects of education funding on student outcomes.',
          questions: ['What outcomes have been studied?'],
        },
      ],
    },
    sources: [],
    webSources: [],
    videos: [],
    ...overrides,
  };
}

const oldStudy = {
  id: 'old-study',
  title: 'Education finance in rural schools',
  url: 'https://example.org/education-finance',
  publicationYear: 2010,
  metadataSource: 'OpenAlex',
  abstract: 'This paper reports education funding outcomes in rural schools.',
  publisher: 'Journal of Education',
};

test('gap findings contain the requested details and stay scoped to the retrieved collection', () => {
  const findings = buildResearchGaps(researchFixture({ sources: [oldStudy] }), new Date('2026-01-01'));

  assert.ok(findings.length > 0);
  for (const finding of findings) {
    assert.ok(finding.description);
    assert.ok(finding.whyItMatters);
    assert.ok(finding.supportingExplanation);
    assert.ok(finding.researchArea);
    assert.ok(Array.isArray(finding.sourcesReviewed));
    assert.ok(finding.missingInformation);
    assert.ok(finding.suggestedNextSearch);
    assert.ok(finding.suggestedResearchQuestion);
  }
  assert.match(findings.find(({ id }) => id === 'evidence-recency').supportingExplanation, /newest publication year visible/);
  assert.match(findings.find(({ id }) => id === 'geographic-coverage').description, /Kenya/);
  assert.doesNotMatch(findings.map(({ supportingExplanation }) => supportingExplanation).join(' '), /the entire field|no research exists/i);
});

test('potential population, method, conflict, primary-source, and comparison gaps use distinct signals', () => {
  const research = researchFixture({
    question: 'Compare education funding outcomes in Kenya versus Uganda',
    sources: [{
      ...oldStudy,
      id: 'metadata-only',
      abstract: 'This catalog record describes education funding outcomes in schools.',
    }],
  });
  const findings = buildResearchGaps(research, new Date('2026-01-01'));
  const ids = findings.map(({ id }) => id);

  assert.ok(ids.includes('population-coverage'));
  assert.ok(ids.includes('methodological-information'));
  assert.ok(ids.includes('primary-sources'));
  assert.ok(ids.includes('comparison-data'));
  assert.ok(!ids.includes('conflicting-findings'));
});

test('recent, method-described primary evidence does not produce unsupported quality flags', () => {
  const findings = buildResearchGaps(researchFixture({
    sources: [{
      ...oldStudy,
      id: 'recent-study',
      publicationYear: 2025,
      abstract: 'We conducted a randomized trial with 300 student participants. The comparison found higher graduation rates among funded schools.',
    }],
  }), new Date('2026-01-01'));
  const ids = findings.map(({ id }) => id);

  assert.ok(!ids.includes('evidence-recency'));
  assert.ok(!ids.includes('population-coverage'));
  assert.ok(!ids.includes('methodological-information'));
  assert.ok(!ids.includes('primary-sources'));
});

test('an empty search is described as a limitation of this search, not the wider literature', () => {
  const findings = buildResearchGaps(researchFixture());
  const emptyResult = findings.find(({ id }) => id === 'no-retrieved-sources');

  assert.ok(emptyResult);
  assert.match(emptyResult.supportingExplanation, /this search run only/);
  assert.equal(emptyResult.sourcesReviewed.length, 0);
});
