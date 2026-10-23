import { useEffect, useMemo, useState } from 'react';
import { buildEvidenceStatements } from './claimEvidenceUtils.js';
import './ClaimEvidence.css';

const PAGE_SIZE = 20;

export default function ClaimEvidence({ research }) {
  const statements = useMemo(() => buildEvidenceStatements(research), [research]);
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(statements.length / PAGE_SIZE);
  const visibleStatements = statements.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const sourcesWithText = [
    ...(research.sources ?? []),
    ...(research.webSources ?? []),
  ].filter((source) => source.abstract || source.description).length;

  useEffect(() => setPage(0), [research]);

  return (
    <div className="claim-evidence-workspace">
      <header className="claim-evidence-heading">
        <div>
          <h3>Claims and evidence register</h3>
          <p>
            A claim is a candidate statement: an exact sentence from retrieved source text that overlaps with the research
            question. Evidence is the linked source passage and its context and provenance, shown so you can assess that
            statement. Neither the statement nor its match is independently verified.
          </p>
        </div>
        <strong>{statements.length} evidence-linked statement{statements.length === 1 ? '' : 's'}</strong>
      </header>

      <section className="claim-evidence-method" aria-label="Claim classification guide">
        <h4>How to interpret this register</h4>
        <ul>
          <li><strong>Claim:</strong> the displayed candidate assertion, quoted exactly from retrieved text.</li>
          <li><strong>Evidence:</strong> the source record, matching passage, surrounding context, and source details.</li>
          <li><strong>Interpretation:</strong> not generated; assess what the passage supports, qualifies, or leaves uncertain.</li>
          <li><strong>Verification:</strong> this register does not fact-check sources or automatically compare conflicting evidence.</li>
        </ul>
        <p>A source snippet or abstract may omit qualifications; a textual match does not establish that a claim is true.</p>
      </section>

      {statements.length === 0 ? (
        <section className="claim-evidence-empty">
          <h4>No traceable evidence statements found</h4>
          <p>
            {sourcesWithText
              ? 'Retrieved descriptions and abstracts did not contain sentences with clear wording overlap with this research question. This is not evidence that no relevant sources exist.'
              : 'The retrieved source records do not include abstracts or descriptions. Open Sources to review their original context.'}
          </p>
        </section>
      ) : (
        <div className="claim-evidence-list">
          {visibleStatements.map((statement, index) => (
            <article className="claim-evidence-card" key={statement.key}>
              <div className="claim-evidence-card-heading">
                <span>Claim {page * PAGE_SIZE + index + 1} · candidate statement</span>
                <span>{statement.type}</span>
              </div>
              <section className="claim-evidence-claim" aria-label="Candidate claim">
                <h4>Claim</h4>
                <blockquote>{statement.text}</blockquote>
                <p className="claim-evidence-caveat">
                  This is a candidate assertion quoted from retrieved text, not an independently verified fact.
                </p>
              </section>
              <section className="claim-evidence-support" aria-label="Supporting evidence and source context">
                <h4>Evidence and source context</h4>
                <p className="claim-evidence-caveat">
                  The matching passage and its source details are provided for review; textual support alone does not establish truth.
                </p>
                {statement.evidence.map((evidence) => (
                  <details className="claim-evidence-source" key={evidence.sourceId}>
                    <summary>
                      <span>{evidence.title}</span>
                      <small>{evidence.publicationDate} · {evidence.location}</small>
                    </summary>
                    <dl>
                      <div><dt>Author or organization</dt><dd>{evidence.author || evidence.publisher || 'Not available'}</dd></div>
                      <div><dt>Publisher</dt><dd>{evidence.publisher || 'Not available'}</dd></div>
                      <div><dt>Publication date</dt><dd>{evidence.publicationDate}</dd></div>
                      <div><dt>Retrieved from</dt><dd>{evidence.provider}</dd></div>
                      <div><dt>Evidence location</dt><dd>{evidence.location}</dd></div>
                      <div><dt>Matching passage</dt><dd>{evidence.passage}</dd></div>
                      <div><dt>Evidence context</dt><dd>{evidence.context}</dd></div>
                      <div><dt>Conflicting evidence</dt><dd>Not assessed automatically.</dd></div>
                      <div><dt>Limitation</dt><dd>{evidence.limitation}</dd></div>
                      <div className="claim-evidence-original">
                        <dt>Original source</dt>
                        <dd><a href={evidence.url} target="_blank" rel="noopener noreferrer">Open original source</a></dd>
                      </div>
                    </dl>
                  </details>
                ))}
              </section>
            </article>
          ))}
          {pageCount > 1 && (
            <nav className="claim-evidence-pagination" aria-label="Evidence statement pages">
              <button type="button" className="btn btn-secondary" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
                Previous
              </button>
              <span>Page {page + 1} of {pageCount}</span>
              <button type="button" className="btn btn-secondary" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>
                Next
              </button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
