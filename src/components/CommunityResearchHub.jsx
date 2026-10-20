import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCommunityAuth } from '../context/CommunityAuthContext.jsx';
import {
  checkCommunityModerator,
  deletePublication,
  getMyPublications,
  getMyRating,
  getPublicationReports,
  listCommunityPublications,
  reportPublication,
  saveRating,
  setPublicationPublished,
  updateReportStatus,
} from '../community/communityRepository.js';
import { COMMUNITY_CATEGORIES, rankPublications, summarizeRatings } from '../community/communityUtils.js';
import CommunityAuthForm from './CommunityAuthForm.jsx';
import CommunityPublishDialog from './CommunityPublishDialog.jsx';
import './CommunityResearchHub.css';

function PublicationCard({ publication, onOpen }) {
  const ratings = summarizeRatings(publication);
  return (
    <article className="community-card">
      <div className="community-card-meta"><span>{publication.category}</span><time dateTime={publication.published_on}>{new Date(`${publication.published_on}T00:00:00`).toLocaleDateString()}</time></div>
      <h3>{publication.title}</h3>
      <p>{publication.description}</p>
      <div className="community-card-byline"><span>By {publication.author_name || 'Community member'}</span><span>{publication.location || 'Location not specified'}</span></div>
      <div className="community-card-bottom"><span aria-label={`${ratings.average.toFixed(1)} out of 5 from ${ratings.count} ratings`}>★ {ratings.count ? `${ratings.average.toFixed(1)} · ${ratings.count} rating${ratings.count === 1 ? '' : 's'}` : 'Not yet rated'} · {publication.source_references?.length ?? 0} sources</span><button type="button" className="btn btn-ghost" onClick={() => onOpen(publication)}>Read research</button></div>
      {publication.keywords?.length > 0 && <div className="community-keywords">{publication.keywords.slice(0, 5).map((keyword) => <span key={keyword}>{keyword}</span>)}</div>}
    </article>
  );
}

export default function CommunityResearchHub() {
  const { user, loading: authLoading, signOut, configError, error: authError } = useCommunityAuth();
  const [publications, setPublications] = useState([]);
  const [myPublications, setMyPublications] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [myRating, setMyRating] = useState(0);
  const [ratingDraft, setRatingDraft] = useState(0);
  const [reportType, setReportType] = useState('misleading');
  const [reportDetails, setReportDetails] = useState('');
  const [filters, setFilters] = useState({ search: '', category: '', location: '', publishedAfter: '' });
  const [sortMode, setSortMode] = useState('relevance');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [moderator, setModerator] = useState(false);
  const [reports, setReports] = useState([]);
  const ranked = useMemo(() => {
    const items = rankPublications(publications, filters.search);
    if (sortMode === 'newest') return items.sort((left, right) => new Date(right.published_on) - new Date(left.published_on));
    if (sortMode === 'top-rated') return items.sort((left, right) => summarizeRatings(right).recommendationScore - summarizeRatings(left).recommendationScore);
    return items;
  }, [filters.search, publications, sortMode]);

  const loadData = useCallback(async () => {
    if (!user || configError) return;
    setLoading(true);
    setError('');
    try {
      const [publicRows, ownRows] = await Promise.all([
        listCommunityPublications(filters),
        getMyPublications(user.id),
      ]);
      setPublications(publicRows);
      setMyPublications(ownRows);
    } catch (loadError) {
      setError(loadError.message || 'Could not load community research.');
    } finally {
      setLoading(false);
    }
  }, [configError, filters, user]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!user || configError) return undefined;
    let active = true;
    checkCommunityModerator().then((isModerator) => {
      if (active) setModerator(isModerator);
    }).catch((moderatorError) => {
      if (active) setError(moderatorError.message || 'Could not check community moderation access.');
    });
    return () => { active = false; };
  }, [configError, user]);

  useEffect(() => {
    if (!moderator) return;
    let active = true;
    getPublicationReports().then((rows) => {
      if (active) setReports(rows);
    }).catch((reportError) => {
      if (active) setError(reportError.message || 'Could not load moderation reports.');
    });
    return () => { active = false; };
  }, [moderator]);

  useEffect(() => {
    if (!selected || !user) {
      setMyRating(0);
      setRatingDraft(0);
      return;
    }
    let active = true;
    getMyRating(selected.id, user.id).then((rating) => {
      if (!active) return;
      setMyRating(rating);
      setRatingDraft(rating);
    }).catch((ratingError) => {
      if (active) setError(ratingError.message || 'Could not load your rating.');
    });
    return () => { active = false; };
  }, [selected, user]);

  const notifyAction = async (action, successMessage) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(successMessage);
      await loadData();
    } catch (actionError) {
      setError(actionError.message || 'The action could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const submitRating = () => {
    if (!selected || !ratingDraft) return;
    notifyAction(async () => {
      await saveRating(selected.id, user.id, ratingDraft);
      setMyRating(ratingDraft);
      const refreshed = await listCommunityPublications(filters);
      setPublications(refreshed);
      setSelected(refreshed.find((item) => item.id === selected.id) ?? selected);
    }, 'Your rating has been saved.');
  };

  const submitReport = (event) => {
    event.preventDefault();
    if (!selected) return;
    notifyAction(async () => {
      await reportPublication(selected.id, user.id, reportType, reportDetails);
      setReportDetails('');
    }, 'Thank you. Your report has been sent to the moderation team.');
  };

  const handlePublicationSaved = async (publication) => {
    setEditing(null);
    setNotice(publication.is_published ? 'Publication updated.' : 'Publication unpublished.');
    await loadData();
  };

  const recent = [...publications].sort((a, b) => new Date(b.published_on) - new Date(a.published_on)).slice(0, 4);
  const topRated = [...publications].filter((item) => summarizeRatings(item).count >= 3)
    .sort((a, b) => summarizeRatings(b).recommendationScore - summarizeRatings(a).recommendationScore).slice(0, 4);
  const topRatedVisible = topRated.length ? topRated : ranked.slice(0, 4);
  const popular = [...publications].sort((a, b) =>
    summarizeRatings(b).count - summarizeRatings(a).count ||
    summarizeRatings(b).recommendationScore - summarizeRatings(a).recommendationScore,
  ).slice(0, 4);
  const related = selected ? publications.filter((item) => item.id !== selected.id && (
    item.category === selected.category ||
    (item.keywords ?? []).some((keyword) => (selected.keywords ?? []).includes(keyword))
  )).slice(0, 4) : [];

  if (authLoading) return <section className="community-hub" aria-label="Community Research Hub"><p>Loading community account…</p></section>;

  return (
    <section className="community-hub" aria-label="Community Research Hub">
      <header className="community-hub-header">
        <div><p className="research-eyebrow">Shared research library</p><h1>Community Research Hub</h1><p>Discover and evaluate research voluntarily shared by the community.</p></div>
        {user && <div className="community-account"><span>{user.user_metadata?.display_name || user.email}</span><button type="button" className="btn btn-ghost" onClick={() => signOut().catch((authError) => setError(authError.message))}>Sign out</button></div>}
      </header>

      {configError ? <div className="community-alert" role="status"><strong>Hub setup required</strong><p>{configError}</p><p>Configure Supabase and apply the migration to enable shared publishing, ratings, and reports.</p></div>
        : !user ? <CommunityAuthForm />
          : <>
            {authError && <p className="community-alert" role="alert">{authError}</p>}
            <section className="community-filter-panel" aria-label="Search and filter research">
              <label><span>Search titles, descriptions, and keywords</span><input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search community research" /></label>
              <label><span>Category</span><select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}><option value="">All categories</option>{COMMUNITY_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label><span>Location</span><input value={filters.location} onChange={(event) => setFilters((current) => ({ ...current, location: event.target.value }))} placeholder="Any location" /></label>
              <label><span>Published since</span><input type="date" value={filters.publishedAfter} onChange={(event) => setFilters((current) => ({ ...current, publishedAfter: event.target.value }))} /></label>
              <label><span>Relevance / sorting</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value)}><option value="relevance">Relevant</option><option value="newest">Newest</option><option value="top-rated">Top rated</option></select></label>
            </section>
            {error && <p className="community-alert" role="alert">{error}</p>}
            {notice && <p className="community-success" role="status">{notice}</p>}
            {loading && <p className="community-muted" role="status">Loading shared research…</p>}
            {!loading && publications.length === 0 && <section className="community-empty"><h2>No matching research yet</h2><p>Try changing your filters or publish a completed research file to get started.</p></section>}
            {ranked.length > 0 && <CommunitySection title="Recommended for you" description="Blends relevance, ratings, community activity, and freshness; low rating counts are Bayesian-weighted." items={ranked.slice(0, 4)} onOpen={setSelected} />}
            {topRatedVisible.length > 0 && <CommunitySection title="Top rated" description={topRated.length ? 'Research with at least three community ratings.' : 'New community library; early ratings are weighted conservatively.'} items={topRatedVisible} onOpen={setSelected} />}
            {recent.length > 0 && <CommunitySection title="Recently published" items={recent} onOpen={setSelected} />}
            {popular.length > 0 && <CommunitySection title="Popular research" description="Ranked by community rating activity, then quality-weighted score." items={popular} onOpen={setSelected} />}
            <section className="community-section community-my-work">
              <div className="community-section-heading"><div><h2>Your publications</h2><p>Update a linked document, unpublish it, or remove it.</p></div></div>
              {myPublications.length ? <ul>{myPublications.map((publication) => <li key={publication.id}><div><strong>{publication.title}</strong><span>{publication.is_published ? 'Published' : 'Unpublished'} · {summarizeRatings(publication).count} ratings · Updated {new Date(publication.updated_at).toLocaleDateString()}</span></div><div className="community-actions"><button type="button" className="btn btn-ghost" onClick={() => setEditing(publication)}>Update</button>{publication.is_published ? <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => notifyAction(() => setPublicationPublished(publication.id, false), 'Publication unpublished.')}>Unpublish</button> : <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => notifyAction(() => setPublicationPublished(publication.id, true), 'Publication is visible in the Hub again.')}>Republish</button>}<button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { if (window.confirm(`Permanently remove “${publication.title}” and its ratings?`)) notifyAction(() => deletePublication(publication.id), 'Publication removed.'); }}>Delete</button></div></li>)}</ul> : <p className="community-muted">You have not published any research yet. Use “Publish to Community Hub” in the Research File Builder or Saved Files.</p>}
            </section>
            {moderator && <section className="community-section community-moderation"><div className="community-section-heading"><div><h2>Moderation reports</h2><p>Reports are private to moderators and their reporter. Hide reported content while reviewing or restore it after resolution.</p></div></div>{reports.length ? reports.map((report) => <article key={report.id}><div><strong>{report.report_type} · {report.community_publications?.title || 'Removed publication'}</strong><p>{report.details}</p><small>Status: {report.status} · {new Date(report.created_at).toLocaleString()}</small></div><div className="community-actions"><select aria-label="Update report status" value={report.status} onChange={(event) => notifyAction(async () => { await updateReportStatus(report.id, event.target.value); setReports(await getPublicationReports()); }, 'Report status updated.')}><option value="pending">Pending</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select>{report.community_publications && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => notifyAction(async () => { await setPublicationPublished(report.publication_id, !report.community_publications.is_published); setReports(await getPublicationReports()); }, report.community_publications.is_published ? 'Reported publication hidden.' : 'Publication restored.')}>{report.community_publications.is_published ? 'Hide publication' : 'Restore publication'}</button>}</div></article>) : <p className="community-muted">No reports have been submitted.</p>}</section>}
          </>}

      {selected && user && <PublicationDetails publication={selected} rating={myRating} canRate={selected.author_id !== user.id} ratingDraft={ratingDraft} onRatingChange={setRatingDraft} onRate={submitRating} onReport={submitReport} reportType={reportType} setReportType={setReportType} reportDetails={reportDetails} setReportDetails={setReportDetails} busy={busy} error={error} notice={notice} related={related} onOpenRelated={setSelected} onClose={() => { setSelected(null); setNotice(''); setError(''); }} />}
      {editing && <CommunityPublishDialog file={{ id: editing.workspace_file_id, title: editing.title, topic: editing.description, sections: [], findings: [], sources: editing.source_references }} publication={editing} useSavedFileContent={false} onClose={() => setEditing(null)} onSaved={handlePublicationSaved} />}
    </section>
  );
}

function CommunitySection({ title, description, items, onOpen }) {
  return <section className="community-section"><div className="community-section-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div></div><div className="community-card-grid">{items.map((publication) => <PublicationCard key={`${title}-${publication.id}`} publication={publication} onOpen={onOpen} />)}</div></section>;
}

function PublicationDetails({ publication, rating, canRate, ratingDraft, onRatingChange, onRate, onReport, reportType, setReportType, reportDetails, setReportDetails, busy, error, notice, related, onOpenRelated, onClose }) {
  const ratings = summarizeRatings(publication);
  return (
    <div className="community-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="community-modal community-details-modal" role="dialog" aria-modal="true" aria-labelledby="community-detail-title">
        <button type="button" className="community-modal-close" aria-label="Close" onClick={onClose}>×</button>
        <div className="community-card-meta"><span>{publication.category}</span><time>{new Date(`${publication.published_on}T00:00:00`).toLocaleDateString()}</time></div>
        <h1 id="community-detail-title">{publication.title}</h1>
        <p>{publication.description}</p><p className="community-muted">By {publication.author_name} · {publication.location || 'Location not specified'} · ★ {ratings.count ? `${ratings.average.toFixed(1)} from ${ratings.count} rating(s)` : 'Not yet rated'}</p>
        {publication.keywords?.length > 0 && <div className="community-keywords">{publication.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>}
        <article className="community-full-document"><pre>{publication.document_content}</pre></article>
        <section><h2>Source references</h2>{publication.source_references?.length ? <ol>{publication.source_references.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ol> : <p className="community-muted">No source references were supplied.</p>}</section>
        {related.length > 0 && <section><h2>Related research</h2><div className="community-related">{related.map((item) => <button type="button" key={item.id} onClick={() => onOpenRelated(item)}>{item.title}<span>{item.category}</span></button>)}</div></section>}
        <section className="community-rate"><h2>Rate this research</h2>{canRate ? <><div className="community-stars" role="radiogroup" aria-label="Rate from 1 to 5 stars">{[1, 2, 3, 4, 5].map((value) => <button type="button" role="radio" aria-checked={ratingDraft === value} aria-label={`${value} star${value === 1 ? '' : 's'}`} className={value <= ratingDraft ? 'is-selected' : ''} key={value} onClick={() => onRatingChange(value)}>★</button>)}<button type="button" className="btn btn-primary" disabled={!ratingDraft || busy} onClick={onRate}>{rating ? 'Update rating' : 'Submit rating'}</button></div><p className="community-muted">Your rating is private to your account and can be changed later.</p></> : <p className="community-muted">You cannot rate your own publication.</p>}{error && <p className="community-alert" role="alert">{error}</p>}{notice && <p className="community-success" role="status">{notice}</p>}</section>
        <form className="community-report-form" onSubmit={onReport}><h2>Report a concern</h2><div className="community-form-grid"><label><span>Reason</span><select value={reportType} onChange={(event) => setReportType(event.target.value)}><option value="misleading">Misleading</option><option value="plagiarised">Plagiarised</option><option value="inappropriate">Inappropriate</option><option value="other">Other concern</option></select></label><label><span>Details</span><textarea value={reportDetails} minLength={10} maxLength={1000} required rows="3" onChange={(event) => setReportDetails(event.target.value)} /></label></div><button type="submit" className="btn btn-secondary" disabled={busy}>Send private report</button>{error && <p className="community-alert" role="alert">{error}</p>}{notice && <p className="community-success" role="status">{notice}</p>}</form>
      </section>
    </div>
  );
}
