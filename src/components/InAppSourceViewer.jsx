import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { isPdfSourceUrl } from './inAppSourceUrl.js';
import '../styles/InAppSourceViewer.css';

function getExternalHttpUrl(href) {
  try {
    const url = new URL(href, window.location.href);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (url.origin === window.location.origin) return null;
    return url;
  } catch {
    return null;
  }
}

export default function InAppSourceViewer() {
  const [source, setSource] = useState(null);
  const [pageLoaded, setPageLoaded] = useState(false);

  useEffect(() => {
    const openInApp = (event) => {
      if (event.defaultPrevented) return;
      const link = event.target instanceof Element
        ? event.target.closest('a[target="_blank"]')
        : null;
      if (!link || !document.getElementById('root')?.contains(link)) return;

      const url = getExternalHttpUrl(link.href);
      if (!url || isPdfSourceUrl(url.href)) return;

      event.preventDefault();
      event.stopPropagation();
      setPageLoaded(false);
      setSource({
        href: url.href,
        title: link.textContent.trim() || url.hostname,
      });
    };

    document.addEventListener('click', openInApp, true);
    return () => document.removeEventListener('click', openInApp, true);
  }, []);

  useEffect(() => {
    if (!source) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSource(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [source]);

  if (!source) return null;

  return createPortal(
    <div
      className="in-app-source-viewer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setSource(null);
      }}
    >
      <section
        className={`in-app-source-viewer${pageLoaded ? ' in-app-source-viewer-loaded' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="in-app-source-viewer-title"
      >
        <header className="in-app-source-viewer-header">
          <div>
            <h2 id="in-app-source-viewer-title">{source.title}</h2>
            <p>{new URL(source.href).hostname}</p>
          </div>
          <button
            type="button"
            className="in-app-source-viewer-close"
            aria-label="Close source viewer"
            autoFocus
            onClick={() => setSource(null)}
          >
            ×
          </button>
        </header>
        {!pageLoaded && (
          <p className="in-app-source-viewer-status" role="status">
            Loading original website…
          </p>
        )}
        <iframe
          key={source.href}
          className="in-app-source-viewer-frame"
          src={source.href}
          title={`Original source: ${source.title}`}
          referrerPolicy="no-referrer"
          onLoad={() => setPageLoaded(true)}
        />
        <p className="in-app-source-viewer-note">
          This is the original website. If it does not display, the publisher may block in-app embedding.
        </p>
      </section>
    </div>,
    document.body,
  );
}
