import { researchTopicTerms } from '../src/utils/researchQuery.js';

const PURPOSES = new Set([
  'assignment',
  'academic',
  'journalism',
  'business',
  'general',
  'other',
]);

export const SOURCE_LIMITS = [20, 50, 100];
export const SOURCE_LIMIT_ALL = 'all';

const KNOWN_PLACES = [
  'Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania',
  'United States', 'United Kingdom', 'Canada', 'Nigeria', 'Ghana', 'Kenya',
  'India', 'China', 'Australia', 'West Africa', 'East Africa',
].sort((a, b) => b.length - a.length);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function validateResearchRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Enter a research question to continue.';
  }

  if (typeof body.question !== 'string') {
    return 'Enter a research question to continue.';
  }

  const question = body.question.trim();
  if (question.length < 8) {
    return 'Add a little more detail (at least 8 characters).';
  }
  if (
    body.sourceLimit !== undefined &&
    body.sourceLimit !== SOURCE_LIMIT_ALL &&
    !SOURCE_LIMITS.includes(body.sourceLimit)
  ) {
    return 'Choose all available sources or a limit of 20, 50, or 100.';
  }

  if (body.region !== undefined && (typeof body.region !== 'string' || body.region.trim().length > 100)) {
    return 'Use a region name with up to 100 characters, or leave it blank.';
  }
  if (body.year !== undefined && body.year !== '' && body.year !== null) {
    const year = Number(body.year);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
      return 'Choose a valid year between 1900 and 2100, or leave it blank.';
    }
  }
  for (const field of ['fromYear', 'toYear']) {
    if (body[field] !== undefined && body[field] !== '' && body[field] !== null) {
      const year = Number(body[field]);
      if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        return 'Choose valid years between 1900 and 2100.';
      }
    }
  }
  if ((body.fromYear && !body.toYear) || (!body.fromYear && body.toYear)) {
    return 'Choose both a start year and an end year.';
  }
  if (body.fromYear && body.toYear && Number(body.fromYear) > Number(body.toYear)) {
    return 'The start year must be before or the same as the end year.';
  }
  if (body.month !== undefined && body.month !== '' && body.month !== null && !MONTH_NAMES.includes(body.month)) {
    return 'Choose a valid month, or leave it blank.';
  }
  if (body.month && !body.year && !body.fromYear) {
    return 'Choose a year before selecting a month.';
  }
  if (body.month && body.fromYear && body.fromYear !== body.toYear) {
    return 'Choose one year before selecting a month, or clear the month to search across years.';
  }

  if (
    !Array.isArray(body.purposes) ||
    body.purposes.length === 0 ||
    body.purposes.length > PURPOSES.size
  ) {
    return 'Choose one or more research purposes.';
  }
  if (
    body.purposes.some(
      (purpose) => typeof purpose !== 'string' || !PURPOSES.has(purpose),
    )
  ) {
    return 'One of the selected research purposes is not supported.';
  }

  return null;
}

function getTerms(question) {
  return researchTopicTerms(question, 8);
}

function getResearchAreas(question) {
  const subject = question
    .replace(/^(what|how|why|when|where|which)\s+(is|are|does|do|did|has|have|can|will)\s+/i, '')
    .replace(/[?!.]+$/g, '')
    .trim();
  const focus = subject.length > 110 ? `${subject.slice(0, 107)}...` : subject;
  const areas = [
    {
      title: `Background and context: ${focus}`,
      description: 'Find definitions, context, and how this topic is framed in the available literature.',
      questions: ['How do sources define the topic?', 'What background information is needed?'],
    },
    {
      title: `Effects and outcomes related to ${focus}`,
      description: 'Look for measured outcomes and the people, places, or systems affected.',
      questions: ['What outcomes have been studied?', 'Who or what is affected?'],
    },
    {
      title: `Evidence, methods, and limitations`,
      description: 'Check how findings were produced and where the available evidence has limits.',
      questions: ['What methods were used?', 'What uncertainty or limitations do sources report?'],
    },
  ];

  if (/\b(cause|causes|why|factor|factors|influence|impact|effect)\b/i.test(question)) {
    areas.splice(1, 0, {
      title: `Possible causes and contributing factors`,
      description: 'Separate proposed causes from associations and look for evidence about how they are connected.',
      questions: ['Which factors are associated with the issue?', 'Does a source establish causation or only correlation?'],
    });
  }

  return areas;
}

function getGeographicScope(question, region) {
  if (region && region.trim()) return region.trim();
  const matches = KNOWN_PLACES.filter((place) =>
    new RegExp(`\\b${place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(question),
  ).filter((place) => !KNOWN_PLACES.some(
    (other) => other.length > place.length && other.includes(place) &&
      new RegExp(`\\b${other.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(question),
  ));

  if (matches.length) return matches.join(', ');
  if (/\b(worldwide|global|international|around the world)\b/i.test(question)) {
    return 'Worldwide (as stated in the question)';
  }
  return 'Not identified automatically';
}

function getTimePeriod(question, year, month, fromYear, toYear) {
  if (fromYear && toYear) {
    if (fromYear === toYear) return month ? `${month} ${fromYear}` : String(fromYear);
    return `${fromYear}-${toYear}`;
  }
  if (year) return month ? `${month} ${year}` : String(year);
  const explicitRange = question.match(/\b(?:19|20)\d{2}\s*(?:-|to|through)\s*(?:19|20)\d{2}\b/i);
  const singleYear = question.match(/\b(?:19|20)\d{2}\b/);
  return explicitRange?.[0] ?? singleYear?.[0] ?? 'Not specified';
}

export function analyzeQuestion(question, purposes = [], options = {}) {
  const { region = '', year = null, month = '', fromYear = null, toYear = null } = options;
  const terms = getTerms(question);
  const mainSubject = question.trim().replace(/[?!.]+$/g, '');
  const keywords = terms.slice(0, 5);

  return {
    method: 'Rule-based planning (no AI model used)',
    mainSubject,
    geographicScope: getGeographicScope(question, region),
    timePeriod: getTimePeriod(question, year, month, fromYear, toYear),
    keywords,
    purposes,
    researchAreas: getResearchAreas(question),
    searchQueries: [question.trim()],
    assumptions: [
      'Research areas are starting points generated from your wording, not findings.',
      'The initial source search covers scholarly metadata from OpenAlex, Crossref, and Semantic Scholar.',
      'Automatic geography recognition covers a limited list of common place names.',
      'A missing result means it was not found in this search, not that no research exists.',
    ],
  };
}

function reconstructAbstract(index) {
  if (!index || typeof index !== 'object') return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      if (Number.isInteger(position) && position >= 0 && position < 10000) {
        words[position] = word;
      }
    }
  }
  return words.filter(Boolean).join(' ').slice(0, 6000);
}

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000);
}

function yearFromParts(parts) {
  const year = Array.isArray(parts) ? Number(parts[0]?.[0]) : NaN;
  return Number.isInteger(year) && year >= 1000 && year <= 9999 ? year : null;
}

function monthFromParts(parts) {
  const month = Array.isArray(parts) ? Number(parts[0]?.[1]) : NaN;
  return Number.isInteger(month) && month >= 1 && month <= 12 ? month : null;
}

function monthFromDate(date) {
  if (typeof date !== 'string') return null;
  const month = Number(date.slice(5, 7));
  return /^\d{4}-\d{2}/.test(date) && month >= 1 && month <= 12 ? month : null;
}

function safeHttpUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function normalizeOpenAlex(work) {
  const doi = typeof work.doi === 'string' ? work.doi.replace(/^https?:\/\/doi\.org\//i, '') : '';
  const openAlexUrl = typeof work.id === 'string' ? work.id : '';
  const url = safeHttpUrl(doi ? `https://doi.org/${doi}` : '') ||
    safeHttpUrl(work.primary_location?.landing_page_url) ||
    safeHttpUrl(openAlexUrl);
  const title = cleanText(work.title);
  if (!title || !url) return null;

  return {
    id: doi ? `doi:${doi.toLowerCase()}` : openAlexUrl || `title:${title.toLowerCase()}`,
    title,
    authors: (work.authorships ?? [])
      .slice(0, 8)
      .map((entry) => cleanText(entry.author?.display_name))
      .filter(Boolean),
    publicationYear: Number.isInteger(work.publication_year) ? work.publication_year : null,
    publicationMonth: monthFromDate(work.publication_date),
    publisher: cleanText(work.primary_location?.source?.display_name),
    journal: cleanText(work.primary_location?.source?.display_name),
    url,
    doi: doi || null,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    metadataSource: 'OpenAlex',
    sourceType: 'Scholarly work',
    openAccess: work.open_access?.is_oa === true,
    citationCount: Number.isInteger(work.cited_by_count) ? work.cited_by_count : null,
  };
}

function normalizeCrossref(work) {
  const title = cleanText(Array.isArray(work.title) ? work.title[0] : work.title);
  const doi = typeof work.DOI === 'string' ? work.DOI : '';
  const url = safeHttpUrl(doi ? `https://doi.org/${doi}` : '') || safeHttpUrl(work.URL);
  if (!title || !url) return null;

  const authors = (work.author ?? [])
    .slice(0, 8)
    .map((author) => [author.given, author.family].filter(Boolean).join(' '))
    .filter(Boolean);

  return {
    id: doi ? `doi:${doi.toLowerCase()}` : `crossref:${url}`,
    title,
    authors,
    publicationYear: yearFromParts(work.published?.['date-parts']),
    publicationMonth: monthFromParts(work.published?.['date-parts']),
    publisher: cleanText(work.publisher),
    journal: cleanText(Array.isArray(work['container-title']) ? work['container-title'][0] : ''),
    url,
    doi: doi || null,
    abstract: cleanText(work.abstract),
    metadataSource: 'Crossref',
    sourceType: cleanText(work.type) || 'Scholarly record',
    openAccess: null,
    citationCount: Number.isInteger(work['is-referenced-by-count'])
      ? work['is-referenced-by-count']
      : null,
  };
}

function normalizeSemanticScholar(work) {
  const doi = typeof work.externalIds?.DOI === 'string' ? work.externalIds.DOI : '';
  const paperId = typeof work.paperId === 'string' ? work.paperId : '';
  const openAccessUrl = safeHttpUrl(work.openAccessPdf?.url);
  const url = safeHttpUrl(doi ? `https://doi.org/${doi}` : '') ||
    openAccessUrl ||
    safeHttpUrl(paperId ? `https://www.semanticscholar.org/paper/${paperId}` : '');
  const title = cleanText(work.title);
  if (!title || !url) return null;

  return {
    id: doi ? `doi:${doi.toLowerCase()}` : `semanticscholar:${paperId || url}`,
    title,
    authors: (work.authors ?? [])
      .slice(0, 8)
      .map((author) => cleanText(author.name))
      .filter(Boolean),
    publicationYear: Number.isInteger(work.year) ? work.year : null,
    publicationMonth: monthFromDate(work.publicationDate),
    publisher: cleanText(work.venue),
    journal: cleanText(work.venue),
    url,
    doi: doi || null,
    abstract: cleanText(work.abstract),
    openAccessUrl,
    metadataSource: 'Semantic Scholar',
    sourceType: 'Scholarly work',
    openAccess: Boolean(openAccessUrl),
    citationCount: Number.isInteger(work.citationCount) ? work.citationCount : null,
  };
}

export function normalizeSources(
  openAlexWorks = [],
  crossrefWorks = [],
  limit = 100,
  semanticScholarWorks = [],
) {
  const sources = new Map();

  for (const source of [
    ...openAlexWorks.map(normalizeOpenAlex),
    ...crossrefWorks.map(normalizeCrossref),
    ...semanticScholarWorks.map(normalizeSemanticScholar),
  ]) {
    if (!source) continue;
    const key = source.doi
      ? `doi:${source.doi.toLowerCase()}`
      : source.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const existing = sources.get(key);
    if (!existing) {
      sources.set(key, source);
      continue;
    }
    sources.set(key, {
      ...existing,
      authors: existing.authors.length ? existing.authors : source.authors,
      publicationYear: existing.publicationYear ?? source.publicationYear,
      publicationMonth: existing.publicationMonth ?? source.publicationMonth,
      publisher: existing.publisher || source.publisher,
      journal: existing.journal || source.journal,
      abstract: existing.abstract || source.abstract,
      openAccessUrl: existing.openAccessUrl || source.openAccessUrl,
      metadataSource: existing.metadataSource.split(' and ').includes(source.metadataSource)
        ? existing.metadataSource
        : `${existing.metadataSource} and ${source.metadataSource}`,
      openAccess: existing.openAccess ?? source.openAccess,
      citationCount: existing.citationCount ?? source.citationCount,
    });
  }

  return Number.isFinite(limit) ? [...sources.values()].slice(0, limit) : [...sources.values()];
}
