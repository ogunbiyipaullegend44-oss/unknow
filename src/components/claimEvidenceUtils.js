const STOP_WORDS = new Set([
  'about', 'after', 'also', 'among', 'because', 'been', 'being', 'between',
  'from', 'have', 'into', 'more', 'most', 'other', 'over', 'research',
  'such', 'than', 'that', 'their', 'there', 'these', 'they', 'this',
  'through', 'using', 'were', 'what', 'when', 'where', 'which', 'with',
  'effect', 'effects', 'impact', 'study',
]);

function sentencesFrom(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)
    ?.map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 45) ?? [];
}

function queryTerms(question) {
  return new Set(
    (String(question ?? '').toLocaleLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [])
      .filter((term) => term.length > 3 && !STOP_WORDS.has(term)),
  );
}

function relevance(sentence, terms) {
  const text = sentence.toLocaleLowerCase();
  return [...terms].filter((term) => text.includes(term)).length;
}

function publicationDate(source) {
  if (!source.publicationYear) return 'Not available';
  if (source.publicationMonth) {
    return `${String(source.publicationYear)}-${String(source.publicationMonth).padStart(2, '0')}`;
  }
  return String(source.publicationYear);
}

function sourceRecords(research) {
  return [
    ...(research.sources ?? []).map((source) => ({
      ...source,
      evidenceText: source.abstract || '',
      evidenceLocation: 'Retrieved abstract',
      provider: source.metadataSource || 'Academic catalog',
      publicationDate: publicationDate(source),
      contextLimitation: 'This catalog abstract was retrieved; the full work was not reviewed.',
    })),
    ...(research.webSources ?? []).map((source) => ({
      ...source,
      evidenceText: source.description || '',
      evidenceLocation: 'Search-result snippet',
      provider: source.provider || 'Web search',
      publicationDate: source.publishedAt || 'Not available',
      contextLimitation: 'This is a search-result snippet; the original page was not fetched or reviewed.',
    })),
    ...(research.videos ?? []).map((source) => ({
      ...source,
      evidenceText: source.description || '',
      evidenceLocation: 'Video description',
      provider: source.platform || 'Video platform',
      publicationDate: source.publishedAt || 'Not available',
      contextLimitation: 'Only public video metadata and description were retrieved; the video was not reviewed.',
    })),
  ];
}

export function buildEvidenceStatements(research) {
  const terms = queryTerms(research.question);
  const statements = [];
  const statementByKey = new Map();

  for (const source of sourceRecords(research)) {
    if (!source.title || !source.url || !source.evidenceText) continue;
    const candidates = sentencesFrom(source.evidenceText)
      .map((text, index) => ({ text, index, relevance: relevance(text, terms) }))
      .filter((candidate) => candidate.relevance >= Math.min(2, terms.size))
      .sort((left, right) => right.relevance - left.relevance || left.index - right.index)
      .slice(0, 1);

    for (const candidate of candidates) {
      const key = candidate.text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      const existing = statementByKey.get(key);
      const evidence = {
        sourceId: source.id,
        title: source.title,
        url: source.url,
        author: source.authors?.filter(Boolean).join(', ') || source.author || '',
        publisher: source.journal || source.publisher || source.platform || '',
        provider: source.provider,
        publicationDate: source.publicationDate,
        location: source.evidenceLocation,
        passage: candidate.text,
        context: source.evidenceText,
        limitation: source.contextLimitation,
      };

      if (existing) {
        if (!existing.evidence.some((entry) => entry.sourceId === evidence.sourceId)) {
          existing.evidence.push(evidence);
        }
      } else {
        const statement = {
          key,
          text: candidate.text,
          evidence: [evidence],
          type: 'Directly supported by retrieved passage',
        };
        statements.push(statement);
        statementByKey.set(key, statement);
      }
    }
  }

  return statements;
}
