import { researchTopicTerms } from '../utils/researchQuery.js';

export const DATE_FILTERS = [
  { value: '12', label: 'Past 12 months' },
  { value: '3', label: 'Past 3 years' },
  { value: '5', label: 'Past 5 years' },
];

export const ORGANIZATION_TYPES = [
  'Government agency',
  'University',
  'Research institute',
  'International organization',
  'News organization',
  'Company',
  'Nonprofit organization',
  'Individual author or researcher',
];

export const EVIDENCE_TYPES = [
  'Primary source',
  'Secondary source',
  'Review or systematic review',
  'Empirical study',
  'Official statistics',
  'Opinion or commentary',
  'Dataset',
  'Case study',
];

export const ACCESSIBILITY_TYPES = [
  'Open-access full-text link',
  'Abstract available',
  'Metadata only',
  'Video available',
  'Downloadable document link',
];

function termsFrom(value) {
  return String(value ?? '')
    .split(/[\n,]+/)
    .map((term) => term.trim().toLocaleLowerCase())
    .filter(Boolean);
}

export function questionTerms(value) {
  return researchTopicTerms(value, 10);
}

function normalizedContextTerm(term) {
  let normalized = term.toLocaleLowerCase();
  if (normalized.length > 5 && normalized.endsWith('ies')) return `${normalized.slice(0, -3)}y`;
  if (normalized.length > 5 && /(ing|ed)$/.test(normalized)) {
    normalized = normalized.replace(/(ing|ed)$/, '');
    if (/(.)\1$/.test(normalized)) normalized = normalized.slice(0, -1);
    return normalized;
  }
  if (normalized.length > 4 && normalized.endsWith('s') && !normalized.endsWith('ss')) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

export function assessQuestionContext(text, question) {
  const terms = questionTerms(question);
  const content = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!content) {
    return {
      status: 'no-content',
      relevant: false,
      matchedTerms: [],
      totalTerms: terms.length,
      supportingSentence: '',
    };
  }
  if (!terms.length) {
    return {
      status: 'insufficient-context',
      relevant: false,
      matchedTerms: [],
      totalTerms: 0,
      supportingSentence: '',
    };
  }

  const sentences = content.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [content];
  const rankedSentences = sentences.map((sentence, index) => {
    const sentenceTerms = new Set(
      (sentence.toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [])
        .map(normalizedContextTerm),
    );
    const matchedTerms = terms.filter((term) => sentenceTerms.has(normalizedContextTerm(term)));
    return { sentence, index, matchedTerms };
  }).sort((left, right) =>
    right.matchedTerms.length - left.matchedTerms.length || left.index - right.index,
  );
  const bestSentence = rankedSentences[0];
  const minimumMatches = Math.min(2, terms.length);
  const relevant = bestSentence.matchedTerms.length >= minimumMatches &&
    bestSentence.matchedTerms.length / terms.length >= 0.4;
  const anyMatches = bestSentence.matchedTerms.length > 0;

  return {
    status: relevant
      ? 'context-supported'
      : anyMatches
        ? 'partial-context'
        : 'insufficient-context',
    relevant,
    matchedTerms: bestSentence.matchedTerms,
    totalTerms: terms.length,
    supportingSentence: relevant ? bestSentence.sentence : '',
  };
}

export function matchesQuestionRelevance(text, question) {
  return assessQuestionContext(text, question).relevant;
}

export function matchesVideoQuestion(video, question) {
  return matchesQuestionRelevance(
    [video?.title, video?.description].filter(Boolean).join('. '),
    question,
  );
}

export function sourceSearchText(source) {
  if (typeof source.filterSearchText === 'string') return source.filterSearchText;
  return [
    source.title,
    source.description,
    source.abstract,
    source.rawContent,
    source.fullText,
    source.author,
    source.publisher,
    source.organization,
    source.type,
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}

export function sourceGeographyText(source) {
  if (typeof source.filterGeographyText === 'string') return source.filterGeographyText;
  return [source.title, source.description, source.abstract, source.rawContent, source.fullText]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

export function organizationTypesFor(source) {
  const name = `${source.organization ?? ''} ${source.publisher ?? ''}`.toLocaleLowerCase();
  const host = String(source.host ?? '').toLocaleLowerCase();
  const matches = [];

  if (source.category === 'Government and Official Sources' ||
    /\b(ministry|department of|government|agency|commission|municipality|city of)\b/.test(name)) {
    matches.push('Government agency');
  }
  if (/\b(university|université|universidad|college|faculty)\b/.test(name)) {
    matches.push('University');
  }
  if (/\b(research institute|institute for|institute of|laboratory|research lab)\b/.test(name)) {
    matches.push('Research institute');
  }
  if (/\b(united nations|world health organization|world bank|international monetary fund|oecd|european union|unicef)\b/.test(name) ||
    /(^|\.)((europa\.eu)|(un\.org)|(who\.int)|(worldbank\.org)|(imf\.org)|(oecd\.org))$/i.test(host)) {
    matches.push('International organization');
  }
  if (source.category === 'News and Journalism') matches.push('News organization');
  if (/\b(inc\.?|incorporated|l\.?l\.?c\.?|ltd\.?|limited|corporation|corp\.?|company|plc)\b/.test(name)) {
    matches.push('Company');
  }
  if (/\b(nonprofit|non-profit|charity|foundation|association|ngo)\b/.test(name)) {
    matches.push('Nonprofit organization');
  }
  if (source.author) matches.push('Individual author or researcher');
  return matches;
}

export function evidenceTypesFor(source) {
  const metadata = `${source.title ?? ''} ${source.type ?? ''} ${source.description ?? ''} ${source.abstract ?? ''}`
    .toLocaleLowerCase();
  const types = [];

  if (/\b(systematic review|meta-analysis|literature review|scoping review|review article)\b/.test(metadata)) {
    types.push('Review or systematic review', 'Secondary source');
  } else if (source.kind === 'academic' &&
    /\b(empirical|participants?|sample size|survey|experiment|randomi[sz]ed|cohort|data were collected|we conducted)\b/.test(metadata)) {
    types.push('Empirical study');
  }
  if (/\b(dataset|data set|data repository|data release)\b/.test(metadata)) {
    types.push('Dataset', 'Primary source');
  }
  if (source.category === 'Government and Official Sources' &&
    /\b(statistics|statistical|census|official data)\b/.test(metadata)) {
    types.push('Official statistics', 'Primary source');
  }
  if (/\b(case study|case report)\b/.test(metadata)) types.push('Case study');
  if (/\b(opinion|commentary|editorial|op-ed|perspective piece)\b/.test(metadata)) {
    types.push('Opinion or commentary');
  }
  return [...new Set(types)];
}

function dateBounds(source) {
  if (!source.date) return null;
  if (/^(19|20)\d{2}$/.test(String(source.date))) {
    const year = Number(source.date);
    return { start: Date.UTC(year, 0, 1), end: Date.UTC(year, 11, 31, 23, 59, 59, 999), precision: 'year' };
  }
  const yearMonth = String(source.date).match(/^((?:19|20)\d{2})-(0[1-9]|1[0-2])$/);
  if (yearMonth) {
    const year = Number(yearMonth[1]);
    const month = Number(yearMonth[2]);
    return {
      start: Date.UTC(year, month - 1, 1),
      end: Date.UTC(year, month, 0, 23, 59, 59, 999),
      precision: 'month',
    };
  }
  const timestamp = Date.parse(source.date);
  if (!Number.isFinite(timestamp)) return null;
  return { start: timestamp, end: timestamp, precision: 'date' };
}

export function dateFilterMatches(source, filters, now = Date.now()) {
  const date = dateBounds(source);
  if (filters.datePreset === 'custom') {
    if (!filters.startDate && !filters.endDate) return true;
    if (!date) return false;
    const start = filters.startDate ? Date.parse(`${filters.startDate}T00:00:00Z`) : -Infinity;
    const end = filters.endDate ? Date.parse(`${filters.endDate}T23:59:59.999Z`) : Infinity;
    return date.end >= start && date.start <= end;
  }
  if (!filters.datePreset || filters.datePreset === 'any') return true;
  if (!date) return false;
  const years = Number(filters.datePreset);
  if (!Number.isFinite(years)) return true;
  const cutoffDate = new Date(now);
  if (years === 12) cutoffDate.setMonth(cutoffDate.getMonth() - 12);
  else cutoffDate.setFullYear(cutoffDate.getFullYear() - years);
  const cutoff = cutoffDate.getTime();
  return date.end >= cutoff;
}

export function compileSourceFilters(filters, context = {}) {
  const datePreset = filters.datePreset;
  const now = Date.now();
  const cutoffDate = new Date(now);
  const years = Number(datePreset);
  if (years === 12) cutoffDate.setMonth(cutoffDate.getMonth() - 12);
  else if (datePreset && datePreset !== 'any' && datePreset !== 'custom') {
    cutoffDate.setFullYear(cutoffDate.getFullYear() - years);
  }

  const area = context.researchAreas?.find((entry) => entry.title === filters.researchArea);
  const researchAreaTerms = area
    ? [...new Set(termsFrom(`${area.title} ${area.description} ${(area.questions ?? []).join(' ')}`)
      .flatMap((term) => term.split(/\s+/))
      .filter((term) => term.length > 3))]
    : [];
  return {
    categories: new Set(filters.categories ?? []),
    search: filters.search?.trim().toLocaleLowerCase() ?? '',
    includeTerms: termsFrom(filters.includeKeywords),
    excludeTerms: termsFrom(filters.excludeKeywords),
    organizationTypes: new Set(filters.organizationTypes ?? []),
    evidenceTypes: new Set(filters.evidenceTypes ?? []),
    accessibility: new Set(filters.accessibility ?? []),
    geographyType: filters.geographyType,
    geographyQuery: filters.geographyValue?.trim().toLocaleLowerCase() ?? '',
    researchAreaTerms,
    claim: filters.claim?.trim().toLocaleLowerCase() ?? '',
    datePreset,
    dateStart: filters.startDate ? Date.parse(`${filters.startDate}T00:00:00Z`) : -Infinity,
    dateEnd: filters.endDate ? Date.parse(`${filters.endDate}T23:59:59.999Z`) : Infinity,
    cutoff: cutoffDate.getTime(),
    now,
    invalidSort: Boolean(filters.sort && !['newest', 'oldest'].includes(filters.sort)),
  };
}

function matchesCompiledDate(source, compiled) {
  const { datePreset, dateStart, dateEnd, cutoff, now } = compiled;
  if (datePreset === 'custom' && dateStart === -Infinity && dateEnd === Infinity) return true;
  if (!datePreset || datePreset === 'any') return true;

  const date = dateBounds(source);
  if (!date) return false;
  if (datePreset === 'custom') return date.end >= dateStart && date.start <= dateEnd;

  const years = Number(datePreset);
  if (!Number.isFinite(years)) return true;
  return date.end >= cutoff;
}

export function datePrecisionFor(source) {
  const bounds = dateBounds(source);
  return bounds?.precision ?? null;
}

export function matchesSourceFilters(source, filters, context = {}, compiled = compileSourceFilters(filters, context)) {
  if (compiled.categories.size && !compiled.categories.has(source.category)) return false;
  if (!matchesCompiledDate(source, compiled)) return false;
  if (compiled.invalidSort) return false;

  let text;
  const getText = () => text ?? (text = sourceSearchText(source));
  if (compiled.search && !getText().includes(compiled.search)) return false;
  if (compiled.includeTerms.some((term) => !getText().includes(term))) return false;
  if (compiled.excludeTerms.some((term) => getText().includes(term))) return false;

  if (compiled.organizationTypes.size) {
    const sourceTypes = source.organizationTypes ?? organizationTypesFor(source);
    if (![...compiled.organizationTypes].some((type) => sourceTypes.includes(type))) return false;
  }

  if (compiled.evidenceTypes.size) {
    const sourceTypes = source.evidenceTypes ?? evidenceTypesFor(source);
    if (![...compiled.evidenceTypes].some((type) => sourceTypes.includes(type))) return false;
  }

  if (compiled.accessibility.size) {
    const available = [];
    if (source.openAccessUrl) available.push('Open-access full-text link');
    if (source.abstract) available.push('Abstract available');
    if (!source.abstract && !source.description) available.push('Metadata only');
    if (source.kind === 'video') available.push('Video available');
    if (/\.pdf(?:$|[?#])/i.test(source.openAccessUrl ?? '')) {
      available.push('Downloadable document link');
    }
    if (![...compiled.accessibility].some((type) => available.includes(type))) return false;
  }

  if (compiled.geographyType === 'worldwide' ||
    (compiled.geographyType && compiled.geographyType !== 'any' && compiled.geographyQuery)) {
    const geoText = sourceGeographyText(source);
    if (compiled.geographyType === 'worldwide') {
      if (!/\b(global|worldwide|international|across the world|around the world)\b/.test(geoText)) return false;
    } else if (!geoText.includes(compiled.geographyQuery)) {
      return false;
    }
  }

  if (filters.researchArea) {
    if (!compiled.researchAreaTerms.length) return false;
    const content = getText();
    const matches = compiled.researchAreaTerms.filter((term) => content.includes(term)).length;
    if (matches < Math.min(2, compiled.researchAreaTerms.length)) return false;
  }
  if (filters.relevanceQuestion) {
    const relevanceContent = [
      source.rawContent,
      source.fullText,
      source.description,
      source.abstract,
      source.evidence,
    ].filter((value) => typeof value === 'string' && value.trim()).join('. ');
    if (!assessQuestionContext(relevanceContent, filters.relevanceQuestion).relevant) return false;
  }
  if (compiled.claim) {
    const evidenceText = [
      source.rawContent,
      source.fullText,
      source.description,
      source.abstract,
      source.evidence,
    ].filter((value) => typeof value === 'string').join(' ').toLocaleLowerCase();
    if (!evidenceText.includes(compiled.claim)) return false;
  }

  return true;
}

export function sortSources(sources, sort) {
  const newestFirst = sort !== 'oldest';
  return sources
    .map((source) => ({ source, date: dateBounds(source) }))
    .sort((leftEntry, rightEntry) => {
    const { source: left, date: leftDate } = leftEntry;
    const { source: right, date: rightDate } = rightEntry;
    if (!leftDate) return rightDate ? 1 : 0;
    if (!rightDate) return -1;
    return newestFirst
      ? rightDate.end - leftDate.end
      : leftDate.start - rightDate.start;
    })
    .map(({ source }) => source);
}

export function removableFilterChips(filters, clearFilter) {
  const chips = [];
  for (const category of filters.categories ?? []) {
    chips.push({ key: `category:${category}`, label: category, remove: () => clearFilter('categories', category) });
  }
  for (const type of filters.organizationTypes ?? []) {
    chips.push({ key: `organization:${type}`, label: type, remove: () => clearFilter('organizationTypes', type) });
  }
  for (const type of filters.evidenceTypes ?? []) {
    chips.push({ key: `evidence:${type}`, label: type, remove: () => clearFilter('evidenceTypes', type) });
  }
  for (const type of filters.accessibility ?? []) {
    chips.push({ key: `accessibility:${type}`, label: type, remove: () => clearFilter('accessibility', type) });
  }
  if (filters.datePreset !== 'any' &&
    (filters.datePreset !== 'custom' || filters.startDate || filters.endDate)) {
    const label = filters.datePreset === 'custom'
      ? `Custom date: ${filters.startDate || 'any start'} – ${filters.endDate || 'any end'}`
      : `Past ${filters.datePreset === '12' ? '12 months' : `${filters.datePreset} years`}`;
    chips.push({ key: 'date', label, remove: () => clearFilter('datePreset') });
  }
  if (filters.search) chips.push({ key: 'search', label: `Search: ${filters.search}`, remove: () => clearFilter('search') });
  if (filters.includeKeywords) chips.push({ key: 'include', label: `Include: ${filters.includeKeywords}`, remove: () => clearFilter('includeKeywords') });
  if (filters.excludeKeywords) chips.push({ key: 'exclude', label: `Exclude: ${filters.excludeKeywords}`, remove: () => clearFilter('excludeKeywords') });
  if (filters.geographyType === 'worldwide' ||
    (filters.geographyType && filters.geographyValue?.trim())) {
    chips.push({
      key: 'geography',
      label: filters.geographyType === 'worldwide'
        ? 'Geography: worldwide/global text mention'
        : `Geography (${filters.geographyType}): ${filters.geographyValue}`,
      remove: () => clearFilter('geographyType'),
    });
  }
  if (filters.researchArea) chips.push({ key: 'area', label: `Area: ${filters.researchArea}`, remove: () => clearFilter('researchArea') });
  if (filters.relevanceQuestion) chips.push({ key: 'question', label: `Question relevance: ${filters.relevanceQuestion}`, remove: () => clearFilter('relevanceQuestion') });
  if (filters.claim) chips.push({ key: 'claim', label: `Claim text: ${filters.claim}`, remove: () => clearFilter('claim') });
  return chips;
}
