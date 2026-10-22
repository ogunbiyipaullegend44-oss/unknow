import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessQuestionContext,
  compileSourceFilters,
  dateFilterMatches,
  evidenceTypesFor,
  matchesSourceFilters,
  organizationTypesFor,
  removableFilterChips,
  questionTerms,
  sortSources,
  sourceGeographyText,
  sourceSearchText,
} from '../src/components/sourceFilterUtils.js';

const BASE_FILTERS = {
  categories: [],
  datePreset: 'any',
  startDate: '',
  endDate: '',
  sort: 'newest',
  geographyType: '',
  geographyValue: '',
  organizationTypes: [],
  evidenceTypes: [],
  accessibility: [],
  search: '',
  includeKeywords: '',
  excludeKeywords: '',
  researchArea: '',
  relevanceQuestion: '',
  claim: '',
};

function source(overrides = {}) {
  return {
    id: 'source-1',
    kind: 'academic',
    title: 'Urban air quality case study',
    category: 'Academic Research',
    type: 'journal-article',
    date: '2024-05-01',
    author: 'Alex Researcher',
    publisher: 'Example University',
    organization: 'Example University',
    host: 'example.edu',
    description: 'An empirical case study of air quality in Nairobi.',
    abstract: 'This empirical case study reports a survey in Nairobi.',
    openAccessUrl: 'https://example.edu/paper.pdf',
    ...overrides,
  };
}

test('source filters act on actual source text and category metadata', () => {
  const item = source();
  assert.equal(matchesSourceFilters(item, {
    ...BASE_FILTERS,
    categories: ['Academic Research'],
    includeKeywords: 'Nairobi, case study',
    excludeKeywords: 'opinion',
    geographyType: 'country',
    geographyValue: 'Nairobi',
  }), true);
  assert.equal(matchesSourceFilters(item, {
    ...BASE_FILTERS,
    geographyType: 'country',
    geographyValue: 'Kenya',
  }), false);
  assert.equal(matchesSourceFilters(item, {
    ...BASE_FILTERS,
    claim: 'urban air pollution',
  }), false);
});

test('compiled filters reuse normalized source text without changing filter results', () => {
  const item = source();
  const filters = {
    ...BASE_FILTERS,
    categories: ['Academic Research'],
    includeKeywords: 'Nairobi, case study',
    geographyType: 'country',
    geographyValue: 'Nairobi',
    organizationTypes: ['University'],
    evidenceTypes: ['Empirical study'],
    researchArea: 'Urban health',
    relevanceQuestion: 'air quality Nairobi',
  };
  const context = {
    researchAreas: [{
      title: 'Urban health',
      description: 'Air quality and public health',
      questions: ['How does pollution affect health?'],
    }],
  };
  const compiled = compileSourceFilters(filters, context);
  const prepared = {
    ...item,
    filterSearchText: sourceSearchText(item),
    filterGeographyText: sourceGeographyText(item),
    organizationTypes: organizationTypesFor(item),
    evidenceTypes: evidenceTypesFor(item),
  };

  assert.equal(
    matchesSourceFilters(prepared, filters, context, compiled),
    matchesSourceFilters(item, filters, context),
  );
  assert.equal(matchesSourceFilters(prepared, filters, context, compiled), true);
});

test('question relevance requires multiple topic terms from the retrieved source text', () => {
  const filters = {
    ...BASE_FILTERS,
    relevanceQuestion: 'How does urban air pollution affect asthma rates?',
  };

  assert.equal(matchesSourceFilters(source({
    title: 'Urban planning overview',
    abstract: 'A study of atmospheric conditions.',
    description: 'A review of city development.',
  }), filters), false);
  assert.equal(matchesSourceFilters(source({
    title: 'Urban air pollution and asthma',
    abstract: 'A population study of respiratory health.',
    description: 'This study examines asthma rates and urban air pollution.',
  }), filters), true);
});

test('question relevance compares complete terms and ignores punctuation and duplicate words', () => {
  assert.deepEqual(questionTerms('Climate, climate change?'), ['climate', 'change']);
  assert.equal(matchesSourceFilters(source({
    title: 'Transcatheter Aortic Valve Implantation',
    abstract: 'A clinical report from Bahrain.',
  }), {
    ...BASE_FILTERS,
    relevanceQuestion: 'rain valve',
  }), false);
  assert.equal(matchesSourceFilters(source({
    title: 'Climate change policy and climate adaptation',
    abstract: 'Climate change policy and climate adaptation.',
  }), {
    ...BASE_FILTERS,
    relevanceQuestion: 'Climate change climate',
  }), true);
});

test('question context excludes title-only matches and requires concepts in one sentence', () => {
  const question = 'How does urban air pollution relate to asthma rates, childhood respiratory health, and school attendance?';
  assert.equal(matchesSourceFilters(source({
    title: 'Urban air pollution, asthma rates, childhood health, and school attendance',
    abstract: '',
    description: '',
  }), { ...BASE_FILTERS, relevanceQuestion: question }), false);

  const splitAcrossSentences = assessQuestionContext(
    'Urban air quality is monitored in cities. Asthma rates are recorded separately.',
    question,
  );
  assert.equal(splitAcrossSentences.relevant, false);
  assert.equal(splitAcrossSentences.status, 'partial-context');

  const sameSentence = assessQuestionContext(
    'Urban air pollution was associated with increased asthma rates in the study.',
    question,
  );
  assert.equal(sameSentence.relevant, true);
  assert.match(sameSentence.supportingSentence, /air pollution.*asthma rates/);
  assert.equal(assessQuestionContext('', question).status, 'no-content');
});

test('custom and preset date filters use publication dates, not retrieval time', () => {
  const item = source({ date: '2024' });
  assert.equal(dateFilterMatches(item, {
    ...BASE_FILTERS,
    datePreset: 'custom',
    startDate: '2024-08-01',
    endDate: '2024-08-31',
  }), true);
  assert.equal(dateFilterMatches(source({ date: '' }), {
    ...BASE_FILTERS,
    datePreset: '3',
  }), false);
  assert.equal(dateFilterMatches(source({ date: '2024-05-15' }), {
    ...BASE_FILTERS,
    datePreset: '3',
  }, Date.parse('2026-10-15T00:00:00Z')), true);
});

test('incomplete custom date and geography filters do not hide results or appear active', () => {
  const item = source();
  const incompleteFilters = {
    ...BASE_FILTERS,
    datePreset: 'custom',
    geographyType: 'region',
  };

  assert.equal(matchesSourceFilters(item, incompleteFilters), true);
  assert.equal(removableFilterChips(incompleteFilters, () => {}).length, 0);
  assert.equal(removableFilterChips({
    ...incompleteFilters,
    geographyValue: 'Nairobi',
  }, () => {}).length, 1);
});

test('organization and evidence filters require available metadata signals', () => {
  const item = source();
  assert.ok(organizationTypesFor(item).includes('University'));
  assert.ok(organizationTypesFor(item).includes('Individual author or researcher'));
  assert.ok(evidenceTypesFor(item).includes('Empirical study'));
  assert.ok(evidenceTypesFor(item).includes('Case study'));
  assert.ok(evidenceTypesFor(source({ title: 'Plain title', description: '', abstract: '', type: 'journal-article' })).length === 0);
  assert.equal(matchesSourceFilters(item, {
    ...BASE_FILTERS,
    evidenceTypes: ['Review or systematic review'],
  }), false);
});

test('accessibility filters require an actual link or available abstract', () => {
  assert.equal(matchesSourceFilters(source(), {
    ...BASE_FILTERS,
    accessibility: ['Open-access full-text link', 'Downloadable document link'],
  }), true);
  assert.equal(matchesSourceFilters(source({ openAccessUrl: '', abstract: '', description: '' }), {
    ...BASE_FILTERS,
    accessibility: ['Open-access full-text link'],
  }), false);
  assert.equal(matchesSourceFilters(source({ openAccessUrl: '', abstract: 'Retrieved abstract' }), {
    ...BASE_FILTERS,
    accessibility: ['Metadata only'],
  }), false);
});

test('sort order keeps records without dates after dated records', () => {
  const ordered = sortSources([
    source({ id: 'unknown', date: '' }),
    source({ id: 'older', date: '2020' }),
    source({ id: 'newer', date: '2024' }),
  ], 'newest');
  assert.deepEqual(ordered.map((item) => item.id), ['newer', 'older', 'unknown']);
});
