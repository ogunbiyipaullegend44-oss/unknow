import { useCallback, useEffect, useState } from 'react';
import './TrendingDiscover.css';

function formatViews(value) {
  if (!Number.isSafeInteger(value)) return '';
  return `${value.toLocaleString()} views`;
}

export default function TrendingDiscover() {
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(0);

  const loadTrends = useCallback(async (signal) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/discover/trending', { signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Trending discovery could not be loaded.');
      setTrends(result);
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setError(requestError instanceof TypeError
          ? 'Could not connect to the research API. If you are running locally, start the API server and try again.'
          : requestError.message);
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadTrends(controller.signal);
    return () => controller.abort();
  }, [loadTrends, refreshing]);

  return (
    <section className="trending-discover" aria-labelledby="trending-heading">
      <div className="trending-header">
        <div>
          <p className="research-eyebrow">Discover</p>
          <h2 id="trending-heading">Trending topics and videos</h2>
          <p>Current Google search trends and YouTube’s most-popular videos. Trend signals and article snippets provide context, not verified explanations.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => setRefreshing((value) => value + 1)} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading && <p className="trending-message" role="status">Loading current trends…</p>}
      {error && <p className="research-error" role="alert">{error}</p>}
      {!loading && !error && trends?.warnings?.map((warning) => (
        <p className="trending-warning" role="status" key={warning}>{warning}</p>
      ))}

      {trends && (
        <>
          <p className="trending-retrieved">
            Retrieved {new Date(trends.retrievedAt).toLocaleString()} · Cached for up to 10 minutes
          </p>

          <section className="trending-section" aria-labelledby="google-trends-heading">
            <div className="trending-section-heading">
              <div>
                <h3 id="google-trends-heading">Google Trends</h3>
                <p>Provider-selected region: {trends.googleTrendsRegion || 'not available'}</p>
              </div>
            </div>
            {trends.googleTrends?.length ? (
              <div className="trending-grid">
                {trends.googleTrends.map((item) => (
                  <article className="trending-card" key={item.id}>
                    {item.image && <img className="trending-image" src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
                    <div className="trending-card-body">
                      <div className="trending-card-meta">
                        <span>Search trend</span>
                        {item.traffic && <span>Approx. searches: {item.traffic}</span>}
                      </div>
                      <h4><a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a></h4>
                      <p>{item.description}</p>
                      {item.imageSource && <small>Image: {item.imageSource}</small>}
                      {item.news?.length > 0 && (
                        <ul className="trending-news-list">
                          {item.news.slice(0, 3).map((story, index) => (
                            <li key={`${item.id}-story-${index}`}>
                              {story.url
                                ? <a href={story.url} target="_blank" rel="noopener noreferrer">{story.title}</a>
                                : <span>{story.title}</span>}
                              {story.source && <small>{story.source}</small>}
                              {story.description && <p>{story.description}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="trending-empty">Google Trends did not return usable topics right now.</p>
            )}
          </section>

          <section className="trending-section" aria-labelledby="youtube-trends-heading">
            <div className="trending-section-heading">
              <div>
                <h3 id="youtube-trends-heading">YouTube popular videos</h3>
                <p>Region-unspecified provider chart. Popularity is not a separate explanation of why a video is trending.</p>
              </div>
            </div>
            {trends.youtubeVideos?.length ? (
              <div className="trending-grid">
                {trends.youtubeVideos.map((video) => (
                  <article className="trending-card" key={video.id}>
                    {video.image && (
                      <a className="trending-video-thumbnail" href={video.url} target="_blank" rel="noopener noreferrer" aria-label={`Watch ${video.title} on YouTube`}>
                        <img className="trending-image" src={video.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
                        <span>Watch video</span>
                      </a>
                    )}
                    <div className="trending-card-body">
                      <div className="trending-card-meta">
                        <span>YouTube most-popular chart</span>
                        {video.viewCount !== null && <span>{formatViews(video.viewCount)}</span>}
                      </div>
                      <h4><a href={video.url} target="_blank" rel="noopener noreferrer">{video.title}</a></h4>
                      {video.channel && <p className="trending-channel">{video.channel}</p>}
                      <p>{video.description || video.whyTrending}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="trending-empty">No YouTube popular videos are available. Configure YOUTUBE_API_KEY in the server environment to enable this section.</p>
            )}
          </section>
        </>
      )}
    </section>
  );
}
