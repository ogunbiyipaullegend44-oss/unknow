import { useEffect, useState } from 'react';
import { sourceDateLabel } from './sourceCategories.js';
import { groupRelatedSources, normalizeRelatedSources, relatedSourceLimit } from './relatedTopicSources.js';
import './RelatedTopics.css';

const topicRequestCache = new Map();
const sourceRequestCache = new Map();
const MAX_CACHED_REQUESTS = 40;

async function readResponse(response, fallbackMessage) {
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('The server returned an unreadable response. Please try again.');
  }
  if (!response.ok) throw new Error(result.error || fallbackMessage);
  return result;
}

async function findSourcesForTopic(research, topic) {
  const scope = research.scope ?? {};
  const response = await fetch('/api/research', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      question: topic.question,
      purposes: research.analysis?.purposes?.length ? research.analysis.purposes : ['general'],
      region: scope.region ?? '',
      sourceLimit: relatedSourceLimit(scope.sourceLimit),
      year: scope.year ?? null,
      month: scope.month ?? '',
      fromYear: scope.fromYear ?? null,
      toYear: scope.toYear ?? null,
    }),
  });
  const result = await readResponse(response, 'Source search could not be completed.');
  return {
    sources: normalizeRelatedSources(result),
    videoWarnings: result.videoWarnings ?? [],
  };
}

function rememberRequest(cache, key, createRequest) {
  if (cache.has(key)) return cache.get(key);
  if (cache.size >= MAX_CACHED_REQUESTS) {
    cache.delete(cache.keys().next().value);
  }
  const request = createRequest().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, request);
  return request;
}

function researchCacheKey(research) {
  return JSON.stringify({
    id: research.id ?? research.question,
    retrievedAt: research.retrievedAt ?? '',
    scope: research.scope ?? {},
  });
}

function loadRelatedTopics(research, force = false) {
  const key = researchCacheKey(research);
  if (force) topicRequestCache.delete(key);
  return rememberRequest(topicRequestCache, key, async () => {
    const response = await fetch('/api/research/related-topics', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question: research.question,
        region: research.scope?.region ?? '',
        areas: (research.analysis?.researchAreas ?? []).slice(0, 8).map(({ title, description }) => ({
          title,
          description: description ?? '',
        })),
      }),
    });
    const result = await readResponse(response, 'AI related topics could not be generated.');
    if (!Array.isArray(result.topics) || result.topics.length === 0) {
      throw new Error('The AI service did not return any related topics. Please try again.');
    }
    return result.topics;
  });
}

function loadTopicSources(research, topic, force = false) {
  const key = `${researchCacheKey(research)}:${topic.question}`;
  if (force) sourceRequestCache.delete(key);
  return rememberRequest(sourceRequestCache, key, () => findSourcesForTopic(research, topic));
}

function SourceResult({ source }) {
  return (
    <article className="source-card discovery-card">
      <div className="source-card-topline">
        <span className="source-type">{source.category}</span>
        <span>{sourceDateLabel(source.date)}</span>
      </div>
      <h3><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></h3>
      <p className="source-publisher">
        {[source.author, source.publisher, source.provider].filter(Boolean).join(' · ') || 'Source details not available'}
      </p>
      {source.description && (
        <details className="source-abstract">
          <summary>Abstract</summary>
          <p>{source.description}</p>
        </details>
      )}
      <div className="source-card-footer">
        <a href={source.url} target="_blank" rel="noopener noreferrer">Open original source</a>
      </div>
    </article>
  );
}

export default function RelatedTopics({ research }) {
  const [generation, setGeneration] = useState({ loading: true, topics: [], error: '' });
  const [searches, setSearches] = useState({});
  const [retryGeneration, setRetryGeneration] = useState(0);
  const selectedSourceLimit = relatedSourceLimit(research.scope?.sourceLimit);

  useEffect(() => {
    let active = true;
    setGeneration({ loading: true, topics: [], error: '' });
    setSearches({});

    if (!research?.question) {
      setGeneration({ loading: false, topics: [], error: 'Research question is unavailable.' });
      return () => { active = false; };
    }

    loadRelatedTopics(research, retryGeneration > 0).then((topics) => {
      if (!active) return;
      setGeneration({ loading: false, topics, error: '' });
      setSearches(Object.fromEntries(topics.map((topic) => [
        topic.title,
        { loading: true, sources: [], videoWarnings: [], error: '' },
      ])));
      return Promise.all(topics.map(async (topic) => {
        try {
          const result = await loadTopicSources(research, topic, retryGeneration > 0);
          if (!active) return;
          setSearches((current) => ({
            ...current,
            [topic.title]: { loading: false, ...result, error: '' },
          }));
        } catch (error) {
          if (!active) return;
          setSearches((current) => ({
            ...current,
            [topic.title]: { loading: false, sources: [], videoWarnings: [], error: error.message },
          }));
        }
      }));
    }).catch((error) => {
      if (active) setGeneration({ loading: false, topics: [], error: error.message });
    });

    return () => { active = false; };
  }, [research, retryGeneration]);

  const retrySources = async (topic) => {
    setSearches((current) => ({
      ...current,
      [topic.title]: { loading: true, sources: current[topic.title]?.sources ?? [], error: '' },
    }));
    try {
      const result = await loadTopicSources(research, topic, true);
      setSearches((current) => ({
        ...current,
        [topic.title]: { loading: false, ...result, error: '' },
      }));
    } catch (error) {
      setSearches((current) => ({
        ...current,
        [topic.title]: { loading: false, sources: [], videoWarnings: [], error: error.message },
      }));
    }
  };

  return (
    <section className="related-topics" aria-labelledby="related-topics-heading">
      <div className="related-topics-heading">
        <h3 id="related-topics-heading">Related Topic</h3>
        <p>
          AI-generated research directions and independently retrieved sources, grouped by topic.
          {' '}{selectedSourceLimit === 'all'
            ? 'Showing all sources returned by available providers.'
            : `Showing up to ${selectedSourceLimit} sources in each category.`}
        </p>
      </div>

      {generation.loading && <p className="related-topics-status" role="status">Generating related topics…</p>}
      {generation.error && (
        <div className="related-topics-error" role="alert">
          <p>{generation.error}</p>
          <button className="btn btn-secondary" type="button" onClick={() => setRetryGeneration((value) => value + 1)}>
            Try again
          </button>
        </div>
      )}

      <div className="related-topic-list">
        {generation.topics.map((topic) => {
          const search = searches[topic.title];
          const groups = groupRelatedSources(search?.sources ?? [], selectedSourceLimit);
          return (
            <section className="related-topic-group" key={topic.title} aria-labelledby={`related-topic-${topic.title.replaceAll(/[^a-z0-9]+/gi, '-')}`}>
              <div className="related-topic-group-heading">
                <h4 id={`related-topic-${topic.title.replaceAll(/[^a-z0-9]+/gi, '-')}`}>{topic.title}</h4>
                <p>{topic.question}</p>
              </div>

              {search?.loading && <p className="related-topics-status" role="status">Finding sources for this topic…</p>}
              {search?.error && (
                <div className="related-topics-error" role="alert">
                  <p>{search.error}</p>
                  <button className="btn btn-secondary" type="button" onClick={() => retrySources(topic)}>Retry source search</button>
                </div>
              )}
              {search?.videoWarnings?.length > 0 && (
                <p className="related-topic-video-warning" role="status">
                  Video search notice: {search.videoWarnings.join(' ')}
                </p>
              )}
              {search && !search.loading && !search.error && (
                groups.length ? (
                  <div className="related-topic-categories">
                    {groups.map(([category, sources]) => (
                      <section className="related-topic-category" key={category} aria-label={`${category} for ${topic.title}`}>
                        <div className="discovery-category-heading">
                          <h5>{category}</h5>
                          <span>{sources.length}</span>
                        </div>
                        <div className="source-list">
                          {sources.length ? sources.map((source) => <SourceResult key={source.id} source={source} />) : (
                            <p className="related-topics-empty">No video sources were returned for this topic.</p>
                          )}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <p className="related-topics-empty">No sources were returned for this topic.</p>
                )
              )}
            </section>
          );
        })}
      </div>
      {generation.topics.length > 0 && (
        <p className="related-topics-note">
          Topic angles are AI-generated research directions, not findings. Retrieved source records are presented as returned and have not been independently verified.
        </p>
      )}
    </section>
  );
}
