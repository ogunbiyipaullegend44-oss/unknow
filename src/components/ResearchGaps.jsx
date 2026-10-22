import { useMemo } from 'react';
import { buildResearchGaps } from './researchGapUtils.js';
import './ResearchGaps.css';

export default function ResearchGaps({ research, onUseSearch, onOpenArea }) {
  const gaps = useMemo(() => buildResearchGaps(research), [research]);
  const researchAreas = research.analysis?.researchAreas ?? [];

  return (
    <section className="research-gaps" aria-labelledby="research-gaps-heading">
      <header className="research-gaps-heading">
        <div>
          <p className="research-eyebrow">Collection-scoped review</p>
          <h3 id="research-gaps-heading">Explore</h3>
          <p>
            These are prompts based on retrieved records, metadata, and snippets—not confirmed gaps in the wider field.
            Open a related area to review its matching sources. Search matching is approximate,
            and original sources were not fully reviewed.
          </p>
        </div>
        <strong>{gaps.length} potential gap{gaps.length === 1 ? '' : 's'}</strong>
      </header>

      {gaps.length ? (
        <div className="research-gap-list">
          {gaps.map((item) => (
            <article className="research-gap-card" key={item.id}>
              <div className="research-gap-card-heading">
                <span className="research-gap-label">Potential gap in current collection</span>
                <h4>{item.description}</h4>
              </div>
              <dl className="research-gap-details">
                <div>
                  <dt>Why it matters</dt>
                  <dd>{item.whyItMatters}</dd>
                </div>
                <div>
                  <dt>Supporting explanation</dt>
                  <dd>{item.supportingExplanation}</dd>
                </div>
                <div>
                  <dt>Relevant research area</dt>
                  <dd>
                    {researchAreas.some((area) => area.title === item.researchArea) ? (
                      <button
                        className="research-gap-area-link"
                        type="button"
                        onClick={() => onOpenArea(item.researchArea)}
                      >
                        {item.researchArea}
                      </button>
                    ) : item.researchArea}
                  </dd>
                </div>
                <div>
                  <dt>What information is missing</dt>
                  <dd>{item.missingInformation}</dd>
                </div>
                <div>
                  <dt>Suggested research question</dt>
                  <dd>{item.suggestedResearchQuestion}</dd>
                </div>
              </dl>

              <section className="research-gap-reviewed" aria-label="Sources reviewed">
                <h5>Sources reviewed ({item.sourcesReviewed.length})</h5>
                {item.sourcesReviewed.length ? (
                  <ul>
                    {item.sourcesReviewed.map((source) => (
                      <li key={source.id}>
                        <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
                        <span>{source.kind} · {source.provider} · {source.date}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No source records were available in this collection.</p>
                )}
              </section>

              <div className="research-gap-next-search">
                <div>
                  <strong>Suggested next search</strong>
                  <p>{item.suggestedNextSearch}</p>
                </div>
                <button className="btn btn-secondary" type="button" onClick={() => onUseSearch(item.suggestedNextSearch)}>
                  Use this search
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="research-gaps-empty">
          No potential gaps were flagged by these checks. This does not establish that the collection is complete.
        </p>
      )}
    </section>
  );
}
