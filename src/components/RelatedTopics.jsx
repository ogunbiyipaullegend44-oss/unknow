import { useState } from 'react';
import { getRelatedTopics } from './relatedTopics.js';
import './RelatedTopics.css';

function sourcesFromResult(result) {
  return [
    ...(result.sources ?? []).map((source) => ({
      id: `academic:${source.id}`,
      kind: 'Academic source',
      title: source.title,
      url: source.url,
      description: source.abstract || '',
      provider: source.metadataSource || source.provider || 'Academic catalog',
      authors: source.authors ?? [],
      publicationYear: source.publicationYear,
      journal: source.journal || source.publisher,
      citationCount: source.citationCount,
    })),
    ...(result.webSources ?? []).map((source) => ({
      id: `web:${source.id}`,
      kind: 'Web source',
      title: source.title,
      url: source.url,
      description: source.description || '',
      provider: source.provider || 'Web search',
    })),
    ...(result.videos ?? []).map((video) => ({
      id: `video:${video.id}`,
      kind: 'Video',
      title: video.title,
      url: video.url,
      description: video.description || '',
      provider: video.platform || 'Video platform',
    })),
  ].filter((source) => source.title && source.url);
}

export default function RelatedTopics({ research }) {
  const topics = getRelatedTopics(research);
  const [searches, setSearches] = useState({});

  const findSources = async (topic) => {
    setSearches((current) => ({
      ...current,
      [topic.id]: { loading: true, sources: [], error: '' },
    }));
    try {
      const scope = research.scope ?? {};
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          question: topic.question,
          purposes: research.analysis?.purposes?.length ? research.analysis.purposes : ['general'],
          region: scope.region ?? '',
          sourceLimit: 100,
          year: scope.year ?? null,
          month: scope.month ?? '',
          fromYear: scope.fromYear ?? null,
          toYear: scope.toYear ?? null,
        }),
      });
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error('The source search returned an unreadable response.');
      }
      if (!response.ok) {
        throw new Error(result.error || `The source search failed (${response.status}).`);
      }
      setSearches((current) => ({
        ...current,
        [topic.id]: {
          loading: false,
          sources: sourcesFromResult(result),
          error: '',
        },
      }));
    } catch (error) {
      setSearches((current) => ({
        ...current,
        [topic.id]: { loading: false, sources: [], error: error.message },
      }));
    }
  };

  return (
    <section className="related-topics" aria-labelledby="related-topics-heading">
      <div className="related-topics-heading">
        <div>
          <h3 id="related-topics-heading">Related topics and sources</h3>
          <p>Each angle searches for additional sources independently. Results are grouped by the related topic they address.</p>
        </div>
      </div>

      <div className="related-topic-list">
        {topics.map((topic) => {
          const search = searches[topic.id];
          return (
            <article className="related-topic-card" key={topic.id}>
              <h4>{topic.title}</h4>
              <div className="related-topic-question">
                <span>Suggested research question</span>
                <strong>{topic.question}</strong>
              </div>
              <dl className="related-topic-details">
                <div>
                  <dt>Why it matters</dt>
                  <dd>{topic.why}</dd>
                </div>
                <div>
                  <dt>Connection to your research</dt>
                  <dd>{topic.relationship}</dd>
                </div>
                <div>
                  <dt>Evidence to look for</dt>
                  <dd>{topic.evidence}</dd>
                </div>
              </dl>
              <button
                className="btn btn-secondary related-topic-search"
                type="button"
                onClick={() => findSources(topic)}
                disabled={search?.loading}
              >
                {search?.loading ? 'Searching sources…' : search ? 'Search this angle again' : 'Find related sources'}
              </button>
              {search?.error && <p className="related-topic-error" role="alert">{search.error}</p>}
              {search && !search.loading && !search.error && (
                <div className="related-topic-results" aria-live="polite">
                  <h5>{search.sources.length} related source{search.sources.length === 1 ? '' : 's'}</h5>
                  {search.sources.length ? (
                    <ul>
                      {search.sources.map((source) => (
                        <li key={source.id}>
                          <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
                          <span>
                            {[
                              source.kind,
                              source.provider,
                              source.authors?.length
                                ? `${source.authors.slice(0, 3).join(', ')}${source.authors.length > 3 ? ' et al.' : ''}`
                                : '',
                              source.journal,
                              source.publicationYear,
                              Number.isInteger(source.citationCount)
                                ? `${source.citationCount.toLocaleString()} citations`
                                : '',
                            ].filter(Boolean).join(' · ')}
                          </span>
                          {source.description && <p>{source.description}</p>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No sources were returned for this angle. Try searching again later.</p>
                  )}
                </div>
              )}
              <div className="related-topic-categories">
                <span>Suggested source areas</span>
                <p>{topic.categories.join(' · ')}</p>
              </div>
            </article>
          );
        })}
      </div>
      <p className="related-topics-note">
        These are research directions, not findings. Each search retrieves sources from available providers and does not establish that a source supports the topic.
      </p>
    </section>
  );
}
