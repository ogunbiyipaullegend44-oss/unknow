export const COMMUNITY_CATEGORIES = [
  'Environment',
  'Politics and policy',
  'Public health',
  'Economics',
  'Technology',
  'Conflict and security',
  'Human rights',
  'Science',
  'Other',
];

export function summarizeRatings(publication) {
  if (Number.isFinite(Number(publication.rating_count)) && Number.isFinite(Number(publication.average_rating))) {
    const count = Number(publication.rating_count);
    const average = Number(publication.average_rating);
    return {
      count,
      average,
      recommendationScore: (average * count + 3 * 5) / (count + 5),
    };
  }
  const ratings = publication.community_ratings ?? [];
  const count = ratings.length;
  const average = count
    ? ratings.reduce((total, item) => total + item.rating, 0) / count
    : 0;
  return {
    count,
    average,
    // A prior of five neutral ratings dampens rankings when community feedback is sparse.
    recommendationScore: (average * count + 3 * 5) / (count + 5),
  };
}

export function rankPublications(publications, query = '') {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const now = Date.now();
  return [...publications].sort((left, right) => {
    const leftRatings = summarizeRatings(left);
    const rightRatings = summarizeRatings(right);
    const leftDate = Date.parse(left.published_on || left.created_at) || 0;
    const rightDate = Date.parse(right.published_on || right.created_at) || 0;
    const daysOld = (timestamp) => Math.max(0, (now - timestamp) / 86400000);
    const searchBonus = (item) => normalizedQuery && `${item.title} ${item.description} ${item.keywords?.join(' ')}`.toLocaleLowerCase().includes(normalizedQuery) ? 3 : 0;
    const score = (item, ratings, timestamp) =>
      ratings.recommendationScore + Math.log1p(item.view_count || 0) * 0.15 +
      Math.min(item.source_references?.length ?? 0, 10) * 0.04 +
      1 / (1 + daysOld(timestamp) / 30) + searchBonus(item);
    return score(right, rightRatings, rightDate) - score(left, leftRatings, leftDate);
  });
}

export function buildPublicationContent(file) {
  const sections = (file.sections ?? []).map((section) => {
    const findings = (file.findings ?? []).filter((finding) => finding.sectionId === section.id);
    return [
      section.title,
      section.notes,
      ...findings.map((finding) => `- ${finding.text}`),
    ].filter(Boolean).join('\n\n');
  });
  return [
    `# ${file.title}`,
    file.topic ? `Research question: ${file.topic}` : '',
    ...sections,
    '## Sources',
    ...(file.sources ?? []).map((source, index) => `${index + 1}. ${source.title} — ${source.url}`),
  ].filter(Boolean).join('\n\n');
}

export function parseSourceReferences(value) {
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length > 100) throw new Error('A publication can include at most 100 source references.');
  return lines.map((line) => {
    const separator = line.indexOf('|');
    if (separator < 1) throw new Error('Each source reference must use: title | https://source-url');
    const title = line.slice(0, separator).trim();
    const url = line.slice(separator + 1).trim();
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Source reference "${title}" needs a valid HTTP or HTTPS URL.`);
    }
    if (!title || !['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Source reference "${title || line}" needs a title and a valid HTTP or HTTPS URL.`);
    }
    return { title, url: parsed.href };
  });
}

export function validatePublicationDraft(draft) {
  if (!draft.title.trim()) throw new Error('Enter a research title.');
  if (!draft.description.trim()) throw new Error('Enter a short description.');
  if (!draft.category) throw new Error('Choose a research category.');
  if (!draft.permissionConfirmed) throw new Error('Confirm that you have permission to share this document.');
  if (!draft.documentContent.trim()) throw new Error('Save the research file before publishing it.');
  if (draft.documentContent.length > 100000) throw new Error('This research document is too large to publish (100,000 characters maximum).');
}
