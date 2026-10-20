export const HISTORY_SOURCE_LIMIT = 50;
export const HISTORY_WEB_LIMIT = 20;
export const HISTORY_VIDEO_LIMIT = 20;
const ABSTRACT_LENGTH_LIMIT = 1500;
const DESCRIPTION_LENGTH_LIMIT = 1000;
const VIDEO_DESCRIPTION_LENGTH_LIMIT = 500;

export function addResearchHistoryEntry(history, entry, { replaceMatchingQuestion = false } = {}) {
  return [
    entry,
    ...history.filter((record) =>
      record.id !== entry.id &&
      (!replaceMatchingQuestion || record.question !== entry.question),
    ),
  ];
}

function truncateText(value, maxLength) {
  return typeof value === 'string' && value.length > maxLength
    ? `${value.slice(0, maxLength)}…`
    : value;
}

export function compactResearchForHistory(result, id) {
  const sources = result.sources ?? [];
  const webSources = result.webSources ?? [];
  const videos = result.videos ?? [];
  const historyResultCounts = result.historyResultCounts ?? {
    sources: sources.length,
    webSources: webSources.length,
    videos: videos.length,
  };
  const historyResultsTruncated = Boolean(result.historyResultsTruncated) ||
    historyResultCounts.sources > HISTORY_SOURCE_LIMIT ||
    historyResultCounts.webSources > HISTORY_WEB_LIMIT ||
    historyResultCounts.videos > HISTORY_VIDEO_LIMIT;

  return {
    ...result,
    id,
    historyResultsTruncated,
    historyResultCounts,
    sourceCursors: historyResultsTruncated ? null : result.sourceCursors,
    sources: sources.slice(0, HISTORY_SOURCE_LIMIT).map((source) => ({
      ...source,
      abstract: truncateText(source.abstract, ABSTRACT_LENGTH_LIMIT),
    })),
    webSources: webSources.slice(0, HISTORY_WEB_LIMIT).map((source) => ({
      ...source,
      description: truncateText(source.description, DESCRIPTION_LENGTH_LIMIT),
    })),
    videos: videos.slice(0, HISTORY_VIDEO_LIMIT).map((video) => ({
      ...video,
      description: truncateText(video.description, VIDEO_DESCRIPTION_LENGTH_LIMIT),
    })),
  };
}
