import { buildEvidenceStatements } from './claimEvidenceUtils.js';

const STOP_WORDS = new Set([
  'about', 'after', 'also', 'among', 'because', 'been', 'being', 'between',
  'does', 'from', 'have', 'into', 'more', 'most', 'other', 'over', 'research',
  'such', 'than', 'that', 'their', 'there', 'these', 'they', 'this', 'through',
  'using', 'were', 'what', 'when', 'where', 'which', 'with',
]);
const METHOD_TERMS = /\b(method|methodology|participant|sample|survey|interview|experiment|dataset|data\s+were|regression|randomi[sz]ed|cohort|case\s+study|qualitative|quantitative|mixed[- ]methods?)\b/i;
const POPULATION_TERMS = /\b(participants?|respondents?|people|persons|adults?|children|adolescents?|youth|students?|women|men|patients?|households?|workers?|residents?|participants?|sample\s+of|aged?\s+\d+|ages?\s+\d+)\b/i;
const COMPARISON_TERMS = /\b(compare|compared|comparison|versus|vs\.?|higher|lower|difference|relative\s+to|control\s+group|baseline)\b/i;
const REVIEW_TERMS = /\b(systematic\s+review|meta[- ]analysis|scoping\s+review|literature\s+review)\b/i;
const PRIMARY_TERMS = /\b(randomi[sz]ed|trial|participants?|survey|interview|experiment|cohort|case\s+study|field\s+study|we\s+(?:collected|conducted|interviewed|surveyed)|data\s+were\s+collected)\b/i;
const MONTHS = 5;

function words(value) {
  return [...new Set(
    (String(value ?? '').toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [])
      .filter((word) => word.length > 3 && !STOP_WORDS.has(word)),
  )];
}

function recordText(record) {
  return `${record.title} ${record.description} ${record.publisher}`.toLocaleLowerCase();
}

function toRecords(research) {
  return [
    ...(research.sources ?? []).map((source) => ({
      id: `scholarly:${source.id}`,
      title: source.title,
      url: source.url,
      kind: 'Scholarly record',
      provider: source.metadataSource || 'Academic catalog',
      date: source.publicationYear ? String(source.publicationYear) : '',
      description: source.abstract || '',
      publisher: source.journal || source.publisher || '',
    })),
    ...(research.webSources ?? []).map((source) => ({
      id: `web:${source.id}`,
      title: source.title,
      url: source.url,
      kind: 'Web search result',
      provider: source.provider || 'Web search',
      date: source.publishedAt || '',
      description: source.description || '',
      publisher: '',
    })),
  ].filter((record) => record.title && record.url);
}

function areaTerms(area) {
  return words(`${area.title} ${area.description} ${(area.questions ?? []).join(' ')}`);
}

function matchingAreaRecords(records, area) {
  const terms = areaTerms(area);
  if (!terms.length) return [];
  return records.filter((record) => {
    const text = recordText(record);
    const matches = terms.filter((term) => text.includes(term)).length;
    return matches >= Math.min(2, terms.length);
  });
}

function queryRecords(records, question) {
  const terms = words(question);
  if (!terms.length) return [];
  return records.filter((record) => {
    const text = recordText(record);
    return terms.filter((term) => text.includes(term)).length >= Math.min(2, terms.length);
  });
}

function reviewedRecords(records, selected = records) {
  const ordered = selected.length ? selected : records;
  return ordered.slice(0, 5).map(({ id, title, url, kind, provider, date }) => ({
    id,
    title,
    url,
    kind,
    provider,
    date: date || 'Date not available',
  }));
}

function gap(records, details) {
  return {
    ...details,
    sourcesReviewed: reviewedRecords(records, details.reviewedRecords),
  };
}

function hasExplicitTimePeriod(research) {
  return research.analysis?.timePeriod &&
    research.analysis.timePeriod !== 'Not specified' &&
    research.analysis.timePeriod !== 'Not identified automatically';
}

export function buildResearchGaps(research, now = new Date()) {
  const records = toRecords(research);
  const scholarly = records.filter((record) => record.kind === 'Scholarly record');
  const withAbstract = scholarly.filter((record) => record.description.trim());
  const gaps = [];
  const areas = research.analysis?.researchAreas ?? [];
  const areaMatches = areas.map((area) => ({
    area,
    matches: matchingAreaRecords(records, area),
  }));

  if (!records.length) {
    gaps.push(gap(records, {
      id: 'no-retrieved-sources',
      description: 'No sources were retrieved for this search',
      whyItMatters: 'There is no material in this collection to assess against the research question.',
      supportingExplanation: 'The current search returned no usable scholarly records or web results. This describes this search run only; it does not show that relevant evidence is absent elsewhere.',
      researchArea: areas[0]?.title ?? 'Overall research question',
      reviewedRecords: [],
      missingInformation: 'Relevant source records, publication details, and evidence passages.',
      suggestedNextSearch: research.question,
      suggestedResearchQuestion: `What sources and evidence address: ${research.question}`,
    }));
  } else {
    const questionMatches = queryRecords(records, research.question);
    if (questionMatches.length < 2) {
      gaps.push(gap(records, {
        id: 'question-coverage',
        description: questionMatches.length
          ? 'Limited direct coverage of the research question'
          : 'No clear wording match for the research question',
        whyItMatters: 'A small number of records that match the question wording may leave its central concepts or requested relationship insufficiently covered.',
        supportingExplanation: `${questionMatches.length} of ${records.length} scholarly records and web results matched at least two question terms in their retrieved title, abstract, description, or publisher metadata. This is a wording-based signal, not a full-text relevance judgment.`,
        researchArea: 'Overall research question',
        reviewedRecords: questionMatches,
        missingInformation: 'More directly relevant records and passages that address the question’s main concepts and relationship.',
        suggestedNextSearch: `${research.question} evidence study findings`,
        suggestedResearchQuestion: `What retrieved evidence directly addresses ${research.question}`,
      }));
    }

    for (const { area, matches } of areaMatches) {
      if (matches.length > 1) continue;
      gaps.push(gap(records, {
        id: `area-${area.title}`,
        description: matches.length
          ? `Limited collection coverage: ${area.title}`
          : `No clear collection match: ${area.title}`,
        whyItMatters: 'Research Map areas represent different aspects of the question; sparse matching records may leave this part underexplored in the current collection.',
        supportingExplanation: `${matches.length} of ${records.length} scholarly records and web results matched the area’s wording. Area matching uses titles, retrieved abstracts or snippets, and publisher names; it does not establish relevance or field-wide coverage.`,
        researchArea: area.title,
        reviewedRecords: matches,
        missingInformation: `More directly relevant evidence for: ${(area.questions ?? []).join(' ')}`,
        suggestedNextSearch: `${area.title} ${area.questions?.[0] ?? ''}`.trim(),
        suggestedResearchQuestion: area.questions?.[0] ?? `What evidence addresses ${area.title}?`,
      }));
    }
  }

  const geographicScope = research.scope?.region || research.analysis?.geographicScope || '';
  if (
    geographicScope &&
    !/not identified|worldwide|global|international/i.test(geographicScope) &&
    records.length
  ) {
    const locationPattern = new RegExp(
      geographicScope.split(',')[0].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i',
    );
    const locationMatches = records.filter((record) => locationPattern.test(recordText(record)));
    if (locationMatches.length < Math.min(2, records.length)) {
      gaps.push(gap(records, {
        id: 'geographic-coverage',
        description: `Limited location signals for ${geographicScope}`,
        whyItMatters: 'Evidence from other settings may not transfer to the requested location, and place-specific context can affect interpretation.',
        supportingExplanation: `${locationMatches.length} of ${records.length} retrieved scholarly records and web results mention “${geographicScope.split(',')[0].trim()}” in the metadata or retrieved text. Location may be absent from catalog metadata even when a study covers the area.`,
        researchArea: 'Geographic coverage',
        reviewedRecords: locationMatches,
        missingInformation: `Verified study locations and context-specific evidence for ${geographicScope}.`,
        suggestedNextSearch: `${research.question} ${geographicScope} local study`,
        suggestedResearchQuestion: `What studies examine ${research.analysis?.mainSubject ?? research.question} in ${geographicScope}?`,
      }));
    }
  }

  const currentYear = now.getFullYear();
  const datedScholarly = scholarly.filter((record) => /^\d{4}$/.test(record.date));
  const newestYear = Math.max(...datedScholarly.map((record) => Number(record.date)));
  if (
    datedScholarly.length &&
    newestYear < currentYear - 5 &&
    !hasExplicitTimePeriod(research)
  ) {
    gaps.push(gap(records, {
      id: 'evidence-recency',
      description: 'The newest dated scholarly record may be out of date',
      whyItMatters: 'Evidence can change over time; newer studies, guidance, or statistics may alter what the current collection suggests.',
      supportingExplanation: `The newest publication year visible in the ${datedScholarly.length} dated scholarly record${datedScholarly.length === 1 ? '' : 's'} is ${newestYear}. The search did not specify a historical time period. Publication dates alone do not establish whether a source is obsolete.`,
      researchArea: 'Evidence recency',
      reviewedRecords: datedScholarly.sort((a, b) => Number(b.date) - Number(a.date)),
      missingInformation: `Recent studies or updated data published after ${newestYear}.`,
      suggestedNextSearch: `${research.question} study ${currentYear - 5}-${currentYear}`,
      suggestedResearchQuestion: `What newer evidence published since ${currentYear - 5} updates knowledge about ${research.analysis?.mainSubject ?? research.question}?`,
    }));
  }

  if (scholarly.length && !withAbstract.some((record) => POPULATION_TERMS.test(record.description))) {
    gaps.push(gap(records, {
      id: 'population-coverage',
      description: 'Population representation is unclear in retrieved study records',
      whyItMatters: 'Findings may apply differently across age groups, communities, or other populations; records without participant details cannot establish who was represented.',
      supportingExplanation: `None of the ${withAbstract.length} scholarly abstract${withAbstract.length === 1 ? '' : 's'} retrieved contains common participant or population descriptors. This may reflect missing abstract metadata rather than unrepresented populations in the underlying studies.`,
      researchArea: 'Population coverage',
      reviewedRecords: withAbstract,
      missingInformation: 'Participant characteristics, inclusion criteria, sample size, and whether relevant populations were represented.',
      suggestedNextSearch: `${research.question} participants population sample demographics`,
      suggestedResearchQuestion: `Which populations and participant groups are represented in studies of ${research.analysis?.mainSubject ?? research.question}?`,
    }));
  }

  const methodRecords = withAbstract.filter((record) => METHOD_TERMS.test(record.description));
  if (scholarly.length && methodRecords.length < Math.ceil(scholarly.length / 2)) {
    gaps.push(gap(records, {
      id: 'methodological-information',
      description: 'Methodological information is limited in retrieved records',
      whyItMatters: 'Without study design, sampling, and analysis details, readers cannot assess how findings were produced or how much confidence to place in them.',
      supportingExplanation: `${methodRecords.length} of ${scholarly.length} scholarly records contain an abstract with common method-related terms. Catalog abstracts can omit methods that are described in the full text.`,
      researchArea: 'Methods and limitations',
      reviewedRecords: scholarly,
      missingInformation: 'Study design, sampling and recruitment, measures, analysis approach, and reported limitations.',
      suggestedNextSearch: `${research.question} methodology study design sample`,
      suggestedResearchQuestion: `How were the studies of ${research.analysis?.mainSubject ?? research.question} designed, sampled, and analyzed?`,
    }));
  }

  if (withAbstract.length >= 2) {
    gaps.push(gap(records, {
      id: 'conflicting-findings',
      description: 'Potentially conflicting findings have not been compared',
      whyItMatters: 'Differences in results, populations, methods, or context can materially change how evidence should be interpreted.',
      supportingExplanation: `${withAbstract.length} scholarly abstracts are available for review, but this tool does not determine whether findings agree or conflict. This is a prompt for manual comparison, not a claim that contradictory results exist.`,
      researchArea: 'Cross-study synthesis',
      reviewedRecords: withAbstract,
      missingInformation: 'Comparable outcome measures, effect directions, uncertainty, study context, and reasons results may differ.',
      suggestedNextSearch: `${research.question} conflicting findings comparison systematic review`,
      suggestedResearchQuestion: `Do studies of ${research.analysis?.mainSubject ?? research.question} report consistent findings, and how do their methods or contexts differ?`,
    }));
  }

  const hasPrimaryIndicators = scholarly.some((record) => PRIMARY_TERMS.test(record.description));
  const onlyReviews = scholarly.length > 0 && scholarly.every((record) => REVIEW_TERMS.test(`${record.title} ${record.description}`));
  if (scholarly.length && !hasPrimaryIndicators && !onlyReviews) {
    gaps.push(gap(records, {
      id: 'primary-sources',
      description: 'Primary-source status is not established by the retrieved metadata',
      whyItMatters: 'Primary studies can provide direct observations or measurements, while secondary sources synthesize existing work; both may be useful for different purposes.',
      supportingExplanation: 'The retrieved titles and abstracts do not clearly identify primary-study designs. Catalog metadata may omit design details, so this does not establish that primary research is missing.',
      researchArea: 'Source types',
      reviewedRecords: scholarly,
      missingInformation: 'Study type and, where relevant, original datasets, field reports, trials, interviews, or other primary evidence.',
      suggestedNextSearch: `${research.question} primary study original data`,
      suggestedResearchQuestion: `Which primary studies or original datasets directly examine ${research.analysis?.mainSubject ?? research.question}?`,
    }));
  }

  if (
    COMPARISON_TERMS.test(research.question) &&
    !withAbstract.some((record) => COMPARISON_TERMS.test(record.description))
  ) {
    gaps.push(gap(records, {
      id: 'comparison-data',
      description: 'Comparison data is not visible in retrieved scholarly abstracts',
      whyItMatters: 'The requested comparison cannot be evaluated from the current metadata unless both comparison groups, outcomes, and comparable measures are identified.',
      supportingExplanation: `The question requests a comparison, but none of the ${withAbstract.length} retrieved scholarly abstract${withAbstract.length === 1 ? '' : 's'} uses common comparison language. The full text may contain comparison data that is not present in abstracts.`,
      researchArea: 'Comparison data',
      reviewedRecords: withAbstract,
      missingInformation: 'Comparator groups or baselines, shared outcome measures, and comparable effect estimates or results.',
      suggestedNextSearch: `${research.question} comparison control group outcomes`,
      suggestedResearchQuestion: `What comparable outcomes are reported for the groups or conditions in ${research.analysis?.mainSubject ?? research.question}?`,
    }));
  }

  const statements = buildEvidenceStatements(research);
  if (records.length && statements.length === 0) {
    gaps.push(gap(records, {
      id: 'claim-support',
      description: 'No candidate statement is directly linked to retrieved text',
      whyItMatters: 'Claims should be supported by traceable passages and assessed in their original context before being treated as evidence.',
      supportingExplanation: 'The Claims and evidence register did not identify a sentence in retrieved abstracts or snippets with clear wording overlap with the question. This matching limit does not show that the sources lack relevant evidence.',
      researchArea: 'Claim support',
      reviewedRecords: records,
      missingInformation: 'Relevant full-text passages, context, and source details that support or qualify claims related to the question.',
      suggestedNextSearch: `${research.question} evidence findings results`,
      suggestedResearchQuestion: `Which original-source passages support, qualify, or challenge claims about ${research.analysis?.mainSubject ?? research.question}?`,
    }));
  }

  return gaps;
}
