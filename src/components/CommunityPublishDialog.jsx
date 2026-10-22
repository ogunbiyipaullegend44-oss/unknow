import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCommunityAuth } from '../context/CommunityAuthContext.jsx';
import { getPublicationDocument, getPublicationForFile, savePublication, setPublicationPublished } from '../community/communityRepository.js';
import { deleteAsset, uploadPublicationDocument } from '../neon/assetsClient.js';
import { buildPublicationContent, COMMUNITY_CATEGORIES, parseSourceReferences, validatePublicationDraft } from '../community/communityUtils.js';
import CommunityAuthForm from './CommunityAuthForm.jsx';

function referencesText(references) {
  return (references ?? []).map((reference) => `${reference.title} | ${reference.url}`).join('\n');
}

export default function CommunityPublishDialog({ file, publication: publicationProp, useSavedFileContent = true, onClose, onSaved }) {
  const { user, error: authError } = useCommunityAuth();
  const [publication, setPublication] = useState(publicationProp ?? null);
  const [storedContent, setStoredContent] = useState('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [loading, setLoading] = useState(Boolean(user && file?.id && !publicationProp));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const content = useMemo(() => (
    useSavedFileContent && file
      ? buildPublicationContent(file)
      : storedContent || publication?.document_content || (file ? buildPublicationContent(file) : '')
  ), [file, publication, storedContent, useSavedFileContent]);
  const [draft, setDraft] = useState(() => ({
    title: publication?.title || file?.title || '',
    description: publication?.description || file?.topic || '',
    category: publication?.category || 'Other',
    keywords: publication?.keywords?.join(', ') || '',
    location: publication?.location || '',
    published_on: publication?.published_on || new Date().toISOString().slice(0, 10),
    references: referencesText(useSavedFileContent ? file?.sources : publication?.source_references || file?.sources),
    permissionConfirmed: false,
  }));

  useEffect(() => {
    if (!user || !file?.id || publicationProp) return;
    let active = true;
    getPublicationForFile(user.id, file.id).then((existing) => {
      if (!active || !existing) return;
      setPublication(existing);
      setDraft({
        title: existing.title,
        description: existing.description,
        category: existing.category,
        keywords: existing.keywords?.join(', ') || '',
        location: existing.location || '',
        published_on: existing.published_on || new Date().toISOString().slice(0, 10),
        references: referencesText(useSavedFileContent
          ? [...new Map([...(file?.sources ?? []), ...(existing.source_references ?? [])].map((source) => [source.url, source])).values()]
          : existing.source_references),
        permissionConfirmed: false,
      });
    }).catch((loadError) => {
      if (active) setError(loadError.message || 'Could not check the publication status.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [file?.id, publicationProp, useSavedFileContent, user]);

  useEffect(() => {
    if (!publication?.id || useSavedFileContent) return undefined;
    let active = true;
    setLoadingContent(true);
    getPublicationDocument(publication.id).then((documentContent) => {
      if (active) setStoredContent(documentContent);
    }).catch((loadError) => {
      if (active) setError(loadError.message || 'Could not load the published attachment.');
    }).finally(() => {
      if (active) setLoadingContent(false);
    });
    return () => { active = false; };
  }, [publication?.id, useSavedFileContent]);

  const update = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const references = parseSourceReferences(draft.references);
      const payload = {
        title: draft.title,
        description: draft.description,
        category: draft.category,
        keywords: draft.keywords.split(',').map((keyword) => keyword.trim()).filter(Boolean).slice(0, 30),
        location: draft.location,
        published_on: draft.published_on,
        permissionConfirmed: draft.permissionConfirmed,
        documentContent: content,
      };
      validatePublicationDraft(payload);
      const authorName = user.user_metadata?.display_name?.trim() || user.email?.split('@')[0] || 'Community member';
      const attachmentKey = await uploadPublicationDocument(content);
      let saved;
      try {
        saved = await savePublication(user.id, file.id, {
          ...payload,
          document_content: content.slice(0, 12000),
          document_object_key: attachmentKey,
          source_references: references,
          author_name: authorName,
        });
      } catch (saveError) {
        try {
          await deleteAsset(attachmentKey);
        } catch (cleanupError) {
          throw new Error(`Could not save the publication: ${saveError.message}. The uploaded attachment could not be cleaned up: ${cleanupError.message}`);
        }
        throw saveError;
      }
      if (publication?.document_object_key && publication.document_object_key !== attachmentKey) {
        try {
          await deleteAsset(publication.document_object_key);
        } catch (cleanupError) {
          setPublication(saved);
          setError(`The publication was saved, but the previous attachment could not be removed: ${cleanupError.message}`);
          return;
        }
      }
      setPublication(saved);
      setNotice('Your research is now published in the Community Hub.');
      onSaved?.(saved);
    } catch (saveError) {
      setError(saveError.message || 'The publication could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    if (!publication) return;
    setBusy(true);
    setError('');
    try {
      const updated = await setPublicationPublished(publication.id, false);
      setPublication(updated);
      setNotice('Your research is no longer visible in the public Hub. You can publish it again later.');
      onSaved?.(updated);
    } catch (updateError) {
      setError(updateError.message || 'The publication could not be unpublished.');
    } finally {
      setBusy(false);
    }
  };

  if (!user) return createPortal(<div className="community-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="community-modal" role="dialog" aria-modal="true" aria-labelledby="community-publish-title"><button type="button" className="community-modal-close" aria-label="Close" onClick={onClose}>×</button><h1 id="community-publish-title">Publish research</h1><p>Sign in before sharing your research with the community.</p><CommunityAuthForm compact /></section></div>, document.body);

  return createPortal((
    <div className="community-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="community-modal community-publish-modal" role="dialog" aria-modal="true" aria-labelledby="community-publish-title">
        <button type="button" className="community-modal-close" aria-label="Close" onClick={onClose}>×</button>
        <p className="research-eyebrow">Community Research Hub</p>
        <h1 id="community-publish-title">{publication ? 'Manage publication' : 'Publish research'}</h1>
        {authError && <p className="community-alert" role="alert">{authError}</p>}
        {loading ? <p>Checking publication status…</p> : (
          <form className="community-publish-form" onSubmit={submit}>
            <label><span>Title</span><input value={draft.title} maxLength={160} required onChange={(event) => update('title', event.target.value)} /></label>
            <label><span>Short description</span><textarea value={draft.description} rows="3" maxLength={1000} required onChange={(event) => update('description', event.target.value)} /></label>
            <div className="community-form-grid">
              <label><span>Category</span><select value={draft.category} onChange={(event) => update('category', event.target.value)}>{COMMUNITY_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
              <label><span>Location or geographic scope</span><input value={draft.location} maxLength={160} placeholder="e.g. Kenya, East Africa, global" onChange={(event) => update('location', event.target.value)} /></label>
              <label><span>Keywords (comma-separated)</span><input value={draft.keywords} maxLength={500} onChange={(event) => update('keywords', event.target.value)} /></label>
              <label><span>Publication date</span><input type="date" value={draft.published_on} required onChange={(event) => update('published_on', event.target.value)} /></label>
            </div>
            <label><span>Source references (one “title | https://…” per line)</span><textarea value={draft.references} rows="4" onChange={(event) => update('references', event.target.value)} placeholder="Report title | https://example.org/report" /></label>
            <details className="community-document-preview"><summary>Document preview ({content.length.toLocaleString()} characters)</summary>{loadingContent ? <p>Loading full attachment…</p> : <pre>{content.slice(0, 12000)}{content.length > 12000 ? '\n… Preview shortened; the full document is stored privately.' : ''}</pre>}</details>
            <label className="community-confirm"><input type="checkbox" checked={draft.permissionConfirmed} onChange={(event) => update('permissionConfirmed', event.target.checked)} /><span>I have permission to share this document and its included material publicly.</span></label>
            {error && <p className="community-alert" role="alert">{error}</p>}
            {notice && <p className="community-success" role="status">{notice}</p>}
            <div className="community-actions"><button className="btn btn-primary" type="submit" disabled={busy || loading}>{busy ? 'Saving…' : publication?.is_published ? 'Update publication' : 'Publish to Community Hub'}</button>{publication?.is_published && <button className="btn btn-secondary" type="button" disabled={busy} onClick={unpublish}>Unpublish</button>}<button className="btn btn-ghost" type="button" onClick={onClose}>Close</button></div>
            <p className="community-muted">Publishing stores this document and its references in Neon. Your local research file remains in this browser, and its full publication attachment is private to signed-in community members.</p>
          </form>
        )}
      </section>
    </div>
  ), document.body);
}
