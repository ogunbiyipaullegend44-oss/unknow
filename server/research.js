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

function getAdditionalResearchAreas(focus) {
  return [
    {
      title: `Historical development and trends in ${focus}`,
      description: `Trace how ${focus} has changed over time and identify events or shifts that may explain those changes.`,
      questions: [`How has ${focus} changed over time?`, `Which events or policy changes shaped trends in ${focus}?`],
    },
    {
      title: `Stakeholder experiences and perspectives on ${focus}`,
      description: `Explore how people directly affected by ${focus} describe their experiences, priorities, and needs.`,
      questions: [`How do affected people describe their experiences with ${focus}?`, `Whose perspectives are missing from evidence about ${focus}?`],
    },
    {
      title: `Implementation barriers and enabling conditions for ${focus}`,
      description: `Examine what helps or prevents policies, interventions, or practices related to ${focus} from working in real settings.`,
      questions: [`What barriers affect implementation of responses to ${focus}?`, `Which conditions help interventions related to ${focus} succeed?`],
    },
    {
      title: `Costs and resource requirements of ${focus}`,
      description: `Assess the financial, staffing, infrastructure, and other resources needed to address or sustain ${focus}.`,
      questions: [`What costs or resources are associated with ${focus}?`, `How do resource constraints affect responses to ${focus}?`],
    },
    {
      title: `Trade-offs and unintended effects of ${focus}`,
      description: `Look for potential trade-offs, unequal consequences, or outcomes that were not the primary goal of actions related to ${focus}.`,
      questions: [`What unintended effects have been reported for ${focus}?`, `Who may benefit or be disadvantaged by responses to ${focus}?`],
    },
  ];
}

function getResearchAreas(question) {
  const subject = question
    .replace(/^(what|how|why|when|where|which)\s+(is|are|does|do|did|has|have|can|will)\s+/i, '')
    .replace(/[?!.]+$/g, '')
    .trim();
  const focus = subject.length > 110 ? `${subject.slice(0, 107)}...` : subject;
  const profiles = [
    {
      pattern: /\b(health|disease|cancer|medical|medicine|patient|patients|asthma|mental health|public health|epidemic|clinical)\b/i,
      areas: [
        [`Risk factors and exposure pathways for ${focus}`, `Identify exposures and risk factors studied in relation to ${focus}.`, [`Which exposures are associated with ${focus}?`, `What evidence separates correlation from causation for ${focus}?`]],
        [`Health outcomes and affected populations`, `Compare reported outcomes for ${focus} across populations, locations, and time periods.`, [`Which populations have been studied for ${focus}?`, `How do outcomes for ${focus} differ by age, sex, or location?`]],
        [`Prevention, diagnosis, and care for ${focus}`, `Review interventions and care approaches evaluated for ${focus}, including their reported benefits and limitations.`, [`Which prevention or treatment approaches have been evaluated for ${focus}?`, `What barriers affect access to care for ${focus}?`]],
        [`Clinical and public-health evidence on ${focus}`, `Assess study designs, sample sizes, and uncertainty in the available evidence about ${focus}.`, [`What study designs support findings about ${focus}?`, `Where is evidence about ${focus} still uncertain?`]],
      ],
    },
    {
      pattern: /\b(education|school|schools|student|students|teacher|teachers|learning|literacy|university|universities|classroom|curriculum)\b/i,
      areas: [
        [`Access and learning outcomes for ${focus}`, `Examine how ${focus} relates to enrollment, attendance, learning, or completion.`, [`Which learning outcomes are measured for ${focus}?`, `Which learners face the greatest barriers related to ${focus}?`]],
        [`Resources and education policy around ${focus}`, `Compare funding, staffing, facilities, and policies connected to ${focus}.`, [`How do resources or policies shape ${focus}?`, `Do outcomes for ${focus} differ between public and private schools?`]],
        [`Equity and local experience of ${focus}`, `Explore how experiences of ${focus} vary by income, gender, disability, and location.`, [`Which groups are underrepresented in evidence about ${focus}?`, `How do learners and teachers describe ${focus}?`]],
        [`Education evidence and assessment for ${focus}`, `Review assessment methods and the limits of available data about ${focus}.`, [`How is ${focus} measured across studies?`, `What data gaps limit comparisons of ${focus}?`]],
      ],
    },
    {
      pattern: /\b(climate|warming|weather|pollution|air quality|biodiversity|ecosystem|wildlife|deforestation|emissions|environment|flood|drought|wildfire|renewable energy)\b/i,
      areas: [
        [`Drivers and exposure patterns for ${focus}`, `Investigate the sources, trends, and exposure patterns relevant to ${focus}.`, [`Which human or natural drivers are linked to ${focus}?`, `How do exposure levels for ${focus} vary by place and season?`]],
        [`Health, ecosystem, and infrastructure impacts`, `Compare measured impacts of ${focus} on people, ecosystems, and built environments.`, [`What impacts of ${focus} have been measured directly?`, `Which communities or ecosystems are most exposed to ${focus}?`]],
        [`Mitigation and adaptation responses to ${focus}`, `Review policies and interventions tested to reduce or adapt to ${focus}.`, [`Which responses to ${focus} have demonstrated measurable results?`, `What trade-offs are reported for interventions addressing ${focus}?`]],
        [`Monitoring and environmental evidence for ${focus}`, `Assess the observations, models, and uncertainty used to study ${focus}.`, [`Which monitoring datasets track ${focus}?`, `How do models and direct observations of ${focus} compare?`]],
      ],
    },
    {
      pattern: /\b(economy|economic|employment|jobs|wages|income|poverty|inflation|trade|labor|labour|business|industry|market|unemployment)\b/i,
      areas: [
        [`Employment and income outcomes for ${focus}`, `Examine effects and associations involving jobs, wages, income, and working conditions.`, [`How does ${focus} relate to employment and wages?`, `Which workers or sectors experience different outcomes from ${focus}?`]],
        [`Policy and market forces affecting ${focus}`, `Compare policies, market conditions, and institutions connected to ${focus}.`, [`Which policy changes are associated with ${focus}?`, `How do market or industry conditions shape ${focus}?`]],
        [`Distributional and regional effects of ${focus}`, `Study how the costs and benefits of ${focus} differ across households, sectors, and places.`, [`Who benefits or bears the costs of ${focus}?`, `How do regional effects of ${focus} compare?`]],
        [`Economic data and methods for ${focus}`, `Review datasets, indicators, and methods used to estimate changes related to ${focus}.`, [`Which indicators best measure ${focus}?`, `What limitations affect economic estimates of ${focus}?`]],
      ],
    },
    {
      pattern: /\b(technology|artificial intelligence|AI|algorithm|algorithms|automation|digital|internet|social media|platform|cybersecurity|software|robotics)\b/i,
      areas: [
        [`Adoption and use of ${focus}`, `Compare who uses ${focus}, how it is adopted, and what barriers affect access.`, [`How is ${focus} adopted across groups or sectors?`, `What prevents people from accessing or using ${focus}?`]],
        [`Benefits, harms, and outcomes of ${focus}`, `Review measured effects and reported risks of ${focus} in real-world settings.`, [`What benefits of ${focus} have been independently measured?`, `What harms or unintended effects are associated with ${focus}?`]],
        [`Governance, privacy, and accountability for ${focus}`, `Examine rules, safeguards, and accountability mechanisms applied to ${focus}.`, [`Which regulations or standards govern ${focus}?`, `How are privacy, safety, and accountability handled for ${focus}?`]],
        [`Technical evaluation and evidence on ${focus}`, `Compare evaluation methods, benchmarks, and limitations in studies of ${focus}.`, [`How is the performance of ${focus} evaluated?`, `Which benchmarks or datasets are used to assess ${focus}?`]],
      ],
    },
    {
      pattern: /\b(agriculture|farming|farmer|farmers|crop|crops|food security|food supply|livestock|irrigation|soil)\b/i,
      areas: [
        [`Production and livelihoods related to ${focus}`, `Explore effects of ${focus} on yields, farm income, and rural livelihoods.`, [`How does ${focus} affect crop or livestock production?`, `Which farming households are most affected by ${focus}?`]],
        [`Inputs, land, and water in ${focus}`, `Compare land, seed, fertilizer, water, and technology factors connected to ${focus}.`, [`Which inputs are linked to outcomes in ${focus}?`, `How do land and water conditions shape ${focus}?`]],
        [`Food access and resilience around ${focus}`, `Assess how ${focus} relates to food prices, availability, nutrition, and resilience.`, [`What food-security outcomes are associated with ${focus}?`, `How resilient are communities affected by ${focus}?`]],
        [`Agricultural data and methods for ${focus}`, `Review field studies, production data, and measurement limits relevant to ${focus}.`, [`Which datasets track ${focus}?`, `How comparable are agricultural studies of ${focus}?`]],
      ],
    },
  ];

  const profile = profiles.find(({ pattern }) => pattern.test(question));
  if (profile) {
    return [
      ...profile.areas.map(([title, description, questions]) => ({ title, description, questions })),
      ...getAdditionalResearchAreas(focus),
    ];
  }

  const areas = [
    {
      title: `Background and context for ${focus}`,
      description: `Clarify how ${focus} is defined and what historical, social, or institutional context shapes it.`,
      questions: [`How do sources define ${focus}?`, `What context is needed to interpret evidence about ${focus}?`],
    },
    {
      title: `People, places, and outcomes connected to ${focus}`,
      description: `Compare who or what is affected by ${focus} and how the reported outcomes vary.`,
      questions: [`Which groups or places are most affected by ${focus}?`, `What outcomes have been measured for ${focus}?`],
    },
    {
      title: `Responses and decisions related to ${focus}`,
      description: `Review actions, policies, or practical responses related to ${focus} and what evaluations report.`,
      questions: [`Which responses to ${focus} have been evaluated?`, `What evidence supports or challenges those responses to ${focus}?`],
    },
    {
      title: `Evidence and measurement of ${focus}`,
      description: `Check how researchers measure ${focus}, compare results, and describe uncertainty.`,
      questions: [`Which methods and data are used to study ${focus}?`, `What limitations affect current evidence about ${focus}?`],
    },
  ];

  if (/\b(cause|causes|why|factor|factors|influence|impact|effect)\b/i.test(question)) {
    areas.splice(1, 0, {
      title: `Drivers and mechanisms behind ${focus}`,
      description: `Separate proposed causes of ${focus} from associations and identify evidence about how they connect.`,
      questions: [`Which factors are associated with ${focus}?`, `What evidence distinguishes causes of ${focus} from correlation?`],
    });
  }
  if (/\b(compare|comparison|versus|vs\.?|difference|differences)\b/i.test(question)) {
    areas.splice(2, 0, {
      title: `Comparisons and differences in ${focus}`,
      description: `Identify comparable measures and contextual differences needed to interpret comparisons of ${focus}.`,
      questions: [`How do the cases in ${focus} differ on comparable measures?`, `Which contextual factors may explain differences in ${focus}?`],
    });
  }

  return [...areas, ...getAdditionalResearchAreas(focus)];
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
