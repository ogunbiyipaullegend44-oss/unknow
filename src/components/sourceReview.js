export const SOURCE_REVIEWS_KEY = 'osint-mapping-tool.source-reviews.v1';
export const SOURCE_REVIEW_NOTES_LIMIT = 3000;

export function parseSourceReviews(serialized) {
  if (!serialized) return {};

  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('Saved source reviews contain invalid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Saved source reviews have an unsupported format.');
  }

  for (const review of Object.values(parsed)) {
    if (
      !review ||
      typeof review !== 'object' ||
      typeof review.reviewed !== 'boolean' ||
      typeof review.notes !== 'string' ||
      review.notes.length > SOURCE_REVIEW_NOTES_LIMIT ||
      typeof review.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(review.updatedAt))
    ) {
      throw new Error('Saved source reviews have an unsupported format.');
    }
  }

  return parsed;
}

export function updateSourceReview(reviews, sourceId, changes, updatedAt = new Date().toISOString()) {
  if (typeof sourceId !== 'string' || !sourceId) {
    throw new Error('A source identifier is required to save a review.');
  }
  if (
    (changes.reviewed !== undefined && typeof changes.reviewed !== 'boolean') ||
    (changes.notes !== undefined &&
      (typeof changes.notes !== 'string' || changes.notes.length > SOURCE_REVIEW_NOTES_LIMIT))
  ) {
    throw new Error('Source review details are invalid.');
  }

  const current = reviews[sourceId] ?? { reviewed: false, notes: '', updatedAt };
  return {
    ...reviews,
    [sourceId]: {
      ...current,
      ...changes,
      updatedAt,
    },
  };
}
