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
    ...(research.videos ?? []),
  ].filter((source) => source.abstract || source.description).length;

  useEffect(() => setPage(0), [research]);

  return (
    <div className="claim-evidence-workspace">
      <header className="claim-evidence-heading">
        <div>
          <h3>Claims and evidence</h3>
          <p>
            Candidate statements are exact sentences selected by wording overlap with the research question. They are
            not platform-verified facts, and no AI-generated claims are presented as findings.
          </p>
        </div>
        <strong>{statements.length} evidence-linked statement{statements.length === 1 ? '' : 's'}</strong>
      </header>

      <section className="claim-evidence-method" aria-label="Claim classification guide">
        <h4>How to interpret this register</h4>
        <ul>
          <li><strong>Direct textual support:</strong> the displayed statement is an exact sentence from the linked retrieved passage.</li>
          <li><strong>Reasonable interpretations:</strong> not generated; users must assess these against source context.</li>
          <li><strong>AI synthesis:</strong> none is generated in this workflow.</li>
          <li><strong>Uncertain or unsupported:</strong> not presented as established findings.</li>
        </ul>
        <p>Conflicting evidence is not automatically assessed. A source snippet or abstract may omit qualifications and does not establish that its statement is true.</p>
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
                <span>Candidate statement {page * PAGE_SIZE + index + 1}</span>
                <span>{statement.type}</span>
              </div>
              <blockquote>{statement.text}</blockquote>
              <p className="claim-evidence-caveat">
                Direct support means the source passage contains this wording; it does not independently verify the claim.
              </p>
              <h4>Supporting source{statement.evidence.length === 1 ? '' : 's'}</h4>
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
                    <div><dt>Support</dt><dd>Direct textual match; exact sentence shown above.</dd></div>
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
