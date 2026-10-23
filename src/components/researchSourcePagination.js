export function hasMoreResearchSources(sourceCursors) {
  return Boolean(
    sourceCursors &&
    Object.values(sourceCursors).some((cursor) => cursor !== null && cursor !== undefined),
  );
}

function sourceKey(source) {
  if (source.doi) return `doi:${source.doi.toLocaleLowerCase()}`;
  const title = source.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return title ? `title:${title}` : `id:${source.id}`;
}

export function mergeResearchSources(existing, incoming) {
  const sources = new Map(existing.map((source) => [sourceKey(source), source]));
  for (const source of incoming) {
    const key = sourceKey(source);
    if (!sources.has(key)) sources.set(key, source);
  }
  return [...sources.values()];
}
