const SEARCH_STOP_WORDS = new Set([
  'a', 'about', 'after', 'all', 'also', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'between', 'both', 'but', 'by',
  'can', 'correlate', 'correlated', 'could', 'did', 'do', 'does', 'during',
  'each', 'effect', 'effects', 'affect', 'affected', 'affects', 'explain',
  'find', 'for', 'from', 'give', 'had', 'has', 'have', 'help', 'how',
  'identify', 'if', 'impact', 'impacts', 'in', 'into', 'is', 'it', 'its', 'me',
  'more', 'most', 'my', 'need', 'of', 'on', 'or', 'other', 'our', 'out', 'over',
  'please', 'provide', 'related', 'research', 'same', 'should', 'show', 'some',
  'source', 'sources', 'such', 'than', 'that', 'the', 'their', 'them', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'to', 'topic', 'topics',
  'under', 'use', 'using', 'very', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'while', 'who', 'why', 'will', 'with', 'within', 'without', 'would',
  'you', 'your',
]);

function tokenize(value) {
  return String(value ?? '').toLocaleLowerCase()
    .match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
}

export function researchTopicTerms(value, limit = 10) {
  const frequencies = new Map();
  tokenize(value).forEach((term, index) => {
    if (term.length < 3 || SEARCH_STOP_WORDS.has(term)) return;
    const existing = frequencies.get(term);
    frequencies.set(term, existing
      ? { count: existing.count + 1, firstIndex: existing.firstIndex }
      : { count: 1, firstIndex: index });
  });

  return [...frequencies]
    .sort(([, left], [, right]) => right.count - left.count || left.firstIndex - right.firstIndex)
    .slice(0, limit)
    .sort(([, left], [, right]) => left.firstIndex - right.firstIndex)
    .map(([term]) => term);
}

export function compactResearchTopicQuery(question, region = '', limit = 10) {
  const terms = researchTopicTerms(question, limit);
  const regionText = String(region ?? '').trim().replace(/\s+/g, ' ');
  const regionTerms = tokenize(regionText);
  const includedTerms = new Set(terms);
  const missingRegionTerms = regionTerms.filter((term) => !includedTerms.has(term));

  return [
    ...terms,
    ...(missingRegionTerms.length ? [regionText] : []),
  ].join(' ').trim();
}

export function buildResearchSearchQuery(question, region = '', limit = 10) {
  const questionText = String(question ?? '').trim().replace(/\s+/g, ' ');
  const regionText = String(region ?? '').trim().replace(/\s+/g, ' ');
  const allTerms = researchTopicTerms(questionText, Number.POSITIVE_INFINITY);
  const compact = questionText.length > 160 || allTerms.length > limit;
  if (compact) return compactResearchTopicQuery(questionText, regionText, limit);

  const questionWords = new Set(tokenize(questionText));
  const regionWords = tokenize(regionText);
  const missingRegionTerms = regionWords.some((term) => !questionWords.has(term));

  return [
    questionText,
    ...(missingRegionTerms ? [regionText] : []),
  ].join(' ').trim();
}
