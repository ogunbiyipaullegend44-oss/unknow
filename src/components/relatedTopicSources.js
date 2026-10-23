import { SOURCE_CATEGORIES, categoryFor } from './sourceCategories.js';

export function normalizeRelatedSources(result) {
  return [
    ...(result.sources ?? []).map((source) => ({
      ...source,
      id: `academic:${source.id}`,
      kind: 'academic',
      author: source.authors?.join(', ') || '',
      publisher: source.journal || source.publisher || '',
      type: source.documentType || 'Scholarly record',
      date: source.publicationYear
        ? `${source.publicationYear}${source.publicationMonth ? `-${String(source.publicationMonth).padStart(2, '0')}` : ''}`
        : '',
      description: source.abstract || '',
      provider: source.metadataSource || source.provider || 'Academic catalog',
    })),
    ...(result.webSources ?? []).map((source) => ({
      ...source,
      id: `web:${source.id}`,
      kind: 'web',
      author: source.author || '',
      publisher: source.publisher || '',
      type: 'Web source',
      date: source.date || '',
      description: source.description || '',
      provider: source.provider || 'Web search',
    })),
  ]
    .filter((source) => source.title && source.url)
    .map((source) => ({ ...source, category: categoryFor(source) }));
}

export function relatedSourceLimit(value) {
  if (value === 'all' || value === undefined || value === null) return 'all';
  const numericValue = Number(value);
  return [20, 50, 100].includes(numericValue) ? numericValue : 'all';
}

export function groupRelatedSources(sources, sourceLimit = 'all') {
  const grouped = new Map();
  for (const source of sources) {
    if (!grouped.has(source.category)) grouped.set(source.category, []);
    grouped.get(source.category).push(source);
  }

  const limit = relatedSourceLimit(sourceLimit);
  const groups = SOURCE_CATEGORIES
    .filter((category) => grouped.has(category))
    .map((category) => [
      category,
      limit === 'all' ? grouped.get(category) : grouped.get(category).slice(0, limit),
    ]);

  return groups;
}
